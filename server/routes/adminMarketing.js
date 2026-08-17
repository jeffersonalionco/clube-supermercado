import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import { smtpDisponivel } from "../services/mailService.js";
import {
  listarClientesParaSelecaoMarketing,
  obterResumoMarketing,
} from "../services/marketing/destinatariosService.js";
import {
  atualizarCampanhaEmail,
  arquivarCampanha,
  buscarCampanha,
  criarCampanhaEmail,
  desarquivarCampanha,
  estimarDestinatariosCampanha,
  listarCampanhasEmail,
} from "../services/marketing/campanhaService.js";
import {
  enviarTesteCampanha,
  iniciarEnvioCampanha,
  progressoCampanha,
  retomarEnvioCampanha,
} from "../services/marketing/emailEnvioService.js";
import { montarEmailPromocional, criarTokenOptOut } from "../services/marketing/emailBuilder.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads", "marketing");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const EXT_IMAGEM = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const EXT_VIDEO = new Set([".mp4", ".webm", ".mov", ".m4v"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

function classificarArquivo(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = String(file.mimetype || "");
  if (mime.startsWith("image/") && EXT_IMAGEM.has(ext)) {
    return { tipo: "image", maxBytes: 5 * 1024 * 1024 };
  }
  if (
    (mime.startsWith("video/") || mime === "application/octet-stream") &&
    EXT_VIDEO.has(ext)
  ) {
    return { tipo: "video", maxBytes: 40 * 1024 * 1024 };
  }
  return null;
}

const upload = multer({
  storage,
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const info = classificarArquivo(file);
    if (!info) {
      return cb(
        new Error(
          "Envie imagem (JPG, PNG, WEBP, GIF) ou vídeo (MP4, WEBM, MOV) até 40 MB"
        )
      );
    }
    cb(null, true);
  },
});

router.use(requireAdmin);

router.post("/upload", (req, res) => {
  upload.fields([
    { name: "arquivo", maxCount: 1 },
    { name: "imagem", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: mensagemParaCliente(err.message) });
    }
    const file =
      req.files?.arquivo?.[0] ||
      req.files?.imagem?.[0] ||
      req.files?.video?.[0] ||
      null;
    if (!file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }
    req.file = file;
    return responderUpload(req, res);
  });
});

function responderUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }
  const info = classificarArquivo(req.file);
  if (!info) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
    return res.status(400).json({ error: "Tipo de arquivo não permitido" });
  }
  if (req.file.size > info.maxBytes) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
    const mb = Math.round(info.maxBytes / (1024 * 1024));
    return res.status(400).json({
      error:
        info.tipo === "image"
          ? `Imagem deve ter até ${mb} MB`
          : `Vídeo deve ter até ${mb} MB`,
    });
  }
  return res.status(201).json({
    url: `/uploads/marketing/${req.file.filename}`,
    tipo: info.tipo,
    nome: req.file.originalname,
    tamanho: req.file.size,
  });
}

router.get("/resumo", async (_req, res) => {
  try {
    const resumo = await obterResumoMarketing();
    return res.json({
      ...resumo,
      smtpDisponivel: smtpDisponivel(),
    });
  } catch (error) {
    console.error("[admin/marketing/resumo]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/clientes", async (req, res) => {
  try {
    const busca = String(req.query.busca || "").trim();
    const apenasElegiveis =
      String(req.query.apenasElegiveis || "").toLowerCase() === "1" ||
      String(req.query.apenasElegiveis || "").toLowerCase() === "true";
    const resultado = await listarClientesParaSelecaoMarketing({
      busca,
      apenasElegiveis,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/clientes]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/campanhas", async (req, res) => {
  try {
    const arquivadas =
      String(req.query.arquivadas || "").toLowerCase() === "1" ||
      String(req.query.arquivadas || "").toLowerCase() === "true";
    const campanhas = await listarCampanhasEmail({ arquivadas });
    return res.json({ campanhas, arquivadas });
  } catch (error) {
    console.error("[admin/marketing/campanhas GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas", async (req, res) => {
  try {
    const resultado = await criarCampanhaEmail(req.body || {}, {
      adminUsuario: req.admin?.usuario || "admin",
    });
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.status(201).json(resultado);
  } catch (error) {
    console.error("[admin/marketing/campanhas POST]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/campanhas/:id", async (req, res) => {
  try {
    const campanha = await buscarCampanha(Number(req.params.id));
    if (!campanha) {
      return res.status(404).json({ error: "Campanha não encontrada" });
    }
    const estimativa = await estimarDestinatariosCampanha(campanha);
    return res.json({
      campanha,
      destinatariosResumo: estimativa.resumo,
    });
  } catch (error) {
    console.error("[admin/marketing/campanhas/:id GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.put("/campanhas/:id", async (req, res) => {
  try {
    const resultado = await atualizarCampanhaEmail(
      Number(req.params.id),
      req.body || {}
    );
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/campanhas/:id PUT]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas/:id/preview", async (req, res) => {
  try {
    const campanha = await buscarCampanha(Number(req.params.id));
    if (!campanha) {
      return res.status(404).json({ error: "Campanha não encontrada" });
    }
    const token = criarTokenOptOut({
      cpf: null,
      email: "preview@clube.local",
      campanhaId: campanha.id,
    });
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const baseUrl =
      process.env.APP_PUBLIC_URL ||
      (host ? `${proto}://${host}` : undefined);
    const montado = montarEmailPromocional({
      assunto: campanha.assunto,
      preheader: campanha.preheader,
      corpoMd: campanha.corpoMd,
      corpoHtml: campanha.corpoHtml,
      corpoTexto: campanha.corpoTexto,
      optOutToken: token,
      modoPreview: true,
      baseUrl,
    });
    return res.json({ html: montado.html, texto: montado.texto });
  } catch (error) {
    console.error("[admin/marketing/preview]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas/:id/arquivar", async (req, res) => {
  try {
    const resultado = await arquivarCampanha(Number(req.params.id));
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/arquivar]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas/:id/desarquivar", async (req, res) => {
  try {
    const resultado = await desarquivarCampanha(Number(req.params.id));
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/desarquivar]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas/:id/teste", async (req, res) => {
  try {
    const resultado = await enviarTesteCampanha(
      Number(req.params.id),
      req.body?.email
    );
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/teste]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas/:id/enviar", async (req, res) => {
  try {
    const resultado = await iniciarEnvioCampanha(Number(req.params.id));
    if (!resultado.ok) {
      return res.status(400).json({
        error: resultado.error,
        resumo: resultado.resumo,
      });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/enviar]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/campanhas/:id/retomar", async (req, res) => {
  try {
    const resultado = await retomarEnvioCampanha(Number(req.params.id));
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/retomar]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/campanhas/:id/progresso", async (req, res) => {
  try {
    const resultado = await progressoCampanha(Number(req.params.id));
    if (!resultado.ok) {
      return res.status(404).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/marketing/progresso]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

export default router;

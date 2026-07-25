import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import {
  atualizarBrinde,
  buscarBrindePorId,
  criarBrinde,
  excluirBrinde,
  listarBrindes,
  listarTodasCategorias,
  movimentarEstoque,
  obterHistoricoEstoque,
  validarBrindeInput,
  validarMovimentoEstoque,
} from "../services/brindesService.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads", "brindes");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const extensoesPermitidas = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!/^image\//.test(file.mimetype) || !extensoesPermitidas.has(ext)) {
      return cb(new Error("Envie uma imagem JPG, PNG, WEBP ou GIF"));
    }
    cb(null, true);
  },
});

router.use(requireAdmin);

router.get("/", async (_req, res) => {
  try {
    const brindes = await listarBrindes();
    return res.json({ brindes });
  } catch (error) {
    console.error("[admin/brindes GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/categorias", async (_req, res) => {
  try {
    const categorias = await listarTodasCategorias();
    return res.json({ categorias });
  } catch (error) {
    console.error("[admin/brindes/categorias]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/upload", (req, res) => {
  upload.single("imagem")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: mensagemParaCliente(err.message) });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada" });
    }

    return res.json({
      url: `/uploads/brindes/${req.file.filename}`,
      nome: req.file.originalname,
    });
  });
});

router.post("/", async (req, res) => {
  try {
    const dados = validarBrindeInput(req.body);
    const brinde = await criarBrinde({
      ...dados,
      adminUsuario: req.admin.usuario,
    });
    return res.status(201).json({ message: "Brinde cadastrado", brinde });
  } catch (error) {
    console.error("[admin/brindes POST]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Brinde inválido" });
  }

  try {
    const existente = await buscarBrindePorId(id);
    if (!existente) {
      return res.status(404).json({ error: "Brinde não encontrado" });
    }

    const dados = validarBrindeInput(req.body);
    const brinde = await atualizarBrinde(id, dados);
    return res.json({ message: "Brinde atualizado", brinde });
  } catch (error) {
    console.error("[admin/brindes PUT]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/:id/estoque", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Brinde inválido" });
  }

  try {
    const brinde = await buscarBrindePorId(id);
    if (!brinde) {
      return res.status(404).json({ error: "Brinde não encontrado" });
    }

    const movimentos = await obterHistoricoEstoque(id);
    return res.json({ brinde: { id: brinde.id, nome: brinde.nome, estoque: brinde.estoque }, movimentos });
  } catch (error) {
    console.error("[admin/brindes/estoque GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/:id/estoque", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Brinde inválido" });
  }

  try {
    const brinde = await buscarBrindePorId(id);
    if (!brinde) {
      return res.status(404).json({ error: "Brinde não encontrado" });
    }

    const movimento = validarMovimentoEstoque(req.body);
    const resultado = await movimentarEstoque(id, {
      ...movimento,
      adminUsuario: req.admin.usuario,
    });

    const atualizado = await buscarBrindePorId(id);

    return res.json({
      message: "Estoque atualizado",
      movimento: resultado,
      brinde: atualizado,
    });
  } catch (error) {
    console.error("[admin/brindes/estoque POST]", error.message);
    const status = /insuficiente/i.test(error.message) ? 400 : 400;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Brinde inválido" });
  }

  try {
    const removido = await excluirBrinde(id);
    if (!removido) {
      return res.status(404).json({ error: "Brinde não encontrado" });
    }
    return res.json({ message: "Brinde excluído" });
  } catch (error) {
    console.error("[admin/brindes DELETE]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

export default router;

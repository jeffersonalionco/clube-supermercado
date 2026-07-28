import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import {
  atualizarNovidade,
  buscarNovidadeAdmin,
  criarNovidade,
  excluirNovidade,
  listarNovidadesAdmin,
  validarNovidadeInput,
} from "../services/novidadesService.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "..", "uploads", "novidades");

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
    const novidades = await listarNovidadesAdmin();
    return res.json({ novidades });
  } catch (error) {
    console.error("[admin/novidades GET]", error.message);
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
    return res.status(201).json({
      url: `/uploads/novidades/${req.file.filename}`,
    });
  });
});

router.post("/", async (req, res) => {
  const validado = validarNovidadeInput(req.body || {});
  if (!validado.ok) {
    return res.status(400).json({ error: validado.error });
  }

  try {
    const novidade = await criarNovidade({
      ...validado.data,
      ativo: validado.data.ativo !== false,
    });
    return res.status(201).json({ novidade, message: "Novidade criada" });
  } catch (error) {
    console.error("[admin/novidades POST]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const validado = validarNovidadeInput(req.body || {}, { parcial: true });
  if (!validado.ok) {
    return res.status(400).json({ error: validado.error });
  }

  try {
    const novidade = await atualizarNovidade(id, validado.data);
    if (!novidade) {
      return res.status(404).json({ error: "Novidade não encontrada" });
    }
    return res.json({ novidade, message: "Novidade atualizada" });
  } catch (error) {
    console.error("[admin/novidades PUT]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    const ok = await excluirNovidade(id);
    if (!ok) {
      return res.status(404).json({ error: "Novidade não encontrada" });
    }
    return res.json({ success: true, message: "Novidade excluída" });
  } catch (error) {
    console.error("[admin/novidades DELETE]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    const novidade = await buscarNovidadeAdmin(id);
    if (!novidade) {
      return res.status(404).json({ error: "Novidade não encontrada" });
    }
    return res.json({ novidade });
  } catch (error) {
    console.error("[admin/novidades GET :id]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

export default router;

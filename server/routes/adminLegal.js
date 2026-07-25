import { Router } from "express";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  atualizarConteudoLegal,
  listarConteudoLegal,
  obterConteudoLegal,
} from "../services/legalService.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";

const router = Router();

router.use(requireAdmin);

router.get("/", async (_req, res) => {
  try {
    const documentos = await listarConteudoLegal();
    return res.json({ documentos });
  } catch (error) {
    console.error("[admin/legal]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const resultado = await obterConteudoLegal(req.params.slug);

    if (!resultado.ok) {
      return res.status(404).json({ error: resultado.error });
    }

    return res.json(resultado.documento);
  } catch (error) {
    console.error("[admin/legal/:slug]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.put("/:slug", async (req, res) => {
  try {
    const { titulo, conteudo } = req.body || {};
    const resultado = await atualizarConteudoLegal(req.params.slug, {
      titulo,
      conteudo,
      adminUsuario: req.admin?.usuario,
    });

    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }

    return res.json({
      message: "Conteúdo atualizado com sucesso",
      documento: resultado.documento,
    });
  } catch (error) {
    console.error("[admin/legal PUT]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

export default router;

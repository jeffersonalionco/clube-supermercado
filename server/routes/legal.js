import { Router } from "express";
import { obterConteudoLegal } from "../services/legalService.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";

const router = Router();

router.get("/:slug", async (req, res) => {
  try {
    const resultado = await obterConteudoLegal(req.params.slug);

    if (!resultado.ok) {
      return res.status(404).json({ error: resultado.error });
    }

    return res.json(resultado.documento);
  } catch (error) {
    console.error("[legal]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

export default router;

import { Router } from "express";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import {
  registrarOptOutPorToken,
  statusOptOutToken,
} from "../services/marketing/optOutService.js";

const router = Router();

router.get("/opt-out/:token", async (req, res) => {
  try {
    const resultado = await statusOptOutToken(req.params.token);
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json({
      ok: true,
      email: resultado.email,
      message: "Confirme o cancelamento de e-mails promocionais.",
    });
  } catch (error) {
    console.error("[marketing/opt-out GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/opt-out/:token", async (req, res) => {
  try {
    const resultado = await registrarOptOutPorToken(req.params.token);
    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }
    return res.json(resultado);
  } catch (error) {
    console.error("[marketing/opt-out POST]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

export default router;

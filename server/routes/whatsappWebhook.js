import { Router } from "express";
import {
  autoReplyConfig,
  enfileirarWebhookWhatsapp,
  validarAssinaturaWebhook,
} from "../services/marketing/whatsappAutoReplyService.js";

const router = Router();

/**
 * Verificação do webhook (Meta → GET hub.mode / hub.verify_token / hub.challenge).
 */
router.get("/", (req, res) => {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const cfg = autoReplyConfig();

  if (mode === "subscribe" && cfg.verifyToken && token === cfg.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * Eventos de mensagem (Meta → POST).
 * Responde 200 imediatamente e processa em fila (anti-flood).
 */
router.post("/", (req, res) => {
  const cfg = autoReplyConfig();
  if (cfg.appSecret) {
    const sig = req.get("x-hub-signature-256");
    if (!validarAssinaturaWebhook(req.rawBody, sig)) {
      console.warn("[whatsapp/webhook] assinatura inválida");
      return res.sendStatus(401);
    }
  }

  try {
    const object = req.body?.object;
    const entries = Array.isArray(req.body?.entry) ? req.body.entry.length : 0;
    console.log("[whatsapp/webhook] POST recebido", {
      object: object || null,
      entries,
    });
    enfileirarWebhookWhatsapp(req.body || {});
  } catch (err) {
    console.error("[whatsapp/webhook]", err.message);
  }
  return res.sendStatus(200);
});

export default router;

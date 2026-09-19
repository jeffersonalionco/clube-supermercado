import { Router } from "express";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import {
  registrarOptOutPorToken,
  statusOptOutToken,
} from "../services/marketing/optOutService.js";
import {
  enviarEventoCapi,
  metaPixelPublicConfig,
  metaTrackingEnabled,
} from "../services/marketing/metaConversionsService.js";
import { metaEventLimiter } from "../middleware/rateLimit.js";
import { obterIpCliente } from "../utils/requestMeta.js";

const router = Router();

const EVENTOS_OK = new Set(["ViewContent", "AddToCart", "Purchase"]);

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

/** Config pública do Pixel (sem token). */
router.get("/meta-config", (_req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  return res.json(metaPixelPublicConfig());
});

function textoCurto(valor, max = 120) {
  const s = String(valor || "").trim();
  return s ? s.slice(0, max) : null;
}

function emailCurto(valor) {
  const s = String(valor || "").trim().toLowerCase();
  if (!s.includes("@") || s.length > 160) return null;
  return s;
}

/**
 * Espelho browser → CAPI (dedupe com event_id do Pixel).
 * Body: { eventName, eventId, items[{codigo,nome,preco,quantidade,categoria}], eventSourceUrl, fbp, fbc, orderId, email, telefone, nome, externalId }
 */
router.post("/meta-event", metaEventLimiter, async (req, res) => {
  try {
    if (!metaTrackingEnabled()) {
      return res.json({ ok: true, skipped: true, motivo: "tracking_off" });
    }
    const body = req.body || {};
    const eventName = String(body.eventName || "").trim();
    if (!EVENTOS_OK.has(eventName)) {
      return res.status(400).json({ error: "Evento inválido" });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return res.status(400).json({ error: "Informe items com codigo" });
    }

    const resultado = await enviarEventoCapi({
      eventName,
      eventId: body.eventId || null,
      items,
      actionSource: "website",
      eventSourceUrl: textoCurto(body.eventSourceUrl, 512),
      clientIp: obterIpCliente(req) || req.ip,
      userAgent: req.get("user-agent"),
      fbp: textoCurto(body.fbp, 128),
      fbc: textoCurto(body.fbc, 512),
      orderId: textoCurto(body.orderId, 100),
      email: emailCurto(body.email),
      telefone: textoCurto(body.telefone, 20),
      nome: textoCurto(body.nome, 120),
      externalId: textoCurto(body.externalId, 20),
    });

    return res.json(resultado);
  } catch (error) {
    console.error("[marketing/meta-event]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

export default router;

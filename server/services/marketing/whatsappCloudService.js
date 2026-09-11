/**
 * Meta WhatsApp Cloud API — envio de templates (vídeo/imagem + botão).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  midiaUrlAPartirDoCaminho,
  prepararVideoWhatsapp,
} from "./whatsappVideoPrepare.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_VERSION = () =>
  String(process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0").replace(/^\/*/, "");

export function whatsappCloudConfigurado() {
  return Boolean(
    String(process.env.WHATSAPP_CLOUD_TOKEN || "").trim() &&
      String(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim()
  );
}

export function obterConfigWhatsappCloud() {
  const token = String(process.env.WHATSAPP_CLOUD_TOKEN || "").trim();
  const phoneNumberId = String(
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || ""
  ).trim();
  const templatePadrao = String(
    process.env.WHATSAPP_DEFAULT_TEMPLATE || ""
  ).trim();
  const idiomaPadrao = String(
    process.env.WHATSAPP_DEFAULT_TEMPLATE_LANG || "pt_BR"
  ).trim();
  return {
    ok: Boolean(token && phoneNumberId),
    token,
    phoneNumberId,
    templatePadrao,
    idiomaPadrao,
    apiVersion: API_VERSION(),
  };
}

/** Normaliza para E.164 BR sem +: 55 + DDD + número */
export function normalizarTelefoneWa(valor) {
  let d = String(valor || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return null;
}

export function urlPublicaMidia(pathOuUrl) {
  const raw = String(pathOuUrl || "").trim();
  if (!raw) return null;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^http:\/\//i.test(raw)) {
    throw new Error(
      "A Meta exige URL HTTPS pública para o vídeo. Use APP_PUBLIC_URL com https."
    );
  }
  const base = String(process.env.APP_PUBLIC_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Configure APP_PUBLIC_URL (HTTPS público) para a Meta baixar o vídeo do template."
    );
  }
  if (!/^https:\/\//i.test(base)) {
    throw new Error(
      "APP_PUBLIC_URL precisa ser HTTPS para a WhatsApp Cloud API aceitar a mídia."
    );
  }
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function mimePorMidia(midiaTipo, arquivo) {
  const ext = String(arquivo || "")
    .toLowerCase()
    .split(".")
    .pop();
  if (midiaTipo === "image") {
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    return "image/jpeg";
  }
  if (ext === "3gp") return "video/3gpp";
  return "video/mp4";
}

/**
 * Resolve caminho local de /uploads/... no disco do servidor.
 */
export function resolverCaminhoMidiaLocal(midiaUrl) {
  const raw = String(midiaUrl || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.pathname.startsWith("/uploads/")) {
        return path.join(__dirname, "../..", u.pathname.replace(/^\//, ""));
      }
    } catch {
      return null;
    }
    return null;
  }
  if (raw.startsWith("/uploads/")) {
    return path.join(__dirname, "../..", raw.replace(/^\//, ""));
  }
  return null;
}

/**
 * Sobe arquivo para a Meta e retorna media_id (mais confiável que link no celular).
 * Vídeos são convertidos para H.264/AAC compatível com WhatsApp antes do upload.
 */
export async function uploadMidiaWhatsapp({ midiaUrl, midiaTipo = "video" }) {
  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) {
    return { ok: false, error: "WhatsApp Cloud API não configurada" };
  }

  let local = resolverCaminhoMidiaLocal(midiaUrl);
  let buffer;
  let filename;
  let mime;
  let midiaUrlFinal = midiaUrl;

  if (local && fs.existsSync(local) && String(midiaTipo).toLowerCase() === "video") {
    const prep = await prepararVideoWhatsapp(local);
    if (!prep.ok) return prep;
    local = prep.caminho;
    const rel = midiaUrlAPartirDoCaminho(local);
    if (rel) midiaUrlFinal = rel;
  }

  if (local && fs.existsSync(local)) {
    buffer = await fs.promises.readFile(local);
    filename = path.basename(local);
    mime = mimePorMidia(midiaTipo, filename);
  } else {
    let publica;
    try {
      publica = urlPublicaMidia(midiaUrl);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    try {
      const res = await fetch(publica);
      if (!res.ok) {
        return {
          ok: false,
          error: `Não foi possível baixar a mídia (${res.status})`,
        };
      }
      buffer = Buffer.from(await res.arrayBuffer());
      filename = path.basename(new URL(publica).pathname) || "midia.bin";
      mime =
        res.headers.get("content-type") || mimePorMidia(midiaTipo, filename);

      // Se veio remoto e é vídeo, grava temp e converte
      if (String(midiaTipo).toLowerCase() === "video") {
        const tmpDir = path.join(__dirname, "../../uploads/marketing");
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmp = path.join(tmpDir, `remote-${Date.now()}.mp4`);
        await fs.promises.writeFile(tmp, buffer);
        const prep = await prepararVideoWhatsapp(tmp);
        if (!prep.ok) return prep;
        buffer = await fs.promises.readFile(prep.caminho);
        filename = path.basename(prep.caminho);
        mime = "video/mp4";
        const rel = midiaUrlAPartirDoCaminho(prep.caminho);
        if (rel) midiaUrlFinal = rel;
      }
    } catch (err) {
      return {
        ok: false,
        error: err.message || "Falha ao baixar mídia para upload na Meta",
      };
    }
  }

  if (!buffer?.length) {
    return { ok: false, error: "Arquivo de mídia vazio" };
  }
  if (String(midiaTipo).toLowerCase() === "video" && buffer.length > 16 * 1024 * 1024) {
    return {
      ok: false,
      error: `Vídeo tem ${(buffer.length / (1024 * 1024)).toFixed(1)} MB (máx. 16 MB no WhatsApp)`,
    };
  }

  const form = new FormData();
  const bytes = new Uint8Array(buffer);
  const file = new File([bytes], filename, { type: mime || "video/mp4" });
  form.append("messaging_product", "whatsapp");
  // Campo `type` exigido/recomendado pela Meta — sem ele o app pode rejeitar o arquivo.
  form.append("type", mime || "video/mp4");
  form.append("file", file);

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/media`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
      body: form,
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok || !raw?.id) {
      return {
        ok: false,
        error:
          raw?.error?.message ||
          raw?.error?.error_user_msg ||
          `Falha no upload de mídia (HTTP ${res.status})`,
        raw,
      };
    }
    return {
      ok: true,
      mediaId: String(raw.id),
      mime,
      bytes: buffer.length,
      midiaUrl: midiaUrlFinal,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || "Falha de rede no upload de mídia",
    };
  }
}

/**
 * Monta components do template para o envio.
 * Prefira midiaId (upload Meta). link fica como fallback.
 */
export function montarComponentesTemplate(opts = {}) {
  const components = [];
  const midiaTipo = String(opts.midiaTipo || "").toLowerCase();
  const midiaId = opts.midiaId ? String(opts.midiaId).trim() : "";
  let midiaLink = null;
  if (!midiaId && opts.midiaUrl) {
    midiaLink = urlPublicaMidia(opts.midiaUrl);
  }

  if ((midiaId || midiaLink) && (midiaTipo === "video" || midiaTipo === "image")) {
    const key = midiaTipo === "video" ? "video" : "image";
    const mediaObj = midiaId ? { id: midiaId } : { link: midiaLink };
    components.push({
      type: "header",
      parameters: [
        {
          type: key,
          [key]: mediaObj,
        },
      ],
    });
  }

  const bodyParams = Array.isArray(opts.bodyParams)
    ? opts.bodyParams.map((t) => String(t ?? "").trim())
    : [];
  if (bodyParams.length) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text) => ({
        type: "text",
        text: text || "-",
      })),
    });
  }

  const buttonParams = Array.isArray(opts.buttonUrlParams)
    ? opts.buttonUrlParams.map((t) => String(t ?? "").trim())
    : [];
  buttonParams.forEach((text, index) => {
    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: [{ type: "text", text: text || "-" }],
    });
  });

  return components;
}

/**
 * Envia template WhatsApp Cloud API.
 * Faz upload da mídia para a Meta (media_id) quando houver arquivo/URL.
 */
export async function enviarTemplateWhatsapp({
  telefone,
  templateNome,
  templateIdioma = "pt_BR",
  midiaTipo,
  midiaUrl,
  midiaId,
  bodyParams,
  buttonUrlParams,
}) {
  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) {
    return {
      ok: false,
      error:
        "WhatsApp Cloud API não configurada (WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_NUMBER_ID)",
    };
  }

  const to = normalizarTelefoneWa(telefone);
  if (!to) {
    return { ok: false, error: "Telefone inválido para WhatsApp" };
  }

  const name = String(templateNome || cfg.templatePadrao || "").trim();
  if (!name) {
    return { ok: false, error: "Informe o nome do template aprovado na Meta" };
  }

  let mediaIdFinal = midiaId ? String(midiaId).trim() : "";
  if (!mediaIdFinal && midiaUrl && (midiaTipo === "video" || midiaTipo === "image")) {
    const up = await uploadMidiaWhatsapp({ midiaUrl, midiaTipo });
    if (!up.ok) return up;
    mediaIdFinal = up.mediaId;
  }

  let components;
  try {
    components = montarComponentesTemplate({
      midiaTipo,
      midiaUrl: mediaIdFinal ? undefined : midiaUrl,
      midiaId: mediaIdFinal || undefined,
      bodyParams,
      buttonUrlParams,
    });
  } catch (err) {
    return { ok: false, error: err.message || "Falha ao montar mídia" };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name,
      language: { code: String(templateIdioma || cfg.idiomaPadrao || "pt_BR") },
      ...(components.length ? { components } : {}),
    },
  };

  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detalhe =
        raw?.error?.message ||
        raw?.error?.error_user_msg ||
        `HTTP ${res.status}`;
      return { ok: false, error: detalhe, raw, mediaId: mediaIdFinal || null };
    }
    const messageId = raw?.messages?.[0]?.id || null;
    return { ok: true, messageId, raw, mediaId: mediaIdFinal || null };
  } catch (err) {
    return {
      ok: false,
      error: err.message || "Falha de rede ao chamar WhatsApp Cloud API",
    };
  }
}

async function graphGet(path, query = {}) {
  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) {
    return { ok: false, error: "WhatsApp Cloud API não configurada" };
  }
  const qs = new URLSearchParams(query).toString();
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${path}${
    qs ? `?${qs}` : ""
  }`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error:
          raw?.error?.message ||
          raw?.error?.error_user_msg ||
          `HTTP ${res.status}`,
        raw,
      };
    }
    return { ok: true, data: raw };
  } catch (err) {
    return { ok: false, error: err.message || "Falha de rede Meta" };
  }
}

export async function obterWabaId() {
  const envId = String(process.env.WHATSAPP_WABA_ID || "").trim();
  if (envId) return { ok: true, wabaId: envId };

  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) {
    return { ok: false, error: "WhatsApp Cloud API não configurada" };
  }

  // Tentativa 1: campo no phone number (nem sempre disponível)
  const r = await graphGet(cfg.phoneNumberId, {
    fields: "whatsapp_business_account{id,name}",
  });
  if (r.ok) {
    const wabaId = r.data?.whatsapp_business_account?.id;
    if (wabaId) {
      return {
        ok: true,
        wabaId,
        nome: r.data?.whatsapp_business_account?.name,
      };
    }
  }

  // Tentativa 2: target_ids do debug_token (escopos WhatsApp)
  const dbg = await graphGet("debug_token", {
    input_token: cfg.token,
  });
  if (dbg.ok) {
    const granular = dbg.data?.data?.granular_scopes || [];
    for (const g of granular) {
      if (!/whatsapp/i.test(String(g.scope || ""))) continue;
      const id = Array.isArray(g.target_ids) ? g.target_ids[0] : null;
      if (id) return { ok: true, wabaId: String(id) };
    }
  }

  return {
    ok: false,
    error:
      "Não foi possível obter o WABA automaticamente. Defina WHATSAPP_WABA_ID no .env (WhatsApp Manager → ID da conta).",
  };
}

function contarVariaveisTexto(texto) {
  const t = String(texto || "");
  const posicional = t.match(/\{\{\s*\d+\s*\}\}/g) || [];
  if (posicional.length) {
    const nums = posicional.map((m) => Number(m.replace(/\D/g, "")) || 0);
    return Math.max(...nums, 0);
  }
  const nomeadas = t.match(/\{\{\s*[a-zA-Z_][\w]*\s*\}\}/g) || [];
  return nomeadas.length;
}

function analisarComponentesTemplate(components = []) {
  let headerTipo = null;
  let headerExemplo = null;
  let bodyTexto = "";
  let bodyVars = 0;
  let footerTexto = "";
  const botoes = [];
  let buttonUrlVars = 0;

  for (const c of components || []) {
    const tipo = String(c.type || "").toUpperCase();
    if (tipo === "HEADER") {
      headerTipo = String(c.format || "TEXT").toUpperCase();
      headerExemplo =
        c.example?.header_handle?.[0] ||
        c.example?.header_url?.[0] ||
        null;
    } else if (tipo === "BODY") {
      bodyTexto = c.text || "";
      bodyVars = contarVariaveisTexto(bodyTexto);
      if (!bodyVars && Array.isArray(c.example?.body_text?.[0])) {
        bodyVars = c.example.body_text[0].length;
      }
    } else if (tipo === "FOOTER") {
      footerTexto = c.text || "";
    } else if (tipo === "BUTTONS") {
      for (const b of c.buttons || []) {
        const bType = String(b.type || "").toUpperCase();
        const url = b.url || "";
        const dinamico = bType === "URL" && /\{\{/.test(url);
        if (dinamico) buttonUrlVars += 1;
        botoes.push({
          tipo: bType,
          texto: b.text || "",
          url: url || null,
          dinamico,
        });
      }
    }
  }

  return {
    headerTipo,
    headerExemplo,
    bodyTexto,
    bodyVars,
    footerTexto,
    botoes,
    buttonUrlVars,
    exigeMidia: headerTipo === "VIDEO" || headerTipo === "IMAGE",
  };
}

/**
 * Lista templates aprovados da WABA (para o admin escolher e preencher params).
 */
export async function listarTemplatesWhatsapp({
  apenasAprovados = true,
  limite = 100,
} = {}) {
  const waba = await obterWabaId();
  if (!waba.ok) return waba;

  const r = await graphGet(`${waba.wabaId}/message_templates`, {
    fields: "name,status,language,category,components,quality_score",
    limit: String(Math.min(Math.max(Number(limite) || 100, 1), 200)),
  });
  if (!r.ok) return r;

  const lista = [];
  for (const t of r.data?.data || []) {
    const status = String(t.status || "").toUpperCase();
    if (apenasAprovados && status !== "APPROVED") continue;
    const analise = analisarComponentesTemplate(t.components);
    lista.push({
      id: t.id,
      nome: t.name,
      idioma: t.language,
      status,
      categoria: t.category,
      ...analise,
    });
  }

  lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  return { ok: true, wabaId: waba.wabaId, templates: lista };
}

async function postMensagem(payload) {
  const cfg = obterConfigWhatsappCloud();
  if (!cfg.ok) {
    return {
      ok: false,
      error:
        "WhatsApp Cloud API não configurada (WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_NUMBER_ID)",
    };
  }
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error:
          raw?.error?.message ||
          raw?.error?.error_user_msg ||
          `HTTP ${res.status}`,
        raw,
      };
    }
    return { ok: true, messageId: raw?.messages?.[0]?.id || null, raw };
  } catch (err) {
    return {
      ok: false,
      error: err.message || "Falha de rede ao chamar WhatsApp Cloud API",
    };
  }
}

export async function enviarMensagemTextoWhatsapp({ telefone, texto }) {
  const to = normalizarTelefoneWa(telefone);
  if (!to) return { ok: false, error: "Telefone inválido" };
  const body = String(texto || "").trim();
  if (!body) return { ok: false, error: "Texto vazio" };
  return postMensagem({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: true, body },
  });
}

/**
 * Marca a mensagem recebida como lida e exibe "digitando…" no WhatsApp.
 * Some até ~25s ou até a próxima resposta.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators/
 */
export async function enviarIndicadorDigitandoWhatsapp({ messageId }) {
  const id = String(messageId || "").trim();
  if (!id) return { ok: false, error: "message_id ausente" };
  const r = await postMensagem({
    messaging_product: "whatsapp",
    status: "read",
    message_id: id,
    typing_indicator: { type: "text" },
  });
  if (r.ok) return { ok: true };
  return r;
}

/**
 * Até 3 botões de resposta rápida (reply). Títulos max 20 caracteres.
 */
export async function enviarMensagemBotoesWhatsapp({
  telefone,
  corpo,
  botoes,
  cabecalho,
  rodape,
}) {
  const to = normalizarTelefoneWa(telefone);
  if (!to) return { ok: false, error: "Telefone inválido" };
  const bodyText = String(corpo || "").trim();
  if (!bodyText) return { ok: false, error: "Corpo vazio" };

  const lista = (botoes || [])
    .slice(0, 3)
    .map((b, i) => ({
      type: "reply",
      reply: {
        id: String(b.id || `btn_${i + 1}`).slice(0, 256),
        title: String(b.title || "").trim().slice(0, 20),
      },
    }))
    .filter((b) => b.reply.title);

  if (!lista.length) return { ok: false, error: "Informe ao menos um botão" };

  const interactive = {
    type: "button",
    body: { text: bodyText.slice(0, 1024) },
    action: { buttons: lista },
  };
  if (cabecalho) {
    interactive.header = { type: "text", text: String(cabecalho).slice(0, 60) };
  }
  if (rodape) {
    interactive.footer = { text: String(rodape).slice(0, 60) };
  }

  return postMensagem({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive,
  });
}

/**
 * Botão CTA com URL (abre link no celular). displayText máx. 20 caracteres.
 * Docs Meta: interactive.type = cta_url
 */
export async function enviarMensagemCtaUrlWhatsapp({
  telefone,
  corpo,
  url,
  displayText = "Abrir link",
  cabecalho,
  rodape,
}) {
  const to = normalizarTelefoneWa(telefone);
  if (!to) return { ok: false, error: "Telefone inválido" };
  const bodyText = String(corpo || "").trim();
  const link = String(url || "").trim();
  if (!bodyText) return { ok: false, error: "Corpo vazio" };
  if (!/^https?:\/\//i.test(link)) {
    return { ok: false, error: "URL inválida para CTA" };
  }

  const interactive = {
    type: "cta_url",
    body: { text: bodyText.slice(0, 1024) },
    action: {
      name: "cta_url",
      parameters: {
        display_text: String(displayText || "Abrir link").trim().slice(0, 20),
        url: link,
      },
    },
  };
  if (cabecalho) {
    interactive.header = { type: "text", text: String(cabecalho).slice(0, 60) };
  }
  if (rodape) {
    interactive.footer = { text: String(rodape).slice(0, 60) };
  }

  return postMensagem({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive,
  });
}

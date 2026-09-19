import { getPool } from "../../db.js";
import { emailValido } from "../../utils/validacaoCadastro.js";
import { markdownParaHtml, markdownParaTexto } from "./markdownUtil.js";
import { htmlParaTexto } from "./htmlEmailUtil.js";
import { listarDestinatariosCampanha } from "./destinatariosService.js";

const STATUS_EDITAVEIS = new Set(["rascunho", "concluida", "cancelada"]);
const STATUS_REENVIAVEIS = new Set(["rascunho", "concluida", "cancelada"]);
const PUBLICOS_EMAIL = new Set(["todos_elegiveis", "emails_especificos"]);
const PUBLICOS_WHATSAPP = new Set([
  "todos_elegiveis",
  "telefones_especificos",
  "carteira_whatsapp",
  "carteira_com_clube",
  "carteira_sem_clube",
]);

function limparEmails(lista) {
  const out = [];
  const visto = new Set();
  for (const item of lista || []) {
    const email = String(item || "")
      .trim()
      .toLowerCase();
    if (!emailValido(email) || visto.has(email)) continue;
    visto.add(email);
    out.push(email);
  }
  return out;
}

function limparTelefones(lista) {
  const out = [];
  const visto = new Set();
  for (const item of lista || []) {
    const digitos = String(item || "").replace(/\D/g, "");
    if (digitos.length < 10 || visto.has(digitos)) continue;
    visto.add(digitos);
    out.push(digitos);
  }
  return out;
}

function asStringList(valor) {
  if (Array.isArray(valor)) {
    return valor.map((v) => String(v ?? "").trim()).filter(Boolean);
  }
  if (valor == null || valor === "") return [];
  return String(valor)
    .split(/\n|,/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function mapCampanha(row) {
  if (!row) return null;
  return {
    id: row.id,
    canal: row.canal,
    assunto: row.assunto,
    preheader: row.preheader,
    corpoMd: row.corpo_md,
    corpoHtml: row.corpo_html,
    corpoTexto: row.corpo_texto,
    status: row.status,
    publico: row.publico,
    emailsEspecificos: Array.isArray(row.emails_especificos)
      ? row.emails_especificos
      : [],
    emailTeste: row.email_teste,
    templateNome: row.template_nome || "",
    templateIdioma: row.template_idioma || "pt_BR",
    midiaUrl: row.midia_url || "",
    midiaTipo: row.midia_tipo || "",
    bodyParams: Array.isArray(row.body_params) ? row.body_params : [],
    buttonUrlParams: Array.isArray(row.button_url_params)
      ? row.button_url_params
      : [],
    telefonesEspecificos: Array.isArray(row.telefones_especificos)
      ? row.telefones_especificos
      : [],
    telefoneTeste: row.telefone_teste || "",
    criadoPor: row.criado_por,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    enviadoEm: row.enviado_em,
    totalDestinatarios: row.total_destinatarios,
    totalEnviados: row.total_enviados,
    totalFalhas: row.total_falhas,
    totalPulados: row.total_pulados,
    arquivadoEm: row.arquivado_em ?? null,
  };
}

export function validarCampanhaInput(body = {}, { parcial = false } = {}) {
  const erros = [];
  const assunto = body.assunto != null ? String(body.assunto).trim() : undefined;
  const preheader =
    body.preheader != null ? String(body.preheader).trim() : undefined;
  const corpoMd = body.corpoMd != null ? String(body.corpoMd) : undefined;
  const corpoHtml = body.corpoHtml != null ? String(body.corpoHtml) : undefined;
  const corpoTexto =
    body.corpoTexto != null ? String(body.corpoTexto) : undefined;
  const publico = body.publico != null ? String(body.publico).trim() : undefined;
  const emailsEspecificos =
    body.emailsEspecificos != null
      ? limparEmails(body.emailsEspecificos)
      : undefined;

  if (!parcial || assunto !== undefined) {
    if (!assunto || assunto.length < 3) {
      erros.push("Informe um assunto com pelo menos 3 caracteres");
    } else if (assunto.length > 200) {
      erros.push("Assunto deve ter até 200 caracteres");
    }
  }

  if (preheader != null && preheader.length > 200) {
    erros.push("Pré-visualização deve ter até 200 caracteres");
  }

  if (!parcial) {
    const md = String(corpoMd || "").trim();
    const html = String(corpoHtml || "").trim();
    if (!md && !html) {
      erros.push("Informe o conteúdo do e-mail (Markdown ou HTML)");
    }
  }

  if (publico != null && !PUBLICOS_EMAIL.has(publico)) {
    erros.push("Público inválido");
  }

  if (
    (publico === "emails_especificos" ||
      (!publico && body.publico === "emails_especificos")) &&
    emailsEspecificos !== undefined &&
    emailsEspecificos.length === 0 &&
    Array.isArray(body.emailsEspecificos) &&
    body.emailsEspecificos.length > 0
  ) {
    erros.push("Nenhum e-mail específico válido informado");
  }

  if (erros.length) {
    return { ok: false, error: erros[0], erros };
  }

  return {
    ok: true,
    dados: {
      assunto,
      preheader,
      corpoMd,
      corpoHtml,
      corpoTexto,
      publico,
      emailsEspecificos,
    },
  };
}

export async function listarCampanhas({
  canal = "email",
  limite = 50,
  arquivadas = false,
} = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 100);
  const canalNorm = canal === "whatsapp" ? "whatsapp" : "email";
  const { rows } = await getPool().query(
    `SELECT *
     FROM marketing_campanha
     WHERE canal = $3
       AND (
         ($2::boolean = true AND arquivado_em IS NOT NULL)
         OR ($2::boolean = false AND arquivado_em IS NULL)
       )
     ORDER BY criado_em DESC
     LIMIT $1`,
    [lim, Boolean(arquivadas), canalNorm]
  );
  return rows.map(mapCampanha);
}

/** @deprecated use listarCampanhas({ canal: 'email' }) */
export async function listarCampanhasEmail(opts = {}) {
  return listarCampanhas({ ...opts, canal: "email" });
}

export async function buscarCampanha(id) {
  const { rows } = await getPool().query(
    `SELECT * FROM marketing_campanha WHERE id = $1`,
    [id]
  );
  return mapCampanha(rows[0]);
}

export async function arquivarCampanha(id) {
  const atual = await buscarCampanha(id);
  if (!atual) return { ok: false, error: "Campanha não encontrada" };
  if (atual.status === "enviando") {
    return {
      ok: false,
      error: "Aguarde o envio terminar para arquivar",
    };
  }
  if (atual.arquivadoEm) {
    return { ok: true, campanha: atual, message: "Campanha já estava arquivada" };
  }
  const { rows } = await getPool().query(
    `UPDATE marketing_campanha
     SET arquivado_em = NOW(), atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return {
    ok: true,
    campanha: mapCampanha(rows[0]),
    message: "Campanha arquivada",
  };
}

export async function desarquivarCampanha(id) {
  const atual = await buscarCampanha(id);
  if (!atual) return { ok: false, error: "Campanha não encontrada" };
  if (!atual.arquivadoEm) {
    return { ok: true, campanha: atual, message: "Campanha não estava arquivada" };
  }
  const { rows } = await getPool().query(
    `UPDATE marketing_campanha
     SET arquivado_em = NULL, atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [id]
  );
  return {
    ok: true,
    campanha: mapCampanha(rows[0]),
    message: "Campanha restaurada",
  };
}

export async function criarCampanhaEmail(input, { adminUsuario }) {
  const validado = validarCampanhaInput(input);
  if (!validado.ok) return validado;

  const d = validado.dados;
  const publico = d.publico || "todos_elegiveis";
  const emails =
    publico === "emails_especificos" ? d.emailsEspecificos || [] : [];

  if (publico === "emails_especificos" && !emails.length) {
    return {
      ok: false,
      error: "Informe ao menos um e-mail válido para envio específico",
    };
  }

  const corpoMd = d.corpoMd || "";
  const corpoHtml = String(d.corpoHtml || "").trim() || markdownParaHtml(corpoMd);
  const corpoTexto =
    String(d.corpoTexto || "").trim() ||
    (corpoHtml ? htmlParaTexto(corpoHtml) : "") ||
    markdownParaTexto(corpoMd);

  const { rows } = await getPool().query(
    `INSERT INTO marketing_campanha (
       canal, assunto, preheader, corpo_md, corpo_html, corpo_texto,
       status, publico, emails_especificos, criado_por
     ) VALUES (
       'email', $1, $2, $3, $4, $5,
       'rascunho', $6, $7::jsonb, $8
     )
     RETURNING *`,
    [
      d.assunto,
      d.preheader || "",
      corpoMd,
      corpoHtml,
      corpoTexto,
      publico,
      JSON.stringify(emails),
      adminUsuario || "admin",
    ]
  );

  return { ok: true, campanha: mapCampanha(rows[0]) };
}

export async function atualizarCampanhaEmail(id, input) {
  const atual = await buscarCampanha(id);
  if (!atual) return { ok: false, error: "Campanha não encontrada" };
  if (!STATUS_EDITAVEIS.has(atual.status)) {
    return {
      ok: false,
      error:
        atual.status === "enviando"
          ? "Aguarde o envio terminar para editar"
          : "Esta campanha não pode ser editada",
    };
  }

  const validado = validarCampanhaInput(
    {
      assunto: input.assunto ?? atual.assunto,
      preheader: input.preheader ?? atual.preheader,
      corpoMd: input.corpoMd ?? atual.corpoMd,
      corpoHtml: input.corpoHtml ?? atual.corpoHtml,
      corpoTexto: input.corpoTexto ?? atual.corpoTexto,
      publico: input.publico ?? atual.publico,
      emailsEspecificos:
        input.emailsEspecificos ?? atual.emailsEspecificos,
    },
    { parcial: false }
  );
  if (!validado.ok) return validado;

  const d = validado.dados;
  const publico = d.publico || atual.publico;
  const emails =
    publico === "emails_especificos" ? d.emailsEspecificos || [] : [];

  if (publico === "emails_especificos" && !emails.length) {
    return {
      ok: false,
      error: "Informe ao menos um e-mail válido para envio específico",
    };
  }

  const corpoMd = d.corpoMd || "";
  const corpoHtml = String(d.corpoHtml || "").trim() || markdownParaHtml(corpoMd);
  const corpoTexto =
    String(d.corpoTexto || "").trim() ||
    (corpoHtml ? htmlParaTexto(corpoHtml) : "") ||
    markdownParaTexto(corpoMd);

  const { rows } = await getPool().query(
    `UPDATE marketing_campanha
     SET assunto = $2,
         preheader = $3,
         corpo_md = $4,
         corpo_html = $5,
         corpo_texto = $6,
         publico = $7,
         emails_especificos = $8::jsonb,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      d.assunto,
      d.preheader || "",
      corpoMd,
      corpoHtml,
      corpoTexto,
      publico,
      JSON.stringify(emails),
    ]
  );

  return { ok: true, campanha: mapCampanha(rows[0]) };
}

export async function estimarDestinatariosCampanha(campanha) {
  if (campanha?.canal === "whatsapp") {
    const { listarDestinatariosWhatsapp } = await import(
      "./destinatariosService.js"
    );
    return listarDestinatariosWhatsapp({
      publico: campanha.publico,
      telefonesEspecificos: campanha.telefonesEspecificos,
    });
  }
  return listarDestinatariosCampanha({
    publico: campanha.publico,
    emailsEspecificos: campanha.emailsEspecificos,
  });
}

export function validarCampanhaWhatsappInput(body = {}) {
  const erros = [];
  const assunto = body.assunto != null ? String(body.assunto).trim() : "";
  const templateNome =
    body.templateNome != null ? String(body.templateNome).trim() : "";
  const templateIdioma =
    body.templateIdioma != null
      ? String(body.templateIdioma).trim()
      : "pt_BR";
  const midiaUrl = body.midiaUrl != null ? String(body.midiaUrl).trim() : "";
  const midiaTipo = body.midiaTipo != null ? String(body.midiaTipo).trim() : "";
  const publico =
    body.publico != null ? String(body.publico).trim() : "todos_elegiveis";
  const bodyParams = asStringList(body.bodyParams);
  const buttonUrlParams = asStringList(body.buttonUrlParams);
  const telefonesEspecificos = limparTelefones(body.telefonesEspecificos);

  if (!assunto || assunto.length < 3) {
    erros.push("Informe um nome interno da campanha (mín. 3 caracteres)");
  } else if (assunto.length > 200) {
    erros.push("Nome da campanha deve ter até 200 caracteres");
  }

  if (!templateNome) {
    erros.push("Informe o nome do template aprovado na Meta");
  }

  if (midiaUrl && midiaTipo !== "video" && midiaTipo !== "image") {
    erros.push("Informe o tipo da mídia (video ou image)");
  }

  if (!PUBLICOS_WHATSAPP.has(publico)) {
    erros.push("Público inválido para WhatsApp");
  }

  if (publico === "telefones_especificos" && !telefonesEspecificos.length) {
    erros.push("Informe ao menos um telefone para envio específico");
  }

  if (erros.length) {
    return { ok: false, error: erros[0], erros };
  }

  return {
    ok: true,
    dados: {
      assunto,
      templateNome,
      templateIdioma: templateIdioma || "pt_BR",
      midiaUrl,
      midiaTipo: midiaUrl ? midiaTipo : "",
      bodyParams,
      buttonUrlParams,
      publico,
      telefonesEspecificos,
    },
  };
}

export async function criarCampanhaWhatsapp(input, { adminUsuario }) {
  const validado = validarCampanhaWhatsappInput(input);
  if (!validado.ok) return validado;
  const d = validado.dados;

  const { rows } = await getPool().query(
    `INSERT INTO marketing_campanha (
       canal, assunto, preheader, corpo_md, corpo_html, corpo_texto,
       status, publico, emails_especificos, criado_por,
       template_nome, template_idioma, midia_url, midia_tipo,
       body_params, button_url_params, telefones_especificos
     ) VALUES (
       'whatsapp', $1, '', '', '', '',
       'rascunho', $2, '[]'::jsonb, $3,
       $4, $5, $6, $7,
       $8::jsonb, $9::jsonb, $10::jsonb
     )
     RETURNING *`,
    [
      d.assunto,
      d.publico,
      adminUsuario || "admin",
      d.templateNome,
      d.templateIdioma,
      d.midiaUrl,
      d.midiaTipo,
      JSON.stringify(d.bodyParams),
      JSON.stringify(d.buttonUrlParams),
      JSON.stringify(d.telefonesEspecificos),
    ]
  );

  return { ok: true, campanha: mapCampanha(rows[0]) };
}

export async function atualizarCampanhaWhatsapp(id, input) {
  const atual = await buscarCampanha(id);
  if (!atual) return { ok: false, error: "Campanha não encontrada" };
  if (atual.canal !== "whatsapp") {
    return { ok: false, error: "Campanha não é de WhatsApp" };
  }
  if (!STATUS_EDITAVEIS.has(atual.status)) {
    return {
      ok: false,
      error:
        atual.status === "enviando"
          ? "Aguarde o envio terminar para editar"
          : "Esta campanha não pode ser editada",
    };
  }

  const validado = validarCampanhaWhatsappInput({
    assunto: input.assunto ?? atual.assunto,
    templateNome: input.templateNome ?? atual.templateNome,
    templateIdioma: input.templateIdioma ?? atual.templateIdioma,
    midiaUrl: input.midiaUrl ?? atual.midiaUrl,
    midiaTipo: input.midiaTipo ?? atual.midiaTipo,
    bodyParams: input.bodyParams ?? atual.bodyParams,
    buttonUrlParams: input.buttonUrlParams ?? atual.buttonUrlParams,
    publico: input.publico ?? atual.publico,
    telefonesEspecificos:
      input.telefonesEspecificos ?? atual.telefonesEspecificos,
  });
  if (!validado.ok) return validado;
  const d = validado.dados;

  const { rows } = await getPool().query(
    `UPDATE marketing_campanha
     SET assunto = $2,
         publico = $3,
         template_nome = $4,
         template_idioma = $5,
         midia_url = $6,
         midia_tipo = $7,
         body_params = $8::jsonb,
         button_url_params = $9::jsonb,
         telefones_especificos = $10::jsonb,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      d.assunto,
      d.publico,
      d.templateNome,
      d.templateIdioma,
      d.midiaUrl,
      d.midiaTipo,
      JSON.stringify(d.bodyParams),
      JSON.stringify(d.buttonUrlParams),
      JSON.stringify(d.telefonesEspecificos),
    ]
  );

  return { ok: true, campanha: mapCampanha(rows[0]) };
}

export { STATUS_EDITAVEIS, STATUS_REENVIAVEIS };

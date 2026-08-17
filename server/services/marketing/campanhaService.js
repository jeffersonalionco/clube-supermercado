import { getPool } from "../../db.js";
import { emailValido } from "../../utils/validacaoCadastro.js";
import { markdownParaHtml, markdownParaTexto } from "./markdownUtil.js";
import { htmlParaTexto } from "./htmlEmailUtil.js";
import { listarDestinatariosCampanha } from "./destinatariosService.js";

const STATUS_EDITAVEIS = new Set(["rascunho", "concluida", "cancelada"]);
const STATUS_REENVIAVEIS = new Set(["rascunho", "concluida", "cancelada"]);
const PUBLICOS = new Set(["todos_elegiveis", "emails_especificos"]);

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

  if (publico != null && !PUBLICOS.has(publico)) {
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

export async function listarCampanhasEmail({
  limite = 50,
  arquivadas = false,
} = {}) {
  const lim = Math.min(Math.max(Number(limite) || 50, 1), 100);
  const { rows } = await getPool().query(
    `SELECT *
     FROM marketing_campanha
     WHERE canal = 'email'
       AND (
         ($2::boolean = true AND arquivado_em IS NOT NULL)
         OR ($2::boolean = false AND arquivado_em IS NULL)
       )
     ORDER BY criado_em DESC
     LIMIT $1`,
    [lim, Boolean(arquivadas)]
  );
  return rows.map(mapCampanha);
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
  return listarDestinatariosCampanha({
    publico: campanha.publico,
    emailsEspecificos: campanha.emailsEspecificos,
  });
}

export { STATUS_EDITAVEIS, STATUS_REENVIAVEIS };

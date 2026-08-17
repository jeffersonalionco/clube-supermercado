import jwt from "jsonwebtoken";
import { getSessionSecret } from "../../config/security.js";
import { appPublicUrl } from "../mailService.js";
import { markdownParaHtml, markdownParaTexto } from "./markdownUtil.js";
import {
  enriquecerPreviewMidia,
  prepararCorpoHtmlEmail,
} from "./htmlEmailUtil.js";

const OPT_OUT_TTL = "30d";

export function criarTokenOptOut({ cpf, email, campanhaId }) {
  return jwt.sign(
    {
      purpose: "email_promocional_opt_out",
      cpf: cpf || null,
      email: String(email || "").trim().toLowerCase(),
      campanhaId: campanhaId || null,
    },
    getSessionSecret(),
    { expiresIn: OPT_OUT_TTL }
  );
}

export function verificarTokenOptOut(token) {
  try {
    const payload = jwt.verify(String(token || ""), getSessionSecret());
    if (payload?.purpose !== "email_promocional_opt_out") {
      return { ok: false, error: "Link inválido" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Link inválido ou expirado" };
  }
}

export function urlOptOut(token) {
  return `${appPublicUrl()}/#/descadastrar-email?token=${encodeURIComponent(token)}`;
}

function montarRodapeHtml({ regulamentoUrl, privacidadeUrl, optOutUrl, siteUrl }) {
  return `
    <hr style="border:none;border-top:1px solid #d7e0ea;margin:28px 0 16px;" />
    <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#5b6b7c;">
      <strong>Clube Superama+</strong><br/>
      Kimp Comércio de Alimentos Ltda. · CNPJ 00.289.167/0001-14<br/>
      Vera Cruz do Oeste / PR
    </p>
    <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#5b6b7c;">
      <a href="${siteUrl}" style="color:#1b4fa0;">Site do clube</a>
      &nbsp;·&nbsp;
      <a href="${regulamentoUrl}" style="color:#1b4fa0;">Regulamento</a>
      &nbsp;·&nbsp;
      <a href="${privacidadeUrl}" style="color:#1b4fa0;">Privacidade</a>
    </p>
    <p style="margin:0;font-size:12px;line-height:1.5;color:#5b6b7c;">
      Não deseja mais receber e-mails promocionais?
      <a href="${optOutUrl}" style="color:#e31c23;font-weight:700;">Cancelar propaganda</a>.<br/>
      E-mails de conta e recuperação de senha não são afetados.
    </p>
  `;
}

function montarRodapeTexto({ regulamentoUrl, privacidadeUrl, optOutUrl, siteUrl }) {
  return `

---
Clube Superama+
Kimp Comércio de Alimentos Ltda. · CNPJ 00.289.167/0001-14
Vera Cruz do Oeste / PR

Site: ${siteUrl}
Regulamento: ${regulamentoUrl}
Privacidade: ${privacidadeUrl}

Não deseja mais receber e-mails promocionais?
Cancelar propaganda: ${optOutUrl}
(E-mails de conta e recuperação de senha não são afetados.)
`;
}

/**
 * Monta HTML/texto final da campanha com layout Superama+ e rodapé fixo.
 * @param {{ modoPreview?: boolean, baseUrl?: string }} opts
 */
export function montarEmailPromocional({
  assunto,
  preheader,
  corpoMd,
  corpoHtml,
  corpoTexto,
  optOutToken,
  modoPreview = false,
  modoTeste = false,
  baseUrl,
}) {
  const siteUrl = String(baseUrl || appPublicUrl()).replace(/\/$/, "");
  const regulamentoUrl = `${siteUrl}/#/regulamento`;
  const privacidadeUrl = `${siteUrl}/#/privacidade`;
  const optOutUrl = `${siteUrl}/#/descadastrar-email?token=${encodeURIComponent(optOutToken)}`;

  let corpo = prepararCorpoHtmlEmail(
    String(corpoHtml || "").trim() || markdownParaHtml(corpoMd) || "<p></p>",
    siteUrl
  );

  if (modoPreview) {
    corpo = enriquecerPreviewMidia(corpo, siteUrl);
  }

  const textoBase =
    String(corpoTexto || "").trim() ||
    markdownParaTexto(corpoMd) ||
    String(assunto || "");

  const pre =
    String(preheader || "").trim() ||
    "Novidades e ofertas do Clube Superama+";

  const logoUrl = `${siteUrl}/logo.png`;
  const tituloDoc = String(assunto || "Clube Superama+").replace(/</g, "");

  const faixaTeste = modoTeste
    ? `<tr>
            <td style="background:#fef3c7;padding:10px 16px;text-align:center;border-bottom:1px solid #f59e0b;">
              <div style="font-size:13px;font-weight:800;color:#92400e;letter-spacing:0.02em;">E-MAIL DE TESTE</div>
              <div style="font-size:12px;color:#a16207;margin-top:2px;">Só você recebe esta marca — o envio real para clientes não leva [TESTE].</div>
            </td>
          </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${tituloDoc}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#12263a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${pre.replace(/</g, "")}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d7e0ea;">
          ${faixaTeste}
          <tr>
            <td align="center" style="background:#ffffff;padding:20px 24px 16px;border-bottom:3px solid #1b4fa0;">
              <a href="${siteUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
                <img src="${logoUrl}" alt="Clube Superama+" width="168" style="display:block;max-width:168px;width:168px;height:auto;border:0;margin:0 auto;" />
              </a>
              <div style="font-size:12px;line-height:1.4;color:#5b6b7c;margin-top:10px;">Ofertas e novidades para você</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:15px;line-height:1.55;color:#12263a;">
              ${corpo}
              ${montarRodapeHtml({ regulamentoUrl, privacidadeUrl, optOutUrl, siteUrl })}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const texto =
    textoBase +
    montarRodapeTexto({ regulamentoUrl, privacidadeUrl, optOutUrl, siteUrl });

  return {
    html,
    texto,
    listUnsubscribe: `<${optOutUrl}>`,
  };
}

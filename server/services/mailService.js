import nodemailer from "nodemailer";

let transporter;
let transporterMarketing;

function smtpConfigurado() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function brevoSenha() {
  return (
    process.env.BREVO_SMTP_PASS ||
    process.env["CHAVE_SMTP-BREVO"] ||
    process.env.CHAVE_BREVO ||
    ""
  );
}

function brevoConfigurado() {
  return Boolean(process.env.BREVO_SMTP_USER && brevoSenha());
}

function getTransporter() {
  if (!smtpConfigurado()) {
    throw new Error("Envio de e-mail não configurado (SMTP_USER / SMTP_PASS)");
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 25_000,
    });
  }

  return transporter;
}

function getTransporterMarketing() {
  if (!brevoConfigurado()) return null;

  if (!transporterMarketing) {
    transporterMarketing = nodemailer.createTransport({
      host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
      port: Number(process.env.BREVO_SMTP_PORT || 587),
      secure: String(process.env.BREVO_SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.BREVO_SMTP_USER,
        pass: brevoSenha(),
      },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 25_000,
    });
  }

  return transporterMarketing;
}

export function emailMascarado(email) {
  const valor = String(email || "").trim().toLowerCase();
  const at = valor.indexOf("@");
  if (at < 1) return null;

  const local = valor.slice(0, at);
  const dominio = valor.slice(at + 1);
  const inicio = local.slice(0, Math.min(2, local.length));
  return `${inicio}***@${dominio}`;
}

export async function enviarEmail({ para, assunto, texto, html, headers }) {
  const from =
    process.env.SMTP_FROM ||
    `"Clube Superama+" <${process.env.SMTP_USER}>`;

  const info = await getTransporter().sendMail({
    from,
    to: para,
    subject: assunto,
    text: texto,
    html,
    headers: headers || undefined,
  });

  return info;
}

/** Campanhas usam a Brevo quando ela está configurada. Sem isso, seguem pelo Gmail. */
export async function enviarEmailMarketing({ para, assunto, texto, html, headers }) {
  const viaBrevo = brevoConfigurado();
  const transport = viaBrevo ? getTransporterMarketing() : getTransporter();
  const from = viaBrevo
    ? process.env.BREVO_SMTP_FROM ||
      `"Clube Superama+" <marketing@mercadosuperama.com.br>`
    : process.env.SMTP_FROM || `"Clube Superama+" <${process.env.SMTP_USER}>`;

  return transport.sendMail({
    from,
    to: para,
    subject: assunto,
    text: texto,
    html,
    headers: headers || undefined,
  });
}

export function appPublicUrl() {
  return String(
    process.env.APP_PUBLIC_URL || "https://clube.mercadosuperama.com.br"
  ).replace(/\/$/, "");
}

export function smtpDisponivel() {
  return smtpConfigurado();
}

export function smtpMarketingDisponivel() {
  return brevoConfigurado() || smtpConfigurado();
}

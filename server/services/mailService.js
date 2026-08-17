import nodemailer from "nodemailer";

let transporter;

function smtpConfigurado() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
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

export function appPublicUrl() {
  return String(
    process.env.APP_PUBLIC_URL || "https://clube.mercadosuperama.com.br"
  ).replace(/\/$/, "");
}

export function smtpDisponivel() {
  return smtpConfigurado();
}

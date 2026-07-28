import crypto from "crypto";
import { getPool } from "../db.js";
import { normalizarCpfCnpj } from "./apiClient.js";
import { buscarClientePorCpfCnpj } from "./apiClient.js";
import { buscarUsuarioPorCpf, alterarSenhaUsuario } from "./usuarioService.js";
import {
  appPublicUrl,
  emailMascarado,
  enviarEmail,
  smtpDisponivel,
} from "./mailService.js";

const TTL_MINUTOS = Number(process.env.RECUPERAR_SENHA_TTL_MIN || 30);
const MAX_TENTATIVAS = Number(process.env.RECUPERAR_SENHA_MAX_TENTATIVAS || 5);
const COOLDOWN_SEGUNDOS = Number(process.env.RECUPERAR_SENHA_COOLDOWN_SEG || 90);
const MAX_POR_HORA_CPF = Number(process.env.RECUPERAR_SENHA_MAX_HORA || 3);

const MSG_GENERICA =
  "Se existir uma conta com esse CPF e um e-mail cadastrado, enviamos as instruções. Verifique a caixa de entrada e o spam. Você também pode redefinir a senha na loja com um atendente.";

function hashSegredo(valor) {
  return crypto.createHash("sha256").update(String(valor), "utf8").digest("hex");
}

function gerarToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function gerarCodigo() {
  return String(crypto.randomInt(100000, 1000000));
}

function extrairEmailCliente(cliente, dadosApi) {
  const fontes = [cliente, dadosApi, dadosApi?.cliente, dadosApi?.data].filter(Boolean);
  for (const fonte of fontes) {
    if (typeof fonte !== "object") continue;
    const email = fonte.email ?? fonte.eMail ?? fonte.mail;
    if (email && String(email).includes("@")) {
      return String(email).trim().toLowerCase();
    }
  }
  return null;
}

async function resolverEmailUsuario(usuario) {
  if (usuario?.dados_api) {
    const doCache = extrairEmailCliente(null, usuario.dados_api);
    if (doCache) return doCache;
  }

  try {
    const consulta = await buscarClientePorCpfCnpj(usuario.cpf);
    if (consulta.ok) {
      return extrairEmailCliente(consulta.cliente, consulta.raw);
    }
  } catch (error) {
    console.error("[senha-recuperacao] falha ao consultar e-mail ERP:", error.message);
  }

  return null;
}

function dadosEmpresaEmail() {
  const base = appPublicUrl();
  return {
    nomeClube: process.env.LOJA_NOME_FANTASIA || "Clube Superama+",
    razaoSocial:
      process.env.LOJA_RAZAO_SOCIAL || "Kimp Comércio de Alimentos Ltda.",
    cnpj: process.env.LOJA_CNPJ || "00.289.167/0001-14",
    cidade: process.env.LOJA_CIDADE || "Vera Cruz do Oeste",
    uf: process.env.LOJA_UF || "PR",
    telefone: process.env.LOJA_TELEFONE || "",
    endereco: process.env.LOJA_ENDERECO || "",
    siteClube: base,
    siteMercado:
      process.env.MERCADO_PUBLIC_URL || "https://mercadosuperama.com.br",
    logoUrl: process.env.EMAIL_LOGO_URL || `${base}/logo.png`,
    privacidadeUrl: `${base}/#/privacidade`,
  };
}

function escaparHtml(valor) {
  return String(valor || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkRecuperacao(token) {
  return `${appPublicUrl()}/#/redefinir-senha?t=${encodeURIComponent(token)}`;
}

function montarEmailRecuperacao({ nome, codigo, token, mascara }) {
  const link = linkRecuperacao(token);
  const emp = dadosEmpresaEmail();
  const saudacao = nome ? `Olá, ${escaparHtml(nome)}` : "Olá";
  const localidade = [emp.cidade, emp.uf].filter(Boolean).join(" / ");
  const enderecoLinha = [emp.endereco, localidade].filter(Boolean).join(" — ");

  const texto = [
    `${nome ? `Olá, ${nome}` : "Olá"},`,
    "",
    `Recebemos um pedido para redefinir a senha do ${emp.nomeClube}.`,
    "",
    `Código de verificação: ${codigo}`,
    `Link (válido por ${TTL_MINUTOS} minutos): ${link}`,
    "",
    "Se você não solicitou esta redefinição, ignore este e-mail.",
    "Nenhuma alteração será feita na sua conta e sua senha permanece a mesma.",
    "Na dúvida, fale com um atendente na loja.",
    "",
    `Acesse o clube: ${emp.siteClube}`,
    `Site do supermercado: ${emp.siteMercado}`,
    `Política de Privacidade: ${emp.privacidadeUrl}`,
    "",
    emp.razaoSocial,
    `CNPJ: ${emp.cnpj}`,
    enderecoLinha,
    emp.telefone ? `Telefone: ${emp.telefone}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redefinição de senha</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#142033;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dce4ee;">
          <tr>
            <td style="background:linear-gradient(135deg,#1b4fa0 0%,#163d7a 100%);padding:28px 24px;text-align:center;">
              <a href="${escaparHtml(emp.siteClube)}" style="text-decoration:none;">
                <img src="${escaparHtml(emp.logoUrl)}" alt="${escaparHtml(emp.nomeClube)}" width="168" style="display:inline-block;max-width:168px;height:auto;border:0;" />
              </a>
              <p style="margin:14px 0 0;font-size:13px;letter-spacing:0.04em;color:rgba(255,255,255,0.88);">
                Do Supermercado Superama
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">${saudacao},</p>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3a4656;">
                Recebemos um pedido para redefinir a senha da sua conta no
                <strong>${escaparHtml(emp.nomeClube)}</strong>.
              </p>
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#5c6b7a;text-transform:uppercase;letter-spacing:0.06em;">
                Código de verificação
              </p>
              <p style="margin:0 0 22px;font-size:32px;letter-spacing:0.28em;font-weight:700;color:#1b4fa0;text-align:center;background:#f3f7fc;border:1px dashed #b8c9e0;border-radius:12px;padding:16px 12px;">
                ${escaparHtml(codigo)}
              </p>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a4656;">
                Ou use o botão abaixo. O link e o código valem por
                <strong>${TTL_MINUTOS} minutos</strong>.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
                <tr>
                  <td style="border-radius:10px;background:#1b4fa0;">
                    <a href="${escaparHtml(link)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
                      Redefinir minha senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#7a8794;word-break:break-all;">
                Se o botão não funcionar, copie e cole este link no navegador:<br />
                <a href="${escaparHtml(link)}" style="color:#1b4fa0;">${escaparHtml(link)}</a>
              </p>
              <div style="margin:0 0 18px;padding:14px 16px;background:#fff8f0;border-left:4px solid #e31c23;border-radius:0 10px 10px 0;">
                <p style="margin:0;font-size:13px;line-height:1.55;color:#5a3a32;">
                  <strong>Não solicitou esta alteração?</strong>
                  Ignore este e-mail. Nenhuma mudança será feita na sua conta e sua senha
                  permanece a mesma. Na dúvida, fale com um atendente na loja.
                </p>
              </div>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#5c6b7a;">
                Destinatário: ${escaparHtml(mascara || "e-mail cadastrado")}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fc;border-radius:12px;">
                <tr>
                  <td style="padding:16px;text-align:center;">
                    <p style="margin:0 0 10px;font-size:13px;color:#3a4656;">
                      <a href="${escaparHtml(emp.siteClube)}" style="color:#1b4fa0;font-weight:700;text-decoration:none;">Acessar o Clube Superama+</a>
                      &nbsp;·&nbsp;
                      <a href="${escaparHtml(emp.siteMercado)}" style="color:#1b4fa0;font-weight:700;text-decoration:none;">Site do Superama</a>
                    </p>
                    <p style="margin:0 0 10px;font-size:12px;">
                      <a href="${escaparHtml(emp.privacidadeUrl)}" style="color:#5c6b7a;">Política de Privacidade</a>
                    </p>
                    <p style="margin:0;font-size:11px;line-height:1.55;color:#8a96a3;">
                      ${escaparHtml(emp.razaoSocial)}<br />
                      CNPJ ${escaparHtml(emp.cnpj)}
                      ${enderecoLinha ? `<br />${escaparHtml(enderecoLinha)}` : ""}
                      ${emp.telefone ? `<br />${escaparHtml(emp.telefone)}` : ""}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#8a96a3;max-width:560px;">
          Este e-mail foi enviado automaticamente pelo ${escaparHtml(emp.nomeClube)}. Não responda esta mensagem.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { texto, html, assunto: `Redefinição de senha — ${emp.nomeClube}` };
}

async function atrasoPadrao() {
  const ms = 350 + crypto.randomInt(0, 450);
  await new Promise((r) => setTimeout(r, ms));
}

export function mensagemRecuperacaoGenerica() {
  return MSG_GENERICA;
}

/**
 * Solicita recuperação. Sempre retorna a mesma mensagem (anti-enumeração).
 */
export async function solicitarRecuperacaoSenha({ cpf, ip }) {
  await atrasoPadrao();

  const cpfNorm = normalizarCpfCnpj(cpf);
  const resposta = { success: true, message: MSG_GENERICA };

  if (!cpfNorm || cpfNorm.length !== 11) {
    return resposta;
  }

  if (!smtpDisponivel()) {
    console.warn("[senha-recuperacao] SMTP não configurado — pedido ignorado silenciosamente");
    return resposta;
  }

  const usuario = await buscarUsuarioPorCpf(cpfNorm);
  if (!usuario) {
    return resposta;
  }

  const pool = getPool();

  const { rows: recentes } = await pool.query(
    `SELECT id, criado_em
     FROM senha_recuperacao
     WHERE cpf = $1 AND criado_em > NOW() - INTERVAL '1 hour'
     ORDER BY criado_em DESC
     LIMIT $2`,
    [cpfNorm, MAX_POR_HORA_CPF + 1]
  );

  if (recentes.length >= MAX_POR_HORA_CPF) {
    return resposta;
  }

  if (recentes[0]) {
    const decorrido = (Date.now() - new Date(recentes[0].criado_em).getTime()) / 1000;
    if (decorrido < COOLDOWN_SEGUNDOS) {
      return resposta;
    }
  }

  const email = await resolverEmailUsuario(usuario);
  if (!email) {
    console.warn(`[senha-recuperacao] CPF ${cpfNorm} sem e-mail cadastrado`);
    return resposta;
  }

  const token = gerarToken();
  const codigo = gerarCodigo();
  const tokenHash = hashSegredo(token);
  const codigoHash = hashSegredo(`${cpfNorm}:${codigo}`);
  const mascara = emailMascarado(email);

  await pool.query(
    `UPDATE senha_recuperacao
     SET usado_em = COALESCE(usado_em, NOW())
     WHERE cpf = $1 AND usado_em IS NULL AND expira_em > NOW()`,
    [cpfNorm]
  );

  await pool.query(
    `INSERT INTO senha_recuperacao (cpf, token_hash, codigo_hash, email_destino, expira_em, ip)
     VALUES ($1, $2, $3, $4, NOW() + ($5::int * INTERVAL '1 minute'), $6)`,
    [cpfNorm, tokenHash, codigoHash, mascara, TTL_MINUTOS, ip || null]
  );

  const { texto, html, assunto } = montarEmailRecuperacao({
    nome: usuario.nome,
    codigo,
    token,
    mascara,
  });

  try {
    await enviarEmail({ para: email, assunto, texto, html });
  } catch (error) {
    console.error("[senha-recuperacao] falha ao enviar e-mail:", error.message);
  }

  return resposta;
}

async function carregarPedidoAtivoPorToken(token) {
  const tokenHash = hashSegredo(token);
  const { rows } = await getPool().query(
    `SELECT * FROM senha_recuperacao
     WHERE token_hash = $1
       AND usado_em IS NULL
       AND expira_em > NOW()
     LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function carregarPedidosAtivosPorCpf(cpf) {
  const { rows } = await getPool().query(
    `SELECT * FROM senha_recuperacao
     WHERE cpf = $1
       AND usado_em IS NULL
       AND expira_em > NOW()
     ORDER BY criado_em DESC
     LIMIT 5`,
    [cpf]
  );
  return rows;
}

async function registrarTentativa(id) {
  const { rows } = await getPool().query(
    `UPDATE senha_recuperacao
     SET tentativas = tentativas + 1
     WHERE id = $1
     RETURNING tentativas`,
    [id]
  );
  const tentativas = rows[0]?.tentativas ?? 0;
  if (tentativas >= MAX_TENTATIVAS) {
    await getPool().query(
      `UPDATE senha_recuperacao SET usado_em = NOW() WHERE id = $1 AND usado_em IS NULL`,
      [id]
    );
  }
  return tentativas;
}

async function marcarUsado(id) {
  await getPool().query(
    `UPDATE senha_recuperacao SET usado_em = NOW() WHERE id = $1`,
    [id]
  );
}

/**
 * Valida token ou (cpf + código) e redefine a senha.
 */
export async function redefinirSenhaComRecuperacao({
  token,
  cpf,
  codigo,
  novaSenha,
}) {
  await atrasoPadrao();

  let pedido = null;

  if (token) {
    pedido = await carregarPedidoAtivoPorToken(String(token).trim());
    if (!pedido) {
      return { ok: false, status: 400, error: "Link inválido ou expirado. Solicite uma nova recuperação." };
    }
    if (pedido.tentativas >= MAX_TENTATIVAS) {
      return { ok: false, status: 429, error: "Muitas tentativas. Solicite uma nova recuperação." };
    }
  } else {
    const cpfNorm = normalizarCpfCnpj(cpf);
    const codigoNorm = String(codigo || "").replace(/\D/g, "");
    if (!cpfNorm || codigoNorm.length !== 6) {
      return { ok: false, status: 400, error: "Informe CPF e o código de 6 dígitos." };
    }

    const candidatos = await carregarPedidosAtivosPorCpf(cpfNorm);
    const codigoHash = hashSegredo(`${cpfNorm}:${codigoNorm}`);
    pedido = candidatos.find((p) => p.codigo_hash === codigoHash) || null;

    if (!pedido) {
      if (candidatos[0]) {
        await registrarTentativa(candidatos[0].id);
      }
      return { ok: false, status: 400, error: "Código inválido ou expirado. Solicite uma nova recuperação." };
    }

    if (pedido.tentativas >= MAX_TENTATIVAS) {
      return { ok: false, status: 429, error: "Muitas tentativas. Solicite uma nova recuperação." };
    }
  }

  const usuario = await buscarUsuarioPorCpf(pedido.cpf);
  if (!usuario) {
    await marcarUsado(pedido.id);
    return { ok: false, status: 400, error: "Não foi possível redefinir a senha. Solicite novamente." };
  }

  const atualizado = await alterarSenhaUsuario(usuario.id, novaSenha);
  await marcarUsado(pedido.id);

  await getPool().query(
    `UPDATE senha_recuperacao
     SET usado_em = COALESCE(usado_em, NOW())
     WHERE cpf = $1 AND usado_em IS NULL`,
    [pedido.cpf]
  );

  return { ok: true, usuario: atualizado };
}

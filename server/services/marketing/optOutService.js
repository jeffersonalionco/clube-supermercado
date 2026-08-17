import { getPool } from "../../db.js";
import { emailValido } from "../../utils/validacaoCadastro.js";
import { verificarTokenOptOut } from "./emailBuilder.js";

export async function registrarOptOutPorToken(token) {
  const verificado = verificarTokenOptOut(token);
  if (!verificado.ok) return verificado;

  const { cpf, email } = verificado.payload;
  const emailNorm = String(email || "")
    .trim()
    .toLowerCase();
  const db = getPool();

  let usuario = null;
  if (cpf) {
    const { rows } = await db.query(
      `SELECT id, cpf, nome, email_promocional_opt_out_em
       FROM usuario WHERE cpf = $1`,
      [cpf]
    );
    usuario = rows[0] || null;
  }

  if (!usuario && emailNorm && emailValido(emailNorm)) {
    // tenta achar por e-mail em dados_api
    const { rows } = await db.query(
      `SELECT id, cpf, nome, email_promocional_opt_out_em, dados_api
       FROM usuario
       WHERE lower(coalesce(dados_api->>'email', '')) = $1
       LIMIT 1`,
      [emailNorm]
    );
    usuario = rows[0] || null;
  }

  if (!usuario) {
    // Sem usuário local: ainda assim confirma (não enviaremos a e-mails avulsos opt-out se mapeados depois)
    return {
      ok: true,
      jaOptOut: false,
      email: emailNorm || null,
      message:
        "Preferência registrada. Você não receberá mais e-mails promocionais neste endereço, quando vinculado a uma conta do clube.",
      semConta: true,
    };
  }

  if (usuario.email_promocional_opt_out_em) {
    return {
      ok: true,
      jaOptOut: true,
      email: emailNorm || null,
      nome: usuario.nome,
      message: "Este endereço já estava descadastrado de e-mails promocionais.",
    };
  }

  await db.query(
    `UPDATE usuario
     SET email_promocional_opt_out_em = NOW(),
         email_promocional_opt_out_motivo = $2,
         atualizado_em = NOW()
     WHERE id = $1`,
    [usuario.id, "opt_out_link_email"]
  );

  return {
    ok: true,
    jaOptOut: false,
    email: emailNorm || null,
    nome: usuario.nome,
    message:
      "Pronto. Você não receberá mais e-mails promocionais do Clube Superama+.",
  };
}

export async function statusOptOutToken(token) {
  const verificado = verificarTokenOptOut(token);
  if (!verificado.ok) return verificado;
  return {
    ok: true,
    email: verificado.payload.email || null,
  };
}

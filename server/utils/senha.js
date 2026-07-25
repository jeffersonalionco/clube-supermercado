export const SENHA_MIN_CADASTRO = 8;
export const SENHA_MIN_LOGIN = 4;

export function validarSenhaCadastro(senha) {
  const valor = String(senha || "");
  if (valor.length < SENHA_MIN_CADASTRO) {
    return {
      ok: false,
      error: `A senha deve ter pelo menos ${SENHA_MIN_CADASTRO} caracteres`,
    };
  }
  return { ok: true };
}

export function validarSenhaLogin(senha) {
  const valor = String(senha || "");
  if (valor.length < SENHA_MIN_LOGIN) {
    return { ok: false, error: "Informe sua senha" };
  }
  return { ok: true };
}

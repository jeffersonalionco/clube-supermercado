const BLOQUEADOS =
  /stacktrace|exception|jsonparse|\.java:|br\.com\.rpinfo|falha na estrutura|valores possíveis/i;

export function mensagemParaCliente(erro) {
  if (!erro) return "Não foi possível concluir. Tente novamente.";

  const texto = String(erro).trim();

  if (BLOQUEADOS.test(texto)) {
    const partes = texto
      .split(/·|—/)
      .map((p) => p.trim())
      .filter((p) => p && !BLOQUEADOS.test(p) && !p.startsWith("at "));

    const util = partes.find((p) => p.length < 120);
    if (util) return humanizar(util);
    return "Não foi possível concluir. Verifique os dados informados.";
  }

  return humanizar(texto.length > 200 ? `${texto.slice(0, 200)}…` : texto);
}

function humanizar(msg) {
  if (/estadoCivil/i.test(msg)) {
    return "Selecione um estado civil válido.";
  }
  if (/já possui cadastro/i.test(msg)) {
    return "Este CPF já está cadastrado. Faça login.";
  }
  return msg;
}

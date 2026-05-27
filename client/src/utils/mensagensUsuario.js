const BLOQUEADOS =
  /stacktrace|exception|jsonparse|\.java:|br\.com\.rpinfo|falha na estrutura|valores possíveis|localhost|npm run|backend|proxy|servidor retornou html|rota da api|api externa|http \d{3}|credenciais da api|postgresql|token da api/i;

export function mensagemParaUsuario(entrada) {
  if (!entrada) {
    return "Não foi possível concluir. Tente novamente em instantes.";
  }

  const texto = String(entrada).trim();

  if (BLOQUEADOS.test(texto)) {
    return mensagemAmigavelDeErroApi(texto);
  }

  const partes = texto
    .split(/·|—|\|/)
    .map((p) => p.trim())
    .filter((p) => p && !BLOQUEADOS.test(p) && !p.startsWith("at "));

  const curta = partes.find((p) => p.length > 0 && p.length < 140);
  if (curta) {
    return humanizar(curta);
  }

  return humanizar(texto.length > 160 ? texto.slice(0, 160) : texto);
}

function mensagemAmigavelDeErroApi(texto) {
  if (/estadoCivil/i.test(texto)) {
    return "Selecione um estado civil válido.";
  }
  if (/cpf|cnpj/i.test(texto) && /inválido|encontrado|cadastrado/i.test(texto)) {
    if (/cadastrado|exist/i.test(texto)) {
      return "Este CPF já está cadastrado. Faça login para continuar.";
    }
    return "CPF inválido. Confira os números digitados.";
  }
  if (/email/i.test(texto)) {
    return "Informe um e-mail válido.";
  }
  if (/senha/i.test(texto)) {
    return "CPF ou senha incorretos.";
  }
  if (/sessão|token|expirad/i.test(texto)) {
    return "Sua sessão expirou. Faça login novamente.";
  }
  return "Não foi possível concluir. Verifique os dados e tente novamente.";
}

function humanizar(msg) {
  if (/estadoCivil/i.test(msg)) return "Selecione um estado civil válido.";
  if (/já possui cadastro|já está cadastrado/i.test(msg)) {
    return "Este CPF já está cadastrado. Faça login para continuar.";
  }
  if (/não encontrado/i.test(msg)) return "Cadastro não encontrado.";
  if (/datainicial|datafinal|dd-mm-yyyy/i.test(msg)) {
    return "Informe as datas no formato dia/mês/ano.";
  }
  if (/não é válida para o formato/i.test(msg)) {
    return "Período inválido. Use o formato dia/mês/ano.";
  }
  return msg;
}

export function estadoCivilLabel(valor) {
  const map = {
    SOLTEIRO: "Solteiro(a)",
    CASADO: "Casado(a)",
    DIVORCIADO: "Divorciado(a)",
    VIUVO: "Viúvo(a)",
    OUTROS: "Outros",
  };
  return map[String(valor || "").toUpperCase()] || valor || null;
}

export function categoriaLabel(valor) {
  if (!valor || valor === "SM") return "Clube Superama";
  return String(valor);
}

/** Limites e regras de cadastro do Clube Superama+ (antiabuso). */

export const LIMITE_NOME = 120;
export const LIMITE_EMAIL = 120;
export const IDADE_MINIMA_CADASTRO = 18;

export function apenasDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

/** CPF com 11 dígitos e dígitos verificadores válidos (rejeita sequências 000... / 111...). */
export function cpfDigitosValidos(valor) {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i += 1) soma += Number(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(cpf[10]);
}

export function emailValido(valor) {
  const email = String(valor || "").trim();
  if (!email || email.length > LIMITE_EMAIL) return false;
  if (/\s/.test(email)) return false;
  // Formato prático (não RFC completo): local@dominio.tld
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

export function nomeValido(valor) {
  const nome = String(valor || "").trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > LIMITE_NOME) return false;
  // Letras (inclui acentos), espaços, apóstrofo e hífen
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(nome);
}

export function telefoneValido(valor) {
  const tel = apenasDigitos(valor);
  if (tel.length !== 10 && tel.length !== 11) return false;
  if (/^(\d)\1+$/.test(tel)) return false;
  const ddd = Number(tel.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (tel.length === 11 && tel[2] !== "9") return false;
  return true;
}

/**
 * Data de nascimento em DD/MM/AAAA — calendário real.
 * @returns {{ ok: true, data: string, dia: number, mes: number, ano: number } | { ok: false }}
 */
export function parseDataNascimento(valor) {
  const match = String(valor || "")
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return { ok: false };

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  if (ano < 1900) return { ok: false };

  const dt = new Date(ano, mes - 1, dia);
  if (
    dt.getFullYear() !== ano ||
    dt.getMonth() !== mes - 1 ||
    dt.getDate() !== dia
  ) {
    return { ok: false };
  }

  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  if (dt > hoje) return { ok: false };

  return { ok: true, data: `${match[1]}/${match[2]}/${match[3]}`, dia, mes, ano };
}

export function idadeEmAnos(dia, mes, ano, ref = new Date()) {
  let idade = ref.getFullYear() - ano;
  const m = ref.getMonth() + 1;
  const d = ref.getDate();
  if (m < mes || (m === mes && d < dia)) idade -= 1;
  return idade;
}

export function maiorDeIdadeCadastro(valor) {
  const parsed = parseDataNascimento(valor);
  if (!parsed.ok) return false;
  return idadeEmAnos(parsed.dia, parsed.mes, parsed.ano) >= IDADE_MINIMA_CADASTRO;
}

const SEXO_VALIDOS = ["M", "F"];

export function sexoValidoOuVazio(valor) {
  if (valor == null || String(valor).trim() === "") return true;
  return SEXO_VALIDOS.includes(String(valor).trim().toUpperCase());
}

/**
 * Valida campos editáveis do cadastro/atualização.
 * Lança Error com mensagem amigável.
 */
export function assertDadosCadastroCliente(dados, { exigirEmail = true } = {}) {
  if (!cpfDigitosValidos(dados.cpf)) {
    throw new Error("Informe um CPF válido");
  }

  if (!nomeValido(dados.nome)) {
    throw new Error(
      `Informe o nome completo (apenas letras, entre 2 e ${LIMITE_NOME} caracteres)`
    );
  }

  if (exigirEmail) {
    if (!emailValido(dados.email)) {
      throw new Error("Informe um e-mail válido");
    }
  } else if (dados.email != null && String(dados.email).trim() !== "") {
    if (!emailValido(dados.email)) {
      throw new Error("Informe um e-mail válido");
    }
  }

  if (!telefoneValido(dados.celular || dados.telefone)) {
    throw new Error("Informe um celular válido com DDD (10 ou 11 dígitos)");
  }

  const nasc = parseDataNascimento(dados.dataNascimento);
  if (!nasc.ok) {
    throw new Error("Informe uma data de nascimento válida (DD/MM/AAAA)");
  }
  if (idadeEmAnos(nasc.dia, nasc.mes, nasc.ano) < IDADE_MINIMA_CADASTRO) {
    throw new Error(
      `É necessário ter pelo menos ${IDADE_MINIMA_CADASTRO} anos para se cadastrar`
    );
  }

  if (!sexoValidoOuVazio(dados.sexo)) {
    throw new Error("Sexo inválido");
  }
}

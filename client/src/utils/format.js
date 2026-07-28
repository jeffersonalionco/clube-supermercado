export const LIMITE_NOME = 120;
export const LIMITE_EMAIL = 120;
export const IDADE_MINIMA_CADASTRO = 18;

export function formatarTelefone(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function formatarDataNascimento(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

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

  return { ok: true, dia, mes, ano };
}

export function dataNascimentoValida(valor) {
  return parseDataNascimento(valor).ok;
}

export function maiorDeIdadeCadastro(valor) {
  const parsed = parseDataNascimento(valor);
  if (!parsed.ok) return false;
  const hoje = new Date();
  let idade = hoje.getFullYear() - parsed.ano;
  const m = hoje.getMonth() + 1;
  const d = hoje.getDate();
  if (m < parsed.mes || (m === parsed.mes && d < parsed.dia)) idade -= 1;
  return idade >= IDADE_MINIMA_CADASTRO;
}

export function emailValido(valor) {
  const email = String(valor || "").trim();
  if (!email || email.length > LIMITE_EMAIL) return false;
  if (/\s/.test(email)) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}

export function nomeValido(valor) {
  const nome = String(valor || "").trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > LIMITE_NOME) return false;
  return /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(nome);
}

export function telefoneValido(valor) {
  const tel = String(valor || "").replace(/\D/g, "");
  if (tel.length !== 10 && tel.length !== 11) return false;
  if (/^(\d)\1+$/.test(tel)) return false;
  const ddd = Number(tel.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (tel.length === 11 && tel[2] !== "9") return false;
  return true;
}

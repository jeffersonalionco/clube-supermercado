/** Fuso oficial da operação Superama (padaria, clube, relatórios). */
export const FUSO_BRASILIA = "America/Sao_Paulo";

/**
 * Data civil em Brasília no formato YYYY-MM-DD.
 * Independente do fuso do sistema operacional.
 */
export function dataBrasiliaISO(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

/** Partes de data/hora em Brasília. */
export function partesBrasilia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO_BRASILIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => {
    const v = parts.find((p) => p.type === type)?.value;
    return Number(v);
  };
  return {
    ano: get("year"),
    mes: get("month"),
    dia: get("day"),
    hora: get("hour") % 24,
    minuto: get("minute"),
    segundo: get("second"),
  };
}

/** Ano civil em Brasília (códigos PAD-AAAA-…). */
export function anoBrasilia(date = new Date()) {
  return partesBrasilia(date).ano;
}

/**
 * Converte data YYYY-MM-DD + hora HH:MM (interpretados em Brasília)
 * para um instante Date comparável com Date.now().
 * Brasília está em UTC−3 o ano todo (sem horário de verão desde 2019).
 */
export function instanteBrasilia(dataIso, horaHHMM = "00:00") {
  const data = String(dataIso || "").slice(0, 10);
  const hora = String(horaHHMM || "00:00").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  if (!/^\d{2}:\d{2}$/.test(hora)) return null;
  const dt = new Date(`${data}T${hora}:00-03:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Instantâneo “agora” (mesmo em qualquer fuso; use com instanteBrasilia). */
export function agora() {
  return new Date();
}

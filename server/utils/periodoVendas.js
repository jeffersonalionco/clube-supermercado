const MAX_DIAS_PERIODO = 90;
const REGEX_DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function formatarDataBR(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Converte DD/MM/AAAA → dd-MM-yyyy (formato exigido pela API de vendas). */
export function dataBRParaApi(valor) {
  const match = String(valor || "").trim().match(REGEX_DATA_BR);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseDataBR(valor) {
  const match = String(valor || "").trim().match(REGEX_DATA_BR);
  if (!match) return null;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  const date = new Date(ano, mes - 1, dia);
  if (
    date.getFullYear() !== ano ||
    date.getMonth() !== mes - 1 ||
    date.getDate() !== dia
  ) {
    return null;
  }
  return date;
}

export function diasEntreDatas(inicio, fim) {
  const ms = Math.abs(fim.getTime() - inicio.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function periodoMesAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  return {
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(agora),
  };
}

export function periodoUltimosDias(dias) {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (dias - 1));
  return {
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(fim),
  };
}

/**
 * Valida intervalo DD/MM/AAAA — máximo 90 dias entre início e fim.
 */
export function validarPeriodoVendas(dataini, datafim) {
  const inicio = parseDataBR(dataini);
  const fim = parseDataBR(datafim);

  if (!inicio || !fim) {
    return {
      ok: false,
      error: "Informe as datas no formato DD/MM/AAAA",
    };
  }

  if (inicio > fim) {
    return {
      ok: false,
      error: "A data inicial não pode ser posterior à data final",
    };
  }

  const dias = diasEntreDatas(inicio, fim);
  if (dias > MAX_DIAS_PERIODO) {
    return {
      ok: false,
      error: `O período não pode ultrapassar ${MAX_DIAS_PERIODO} dias`,
      maxDias: MAX_DIAS_PERIODO,
    };
  }

  return {
    ok: true,
    dataini: formatarDataBR(inicio),
    datafim: formatarDataBR(fim),
    dias: dias + 1,
    inicio,
    fim,
  };
}

export { MAX_DIAS_PERIODO };

import { getPool } from "../db.js";

function diaHojeSp() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

let cache = { dia: "", codigos: new Set() };

function guardarCache(dia, codigos) {
  cache = { dia, codigos };
}

export async function codigosEsgotadosHoje() {
  const dia = diaHojeSp();
  if (cache.dia === dia) return cache.codigos;

  const { rows } = await getPool().query(
    `SELECT codigo FROM clube_oferta_esgotada WHERE dia = $1::date`,
    [dia]
  );
  const codigos = new Set(rows.map((row) => String(row.codigo)));
  guardarCache(dia, codigos);
  return codigos;
}

export async function marcarOfertaEsgotada(codigo, { descricao, marcadoPor } = {}) {
  const codigoLimpo = String(codigo ?? "").trim();
  if (!codigoLimpo) {
    const erro = new Error("Informe o código do produto");
    erro.status = 400;
    throw erro;
  }

  const dia = diaHojeSp();
  await getPool().query(
    `INSERT INTO clube_oferta_esgotada (codigo, dia, descricao, marcado_por)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (codigo, dia) DO UPDATE SET
       descricao = EXCLUDED.descricao,
       marcado_por = EXCLUDED.marcado_por,
       marcado_em = NOW()`,
    [
      codigoLimpo,
      dia,
      String(descricao || "").trim().slice(0, 255) || null,
      String(marcadoPor || "").trim().slice(0, 120) || null,
    ]
  );

  const codigos = cache.dia === dia ? new Set(cache.codigos) : new Set();
  codigos.add(codigoLimpo);
  guardarCache(dia, codigos);
  return { codigo: codigoLimpo, dia, esgotado: true };
}

export async function desmarcarOfertaEsgotada(codigo) {
  const codigoLimpo = String(codigo ?? "").trim();
  if (!codigoLimpo) {
    const erro = new Error("Informe o código do produto");
    erro.status = 400;
    throw erro;
  }

  const dia = diaHojeSp();
  await getPool().query(
    `DELETE FROM clube_oferta_esgotada WHERE codigo = $1 AND dia = $2::date`,
    [codigoLimpo, dia]
  );

  if (cache.dia === dia) {
    const codigos = new Set(cache.codigos);
    codigos.delete(codigoLimpo);
    guardarCache(dia, codigos);
  }
  return { codigo: codigoLimpo, dia, esgotado: false };
}

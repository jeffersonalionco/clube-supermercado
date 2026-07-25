import { getPool } from "../db.js";

const CACHE_TTL_MS = 5000;
let cache = null;
let cacheAt = 0;

function mapRow(row) {
  if (!row) {
    return {
      pontosHabilitado: false,
      pontosHabilitadoEm: null,
      atualizadoEm: null,
      atualizadoPor: null,
    };
  }
  return {
    pontosHabilitado: Boolean(row.pontos_habilitado),
    pontosHabilitadoEm: row.pontos_habilitado_em
      ? new Date(row.pontos_habilitado_em)
      : null,
    atualizadoEm: row.atualizado_em ? new Date(row.atualizado_em) : null,
    atualizadoPor: row.atualizado_por || null,
  };
}

function invalidarCache() {
  cache = null;
  cacheAt = 0;
}

export async function obterConfigPrograma({ forcar = false } = {}) {
  const agora = Date.now();
  if (!forcar && cache && agora - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  const { rows } = await getPool().query(
    `SELECT pontos_habilitado, pontos_habilitado_em, atualizado_em, atualizado_por
     FROM config_programa
     WHERE id = 1`
  );

  cache = mapRow(rows[0]);
  cacheAt = agora;
  return cache;
}

export async function programaPontosAtivo() {
  const config = await obterConfigPrograma();
  return config.pontosHabilitado;
}

export async function atualizarPontosHabilitado(habilitado, adminUsuario) {
  const ligar = Boolean(habilitado);

  if (ligar) {
    const { rows } = await getPool().query(
      `UPDATE config_programa
       SET pontos_habilitado = true,
           pontos_habilitado_em = NOW(),
           atualizado_em = NOW(),
           atualizado_por = $1
       WHERE id = 1
       RETURNING pontos_habilitado, pontos_habilitado_em, atualizado_em, atualizado_por`,
      [adminUsuario || "admin"]
    );
    invalidarCache();
    return mapRow(rows[0]);
  }

  const { rows } = await getPool().query(
    `UPDATE config_programa
     SET pontos_habilitado = false,
         atualizado_em = NOW(),
         atualizado_por = $1
     WHERE id = 1
     RETURNING pontos_habilitado, pontos_habilitado_em, atualizado_em, atualizado_por`,
    [adminUsuario || "admin"]
  );
  invalidarCache();
  return mapRow(rows[0]);
}

export function apresentarProgramaCliente(config) {
  return {
    pontosAtivo: Boolean(config?.pontosHabilitado),
    pontosHabilitadoEm: config?.pontosHabilitadoEm
      ? config.pontosHabilitadoEm.toISOString()
      : null,
  };
}

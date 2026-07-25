import { getPool } from "../db.js";
import { extrairYoutubeVideoId, normalizarYoutubeUrl } from "../utils/youtubeUrl.js";

const CACHE_TTL_MS = 5000;
let cache = null;
let cacheAt = 0;

function mapRow(row) {
  if (!row) {
    return {
      videoHomeUrl: "",
      videoHomeTitulo: "",
      videoHomeAtivo: false,
      videoHomeVideoId: null,
      atualizadoEm: null,
      atualizadoPor: null,
    };
  }

  const videoHomeUrl = row.video_home_url || "";
  const videoHomeVideoId = extrairYoutubeVideoId(videoHomeUrl);

  return {
    videoHomeUrl,
    videoHomeTitulo: row.video_home_titulo || "",
    videoHomeAtivo: Boolean(row.video_home_ativo),
    videoHomeVideoId,
    atualizadoEm: row.atualizado_em ? new Date(row.atualizado_em) : null,
    atualizadoPor: row.atualizado_por || null,
  };
}

function invalidarCache() {
  cache = null;
  cacheAt = 0;
}

export async function obterConfigConteudo({ forcar = false } = {}) {
  const agora = Date.now();
  if (!forcar && cache && agora - cacheAt < CACHE_TTL_MS) {
    return cache;
  }

  const { rows } = await getPool().query(
    `SELECT video_home_url, video_home_titulo, video_home_ativo,
            atualizado_em, atualizado_por
     FROM config_conteudo
     WHERE id = 1`
  );

  cache = mapRow(rows[0]);
  cacheAt = agora;
  return cache;
}

export async function atualizarVideoHome(
  { url, titulo, ativo },
  adminUsuario
) {
  const configAtual = await obterConfigConteudo({ forcar: true });

  let videoHomeUrl = configAtual.videoHomeUrl;
  if (url !== undefined) {
    const trimmed = String(url || "").trim();
    if (!trimmed) {
      videoHomeUrl = "";
    } else {
      const normalizada = normalizarYoutubeUrl(trimmed);
      if (!normalizada) {
        const err = new Error("URL do YouTube inválida");
        err.code = "YOUTUBE_URL_INVALIDA";
        throw err;
      }
      videoHomeUrl = normalizada;
    }
  }

  let videoHomeTitulo = configAtual.videoHomeTitulo;
  if (titulo !== undefined) {
    videoHomeTitulo = String(titulo || "").trim().slice(0, 200);
  }

  let videoHomeAtivo = configAtual.videoHomeAtivo;
  if (ativo !== undefined) {
    videoHomeAtivo = Boolean(ativo);
  }

  const { rows } = await getPool().query(
    `UPDATE config_conteudo
     SET video_home_url = $1,
         video_home_titulo = $2,
         video_home_ativo = $3,
         atualizado_em = NOW(),
         atualizado_por = $4
     WHERE id = 1
     RETURNING video_home_url, video_home_titulo, video_home_ativo,
               atualizado_em, atualizado_por`,
    [videoHomeUrl, videoHomeTitulo, videoHomeAtivo, adminUsuario || "admin"]
  );

  invalidarCache();
  return mapRow(rows[0]);
}

export function apresentarConteudoCliente(config) {
  const videoId = config?.videoHomeVideoId;
  const ativo = Boolean(config?.videoHomeAtivo && videoId);

  return {
    videoHome: ativo
      ? {
          titulo: config.videoHomeTitulo || "Vídeo do clube",
          videoId,
          thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        }
      : null,
  };
}

export function apresentarConteudoAdmin(config) {
  return {
    videoHomeUrl: config.videoHomeUrl,
    videoHomeTitulo: config.videoHomeTitulo,
    videoHomeAtivo: config.videoHomeAtivo,
    videoHomeVideoId: config.videoHomeVideoId,
    atualizadoEm: config.atualizadoEm?.toISOString() ?? null,
    atualizadoPor: config.atualizadoPor,
  };
}

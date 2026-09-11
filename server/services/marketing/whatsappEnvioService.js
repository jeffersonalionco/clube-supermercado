import { getPool } from "../../db.js";
import {
  buscarCampanha,
  estimarDestinatariosCampanha,
  STATUS_REENVIAVEIS,
} from "./campanhaService.js";
import {
  enviarTemplateWhatsapp,
  normalizarTelefoneWa,
  uploadMidiaWhatsapp,
  whatsappCloudConfigurado,
} from "./whatsappCloudService.js";

const LOTES_EM_ANDAMENTO = new Set();
const TAMANHO_LOTE = 10;
const PAUSA_ENTRE_LOTES_MS = 800;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function personalizarParams(lista, destinatario) {
  const nome = String(destinatario?.nome || "")
    .trim()
    .split(/\s+/)[0] || "cliente";
  return (lista || []).map((item) =>
    String(item ?? "")
      .replace(/\{\{\s*nome\s*\}\}/gi, nome)
      .replace(/\{\{\s*1\s*\}\}/g, nome)
  );
}

async function atualizarTotais(campanhaId) {
  await getPool().query(
    `UPDATE marketing_campanha c
     SET total_enviados = (SELECT COUNT(*)::int FROM marketing_envio e WHERE e.campanha_id = c.id AND e.status = 'enviado'),
         total_falhas = (SELECT COUNT(*)::int FROM marketing_envio e WHERE e.campanha_id = c.id AND e.status = 'falha'),
         total_pulados = (SELECT COUNT(*)::int FROM marketing_envio e WHERE e.campanha_id = c.id AND e.status = 'pulado'),
         atualizado_em = NOW()
     WHERE c.id = $1`,
    [campanhaId]
  );
}

async function processarFilaWhatsapp(campanhaId) {
  if (LOTES_EM_ANDAMENTO.has(campanhaId)) return;
  LOTES_EM_ANDAMENTO.add(campanhaId);

  try {
    const campanha = await buscarCampanha(campanhaId);
    if (!campanha || campanha.status !== "enviando") return;
    if (campanha.canal !== "whatsapp") return;

    let midiaId = null;
    if (
      campanha.midiaUrl &&
      (campanha.midiaTipo === "video" || campanha.midiaTipo === "image")
    ) {
      const up = await uploadMidiaWhatsapp({
        midiaUrl: campanha.midiaUrl,
        midiaTipo: campanha.midiaTipo,
      });
      if (!up.ok) {
        console.error("[marketing/whatsapp] upload mídia:", up.error);
        await getPool().query(
          `UPDATE marketing_envio
           SET status = 'falha', erro = $2
           WHERE campanha_id = $1 AND status = 'pendente'`,
          [
            campanhaId,
            String(up.error || "Falha no upload da mídia").slice(0, 500),
          ]
        );
        await getPool().query(
          `UPDATE marketing_campanha
           SET status = 'concluida', atualizado_em = NOW()
           WHERE id = $1 AND status = 'enviando'`,
          [campanhaId]
        );
        await atualizarTotais(campanhaId);
        return;
      }
      midiaId = up.mediaId;
      if (up.midiaUrl && up.midiaUrl !== campanha.midiaUrl) {
        await getPool().query(
          `UPDATE marketing_campanha
           SET midia_url = $2, midia_tipo = 'video', atualizado_em = NOW()
           WHERE id = $1`,
          [campanhaId, up.midiaUrl]
        );
        campanha.midiaUrl = up.midiaUrl;
      }
      console.log("[marketing/whatsapp] midia_id", midiaId, up.bytes, "bytes");
    }

    while (true) {
      const { rows } = await getPool().query(
        `SELECT id, usuario_id, cpf, telefone
         FROM marketing_envio
         WHERE campanha_id = $1 AND status = 'pendente'
         ORDER BY id ASC
         LIMIT $2`,
        [campanhaId, TAMANHO_LOTE]
      );
      if (!rows.length) break;

      for (const envio of rows) {
        const atual = await buscarCampanha(campanhaId);
        if (!atual || atual.status !== "enviando") return;

        let nome = null;
        if (envio.usuario_id) {
          const { rows: urows } = await getPool().query(
            `SELECT nome FROM usuario WHERE id = $1`,
            [envio.usuario_id]
          );
          nome = urows[0]?.nome || null;
        }

        const resultado = await enviarTemplateWhatsapp({
          telefone: envio.telefone,
          templateNome: campanha.templateNome,
          templateIdioma: campanha.templateIdioma,
          midiaTipo: campanha.midiaTipo,
          midiaId,
          midiaUrl: midiaId ? undefined : campanha.midiaUrl,
          bodyParams: personalizarParams(campanha.bodyParams, { nome }),
          buttonUrlParams: campanha.buttonUrlParams,
        });

        if (resultado.ok) {
          await getPool().query(
            `UPDATE marketing_envio
             SET status = 'enviado', enviado_em = NOW(), erro = NULL
             WHERE id = $1`,
            [envio.id]
          );
        } else {
          await getPool().query(
            `UPDATE marketing_envio
             SET status = 'falha', erro = $2
             WHERE id = $1`,
            [envio.id, String(resultado.error || "Falha").slice(0, 500)]
          );
        }
        await atualizarTotais(campanhaId);
      }

      await sleep(PAUSA_ENTRE_LOTES_MS);
    }

    await getPool().query(
      `UPDATE marketing_campanha
       SET status = 'concluida', atualizado_em = NOW()
       WHERE id = $1 AND status = 'enviando'`,
      [campanhaId]
    );
    await atualizarTotais(campanhaId);
  } finally {
    LOTES_EM_ANDAMENTO.delete(campanhaId);
  }
}

export async function enviarTesteWhatsapp(campanhaId, telefoneTeste) {
  if (!whatsappCloudConfigurado()) {
    return {
      ok: false,
      error:
        "Configure WHATSAPP_CLOUD_TOKEN e WHATSAPP_CLOUD_PHONE_NUMBER_ID no .env",
    };
  }

  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };
  if (campanha.canal !== "whatsapp") {
    return { ok: false, error: "Campanha não é de WhatsApp" };
  }

  const telefone = normalizarTelefoneWa(telefoneTeste || campanha.telefoneTeste);
  if (!telefone) {
    return { ok: false, error: "Informe um telefone de teste com DDD" };
  }

  let midiaId = null;
  let midiaUrl = campanha.midiaUrl;
  if (
    midiaUrl &&
    (campanha.midiaTipo === "video" || campanha.midiaTipo === "image")
  ) {
    const up = await uploadMidiaWhatsapp({
      midiaUrl,
      midiaTipo: campanha.midiaTipo,
    });
    if (!up.ok) return up;
    midiaId = up.mediaId;
    if (up.midiaUrl && up.midiaUrl !== midiaUrl) {
      midiaUrl = up.midiaUrl;
      await getPool().query(
        `UPDATE marketing_campanha
         SET midia_url = $2, midia_tipo = $3, atualizado_em = NOW()
         WHERE id = $1`,
        [campanhaId, midiaUrl, campanha.midiaTipo]
      );
    }
    console.log(
      "[marketing/whatsapp] teste midia_id",
      midiaId,
      up.bytes,
      "bytes"
    );
  }

  const resultado = await enviarTemplateWhatsapp({
    telefone,
    templateNome: campanha.templateNome,
    templateIdioma: campanha.templateIdioma,
    midiaTipo: campanha.midiaTipo,
    midiaId,
    midiaUrl: midiaId ? undefined : midiaUrl,
    bodyParams: personalizarParams(campanha.bodyParams, { nome: "Teste" }),
    buttonUrlParams: campanha.buttonUrlParams,
  });

  if (!resultado.ok) return resultado;

  await getPool().query(
    `UPDATE marketing_campanha
     SET telefone_teste = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [campanhaId, telefone]
  );

  return {
    ok: true,
    message: `Teste enviado para ${telefone}`,
    messageId: resultado.messageId,
  };
}

export async function retomarEnvioWhatsapp(campanhaId) {
  if (!whatsappCloudConfigurado()) {
    return { ok: false, error: "WhatsApp Cloud API não configurada" };
  }

  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };
  if (campanha.canal !== "whatsapp") {
    return { ok: false, error: "Campanha não é de WhatsApp" };
  }
  if (campanha.status !== "enviando") {
    return { ok: false, error: "Esta campanha não está em envio" };
  }

  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS pendentes
     FROM marketing_envio
     WHERE campanha_id = $1 AND status = 'pendente'`,
    [campanhaId]
  );

  if (!(rows[0]?.pendentes > 0)) {
    await getPool().query(
      `UPDATE marketing_campanha
       SET status = 'concluida', atualizado_em = NOW()
       WHERE id = $1`,
      [campanhaId]
    );
    await atualizarTotais(campanhaId);
    return {
      ok: true,
      message: "Não havia pendentes — campanha marcada como concluída",
    };
  }

  await atualizarTotais(campanhaId);
  if (!LOTES_EM_ANDAMENTO.has(Number(campanhaId))) {
    processarFilaWhatsapp(campanhaId).catch((err) => {
      console.error("[marketing/whatsapp]", err.message);
    });
  }
  return { ok: true, message: "Envio WhatsApp retomado" };
}

export async function iniciarEnvioWhatsapp(campanhaId) {
  if (!whatsappCloudConfigurado()) {
    return { ok: false, error: "WhatsApp Cloud API não configurada" };
  }

  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };
  if (campanha.canal !== "whatsapp") {
    return { ok: false, error: "Campanha não é de WhatsApp" };
  }
  if (campanha.status === "enviando") {
    return retomarEnvioWhatsapp(campanhaId);
  }
  if (!STATUS_REENVIAVEIS.has(campanha.status)) {
    return {
      ok: false,
      error: "Esta campanha não pode ser enviada neste status",
    };
  }

  if (!campanha.templateNome) {
    return { ok: false, error: "Campanha sem template configurado" };
  }

  const { destinatarios, resumo } = await estimarDestinatariosCampanha(campanha);
  if (!destinatarios.length) {
    return {
      ok: false,
      error: "Nenhum destinatário elegível para esta campanha",
      resumo,
    };
  }

  const reenvio =
    campanha.status === "concluida" || campanha.status === "cancelada";

  await getPool().query(
    `UPDATE marketing_campanha
     SET status = 'enviando',
         enviado_em = COALESCE(enviado_em, NOW()),
         total_destinatarios = $2,
         total_enviados = 0,
         total_falhas = 0,
         total_pulados = 0,
         atualizado_em = NOW()
     WHERE id = $1`,
    [campanhaId, destinatarios.length]
  );

  if (reenvio) {
    await getPool().query(`DELETE FROM marketing_envio WHERE campanha_id = $1`, [
      campanhaId,
    ]);
  }

  for (const d of destinatarios) {
    await getPool().query(
      `INSERT INTO marketing_envio (campanha_id, usuario_id, cpf, email, telefone, status)
       VALUES ($1, $2, $3, NULL, $4, 'pendente')`,
      [campanhaId, d.usuarioId, d.cpf, d.telefone]
    );
  }

  processarFilaWhatsapp(campanhaId).catch((err) => {
    console.error("[marketing/whatsapp]", err.message);
  });

  return {
    ok: true,
    message: `Envio iniciado para ${destinatarios.length} destinatário(s)`,
    resumo,
  };
}

export async function retomarEnviosWhatsappPendentesNoBoot() {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT id FROM marketing_campanha
     WHERE canal = 'whatsapp' AND status = 'enviando' AND arquivado_em IS NULL`
  );
  for (const row of rows) {
    try {
      const resultado = await retomarEnvioWhatsapp(row.id);
      console.log(`[marketing/whatsapp/boot] campanha ${row.id}: ${resultado.message}`);
    } catch (error) {
      console.error(`[marketing/whatsapp/boot] campanha ${row.id}:`, error.message);
    }
  }
}

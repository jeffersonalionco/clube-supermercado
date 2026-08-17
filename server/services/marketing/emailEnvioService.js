import { getPool } from "../../db.js";
import { enviarEmail, smtpDisponivel } from "../mailService.js";
import { emailValido } from "../../utils/validacaoCadastro.js";
import {
  buscarCampanha,
  estimarDestinatariosCampanha,
  STATUS_REENVIAVEIS,
} from "./campanhaService.js";
import { criarTokenOptOut, montarEmailPromocional } from "./emailBuilder.js";

const LOTES_EM_ANDAMENTO = new Set();
const TAMANHO_LOTE = 15;
const PAUSA_ENTRE_LOTES_MS = 1200;
const SMTP_TIMEOUT_MS = 28_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function comTimeout(promessa, ms, mensagem) {
  let timer;
  return Promise.race([
    promessa.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(mensagem));
      }, ms);
    }),
  ]);
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

async function processarFilaCampanha(campanhaId) {
  if (LOTES_EM_ANDAMENTO.has(campanhaId)) return;
  LOTES_EM_ANDAMENTO.add(campanhaId);

  try {
    const campanha = await buscarCampanha(campanhaId);
    if (!campanha || campanha.status !== "enviando") return;

    while (true) {
      const { rows: pendentes } = await getPool().query(
        `SELECT id, usuario_id, cpf, email
         FROM marketing_envio
         WHERE campanha_id = $1 AND status = 'pendente'
         ORDER BY id ASC
         LIMIT $2`,
        [campanhaId, TAMANHO_LOTE]
      );

      if (!pendentes.length) break;

      for (const envio of pendentes) {
        try {
          const token = criarTokenOptOut({
            cpf: envio.cpf,
            email: envio.email,
            campanhaId,
          });
          // Envio real: nunca usa prefixo [TESTE]
          const assuntoReal = String(campanha.assunto || "")
            .replace(/^\[TESTE\]\s*/i, "")
            .trim();
          const montado = montarEmailPromocional({
            assunto: assuntoReal,
            preheader: campanha.preheader,
            corpoMd: campanha.corpoMd,
            corpoHtml: campanha.corpoHtml,
            corpoTexto: campanha.corpoTexto,
            optOutToken: token,
            modoTeste: false,
          });

          await comTimeout(
            enviarEmail({
              para: envio.email,
              assunto: assuntoReal,
              texto: montado.texto,
              html: montado.html,
              headers: {
                "List-Unsubscribe": montado.listUnsubscribe,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }),
            SMTP_TIMEOUT_MS,
            `Timeout SMTP ao enviar para ${envio.email}`
          );

          await getPool().query(
            `UPDATE marketing_envio
             SET status = 'enviado', enviado_em = NOW(), erro = NULL
             WHERE id = $1`,
            [envio.id]
          );
          await atualizarTotais(campanhaId);
        } catch (error) {
          await getPool().query(
            `UPDATE marketing_envio
             SET status = 'falha', erro = $2
             WHERE id = $1`,
            [envio.id, String(error.message || "Falha no envio").slice(0, 500)]
          );
        }
      }

      await atualizarTotais(campanhaId);
      await sleep(PAUSA_ENTRE_LOTES_MS);
    }

    await getPool().query(
      `UPDATE marketing_campanha
       SET status = 'concluida',
           enviado_em = COALESCE(enviado_em, NOW()),
           atualizado_em = NOW()
       WHERE id = $1 AND status = 'enviando'`,
      [campanhaId]
    );
    await atualizarTotais(campanhaId);
  } finally {
    LOTES_EM_ANDAMENTO.delete(campanhaId);
  }
}

export async function enviarTesteCampanha(campanhaId, emailTeste) {
  if (!smtpDisponivel()) {
    return { ok: false, error: "SMTP não configurado no servidor" };
  }

  const email = String(emailTeste || "")
    .trim()
    .toLowerCase();
  if (!emailValido(email)) {
    return { ok: false, error: "Informe um e-mail de teste válido" };
  }

  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };

  const assuntoTeste = `[TESTE] ${String(campanha.assunto || "").replace(/^\[TESTE\]\s*/i, "")}`;
  const token = criarTokenOptOut({
    cpf: null,
    email,
    campanhaId: campanha.id,
  });
  const montado = montarEmailPromocional({
    assunto: assuntoTeste,
    preheader: campanha.preheader,
    corpoMd: campanha.corpoMd,
    corpoHtml: campanha.corpoHtml,
    corpoTexto: campanha.corpoTexto,
    optOutToken: token,
    modoTeste: true,
  });

  await enviarEmail({
    para: email,
    assunto: assuntoTeste,
    texto: montado.texto,
    html: montado.html,
    headers: {
      "List-Unsubscribe": montado.listUnsubscribe,
    },
  });

  await getPool().query(
    `UPDATE marketing_campanha
     SET email_teste = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [campanhaId, email]
  );

  return { ok: true, message: `E-mail de teste enviado para ${email}` };
}

export async function retomarEnvioCampanha(campanhaId) {
  if (!smtpDisponivel()) {
    return { ok: false, error: "SMTP não configurado no servidor" };
  }

  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };
  if (campanha.status !== "enviando") {
    return { ok: false, error: "Esta campanha não está em envio" };
  }

  const { rows } = await getPool().query(
    `SELECT status, COUNT(*)::int AS total
     FROM marketing_envio
     WHERE campanha_id = $1
     GROUP BY status`,
    [campanhaId]
  );
  const porStatus = Object.fromEntries(rows.map((r) => [r.status, r.total]));
  const pendentes = porStatus.pendente || 0;

  if (!pendentes) {
    await getPool().query(
      `UPDATE marketing_campanha
       SET status = 'concluida',
           enviado_em = COALESCE(enviado_em, NOW()),
           atualizado_em = NOW()
       WHERE id = $1 AND status = 'enviando'`,
      [campanhaId]
    );
    await atualizarTotais(campanhaId);
    return {
      ok: true,
      message: "Não havia pendentes — campanha marcada como concluída",
      total: 0,
      retomada: true,
    };
  }

  await atualizarTotais(campanhaId);

  if (!LOTES_EM_ANDAMENTO.has(Number(campanhaId))) {
    setImmediate(() => {
      processarFilaCampanha(campanhaId).catch((err) => {
        console.error("[marketing/envio]", err.message);
      });
    });
  }

  return {
    ok: true,
    message: `Retomando envio: ${pendentes} pendente(s)`,
    total: pendentes,
    retomada: true,
  };
}

export async function retomarEnviosPendentesNoBoot() {
  if (!smtpDisponivel()) return;

  const { rows } = await getPool().query(
    `SELECT id FROM marketing_campanha
     WHERE canal = 'email' AND status = 'enviando' AND arquivado_em IS NULL
     ORDER BY id ASC`
  );

  for (const row of rows) {
    try {
      const resultado = await retomarEnvioCampanha(row.id);
      console.log(`[marketing/boot] campanha ${row.id}: ${resultado.message}`);
    } catch (error) {
      console.error(`[marketing/boot] campanha ${row.id}:`, error.message);
    }
  }
}

export async function iniciarEnvioCampanha(campanhaId) {
  if (!smtpDisponivel()) {
    return { ok: false, error: "SMTP não configurado no servidor" };
  }

  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };
  if (campanha.status === "enviando") {
    return retomarEnvioCampanha(campanhaId);
  }

  if (!STATUS_REENVIAVEIS.has(campanha.status)) {
    return {
      ok: false,
      error: "Esta campanha não pode ser enviada neste status",
    };
  }

  const reenvio = campanha.status === "concluida" || campanha.status === "cancelada";

  const { destinatarios, resumo } = await estimarDestinatariosCampanha(campanha);
  if (!destinatarios.length) {
    return {
      ok: false,
      error: "Nenhum destinatário elegível para esta campanha",
      resumo,
    };
  }

  const db = getPool();
  await db.query("BEGIN");
  try {
    await db.query(
      `UPDATE marketing_campanha
       SET status = 'enviando',
           enviado_em = NOW(),
           total_destinatarios = $2,
           total_enviados = 0,
           total_falhas = 0,
           total_pulados = 0,
           atualizado_em = NOW()
       WHERE id = $1`,
      [campanhaId, destinatarios.length]
    );

    await db.query(`DELETE FROM marketing_envio WHERE campanha_id = $1`, [
      campanhaId,
    ]);

    for (const d of destinatarios) {
      await db.query(
        `INSERT INTO marketing_envio (campanha_id, usuario_id, cpf, email, status)
         VALUES ($1, $2, $3, $4, 'pendente')`,
        [campanhaId, d.usuarioId, d.cpf, d.email]
      );
    }

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  setImmediate(() => {
    processarFilaCampanha(campanhaId).catch((err) => {
      console.error("[marketing/envio]", err.message);
    });
  });

  return {
    ok: true,
    message: reenvio
      ? `Reenvio iniciado para ${destinatarios.length} destinatário(s)`
      : `Envio iniciado para ${destinatarios.length} destinatário(s)`,
    total: destinatarios.length,
    reenvio,
    resumo,
  };
}

export async function progressoCampanha(campanhaId) {
  const campanha = await buscarCampanha(campanhaId);
  if (!campanha) return { ok: false, error: "Campanha não encontrada" };

  const { rows } = await getPool().query(
    `SELECT status, COUNT(*)::int AS total
     FROM marketing_envio
     WHERE campanha_id = $1
     GROUP BY status`,
    [campanhaId]
  );

  const porStatus = Object.fromEntries(rows.map((r) => [r.status, r.total]));
  return {
    ok: true,
    campanha,
    porStatus,
    emAndamento: LOTES_EM_ANDAMENTO.has(Number(campanhaId)),
  };
}

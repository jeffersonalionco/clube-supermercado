import { getPool } from "../../db.js";
import { buscarAdminAtivoPorUsuario } from "../painelAdminService.js";

export const AUSENCIA_ATENDIMENTO_MIN = 30;

export function nomeExibicaoAtendente(nome, usuario) {
  const limpo = String(nome || usuario || "Atendimento")
    .replace(/[\r\n*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return limpo || "Atendimento";
}

export function textoMensagemAtendente(nome, corpo) {
  return `*${nome}*\n\n${corpo}`;
}

export function textoInicioAtendimento(nome) {
  return (
    `💬 *Atendimento iniciado*\n\n` +
    `*${nome}*\n` +
    `iniciou seu atendimento pela empresa.`
  );
}

export function textoFimAtendimento(nome) {
  return (
    `✅ *Atendimento encerrado*\n\n` +
    `*${nome}*\n` +
    `finalizou seu atendimento.\n\n` +
    `*Superama* agradece seu contato.`
  );
}

export function atendimentoVigente(ultimaEquipeEm, agora = Date.now()) {
  const marco = new Date(ultimaEquipeEm).getTime();
  if (!Number.isFinite(marco)) return false;
  return agora - marco < AUSENCIA_ATENDIMENTO_MIN * 60 * 1000;
}

async function nomeDoAdmin(usuario) {
  const login = String(usuario || "").trim();
  const admin = await buscarAdminAtivoPorUsuario(login);
  return nomeExibicaoAtendente(admin?.nome, login);
}

function resumir(row, adminUsuario) {
  if (!row) return null;
  const expira = new Date(row.ultima_equipe_em).getTime() + AUSENCIA_ATENDIMENTO_MIN * 60 * 1000;
  return {
    nome: row.admin_nome,
    usuario: row.admin_usuario,
    meu: row.admin_usuario === String(adminUsuario || "").trim().toLowerCase(),
    iniciadoEm: row.iniciado_em,
    expiraEm: new Date(expira).toISOString(),
  };
}

async function lerVigente(telefone) {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT telefone, admin_usuario, admin_nome, iniciado_em, ultima_equipe_em
     FROM whatsapp_atendimento
     WHERE telefone = $1`,
    [telefone]
  );
  const row = rows[0];
  if (!row) return null;
  if (!atendimentoVigente(row.ultima_equipe_em)) {
    await db.query(`DELETE FROM whatsapp_atendimento WHERE telefone = $1`, [telefone]);
    return null;
  }
  return row;
}

export async function atendimentoBloqueiaAuto(telefone) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel) return false;
  const row = await lerVigente(tel);
  return Boolean(row);
}

export async function resumirAtendimento(telefone, adminUsuario) {
  const tel = String(telefone || "").replace(/\D/g, "");
  if (!tel) return null;
  return resumir(await lerVigente(tel), adminUsuario);
}

export async function iniciarAtendimento({ telefone, adminUsuario }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const login = String(adminUsuario || "").trim().toLowerCase();
  if (!tel || tel.length < 12 || !login) {
    return { ok: false, error: "Não foi possível iniciar o atendimento." };
  }
  const nome = await nomeDoAdmin(login);
  const db = getPool();
  const { rows } = await db.query(
    `INSERT INTO whatsapp_atendimento
       (telefone, admin_usuario, admin_nome, iniciado_em, ultima_equipe_em)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (telefone) DO UPDATE
       SET admin_usuario = EXCLUDED.admin_usuario,
           admin_nome = EXCLUDED.admin_nome,
           iniciado_em = NOW(),
           ultima_equipe_em = NOW()
     WHERE whatsapp_atendimento.admin_usuario = EXCLUDED.admin_usuario
        OR whatsapp_atendimento.ultima_equipe_em < NOW() - INTERVAL '30 minutes'
     RETURNING telefone, admin_usuario, admin_nome, iniciado_em, ultima_equipe_em`,
    [tel, login, nome]
  );
  if (!rows[0]) {
    const atual = await resumirAtendimento(tel, login);
    return {
      ok: false,
      codigo: "ocupado",
      error: atual?.nome
        ? `Atendido por: ${atual.nome}`
        : "Esta conversa já está em atendimento.",
      atendimento: atual,
    };
  }
  const aviso = await avisarCliente(tel, textoInicioAtendimento(rows[0].admin_nome));
  return {
    ok: true,
    atendimento: resumir(rows[0], login),
    mensagem: aviso.mensagem || null,
    aviso: aviso.aviso || null,
  };
}

export async function finalizarAtendimento({ telefone, adminUsuario }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const login = String(adminUsuario || "").trim().toLowerCase();
  const atual = await lerVigente(tel);
  if (!atual) return { ok: true, atendimento: null };
  if (atual.admin_usuario !== login) {
    return {
      ok: false,
      codigo: "ocupado",
      error: `Atendido por: ${atual.admin_nome}`,
      atendimento: resumir(atual, login),
    };
  }
  const aviso = await avisarCliente(tel, textoFimAtendimento(atual.admin_nome));
  await getPool().query(`DELETE FROM whatsapp_atendimento WHERE telefone = $1`, [tel]);
  return {
    ok: true,
    atendimento: null,
    mensagem: aviso.mensagem || null,
    aviso: aviso.aviso || null,
  };
}

async function avisarCliente(telefone, texto) {
  try {
    const { consultarJanelaWhatsapp } = await import("./whatsappConversaService.js");
    const janela = await consultarJanelaWhatsapp(telefone);
    if (!janela.aberta) {
      return {
        aviso:
          "A janela de 24 horas fechou. O aviso automático não foi enviado ao cliente.",
      };
    }
    const { enviarMensagemTextoWhatsapp } = await import("./whatsappCloudService.js");
    const envio = await enviarMensagemTextoWhatsapp({
      telefone,
      texto,
      origem: "atendimento",
    });
    if (!envio.ok) {
      console.warn("[whatsapp/atendimento] aviso:", envio.error);
      return { aviso: "O atendimento foi atualizado, mas o aviso automático não saiu." };
    }
    const { rows } = await getPool().query(
      `SELECT id, direcao, origem, tipo, texto, detalhe, criado_em
       FROM whatsapp_mensagem
       WHERE wamid = $1
       LIMIT 1`,
      [envio.messageId]
    );
    if (!rows[0]) return {};
    const { mapearMensagem } = await import("./whatsappConversaService.js");
    return { mensagem: mapearMensagem(rows[0]) };
  } catch (err) {
    console.warn("[whatsapp/atendimento] aviso:", err.message);
    return { aviso: "O atendimento foi atualizado, mas o aviso automático não saiu." };
  }
}

export async function exigirAtendimento({ telefone, adminUsuario }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const login = String(adminUsuario || "").trim().toLowerCase();
  const atual = await lerVigente(tel);
  if (!atual || atual.admin_usuario !== login) {
    return {
      ok: false,
      codigo: "sem_atendimento",
      error: atual
        ? `Atendido por: ${atual.admin_nome}`
        : "Inicie o atendimento para responder.",
      atendimento: atual ? resumir(atual, login) : null,
    };
  }
  return { ok: true, atendimento: resumir(atual, login), nome: atual.admin_nome };
}

export async function renovarAtendimento({ telefone, adminUsuario }) {
  const tel = String(telefone || "").replace(/\D/g, "");
  const login = String(adminUsuario || "").trim().toLowerCase();
  const atual = await lerVigente(tel);
  if (!atual || atual.admin_usuario !== login) {
    return { ok: false, codigo: "sem_atendimento", error: "Inicie o atendimento para responder." };
  }
  const { rows } = await getPool().query(
    `UPDATE whatsapp_atendimento
     SET ultima_equipe_em = NOW()
     WHERE telefone = $1 AND admin_usuario = $2
     RETURNING telefone, admin_usuario, admin_nome, iniciado_em, ultima_equipe_em`,
    [tel, login]
  );
  return { ok: true, atendimento: resumir(rows[0], login), nome: rows[0]?.admin_nome };
}

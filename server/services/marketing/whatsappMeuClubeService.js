import { getPool } from "../../db.js";
import {
  nivelFidelidadeFallback,
  obterNivelFidelidadeCliente,
} from "../nivelFidelidadeService.js";
import { obterSaldoPontos } from "../pontosService.js";
import { programaPontosAtivo } from "../programaConfigService.js";
import {
  buscarMembroClubePorTelefoneWa,
  mascararCpfParcial,
} from "../usuarioService.js";
import { buscarVendasCliente } from "../vendasService.js";
import { periodoUltimosDias } from "../../utils/periodoVendas.js";
import {
  enviarIndicadorDigitandoWhatsapp,
  enviarMensagemBotoesWhatsapp,
  enviarMensagemCtaUrlWhatsapp,
  enviarMensagemTextoWhatsapp,
} from "./whatsappCloudService.js";

export const BTN_MEU_CLUBE = "btn_meu_clube";
export const BTN_CLUBE_MAIS = "btn_clube_mais";
export const BTN_CLUBE_LIBERAR = "btn_clube_liberar";
export const BTN_CLUBE_COMPRA = "btn_clube_compra";
export const BTN_CLUBE_VOLTAR = "btn_clube_voltar";

export const SESSAO_MEU_CLUBE = "meu_clube";

const AVISO_CUPOM_FISCAL =
  `⚠️ _Consulta informativa do Clube — *não substitui o cupom fiscal*. ` +
  `Podem ocorrer atrasos, diferenças ou erros. Em dúvida, use o cupom da loja._`;

function sessaoTtlMs() {
  const min = Number(process.env.WHATSAPP_MEU_CLUBE_SESSAO_MIN || 20);
  return Math.max(5, min) * 60 * 1000;
}

export async function obterEstadoWa(telefone) {
  const { rows } = await getPool().query(
    `SELECT * FROM whatsapp_auto_reply_estado WHERE telefone = $1`,
    [telefone]
  );
  return rows[0] || null;
}

export async function garantirEstadoWa(telefone) {
  await getPool().query(
    `INSERT INTO whatsapp_auto_reply_estado (telefone, atualizado_em)
     VALUES ($1, NOW())
     ON CONFLICT (telefone) DO NOTHING`,
    [telefone]
  );
  return obterEstadoWa(telefone);
}

export function sessaoMeuClubeAtiva(estado) {
  if (!estado || estado.sessao_modo !== SESSAO_MEU_CLUBE) return false;
  if (!estado.sessao_atividade_em) return false;
  const elapsed = Date.now() - new Date(estado.sessao_atividade_em).getTime();
  return elapsed < sessaoTtlMs();
}

export async function iniciarSessaoMeuClube(telefone, usuarioId) {
  await garantirEstadoWa(telefone);
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = $2,
         sessao_atividade_em = NOW(),
         sessao_usuario_id = $3,
         atualizado_em = NOW()
     WHERE telefone = $1`,
    [telefone, SESSAO_MEU_CLUBE, usuarioId || null]
  );
}

export async function tocarSessaoMeuClube(telefone) {
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_atividade_em = NOW(),
         atualizado_em = NOW()
     WHERE telefone = $1 AND sessao_modo = $2`,
    [telefone, SESSAO_MEU_CLUBE]
  );
}

export async function limparSessaoMeuClube(telefone) {
  await getPool().query(
    `UPDATE whatsapp_auto_reply_estado
     SET sessao_modo = NULL,
         sessao_atividade_em = NULL,
         sessao_usuario_id = NULL,
         atualizado_em = NOW()
     WHERE telefone = $1`,
    [telefone]
  );
}

/** Expira sessão ociosa; retorna se ainda está ativa. */
export async function renovarOuExpirarSessao(telefone) {
  const estado = await garantirEstadoWa(telefone);
  if (!estado?.sessao_modo) return { ativa: false, estado };
  if (sessaoMeuClubeAtiva(estado)) {
    await tocarSessaoMeuClube(telefone);
    return { ativa: true, estado };
  }
  await limparSessaoMeuClube(telefone);
  return { ativa: false, estado: null, expirou: true };
}

function linkPerfilClube(cfg) {
  const base = String(cfg.links.clube || "").replace(/\/$/, "");
  return `${base}/#/perfil`;
}

function montarTextoResumoMembro(membro) {
  const codigo = membro.clienteCodigo
    ? `*${membro.clienteCodigo}*`
    : "_não informado_";

  const basico =
    `👤 *Sua identificação no Clube*\n\n` +
    `• *Nome:* ${membro.nome}\n` +
    `• *CPF:* ${membro.cpfMascarado}\n` +
    `• *Código Clube:* ${codigo}\n\n`;

  if (membro.infoLiberada) {
    return (
      basico +
      `✅ *Acesso ampliado ativo* neste WhatsApp.\n\n` +
      `O que você pode fazer agora:\n` +
      `1️⃣ *Ver benefícios* → nível e pontos\n` +
      `2️⃣ *Última compra* → resumo do último cupom\n` +
      `3️⃣ *Menu principal* → voltar às ofertas\n\n` +
      `${AVISO_CUPOM_FISCAL}\n\n` +
      `_Se ficar 20 min sem usar, voltamos ao menu inicial._`
    );
  }

  return (
    basico +
    `🔒 *Ainda só dados básicos*\n` +
    `(nível e pontos ficam bloqueados até você liberar)\n\n` +
    `*Como liberar (1 vez):*\n` +
    `1️⃣ Toque em *Como liberar*\n` +
    `2️⃣ Entre no site com *o mesmo CPF deste cadastro*\n` +
    `3️⃣ Em *Meu perfil*, ative *Informações no WhatsApp*\n` +
    `4️⃣ Volte aqui e toque em *Já liberei — atualizar*\n\n` +
    `_Importante: use no site o CPF ${membro.cpfMascarado} (este da mensagem)._\n\n` +
    `_Sessão: 20 min sem uso volta ao menu._`
  );
}

export async function enviarPainelMeuClube(telefone, { wamid, cfg, membro } = {}) {
  let m = membro;
  // Sempre consulta fresca (liberação no site precisa refletir na hora)
  if (!m) {
    m = await buscarMembroClubePorTelefoneWa(telefone, { fresh: true });
  } else {
    m =
      (await buscarMembroClubePorTelefoneWa(telefone, { fresh: true })) || m;
  }
  if (!m) {
    return {
      ok: false,
      error: "membro_nao_encontrado",
      skipMetric: true,
    };
  }

  await iniciarSessaoMeuClube(telefone, m.id);

  const botoes = m.infoLiberada
    ? [
        { id: BTN_CLUBE_MAIS, title: "Ver benefícios" },
        { id: BTN_CLUBE_COMPRA, title: "Última compra" },
        { id: BTN_CLUBE_VOLTAR, title: "Menu principal" },
      ]
    : [
        { id: BTN_CLUBE_LIBERAR, title: "Como liberar" },
        { id: BTN_CLUBE_MAIS, title: "Já liberei — atualizar" },
        { id: BTN_CLUBE_VOLTAR, title: "Menu principal" },
      ];

  return enviarMensagemBotoesWhatsapp({
    telefone,
    cabecalho: "MEU CLUBE",
    corpo: montarTextoResumoMembro(m),
    rodape: "Clube Superama+",
    botoes,
  });
}

async function montarTextoMaisInfos(membro) {
  if (!membro.infoLiberada) {
    return (
      `⏳ *Ainda não encontramos a liberação*\n\n` +
      `Confira estes pontos:\n\n` +
      `1. Você entrou no site com o CPF *${membro.cpfMascarado}*?\n` +
      `   (é o CPF desta conversa — nome *${membro.nome}*)\n\n` +
      `2. Em *Meu perfil*, a opção *Informações no WhatsApp* está *ativada*?\n\n` +
      `3. O celular do cadastro é este WhatsApp?\n\n` +
      `Depois de ativar, toque de novo em *Já liberei — atualizar*.\n\n` +
      `Se precisar, use *Como liberar* para abrir o perfil.`
    );
  }

  const linhas = [
    `🎉 *Pronto, ${membro.primeiroNome}!*`,
    `Acesso ampliado confirmado neste WhatsApp.`,
    "",
    `📋 *Seus benefícios*`,
    "",
  ];

  try {
    const clube = await obterNivelFidelidadeCliente(membro.cpf, {
      usuario: {
        id: membro.id,
        cpf: membro.cpf,
        nome: membro.nome,
        cliente_codigo: membro.clienteCodigo,
      },
    });
    linhas.push(`🏅 *Nível:* ${clube?.nivel || "Bronze"}`);
    if (clube?.nivelDescricao) linhas.push(`_${clube.nivelDescricao}_`);
    if (clube?.gastoAno != null) {
      const g = Number(clube.gastoAno);
      if (Number.isFinite(g)) {
        linhas.push(
          `Compras no ano: *${g.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}*`
        );
      }
    }
  } catch {
    const fb = nivelFidelidadeFallback({
      cpf: membro.cpf,
      nome: membro.nome,
    });
    linhas.push(`🏅 *Nível:* ${fb.nivel}`);
  }

  try {
    const pontosOn = await programaPontosAtivo();
    if (pontosOn) {
      const saldo = await obterSaldoPontos(membro.cpf);
      const pts = Number(saldo?.saldo ?? saldo?.pontos ?? 0) || 0;
      linhas.push("", `⭐ *Pontos:* ${pts.toLocaleString("pt-BR")}`);
    }
  } catch {
    /* pontos opcional */
  }

  linhas.push(
    "",
    `No caixa, use o CPF *${membro.cpfMascarado}*.`,
    "",
    AVISO_CUPOM_FISCAL,
    "",
    `Escolha abaixo: *Atualizar*, *Última compra* ou *Menu principal*.`
  );
  return linhas.join("\n");
}

function moedaBr(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ —";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function labelDataCompra(dataStr) {
  const match = String(dataStr || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return dataStr || "—";
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  try {
    const raw = date.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return raw.replace(/^\p{L}/u, (c) => c.toUpperCase());
  } catch {
    return dataStr;
  }
}

function ordenarVendasDesc(a, b) {
  const pa = String(a.data || "").split("/").reverse().join("");
  const pb = String(b.data || "").split("/").reverse().join("");
  if (pb !== pa) return pb.localeCompare(pa);
  return String(b.numeroDcto || "").localeCompare(String(a.numeroDcto || ""));
}

/**
 * Monta texto bonito da última compra (WRPDV) para WhatsApp.
 */
async function montarTextoUltimaCompra(membro) {
  const { dataini, datafim } = periodoUltimosDias(60);
  let resultado;
  try {
    resultado = await buscarVendasCliente(membro.cpf, dataini, datafim);
  } catch (err) {
    console.warn("[whatsapp/meu-clube] vendas:", err.message);
    return (
      `🛒 *Última compra*\n\n` +
      `Não consegui consultar as compras agora. Tente de novo em instantes.\n\n` +
      AVISO_CUPOM_FISCAL
    );
  }

  if (!resultado?.ok) {
    return (
      `🛒 *Última compra*\n\n` +
      `Não encontrei compras recentes para consultar.\n\n` +
      AVISO_CUPOM_FISCAL
    );
  }

  const itens = (resultado.itens || [])
    .filter((v) => !v.cancelada && !v.cancelado)
    .sort(ordenarVendasDesc);

  const venda = itens[0];
  if (!venda) {
    return (
      `🛒 *Última compra*\n\n` +
      `Não há compras registradas nos últimos 60 dias neste CPF.\n\n` +
      AVISO_CUPOM_FISCAL
    );
  }

  const produtos = Array.isArray(venda.produtos) ? venda.produtos : [];
  const total =
    Number(venda.totalLiquido ?? venda.valorTotalCupom ?? 0) ||
    produtos.reduce(
      (acc, p) => acc + (Number(p.valorLiquido ?? p.valorTotal ?? 0) || 0),
      0
    );

  const top = [...produtos]
    .map((p) => ({
      nome: String(p.descricao || `Item ${p.codigoProduto || ""}`)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 42),
      qtd: Number(p.quantidadeUnitaria ?? p.quantidade) || 0,
      valor: Number(p.valorLiquido ?? p.valorTotal) || 0,
      oferta: p.oferta === "SIM" || p.oferta === true,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  const linhas = [
    `🛒 *Última compra no Superama*`,
    "",
    `📅 ${labelDataCompra(venda.data)}`,
    `🧾 Cupom *${venda.numeroDcto || "—"}*${venda.pdv ? ` · PDV ${venda.pdv}` : ""}`,
    `💰 Total *${moedaBr(total)}*`,
    `🛍 *${produtos.length || "—"}* ite${produtos.length === 1 ? "m" : "ns"}`,
  ];

  if (venda.formaPagamento) {
    linhas.push(`💳 ${venda.formaPagamento}`);
  } else if (Array.isArray(venda.formasPagamento) && venda.formasPagamento.length) {
    linhas.push(`💳 ${venda.formasPagamento.map((f) => f.descricao || f).join(", ")}`);
  }

  if (top.length) {
    linhas.push("", `*Destaques do cupom:*`);
    for (const p of top) {
      const qtd = p.qtd > 0 ? `${String(p.qtd).replace(".", ",")}× ` : "";
      const oferta = p.oferta ? " 🏷" : "";
      linhas.push(`• ${qtd}*${p.nome}*${oferta} — ${moedaBr(p.valor)}`);
    }
    if (produtos.length > top.length) {
      linhas.push(`_…e mais ${produtos.length - top.length} item(ns)_`);
    }
  }

  linhas.push("", AVISO_CUPOM_FISCAL);
  return linhas.join("\n");
}

export async function responderMeuClubeBotao(
  telefone,
  buttonId,
  { wamid, cfg } = {}
) {
  const membro = await buscarMembroClubePorTelefoneWa(telefone, {
    fresh: true,
  });

  if (buttonId === BTN_MEU_CLUBE) {
    if (!membro) {
      // Segurança: sem cadastro → site
      return enviarMensagemCtaUrlWhatsapp({
        telefone,
        corpo:
          "Não encontramos este WhatsApp no cadastro do Clube.\n" +
          "Abra o site para entrar ou atualizar seu celular.",
        url: cfg.links.clube,
        displayText: "Abrir o Clube",
      }).then(async (cta) => {
        if (cta.ok) return cta;
        return enviarMensagemTextoWhatsapp({
          telefone,
          texto: `Acesse o Clube Superama+:\n${cfg.links.clube}`,
        });
      });
    }
    return enviarPainelMeuClube(telefone, { wamid, cfg, membro });
  }

  const sess = await renovarOuExpirarSessao(telefone);
  if (!sess.ativa && buttonId !== BTN_MEU_CLUBE) {
    if (
      buttonId === BTN_CLUBE_MAIS ||
      buttonId === BTN_CLUBE_LIBERAR ||
      buttonId === BTN_CLUBE_COMPRA ||
      buttonId === BTN_CLUBE_VOLTAR
    ) {
      await limparSessaoMeuClube(telefone);
      return {
        ok: true,
        expired: true,
        skipMetric: true,
        messageId: null,
        _reabrirMenu: true,
      };
    }
  }

  if (buttonId === BTN_CLUBE_VOLTAR) {
    await limparSessaoMeuClube(telefone);
    return { ok: true, voltarMenu: true, skipMetric: false };
  }

  // Sempre reconsulta (pode ter liberado no site agora)
  const membroFresh =
    (await buscarMembroClubePorTelefoneWa(telefone, { fresh: true })) ||
    membro;

  if (!membroFresh) {
    await limparSessaoMeuClube(telefone);
    return { ok: true, voltarMenu: true, skipMetric: true };
  }

  await tocarSessaoMeuClube(telefone);

  if (buttonId === BTN_CLUBE_LIBERAR) {
    const url = linkPerfilClube(cfg);
    const cta = await enviarMensagemCtaUrlWhatsapp({
      telefone,
      corpo:
        `*Passo a passo*\n\n` +
        `1. Toque em *Abrir meu perfil*\n` +
        `2. Entre com o CPF *${membroFresh.cpfMascarado}*\n` +
        `   (cadastro: *${membroFresh.nome}*)\n` +
        `3. Ative *Informações no WhatsApp*\n` +
        `4. Volte e toque em *Já liberei — atualizar*`,
      url,
      displayText: "Abrir meu perfil",
    });
    if (cta.ok) return { ...cta, keepSession: true };
    return {
      ...(await enviarMensagemTextoWhatsapp({
        telefone,
        texto:
          `Abra o perfil no Clube (login com CPF ${membroFresh.cpfMascarado}):\n${url}`,
      })),
      keepSession: true,
    };
  }

  if (buttonId === BTN_CLUBE_MAIS) {
    // Consulta de nível/pontos pode demorar — avisa na hora
    if (membroFresh.infoLiberada) {
      await enviarMensagemTextoWhatsapp({
        telefone,
        texto:
          `⏳ Aguarde um instante…\n` +
          `Estou buscando suas informações do Clube.`,
      });
      if (wamid) {
        try {
          await enviarIndicadorDigitandoWhatsapp({ messageId: wamid });
        } catch {
          /* ignore */
        }
      }
    }

    const texto = await montarTextoMaisInfos(membroFresh);
    const botoes = membroFresh.infoLiberada
      ? [
          { id: BTN_CLUBE_COMPRA, title: "Última compra" },
          { id: BTN_CLUBE_MAIS, title: "Atualizar" },
          { id: BTN_CLUBE_VOLTAR, title: "Menu principal" },
        ]
      : [
          { id: BTN_CLUBE_LIBERAR, title: "Como liberar" },
          { id: BTN_CLUBE_MAIS, title: "Já liberei — atualizar" },
          { id: BTN_CLUBE_VOLTAR, title: "Menu principal" },
        ];

    const r = await enviarMensagemBotoesWhatsapp({
      telefone,
      cabecalho: membroFresh.infoLiberada ? "SEUS BENEFÍCIOS" : "MEU CLUBE",
      corpo: texto,
      rodape: "Clube Superama+",
      botoes,
    });
    return { ...r, keepSession: true };
  }

  if (buttonId === BTN_CLUBE_COMPRA) {
    if (!membroFresh.infoLiberada) {
      return enviarPainelMeuClube(telefone, {
        wamid,
        cfg,
        membro: membroFresh,
      });
    }

    await enviarMensagemTextoWhatsapp({
      telefone,
      texto:
        `⏳ Aguarde um instante…\n` +
        `Estou buscando sua última compra.`,
    });
    if (wamid) {
      try {
        await enviarIndicadorDigitandoWhatsapp({ messageId: wamid });
      } catch {
        /* ignore */
      }
    }

    const texto = await montarTextoUltimaCompra(membroFresh);
    const r = await enviarMensagemBotoesWhatsapp({
      telefone,
      cabecalho: "ÚLTIMA COMPRA",
      corpo: texto,
      rodape: "Clube Superama+",
      botoes: [
        { id: BTN_CLUBE_MAIS, title: "Ver benefícios" },
        { id: BTN_CLUBE_COMPRA, title: "Atualizar compra" },
        { id: BTN_CLUBE_VOLTAR, title: "Menu principal" },
      ],
    });
    return { ...r, keepSession: true };
  }

  return { ok: false, error: "botao_desconhecido" };
}

export function isBotaoMeuClube(buttonId) {
  return (
    buttonId === BTN_MEU_CLUBE ||
    buttonId === BTN_CLUBE_MAIS ||
    buttonId === BTN_CLUBE_LIBERAR ||
    buttonId === BTN_CLUBE_COMPRA ||
    buttonId === BTN_CLUBE_VOLTAR
  );
}

export function acaoMetricaMeuClube(buttonId) {
  if (buttonId === BTN_MEU_CLUBE) return "meu_clube";
  if (buttonId === BTN_CLUBE_MAIS) return "clube_mais";
  if (buttonId === BTN_CLUBE_LIBERAR) return "clube_liberar";
  if (buttonId === BTN_CLUBE_COMPRA) return "clube_compra";
  if (buttonId === BTN_CLUBE_VOLTAR) return "clube_voltar";
  return null;
}

// re-export mask helper if needed
export { mascararCpfParcial };

import { randomInt } from "crypto";
import { getPool } from "../db.js";
import { dadosLojaComprovante } from "../config/loja.js";
import { normalizarCpfCnpj } from "./apiClient.js";
import {
  aplicarDebitoFifo,
  sincronizarLotesPontos,
} from "./pontosLotesService.js";
import { obterDataMinimaPontosParaCpf } from "./pontosService.js";
import {
  EVENTOS_CLIENTE,
  registrarEventoCliente,
} from "./clienteAuditoriaService.js";

const DIGITOS_CODIGO = Math.min(
  10,
  Math.max(6, Number(process.env.RESGATE_CODIGO_DIGITOS || 8))
);

function formatarCpfExibicao(cpf) {
  const d = String(cpf || "").replace(/\D/g, "");
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return cpf;
}

function formatarDataHoraBr(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

async function ensurePontosConta(client, cpf) {
  await client.query(
    `INSERT INTO pontos_conta (cpf) VALUES ($1) ON CONFLICT (cpf) DO NOTHING`,
    [cpf]
  );
}

async function gerarCodigoUnico(client) {
  for (let tentativa = 0; tentativa < 30; tentativa += 1) {
    const max = 10 ** DIGITOS_CODIGO;
    const codigo = String(randomInt(0, max)).padStart(DIGITOS_CODIGO, "0");

    const { rows } = await client.query(
      `SELECT 1 FROM resgate_comprovante WHERE codigo = $1`,
      [codigo]
    );
    if (!rows.length) return codigo;
  }
  throw new Error("Não foi possível gerar o código de resgate. Tente novamente.");
}

function mapComprovante(row, itens = []) {
  return {
    id: row.id,
    codigo: row.codigo,
    cpf: row.cpf,
    clienteNome: row.cliente_nome,
    pontosTotal: row.pontos_total,
    saldoAntes: row.saldo_antes,
    saldoDepois: row.saldo_depois,
    observacao: row.observacao,
    adminUsuario: row.admin_usuario,
    assinaturaConfirmadaEm: row.assinatura_confirmada_em,
    assinaturaAdminUsuario: row.assinatura_admin_usuario,
    assinaturaObservacao: row.assinatura_observacao,
    criadoEm: row.criado_em,
    itens,
  };
}

/** Aceita lista com repetições ou itens com quantidade. Retorna IDs expandidos (um por unidade). */
export function expandirPedidoResgate(pedido) {
  if (Array.isArray(pedido)) {
    return pedido.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id >= 1);
  }

  if (pedido && Array.isArray(pedido.itens)) {
    const ids = [];
    for (const item of pedido.itens) {
      const id = Number(item?.brindeId ?? item?.id);
      const qtd = Number(item?.quantidade) || 0;
      if (!Number.isInteger(id) || id < 1 || qtd < 1) continue;
      for (let i = 0; i < qtd; i += 1) ids.push(id);
    }
    return ids;
  }

  return [];
}

function agruparPorBrinde(ids) {
  const map = new Map();
  for (const id of ids) {
    map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}

function agruparItensComprovante(itens) {
  const map = new Map();
  for (const item of itens) {
    const key = item.brindeId ?? item.brindeNome;
    const atual = map.get(key);
    if (atual) {
      atual.quantidade += 1;
      atual.pontos += Number(item.pontos) || 0;
    } else {
      map.set(key, {
        brindeNome: item.brindeNome,
        pontos: Number(item.pontos) || 0,
        quantidade: 1,
      });
    }
  }
  return [...map.values()];
}

export async function registrarResgateComProvante(
  cpf,
  pedidoResgate,
  { observacao, adminUsuario, clienteNome }
) {
  const cpfNorm = normalizarCpfCnpj(cpf);
  const idsFlat = expandirPedidoResgate(pedidoResgate);

  if (!idsFlat.length) {
    throw new Error("Selecione ao menos um brinde para resgate");
  }

  const agrupado = agruparPorBrinde(idsFlat);

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await ensurePontosConta(client, cpfNorm);

    await client.query(`SELECT cpf FROM pontos_conta WHERE cpf = $1 FOR UPDATE`, [cpfNorm]);

    const dataMinima = await obterDataMinimaPontosParaCpf(cpfNorm);
    const { saldo: saldoInicial, valorPendente } = await sincronizarLotesPontos(
      client,
      cpfNorm,
      { dataMinima }
    );

    const brindesPorId = new Map();
    let pontosTotal = 0;

    for (const [id, quantidade] of agrupado) {
      const { rows } = await client.query(
        `SELECT id, nome, imagem_url, pontos, estoque, ativo
         FROM brindes WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const brinde = rows[0];
      if (!brinde) throw new Error(`Brinde #${id} não encontrado`);
      if (!brinde.ativo) throw new Error(`Brinde indisponível: ${brinde.nome}`);

      const estoque = Number(brinde.estoque) || 0;
      if (estoque < quantidade) {
        throw new Error(
          `Estoque insuficiente para "${brinde.nome}". Disponível: ${estoque} unidade${estoque === 1 ? "" : "s"}.`
        );
      }

      brindesPorId.set(id, { brinde, quantidade });
      pontosTotal += (Number(brinde.pontos) || 0) * quantidade;
    }

    if (saldoInicial < pontosTotal) {
      throw new Error(
        `Saldo insuficiente. O cliente possui ${saldoInicial} ponto${saldoInicial === 1 ? "" : "s"} e o resgate exige ${pontosTotal}.`
      );
    }

    const codigo = await gerarCodigoUnico(client);
    const obsGeral = String(observacao || "").trim();

    const { rows: compRows } = await client.query(
      `INSERT INTO resgate_comprovante (
         codigo, cpf, cliente_nome, pontos_total, saldo_antes, saldo_depois,
         observacao, admin_usuario
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        codigo,
        cpfNorm,
        clienteNome || null,
        pontosTotal,
        saldoInicial,
        saldoInicial - pontosTotal,
        obsGeral || null,
        adminUsuario,
      ]
    );

    const comprovante = compRows[0];
    const itensResgate = [];
    let saldoCorrente = saldoInicial;

    for (const { brinde, quantidade } of brindesPorId.values()) {
      const pontosUnit = Number(brinde.pontos) || 0;
      const estoqueAntes = Number(brinde.estoque);
      const estoqueDepois = estoqueAntes - quantidade;

      await client.query(`UPDATE brindes SET estoque = $2, atualizado_em = NOW() WHERE id = $1`, [
        brinde.id,
        estoqueDepois,
      ]);

      await client.query(
        `INSERT INTO brindes_estoque_movimento (
           brinde_id, operacao, quantidade, estoque_antes, estoque_depois, observacao, admin_usuario
         )
         VALUES ($1, 'saida', $2, $3, $4, $5, $6)`,
        [
          brinde.id,
          quantidade,
          estoqueAntes,
          estoqueDepois,
          `Resgate clube — CPF ${cpfNorm} — código ${codigo}`,
          adminUsuario,
        ]
      );

      for (let unidade = 0; unidade < quantidade; unidade += 1) {
        const obsItem =
          obsGeral ||
          `Resgate: ${brinde.nome}${quantidade > 1 ? ` (${unidade + 1}/${quantidade})` : ""} (cód. ${codigo})`;

        const { rows: baixaRows } = await client.query(
          `INSERT INTO pontos_baixa (
             cpf, pontos, saldo_antes, saldo_depois, observacao, admin_usuario,
             brinde_id, brinde_nome, brinde_imagem_url, tipo, comprovante_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'resgate', $10)
           RETURNING id, criado_em`,
          [
            cpfNorm,
            pontosUnit,
            saldoCorrente,
            saldoCorrente - pontosUnit,
            obsItem,
            adminUsuario,
            brinde.id,
            brinde.nome,
            brinde.imagem_url,
            comprovante.id,
          ]
        );

        const saldoDepois = await aplicarDebitoFifo(
          client,
          cpfNorm,
          pontosUnit,
          baixaRows[0].id
        );

        await client.query(`UPDATE pontos_baixa SET saldo_depois = $2 WHERE id = $1`, [
          baixaRows[0].id,
          saldoDepois,
        ]);

        saldoCorrente = saldoDepois;

        itensResgate.push({
          baixaId: baixaRows[0].id,
          brindeId: brinde.id,
          brindeNome: brinde.nome,
          pontos: pontosUnit,
          criadoEm: baixaRows[0].criado_em,
        });
      }
    }

    await client.query(
      `UPDATE resgate_comprovante SET saldo_depois = $2 WHERE id = $1`,
      [comprovante.id, saldoCorrente]
    );

    await client.query(
      `UPDATE pontos_conta
       SET saldo_pontos = $2, valor_pendente = $3, atualizado_em = NOW()
       WHERE cpf = $1`,
      [cpfNorm, saldoCorrente, valorPendente]
    );

    await client.query("COMMIT");

    const resultado = mapComprovante(
      { ...comprovante, saldo_depois: saldoCorrente },
      itensResgate
    );

    await registrarEventoCliente({
      cpf: cpfNorm,
      evento: EVENTOS_CLIENTE.RESGATE_COMPROVANTE,
      sucesso: true,
      detalhes: {
        codigo,
        pontosTotal,
        brindes: itensResgate.map((i) => i.brindeNome),
        adminUsuario,
      },
    });

    return resultado;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function obterComprovantePorCodigo(codigo) {
  const cod = String(codigo || "").trim();
  if (!cod) return null;

  const { rows } = await getPool().query(
    `SELECT * FROM resgate_comprovante WHERE codigo = $1`,
    [cod]
  );

  if (!rows[0]) return null;

  const { rows: itens } = await getPool().query(
    `SELECT id, pontos, brinde_id, brinde_nome, criado_em
     FROM pontos_baixa
     WHERE comprovante_id = $1
     ORDER BY id ASC`,
    [rows[0].id]
  );

  return mapComprovante(
    rows[0],
    itens.map((row) => ({
      baixaId: row.id,
      brindeId: row.brinde_id,
      brindeNome: row.brinde_nome,
      pontos: row.pontos,
      criadoEm: row.criado_em,
    }))
  );
}

export async function listarComprovantesCliente(cpf, limite = 20) {
  const cpfNorm = normalizarCpfCnpj(cpf);
  const { rows } = await getPool().query(
    `SELECT *
     FROM resgate_comprovante
     WHERE cpf = $1
     ORDER BY criado_em DESC
     LIMIT $2`,
    [cpfNorm, limite]
  );

  const resultados = [];
  for (const row of rows) {
    const { rows: itens } = await getPool().query(
      `SELECT id, pontos, brinde_id, brinde_nome, criado_em
       FROM pontos_baixa WHERE comprovante_id = $1 ORDER BY id ASC`,
      [row.id]
    );
    resultados.push(
      mapComprovante(
        row,
        itens.map((item) => ({
          baixaId: item.id,
          brindeId: item.brinde_id,
          brindeNome: item.brinde_nome,
          pontos: item.pontos,
          criadoEm: item.criado_em,
        }))
      )
    );
  }
  return resultados;
}

export async function confirmarAssinaturaComprovante(
  codigo,
  { adminUsuario, observacao }
) {
  const comp = await obterComprovantePorCodigo(codigo);
  if (!comp) throw new Error("Comprovante não encontrado");
  if (comp.assinaturaConfirmadaEm) {
    throw new Error("Assinatura já confirmada para este comprovante");
  }

  const { rows } = await getPool().query(
    `UPDATE resgate_comprovante
     SET assinatura_confirmada_em = NOW(),
         assinatura_admin_usuario = $2,
         assinatura_observacao = $3
     WHERE codigo = $1
     RETURNING *`,
    [codigo, adminUsuario, String(observacao || "").trim() || null]
  );

  await registrarEventoCliente({
    cpf: comp.cpf,
    evento: EVENTOS_CLIENTE.RESGATE_ASSINATURA,
    sucesso: true,
    detalhes: { codigo, adminUsuario },
  });

  return mapComprovante(rows[0], comp.itens);
}

export function gerarHtmlComprovante(comprovante) {
  const loja = dadosLojaComprovante();
  const enderecoLoja = [loja.endereco, loja.cidade, loja.uf].filter(Boolean).join(" — ");
  const itensAgrupados = agruparItensComprovante(comprovante.itens || []);
  const itensHtml = itensAgrupados
    .map(
      (item) =>
        `<tr>
          <td>${escapeHtml(item.brindeNome || "Brinde")}${item.quantidade > 1 ? ` <span style="color:#666">(×${item.quantidade})</span>` : ""}</td>
          <td style="text-align:center">${item.pontos}</td>
        </tr>`
    )
    .join("");

  const assinado = comprovante.assinaturaConfirmadaEm
    ? `<p class="ok">Assinatura confirmada em ${formatarDataHoraBr(comprovante.assinaturaConfirmadaEm)} por ${escapeHtml(comprovante.assinaturaAdminUsuario || "admin")}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Comprovante de resgate ${escapeHtml(comprovante.codigo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 13px; line-height: 1.45; }
    .wrap { max-width: 720px; margin: 0 auto; border: 2px solid #1a6b4f; padding: 20px 22px; }
    h1 { margin: 0 0 4px; font-size: 18px; color: #1a6b4f; text-transform: uppercase; letter-spacing: 0.04em; }
    .sub { margin: 0 0 16px; color: #555; font-size: 12px; }
    .codigo { text-align: center; margin: 16px 0 20px; padding: 12px; background: #f4faf7; border: 1px dashed #1a6b4f; }
    .codigo strong { display: block; font-size: 28px; letter-spacing: 0.22em; color: #145a38; }
    .codigo span { font-size: 11px; color: #666; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 16px; }
    .grid dt { font-size: 10px; text-transform: uppercase; color: #666; margin: 0 0 2px; }
    .grid dd { margin: 0; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; }
    th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; }
    th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; }
    .assinatura { margin-top: 28px; padding-top: 12px; border-top: 1px solid #ccc; }
    .linha-ass { margin-top: 36px; border-bottom: 1px solid #111; height: 1px; }
    .assinatura p { margin: 6px 0 0; font-size: 11px; color: #444; }
    .rodape { margin-top: 20px; font-size: 10px; color: #666; text-align: center; }
    .ok { color: #1a6b4f; font-weight: 600; font-size: 12px; }
    @media print {
      body { padding: 0; }
      .wrap { border-width: 1px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(loja.nomeFantasia)}</h1>
    <p class="sub">${escapeHtml(loja.razaoSocial)} · CNPJ ${escapeHtml(loja.cnpj)}${enderecoLoja ? ` · ${escapeHtml(enderecoLoja)}` : ""}${loja.telefone ? ` · Tel. ${escapeHtml(loja.telefone)}` : ""}</p>

    <h2 style="margin:0 0 8px;font-size:15px;">Comprovante de resgate de prêmios</h2>

    <div class="codigo">
      <span>Código do resgate</span>
      <strong>${escapeHtml(comprovante.codigo)}</strong>
    </div>

    <dl class="grid">
      <div><dt>Cliente</dt><dd>${escapeHtml(comprovante.clienteNome || "—")}</dd></div>
      <div><dt>CPF</dt><dd>${escapeHtml(formatarCpfExibicao(comprovante.cpf))}</dd></div>
      <div><dt>Data / hora</dt><dd>${formatarDataHoraBr(comprovante.criadoEm)}</dd></div>
      <div><dt>Atendente</dt><dd>${escapeHtml(comprovante.adminUsuario || "—")}</dd></div>
      <div><dt>Saldo antes</dt><dd>${comprovante.saldoAntes} pts</dd></div>
      <div><dt>Saldo depois</dt><dd>${comprovante.saldoDepois} pts</dd></div>
    </dl>

    <table>
      <thead>
        <tr><th>Prêmio resgatado</th><th style="width:90px;text-align:center">Pontos</th></tr>
      </thead>
      <tbody>
        ${itensHtml}
        <tr>
          <td style="text-align:right;font-weight:700">Total debitado</td>
          <td style="text-align:center;font-weight:700">${comprovante.pontosTotal}</td>
        </tr>
      </tbody>
    </table>

    ${comprovante.observacao ? `<p><strong>Observação:</strong> ${escapeHtml(comprovante.observacao)}</p>` : ""}

    <div class="assinatura">
      <p>Declaro que recebi o(s) prêmio(s) acima e autorizo o débito dos pontos indicados no meu saldo do clube.</p>
      <div class="linha-ass"></div>
      <p>Assinatura do cliente</p>
      ${assinado}
    </div>

    <p class="rodape">Documento gerado eletronicamente pelo sistema do clube. Guarde este comprovante.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

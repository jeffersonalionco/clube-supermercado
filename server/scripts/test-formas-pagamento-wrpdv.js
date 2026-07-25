/**
 * Panorama de formas de pagamento no WR PDV (tab_venda_MMYY / registro FIN*).
 *
 * Uso:
 *   node scripts/test-formas-pagamento-wrpdv.js [dias] [cpf-opcional]
 *
 * Exemplos:
 *   node scripts/test-formas-pagamento-wrpdv.js
 *   node scripts/test-formas-pagamento-wrpdv.js 15
 *   node scripts/test-formas-pagamento-wrpdv.js 10 12764500955
 */
import "../env.js";
import { getWrpdvPool } from "../db/wrpdv.js";
import { parseFinn } from "../services/wrpdvParser.js";
import { normalizarCpfCnpj } from "../services/apiClient.js";
import {
  formatarDataBR,
  parseDataBR,
  periodoUltimosDias,
} from "../utils/periodoVendas.js";

const dias = Math.min(Math.max(Number(process.argv[2]) || 15, 1), 90);
const cpfFiltro = process.argv[3] ? normalizarCpfCnpj(process.argv[3]) : null;

const { dataini, datafim } = periodoUltimosDias(dias);
const inicio = parseDataBR(dataini);
const fim = parseDataBR(datafim);

if (!inicio || !fim) {
  console.error("Período inválido");
  process.exit(1);
}

function nomeTabelaVenda(date) {
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const ano = String(date.getFullYear()).slice(-2);
  return `tab_venda_${mes}${ano}`;
}

function mesesNoPeriodo(inicioDate, fimDate) {
  const tabelas = [];
  const cursor = new Date(inicioDate.getFullYear(), inicioDate.getMonth(), 1);
  const limite = new Date(fimDate.getFullYear(), fimDate.getMonth(), 1);

  while (cursor <= limite) {
    tabelas.push(nomeTabelaVenda(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return [...new Set(tabelas)];
}

function formatarDataHoraPg(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
}

function inicioProximoDia(date) {
  const prox = new Date(date);
  prox.setDate(prox.getDate() + 1);
  prox.setHours(0, 0, 0, 0);
  return prox;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function tabelaExiste(nome) {
  const { rows } = await getWrpdvPool().query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [nome]
  );
  return rows.length > 0;
}

async function buscarPagamentosTabela(tabela, inicioPg, fimExclusive, cpf) {
  const existe = await tabelaExiste(tabela);
  if (!existe) return [];

  const params = [`${inicioPg} 00:00:00`, `${fimExclusive} 00:00:00`];
  let filtroCpf = "";

  if (cpf) {
    filtroCpf =
      " AND regexp_replace(split_part(tvd_registro, '|', 16), '\\\\D', '', 'g') = $3";
    params.push(cpf);
  }

  const { rows } = await getWrpdvPool().query(
    `SELECT
       tvd_cupom,
       tvd_pdv,
       tvd_unidade,
       tvd_data_hora,
       tvd_tipo_reg,
       tvd_registro
     FROM ${tabela}
     WHERE tvd_tipo_reg LIKE 'FIN%'
       AND tvd_data_hora >= $1::timestamp
       AND tvd_data_hora < $2::timestamp
       ${filtroCpf}
     ORDER BY tvd_data_hora`,
    params
  );

  return rows;
}

async function mapaCancelados(pagamentos) {
  const mapa = new Map();
  const lista = pagamentos.filter((p) => p.tvd_cupom && p.tvd_pdv);
  const CHUNK = 80;

  for (let i = 0; i < lista.length; i += CHUNK) {
    const lote = lista.slice(i, i + CHUNK);
    const params = [];
    const tuplas = lote
      .map((p, idx) => {
        const base = idx * 3;
        params.push(p.tvd_cupom, p.tvd_pdv, p.tvd_unidade || "001");
        return `($${base + 1}, $${base + 2}, $${base + 3})`;
      })
      .join(", ");

    const { rows } = await getWrpdvPool().query(
      `SELECT DISTINCT ON (nfc_coo, nfc_estacao, nfc_unidade)
              nfc_coo, nfc_estacao, nfc_status
       FROM movnfce
       WHERE (nfc_coo, nfc_estacao, nfc_unidade) IN (${tuplas})
       ORDER BY nfc_coo, nfc_estacao, nfc_unidade, nfc_datamvto DESC`,
      params
    );

    for (const row of rows) {
      const chave = `${row.nfc_estacao}-${row.nfc_coo}`;
      const status = String(row.nfc_status ?? "").trim().toUpperCase();
      mapa.set(chave, status !== "" && status !== "A");
    }
  }

  return mapa;
}

function chaveCupom(pdv, cupom) {
  return `${pdv}-${cupom}`;
}

console.log("=== FORMAS DE PAGAMENTO — WR PDV ===");
console.log("Período:", dataini, "→", datafim, `(${dias} dias)`);
console.log(
  "Banco:",
  `${process.env.WRPDV_HOST || "10.1.1.250"}/${process.env.WRPDV_DATABASE || "wrpdv"}`
);
if (cpfFiltro) console.log("Filtro CPF:", cpfFiltro);
console.log("");

const inicioPg = formatarDataHoraPg(inicio);
const fimExclusive = formatarDataHoraPg(inicioProximoDia(fim));
const tabelas = mesesNoPeriodo(inicio, fim);

let brutos = [];
for (const tabela of tabelas) {
  const lote = await buscarPagamentosTabela(
    tabela,
    inicioPg,
    fimExclusive,
    cpfFiltro
  );
  if (lote.length) {
    console.log(`Tabela ${tabela}: ${lote.length} registro(s) FIN*`);
  }
  brutos.push(...lote);
}

console.log("\nTotal registros FIN*:", brutos.length);

if (!brutos.length) {
  console.log("Nenhum pagamento encontrado no período.");
  process.exit(0);
}

const cancelados = await mapaCancelados(brutos);

/** Um cupom pode ter mais de uma linha FIN* (troco, split). Agrupa por cupom+pdv. */
const porCupom = new Map();

for (const row of brutos) {
  const cupom = String(row.tvd_cupom ?? "").trim();
  const pdv = String(row.tvd_pdv ?? "").trim();
  const chave = chaveCupom(pdv, cupom);
  const finn = parseFinn(row.tvd_registro);
  const forma = finn.forma || "(sem descrição)";
  const cancelada = cancelados.get(chave) === true;

  if (!porCupom.has(chave)) {
    porCupom.set(chave, {
      cupom,
      pdv,
      unidade: String(row.tvd_unidade ?? "").trim(),
      dataHora: row.tvd_data_hora,
      cancelada,
      cpf: finn.cpf,
      nomeCliente: finn.nomeCliente,
      formas: [],
      valorTotal: 0,
      tiposReg: new Set(),
    });
  }

  const item = porCupom.get(chave);
  item.tiposReg.add(row.tvd_tipo_reg);
  item.formas.push({
    forma,
    valor: finn.valor,
    tipoReg: row.tvd_tipo_reg,
  });
  item.valorTotal += finn.valor;
  if (finn.cpf) item.cpf = finn.cpf;
  if (finn.nomeCliente) item.nomeCliente = finn.nomeCliente;
}

const cupons = [...porCupom.values()];
const ativos = cupons.filter((c) => !c.cancelada);
const canceladosLista = cupons.filter((c) => c.cancelada);

console.log("Cupons únicos (pagamento):", cupons.length);
console.log("  Ativos:", ativos.length);
console.log("  Cancelados:", canceladosLista.length);
console.log("Com CPF no cupom:", cupons.filter((c) => c.cpf).length);

/** Resumo por forma de pagamento (linha FIN* — um cupom pode ter várias). */
const porForma = new Map();

for (const row of brutos) {
  const finn = parseFinn(row.tvd_registro);
  const forma = finn.forma || "(sem descrição)";
  const pdv = String(row.tvd_pdv ?? "").trim();
  const cupom = String(row.tvd_cupom ?? "").trim();
  const chave = chaveCupom(pdv, cupom);
  const cancelada = cancelados.get(chave) === true;

  if (!porForma.has(forma)) {
    porForma.set(forma, {
      forma,
      linhas: 0,
      cupons: new Set(),
      cuponsAtivos: new Set(),
      valor: 0,
      valorAtivo: 0,
      tiposReg: new Set(),
    });
  }

  const agg = porForma.get(forma);
  agg.linhas += 1;
  agg.cupons.add(chave);
  agg.valor += finn.valor;
  agg.tiposReg.add(row.tvd_tipo_reg);
  if (!cancelada) {
    agg.cuponsAtivos.add(chave);
    agg.valorAtivo += finn.valor;
  }
}

const ranking = [...porForma.values()]
  .map((item) => ({
    forma: item.forma,
    linhasFin: item.linhas,
    cupons: item.cupons.size,
    cuponsAtivos: item.cuponsAtivos.size,
    valorTotal: Math.round(item.valor * 100) / 100,
    valorAtivo: Math.round(item.valorAtivo * 100) / 100,
    tiposReg: [...item.tiposReg].sort().join(", "),
  }))
  .sort((a, b) => b.valorAtivo - a.valorAtivo);

console.log("\n--- RESUMO POR FORMA DE PAGAMENTO ---");
console.log(
  "forma".padEnd(28),
  "cupons".padStart(7),
  "ativos".padStart(7),
  "linhas".padStart(7),
  "valor ativo".padStart(14),
  "valor total".padStart(14)
);
console.log("-".repeat(78));

for (const row of ranking) {
  console.log(
    row.forma.slice(0, 28).padEnd(28),
    String(row.cupons).padStart(7),
    String(row.cuponsAtivos).padStart(7),
    String(row.linhasFin).padStart(7),
    formatarMoeda(row.valorAtivo).padStart(14),
    formatarMoeda(row.valorTotal).padStart(14)
  );
}

console.log("\n--- POR PDV (cupons ativos) ---");
const porPdv = new Map();
for (const c of ativos) {
  const pdv = c.pdv || "?";
  if (!porPdv.has(pdv)) porPdv.set(pdv, { cupons: 0, valor: 0 });
  const agg = porPdv.get(pdv);
  agg.cupons += 1;
  agg.valor += c.valorTotal;
}

for (const [pdv, agg] of [...porPdv.entries()].sort((a, b) => b[1].cupons - a[1].cupons)) {
  console.log(
    `  PDV ${pdv}: ${agg.cupons} cupons · ${formatarMoeda(agg.valor)}`
  );
}

console.log("\n--- AMOSTRA: 10 CUPONS COM CPF ---");
const comCpf = cupons
  .filter((c) => c.cpf)
  .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora))
  .slice(0, 10);

for (const c of comCpf) {
  const formasTxt = c.formas
    .map((f) => `${f.forma} ${formatarMoeda(f.valor)}`)
    .join(" | ");
  console.log(
    `  ${c.cupom} PDV ${c.pdv} ${c.cancelada ? "[CANCEL]" : ""} CPF ${c.cpf}` +
      (c.nomeCliente ? ` (${c.nomeCliente})` : "")
  );
  console.log(`    ${formasTxt}`);
}

console.log("\n--- AMOSTRA: 1 CUPOM POR FORMA (mais recente) ---");
for (const row of ranking.slice(0, 12)) {
  const exemplo = cupons
    .filter((c) => c.formas.some((f) => f.forma === row.forma))
    .sort((a, b) => new Date(b.dataHora) - new Date(a.dataHora))[0];

  if (!exemplo) continue;

  console.log(
    `  ${row.forma}: cupom ${exemplo.cupom} PDV ${exemplo.pdv}` +
      ` · ${formatarMoeda(exemplo.valorTotal)}` +
      (exemplo.cpf ? ` · CPF ${exemplo.cpf}` : "")
  );
}

await getWrpdvPool().end();
console.log("\nFim.");

/**
 * Teste manual: vendas + vdonlinefi + finalizadoras para um CPF.
 * Uso: node scripts/test-pagamentos-cpf.js CPF [dias]
 */
import "../env.js";
import { fetchApiToken, lerRespostaApi } from "../services/apiClient.js";
import { dataBRParaApi, formatarDataBR, periodoUltimosDias } from "../utils/periodoVendas.js";

const cpf = process.argv[2];
const dias = Number(process.argv[3]) || 90;

if (!cpf) {
  console.error("Uso: node scripts/test-pagamentos-cpf.js CPF [dias]");
  process.exit(1);
}

const base = process.env.API_BASE_URL || "http://10.1.1.198:9000";
const tokenHeader = process.env.AUTH_TOKEN_HEADER || "token";
const { dataini, datafim } = periodoUltimosDias(dias);
const iniApi = dataBRParaApi(dataini);
const fimApi = dataBRParaApi(datafim);

const token = await fetchApiToken();

async function getJson(path, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = `${base}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: { [tokenHeader]: token } });
  const { data, parseError } = await lerRespostaApi(res);
  return { url, http: res.status, data, parseError };
}

console.log("=== TESTE API ERP ===");
console.log("CPF:", cpf);
console.log("Período:", dataini, "→", datafim, `(${dias} dias)`);
console.log("Base:", base);
console.log("");

// 1) Vendas do cliente
const vendasPath = `/v1.0/clientes/${cpf}/vendas/datainicial/${iniApi}/datafinal/${fimApi}`;
const vendas = await getJson(vendasPath);
const itensVenda = vendas.data?.response?.vendas?.itens ?? [];

console.log("--- 1) VENDAS (cliente)");
console.log("URL:", vendas.url);
console.log("HTTP:", vendas.http, "| status:", vendas.data?.response?.status);
console.log("Mensagem:", vendas.data?.response?.messages?.[0]?.message || vendas.data?.response?.message || "—");
console.log("Cupons:", Array.isArray(itensVenda) ? itensVenda.length : 0);

const unidades = [...new Set(itensVenda.map((i) => i.unidade).filter(Boolean))];
console.log("Unidades nos cupons:", unidades.length ? unidades.join(", ") : "—");

const resumoCupons = itensVenda.slice(0, 15).map((item) => ({
  data: item.data,
  numeroDcto: item.numeroDcto,
  unidade: item.unidade,
  qtdProdutos: item.produtos?.itens?.length ?? item.produtos?.length ?? "?",
  totalProdutos: (item.produtos?.itens ?? item.produtos ?? []).reduce?.(
    (acc, p) => acc + (Number(p.valorTotal ?? p.valor ?? 0) || 0),
    0
  ),
}));
console.log("Amostra cupons (até 15):", JSON.stringify(resumoCupons, null, 2));

// 2) vdonlinefi — pagamentos por cupom
console.log("\n--- 2) VENDAS ONLINE FI (formas de pagamento)");

const unidadeTeste = unidades[0] || process.env.CADASTRO_UNIDADE || "001";
let allFi = [];
let lastId = "0";
let pagina = 0;

while (pagina < 10) {
  pagina += 1;
  const fi = await getJson(`/v1.3/vdonlinefi/lastid/${lastId}`, {
    unidade: unidadeTeste,
    datainicial: iniApi,
    datafinal: fimApi,
    cnpjCpf: cpf,
  });

  if (pagina === 1) {
    console.log("URL (pág 1):", fi.url);
    console.log("HTTP:", fi.http, "| status:", fi.data?.response?.status);
    console.log("Mensagem:", fi.data?.response?.messages?.[0]?.message || "—");
    console.log("Unidade consultada:", unidadeTeste);
  }

  const lote = fi.data?.response?.vendasOnlineFi ?? [];
  if (!Array.isArray(lote) || lote.length === 0) break;

  allFi.push(...lote);

  const ultimo = lote[lote.length - 1];
  const proximoId = String(ultimo?.codigo ?? "");
  if (!proximoId || proximoId === lastId) break;
  lastId = proximoId;
}

console.log("Registros FI (linhas de pagamento):", allFi.length);
console.log(
  "Amostra FI:",
  JSON.stringify(
    allFi.slice(0, 20).map((r) => ({
      cupom: r.cupom,
      pdv: r.pdv,
      dataMovimento: r.dataMovimento,
      finalizadora: r.finalizadora,
      valor: r.valor,
      troco: r.troco,
      unidade: r.unidade,
      cnpjCpf: r.cnpjCpf,
    })),
    null,
    2
  )
);

// Agrupa por cupom
const porCupom = {};
for (const r of allFi) {
  const chave = `${r.unidade || unidadeTeste}|${r.pdv}|${r.cupom}|${r.dataMovimento}`;
  if (!porCupom[chave]) porCupom[chave] = [];
  porCupom[chave].push({
    finalizadora: r.finalizadora,
    valor: r.valor,
  });
}
console.log(
  "Cupons com pagamento (agrupado):",
  JSON.stringify(
    Object.entries(porCupom)
      .slice(0, 15)
      .map(([k, pagamentos]) => ({ chave: k, pagamentos })),
    null,
    2
  )
);

// 3) Catálogo finalizadoras
console.log("\n--- 3) CATÁLOGO FINALIZADORAS");
const fin = await getJson("/v1.0/financeiro/finalizadoras");
const listaFin = fin.data?.response?.finalizadoras ?? [];
console.log("HTTP:", fin.http, "| total:", listaFin.length);
console.log(
  "Amostra:",
  JSON.stringify(listaFin.slice(0, 12), null, 2)
);

// Cruzamento exemplo
if (allFi.length && listaFin.length) {
  const mapa = Object.fromEntries(
    listaFin.map((f) => [String(f.codigo).padStart(2, "0"), f.descricao])
  );
  console.log("\n--- CRUZAMENTO (cupom → nome da forma)");
  for (const [chave, pagamentos] of Object.entries(porCupom).slice(0, 8)) {
    const nomes = pagamentos.map(
      (p) => `${mapa[String(p.finalizadora).padStart(2, "0")] || p.finalizadora} (R$ ${p.valor})`
    );
    console.log(chave, "→", nomes.join(" + "));
  }
}

if (unidades.length > 1) {
  console.log("\n⚠ Há mais unidades nos cupons:", unidades.slice(1).join(", "));
  console.log("  (só consultamos FI na unidade", unidadeTeste, ")");
}

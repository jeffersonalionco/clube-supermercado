import { apiRequest, lerRespostaApi, normalizarCpfCnpj } from "./apiClient.js";

const CACHE_TTL_MS = Math.max(
  30_000,
  Number(process.env.CREDIARIO_CACHE_MS || 90_000)
);
/** @type {Map<string, { expiresAt: number, valor: object | null }>} */
const cache = new Map();

function unidadeCrediario() {
  return (
    String(
      process.env.CREDIARIO_UNIDADE ||
        process.env.CADASTRO_UNIDADE ||
        "001"
    ).replace(/\D/g, "") || "001"
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pctUtilizado(limite, utilizado) {
  if (!limite) return 0;
  return Math.min(100, Math.round((utilizado / limite) * 100));
}

/**
 * Consulta limite/saldo de crediário no RP.
 * Retorna null se não houver limite (> 0) ou em qualquer falha —
 * o cliente do Clube não deve saber que a função existe.
 * Não inclui campos internos (ex.: unidade).
 */
export async function consultarCrediarioSeAtivo(cpfCnpj) {
  const doc = normalizarCpfCnpj(cpfCnpj);
  if (!doc) return null;

  const cached = cache.get(doc);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.valor;
  }

  let valor = null;
  try {
    const unidade = unidadeCrediario();
    const path = `/v1.1/financeiro/cliente/${doc}/saldolimitecredito?cnpjunidade=${encodeURIComponent(unidade)}`;
    const res = await apiRequest(path);
    const { data, parseError } = await lerRespostaApi(res);
    if (!parseError && res.ok) {
      const body = data?.response;
      if (body?.status === "ok") {
        const raw = body.saldoLimite || body;
        const limiteCredito = num(raw.limiteCredito);
        if (limiteCredito > 0) {
          const saldoCredito = num(raw.saldoCredito);
          const limiteUtilizado = num(raw.limiteUtilizado);
          const limiteUtilizadoDia = num(raw.limiteUtilizadoDia);
          const baixaParcial = num(raw.baixaParcial);
          const percentualUsado = pctUtilizado(limiteCredito, limiteUtilizado);

          valor = {
            limiteCredito,
            saldoCredito,
            limiteUtilizado,
            limiteUtilizadoDia,
            baixaParcial,
            percentualUsado,
            quaseNoLimite: percentualUsado >= 80,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[crediario] consulta:", err.message);
    // Em erro, não cacheia null agressivo se havia valor fresco — mas aqui não temos
    valor = null;
  }

  cache.set(doc, { expiresAt: Date.now() + CACHE_TTL_MS, valor });
  return valor;
}

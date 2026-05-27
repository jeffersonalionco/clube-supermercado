import { dataBRParaApi } from "../utils/periodoVendas.js";

function apiConfig() {
  return {
    baseUrl: process.env.API_BASE_URL || "http://10.1.1.198:9000",
    usuario: process.env.API_USUARIO,
    senha: process.env.API_SENHA,
    tokenHeader: process.env.AUTH_TOKEN_HEADER || "token",
  };
}

export function normalizarCpfCnpj(valor) {
  return String(valor || "").replace(/\D/g, "");
}

let tokenCache = { token: null, expiresAt: 0 };
const TOKEN_TTL_MS = 50 * 60 * 1000;

export async function fetchApiToken() {
  const agora = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > agora) {
    return tokenCache.token;
  }

  const { baseUrl, usuario, senha } = apiConfig();

  if (!usuario || !senha) {
    throw new Error(
      "Credenciais da API não configuradas. Defina API_USUARIO e API_SENHA no .env"
    );
  }

  const response = await fetch(`${baseUrl}/v1.1/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usuario,
      senha,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.response?.messages?.[0]?.message ||
      data?.message ||
      `Falha ao autenticar API (${response.status})`;
    throw new Error(message);
  }

  const { token } = data.response || {};
  if (!token) {
    throw new Error("Token da API não retornado");
  }

  tokenCache = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

export async function lerRespostaApi(response) {
  const text = await response.text();

  if (!text.trim()) {
    return { data: {}, parseError: "Resposta vazia da API externa" };
  }

  if (text.trimStart().startsWith("<")) {
    return {
      data: {},
      parseError: `API externa retornou HTML (HTTP ${response.status}). Verifique a URL e o endpoint.`,
    };
  }

  try {
    return { data: JSON.parse(text), parseError: null };
  } catch {
    return { data: {}, parseError: "Resposta inválida da API externa (não é JSON)" };
  }
}

export async function apiRequest(path, options = {}) {
  const { baseUrl, tokenHeader } = apiConfig();
  const token = await fetchApiToken();

  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      [tokenHeader]: token,
      ...options.headers,
    },
  });
}

function extrairCliente(responseBody) {
  const r = responseBody?.response;
  if (!r) return null;

  return (
    r.cliente ??
    r.data ??
    r.dados ??
    (r.status === "ok" && typeof r === "object" ? r : null)
  );
}

export async function buscarClientePorCpfCnpj(cpfCnpj) {
  const documento = normalizarCpfCnpj(cpfCnpj);

  if (!documento) {
    return { ok: false, error: "CPF/CNPJ inválido" };
  }

  const response = await apiRequest(
    `/v1.6/clientes/cnpj_cpf/${encodeURIComponent(documento)}`,
    { method: "GET" }
  );

  const { data, parseError } = await lerRespostaApi(response);
  const status = data?.response?.status;

  if (parseError) {
    return { ok: false, error: parseError };
  }

  if (!response.ok || status !== "ok") {
    const message =
      data?.response?.messages?.[0]?.message ||
      data?.response?.message ||
      data?.message ||
      "CPF/CNPJ não encontrado no cadastro";
    return { ok: false, error: message };
  }

  const cliente = extrairCliente(data);

  return {
    ok: true,
    documento,
    cliente,
    raw: data.response,
  };
}

export async function cadastrarClienteApi(payload) {
  const response = await apiRequest("/v2.0/clientes", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const { data, parseError } = await lerRespostaApi(response);
  const status = data?.response?.status;

  if (parseError) {
    return { ok: false, error: parseError };
  }

  if (!response.ok || status !== "ok") {
    const messages = data?.response?.messages || [];
    const partes = messages
      .map((m) => m.message)
      .filter(Boolean)
      .filter(
        (msg) =>
          !/stacktrace|exception|\.java:|br\.com\.rpinfo|falha na estrutura/i.test(
            msg
          ) && !msg.trimStart().startsWith("at ")
      );
    const message =
      partes[0] ||
      data?.response?.message ||
      "Não foi possível concluir o cadastro";

    console.error("[cadastrarClienteApi]", response.status, partes[0] || message);

    return { ok: false, error: message, raw: data };
  }

  const codigo = data?.response?.cliente?.codigo;

  return {
    ok: true,
    codigo,
    message:
      data?.response?.message ||
      data?.response?.messages?.[0]?.message ||
      "Cliente cadastrado com sucesso",
  };
}

export async function atualizarClienteApi(codigo, payload) {
  const codigoStr = String(codigo ?? "").trim();
  if (!codigoStr) {
    return { ok: false, error: "Código do cliente não informado" };
  }

  const response = await apiRequest(
    `/v1.8/clientes/${encodeURIComponent(codigoStr)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );

  const { data, parseError } = await lerRespostaApi(response);
  const status = data?.response?.status;

  if (parseError) {
    return { ok: false, error: parseError };
  }

  if (!response.ok || status !== "ok") {
    const messages = data?.response?.messages || [];
    const partes = messages
      .map((m) => m.message)
      .filter(Boolean)
      .filter(
        (msg) =>
          !/stacktrace|exception|\.java:|br\.com\.rpinfo|falha na estrutura/i.test(
            msg
          ) && !msg.trimStart().startsWith("at ")
      );
    const message =
      partes[0] ||
      data?.response?.message ||
      "Não foi possível atualizar o cadastro";

    console.error("[atualizarClienteApi]", response.status, partes[0] || message);

    return { ok: false, error: message, raw: data };
  }

  return {
    ok: true,
    message:
      data?.response?.message ||
      data?.response?.messages?.[0]?.message ||
      "Dados atualizados com sucesso",
  };
}

export async function buscarVendasClienteApi(cpfCnpj, dataini, datafim) {
  const documento = normalizarCpfCnpj(cpfCnpj);
  if (!documento) {
    return { ok: false, error: "CPF/CNPJ inválido" };
  }

  const iniApi = dataBRParaApi(dataini);
  const fimApi = dataBRParaApi(datafim);

  if (!iniApi || !fimApi) {
    return { ok: false, error: "Datas inválidas para consulta de compras" };
  }

  const path = `/v1.0/clientes/${documento}/vendas/datainicial/${iniApi}/datafinal/${fimApi}`;

  const response = await apiRequest(path, { method: "GET" });
  const { data, parseError } = await lerRespostaApi(response);

  if (parseError) {
    return { ok: false, error: parseError };
  }

  const status = data?.response?.status;
  const messages = data?.response?.messages || [];
  const partes = messages
    .map((m) => m.message)
    .filter(Boolean)
    .filter(
      (msg) =>
        !/stacktrace|exception|\.java:|br\.com\.rpinfo/i.test(msg) &&
        !msg.trimStart().startsWith("at ")
    );

  if (!response.ok) {
    return {
      ok: false,
      error:
        partes[0] ||
        data?.response?.message ||
        "Não foi possível carregar suas compras",
      raw: data,
    };
  }

  if (status === "error") {
    return {
      ok: false,
      error: partes.join(" · ") || data?.response?.message || "Período inválido",
      raw: data,
    };
  }

  const itens = data?.response?.vendas?.itens ?? [];

  return {
    ok: true,
    itens: Array.isArray(itens) ? itens : [],
    message: data?.response?.message,
    raw: data,
  };
}

/**
 * Dados do produto por código.
 * GET /v1.0/produto/{codigo}
 */
export async function buscarProdutoApi(codigoProduto) {
  const codigo = String(codigoProduto ?? "").trim();
  if (!codigo) {
    return { ok: false, error: "Código do produto inválido" };
  }

  const response = await apiRequest(
    `/v1.0/produto/${encodeURIComponent(codigo)}`,
    { method: "GET" }
  );
  const { data, parseError } = await lerRespostaApi(response);

  if (parseError) {
    return { ok: false, error: parseError };
  }

  if (!response.ok) {
    const message =
      data?.response?.messages?.[0]?.message ||
      data?.message ||
      `Falha ao consultar produto (${response.status})`;
    return { ok: false, error: message, raw: data };
  }

  const produto = data?.response?.produto;
  if (!produto) {
    return { ok: false, error: "Produto não encontrado", raw: data };
  }

  return {
    ok: true,
    produto: {
      codigo: produto.codigo ?? codigo,
      descricao: String(produto.descricao ?? "").trim() || null,
      codigoBarras: produto.codigoBarras
        ? String(produto.codigoBarras).trim()
        : null,
    },
  };
}

/**
 * Detalhes do produto na unidade (nome via Descricao).
 * GET /v3.2/produtounidade/listaprodutos/{codigo}/unidade/{CNPJ}/detalhado
 */
export async function buscarProdutoUnidadeDetalhadoApi(codigoProduto, unidade) {
  const codigo = String(codigoProduto ?? "").trim();
  const codUnidade = String(unidade ?? "").trim();
  if (!codigo || !codUnidade) {
    return { ok: false, error: "Código do produto e unidade são obrigatórios" };
  }

  const path = `/v3.2/produtounidade/listaprodutos/${encodeURIComponent(codigo)}/unidade/${encodeURIComponent(codUnidade)}/detalhado`;
  const response = await apiRequest(path, { method: "GET" });
  const { data, parseError } = await lerRespostaApi(response);

  if (parseError) {
    return { ok: false, error: parseError };
  }

  if (!response.ok) {
    const message =
      data?.response?.messages?.[0]?.message ||
      data?.message ||
      `Falha ao consultar produto (${response.status})`;
    return { ok: false, error: message, raw: data };
  }

  const lista = data?.response?.produtos;
  const produto = Array.isArray(lista) && lista.length > 0 ? lista[0] : data?.response;

  if (!produto) {
    return { ok: false, error: "Produto não encontrado", raw: data };
  }

  const descricao =
    produto.Descricao ?? produto.descricao ?? produto.DescricaoCliente ?? "";

  return {
    ok: true,
    produto: {
      Codigo: produto.Codigo ?? codigo,
      Descricao: String(descricao).trim(),
      descricao: String(descricao).trim(),
    },
  };
}

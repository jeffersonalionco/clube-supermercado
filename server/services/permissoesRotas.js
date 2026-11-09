import {
  MODULOS,
} from "../../shared/permissoesAdmin.js";

const MARKETING = MODULOS.find((modulo) => modulo.id === "marketing").ferramentas.map(
  (item) => item.id
);

const VER_PROGRAMA = [
  "principal.clientes",
  "operacao.pontos",
  "operacao.brindes",
  "config.programa",
];

const REGRAS_ADMIN = [
  { prefix: "/eu", ferramentas: null },
  { prefix: "/permissoes", ferramentas: null },
  { prefix: "/config/programa", method: "GET", ferramentas: VER_PROGRAMA },
  { prefix: "/config/programa", method: "PATCH", ferramentas: ["config.programa"] },
  { prefix: "/backup", ferramentas: ["config.backup"] },
  { prefix: "/config/conteudo", ferramentas: ["comunicacao.conteudo"] },
  { prefix: "/clube-descontos", ferramentas: ["operacao.clube-descontos"] },
  {
    prefix: "/resumo",
    ferramentas: ["operacao.pontos", "operacao.brindes", "principal.dashboard"],
  },
  {
    prefix: "/relatorio-clube",
    ferramentas: ["principal.dashboard", "relatorios.clube"],
  },
  { prefix: "/relatorio/radar-compras", ferramentas: ["relatorios.radar-compras"] },
  { prefix: "/relatorio/segmentacao-rfm", ferramentas: ["relatorios.segmentacao-rfm"] },
  { prefix: "/relatorio/niveis-fidelidade", ferramentas: ["relatorios.niveis-fidelidade"] },
  { prefix: "/relatorio/funil-novos-membros", ferramentas: ["relatorios.funil-novos-membros"] },
  { prefix: "/relatorio/vendas-pdv", ferramentas: ["relatorios.vendas-pdv"] },
  { prefix: "/operacoes", ferramentas: ["operacao.pontos", "operacao.brindes"] },
  { prefix: "/clientes/segmentos", ferramentas: ["principal.clientes"] },
  { prefix: "/clientes/busca", ferramentas: ["principal.clientes"] },
  { re: /^\/clientes\/[^/]+\/ficha$/, ferramentas: ["principal.clientes"] },
  { re: /^\/clientes\/[^/]+\/pontos$/, ferramentas: ["operacao.pontos"] },
  {
    re: /^\/clientes\/[^/]+\/auditoria$/,
    ferramentas: ["operacao.pontos", "principal.clientes"],
  },
  { re: /^\/clientes\/[^/]+\/resgates$/, ferramentas: ["operacao.pontos"] },
  { prefix: "/comprovantes", ferramentas: ["operacao.pontos"] },
  { prefix: "/administradores", ferramentas: ["config.admins"] },
  { prefix: "/usuarios", ferramentas: ["operacao.usuarios"] },
];

const REGRAS_MARKETING = [
  { prefix: "/resumo", ferramentas: MARKETING },
  { prefix: "/ouvidoria", ferramentas: ["marketing.ouvidoria", "marketing.whatsapp-caixa"] },
  { prefix: "/whatsapp/caixa", ferramentas: ["marketing.whatsapp-caixa"] },
  { prefix: "/whatsapp/auto-reply", ferramentas: ["marketing.whatsapp-auto"] },
  { prefix: "/whatsapp/templates", ferramentas: ["marketing.whatsapp"] },
  { prefix: "/whatsapp/contatos/backfill", ferramentas: ["marketing.whatsapp-contatos"] },
  {
    prefix: "/whatsapp/contatos",
    ferramentas: [
      "marketing.whatsapp-contatos",
      "marketing.whatsapp-caixa",
      "marketing.whatsapp",
    ],
  },
  { prefix: "/whatsapp", ferramentas: ["marketing.whatsapp"] },
  { prefix: "/campanhas", ferramentas: ["marketing.email", "marketing.whatsapp"] },
  { prefix: "/upload", ferramentas: ["marketing.email", "marketing.whatsapp"] },
  { prefix: "/clientes", ferramentas: ["marketing.email", "marketing.whatsapp"] },
];

const REGRAS_PADARIA = [
  { prefix: "/admin/dashboard", ferramentas: ["padaria.dashboard"] },
  {
    re: /^\/admin\/pedidos\/[^/]+\/imprimir$/,
    ferramentas: ["padaria.historico", "padaria.dashboard", "padaria.config"],
  },
  { prefix: "/admin/pedidos", ferramentas: ["padaria.historico"] },
  { prefix: "/admin/impressora", ferramentas: ["padaria.config", "padaria.dashboard"] },
  { prefix: "/admin/sync", ferramentas: ["padaria.produtos"] },
  { prefix: "/admin/produtos", ferramentas: ["padaria.produtos"] },
  { prefix: "/admin/decoracoes", ferramentas: ["padaria.decoracoes"] },
  {
    prefix: "/admin/categorias",
    method: "GET",
    ferramentas: ["padaria.categorias", "padaria.produtos"],
  },
  { prefix: "/admin/categorias", ferramentas: ["padaria.categorias"] },
  { prefix: "/admin/usuarios", ferramentas: ["padaria.usuarios"] },
  { prefix: "/admin/config", ferramentas: ["padaria.config"] },
];

function combina(regra, path) {
  if (regra.re) return regra.re.test(path);
  return path === regra.prefix || path.startsWith(`${regra.prefix}/`);
}

function casar(regras, method, path) {
  const ordenadas = [...regras].sort((a, b) => {
    const peso = (regra) => {
      const base = regra.re ? 100 : regra.prefix.length;
      return base * 10 + (regra.method ? 1 : 0);
    };
    return peso(b) - peso(a);
  });

  for (const regra of ordenadas) {
    if (regra.method && regra.method !== method) continue;
    if (combina(regra, path)) return regra.ferramentas;
  }
  return [];
}

function caminho(path) {
  const limpo = String(path || "/").split("?")[0];
  if (limpo.length > 1 && limpo.endsWith("/")) return limpo.slice(0, -1);
  return limpo || "/";
}

/**
 * null = qualquer administrador logado.
 * lista = precisa de uma dessas ferramentas.
 * lista vazia = bloqueia quem não tem acesso completo.
 */
export function ferramentasExigidas(escopo, method, path) {
  const limpo = caminho(path);
  const verbo = String(method || "GET").toUpperCase();
  if (escopo === "admin") {
    if (
      ["/marketing", "/brindes", "/legal", "/novidades"].some(
        (prefixo) => limpo === prefixo || limpo.startsWith(`${prefixo}/`)
      )
    ) {
      return null;
    }
    return casar(REGRAS_ADMIN, verbo, limpo);
  }
  if (escopo === "marketing") return casar(REGRAS_MARKETING, verbo, limpo);
  if (escopo === "brindes") return ["operacao.brindes"];
  if (escopo === "legal") return ["config.legal"];
  if (escopo === "novidades") return ["comunicacao.novidades"];
  if (escopo === "padaria") {
    const relativo = limpo.startsWith("/api/padaria")
      ? limpo.slice("/api/padaria".length) || "/"
      : limpo;
    return casar(REGRAS_PADARIA, verbo, relativo);
  }
  return [];
}

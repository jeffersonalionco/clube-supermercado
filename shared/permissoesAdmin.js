/** Catálogo único de módulos e ferramentas do painel do clube. */

export const FERRAMENTA_ADMINS = "config.admins";

export const ORDEM_MENUS = [
  "dashboard",
  "clientes",
  "relatorio",
  "pontos",
  "brindes",
  "clube-descontos",
  "padaria",
  "usuarios",
  "marketing",
  "novidades",
  "conteudo",
  "programa",
  "backup",
  "admins",
  "legal",
  "manual",
];

export const MODULOS = [
  {
    id: "principal",
    label: "Principal",
    ferramentas: [
      { id: "principal.dashboard", label: "Dashboard", menu: "dashboard" },
      { id: "principal.clientes", label: "Clientes", menu: "clientes" },
    ],
  },
  {
    id: "relatorios",
    label: "Relatórios",
    ferramentas: [
      {
        id: "relatorios.radar-compras",
        label: "Radar de compras",
        menu: "relatorio",
        sub: "radar-compras",
      },
      {
        id: "relatorios.segmentacao-rfm",
        label: "Segmentação RFM",
        menu: "relatorio",
        sub: "segmentacao-rfm",
      },
      {
        id: "relatorios.niveis-fidelidade",
        label: "Níveis e fidelidade",
        menu: "relatorio",
        sub: "niveis-fidelidade",
      },
      {
        id: "relatorios.funil-novos-membros",
        label: "Funil de novos membros",
        menu: "relatorio",
        sub: "funil-novos-membros",
      },
      {
        id: "relatorios.clube",
        label: "Relatório do clube",
        menu: "relatorio",
        sub: "clube",
      },
      {
        id: "relatorios.vendas-pdv",
        label: "Vendas por PDV",
        menu: "relatorio",
        sub: "vendas-pdv",
      },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    ferramentas: [
      { id: "operacao.pontos", label: "Baixa de pontos", menu: "pontos" },
      { id: "operacao.brindes", label: "Brindes", menu: "brindes" },
      {
        id: "operacao.clube-descontos",
        label: "Clube de descontos",
        menu: "clube-descontos",
      },
      { id: "operacao.usuarios", label: "Usuários do clube", menu: "usuarios" },
    ],
  },
  {
    id: "padaria",
    label: "Padaria",
    ferramentas: [
      { id: "padaria.dashboard", label: "Operação do dia", menu: "padaria", sub: "dashboard" },
      { id: "padaria.historico", label: "Histórico", menu: "padaria", sub: "historico" },
      { id: "padaria.produtos", label: "Produtos", menu: "padaria", sub: "produtos" },
      { id: "padaria.decoracoes", label: "Decorações", menu: "padaria", sub: "decoracoes" },
      { id: "padaria.categorias", label: "Categorias", menu: "padaria", sub: "categorias" },
      { id: "padaria.usuarios", label: "Usuários da padaria", menu: "padaria", sub: "usuarios" },
      { id: "padaria.config", label: "Configuração", menu: "padaria", sub: "config" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    ferramentas: [
      { id: "marketing.email", label: "E-mail promocional", menu: "marketing", sub: "email" },
      {
        id: "marketing.whatsapp-caixa",
        label: "Atendimento WhatsApp",
        menu: "marketing",
        sub: "whatsapp-caixa",
      },
      {
        id: "marketing.whatsapp",
        label: "Campanhas WhatsApp",
        menu: "marketing",
        sub: "whatsapp",
      },
      {
        id: "marketing.whatsapp-contatos",
        label: "Carteira de contatos",
        menu: "marketing",
        sub: "whatsapp-contatos",
      },
      {
        id: "marketing.whatsapp-auto",
        label: "Auto-resposta",
        menu: "marketing",
        sub: "whatsapp-auto",
      },
      {
        id: "marketing.ouvidoria",
        label: "Sugestões e reclamações",
        menu: "marketing",
        sub: "ouvidoria",
      },
    ],
  },
  {
    id: "comunicacao",
    label: "Comunicação",
    ferramentas: [
      { id: "comunicacao.novidades", label: "Novidades", menu: "novidades" },
      { id: "comunicacao.conteudo", label: "Conteúdo", menu: "conteudo" },
    ],
  },
  {
    id: "config",
    label: "Configuração",
    ferramentas: [
      { id: "config.programa", label: "Programa", menu: "programa" },
      { id: "config.backup", label: "Backup", menu: "backup" },
      { id: FERRAMENTA_ADMINS, label: "Administradores", menu: "admins" },
      { id: "config.legal", label: "Regulamento", menu: "legal" },
    ],
  },
];

const FERRAMENTAS = MODULOS.flatMap((modulo) => modulo.ferramentas);
const IDS = new Set(FERRAMENTAS.map((item) => item.id));

export function idsFerramentas() {
  return [...IDS];
}

/** null no banco = acesso completo. Lista (mesmo vazia) = só o que foi marcado. */
export function acessoDeArmazenamento(ferramentas) {
  if (ferramentas == null) {
    return { acessoTotal: true, ferramentas: null };
  }
  const bruta = Array.isArray(ferramentas) ? ferramentas : [];
  const lista = [];
  for (const id of bruta) {
    if (typeof id === "string" && IDS.has(id) && !lista.includes(id)) {
      lista.push(id);
    }
  }
  return { acessoTotal: false, ferramentas: lista };
}

export function temFerramenta(acesso, ids) {
  if (ids == null) return true;
  if (!acesso) return false;
  if (acesso.acessoTotal) return true;
  if (!ids.length) return false;
  const tem = new Set(acesso.ferramentas || []);
  return ids.some((id) => tem.has(id));
}

export function menuLiberado(acesso, menuId) {
  if (menuId === "manual") return true;
  if (!acesso || acesso.acessoTotal) return true;
  return FERRAMENTAS.some(
    (item) => item.menu === menuId && (acesso.ferramentas || []).includes(item.id)
  );
}

export function subLiberado(acesso, menuId, subId) {
  if (!subId || subId === "hub") return menuLiberado(acesso, menuId);
  if (!acesso || acesso.acessoTotal) return true;
  const daSub = FERRAMENTAS.filter((item) => item.menu === menuId && item.sub === subId);
  if (!daSub.length) return false;
  return daSub.some((item) => (acesso.ferramentas || []).includes(item.id));
}

export function primeiroMenu(acesso) {
  for (const id of ORDEM_MENUS) {
    if (menuLiberado(acesso, id)) return id;
  }
  return "manual";
}

export function podeGerirAdmins(registro) {
  if (!registro || registro.ativo === false) return false;
  if (registro.acessoTotal || registro.ferramentas == null) return true;
  return (registro.ferramentas || []).includes(FERRAMENTA_ADMINS);
}

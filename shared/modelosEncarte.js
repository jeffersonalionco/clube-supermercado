export const FORMATOS_ENCARTE = [
  { id: "tv", nome: "TV", proporcao: "16:9", largura: 960, altura: 540 },
  { id: "feed", nome: "Feed", proporcao: "4:5", largura: 540, altura: 675 },
  { id: "stories", nome: "Stories", proporcao: "9:16", largura: 540, altura: 960 },
  { id: "a4", nome: "A4", proporcao: "Impressão", largura: 630, altura: 891, larguraMm: 210, alturaMm: 297 },
];

const formatos = new Map(FORMATOS_ENCARTE.map((formato) => [formato.id, formato]));

const categorias = [
  {
    id: "gerais",
    nome: "Gerais",
    grupos: [
      { id: "vitrine", nome: "Vitrine de ofertas", versoes: [
        { id: "feed", canal: "feed", colunas: 2, linhas: 2 },
      ] },
      { id: "ofertas-dia", nome: "Ofertas do dia", versoes: [
        { id: "stories", canal: "stories", colunas: 2, linhas: 3 },
      ] },
      { id: "painel", nome: "Painel Superama", versoes: [
        { id: "tv", canal: "tv", colunas: 4, linhas: 2 },
      ] },
    ],
  },
  {
    id: "acougue",
    nome: "Açougue",
    grupos: [
      { id: "acougue-superama", nome: "Açougue Superama", tema: "acougue", permiteLimite: true, versoes: [
        { id: "tv-acougue", canal: "tv", colunas: 2, linhas: 2 },
        { id: "feed-acougue", canal: "feed", colunas: 2, linhas: 2 },
        { id: "stories-acougue", canal: "stories", colunas: 2, linhas: 2 },
      ] },
    ],
  },
  {
    id: "hortifruti",
    nome: "Hortifruti",
    grupos: [
      { id: "terca-hortifruti", nome: "Terça-feira do Hortifruti", tema: "hortifruti", permitePrecoAnterior: true, permiteLimite: true, versoes: [
        { id: "tv-terca-hortifruti", canal: "tv", colunas: 3, linhas: 2 },
        { id: "feed-terca-hortifruti", canal: "feed", colunas: 2, linhas: 3 },
        { id: "stories-terca-hortifruti", canal: "stories", colunas: 2, linhas: 3 },
      ] },
    ],
  },
  {
    id: "limpeza",
    nome: "Limpeza",
    grupos: [
      { id: "quinta-limpeza", nome: "Quinta da Limpeza", tema: "limpeza", permitePrecoAnterior: true, permiteLimite: true, versoes: [
        { id: "tv-quinta-limpeza", canal: "tv", colunas: 3, linhas: 2 },
        { id: "feed-quinta-limpeza", canal: "feed", colunas: 2, linhas: 3 },
        { id: "stories-quinta-limpeza", canal: "stories", colunas: 2, linhas: 3 },
      ] },
    ],
  },
  {
    id: "etiquetas-gondola",
    nome: "Etiquetas de Gôndola",
    grupos: [
      { id: "etiquetas-preco", nome: "Etiquetas de preço", tema: "etiquetas", versoes: [
        { id: "a4-etiquetas", canal: "a4", colunas: 2, linhas: 4 },
      ] },
      { id: "black-friday-dobro", nome: "Black Friday em Dobro", tema: "etiquetas", permitePrecoAnterior: true, versoes: [
        { id: "a4-black-friday-dobro", canal: "a4", colunas: 1, linhas: 2 },
      ] },
      { id: "clube-oferta", nome: "Clube e Oferta", tema: "etiquetas", permitePrecoAnterior: true, versoes: [
        { id: "a4-clube-oferta", canal: "a4", colunas: 1, linhas: 2 },
      ] },
    ],
  },
  {
    id: "sazonais",
    nome: "Campanhas sazonais",
    grupos: [
      { id: "black-friday-superama", nome: "Black Friday Superama", tema: "black-friday", permitePrecoAnterior: true, permiteLimite: true, versoes: [
        { id: "tv-black-friday", canal: "tv", colunas: 3, linhas: 2 },
        { id: "feed-black-friday", canal: "feed", colunas: 2, linhas: 3 },
        { id: "stories-black-friday", canal: "stories", colunas: 2, linhas: 3 },
      ] },
    ],
  },
];

export const CATEGORIAS_ENCARTE = categorias.map((categoria) => ({
  ...categoria,
  grupos: categoria.grupos.map((grupo) => ({
    ...grupo,
    versoes: grupo.versoes.map((versao) => {
      const { id: _id, nome, proporcao, ...dimensoes } = formatos.get(versao.canal);
      return {
        ...versao,
        nome: grupo.nome,
        ...(grupo.tema ? { tema: grupo.tema } : {}),
        ...(grupo.permitePrecoAnterior ? { permitePrecoAnterior: true } : {}),
        ...(grupo.permiteLimite ? { permiteLimite: true } : {}),
        formato: `${nome} · ${proporcao}`,
        ...dimensoes,
      };
    }),
  })),
}));

export const MODELOS_ENCARTE = CATEGORIAS_ENCARTE.flatMap((categoria) =>
  categoria.grupos.flatMap((grupo) => grupo.versoes)
);

const CLASSICO = {
  id: "classico", nome: "Clássico", formato: "Vertical", largura: 600, altura: 840, colunas: 2, linhas: 3,
};

export function obterModeloEncarte(id) {
  return MODELOS_ENCARTE.find((modelo) => modelo.id === id) ?? CLASSICO;
}

export const LIMITE_FORMATOS_ENCARTE = 4;

export function obterGrupoModeloEncarte(id) {
  return CATEGORIAS_ENCARTE.flatMap((categoria) => categoria.grupos)
    .find((grupo) => grupo.versoes.some((versao) => versao.id === id));
}

export function formatosCampanhaValidos(modelo, formatosSelecionados) {
  if (formatosSelecionados === undefined) return true;
  if (!Array.isArray(formatosSelecionados) || formatosSelecionados.length < 1 ||
    formatosSelecionados.length > LIMITE_FORMATOS_ENCARTE ||
    new Set(formatosSelecionados).size !== formatosSelecionados.length ||
    !formatosSelecionados.includes(modelo)) return false;

  const grupo = obterGrupoModeloEncarte(modelo);
  return Boolean(grupo && formatosSelecionados.every((id) => grupo.versoes.some((versao) => versao.id === id)));
}

export function obterFormatosCampanhaEncarte(dados) {
  const principal = obterModeloEncarte(dados?.modelo);
  if (!dados?.formatos || !formatosCampanhaValidos(principal.id, dados.formatos)) return [principal];
  return [principal, ...dados.formatos.filter((id) => id !== principal.id).map(obterModeloEncarte)];
}

export function obterFormatoCampanhaEncarte(dados, id) {
  const disponiveis = obterFormatosCampanhaEncarte(dados);
  return id === undefined ? disponiveis[0] : disponiveis.find((modelo) => modelo.id === id);
}

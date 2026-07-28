/** Identidade e URLs canônicas do Clube Superama+ (SEO). */
export const SITE = {
  name: "Clube Superama+",
  shortName: "Superama+",
  tagline: "Do Supermercado Superama",
  origin: "https://clube.mercadosuperama.com.br",
  mercadoUrl: "https://mercadosuperama.com.br",
  mercadoName: "Mercado Superama",
  locale: "pt_BR",
  lang: "pt-BR",
  themeColor: "#1b4fa0",
  logoPath: "/logo.png",
  ogImagePath: "/logo.png",
  empresa: "Kimp Comércio de Alimentos Ltda.",
  cnpj: "00.289.167/0001-14",
};

export function absoluteUrl(path = "/") {
  const base = SITE.origin.replace(/\/$/, "");
  if (!path || path === "/") return `${base}/`;
  if (path.startsWith("http")) return path;
  if (path.startsWith("#")) return `${base}/${path}`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const SEO_DEFAULT = {
  title: "Clube Superama+ | Do Supermercado Superama",
  description:
    "Clube Superama+ do Mercado Superama: cadastre-se com CPF, acompanhe compras, descontos e benefícios do supermercado em Vera Cruz do Oeste e região.",
  keywords: [
    "Clube Superama",
    "Clube Superama+",
    "Mercado Superama",
    "Supermercado Superama",
    "clube de vantagens",
    "descontos Superama",
    "cadastro CPF Superama",
    "Vera Cruz do Oeste",
  ].join(", "),
  robots: "index, follow, max-image-preview:large, max-snippet:-1",
  path: "/",
  type: "website",
};

export const SEO_PAGES = {
  home: {
    ...SEO_DEFAULT,
    title: "Clube Superama+ | Do Supermercado Superama",
  },
  login: {
    ...SEO_DEFAULT,
    title: "Entrar no Clube Superama+ | Mercado Superama",
    description:
      "Acesse o Clube Superama+ com seu CPF. Faça login ou cadastre-se para acompanhar compras e benefícios do Mercado Superama.",
    path: "/",
  },
  privacidade: {
    title: "Política de Privacidade | Clube Superama+",
    description:
      "Política de Privacidade do Clube Superama+: como o Mercado Superama trata dados pessoais de clientes no clube.digital (LGPD).",
    keywords:
      "privacidade Clube Superama, LGPD Superama, política de privacidade Mercado Superama",
    robots: "index, follow",
    path: "/#/privacidade",
    type: "article",
  },
  regulamento: {
    title: "Regulamento | Clube Superama+",
    description:
      "Regulamento do Clube Superama+ do Mercado Superama: regras de participação, cadastro e funcionamento do programa de relacionamento.",
    keywords:
      "regulamento Clube Superama, regras clube Superama, programa de relacionamento Superama",
    robots: "index, follow",
    path: "/#/regulamento",
    type: "article",
  },
  app: {
    title: "Área do cliente | Clube Superama+",
    description: "Área logada do Clube Superama+.",
    robots: "noindex, nofollow",
    path: "/#/",
    type: "website",
  },
};

export function jsonLdOrganization() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE.origin}/#organization`,
        name: SITE.mercadoName,
        legalName: SITE.empresa,
        taxID: SITE.cnpj,
        url: SITE.mercadoUrl,
        logo: absoluteUrl(SITE.logoPath),
        sameAs: [SITE.origin, SITE.mercadoUrl],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.origin}/#website`,
        name: SITE.name,
        alternateName: ["Clube Superama", "Superama+", SITE.tagline],
        url: SITE.origin + "/",
        description: SEO_DEFAULT.description,
        inLanguage: SITE.lang,
        isPartOf: {
          "@type": "WebSite",
          name: SITE.mercadoName,
          url: SITE.mercadoUrl,
        },
        publisher: { "@id": `${SITE.origin}/#organization` },
        potentialAction: {
          "@type": "RegisterAction",
          target: absoluteUrl("/"),
          name: "Cadastrar no Clube Superama+",
        },
      },
      {
        "@type": "WebPage",
        "@id": `${SITE.origin}/#webpage`,
        url: SITE.origin + "/",
        name: SEO_DEFAULT.title,
        description: SEO_DEFAULT.description,
        isPartOf: { "@id": `${SITE.origin}/#website` },
        about: { "@id": `${SITE.origin}/#organization` },
        inLanguage: SITE.lang,
      },
    ],
  };
}

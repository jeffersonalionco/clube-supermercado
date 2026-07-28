import { useEffect } from "react";
import {
  SEO_DEFAULT,
  SEO_PAGES,
  SITE,
  absoluteUrl,
  jsonLdOrganization,
} from "./site.js";

function ensureMeta(attr, key, content) {
  if (content == null || content === "") return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", String(content));
}

function ensureLink(rel, href, attrs = {}) {
  if (!href) return;
  const selector = Object.entries(attrs)
    .map(([k, v]) => `[${k}="${v}"]`)
    .join("");
  let el = document.head.querySelector(`link[rel="${rel}"]${selector}`);
  if (!el && rel === "canonical") {
    el = document.head.querySelector('link[rel="canonical"]');
  }
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
}

function ensureJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/**
 * Atualiza title, description, robots, canonical e Open Graph conforme a view.
 */
export function applySeo(pageKey, extra = {}) {
  const base = SEO_PAGES[pageKey] || SEO_DEFAULT;
  const title = extra.title || base.title || SEO_DEFAULT.title;
  const description =
    extra.description || base.description || SEO_DEFAULT.description;
  const robots = base.robots || SEO_DEFAULT.robots;
  const keywords = base.keywords || SEO_DEFAULT.keywords;
  const path = base.path || "/";
  const type = base.type || "website";
  const pageUrl = absoluteUrl(path);
  const image = absoluteUrl(SITE.ogImagePath);

  document.title = title;
  ensureMeta("name", "description", description);
  ensureMeta("name", "keywords", keywords);
  ensureMeta("name", "robots", robots);
  ensureMeta("name", "googlebot", robots);
  ensureMeta("name", "author", SITE.mercadoName);
  ensureMeta("name", "application-name", SITE.name);

  ensureLink("canonical", pageUrl);

  ensureMeta("property", "og:type", type);
  ensureMeta("property", "og:site_name", SITE.name);
  ensureMeta("property", "og:locale", SITE.locale);
  ensureMeta("property", "og:title", title);
  ensureMeta("property", "og:description", description);
  ensureMeta("property", "og:url", pageUrl);
  ensureMeta("property", "og:image", image);
  ensureMeta("property", "og:image:alt", `${SITE.name} — ${SITE.tagline}`);

  ensureMeta("name", "twitter:card", "summary");
  ensureMeta("name", "twitter:title", title);
  ensureMeta("name", "twitter:description", description);
  ensureMeta("name", "twitter:image", image);

  ensureLink("alternate", SITE.mercadoUrl, { title: SITE.mercadoName });
  ensureJsonLd("seo-jsonld-org", jsonLdOrganization());
}

export function useSeo(pageKey, extra) {
  const extraTitle = extra?.title;
  const extraDescription = extra?.description;

  useEffect(() => {
    applySeo(pageKey, { title: extraTitle, description: extraDescription });
  }, [pageKey, extraTitle, extraDescription]);
}

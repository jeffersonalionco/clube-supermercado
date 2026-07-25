export function resolveImagemUrl(url) {
  if (!url) return null;
  if (/^(https?:|data:)/.test(url)) return url;
  const base = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  const caminho = url.startsWith("/") ? url : `/${url}`;
  return `${base}${caminho}`;
}

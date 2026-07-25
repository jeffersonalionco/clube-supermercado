export function adminPathFromHash() {
  const raw = window.location.hash.slice(1).replace(/^\//, "");
  return raw.split("?")[0];
}

export function adminQueryFromHash() {
  const raw = window.location.hash.slice(1).replace(/^\//, "");
  const idx = raw.indexOf("?");
  if (idx === -1) return new URLSearchParams();
  return new URLSearchParams(raw.slice(idx + 1));
}

export function navegarAdminComQuery(tab, params = {}) {
  const base =
    tab === "clientes"
      ? "admin/clientes"
      : tab === "brindes"
        ? "admin/brindes"
        : tab === "usuarios"
          ? "admin/usuarios"
          : tab === "admins"
            ? "admin/admins"
            : tab === "legal"
              ? "admin/legal"
              : tab === "manual"
                ? "admin/manual"
                : tab === "programa"
                  ? "admin/programa"
                  : tab === "conteudo"
                    ? "admin/conteudo"
                  : tab === "clube-descontos"
                    ? "admin/clube-descontos"
                    : "admin/pontos";

  const qs = new URLSearchParams(params).toString();
  window.location.hash = qs ? `/${base}?${qs}` : `/${base}`;
}

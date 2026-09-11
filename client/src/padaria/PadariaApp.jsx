import { useEffect, useState } from "react";
import PadariaCatalogoPage from "../pages/padaria/PadariaCatalogoPage.jsx";
import PadariaAtendentePage from "../pages/padaria/PadariaAtendentePage.jsx";
import PadariaProducaoPage from "../pages/padaria/PadariaProducaoPage.jsx";

function padariaPathFromHash() {
  const raw = window.location.hash.slice(1).replace(/^\//, "");
  return raw.split("?")[0];
}

function padariaViewFromHash() {
  const path = padariaPathFromHash();
  if (path.startsWith("padaria/atendente")) return "atendente";
  if (path.startsWith("padaria/producao")) return "producao";
  return "catalogo";
}

export function isPadariaRoute() {
  const hash = window.location.hash.slice(1).replace(/^\//, "").trim();
  return hash === "padaria" || hash.startsWith("padaria/");
}

export default function PadariaApp() {
  const [view, setView] = useState(() => padariaViewFromHash());

  useEffect(() => {
    const onHash = () => setView(padariaViewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (view === "atendente") return <PadariaAtendentePage />;
  if (view === "producao") return <PadariaProducaoPage />;
  return <PadariaCatalogoPage />;
}

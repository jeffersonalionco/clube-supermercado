import { useId } from "react";
import { useNivelClube } from "../utils/nivelClube.js";
import "../styles/nivel-badge.css";

const ICON_SIZE = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 36,
};

function IconBronze({ size = 18, gradId }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill={`url(#${gradId})`} stroke="#c2410c" strokeWidth="1.2" />
      <path
        d="M12 6.8l1.35 2.74 3.02.44-2.18 2.13.52 3.01L12 13.7l-2.71 1.42.52-3.01-2.18-2.13 3.02-.44L12 6.8z"
        fill="#fff7ed"
        fillOpacity="0.95"
      />
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="20" y2="21">
          <stop stopColor="#ffd56a" />
          <stop offset="0.35" stopColor="#ff8a3d" />
          <stop offset="0.7" stopColor="#ff5c1a" />
          <stop offset="1" stopColor="#c2410c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconPrata({ size = 18, gradId }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill={`url(#${gradId})`} stroke="#64748b" strokeWidth="1.2" />
      <path
        d="M12 6.8l1.35 2.74 3.02.44-2.18 2.13.52 3.01L12 13.7l-2.71 1.42.52-3.01-2.18-2.13 3.02-.44L12 6.8z"
        fill="#ffffff"
        fillOpacity="0.98"
      />
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="20" y2="21">
          <stop stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#e2e8f0" />
          <stop offset="0.7" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconOuro({ size = 18, gradId }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" fill={`url(#${gradId})`} stroke="#b8860b" strokeWidth="1.2" />
      <path
        d="M12 6.8l1.35 2.74 3.02.44-2.18 2.13.52 3.01L12 13.7l-2.71 1.42.52-3.01-2.18-2.13 3.02-.44L12 6.8z"
        fill="#fff8dc"
        fillOpacity="0.95"
      />
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="20" y2="21">
          <stop stopColor="#ffe566" />
          <stop offset="0.4" stopColor="#ffc107" />
          <stop offset="1" stopColor="#c47f00" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function IconDiamante({ size = 18, gradId }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.2L19.2 9.4 12 20.8 4.8 9.4 12 3.2z"
        fill={`url(#${gradId})`}
        stroke="#5b8def"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M4.8 9.4h14.4M12 3.2l-3.2 6.2h6.4L12 3.2z"
        stroke="#fff"
        strokeOpacity="0.55"
        strokeWidth="0.9"
      />
      <defs>
        <linearGradient id={gradId} x1="6" y1="3" x2="18" y2="21">
          <stop stopColor="#e8f4ff" />
          <stop offset="0.35" stopColor="#7dd3fc" />
          <stop offset="0.7" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const ICONS = {
  bronze: IconBronze,
  prata: IconPrata,
  ouro: IconOuro,
  diamante: IconDiamante,
};

function formatarReais(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function tituloNivel(clube) {
  if (!clube?.nivel) return "Nível do clube";
  const partes = [`Nível ${clube.nivel}`];
  if (clube.nivelDescricao) partes.push(clube.nivelDescricao);
  if (clube.gastoAno != null && clube.anoReferencia) {
    partes.push(`Gasto em ${clube.anoReferencia}: ${formatarReais(clube.gastoAno)}`);
  }
  if (clube.proximoNivel && clube.faltaParaProximo > 0) {
    partes.push(
      `Faltam ${formatarReais(clube.faltaParaProximo)} para ${clube.proximoNivel.nome}`
    );
  }
  return partes.join(" · ");
}

export function NivelIcon({ nivelId = "bronze", size = 24 }) {
  const uid = useId().replace(/:/g, "");
  const Icon = ICONS[nivelId] || IconBronze;
  return <Icon size={size} gradId={`ni-${nivelId}-${uid}`} />;
}

/**
 * Badge de nível de fidelidade (Bronze → Diamante).
 * Clicável por padrão quando há contexto do clube (abre o detalhe).
 */
export default function NivelBadge({
  clube,
  size = "md",
  showLabel = true,
  className = "",
  onClick,
  clickable,
}) {
  const ctx = useNivelClube();
  const uid = useId().replace(/:/g, "");
  const nivelId = clube?.nivelId || "bronze";
  const nome = clube?.nivel || "Bronze";
  const Icon = ICONS[nivelId] || IconBronze;
  const px = ICON_SIZE[size] || ICON_SIZE.md;
  const handleClick = onClick || ctx?.abrirDetalhe;
  const isClickable = clickable ?? Boolean(handleClick);
  const Tag = isClickable ? "button" : "span";

  return (
    <Tag
      type={isClickable ? "button" : undefined}
      className={`nivel-badge nivel-badge--${nivelId} nivel-badge--${size}${
        isClickable ? " nivel-badge--clickable" : ""
      }${className ? ` ${className}` : ""}`}
      title={
        isClickable
          ? `${tituloNivel(clube)} · Toque para ver como evoluir`
          : tituloNivel(clube)
      }
      aria-label={
        isClickable
          ? `Nível ${nome}. Abrir detalhes e progresso`
          : tituloNivel(clube)
      }
      onClick={isClickable ? handleClick : undefined}
    >
      <span className="nivel-badge__icon">
        <Icon size={px} gradId={`nf-${nivelId}-${uid}`} />
      </span>
      {showLabel && <span className="nivel-badge__label">{nome}</span>}
    </Tag>
  );
}

import logoUrl from "../assets/logo.png";
import { SITE } from "../seo/site.js";

/** Temas visuais por nível — alinhados à marca Superama (azul + vermelho). */
export const TEMAS_NIVEL_SHARE = {
  bronze: {
    id: "bronze",
    nome: "Bronze",
    titulo: "Cliente Bronze",
    hook: "Entrei no jogo do Clube Superama+",
    sub: "Cada compra me leva mais longe.",
    accent: "#ff8a3d",
    accentDeep: "#c2410c",
    medal: ["#ffd56a", "#ff8a3d", "#c2410c"],
    glow: "rgba(255, 138, 61, 0.45)",
  },
  prata: {
    id: "prata",
    nome: "Prata",
    titulo: "Cliente Prata",
    hook: "Já sou Prata no Clube Superama+",
    sub: "Presença certa — fidelidade em evolução.",
    accent: "#94a3b8",
    accentDeep: "#475569",
    medal: ["#ffffff", "#cbd5e1", "#64748b"],
    glow: "rgba(148, 163, 184, 0.4)",
  },
  ouro: {
    id: "ouro",
    nome: "Ouro",
    titulo: "Cliente Ouro",
    hook: "Sou Cliente Ouro no Clube Superama+",
    sub: "Fidelidade reconhecida. Orgulho da casa.",
    accent: "#ffc107",
    accentDeep: "#b45309",
    medal: ["#ffe566", "#ffc107", "#c47f00"],
    glow: "rgba(255, 193, 7, 0.45)",
  },
  diamante: {
    id: "diamante",
    nome: "Diamante",
    titulo: "Cliente VIP Diamante",
    hook: "VIP Diamante no Clube Superama+",
    sub: "Status máximo. Benefício máximo.",
    accent: "#7dd3fc",
    accentDeep: "#1d4ed8",
    medal: ["#e8f4ff", "#60a5fa", "#a78bfa"],
    glow: "rgba(96, 165, 250, 0.5)",
  },
};

const FORMATOS = {
  stories: { w: 1080, h: 1920, label: "Stories" },
  feed: { w: 1080, h: 1080, label: "Feed" },
};

let logoImagePromise = null;
let logoLimpaPromise = null;

function carregarLogo() {
  if (!logoImagePromise) {
    logoImagePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível carregar o logo"));
      img.src = logoUrl;
    });
  }
  return logoImagePromise;
}

/**
 * Remove o fundo preto da logo (arquivo vem com bg preto),
 * deixando só o azul + vermelho transparentes para pousar em placa clara.
 */
async function carregarLogoLimpa() {
  if (!logoLimpaPromise) {
    logoLimpaPromise = carregarLogo().then((img) => {
      const c = document.createElement("canvas");
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      c.width = w;
      c.height = h;
      const cx = c.getContext("2d");
      cx.drawImage(img, 0, 0);
      const imageData = cx.getImageData(0, 0, w, h);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // Preto / quase preto do fundo — não mexe no azul da tipografia
        // (azul tem canal B bem mais alto que R/G).
        const quasePreto = lum < 36 && b < 48 && Math.abs(r - g) < 12;
        if (quasePreto) {
          if (lum < 18) {
            d[i + 3] = 0;
          } else {
            d[i + 3] = Math.round(((lum - 18) / 18) * d[i + 3]);
          }
        }
      }
      cx.putImageData(imageData, 0, 0);
      return c;
    });
  }
  return logoLimpaPromise;
}

function primeiroNome(nome) {
  return (
    String(nome || "")
      .trim()
      .split(/\s+/)[0] || "Eu"
  );
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function desenharMedalhao(ctx, cx, cy, r, tema) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  g.addColorStop(0, tema.medal[0]);
  g.addColorStop(0.55, tema.medal[1]);
  g.addColorStop(1, tema.medal[2]);

  ctx.save();
  ctx.shadowColor = tema.glow;
  ctx.shadowBlur = 48;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();

  ctx.translate(cx, cy);
  ctx.beginPath();
  const spikes = 5;
  const outer = r * 0.42;
  const inner = r * 0.2;
  for (let i = 0; i < spikes * 2; i++) {
    const rad = (i * Math.PI) / spikes - Math.PI / 2;
    const dist = i % 2 === 0 ? outer : inner;
    const x = Math.cos(rad) * dist;
    const y = Math.sin(rad) * dist;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fill();
  ctx.restore();
}

function desenharPadraoSutil(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  for (let i = -h; i < w + h; i += 56) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Placa branca limpa + logo sem fundo preto.
 * Retorna a Y inferior da placa.
 */
function desenharLogoEmPlaca(ctx, logoLimpa, w, yTopo, formato) {
  const logoW = Math.min(formato === "stories" ? 500 : 440, w * 0.58);
  const logoH = (logoLimpa.height / logoLimpa.width) * logoW;
  const padX = 56;
  const padY = 40;
  const placaW = logoW + padX * 2;
  const placaH = logoH + padY * 2;
  const placaX = (w - placaW) / 2;
  const placaY = yTopo;
  const radius = 32;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, placaX, placaY, placaW, placaH, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // borda vermelha suave da marca
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(227, 28, 35, 0.45)";
  ctx.stroke();

  roundRect(ctx, placaX + 8, placaY + 8, placaW - 16, placaH - 16, radius - 6);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(27, 79, 160, 0.16)";
  ctx.stroke();

  ctx.drawImage(logoLimpa, placaX + padX, placaY + padY, logoW, logoH);
  ctx.restore();

  return placaY + placaH;
}

/**
 * Gera arte de compartilhamento do nível (canvas → Blob PNG).
 * @param {{ nivelId?: string, nome?: string, formato?: 'stories'|'feed' }} opts
 */
export async function gerarCardNivelShare({
  nivelId = "bronze",
  nome = "",
  formato = "stories",
} = {}) {
  const tema = TEMAS_NIVEL_SHARE[nivelId] || TEMAS_NIVEL_SHARE.bronze;
  const dim = FORMATOS[formato] || FORMATOS.stories;
  const { w, h } = dim;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  // Fundo marca Superama (azul profundo — a logo NÃO vai direto nele)
  const bg = ctx.createLinearGradient(0, 0, w * 0.15, h);
  bg.addColorStop(0, "#071536");
  bg.addColorStop(0.5, "#0d2b66");
  bg.addColorStop(1, "#0a1f4d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glowRed = ctx.createRadialGradient(
    w * 0.88,
    h * 0.08,
    10,
    w * 0.88,
    h * 0.08,
    w * 0.5
  );
  glowRed.addColorStop(0, "rgba(227, 28, 35, 0.28)");
  glowRed.addColorStop(1, "rgba(227, 28, 35, 0)");
  ctx.fillStyle = glowRed;
  ctx.fillRect(0, 0, w, h);

  const glowNivel = ctx.createRadialGradient(
    w / 2,
    h * 0.48,
    30,
    w / 2,
    h * 0.48,
    w * 0.55
  );
  glowNivel.addColorStop(0, tema.glow);
  glowNivel.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowNivel;
  ctx.fillRect(0, 0, w, h);

  desenharPadraoSutil(ctx, w, h);

  // eyebrow discreto (sem competir com a logo)
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "700 26px 'DM Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CLUBE DE VANTAGENS", w / 2, formato === "stories" ? 88 : 72);

  let logoBottom = formato === "stories" ? 200 : 160;
  try {
    const logoLimpa = await carregarLogoLimpa();
    logoBottom = desenharLogoEmPlaca(
      ctx,
      logoLimpa,
      w,
      formato === "stories" ? 120 : 100,
      formato
    );
  } catch {
    /* logo opcional */
  }

  const medalY = Math.max(
    logoBottom + (formato === "stories" ? 200 : 170),
    formato === "stories" ? h * 0.42 : h * 0.46
  );
  desenharMedalhao(ctx, w / 2, medalY, formato === "stories" ? 158 : 128, tema);

  const pillLabel = tema.titulo.toUpperCase();
  ctx.font = "800 34px 'DM Sans', system-ui, sans-serif";
  const pillW = Math.min(w - 120, ctx.measureText(pillLabel).width + 72);
  const pillY = medalY + (formato === "stories" ? 195 : 160);
  const pillGrad = ctx.createLinearGradient(
    w / 2 - pillW / 2,
    0,
    w / 2 + pillW / 2,
    0
  );
  pillGrad.addColorStop(0, tema.accentDeep);
  pillGrad.addColorStop(1, tema.accent);
  roundRect(ctx, w / 2 - pillW / 2, pillY, pillW, 64, 32);
  ctx.fillStyle = pillGrad;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pillLabel, w / 2, pillY + 33);
  ctx.textBaseline = "alphabetic";

  const nomeCurto = primeiroNome(nome);
  const textoY = pillY + 120;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "600 30px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(`${nomeCurto} no Clube Superama+`, w / 2, textoY);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 50px 'DM Sans', system-ui, sans-serif";
  wrapText(ctx, tema.hook, w / 2, textoY + 66, w - 120, 56);

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "500 28px 'DM Sans', system-ui, sans-serif";
  wrapText(ctx, tema.sub, w / 2, textoY + 200, w - 140, 38);

  const footerH = formato === "stories" ? 140 : 110;
  const footerY = h - (formato === "stories" ? 210 : 150);
  roundRect(ctx, 64, footerY, w - 128, footerH, 28);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 28px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(
    "Participe você também",
    w / 2,
    footerY + (formato === "stories" ? 48 : 40)
  );
  ctx.fillStyle = "#ff6b6b";
  ctx.font = "800 32px 'DM Sans', system-ui, sans-serif";
  ctx.fillText(
    SITE.origin.replace(/^https?:\/\//, ""),
    w / 2,
    footerY + (formato === "stories" ? 98 : 78)
  );

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Falha ao gerar imagem"))),
      "image/png",
      0.95
    );
  });

  return {
    blob,
    dataUrl: canvas.toDataURL("image/png"),
    width: w,
    height: h,
    formato,
    tema,
    fileName: `clube-superama-${tema.id}-${formato}.png`,
  };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let yy = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = words[i];
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export function montarTextoShareNivel({ nivelId = "bronze", nome = "" } = {}) {
  const tema = TEMAS_NIVEL_SHARE[nivelId] || TEMAS_NIVEL_SHARE.bronze;
  const quem = primeiroNome(nome);
  return [
    `${tema.hook} ✨`,
    "",
    `${quem} · ${tema.titulo}`,
    tema.sub,
    "",
    `Entre no Clube Superama+ e suba de nível também:`,
    SITE.origin,
    "",
    "#ClubeSuperama #SuperamaMais #Cliente" + tema.nome,
  ].join("\n");
}

export async function compartilharNivelNativo({
  blob,
  fileName,
  texto,
} = {}) {
  const file = new File([blob], fileName || "clube-superama-nivel.png", {
    type: "image/png",
  });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: "Clube Superama+",
      text: texto,
    });
    return { ok: true, modo: "share-files" };
  }

  if (navigator.share) {
    await navigator.share({
      title: "Clube Superama+",
      text: texto,
      url: SITE.origin,
    });
    return { ok: true, modo: "share-text" };
  }

  return { ok: false, modo: "unsupported" };
}

export async function baixarCardNivel(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "clube-superama-nivel.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

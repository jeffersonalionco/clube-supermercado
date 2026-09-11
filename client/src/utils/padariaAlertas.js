/** Alertas do atendente: pedido pronto e lembrete 15 min antes da retirada. */

export const JANELA_RETIRADA_MIN = 15;
const KEY_PRONTO = "padaria.atendente.alertas.pronto.v1";
const KEY_15MIN = "padaria.atendente.alertas.15min.v1";

/**
 * Minutos até a retirada (horário de Brasília, UTC−3).
 * Negativo = já passou.
 */
export function minutosParaRetirada(dataIso, horaHHMM, agora = new Date()) {
  const data = String(dataIso || "").slice(0, 10);
  const hora = String(horaHHMM || "00:00").slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) {
    return null;
  }
  const alvo = new Date(`${data}T${hora}:00-03:00`);
  if (Number.isNaN(alvo.getTime())) return null;
  return Math.round((alvo.getTime() - agora.getTime()) / 60000);
}

function loadSeenBag(storageKey, dia) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const data = JSON.parse(raw);
    if (data?.dia !== dia || !Array.isArray(data.ids)) return new Set();
    return new Set(data.ids.map(String));
  } catch {
    return new Set();
  }
}

function saveSeenBag(storageKey, dia, set) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ dia, ids: [...set] })
    );
  } catch {
    /* ignore */
  }
}

export function carregarVistosPronto(dia) {
  return loadSeenBag(KEY_PRONTO, dia);
}

export function salvarVistosPronto(dia, set) {
  saveSeenBag(KEY_PRONTO, dia, set);
}

export function carregarVistos15min(dia) {
  return loadSeenBag(KEY_15MIN, dia);
}

export function salvarVistos15min(dia, set) {
  saveSeenBag(KEY_15MIN, dia, set);
}

/** Beep curto para chamar atenção no balcão. */
export function tocarAlertaSonoro() {
  void tocarPadrao([
    { freq: 880, dur: 0.18, gap: 0.06, type: "sine", vol: 0.28 },
    { freq: 1175, dur: 0.22, gap: 0, type: "sine", vol: 0.32 },
  ]);
}

/**
 * Alarme mais agressivo para cancelamento (vários toques).
 * Seguro chamar de novo enquanto o popup estiver aberto.
 */
export function tocarAlertaCancelamento() {
  void tocarPadrao([
    { freq: 660, dur: 0.16, gap: 0.07, type: "square", vol: 0.28 },
    { freq: 880, dur: 0.16, gap: 0.07, type: "square", vol: 0.3 },
    { freq: 660, dur: 0.16, gap: 0.07, type: "square", vol: 0.28 },
    { freq: 990, dur: 0.2, gap: 0.08, type: "square", vol: 0.34 },
    { freq: 740, dur: 0.28, gap: 0, type: "sawtooth", vol: 0.3 },
  ]);
}

export function pedirPermissaoNotificacao() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  Notification.requestPermission().catch(() => {});
}

export function notificarSistema({ titulo, corpo, tag }) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(titulo, {
      body: corpo,
      tag: tag || undefined,
      renotify: true,
    });
    window.setTimeout(() => n.close(), 12000);
  } catch {
    /* ignore */
  }
}

/* —— Áudio compartilhado (precisa de gesto do usuário no Chrome) —— */

let audioCtx = null;
let audioLiberado = false;
const audioListeners = new Set();

function getAudioCtx() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function avisarEstadoAudio() {
  for (const fn of audioListeners) {
    try {
      fn(audioLiberado);
    } catch {
      /* ignore */
    }
  }
}

export function audioPadariaLiberado() {
  return audioLiberado;
}

export function onAudioPadariaChange(fn) {
  audioListeners.add(fn);
  try {
    fn(audioLiberado);
  } catch {
    /* ignore */
  }
  return () => audioListeners.delete(fn);
}

/** Chamar em clique/toque — desbloqueia o áudio do navegador. */
export async function desbloquearAudioPadaria() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    // Clique “fantasma” quase inaudível para validar a política de autoplay.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
    audioLiberado = ctx.state === "running";
    avisarEstadoAudio();
    return audioLiberado;
  } catch {
    audioLiberado = false;
    avisarEstadoAudio();
    return false;
  }
}

async function ensureAudioRunning() {
  const ctx = getAudioCtx();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  if (ctx.state === "running") {
    audioLiberado = true;
    avisarEstadoAudio();
  }
  return ctx.state === "running" ? ctx : null;
}

async function tocarPadrao(notas) {
  const ctx = await ensureAudioRunning();
  if (!ctx) return false;
  let t = ctx.currentTime + 0.02;
  for (const n of notas) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = n.type || "sine";
    osc.frequency.setValueAtTime(n.freq, t);
    const vol = Math.min(0.4, Number(n.vol) || 0.25);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, n.dur - 0.02));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + n.dur + 0.02);
    t += n.dur + (n.gap || 0);
  }
  return true;
}

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_FFMPEG = path.resolve(__dirname, "../../bin/ffmpeg");
const BIN_FFPROBE = path.resolve(__dirname, "../../bin/ffprobe");

function whichFfmpeg() {
  if (fs.existsSync(BIN_FFMPEG)) return BIN_FFMPEG;
  return "ffmpeg";
}

function whichFfprobe() {
  if (fs.existsSync(BIN_FFPROBE)) return BIN_FFPROBE;
  return "ffprobe";
}

function runCmd(cmd, args, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Tempo esgotado ao converter o vídeo"));
    }, timeoutMs);
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-600) || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Converte para MP4 compatível com WhatsApp (H.264 Main + AAC + yuv420p + faststart).
 * Retorna caminho do arquivo convertido (ou o original se não for vídeo / falha opcional).
 */
export async function prepararVideoWhatsapp(caminhoEntrada, { forcar = false } = {}) {
  const input = String(caminhoEntrada || "");
  if (!input || !fs.existsSync(input)) {
    return { ok: false, error: "Arquivo de vídeo não encontrado" };
  }
  if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(input)) {
    return { ok: true, caminho: input, convertido: false };
  }

  const dir = path.dirname(input);
  const base = path.basename(input, path.extname(input)).replace(/\.wa(baseline)?$/i, "");
  const saida = path.join(dir, `${base}.wabaseline.mp4`);

  if (!forcar && fs.existsSync(saida)) {
    const stIn = fs.statSync(input);
    const stOut = fs.statSync(saida);
    if (stOut.mtimeMs >= stIn.mtimeMs && stOut.size > 0 && stOut.size <= 16 * 1024 * 1024) {
      return { ok: true, caminho: saida, convertido: true, reusado: true, bytes: stOut.size };
    }
  }

  const ffmpeg = whichFfmpeg();
  // Baseline + AAC + yuv420p: máximo de compatibilidade no app WhatsApp (Android/iOS).
  // Sem áudio no original: gera faixa silenciosa (vídeo sem áudio costuma falhar no celular).
  const argsComAudio = [
    "-y",
    "-i",
    input,
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-movflags",
    "+faststart",
    "-max_muxing_queue_size",
    "9999",
    saida,
  ];
  const argsComSilencio = [
    "-y",
    "-i",
    input,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.1",
    "-pix_fmt",
    "yuv420p",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-shortest",
    "-movflags",
    "+faststart",
    saida,
  ];

  try {
    await runCmd(ffmpeg, argsComAudio);
  } catch (err) {
    try {
      await runCmd(ffmpeg, argsComSilencio);
    } catch (err2) {
      return {
        ok: false,
        error:
          "Não foi possível converter o vídeo para o formato do WhatsApp. Use MP4 H.264/AAC até 16 MB.",
        detalhe: err2.message || err.message,
      };
    }
  }

  const size = fs.statSync(saida).size;
  if (size > 16 * 1024 * 1024) {
    // Segunda passagem mais agressiva
    const saida2 = path.join(dir, `${base}.wa2.mp4`);
    try {
      await runCmd(ffmpeg, [
        "-y",
        "-i",
        saida,
        "-c:v",
        "libx264",
        "-profile:v",
        "baseline",
        "-level",
        "3.1",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale='min(854,iw)':-2",
        "-b:v",
        "800k",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-movflags",
        "+faststart",
        saida2,
      ]);
      fs.renameSync(saida2, saida);
    } catch {
      /* mantém saida original convertida */
    }
  }

  const finalSize = fs.statSync(saida).size;
  if (finalSize > 16 * 1024 * 1024) {
    return {
      ok: false,
      error: `Vídeo ainda ficou com ${(finalSize / (1024 * 1024)).toFixed(1)} MB (máx. 16 MB no WhatsApp)`,
      caminho: saida,
    };
  }

  return { ok: true, caminho: saida, convertido: true, bytes: finalSize };
}

export function midiaUrlAPartirDoCaminho(caminhoAbsoluto) {
  const abs = path.resolve(caminhoAbsoluto);
  const marker = `${path.sep}uploads${path.sep}`;
  const idx = abs.lastIndexOf(marker);
  if (idx === -1) return null;
  return abs.slice(idx).split(path.sep).join("/");
}

export { whichFfmpeg, whichFfprobe };

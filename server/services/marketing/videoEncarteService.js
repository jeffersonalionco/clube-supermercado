import { open, rm } from "node:fs/promises";
import { runCmd, whichFfmpeg } from "./whatsappVideoPrepare.js";

let conversoes = 0;

export async function removerVideoTemporario(caminho) {
  await rm(caminho, { force: true }).catch((erro) => {
    console.warn("[encartes/video] arquivo temporário:", erro.code);
  });
}

export async function enviarVideoEncarte(caminho, modelo, segundos, resposta) {
  const descritor = await open(caminho);
  const prefixo = Buffer.alloc(4);
  try {
    await descritor.read(prefixo, 0, 4, 0);
  } finally {
    await descritor.close();
  }
  if (!prefixo.equals(Buffer.from("1a45dfa3", "hex"))) {
    throw Object.assign(new Error("O navegador enviou um arquivo de vídeo inválido."), { status: 400 });
  }
  if (conversoes >= 2) {
    throw Object.assign(new Error("Há vídeos em conversão. Tente baixar novamente em instantes."), { status: 503 });
  }

  conversoes += 1;
  const saida = caminho + ".mp4";
  try {
    const largura = modelo.largura * 2;
    const altura = modelo.altura * 2;
    try {
      await runCmd(whichFfmpeg(), [
        "-nostdin", "-v", "error", "-y",
        "-protocol_whitelist", "file,pipe", "-f", "matroska,webm",
        "-threads", "2", "-i", caminho, "-map", "0:v:0", "-an",
        "-t", String(segundos), "-vf", `scale=${largura}:${altura},setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=1.5`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-threads", "2", "-movflags", "+faststart", saida,
      ], 120_000);
    } catch (erro) {
      console.error("[encartes/video] ffmpeg:", erro.message);
      throw Object.assign(new Error("Não foi possível converter o vídeo para MP4. Tente novamente."), { status: 422 });
    }

    resposta.type("mp4");
    await new Promise((resolve, reject) => resposta.sendFile(saida, (erro) => {
      if (erro && !resposta.headersSent) reject(erro);
      else resolve();
    }));
  } finally {
    conversoes -= 1;
    await removerVideoTemporario(saida);
  }
}

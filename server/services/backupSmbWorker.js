import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import SMB2 from "@marsaud/smb2";

let encerrado = false;
let pending = null;

function rst(err) {
  const msg = err?.message || String(err || "");
  return (
    err?.code === "ECONNRESET" ||
    err?.code === "EPIPE" ||
    /ECONNRESET|EPIPE|STATUS_FILE_CLOSED/i.test(msg)
  );
}

function limparTexto(valor) {
  return String(valor || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function sair(payload, codigo = 0) {
  if (encerrado) return;
  encerrado = true;
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(codigo);
}

process.on("uncaughtException", (err) => {
  if (pending) sair(pending, 0);
  if (encerrado || rst(err)) process.exit(encerrado ? 0 : 2);
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  if (pending) sair(pending, 0);
  if (encerrado || rst(err)) process.exit(encerrado ? 0 : 2);
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});

function lerStdin() {
  return new Promise((resolve, reject) => {
    const partes = [];
    process.stdin.on("data", (c) => partes.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function criarCliente(config) {
  const host = limparTexto(config.host);
  const share = limparTexto(config.share);
  const dominio = limparTexto(config.dominio) || host || "WORKGROUP";
  const client = new SMB2({
    share: `\\\\${host}\\${share}`,
    domain: dominio,
    username: limparTexto(config.usuario) || "Administrador",
    password: config.senha || "",
    autoCloseTimeout: 0,
    packetConcurrency: 1,
  });
  client.socket.on("error", () => {});
  return client;
}

async function garantirPasta(client, pasta) {
  try {
    if (await client.exists(pasta)) return;
  } catch {
    /* cria abaixo */
  }
  try {
    await client.mkdir(pasta);
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/exist|collision|STATUS_OBJECT_NAME/i.test(msg)) throw err;
  }
}

async function comCliente(config, fn) {
  const client = criarCliente(config);
  await garantirPasta(client, limparTexto(config.pasta) || "clube");
  return fn(client);
}

async function umaVez(fn) {
  try {
    return await fn();
  } catch (err) {
    if (!rst(err)) throw err;
    return fn();
  }
}

const entrada = JSON.parse((await lerStdin()) || "{}");
const { comando, config, local, remoto, nome } = entrada;
const pasta = limparTexto(config?.pasta) || "clube";

try {
  if (comando === "upload") {
    await umaVez(() =>
      comCliente(config, async (client) => {
        const caminho = `${pasta}\\${remoto}`;
        const ws = await client.createWriteStream(caminho, { flags: "w" });
        await pipeline(createReadStream(local), ws);
      })
    );
    pending = { ok: true };
    sair({ ok: true });
  } else if (comando === "list") {
    const arquivos = await umaVez(() =>
      comCliente(config, async (client) => {
        const itens = await client.readdir(pasta);
        return (itens || []).map((item) => ({
          nome: String(item || "")
            .split(/[/\\]/)
            .pop(),
          tamanho: 0,
        }));
      })
    );
    pending = { ok: true, arquivos };
    sair({ ok: true, arquivos });
  } else if (comando === "read") {
    const conteudo = await umaVez(() =>
      comCliente(config, async (client) => {
        const data = await client.readFile(`${pasta}\\${nome}`);
        return Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
      })
    );
    pending = { ok: true, conteudo };
    sair({ ok: true, conteudo });
  } else if (comando === "unlink") {
    await umaVez(() =>
      comCliente(config, async (client) => {
        await client.unlink(`${pasta}\\${nome}`);
      })
    );
    pending = { ok: true };
    sair({ ok: true });
  } else {
    sair({ ok: false, error: `Comando SMB desconhecido: ${comando}` }, 1);
  }
} catch (err) {
  sair(
    {
      ok: false,
      talvezEnviado: comando === "upload" && rst(err),
      error: err?.message || String(err),
    },
    rst(err) && comando === "upload" ? 2 : 1
  );
}

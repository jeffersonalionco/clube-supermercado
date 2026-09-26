import { Client } from "ssh2";

function conectar({ host, username, password, readyTimeout = 20000 }) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      try {
        client.end();
      } catch {
        /* ignore */
      }
      reject(new Error("Timeout ao conectar SSH na máquina de backup"));
    }, readyTimeout);

    client
      .on("ready", () => {
        clearTimeout(timer);
        resolve(client);
      })
      .on("keyboard-interactive", (_name, _instr, _lang, prompts, finish) => {
        finish(prompts.map(() => password || ""));
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host,
        port: 22,
        username,
        password,
        tryKeyboard: true,
        readyTimeout,
        hostVerifier: () => true,
      });
  });
}

export async function sshExecutar({
  host,
  username,
  password,
  comando,
  timeoutMs = 60_000,
}) {
  const client = await conectar({ host, username, password });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        client.end();
      } catch {
        /* ignore */
      }
      reject(new Error("Timeout no comando SSH"));
    }, timeoutMs);

    client.exec(comando, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        client.end();
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream.on("data", (d) => {
        stdout += d;
      });
      stream.stderr.on("data", (d) => {
        stderr += d;
      });
      stream.on("close", (code) => {
        clearTimeout(timer);
        client.end();
        resolve({
          code: Number(code) || 0,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
        });
      });
    });
  });
}

/** Dispara o processo no Windows e desconecta; o dump continua na 195. */
export async function sshIniciarSolto({ host, username, password, comando }) {
  const ps = comando.replace(/'/g, "''");
  return sshExecutar({
    host,
    username,
    password,
    timeoutMs: 45_000,
    comando: `powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','${ps}' -WindowStyle Hidden"`,
  });
}

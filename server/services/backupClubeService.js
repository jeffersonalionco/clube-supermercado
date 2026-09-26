import { execFile, spawn } from "node:child_process";
import { access, copyFile, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getPool } from "../db.js";
import { dataBrasiliaISO, partesBrasilia } from "../utils/fusoBrasilia.js";
import {
  montarGuiaRestaurar,
  montarManifesto,
  obterUrlGithub,
} from "./backupRestaurarGuia.js";

const execFileAsync = promisify(execFile);
const SMB_WORKER = fileURLToPath(new URL("./backupSmbWorker.js", import.meta.url));
const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.join(SERVER_ROOT, "..");
const UPLOADS_DIR = path.join(SERVER_ROOT, "uploads");
const ENV_EXEMPLO = path.join(SERVER_ROOT, ".env.example");

const LIMIAR_PADRAO = 10 * 1024 * 1024 * 1024;
const ARQUIVO_RE = /^clube-superama-\d{8}-\d{6}(?:\.dump|\.tar\.gz)$/;
const INTERVALO_AGENDA_MS = 60 * 1000;
const SMB_TIMEOUT_MS = 30 * 60 * 1000;

let jobTimer = null;
let backupEmAndamento = false;

function hostPermitido(host) {
  const h = String(host || "").trim();
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

function nomeSeguro(valor, padrao) {
  const v = String(valor || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!v) return padrao;
  if (v.includes("..") || v.includes("/") || !/^[A-Za-z0-9._-]+$/.test(v)) {
    throw new Error("Nome de pasta/compartilhamento inválido");
  }
  return v;
}

function horaValida(valor) {
  const m = String(valor || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function limparTexto(valor) {
  return String(valor || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function dominioSmb(dominio, host) {
  const d = limparTexto(dominio);
  const h = limparTexto(host);
  if (!d || /^superama$/i.test(d)) return h || "WORKGROUP";
  return d;
}

function mapConfig(row) {
  const envHost = String(process.env.BACKUP_SMB_HOST || "").trim();
  const envShare = String(process.env.BACKUP_SMB_SHARE || "").trim();
  const envPasta = String(process.env.BACKUP_SMB_PASTA || "").trim();
  const envUser = String(process.env.BACKUP_SMB_USUARIO || "").trim();
  const envPass = String(process.env.BACKUP_SMB_SENHA || "");
  const envDom = String(process.env.BACKUP_SMB_DOMINIO || "").trim();

  return {
    ativo: Boolean(row?.ativo),
    hora: horaValida(row?.hora) || "02:00",
    host: limparTexto(row?.host || envHost || "10.1.1.195"),
    share: limparTexto(row?.share || envShare || "backup"),
    pasta: limparTexto(row?.pasta || envPasta || "clube"),
    usuario: limparTexto(row?.usuario || envUser || "Administrador"),
    senha: String(row?.senha || "") || envPass,
    dominio: dominioSmb(row?.dominio || envDom || "", row?.host || envHost || "10.1.1.195"),
    limiarBytes: Number(row?.limiar_bytes) > 0 ? Number(row.limiar_bytes) : LIMIAR_PADRAO,
    manterAbaixo: Math.max(1, Number(row?.manter_abaixo) || 2),
    manterAcima: Math.max(1, Number(row?.manter_acima) || 1),
    ultimoSucessoEm: row?.ultimo_sucesso_em || null,
    ultimoErro: row?.ultimo_erro || null,
    atualizadoEm: row?.atualizado_em || null,
    atualizadoPor: row?.atualizado_por || null,
  };
}

export function apresentarConfigBackup(config, extras = {}) {
  return {
    ativo: Boolean(config.ativo),
    hora: config.hora,
    host: config.host,
    share: config.share,
    pasta: config.pasta,
    usuario: config.usuario,
    dominio: config.dominio,
    senhaDefinida: Boolean(config.senha),
    limiarGb: Math.round((config.limiarBytes / (1024 * 1024 * 1024)) * 10) / 10,
    manterAbaixo: config.manterAbaixo,
    manterAcima: config.manterAcima,
    ultimoSucessoEm: config.ultimoSucessoEm
      ? new Date(config.ultimoSucessoEm).toISOString()
      : null,
    ultimoErro: config.ultimoErro || null,
    atualizadoEm: config.atualizadoEm
      ? new Date(config.atualizadoEm).toISOString()
      : null,
    atualizadoPor: config.atualizadoPor || null,
    rodando: backupEmAndamento,
    ...extras,
  };
}

export async function obterConfigBackup() {
  const { rows } = await getPool().query(
    `SELECT * FROM config_backup WHERE id = 1`
  );
  return mapConfig(rows[0]);
}

export async function salvarConfigBackup(parcial = {}, adminUsuario = "") {
  const atual = await obterConfigBackup();
  const hora = horaValida(parcial.hora ?? atual.hora);
  if (!hora) throw new Error("Informe a hora no formato HH:MM");

  const host = String(parcial.host ?? atual.host).trim();
  if (!hostPermitido(host)) {
    throw new Error("Host inválido. Use um IP da rede interna (ex.: 10.1.1.195).");
  }

  const share = nomeSeguro(parcial.share ?? atual.share, "backup");
  const pasta = nomeSeguro(parcial.pasta ?? atual.pasta, "clube");
  const usuario = limparTexto(parcial.usuario ?? atual.usuario ?? "");
  const dominioInformado = limparTexto(parcial.dominio ?? atual.dominio ?? "");
  const dominio = /^superama$/i.test(dominioInformado) ? "" : dominioInformado;
  const senhaNova = parcial.senha;
  const senha =
    senhaNova === undefined || senhaNova === null || String(senhaNova) === ""
      ? atual.senha
      : String(senhaNova);

  const limiarGb = Number(parcial.limiarGb);
  const limiarBytes =
    Number.isFinite(limiarGb) && limiarGb > 0
      ? Math.round(limiarGb * 1024 * 1024 * 1024)
      : atual.limiarBytes;

  const manterAbaixo = Math.max(1, Math.min(30, Number(parcial.manterAbaixo) || atual.manterAbaixo));
  const manterAcima = Math.max(1, Math.min(10, Number(parcial.manterAcima) || atual.manterAcima));
  const ativo = Boolean(parcial.ativo ?? atual.ativo);

  const { rows } = await getPool().query(
    `UPDATE config_backup
     SET ativo = $1,
         hora = $2,
         host = $3,
         share = $4,
         pasta = $5,
         usuario = $6,
         senha = $7,
         dominio = $8,
         limiar_bytes = $9,
         manter_abaixo = $10,
         manter_acima = $11,
         atualizado_em = NOW(),
         atualizado_por = $12
     WHERE id = 1
     RETURNING *`,
    [
      ativo,
      hora,
      host,
      share,
      pasta,
      usuario,
      senha,
      dominio,
      limiarBytes,
      manterAbaixo,
      manterAcima,
      adminUsuario || "admin",
    ]
  );

  return mapConfig(rows[0]);
}

async function temBinario(nome) {
  try {
    await execFileAsync("which", [nome]);
    return true;
  } catch {
    return false;
  }
}

function destinoTexto(config) {
  return `\\\\${config.host}\\${config.share}\\${config.pasta}`;
}

function nomeArquivoPacote(date = new Date()) {
  const p = partesBrasilia(date);
  const d = `${p.ano}${String(p.mes).padStart(2, "0")}${String(p.dia).padStart(2, "0")}`;
  const h = `${String(p.hora).padStart(2, "0")}${String(p.minuto).padStart(2, "0")}${String(
    p.segundo
  ).padStart(2, "0")}`;
  return `clube-superama-${d}-${h}.tar.gz`;
}

async function tamanhoPasta(dir) {
  try {
    await access(dir);
  } catch {
    return 0;
  }
  try {
    const { stdout } = await execFileAsync("du", ["-sb", dir], { timeout: 60_000 });
    const n = Number(String(stdout).trim().split(/\s+/)[0]);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function montarPacoteBackup(tmpDir, config) {
  const dumpLocal = path.join(tmpDir, "banco.dump");
  const tamanhoDump = await dumpPostgres(dumpLocal);
  const uploadsBytes = await tamanhoPasta(UPLOADS_DIR);
  const github = await obterUrlGithub(REPO_ROOT);
  const pgHost = process.env.PG_HOST || "localhost";
  const pgPort = String(process.env.PG_PORT || 5432);
  const pgUser = process.env.PG_USER || "postgres";
  const pgDatabase = process.env.PG_DATABASE || "superama";
  const geradoEm = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const destino = destinoTexto(config);

  const guia = montarGuiaRestaurar({
    geradoEm,
    github,
    pgHost,
    pgPort,
    pgUser,
    pgDatabase,
    destino,
    hostname: os.hostname(),
    nodeVersion: process.version,
  });
  await writeFile(path.join(tmpDir, "RESTAURAR.txt"), guia, "utf8");
  await writeFile(
    path.join(tmpDir, "MANIFEST.json"),
    `${JSON.stringify(
      montarManifesto({
        geradoEm,
        github,
        pgHost,
        pgPort,
        pgUser,
        pgDatabase,
        destino,
        uploadsBytes,
      }),
      null,
      2
    )}\n`,
    "utf8"
  );
  try {
    await copyFile(ENV_EXEMPLO, path.join(tmpDir, "env.exemplo.txt"));
  } catch {
    await writeFile(
      path.join(tmpDir, "env.exemplo.txt"),
      "Copie server/.env.example do repositório GitHub.\n",
      "utf8"
    );
  }

  const nome = nomeArquivoPacote();
  const archivePath = path.join(tmpDir, nome);
  const tarArgs = [
    "-czf",
    archivePath,
    "-C",
    tmpDir,
    "banco.dump",
    "RESTAURAR.txt",
    "MANIFEST.json",
    "env.exemplo.txt",
  ];
  try {
    await access(UPLOADS_DIR);
    tarArgs.push("-C", path.dirname(UPLOADS_DIR), path.basename(UPLOADS_DIR));
  } catch {
    await writeFile(
      path.join(tmpDir, "uploads-AUSENTE.txt"),
      "A pasta server/uploads não existia neste servidor no momento do backup.\n",
      "utf8"
    );
    tarArgs.push("-C", tmpDir, "uploads-AUSENTE.txt");
  }

  await execFileAsync("tar", tarArgs, {
    timeout: 30 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });

  const info = await stat(archivePath);
  if (!info.size) throw new Error("O pacote de backup ficou vazio");
  return { nome, local: archivePath, tamanho: info.size, tamanhoDump, uploadsBytes };
}

async function dumpPostgres(arquivoLocal) {
  const host = process.env.PG_HOST || "localhost";
  const port = String(process.env.PG_PORT || 5432);
  const user = process.env.PG_USER || "postgres";
  const database = process.env.PG_DATABASE || "superama";
  const password = process.env.PG_PASSWORD || "postgres";

  await execFileAsync(
    "pg_dump",
    ["-h", host, "-p", port, "-U", user, "-d", database, "-Fc", "-Z", "6", "-f", arquivoLocal],
    {
      env: { ...process.env, PGPASSWORD: password },
      timeout: 30 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
    }
  );

  const info = await stat(arquivoLocal);
  if (!info.size) throw new Error("pg_dump gerou arquivo vazio");
  return info.size;
}

export function credenciaisSmb(config) {
  return {
    host: config.host,
    share: config.share,
    pasta: config.pasta,
    usuario: config.usuario,
    senha: config.senha,
    dominio: config.dominio,
  };
}

function parseJsonLinha(texto) {
  const linha = String(texto || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (!linha) return null;
  try {
    return JSON.parse(linha);
  } catch {
    return null;
  }
}

export function chamarSmbWorker(payload) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--openssl-legacy-provider", SMB_WORKER], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, SMB_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const parsed = parseJsonLinha(stdout);
      if (parsed?.ok) {
        resolve(parsed);
        return;
      }
      if (
        payload.comando === "upload" &&
        (code === 2 ||
          parsed?.talvezEnviado ||
          /ECONNRESET|EPIPE|STATUS_FILE_CLOSED/i.test(String(parsed?.error || stderr)))
      ) {
        resolve({ ok: false, talvezEnviado: true });
        return;
      }
      reject(
        new Error(
          parsed?.error || stderr.trim() || `Falha no compartilhamento SMB (código ${code})`
        )
      );
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

function filtrarDumps(arquivos) {
  return (arquivos || [])
    .map((a) => ({
      nome: String(a?.nome || "").split(/[/\\]/).pop(),
      tamanho: Number(a?.tamanho || 0),
    }))
    .filter((a) => ARQUIVO_RE.test(a.nome))
    .sort((a, b) => b.nome.localeCompare(a.nome));
}

async function enviarSmb2(config, arquivoLocal, nomeRemoto) {
  await chamarSmbWorker({
    comando: "upload",
    config: credenciaisSmb(config),
    local: arquivoLocal,
    remoto: nomeRemoto,
  });
  let arquivos;
  try {
    arquivos = await listarSmb2(config);
  } catch {
    arquivos = await listarSmb2(config);
  }
  const gravado = arquivos.find((a) => a.nome === nomeRemoto);
  if (!gravado) {
    throw new Error(`O pacote de backup não chegou em ${destinoTexto(config)}`);
  }
}

async function listarSmb2(config) {
  try {
    const r = await chamarSmbWorker({
      comando: "list",
      config: credenciaisSmb(config),
    });
    return filtrarDumps(r.arquivos);
  } catch (err) {
    if (!/ECONNRESET|EPIPE/i.test(err?.message || "")) throw err;
    const r = await chamarSmbWorker({
      comando: "list",
      config: credenciaisSmb(config),
    });
    return filtrarDumps(r.arquivos);
  }
}

async function apagarSmb2(config, nome) {
  await chamarSmbWorker({
    comando: "unlink",
    config: credenciaisSmb(config),
    nome,
  });
}

async function runSmbclient(config, comando) {
  const args = [`//${config.host}/${config.share}`];
  if (config.usuario) {
    args.push("-U", `${config.usuario}%${config.senha || ""}`);
  } else {
    args.push("-N");
  }
  if (config.dominio) args.push("-W", config.dominio);
  args.push("-c", comando);
  const { stdout, stderr } = await execFileAsync("smbclient", args, {
    timeout: 30 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return `${stdout || ""}\n${stderr || ""}`;
}

function parseLsSmbclient(saida) {
  const arquivos = [];
  for (const linha of String(saida || "").split("\n")) {
    const m = linha.match(/^\s+(\S+)\s+[A-Za-z]+\s+(\d+)\s+/);
    if (!m) continue;
    if (!ARQUIVO_RE.test(m[1])) continue;
    arquivos.push({ nome: m[1], tamanho: Number(m[2]) || 0 });
  }
  return arquivos.sort((a, b) => b.nome.localeCompare(a.nome));
}

async function enviarSmbclient(config, arquivoLocal, nomeRemoto) {
  try {
    await runSmbclient(config, `mkdir ${config.pasta}`);
  } catch {
    /* pasta já existe */
  }
  await runSmbclient(config, `cd ${config.pasta}; put ${arquivoLocal} ${nomeRemoto}`);
}

async function listarSmbclient(config) {
  try {
    await runSmbclient(config, `mkdir ${config.pasta}`);
  } catch {
    /* ignore */
  }
  const saida = await runSmbclient(config, `cd ${config.pasta}; ls`);
  return parseLsSmbclient(saida);
}

async function apagarSmbclient(config, nome) {
  await runSmbclient(config, `cd ${config.pasta}; del ${nome}`);
}

async function backendSmb(config) {
  if (await temBinario("smbclient")) {
    return {
      enviar: enviarSmbclient,
      listar: listarSmbclient,
      apagar: apagarSmbclient,
      nome: "smbclient",
    };
  }
  return {
    enviar: enviarSmb2,
    listar: listarSmb2,
    apagar: apagarSmb2,
    nome: "smb2",
  };
}

async function aplicarRetencao(config, backend, tamanhoNovo) {
  const arquivos = await backend.listar(config);
  const manter =
    tamanhoNovo < config.limiarBytes ? config.manterAbaixo : config.manterAcima;
  const excesso = arquivos.slice(manter);
  let removidos = 0;
  for (const arq of excesso) {
    await backend.apagar(config, arq.nome);
    removidos += 1;
  }
  return { manter, removidos, arquivos: arquivos.slice(0, manter) };
}

function mapExecucao(row) {
  if (!row) return null;
  return {
    id: row.id,
    origem: row.origem,
    status: row.status,
    iniciadoEm: row.iniciado_em ? new Date(row.iniciado_em).toISOString() : null,
    concluidoEm: row.concluido_em ? new Date(row.concluido_em).toISOString() : null,
    arquivo: row.arquivo || null,
    tamanhoBytes: row.tamanho_bytes != null ? Number(row.tamanho_bytes) : null,
    destino: row.destino || null,
    mantidos: row.mantidos,
    removidos: row.removidos,
    erro: row.erro || null,
    disparadoPor: row.disparado_por || null,
    sistema: row.sistema || "clube",
  };
}

export async function listarExecucoesBackup(limite = 20) {
  const { rows } = await getPool().query(
    `SELECT * FROM backup_execucao
     ORDER BY iniciado_em DESC
     LIMIT $1`,
    [Math.max(1, Math.min(80, Number(limite) || 20))]
  );
  return rows.map(mapExecucao);
}

export async function testarDestinoBackup() {
  const config = await obterConfigBackup();
  if (!hostPermitido(config.host)) {
    throw new Error("Host do compartilhamento inválido");
  }
  nomeSeguro(config.share, "backup");
  nomeSeguro(config.pasta, "clube");
  const backend = await backendSmb(config);
  const arquivos = await backend.listar(config);
  return {
    ok: true,
    backend: backend.nome,
    destino: destinoTexto(config),
    arquivos,
  };
}

export async function executarBackupClube({ origem = "manual", disparadoPor = "" } = {}) {
  if (backupEmAndamento) {
    throw new Error("Já existe um backup em andamento");
  }

  const config = await obterConfigBackup();
  if (!hostPermitido(config.host)) {
    throw new Error("Host do compartilhamento inválido");
  }
  nomeSeguro(config.share, "backup");
  nomeSeguro(config.pasta, "clube");

  backupEmAndamento = true;
  const db = getPool();
  const { rows } = await db.query(
    `INSERT INTO backup_execucao (origem, status, disparado_por, destino, sistema)
     VALUES ($1, 'rodando', $2, $3, 'clube')
     RETURNING *`,
    [origem, disparadoPor || null, destinoTexto(config)]
  );
  const execId = rows[0].id;
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "clube-backup-"));

  try {
    const pacote = await montarPacoteBackup(tmpDir, config);
    const backend = await backendSmb(config);
    await backend.enviar(config, pacote.local, pacote.nome);
    const retencao = await aplicarRetencao(config, backend, pacote.tamanho);

    await db.query(
      `UPDATE backup_execucao
       SET status = 'ok',
           concluido_em = NOW(),
           arquivo = $2,
           tamanho_bytes = $3,
           mantidos = $4,
           removidos = $5
       WHERE id = $1`,
      [execId, pacote.nome, pacote.tamanho, retencao.manter, retencao.removidos]
    );
    await db.query(
      `UPDATE config_backup
       SET ultimo_sucesso_em = NOW(), ultimo_erro = NULL
       WHERE id = 1`
    );

    return {
      ok: true,
      arquivo: pacote.nome,
      tamanhoBytes: pacote.tamanho,
      tamanhoDump: pacote.tamanhoDump,
      tamanhoUploads: pacote.uploadsBytes,
      destino: destinoTexto(config),
      mantidos: retencao.manter,
      removidos: retencao.removidos,
      arquivos: retencao.arquivos,
    };
  } catch (error) {
    const msg = error.message || String(error);
    await db.query(
      `UPDATE backup_execucao
       SET status = 'erro', concluido_em = NOW(), erro = $2
       WHERE id = $1`,
      [execId, msg]
    );
    await db.query(
      `UPDATE config_backup SET ultimo_erro = $1 WHERE id = 1`,
      [msg]
    );
    throw error;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    backupEmAndamento = false;
  }
}

function jaRodouHoje(ultimoSucessoEm) {
  if (!ultimoSucessoEm) return false;
  return dataBrasiliaISO(new Date(ultimoSucessoEm)) === dataBrasiliaISO();
}

function chegouHora(horaConfig) {
  const agora = partesBrasilia();
  const [h, m] = String(horaConfig).split(":").map(Number);
  return agora.hora > h || (agora.hora === h && agora.minuto >= m);
}

export async function talvezRodarBackupAgendado() {
  if (backupEmAndamento) return;
  const config = await obterConfigBackup();
  if (!config.ativo) return;
  if (jaRodouHoje(config.ultimoSucessoEm)) return;
  if (!chegouHora(config.hora)) return;
  try {
    await executarBackupClube({ origem: "agenda", disparadoPor: "agenda" });
  } catch (err) {
    console.error("[backup/agenda]", err.message);
  }
}

export function iniciarJobBackupClube() {
  if (jobTimer) return;
  jobTimer = setInterval(() => {
    talvezRodarBackupAgendado().catch((err) => {
      console.error("[backup/agenda]", err.message);
    });
    import("./backupRemotoService.js")
      .then(({ talvezDispararBackupRemoto, talvezConferirBackupRemoto }) =>
        Promise.all([
          talvezDispararBackupRemoto(),
          talvezConferirBackupRemoto(),
        ])
      )
      .catch((err) => {
        console.error("[backup/remoto]", err.message);
      });
  }, INTERVALO_AGENDA_MS);
  setTimeout(() => {
    talvezRodarBackupAgendado().catch(() => {});
  }, 20_000);
  console.log("[backup] agenda diária ativa (clube + WRPDV/ERP 02:00, conferência 06:30)");
}

export async function statusFerramentasBackup() {
  return {
    pgDump: await temBinario("pg_dump"),
    smbclient: await temBinario("smbclient"),
  };
}

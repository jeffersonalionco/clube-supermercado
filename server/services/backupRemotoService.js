import { getPool } from "../db.js";
import { dataBrasiliaISO, partesBrasilia } from "../utils/fusoBrasilia.js";
import {
  credenciaisSmb,
  chamarSmbWorker,
  obterConfigBackup,
} from "./backupClubeService.js";
import { sshExecutar } from "./backupSsh.js";

const SISTEMAS = {
  wrpdv: {
    id: "wrpdv",
    titulo: "WR PDV",
    pasta: "BKP_WRPDV",
    banco: "wrpdv",
  },
  erp: {
    id: "erp",
    titulo: "ERP (RP)",
    pasta: "BKP_ERP",
    banco: "erp",
  },
};

const DUMP_RE = /^(erp|wrpdv)-\d{8}-\d{6}\.dump$/i;

function horaValida(valor, padrao) {
  const m = String(valor || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return padrao;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return padrao;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function mapSistema(row) {
  const def = SISTEMAS[row?.id] || SISTEMAS.wrpdv;
  return {
    id: def.id,
    titulo: def.titulo,
    banco: def.banco,
    ativo: row?.ativo !== false,
    hora: horaValida(row?.hora, "02:00"),
    horaConferencia: horaValida(row?.hora_conferencia, "06:30"),
    pasta: String(row?.pasta || def.pasta).trim() || def.pasta,
    manter: Math.max(1, Number(row?.manter) || 1),
    ultimoSucessoEm: row?.ultimo_sucesso_em || null,
    ultimoErro: row?.ultimo_erro || null,
    ultimoArquivo: row?.ultimo_arquivo || null,
    ultimoBytes: row?.ultimo_bytes != null ? Number(row.ultimo_bytes) : null,
    ultimoDisparoEm: row?.ultimo_disparo_em || null,
    ultimoConferenciaEm: row?.ultimo_conferencia_em || null,
  };
}

function credenciaisSsh(smb) {
  return {
    host: String(process.env.BACKUP_SSH_HOST || smb.host || "10.1.1.195").trim(),
    username: String(
      process.env.BACKUP_SSH_USUARIO || smb.usuario || "Administrador"
    ).trim(),
    password: process.env.BACKUP_SSH_SENHA || smb.senha || "",
  };
}

function destinoTexto(smb, pasta) {
  return `\\\\${smb.host}\\${smb.share}\\${pasta}`;
}

function naJanela(horaConfig, duracaoMin = 15) {
  const agora = partesBrasilia();
  const [h, m] = String(horaConfig).split(":").map(Number);
  const agoraMin = agora.hora * 60 + agora.minuto;
  const alvo = h * 60 + m;
  return agoraMin >= alvo && agoraMin < alvo + duracaoMin;
}

function chegouHora(horaConfig) {
  const agora = partesBrasilia();
  const [h, m] = String(horaConfig).split(":").map(Number);
  return agora.hora > h || (agora.hora === h && agora.minuto >= m);
}

function mesmoDiaBrasilia(iso) {
  if (!iso) return false;
  return dataBrasiliaISO(new Date(iso)) === dataBrasiliaISO();
}

export async function obterSistemasBackup() {
  const { rows } = await getPool().query(
    `SELECT * FROM config_backup_sistema ORDER BY id`
  );
  return rows.map(mapSistema);
}

async function obterSistema(id) {
  const { rows } = await getPool().query(
    `SELECT * FROM config_backup_sistema WHERE id = $1`,
    [id]
  );
  if (!rows[0] || !SISTEMAS[id]) throw new Error("Sistema de backup inválido");
  return mapSistema(rows[0]);
}

async function listarPasta(smb, pasta) {
  const r = await chamarSmbWorker({
    comando: "list",
    config: { ...credenciaisSmb(smb), pasta },
  });
  return (r.arquivos || [])
    .map((a) => ({
      nome: String(a?.nome || "").split(/[/\\]/).pop(),
      tamanho: Number(a?.tamanho || 0),
    }))
    .filter((a) => DUMP_RE.test(a.nome) || /^last-status\.txt$/i.test(a.nome))
    .sort((a, b) => b.nome.localeCompare(a.nome));
}

async function lerStatusTxt(smb, pasta) {
  try {
    const r = await chamarSmbWorker({
      comando: "read",
      config: { ...credenciaisSmb(smb), pasta },
      nome: "last-status.txt",
    });
    return parseStatusTxt(r.conteudo || "");
  } catch {
    return null;
  }
}

function parseStatusTxt(texto) {
  const map = {};
  for (const linha of String(texto || "").split(/\r?\n/)) {
    const i = linha.indexOf("=");
    if (i < 1) continue;
    map[linha.slice(0, i).trim().toLowerCase()] = linha.slice(i + 1).trim();
  }
  if (!map.banco && !map.ok) return null;
  const ok = /^(true|1|sim|ok)$/i.test(map.ok || "");
  const bytes = Number(String(map.tamanho || "").replace(/[^\d]/g, "")) || 0;
  return {
    banco: map.banco || null,
    ok,
    inicio: map.inicio || null,
    fim: map.fim || null,
    arquivo: map.arquivo || null,
    tamanhoHumano: map.tamanho || null,
    erro: map.erro || null,
    maquina: map.maquina || null,
    bytes: /bytes/i.test(map.tamanho || "") ? bytes : 0,
  };
}

export async function apresentarBackupRemoto() {
  const smb = await obterConfigBackup();
  const sistemas = await obterSistemasBackup();
  const db = getPool();
  const detalhe = [];
  for (const sis of sistemas) {
    let arquivos = [];
    let status = null;
    try {
      arquivos = await listarPasta(smb, sis.pasta);
      status = await lerStatusTxt(smb, sis.pasta);
    } catch (err) {
      status = { ok: false, erro: err.message };
    }
    const { rows } = await db.query(
      `SELECT status FROM backup_execucao
       WHERE sistema = $1
       ORDER BY iniciado_em DESC
       LIMIT 1`,
      [sis.id]
    );
    detalhe.push({
      ...sis,
      destino: destinoTexto(smb, sis.pasta),
      arquivos: arquivos.filter((a) => DUMP_RE.test(a.nome)).slice(0, 6),
      statusArquivo: status,
      rodando: rows[0]?.status === "rodando",
    });
  }
  return {
    destinoRaiz: `\\\\${smb.host}\\${smb.share}`,
    sshHost: credenciaisSsh(smb).host,
    sistemas: detalhe,
  };
}

const PG_DUMP_CANDIDATOS = [
  "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\13\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\12\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\11\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\10\\bin\\pg_dump.exe",
  "C:\\Program Files\\PostgreSQL\\9.6\\bin\\pg_dump.exe",
  "C:\\Program Files (x86)\\PostgreSQL\\9.6\\bin\\pg_dump.exe",
  "C:\\Program Files (x86)\\pgAdmin III\\1.22\\pg_dump.exe",
  "D:\\Arquivos de programas\\pgAdmin III\\1.14\\pg_dump.exe",
];

function versaoPgDumpSuficiente(texto) {
  const m = String(texto || "").match(/(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major > 9) return true;
  return major === 9 && minor >= 6;
}

function compararVersaoPg(a, b) {
  const pa = String(a || "").match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  const pb = String(b || "").match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  const na = pa ? [Number(pa[1]), Number(pa[2]), Number(pa[3] || 0)] : [0, 0, 0];
  const nb = pb ? [Number(pb[1]), Number(pb[2]), Number(pb[3] || 0)] : [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    if (na[i] !== nb[i]) return na[i] - nb[i];
  }
  return 0;
}

function comandoDisparo(only) {
  const script = "D:\\_scripts-postgres\\backup-postgres.ps1";
  const onlyArg = only === "all" ? "all" : only;
  const tr =
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${script} -Only ${onlyArg}`;
  return (
    `schtasks /Create /TN ClubeBackupPostgres /F /SC DAILY /ST 02:00 /RU SYSTEM ` +
    `/TR "${tr}" & schtasks /Run /TN ClubeBackupPostgres`
  );
}

async function descobrirPgDump195(ssh) {
  const lista = PG_DUMP_CANDIDATOS.map((p) => p.replace(/'/g, "''")).join("','");
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @('${lista}')
foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    $v = (& $p --version 2>&1 | Out-String).Trim()
    Write-Output ($p + '|' + $v)
  }
}
`.trim();
  const b64 = Buffer.from(ps, "utf8").toString("base64");
  const r = await sshExecutar({
    ...ssh,
    timeoutMs: 40_000,
    comando:
      `powershell -NoProfile -Command "` +
      `$bytes = [Convert]::FromBase64String('${b64}'); ` +
      `$script = [Text.Encoding]::UTF8.GetString($bytes); ` +
      `Invoke-Expression $script"`,
  });
  const achados = String(r.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("|"))
    .map((l) => {
      const i = l.indexOf("|");
      return { path: l.slice(0, i), ver: l.slice(i + 1) };
    });
  if (!achados.length) return { path: PG_DUMP_CANDIDATOS[9], ver: "" };
  const ok = achados
    .filter((a) => versaoPgDumpSuficiente(a.ver))
    .sort((a, b) => compararVersaoPg(b.ver, a.ver));
  if (ok.length) return ok[0];
  return achados.sort((a, b) => compararVersaoPg(b.ver, a.ver))[0];
}

function credenciaisPgDump() {
  return {
    host: String(process.env.BACKUP_PG_HOST || "10.1.1.250").trim(),
    port: Number(process.env.BACKUP_PG_PORT || 5432) || 5432,
    user: String(process.env.BACKUP_PG_USER || "consulta").trim() || "consulta",
    password: String(process.env.BACKUP_PG_PASSWORD || "consulta"),
  };
}

function ps1Quote(valor) {
  return `'${String(valor ?? "").replace(/'/g, "''")}'`;
}

async function garantirConfig195(smb) {
  const ssh = credenciaisSsh(smb);
  const encontrado = await descobrirPgDump195(ssh);
  const dumpPath = encontrado.path || PG_DUMP_CANDIDATOS[9];
  const pg = credenciaisPgDump();
  const config = `# Gerado pelo Clube Superama+ — dump na 195, direto no disco D
$PgHost     = ${ps1Quote(pg.host)}
$PgPort     = ${pg.port}
$PgUser     = ${ps1Quote(pg.user)}
$PgPassword = ${ps1Quote(pg.password)}
$PgDumpPath = ${ps1Quote(dumpPath)}
$DestErp    = 'D:\\BKP_ERP'
$DestWrp    = 'D:\\BKP_WRPDV'
$StatusDir  = 'D:\\status'
$LogFile    = 'D:\\_scripts-postgres\\logs\\backup.log'
$KeepCopies = 1
`;
  const b64 = Buffer.from(config, "utf8").toString("base64");
  const cmd =
    `powershell -NoProfile -Command "` +
    `New-Item -ItemType Directory -Force -Path 'D:\\_scripts-postgres\\logs','D:\\BKP_ERP','D:\\BKP_WRPDV','D:\\status' | Out-Null; ` +
    `$bytes = [Convert]::FromBase64String('${b64}'); ` +
    `[IO.File]::WriteAllBytes('D:\\_scripts-postgres\\config.ps1', $bytes)"`;
  await sshExecutar({ ...ssh, comando: cmd, timeoutMs: 40_000 });
  return encontrado;
}

function exigirPgDumpCompativel(encontrado) {
  const verTxt = String(encontrado?.ver || "").trim();
  if (!verTxt) {
    throw new Error(
      "pg_dump não encontrado na 195. Instale o cliente PostgreSQL 9.6 ou mais novo (Command Line Tools)."
    );
  }
  if (!versaoPgDumpSuficiente(verTxt)) {
    throw new Error(
      `${verTxt}. O banco em 10.1.1.250 é PostgreSQL 9.6.21. O pgAdmin 3 só traz pg_dump 9.5 e recusa o dump. Instale o PostgreSQL 9.6 ou mais novo na 195 (Command Line Tools), não só o pgAdmin 3.`
    );
  }
  return verTxt;
}

export async function dispararBackupRemoto({
  sistema = "all",
  origem = "manual",
  disparadoPor = "",
} = {}) {
  const ids = sistema === "all" ? ["erp", "wrpdv"] : [sistema];
  if (ids.some((id) => !SISTEMAS[id])) {
    throw new Error("Sistema de backup inválido");
  }

  const smb = await obterConfigBackup();
  const ssh = credenciaisSsh(smb);
  if (!ssh.password) {
    throw new Error("Senha SSH/SMB da 195 não configurada");
  }

  const encontrado = await garantirConfig195(smb);
  try {
    exigirPgDumpCompativel(encontrado);
  } catch (err) {
    const msg = err.message || String(err);
    const db = getPool();
    for (const id of ids) {
      await db.query(
        `UPDATE config_backup_sistema SET ultimo_erro = $1 WHERE id = $2`,
        [msg, id]
      );
    }
    throw err;
  }

  const only = sistema === "all" ? "all" : sistema;
  const db = getPool();
  const resultados = [];

  for (const id of ids) {
    const sis = await obterSistema(id);
    const { rows } = await db.query(
      `INSERT INTO backup_execucao (origem, status, disparado_por, destino, sistema)
       VALUES ($1, 'rodando', $2, $3, $4)
       RETURNING id`,
      [origem, disparadoPor || null, destinoTexto(smb, sis.pasta), id]
    );
    const execId = rows[0].id;
    await db.query(
      `UPDATE config_backup_sistema
       SET ultimo_disparo_em = NOW(), ultimo_erro = NULL
       WHERE id = $1`,
      [id]
    );
    resultados.push({ id, execId, destino: destinoTexto(smb, sis.pasta) });
  }

  try {
    await sshExecutar({
      ...ssh,
      timeoutMs: 45_000,
      comando: comandoDisparo(only),
    });
  } catch (err) {
    const msg = err.message || String(err);
    for (const r of resultados) {
      await db.query(
        `UPDATE backup_execucao
         SET status = 'erro', concluido_em = NOW(), erro = $2
         WHERE id = $1`,
        [r.execId, msg]
      );
      await db.query(
        `UPDATE config_backup_sistema SET ultimo_erro = $1 WHERE id = $2`,
        [msg, r.id]
      );
    }
    throw err;
  }

  return {
    ok: true,
    mensagem:
      "Comando enviado à 195. O dump grava direto em D:\\BKP_WRPDV e D:\\BKP_ERP (pode levar horas).",
    disparos: resultados,
  };
}

export async function conferirBackupRemoto({ origem = "conferencia" } = {}) {
  const smb = await obterConfigBackup();
  const sistemas = await obterSistemasBackup();
  const db = getPool();
  const conferidos = [];

  for (const sis of sistemas) {
    const status = await lerStatusTxt(smb, sis.pasta).catch(() => null);
    const { rows: abertas } = await db.query(
      `SELECT id FROM backup_execucao
       WHERE sistema = $1 AND status = 'rodando'
       ORDER BY iniciado_em DESC
       LIMIT 1`,
      [sis.id]
    );
    const execId = abertas[0]?.id;

    const inicioHoje = status?.inicio && mesmoDiaBrasilia(status.inicio);
    const okHoje = Boolean(status?.ok && (inicioHoje || mesmoDiaBrasilia(status.fim)));

    if (okHoje) {
      if (execId) {
        await db.query(
          `UPDATE backup_execucao
           SET status = 'ok',
               concluido_em = NOW(),
               arquivo = $2,
               erro = NULL
           WHERE id = $1`,
          [execId, status.arquivo]
        );
      } else if (!mesmoDiaBrasilia(sis.ultimoSucessoEm)) {
        await db.query(
          `INSERT INTO backup_execucao (origem, status, disparado_por, destino, sistema, arquivo, concluido_em)
           VALUES ($1, 'ok', 'conferencia', $2, $3, $4, NOW())`,
          [origem, destinoTexto(smb, sis.pasta), sis.id, status.arquivo]
        );
      }
      await db.query(
        `UPDATE config_backup_sistema
         SET ultimo_sucesso_em = NOW(),
             ultimo_erro = NULL,
             ultimo_arquivo = $2,
             ultimo_bytes = $3,
             ultimo_conferencia_em = NOW()
         WHERE id = $1`,
        [sis.id, status.arquivo, status.bytes || null]
      );
      conferidos.push({ id: sis.id, ok: true, arquivo: status.arquivo });
      continue;
    }

    const disparouHoje = mesmoDiaBrasilia(sis.ultimoDisparoEm);
    if (execId && !chegouHora(sis.horaConferencia)) {
      conferidos.push({ id: sis.id, ok: null, pendente: true });
      continue;
    }
    if (!disparouHoje && !chegouHora(sis.horaConferencia)) {
      conferidos.push({ id: sis.id, ok: null, arquivo: null });
      continue;
    }

    const erro =
      status?.erro ||
      (disparouHoje
        ? "Backup disparado, mas ainda sem arquivo ok na pasta (conferir log na 195)."
        : "Não houve backup de hoje nesta pasta.");

    if (execId) {
      await db.query(
        `UPDATE backup_execucao
         SET status = 'erro', concluido_em = NOW(), erro = $2
         WHERE id = $1`,
        [execId, erro]
      );
    } else if (chegouHora(sis.horaConferencia) && !mesmoDiaBrasilia(sis.ultimoSucessoEm)) {
      await db.query(
        `INSERT INTO backup_execucao (origem, status, disparado_por, destino, sistema, erro, concluido_em)
         VALUES ($1, 'erro', 'conferencia', $2, $3, $4, NOW())`,
        [origem, destinoTexto(smb, sis.pasta), sis.id, erro]
      );
    }
    await db.query(
      `UPDATE config_backup_sistema
       SET ultimo_erro = $1, ultimo_conferencia_em = NOW()
       WHERE id = $2`,
      [erro, sis.id]
    );
    conferidos.push({ id: sis.id, ok: false, erro });
  }

  return { ok: true, conferidos };
}

export async function talvezDispararBackupRemoto() {
  const sistemas = await obterSistemasBackup();
  const ativos = sistemas.filter((s) => s.ativo);
  if (!ativos.length) return;
  if (!ativos.some((s) => naJanela(s.hora, 15))) return;
  if (ativos.every((s) => mesmoDiaBrasilia(s.ultimoDisparoEm))) return;
  const pendentes = ativos.filter((s) => !mesmoDiaBrasilia(s.ultimoDisparoEm));
  const sistema =
    pendentes.length === 2 || pendentes.length === ativos.length ? "all" : pendentes[0].id;
  try {
    await dispararBackupRemoto({ origem: "agenda", disparadoPor: "agenda", sistema });
  } catch (err) {
    console.error("[backup/remoto]", err.message);
  }
}

export async function talvezConferirBackupRemoto() {
  const sistemas = await obterSistemasBackup();
  const naHora = sistemas.filter((s) => s.ativo && naJanela(s.horaConferencia, 20));
  if (!naHora.length) return;
  if (naHora.every((s) => mesmoDiaBrasilia(s.ultimoConferenciaEm))) return;
  try {
    await conferirBackupRemoto({ origem: "conferencia" });
  } catch (err) {
    console.error("[backup/conferencia]", err.message);
  }
}

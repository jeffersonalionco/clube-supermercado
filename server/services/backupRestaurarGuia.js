import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const GITHUB_PADRAO = "https://github.com/jeffersonalionco/clube-supermercado.git";

const CHAVES_ENV = [
  ["Obrigatórias para o clube subir", [
    "PORT",
    "HOST",
    "PG_HOST",
    "PG_PORT",
    "PG_USER",
    "PG_PASSWORD",
    "PG_DATABASE",
    "SESSION_SECRET",
    "ADMIN_SESSION_SECRET",
    "ADMIN_USUARIO",
    "ADMIN_SENHA_HASH",
    "ADMIN_SENHA",
    "TZ",
  ]],
  ["Integrações da loja (RP / WR PDV / cadastro)", [
    "API_BASE_URL",
    "API_USUARIO",
    "API_SENHA",
    "AUTH_TOKEN_HEADER",
    "WRPDV_HOST",
    "WRPDV_PORT",
    "WRPDV_USER",
    "WRPDV_PASSWORD",
    "WRPDV_DATABASE",
    "CADASTRO_UF",
    "CADASTRO_CEP",
    "CADASTRO_CIDADE",
    "CADASTRO_UNIDADE",
    "CADASTRO_VENDEDOR",
    "APP_PUBLIC_URL",
  ]],
  ["E-mail, WhatsApp, Meta, TV, padaria, backup", [
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM",
    "WHATSAPP_CLOUD_TOKEN",
    "WHATSAPP_CLOUD_PHONE_NUMBER_ID",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "META_PIXEL_ID",
    "META_CAPI_TOKEN",
    "META_CATALOG_ID",
    "TV_SLIDES_URL",
    "PADARIA_IMPRESSORA_HOST",
    "PADARIA_IMPRESSORA_PORTA",
    "BACKUP_SMB_HOST",
    "BACKUP_SMB_SHARE",
    "BACKUP_SMB_PASTA",
    "BACKUP_SMB_USUARIO",
    "BACKUP_SMB_SENHA",
    "LOJA_RAZAO_SOCIAL",
    "LOJA_NOME_FANTASIA",
    "LOJA_CNPJ",
  ]],
];

export async function obterUrlGithub(repoRoot) {
  const envUrl = String(process.env.BACKUP_GITHUB_URL || "").trim();
  if (envUrl) return envUrl;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoRoot, "remote", "get-url", "origin"],
      { timeout: 8000 }
    );
    const url = String(stdout || "").trim();
    if (url) return url;
  } catch {
    /* usa o padrão */
  }
  return GITHUB_PADRAO;
}

export function chavesEnvDefinidas() {
  const vistas = new Set();
  const definidas = [];
  for (const [, chaves] of CHAVES_ENV) {
    for (const chave of chaves) {
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      if (String(process.env[chave] || "").length > 0) definidas.push(chave);
    }
  }
  return definidas;
}

export function montarGuiaRestaurar({
  geradoEm,
  github,
  pgHost,
  pgPort,
  pgUser,
  pgDatabase,
  destino,
  hostname,
  nodeVersion,
} = {}) {
  const blocosEnv = CHAVES_ENV.map(([titulo, chaves]) => {
    const linhas = chaves.map((chave) => {
      const tem = String(process.env[chave] || "").length > 0;
      return `  - ${chave}${tem ? "  (estava preenchida nesta máquina)" : ""}`;
    });
    return `${titulo}:\n${linhas.join("\n")}`;
  }).join("\n\n");

  return `Clube Superama+ — como restaurar este backup
==============================================

Gerado em: ${geradoEm || "—"}
Máquina de origem: ${hostname || "—"}
Node.js na origem: ${nodeVersion || "—"}
Destino deste arquivo: ${destino || "\\\\10.1.1.195\\backup\\clube"}

Este pacote NÃO é o código-fonte. Ele traz os DADOS:
  - banco.dump          PostgreSQL do clube (clientes, pontos, pedidos, configs)
  - uploads/            fotos da padaria, brindes, novidades e marketing
  - env.exemplo.txt     modelo de server/.env (sem senhas)
  - MANIFEST.json       resumo técnico deste pacote
  - RESTAURAR.txt       este arquivo

NÃO entra neste backup:
  - código-fonte (está no GitHub)
  - server/.env com senhas (por segurança; copie da máquina antiga se ainda existir)
  - banco WR PDV (caixa) e o ERP/RP

1) Código-fonte (GitHub)
------------------------
Repositório: ${github || GITHUB_PADRAO}

  git clone ${github || GITHUB_PADRAO}
  cd clube-supermercado
  npm run install:all

2) Arquivo .env
---------------
Copie o .env da máquina antiga, se ainda tiver:

  cp /caminho/antigo/server/.env server/.env

Senão:

  cp server/.env.example server/.env
  # ou use o env.exemplo.txt deste pacote

Preencha no mínimo o PostgreSQL e os segredos de sessão/admin.
A lista abaixo marca o que estava definido na origem (sem revelar o valor):

${blocosEnv}

Valores típicos desta loja (confira no .env antigo):
  PG_HOST=localhost
  PG_PORT=5432
  PG_USER=postgres
  PG_DATABASE=${pgDatabase || "superamamais"}
  PORT=3001
  HOST=0.0.0.0
  TZ=America/Sao_Paulo
  API_BASE_URL=http://10.1.1.198:9000
  WRPDV_HOST=10.1.1.250
  WRPDV_DATABASE=wrpdv

3) Banco PostgreSQL
-------------------
Crie o banco vazio (o nome deve ser o mesmo do PG_DATABASE):

  sudo -u postgres createdb ${pgDatabase || "superamamais"}

Restaure o dump custom do pacote:

  pg_restore -h ${pgHost || "localhost"} -p ${pgPort || "5432"} -U ${pgUser || "postgres"} \\
    -d ${pgDatabase || "superamamais"} --no-owner --role=${pgUser || "postgres"} banco.dump

Se o banco já existir e quiser substituir:

  pg_restore -h ${pgHost || "localhost"} -p ${pgPort || "5432"} -U ${pgUser || "postgres"} \\
    -d ${pgDatabase || "superamamais"} --clean --if-exists --no-owner banco.dump

4) Imagens
----------
A pasta uploads deste pacote vai para server/uploads do projeto:

  rm -rf server/uploads
  cp -a uploads server/uploads

5) Subir o clube
----------------
Na pasta do projeto:

  npm run dev

Ou, como nesta loja, com PM2 (processo "clube"):

  cd /caminho/clube-supermercado
  pm2 start npm --name clube -- run dev

O servidor escuta na porta 3001. O Node precisa de --openssl-legacy-provider
(já está no npm run dev / start do server) por causa do SMB/NTLM do backup.

6) Conferir
-----------
  - site / clube abre
  - login de cliente e admin
  - fotos da padaria, brindes e novidades aparecem
  - Admin → Backup: testar pasta e agenda

Em caso de dúvida, abra também server/.env.example no GitHub.
`;
}

export function montarManifesto(dados) {
  return {
    app: "Clube Superama+",
    tipo: "backup-completo",
    geradoEm: dados.geradoEm,
    hostname: dados.hostname || os.hostname(),
    nodeVersion: process.version,
    github: dados.github,
    destino: dados.destino,
    postgres: {
      host: dados.pgHost,
      port: dados.pgPort,
      usuario: dados.pgUser,
      banco: dados.pgDatabase,
      formatoDump: "custom (-Fc)",
      arquivo: "banco.dump",
    },
    imagens: {
      pastaNoPacote: "uploads/",
      destinoNoCodigo: "server/uploads/",
      bytesOrigem: dados.uploadsBytes || 0,
    },
    envChavesDefinidas: chavesEnvDefinidas(),
    naoInclui: ["codigo-fonte", "server/.env (senhas)", "WR PDV", "ERP/RP"],
  };
}

import pg from "pg";

const { Pool } = pg;

function dbName() {
  return process.env.PG_DATABASE || "superama";
}

function poolConfig(database) {
  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "postgres",
    database,
  };
}

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool(poolConfig(dbName()));
  }
  return pool;
}

async function ensureDatabase() {
  const admin = new Pool(poolConfig("postgres"));

  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName()]
    );

    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${dbName()}`);
      console.log(`Banco "${dbName()}" criado.`);
    }
  } finally {
    await admin.end();
  }
}

async function ensureSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS usuario (
      id SERIAL PRIMARY KEY,
      cpf VARCHAR(14) NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      cliente_codigo INTEGER,
      nome VARCHAR(255),
      dados_api JSONB,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_usuario_cpf ON usuario (cpf);

    CREATE TABLE IF NOT EXISTS pontos_conta (
      cpf VARCHAR(14) PRIMARY KEY,
      saldo_pontos INTEGER NOT NULL DEFAULT 0,
      valor_pendente NUMERIC(12, 2) NOT NULL DEFAULT 0,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pontos_movimento (
      id SERIAL PRIMARY KEY,
      cpf VARCHAR(14) NOT NULL,
      numero_dcto VARCHAR(64) NOT NULL,
      data_venda DATE,
      valor_compra NUMERIC(12, 2) NOT NULL DEFAULT 0,
      processado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cpf, numero_dcto)
    );

    CREATE INDEX IF NOT EXISTS idx_pontos_movimento_cpf ON pontos_movimento (cpf);
    CREATE INDEX IF NOT EXISTS idx_pontos_movimento_data ON pontos_movimento (cpf, data_venda DESC);

    CREATE TABLE IF NOT EXISTS pontos_baixa (
      id SERIAL PRIMARY KEY,
      cpf VARCHAR(14) NOT NULL,
      pontos INTEGER NOT NULL,
      saldo_antes INTEGER NOT NULL,
      saldo_depois INTEGER NOT NULL,
      observacao TEXT NOT NULL,
      admin_usuario VARCHAR(100) NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pontos_baixa_cpf ON pontos_baixa (cpf);
    CREATE INDEX IF NOT EXISTS idx_pontos_baixa_criado ON pontos_baixa (criado_em DESC);

    CREATE TABLE IF NOT EXISTS brindes (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(200) NOT NULL,
      descricao TEXT,
      imagem_url TEXT,
      valor NUMERIC(12, 2),
      pontos INTEGER NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_brindes_ativo ON brindes (ativo);
    CREATE INDEX IF NOT EXISTS idx_brindes_pontos ON brindes (pontos);

    CREATE TABLE IF NOT EXISTS conteudo_legal (
      slug VARCHAR(40) PRIMARY KEY,
      titulo VARCHAR(200) NOT NULL,
      conteudo TEXT NOT NULL,
      admin_usuario VARCHAR(100) NOT NULL DEFAULT 'sistema',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await migrarPontosLegado(db);
  await migrarPontosCancelamento(db);
  await migrarPontosInelegivel(db);
  await migrarPontosEstorno(db);
  await migrarBrindesEstoque(db);
  await migrarUsuarioAceiteLegal(db);
  await migrarPontosLotes(db);
  await migrarClienteAuditoria(db);
  await migrarResgateComprovante(db);
  await migrarPainelAdmin(db);
  await migrarConfigPrograma(db);
  await migrarConfigConteudo(db);
  await migrarSenhaRecuperacao(db);
  await migrarNovidades(db);

  const { seedAdministradorDoEnv } = await import("./services/painelAdminService.js");
  await seedAdministradorDoEnv();

  const { seedConteudoLegal } = await import("./services/legalService.js");
  await seedConteudoLegal();
}

async function migrarPontosLotes(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pontos_lote (
      id SERIAL PRIMARY KEY,
      cpf VARCHAR(14) NOT NULL,
      saldo_restante INTEGER NOT NULL DEFAULT 1,
      earned_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      expirado_em TIMESTAMPTZ,
      origin_movimento_id INTEGER REFERENCES pontos_movimento(id) ON DELETE SET NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pontos_lote_cpf_fifo
    ON pontos_lote (cpf, earned_at ASC, id ASC)
    WHERE expirado_em IS NULL AND saldo_restante > 0
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pontos_lote_expira
    ON pontos_lote (cpf, expires_at)
    WHERE expirado_em IS NULL AND saldo_restante > 0
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS pontos_baixa_lote (
      baixa_id INTEGER NOT NULL REFERENCES pontos_baixa(id) ON DELETE CASCADE,
      lote_id INTEGER NOT NULL REFERENCES pontos_lote(id) ON DELETE CASCADE,
      pontos INTEGER NOT NULL,
      PRIMARY KEY (baixa_id, lote_id)
    )
  `);

  await db.query(`
    ALTER TABLE pontos_baixa
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) NOT NULL DEFAULT 'resgate'
  `);

  await db.query(`
    UPDATE pontos_baixa
    SET tipo = 'manual'
    WHERE brinde_id IS NULL AND tipo != 'expiracao'
  `);
}

async function migrarResgateComprovante(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS resgate_comprovante (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(10) NOT NULL UNIQUE,
      cpf VARCHAR(14) NOT NULL,
      cliente_nome VARCHAR(255),
      pontos_total INTEGER NOT NULL,
      saldo_antes INTEGER NOT NULL,
      saldo_depois INTEGER NOT NULL,
      observacao TEXT,
      admin_usuario VARCHAR(100) NOT NULL,
      assinatura_confirmada_em TIMESTAMPTZ,
      assinatura_admin_usuario VARCHAR(100),
      assinatura_observacao TEXT,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_resgate_comprovante_cpf
    ON resgate_comprovante (cpf, criado_em DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_resgate_comprovante_codigo
    ON resgate_comprovante (codigo)
  `);

  await db.query(`
    ALTER TABLE pontos_baixa
    ADD COLUMN IF NOT EXISTS comprovante_id INTEGER REFERENCES resgate_comprovante(id) ON DELETE SET NULL
  `);
}

async function migrarPainelAdmin(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS painel_admin (
      id SERIAL PRIMARY KEY,
      usuario VARCHAR(50) NOT NULL UNIQUE,
      nome VARCHAR(100) NOT NULL,
      senha_hash TEXT NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_painel_admin_ativo
    ON painel_admin (usuario)
    WHERE ativo = true
  `);
}

async function migrarClienteAuditoria(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cliente_auditoria (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
      cpf VARCHAR(14) NOT NULL,
      evento VARCHAR(50) NOT NULL,
      sucesso BOOLEAN NOT NULL DEFAULT TRUE,
      ip VARCHAR(45),
      user_agent TEXT,
      dispositivo VARCHAR(40),
      navegador VARCHAR(40),
      sistema VARCHAR(40),
      detalhes JSONB,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cliente_auditoria_cpf
    ON cliente_auditoria (cpf, criado_em DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cliente_auditoria_evento
    ON cliente_auditoria (cpf, evento, criado_em DESC)
  `);
}

async function migrarUsuarioAceiteLegal(db) {
  await db.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS aceite_regulamento_em TIMESTAMPTZ
  `);
  await db.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS aceite_privacidade_em TIMESTAMPTZ
  `);
}

async function migrarBrindesEstoque(db) {
  await db.query(`
    ALTER TABLE brindes
    ADD COLUMN IF NOT EXISTS estoque INTEGER NOT NULL DEFAULT 0
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS brindes_estoque_movimento (
      id SERIAL PRIMARY KEY,
      brinde_id INTEGER NOT NULL REFERENCES brindes(id) ON DELETE CASCADE,
      operacao VARCHAR(20) NOT NULL,
      quantidade INTEGER NOT NULL,
      estoque_antes INTEGER NOT NULL,
      estoque_depois INTEGER NOT NULL,
      observacao TEXT,
      admin_usuario VARCHAR(100) NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_brindes_estoque_mov_brinde
    ON brindes_estoque_movimento (brinde_id, criado_em DESC)
  `);

  await db.query(`
    ALTER TABLE brindes
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(100)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_brindes_categoria ON brindes (categoria)
  `);

  await db.query(`
    ALTER TABLE pontos_baixa
    ADD COLUMN IF NOT EXISTS brinde_id INTEGER REFERENCES brindes(id) ON DELETE SET NULL
  `);
  await db.query(`
    ALTER TABLE pontos_baixa
    ADD COLUMN IF NOT EXISTS brinde_nome VARCHAR(200)
  `);
  await db.query(`
    ALTER TABLE pontos_baixa
    ADD COLUMN IF NOT EXISTS brinde_imagem_url TEXT
  `);
}

async function migrarPontosEstorno(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pontos_estorno (
      id SERIAL PRIMARY KEY,
      cpf VARCHAR(14) NOT NULL,
      numero_dcto VARCHAR(64) NOT NULL,
      pontos INTEGER NOT NULL DEFAULT 0,
      valor_compra NUMERIC(12, 2),
      data_venda DATE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (cpf, numero_dcto)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pontos_estorno_cpf
    ON pontos_estorno (cpf, criado_em DESC)
  `);
}

async function migrarPontosInelegivel(db) {
  await db.query(`
    ALTER TABLE pontos_movimento
    ADD COLUMN IF NOT EXISTS inelegivel_motivo VARCHAR(32)
  `);
  await db.query(`DROP INDEX IF EXISTS idx_pontos_movimento_ativos`);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pontos_movimento_ativos
    ON pontos_movimento (cpf, data_venda DESC)
    WHERE cancelado_em IS NULL AND inelegivel_motivo IS NULL
  `);
}

async function migrarPontosCancelamento(db) {
  await db.query(`
    ALTER TABLE pontos_movimento
    ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_pontos_movimento_ativos
    ON pontos_movimento (cpf, data_venda DESC)
    WHERE cancelado_em IS NULL
  `);
}

async function migrarPontosLegado(db) {
  const { rows } = await db.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'pontos_movimento'
       AND column_name = 'pontos'
     LIMIT 1`
  );

  if (!rows.length) return;

  await db.query(`ALTER TABLE pontos_movimento DROP COLUMN IF EXISTS pontos`);
  await db.query(`TRUNCATE pontos_movimento`);
  await db.query(`TRUNCATE pontos_conta`);
  console.log("Pontos: modelo migrado para saldo acumulado.");
}

async function migrarConfigPrograma(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS config_programa (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      pontos_habilitado BOOLEAN NOT NULL DEFAULT false,
      pontos_habilitado_em TIMESTAMPTZ,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por VARCHAR(100)
    )
  `);

  await db.query(`
    INSERT INTO config_programa (id, pontos_habilitado)
    VALUES (1, false)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function migrarConfigConteudo(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS config_conteudo (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      video_home_url TEXT NOT NULL DEFAULT '',
      video_home_titulo VARCHAR(200) NOT NULL DEFAULT '',
      video_home_ativo BOOLEAN NOT NULL DEFAULT false,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_por VARCHAR(100)
    )
  `);

  await db.query(`
    INSERT INTO config_conteudo (id, video_home_url, video_home_titulo, video_home_ativo)
    VALUES (1, '', '', false)
    ON CONFLICT (id) DO NOTHING
  `);
}

async function migrarSenhaRecuperacao(db) {
  await db.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS senha_versao INTEGER NOT NULL DEFAULT 1
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS senha_recuperacao (
      id BIGSERIAL PRIMARY KEY,
      cpf VARCHAR(14) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      codigo_hash VARCHAR(64) NOT NULL,
      email_destino VARCHAR(255),
      expira_em TIMESTAMPTZ NOT NULL,
      usado_em TIMESTAMPTZ,
      tentativas INTEGER NOT NULL DEFAULT 0,
      ip VARCHAR(64),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_senha_recuperacao_cpf_criado
    ON senha_recuperacao (cpf, criado_em DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_senha_recuperacao_ativos
    ON senha_recuperacao (cpf)
    WHERE usado_em IS NULL
  `);
}

async function migrarNovidades(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS novidade (
      id SERIAL PRIMARY KEY,
      titulo VARCHAR(160) NOT NULL,
      resumo VARCHAR(400) NOT NULL DEFAULT '',
      corpo TEXT NOT NULL,
      imagem_url VARCHAR(500),
      ativo BOOLEAN NOT NULL DEFAULT true,
      publicado_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_novidade_ativo_pub
    ON novidade (ativo, publicado_em DESC NULLS LAST, id DESC)
  `);
}

export async function initDatabase() {
  await ensureDatabase();
  await ensureSchema();
  console.log(`PostgreSQL conectado (banco: ${dbName()}).`);
}

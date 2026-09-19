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
  await migrarMarketing(db);
  await migrarPadaria(db);

  const { seedAdministradorDoEnv } = await import("./services/painelAdminService.js");
  await seedAdministradorDoEnv();

  const { seedConteudoLegal } = await import("./services/legalService.js");
  await seedConteudoLegal();
}

async function migrarPadaria(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_usuario (
      id SERIAL PRIMARY KEY,
      login VARCHAR(80) NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      nome VARCHAR(200) NOT NULL,
      papel VARCHAR(20) NOT NULL CHECK (papel IN ('atendente', 'padaria', 'gestor')),
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_produto (
      codigo VARCHAR(40) PRIMARY KEY,
      nome_rp VARCHAR(255) NOT NULL,
      nome_catalogo VARCHAR(255),
      preco NUMERIC(12, 2) NOT NULL DEFAULT 0,
      unidade_medida VARCHAR(10) NOT NULL DEFAULT 'UN',
      venda_por_kg BOOLEAN NOT NULL DEFAULT false,
      ativo_rp BOOLEAN NOT NULL DEFAULT true,
      ativo_catalogo BOOLEAN NOT NULL DEFAULT false,
      descricao TEXT,
      cobertura TEXT,
      recheio TEXT,
      imagem_url TEXT,
      departamento_codigo VARCHAR(40),
      grupo VARCHAR(120),
      dados_rp JSONB,
      sincronizado_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_produto_catalogo
    ON padaria_produto (ativo_catalogo, ativo_rp, nome_catalogo, nome_rp)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_categoria (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(80) NOT NULL UNIQUE,
      slug VARCHAR(80) NOT NULL UNIQUE,
      ordem INTEGER NOT NULL DEFAULT 0,
      cor VARCHAR(20) NOT NULL DEFAULT '#0f766e',
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE padaria_produto
    ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES padaria_categoria(id) ON DELETE SET NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_produto_categoria
    ON padaria_produto (categoria_id)
  `);

  {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM padaria_categoria`
    );
    if (!rows[0]?.n) {
      const seeds = [
        ["Bolos", "bolos", 10, "#b45309"],
        ["Lanches", "lanches", 20, "#0f766e"],
        ["Salgados", "salgados", 30, "#c2410c"],
        ["Pães", "paes", 40, "#a16207"],
        ["Doces", "doces", 50, "#be185d"],
        ["Bebidas", "bebidas", 60, "#1d4ed8"],
      ];
      for (const [nome, slug, ordem, cor] of seeds) {
        await db.query(
          `INSERT INTO padaria_categoria (nome, slug, ordem, cor)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (slug) DO NOTHING`,
          [nome, slug, ordem, cor]
        );
      }
    }
  }

  await db.query(`
    ALTER TABLE padaria_produto
    ADD COLUMN IF NOT EXISTS origem VARCHAR(20)
  `);

  /* Remove catálogo da sync em massa antiga — só permanecem cadastros manuais por código. */
  await db.query(`
    UPDATE padaria_produto SET origem = 'sync' WHERE origem IS NULL
  `);
  await db.query(`
    DELETE FROM padaria_produto WHERE origem <> 'manual'
  `);
  await db.query(`
    ALTER TABLE padaria_produto
    ALTER COLUMN origem SET DEFAULT 'manual'
  `);
  await db.query(`
    DO $$
    BEGIN
      ALTER TABLE padaria_produto ALTER COLUMN origem SET NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END $$
  `);

  await db.query(`
    ALTER TABLE padaria_produto
    ADD COLUMN IF NOT EXISTS sync_meta_catalog BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS meta_preco_enviado NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS meta_sync_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS meta_sync_erro TEXT
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_produto_meta_sync
    ON padaria_produto (sync_meta_catalog)
    WHERE sync_meta_catalog = TRUE
  `);

  /* Bolo abacaxi com coco — marcado para catálogo WhatsApp/Meta */
  await db.query(`
    UPDATE padaria_produto
       SET sync_meta_catalog = TRUE,
           ativo_catalogo = TRUE,
           atualizado_em = NOW()
     WHERE codigo = '618705'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_pedido (
      id SERIAL PRIMARY KEY,
      codigo_publico VARCHAR(32) NOT NULL UNIQUE,
      cliente_nome VARCHAR(200) NOT NULL,
      cliente_cpf VARCHAR(14),
      cliente_telefone VARCHAR(30),
      data_retirada DATE NOT NULL,
      hora_retirada TIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'novo'
        CHECK (status IN ('novo', 'em_producao', 'pronto', 'entregue', 'cancelado')),
      observacao TEXT,
      criado_por INTEGER REFERENCES padaria_usuario(id),
      pronto_em TIMESTAMPTZ,
      pronto_por INTEGER REFERENCES padaria_usuario(id),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_pedido_status_data
    ON padaria_pedido (status, data_retirada, hora_retirada)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_pedido_data
    ON padaria_pedido (data_retirada DESC, criado_em DESC)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_pedido_item (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES padaria_pedido(id) ON DELETE CASCADE,
      produto_codigo VARCHAR(40) NOT NULL,
      nome_snapshot VARCHAR(255) NOT NULL,
      quantidade NUMERIC(12, 3) NOT NULL,
      preco_unitario NUMERIC(12, 2) NOT NULL,
      unidade VARCHAR(10) NOT NULL DEFAULT 'UN',
      subtotal NUMERIC(12, 2) NOT NULL,
      cobertura TEXT,
      recheio TEXT,
      obs_item TEXT
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_pedido_item_pedido
    ON padaria_pedido_item (pedido_id)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_config (
      chave VARCHAR(80) PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  /* Uma vez: zera produtos herdados da sync em massa do departamento. */
  {
    const jaLimpou = await db.query(
      `SELECT 1 FROM padaria_config WHERE chave = 'limpeza_produtos_sync_v2' LIMIT 1`
    );
    if (!jaLimpou.rowCount) {
      await db.query(`DELETE FROM padaria_produto`);
      await db.query(
        `INSERT INTO padaria_config (chave, valor, atualizado_em)
         VALUES ('limpeza_produtos_sync_v2', 'ok', NOW())`
      );
    }
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_pedido_seq (
      ano INTEGER PRIMARY KEY,
      ultimo INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.query(`
    ALTER TABLE padaria_pedido
    ADD COLUMN IF NOT EXISTS entregue_em TIMESTAMPTZ
  `);
  await db.query(`
    ALTER TABLE padaria_pedido
    ADD COLUMN IF NOT EXISTS entregue_por INTEGER REFERENCES padaria_usuario(id)
  `);
  await db.query(`
    ALTER TABLE padaria_pedido
    ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ
  `);
  await db.query(`
    ALTER TABLE padaria_pedido
    ADD COLUMN IF NOT EXISTS cancelado_por INTEGER REFERENCES padaria_usuario(id)
  `);
  await db.query(`
    ALTER TABLE padaria_pedido
    ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_pedido_telefone
    ON padaria_pedido (cliente_telefone)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_pedido_codigo
    ON padaria_pedido (codigo_publico)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_pedido_status
    ON padaria_pedido (status)
  `);

  await db.query(`
    ALTER TABLE padaria_usuario
    ADD COLUMN IF NOT EXISTS ultimo_acesso_em TIMESTAMPTZ
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_auditoria (
      id BIGSERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES padaria_usuario(id) ON DELETE SET NULL,
      usuario_nome VARCHAR(200),
      acao VARCHAR(80) NOT NULL,
      entidade VARCHAR(80) NOT NULL,
      entidade_id VARCHAR(80),
      dados JSONB,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_auditoria_criado
    ON padaria_auditoria (criado_em DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_auditoria_entidade
    ON padaria_auditoria (entidade, entidade_id)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS padaria_produto_decoracao (
      id SERIAL PRIMARY KEY,
      produto_codigo VARCHAR(40)
        REFERENCES padaria_produto(codigo) ON DELETE CASCADE,
      codigo VARCHAR(40),
      nome VARCHAR(160) NOT NULL,
      descricao TEXT,
      imagem_url TEXT,
      ordem INTEGER NOT NULL DEFAULT 100,
      ativo BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    ALTER TABLE padaria_produto_decoracao
    ALTER COLUMN produto_codigo DROP NOT NULL
  `);
  await db.query(`
    ALTER TABLE padaria_produto_decoracao
    ADD COLUMN IF NOT EXISTS preco NUMERIC(12,2) NOT NULL DEFAULT 0
  `);
  await db.query(`
    ALTER TABLE padaria_produto_decoracao
    ADD COLUMN IF NOT EXISTS global BOOLEAN NOT NULL DEFAULT false
  `);
  await db.query(`
    ALTER TABLE padaria_produto_decoracao
    ADD COLUMN IF NOT EXISTS controla_estoque BOOLEAN NOT NULL DEFAULT false
  `);
  await db.query(`
    ALTER TABLE padaria_produto_decoracao
    ADD COLUMN IF NOT EXISTS estoque INTEGER NOT NULL DEFAULT 0
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_decoracao_produto
    ON padaria_produto_decoracao (produto_codigo, ativo, ordem)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_padaria_decoracao_global
    ON padaria_produto_decoracao (ativo, ordem)
    WHERE global = true
  `);
  await db.query(`
    DROP INDEX IF EXISTS uq_padaria_decoracao_produto_codigo
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_padaria_decoracao_produto_codigo
    ON padaria_produto_decoracao (produto_codigo, lower(codigo))
    WHERE codigo IS NOT NULL AND btrim(codigo) <> ''
      AND global = false AND produto_codigo IS NOT NULL
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_padaria_decoracao_global_codigo
    ON padaria_produto_decoracao (lower(codigo))
    WHERE global = true AND codigo IS NOT NULL AND btrim(codigo) <> ''
  `);

  await db.query(`
    ALTER TABLE padaria_pedido_item
    ADD COLUMN IF NOT EXISTS decoracao_id INTEGER
  `);
  await db.query(`
    ALTER TABLE padaria_pedido_item
    ADD COLUMN IF NOT EXISTS decoracao_codigo VARCHAR(40)
  `);
  await db.query(`
    ALTER TABLE padaria_pedido_item
    ADD COLUMN IF NOT EXISTS decoracao_nome VARCHAR(160)
  `);
  await db.query(`
    ALTER TABLE padaria_pedido_item
    ADD COLUMN IF NOT EXISTS decoracao_preco NUMERIC(12,2) NOT NULL DEFAULT 0
  `);
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

async function migrarMarketing(db) {
  await db.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS email_promocional_opt_out_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_promocional_opt_out_motivo TEXT
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS marketing_campanha (
      id SERIAL PRIMARY KEY,
      canal VARCHAR(32) NOT NULL DEFAULT 'email',
      assunto VARCHAR(200) NOT NULL,
      preheader VARCHAR(200) NOT NULL DEFAULT '',
      corpo_md TEXT NOT NULL DEFAULT '',
      corpo_html TEXT NOT NULL DEFAULT '',
      corpo_texto TEXT NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT 'rascunho',
      publico VARCHAR(32) NOT NULL DEFAULT 'todos_elegiveis',
      emails_especificos JSONB NOT NULL DEFAULT '[]'::jsonb,
      email_teste VARCHAR(255),
      criado_por VARCHAR(100) NOT NULL DEFAULT 'admin',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      enviado_em TIMESTAMPTZ,
      total_destinatarios INTEGER NOT NULL DEFAULT 0,
      total_enviados INTEGER NOT NULL DEFAULT 0,
      total_falhas INTEGER NOT NULL DEFAULT 0,
      total_pulados INTEGER NOT NULL DEFAULT 0
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_campanha_status
    ON marketing_campanha (status, criado_em DESC)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS marketing_envio (
      id BIGSERIAL PRIMARY KEY,
      campanha_id INTEGER NOT NULL REFERENCES marketing_campanha(id) ON DELETE CASCADE,
      usuario_id INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
      cpf VARCHAR(14),
      email VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pendente',
      erro TEXT,
      enviado_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_envio_campanha
    ON marketing_envio (campanha_id, status)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_usuario_email_opt_out
    ON usuario (email_promocional_opt_out_em)
    WHERE email_promocional_opt_out_em IS NOT NULL
  `);

  await db.query(`
    ALTER TABLE marketing_campanha
    ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_marketing_campanha_arquivado
    ON marketing_campanha (canal, arquivado_em, criado_em DESC)
  `);

  await db.query(`
    ALTER TABLE marketing_campanha
    ADD COLUMN IF NOT EXISTS template_nome VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS template_idioma VARCHAR(20) NOT NULL DEFAULT 'pt_BR',
    ADD COLUMN IF NOT EXISTS midia_url TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS midia_tipo VARCHAR(20) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS body_params JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS button_url_params JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS telefones_especificos JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS telefone_teste VARCHAR(32)
  `);

  await db.query(`
    ALTER TABLE marketing_envio
    ALTER COLUMN email DROP NOT NULL
  `);

  await db.query(`
    ALTER TABLE marketing_envio
    ADD COLUMN IF NOT EXISTS telefone VARCHAR(32)
  `);

  await db.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS whatsapp_promocional_opt_out_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_promocional_opt_out_motivo TEXT
  `);

  await db.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS whatsapp_info_liberado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_info_telefone VARCHAR(32)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_usuario_whatsapp_opt_out
    ON usuario (whatsapp_promocional_opt_out_em)
    WHERE whatsapp_promocional_opt_out_em IS NOT NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_usuario_whatsapp_info_tel
    ON usuario (whatsapp_info_telefone)
    WHERE whatsapp_info_telefone IS NOT NULL
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_webhook_evento (
      id BIGSERIAL PRIMARY KEY,
      wamid VARCHAR(128) NOT NULL,
      telefone VARCHAR(32),
      tipo VARCHAR(40) NOT NULL DEFAULT 'message',
      processado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (wamid)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_evento_tel
    ON whatsapp_webhook_evento (telefone, processado_em DESC)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_auto_reply_estado (
      telefone VARCHAR(32) PRIMARY KEY,
      ultimo_menu_em TIMESTAMPTZ,
      ultimo_botao_em TIMESTAMPTZ,
      envios_janela INTEGER NOT NULL DEFAULT 0,
      janela_inicio TIMESTAMPTZ,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE whatsapp_auto_reply_estado
    ADD COLUMN IF NOT EXISTS sessao_modo VARCHAR(40),
    ADD COLUMN IF NOT EXISTS sessao_atividade_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sessao_usuario_id INTEGER,
    ADD COLUMN IF NOT EXISTS sessao_dados JSONB
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_auto_reply_metrica (
      id BIGSERIAL PRIMARY KEY,
      telefone VARCHAR(32),
      acao VARCHAR(40) NOT NULL,
      wamid VARCHAR(128),
      message_id VARCHAR(128),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_wa_auto_metrica_criado
    ON whatsapp_auto_reply_metrica (criado_em DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_wa_auto_metrica_acao_dia
    ON whatsapp_auto_reply_metrica (acao, criado_em DESC)
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_contato (
      telefone VARCHAR(32) PRIMARY KEY,
      nome_wa VARCHAR(120),
      primeiro_inbound_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ultimo_inbound_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ultima_acao VARCHAR(40),
      total_inbounds INTEGER NOT NULL DEFAULT 1,
      usuario_id INTEGER REFERENCES usuario(id) ON DELETE SET NULL,
      tem_clube BOOLEAN NOT NULL DEFAULT FALSE,
      info_liberada BOOLEAN NOT NULL DEFAULT FALSE,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_contato_ultimo
    ON whatsapp_contato (ultimo_inbound_em DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_whatsapp_contato_clube
    ON whatsapp_contato (tem_clube, info_liberada)
  `);
}

export async function initDatabase() {
  await ensureDatabase();
  await ensureSchema();
  console.log(`PostgreSQL conectado (banco: ${dbName()}).`);
}

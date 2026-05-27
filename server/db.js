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
  `);
}

export async function initDatabase() {
  await ensureDatabase();
  await ensureSchema();
  console.log(`PostgreSQL conectado (banco: ${dbName()}).`);
}

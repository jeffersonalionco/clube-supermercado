import pg from "pg";

const { Pool } = pg;

let pool;

function poolConfig() {
  return {
    host: process.env.WRPDV_HOST || "10.1.1.250",
    port: Number(process.env.WRPDV_PORT || 5432),
    user: process.env.WRPDV_USER || "consulta",
    password: process.env.WRPDV_PASSWORD || "consulta",
    database: process.env.WRPDV_DATABASE || "wrpdv",
    max: Number(process.env.WRPDV_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

export function getWrpdvPool() {
  if (!pool) {
    pool = new Pool(poolConfig());
  }
  return pool;
}

export async function testarConexaoWrpdv() {
  const db = getWrpdvPool();
  await db.query("SELECT 1");
}

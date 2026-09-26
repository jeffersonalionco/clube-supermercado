import { getPool } from "../db.js";

const DEFAULTS = {
  departamento_rp: "",
  unidade_rp: "",
  antecedencia_minima_horas: "2",
  horario_retirada_inicio: "08:00",
  horario_retirada_fim: "19:00",
  impressora_host: "10.1.1.13",
  impressora_porta: "9100",
  impressora_largura_mm: "80",
};

export async function obterConfigPadaria() {
  const { rows } = await getPool().query(`SELECT chave, valor FROM padaria_config`);
  const mapa = { ...DEFAULTS };
  for (const row of rows) {
    mapa[row.chave] = row.valor;
  }

  const envDept = String(process.env.PADARIA_DEPARTAMENTO_CODIGOS || "").trim();
  const envUnidade = String(
    process.env.PADARIA_UNIDADE ||
      process.env.CADASTRO_UNIDADE ||
      process.env.CLUBE_DESCONTOS_UNIDADE ||
      "001"
  ).trim();

  if (!mapa.departamento_rp && envDept) mapa.departamento_rp = envDept;
  if (!mapa.unidade_rp) mapa.unidade_rp = envUnidade;

  const envHost = String(process.env.PADARIA_IMPRESSORA_HOST || "").trim();
  const envPorta = String(process.env.PADARIA_IMPRESSORA_PORTA || "").trim();
  if (envHost && mapa.impressora_host === DEFAULTS.impressora_host) {
    mapa.impressora_host = envHost;
  }
  if (envPorta && mapa.impressora_porta === DEFAULTS.impressora_porta) {
    mapa.impressora_porta = envPorta;
  }

  return mapa;
}

export async function salvarConfigPadaria(parcial = {}) {
  const permitidas = new Set(Object.keys(DEFAULTS));
  const entradas = Object.entries(parcial).filter(([k]) => permitidas.has(k));

  for (const [chave, valor] of entradas) {
    await getPool().query(
      `INSERT INTO padaria_config (chave, valor, atualizado_em)
       VALUES ($1, $2, NOW())
       ON CONFLICT (chave) DO UPDATE
       SET valor = EXCLUDED.valor, atualizado_em = NOW()`,
      [chave, String(valor ?? "")]
    );
  }

  return obterConfigPadaria();
}

export function departamentosPermitidos(config) {
  return String(config.departamento_rp || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

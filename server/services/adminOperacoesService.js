import { getPool } from "../db.js";

function diasParaIntervalo(dias) {
  const n = Math.min(90, Math.max(1, Number(dias) || 30));
  return `${n} days`;
}

export async function listarOperacoesRecentes({ limite = 40, dias = 30 } = {}) {
  const max = Math.min(80, Math.max(5, Number(limite) || 40));
  const intervalo = diasParaIntervalo(dias);

  const [resgatesRes, estoqueRes] = await Promise.all([
    getPool().query(
      `SELECT
        r.id,
        r.codigo,
        r.cpf,
        r.cliente_nome,
        r.pontos_total,
        r.admin_usuario,
        r.criado_em,
        r.assinatura_confirmada_em,
        STRING_AGG(DISTINCT b.nome, ', ' ORDER BY b.nome) AS brindes
      FROM resgate_comprovante r
      LEFT JOIN pontos_baixa pb ON pb.comprovante_id = r.id
      LEFT JOIN brindes b ON b.id = pb.brinde_id
      WHERE r.criado_em >= NOW() - $1::interval
      GROUP BY r.id
      ORDER BY r.criado_em DESC
      LIMIT $2`,
      [intervalo, max]
    ),
    getPool().query(
      `SELECT
        m.id,
        m.operacao,
        m.quantidade,
        m.estoque_antes,
        m.estoque_depois,
        m.observacao,
        m.admin_usuario,
        m.criado_em,
        b.nome AS brinde_nome
      FROM brindes_estoque_movimento m
      JOIN brindes b ON b.id = m.brinde_id
      WHERE m.criado_em >= NOW() - $1::interval
      ORDER BY m.criado_em DESC
      LIMIT $2`,
      [intervalo, max]
    ),
  ]);

  const resgates = resgatesRes.rows.map((row) => ({
    tipo: "resgate",
    id: row.id,
    criadoEm: row.criado_em,
    adminUsuario: row.admin_usuario,
    codigo: row.codigo,
    cpf: row.cpf,
    clienteNome: row.cliente_nome,
    pontos: row.pontos_total,
    brindes: row.brindes || null,
    assinaturaPendente: !row.assinatura_confirmada_em,
    assinaturaConfirmadaEm: row.assinatura_confirmada_em,
  }));

  const estoque = estoqueRes.rows.map((row) => ({
    tipo: "estoque",
    id: row.id,
    criadoEm: row.criado_em,
    adminUsuario: row.admin_usuario,
    operacao: row.operacao,
    quantidade: row.quantidade,
    estoqueAntes: row.estoque_antes,
    estoqueDepois: row.estoque_depois,
    observacao: row.observacao,
    brindeNome: row.brinde_nome,
  }));

  const operacoes = [...resgates, ...estoque]
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .slice(0, max);

  const pendentesAssinatura = resgates.filter((r) => r.assinaturaPendente).length;

  return {
    dias: Number.parseInt(intervalo, 10) || 30,
    total: operacoes.length,
    pendentesAssinatura,
    operacoes,
  };
}

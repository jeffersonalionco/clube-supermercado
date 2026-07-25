import { getPool } from "../db.js";

const OPERACOES_ESTOQUE = ["entrada", "saida", "ajuste"];

function mapBrinde(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    imagemUrl: row.imagem_url,
    valor: row.valor != null ? Number(row.valor) : null,
    pontos: Number(row.pontos) || 0,
    estoque: row.estoque ?? 0,
    categoria: row.categoria,
    ativo: row.ativo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

const COLUNAS_BRINDE = `
  id, nome, descricao, imagem_url, valor, pontos, estoque, categoria, ativo, criado_em, atualizado_em
`;

export function validarBrindeInput(body) {
  const nome = String(body?.nome || "").trim();
  const descricao = String(body?.descricao || "").trim();
  const imagemUrl = String(body?.imagemUrl || body?.imagem_url || "").trim() || null;
  const valorBruto = body?.valor;
  const valor =
    valorBruto != null && valorBruto !== ""
      ? Number(String(valorBruto).replace(",", "."))
      : null;
  const pontos = Number(body?.pontos);
  const estoqueBruto = body?.estoque;
  const estoque =
    estoqueBruto != null && estoqueBruto !== ""
      ? Number(estoqueBruto)
      : 0;
  const ativo = body?.ativo !== false && body?.ativo !== "false";
  const categoria = String(body?.categoria || "").trim();

  if (nome.length < 2) {
    throw new Error("Informe o nome do brinde");
  }

  if (!Number.isInteger(pontos) || pontos < 1) {
    throw new Error("Informe a quantidade de pontos (número inteiro)");
  }

  if (!Number.isInteger(estoque) || estoque < 0) {
    throw new Error("Informe um estoque inicial válido (zero ou mais)");
  }

  if (categoria.length < 2) {
    throw new Error("Informe a categoria do brinde (ex.: Kit churrasco, Bazar)");
  }

  if (valor != null && (Number.isNaN(valor) || valor < 0)) {
    throw new Error("Informe um valor válido em reais");
  }

  return {
    nome,
    descricao: descricao || null,
    imagemUrl,
    valor,
    pontos,
    estoque,
    categoria,
    ativo,
  };
}

export function validarMovimentoEstoque(body) {
  const operacao = String(body?.operacao || "").trim().toLowerCase();
  const quantidade = Number(body?.quantidade);
  const observacao = String(body?.observacao || "").trim();

  if (!OPERACOES_ESTOQUE.includes(operacao)) {
    throw new Error("Operação inválida. Use entrada, saída ou ajuste");
  }

  if (operacao === "ajuste") {
    if (!Number.isInteger(quantidade) || quantidade < 0) {
      throw new Error("Informe o estoque final desejado");
    }
  } else if (!Number.isInteger(quantidade) || quantidade < 1) {
    throw new Error("Informe a quantidade da movimentação");
  }

  if (observacao.length < 3) {
    throw new Error("Informe uma observação (mínimo 3 caracteres)");
  }

  return { operacao, quantidade, observacao };
}

export async function listarBrindes({ apenasAtivos = false } = {}) {
  const filtro = apenasAtivos ? "WHERE ativo = true" : "";
  const { rows } = await getPool().query(
    `SELECT ${COLUNAS_BRINDE}
     FROM brindes
     ${filtro}
     ORDER BY ativo DESC, estoque DESC, pontos ASC, nome ASC`
  );
  return rows.map(mapBrinde);
}

export async function buscarBrindePorId(id) {
  const { rows } = await getPool().query(
    `SELECT ${COLUNAS_BRINDE}
     FROM brindes
     WHERE id = $1`,
    [id]
  );
  return mapBrinde(rows[0]);
}

export async function criarBrinde(dados) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO brindes (nome, descricao, imagem_url, valor, pontos, estoque, categoria, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUNAS_BRINDE}`,
      [
        dados.nome,
        dados.descricao,
        dados.imagemUrl,
        dados.valor,
        dados.pontos,
        dados.estoque,
        dados.categoria,
        dados.ativo,
      ]
    );

    const brinde = mapBrinde(rows[0]);

    if (dados.estoque > 0) {
      await client.query(
        `INSERT INTO brindes_estoque_movimento (
           brinde_id, operacao, quantidade, estoque_antes, estoque_depois, observacao, admin_usuario
         )
         VALUES ($1, 'entrada', $2, 0, $2, $3, $4)`,
        [brinde.id, dados.estoque, "Estoque inicial no cadastro", dados.adminUsuario || "sistema"]
      );
    }

    await client.query("COMMIT");
    return brinde;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function atualizarBrinde(id, dados) {
  const { rows } = await getPool().query(
    `UPDATE brindes
     SET nome = $2,
         descricao = $3,
         imagem_url = $4,
         valor = $5,
         pontos = $6,
         categoria = $7,
         ativo = $8,
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING ${COLUNAS_BRINDE}`,
    [
      id,
      dados.nome,
      dados.descricao,
      dados.imagemUrl,
      dados.valor,
      dados.pontos,
      dados.categoria,
      dados.ativo,
    ]
  );
  return mapBrinde(rows[0]);
}

export async function movimentarEstoque(brindeId, { operacao, quantidade, observacao, adminUsuario }) {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT estoque FROM brindes WHERE id = $1 FOR UPDATE`,
      [brindeId]
    );

    if (!rows[0]) {
      throw new Error("Brinde não encontrado");
    }

    const estoqueAntes = Number(rows[0].estoque) || 0;
    let estoqueDepois;

    if (operacao === "entrada") {
      estoqueDepois = estoqueAntes + quantidade;
    } else if (operacao === "saida") {
      if (estoqueAntes < quantidade) {
        throw new Error(
          `Estoque insuficiente. Disponível: ${estoqueAntes} unidade${estoqueAntes === 1 ? "" : "s"}.`
        );
      }
      estoqueDepois = estoqueAntes - quantidade;
    } else {
      estoqueDepois = quantidade;
    }

    await client.query(
      `UPDATE brindes
       SET estoque = $2, atualizado_em = NOW()
       WHERE id = $1`,
      [brindeId, estoqueDepois]
    );

    const { rows: movRows } = await client.query(
      `INSERT INTO brindes_estoque_movimento (
         brinde_id, operacao, quantidade, estoque_antes, estoque_depois, observacao, admin_usuario
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, criado_em`,
      [
        brindeId,
        operacao,
        quantidade,
        estoqueAntes,
        estoqueDepois,
        observacao,
        adminUsuario,
      ]
    );

    await client.query("COMMIT");

    return {
      id: movRows[0].id,
      operacao,
      quantidade,
      estoqueAntes,
      estoqueDepois,
      observacao,
      adminUsuario,
      criadoEm: movRows[0].criado_em,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function obterHistoricoEstoque(brindeId, limite = 20) {
  const { rows } = await getPool().query(
    `SELECT id, operacao, quantidade, estoque_antes, estoque_depois, observacao, admin_usuario, criado_em
     FROM brindes_estoque_movimento
     WHERE brinde_id = $1
     ORDER BY criado_em DESC
     LIMIT $2`,
    [brindeId, limite]
  );

  return rows.map((row) => ({
    id: row.id,
    operacao: row.operacao,
    quantidade: row.quantidade,
    estoqueAntes: row.estoque_antes,
    estoqueDepois: row.estoque_depois,
    observacao: row.observacao,
    adminUsuario: row.admin_usuario,
    criadoEm: row.criado_em,
  }));
}

export async function excluirBrinde(id) {
  const { rowCount } = await getPool().query(`DELETE FROM brindes WHERE id = $1`, [id]);
  return rowCount > 0;
}

function mapBrindeCatalogo(row) {
  const estoque = Number(row.estoque) || 0;
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao,
    imagemUrl: row.imagem_url,
    valor: row.valor != null ? Number(row.valor) : null,
    pontos: Number(row.pontos) || 0,
    categoria: row.categoria,
    estoque,
    limitado: estoque > 0 && estoque <= 5,
    atualizadoEm: row.atualizado_em,
  };
}

export async function listarCategoriasCatalogo() {
  const { rows } = await getPool().query(
    `SELECT DISTINCT TRIM(categoria) AS categoria
     FROM brindes
     WHERE ativo = true
       AND estoque > 0
       AND categoria IS NOT NULL
       AND TRIM(categoria) <> ''
     ORDER BY categoria ASC`
  );
  return rows.map((row) => row.categoria);
}

export async function listarTodasCategorias() {
  const { rows } = await getPool().query(
    `SELECT DISTINCT TRIM(categoria) AS categoria
     FROM brindes
     WHERE categoria IS NOT NULL
       AND TRIM(categoria) <> ''
     ORDER BY categoria ASC`
  );
  return rows.map((row) => row.categoria);
}

export async function listarBrindesCatalogo({ categoria = null } = {}) {
  const params = [];
  let filtroCategoria = "";

  if (categoria) {
    params.push(categoria);
    filtroCategoria = `AND LOWER(TRIM(categoria)) = LOWER(TRIM($${params.length}))`;
  }

  const { rows } = await getPool().query(
    `SELECT id, nome, descricao, imagem_url, valor, pontos, categoria, estoque, atualizado_em
     FROM brindes
     WHERE ativo = true
       AND estoque > 0
       ${filtroCategoria}
     ORDER BY pontos ASC, nome ASC`,
    params
  );

  return rows.map(mapBrindeCatalogo);
}

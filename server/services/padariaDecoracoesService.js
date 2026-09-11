import { getPool } from "../db.js";
import { registrarAuditoriaPadaria } from "./padariaAuditoriaService.js";

function arredondarMoeda(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function parsePrecoDecoracao(valor) {
  if (valor == null || valor === "") return 0;
  const n = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Valor da decoração inválido");
  }
  return arredondarMoeda(n);
}

function mapDecoracao(row) {
  if (!row) return null;
  const controlaEstoque = Boolean(row.controla_estoque);
  const estoque = Number(row.estoque) || 0;
  return {
    id: row.id,
    produtoCodigo: row.produto_codigo || null,
    produtoNome: row.produto_nome || null,
    global: Boolean(row.global),
    codigo: row.codigo || null,
    nome: row.nome,
    descricao: row.descricao || null,
    imagemUrl: row.imagem_url || null,
    preco: Number(row.preco) || 0,
    controlaEstoque,
    estoque,
    disponivel: !controlaEstoque || estoque > 0,
    ordem: row.ordem,
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

function ordenarDecoracoes(a, b) {
  if (a.global !== b.global) return a.global ? 1 : -1;
  if ((a.ordem || 0) !== (b.ordem || 0)) return (a.ordem || 0) - (b.ordem || 0);
  return String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
}

export async function listarDecoracoesPorProduto(
  produtoCodigo,
  { apenasAtivas = false } = {}
) {
  const codigo = String(produtoCodigo || "").trim();
  if (!codigo) return [];
  const conds = ["(produto_codigo = $1 OR global = true)"];
  if (apenasAtivas) conds.push("ativo = true");
  const { rows } = await getPool().query(
    `SELECT * FROM padaria_produto_decoracao
     WHERE ${conds.join(" AND ")}
     ORDER BY global ASC, ordem ASC, id ASC`,
    [codigo]
  );
  return rows.map(mapDecoracao);
}

export async function carregarDecoracoesPorProdutos(
  codigos,
  { apenasAtivas = true } = {}
) {
  const lista = [...new Set((codigos || []).map((c) => String(c).trim()).filter(Boolean))];
  if (!lista.length) return new Map();
  const conds = ["(produto_codigo = ANY($1::varchar[]) OR global = true)"];
  if (apenasAtivas) conds.push("ativo = true");
  const { rows } = await getPool().query(
    `SELECT * FROM padaria_produto_decoracao
     WHERE ${conds.join(" AND ")}
     ORDER BY global ASC, ordem ASC, id ASC`,
    [lista]
  );
  const globais = [];
  const porProduto = new Map();
  for (const row of rows) {
    const deco = mapDecoracao(row);
    if (deco.global) {
      globais.push(deco);
    } else {
      const arr = porProduto.get(row.produto_codigo) || [];
      arr.push(deco);
      porProduto.set(row.produto_codigo, arr);
    }
  }
  const map = new Map();
  for (const codigo of lista) {
    const locais = porProduto.get(codigo) || [];
    map.set(codigo, [...locais, ...globais].sort(ordenarDecoracoes));
  }
  return map;
}

export async function listarDecoracoesCatalogo({ busca = "" } = {}) {
  const params = [];
  const conds = [
    "d.ativo = true",
    `(
      d.global = true
      OR (
        p.origem = 'manual'
        AND p.ativo_catalogo = true
        AND p.ativo_rp = true
      )
    )`,
  ];
  if (busca.trim()) {
    params.push(`%${busca.trim()}%`);
    conds.push(`(
      d.nome ILIKE $1
      OR COALESCE(d.codigo, '') ILIKE $1
      OR COALESCE(d.descricao, '') ILIKE $1
      OR COALESCE(p.nome_catalogo, p.nome_rp) ILIKE $1
      OR COALESCE(p.codigo, '') ILIKE $1
    )`);
  }
  const { rows } = await getPool().query(
    `SELECT d.*,
            CASE
              WHEN d.global THEN 'Todos os bolos'
              ELSE COALESCE(p.nome_catalogo, p.nome_rp)
            END AS produto_nome
     FROM padaria_produto_decoracao d
     LEFT JOIN padaria_produto p ON p.codigo = d.produto_codigo
     WHERE ${conds.join(" AND ")}
     ORDER BY d.global DESC, d.ordem ASC, d.nome ASC, d.id ASC`,
    params
  );
  return rows.map(mapDecoracao);
}

export async function listarDecoracoesAdmin({
  busca = "",
  produtoCodigo = "",
  filtro = "",
} = {}) {
  const params = [];
  const conds = [
    `(d.global = true OR p.origem = 'manual' OR d.produto_codigo IS NULL)`,
  ];

  if (String(produtoCodigo || "").trim()) {
    params.push(String(produtoCodigo).trim());
    conds.push(
      `(d.produto_codigo = $${params.length} OR d.global = true)`
    );
  }
  if (filtro === "ativas") {
    conds.push("d.ativo = true");
  } else if (filtro === "inativas") {
    conds.push("d.ativo = false");
  } else if (filtro === "sem_foto") {
    conds.push("(d.imagem_url IS NULL OR btrim(d.imagem_url) = '')");
  } else if (filtro === "sem_codigo") {
    conds.push("(d.codigo IS NULL OR btrim(d.codigo) = '')");
  } else if (filtro === "globais") {
    conds.push("d.global = true");
  } else if (filtro === "pagas") {
    conds.push("d.preco > 0");
  } else if (filtro === "com_estoque") {
    conds.push("d.controla_estoque = true");
  } else if (filtro === "esgotadas") {
    conds.push("d.controla_estoque = true AND d.estoque <= 0");
  }

  if (String(busca || "").trim()) {
    params.push(`%${String(busca).trim()}%`);
    const i = params.length;
    conds.push(`(
      d.nome ILIKE $${i}
      OR COALESCE(d.codigo, '') ILIKE $${i}
      OR COALESCE(d.descricao, '') ILIKE $${i}
      OR COALESCE(p.nome_catalogo, p.nome_rp) ILIKE $${i}
      OR COALESCE(p.codigo, '') ILIKE $${i}
    )`);
  }

  const { rows } = await getPool().query(
    `SELECT d.*,
            CASE
              WHEN d.global THEN 'Todos os bolos'
              ELSE COALESCE(p.nome_catalogo, p.nome_rp)
            END AS produto_nome
     FROM padaria_produto_decoracao d
     LEFT JOIN padaria_produto p ON p.codigo = d.produto_codigo
     WHERE ${conds.join(" AND ")}
     ORDER BY d.global DESC,
              COALESCE(p.nome_catalogo, p.nome_rp) ASC NULLS LAST,
              d.ordem ASC, d.nome ASC, d.id ASC`,
    params
  );
  return rows.map(mapDecoracao);
}

export async function obterDecoracao(id) {
  const { rows } = await getPool().query(
    `SELECT d.*,
            CASE
              WHEN d.global THEN 'Todos os bolos'
              ELSE COALESCE(p.nome_catalogo, p.nome_rp)
            END AS produto_nome
     FROM padaria_produto_decoracao d
     LEFT JOIN padaria_produto p ON p.codigo = d.produto_codigo
     WHERE d.id = $1`,
    [Number(id)]
  );
  return mapDecoracao(rows[0]);
}

function parseEstoque(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error("Informe um estoque válido (número inteiro ≥ 0)");
  }
  return n;
}

function montarCamposCriacao(dados = {}) {
  const nome = String(dados.nome || "").trim();
  if (nome.length < 2) throw new Error("Informe o nome da decoração");

  const controlaEstoque = Boolean(
    dados.controlaEstoque ?? dados.controla_estoque ?? false
  );
  let estoque = 0;
  if (controlaEstoque) {
    estoque = parseEstoque(
      dados.estoque != null && dados.estoque !== "" ? dados.estoque : 0
    );
  }

  return {
    nome,
    codigo: String(dados.codigo || "").trim() || null,
    descricao: String(dados.descricao || "").trim() || null,
    ordem: Number.isFinite(Number(dados.ordem)) ? Number(dados.ordem) : 100,
    ativo: dados.ativo == null ? true : Boolean(dados.ativo),
    preco: parsePrecoDecoracao(dados.preco),
    controlaEstoque,
    estoque,
  };
}

export async function criarDecoracao(produtoCodigo, dados = {}) {
  const codigoProduto = String(produtoCodigo || "").trim();
  if (!codigoProduto) throw new Error("Produto inválido");

  const prod = await getPool().query(
    `SELECT codigo FROM padaria_produto WHERE codigo = $1 AND origem = 'manual'`,
    [codigoProduto]
  );
  if (!prod.rows[0]) throw new Error("Produto não encontrado");

  const campos = montarCamposCriacao(dados);

  try {
    const { rows } = await getPool().query(
      `INSERT INTO padaria_produto_decoracao (
         produto_codigo, codigo, nome, descricao, ordem, ativo, preco, global,
         controla_estoque, estoque
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $9)
       RETURNING *`,
      [
        codigoProduto,
        campos.codigo,
        campos.nome,
        campos.descricao,
        campos.ordem,
        campos.ativo,
        campos.preco,
        campos.controlaEstoque,
        campos.estoque,
      ]
    );
    const decoracao = mapDecoracao(rows[0]);
    await registrarAuditoriaPadaria({
      acao: "decoracao_criada",
      entidade: "decoracao",
      entidadeId: decoracao.id,
      dados: {
        produtoCodigo: codigoProduto,
        nome: campos.nome,
        codigo: campos.codigo,
        preco: campos.preco,
        global: false,
        controlaEstoque: campos.controlaEstoque,
        estoque: campos.estoque,
      },
    });
    return (await obterDecoracao(decoracao.id)) || decoracao;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Já existe uma decoração com este código neste produto");
    }
    throw error;
  }
}

export async function criarDecoracaoGlobal(dados = {}) {
  const campos = montarCamposCriacao(dados);

  try {
    const { rows } = await getPool().query(
      `INSERT INTO padaria_produto_decoracao (
         produto_codigo, codigo, nome, descricao, ordem, ativo, preco, global,
         controla_estoque, estoque
       ) VALUES (NULL, $1, $2, $3, $4, $5, $6, true, $7, $8)
       RETURNING *`,
      [
        campos.codigo,
        campos.nome,
        campos.descricao,
        campos.ordem,
        campos.ativo,
        campos.preco,
        campos.controlaEstoque,
        campos.estoque,
      ]
    );
    const decoracao = mapDecoracao(rows[0]);
    await registrarAuditoriaPadaria({
      acao: "decoracao_criada",
      entidade: "decoracao",
      entidadeId: decoracao.id,
      dados: {
        nome: campos.nome,
        codigo: campos.codigo,
        preco: campos.preco,
        global: true,
        controlaEstoque: campos.controlaEstoque,
        estoque: campos.estoque,
      },
    });
    return (await obterDecoracao(decoracao.id)) || decoracao;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error("Já existe uma decoração global com este código");
    }
    throw error;
  }
}

export async function atualizarDecoracao(id, dados = {}) {
  const decoracaoId = Number(id);
  if (!decoracaoId) throw new Error("Decoração inválida");

  const atual = await obterDecoracao(decoracaoId);
  if (!atual) throw new Error("Decoração não encontrada");

  const campos = [];
  const params = [decoracaoId];
  let i = 2;

  if (dados.nome !== undefined) {
    const nome = String(dados.nome || "").trim();
    if (nome.length < 2) throw new Error("Informe o nome da decoração");
    campos.push(`nome = $${i++}`);
    params.push(nome);
  }
  if (dados.codigo !== undefined) {
    campos.push(`codigo = $${i++}`);
    params.push(String(dados.codigo || "").trim() || null);
  }
  if (dados.descricao !== undefined) {
    campos.push(`descricao = $${i++}`);
    params.push(String(dados.descricao || "").trim() || null);
  }
  if (dados.ordem !== undefined) {
    campos.push(`ordem = $${i++}`);
    params.push(Number(dados.ordem) || 0);
  }
  if (dados.ativo != null) {
    campos.push(`ativo = $${i++}`);
    params.push(Boolean(dados.ativo));
  }
  if (dados.imagemUrl !== undefined) {
    campos.push(`imagem_url = $${i++}`);
    params.push(String(dados.imagemUrl || "").trim() || null);
  }
  if (dados.preco !== undefined) {
    campos.push(`preco = $${i++}`);
    params.push(parsePrecoDecoracao(dados.preco));
  }
  if (dados.controlaEstoque != null || dados.controla_estoque != null) {
    const controla = Boolean(
      dados.controlaEstoque ?? dados.controla_estoque
    );
    campos.push(`controla_estoque = $${i++}`);
    params.push(controla);
    if (!controla && dados.estoque === undefined) {
      campos.push(`estoque = $${i++}`);
      params.push(0);
    }
  }
  if (dados.estoque !== undefined) {
    campos.push(`estoque = $${i++}`);
    params.push(parseEstoque(dados.estoque));
  }

  if (!campos.length) return atual;

  campos.push("atualizado_em = NOW()");
  try {
    const { rows } = await getPool().query(
      `UPDATE padaria_produto_decoracao
       SET ${campos.join(", ")}
       WHERE id = $1
       RETURNING *`,
      params
    );
    const decoracao = mapDecoracao(rows[0]);
    await registrarAuditoriaPadaria({
      acao: "decoracao_atualizada",
      entidade: "decoracao",
      entidadeId: decoracao.id,
      dados: {
        nome: decoracao.nome,
        codigo: decoracao.codigo,
        ativo: decoracao.ativo,
        preco: decoracao.preco,
        global: decoracao.global,
        controlaEstoque: decoracao.controlaEstoque,
        estoque: decoracao.estoque,
      },
    });
    return (await obterDecoracao(decoracao.id)) || decoracao;
  } catch (error) {
    if (error.code === "23505") {
      throw new Error(
        atual.global
          ? "Já existe uma decoração global com este código"
          : "Já existe uma decoração com este código neste produto"
      );
    }
    throw error;
  }
}

/** Baixa estoque unitário da decoração dentro de uma transação. */
export async function baixarEstoqueDecoracao(client, decoracaoId, quantidade) {
  const id = Number(decoracaoId);
  const qtd = Math.max(1, Math.ceil(Number(quantidade) || 1));
  if (!id) return;

  const { rows } = await client.query(
    `SELECT id, nome, controla_estoque, estoque
     FROM padaria_produto_decoracao
     WHERE id = $1
     FOR UPDATE`,
    [id]
  );
  const row = rows[0];
  if (!row) throw new Error("Decoração não encontrada");
  if (!row.controla_estoque) return;

  const estoque = Number(row.estoque) || 0;
  if (estoque < qtd) {
    throw new Error(
      `Estoque insuficiente da decoração “${row.nome}”. Disponível: ${estoque}`
    );
  }
  await client.query(
    `UPDATE padaria_produto_decoracao
     SET estoque = estoque - $2, atualizado_em = NOW()
     WHERE id = $1`,
    [id, qtd]
  );
}

export async function excluirDecoracao(id) {
  const decoracaoId = Number(id);
  const { rowCount } = await getPool().query(
    `DELETE FROM padaria_produto_decoracao WHERE id = $1`,
    [decoracaoId]
  );
  if (!rowCount) throw new Error("Decoração não encontrada");
  await registrarAuditoriaPadaria({
    acao: "decoracao_excluida",
    entidade: "decoracao",
    entidadeId: decoracaoId,
  });
  return { ok: true };
}

export async function definirImagemDecoracao(id, imagemUrl) {
  return atualizarDecoracao(id, { imagemUrl });
}

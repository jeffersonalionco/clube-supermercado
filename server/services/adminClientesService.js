import { getPool } from "../db.js";
import { buscarClientePorCpfCnpj, normalizarCpfCnpj } from "./apiClient.js";
import { buscarUsuarioPorCpf } from "./usuarioService.js";
import {
  obterHistoricoBaixas,
  obterSaldoPontos,
  sincronizarPontos,
} from "./pontosService.js";
import { buscarVendasCliente } from "./vendasService.js";
import { apresentarVendas } from "./vendasPresenter.js";
import { agruparComprasPorCpfWrpdv } from "./wrpdvVendasService.js";
import { periodoUltimosDias } from "../utils/periodoVendas.js";
import { dataInicioPlataformaBR } from "../utils/vendasPlataforma.js";
import {
  REAIS_POR_PONTO,
  VALOR_REFERENCIA_PONTO,
} from "../constants/pontosPrograma.js";
import { listarAuditoriaCliente } from "./clienteAuditoriaService.js";
import { normalizarClienteApi } from "./clientePresenter.js";
import {
  obterNivelFidelidadeCliente,
  nivelFidelidadeFallback,
} from "./nivelFidelidadeService.js";

const DIAS_PADRAO = 90;
const DIAS_INATIVO = 60;
const LIMITE_LISTA = 20;
const MARGEM_PERTO_PREMIO = 20;

function normalizarDias(dias) {
  return Math.min(90, Math.max(7, Number(dias) || DIAS_PADRAO));
}

function calcularDiasSemCompra(ultimaCompra, agora = Date.now()) {
  if (!ultimaCompra) return null;
  return Math.floor(
    (agora - new Date(ultimaCompra).getTime()) / (24 * 60 * 60 * 1000)
  );
}

function mapMembro(row) {
  return {
    cpf: row.cpf,
    nome: row.nome,
    saldoPontos: Number(row.saldo_pontos) || 0,
    cadastradoEm: row.criado_em,
  };
}

function enriquecerComVendas(membro, comprasMap, agora = Date.now()) {
  const vendas = comprasMap.get(membro.cpf);
  const ultimaCompra = vendas?.ultimaCompra ?? null;
  const quantidadeCupons = vendas?.quantidadeCupons ?? 0;
  const totalGasto = vendas?.totalGasto ?? 0;

  return {
    ...membro,
    totalGasto,
    quantidadeCupons,
    ultimaCompra,
    diasSemCompra: calcularDiasSemCompra(ultimaCompra, agora),
    ticketMedio:
      quantidadeCupons > 0
        ? Math.round((totalGasto / quantidadeCupons) * 100) / 100
        : 0,
  };
}

async function obterBrindeMaisBarato() {
  const { rows } = await getPool().query(
    `SELECT nome, pontos::int AS pontos
     FROM brindes
     WHERE ativo = true AND estoque > 0
     ORDER BY pontos ASC
     LIMIT 1`
  );
  return rows[0] ?? null;
}

function labelSexo(sexo) {
  if (sexo === "M") return "Masculino";
  if (sexo === "F") return "Feminino";
  return sexo || null;
}

function labelEstadoCivil(valor) {
  const map = {
    SOLTEIRO: "Solteiro(a)",
    CASADO: "Casado(a)",
    DIVORCIADO: "Divorciado(a)",
    VIUVO: "Viúvo(a)",
    OUTROS: "Outros",
  };
  return map[String(valor || "").toUpperCase()] || valor || null;
}

function pickCampo(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (val != null && val !== "") return val;
  }
  return null;
}

function montarComportamento(compras) {
  const resumo = compras?.resumo;
  const base = {
    ultimaCompra: null,
    diasSemCompra: null,
    diasComCompra: compras?.porData?.length ?? 0,
    cuponsCancelados: resumo?.totalCanceladas ?? 0,
    cuponsConvenio: resumo?.totalConvenio ?? 0,
    totalItens: resumo?.totalItens ?? 0,
    mediaItensPorCupom: 0,
  };

  if (!compras?.vendas?.length) return base;

  const ativas = compras.vendas.filter((v) => !v.cancelada);
  const datas = [...new Set(ativas.map((v) => v.data).filter(Boolean))].sort(
    (a, b) => b.split("/").reverse().join("").localeCompare(a.split("/").reverse().join(""))
  );
  const ultimaStr = datas[0] || null;

  if (ultimaStr) {
    const [dd, mm, yyyy] = ultimaStr.split("/");
    const ultimaDate = yyyy ? new Date(`${yyyy}-${mm}-${dd}T12:00:00`) : null;
    base.ultimaCompra = ultimaStr;
    base.diasSemCompra = ultimaDate ? calcularDiasSemCompra(ultimaDate) : null;
  }

  if (resumo?.totalVendasAtivas > 0) {
    base.mediaItensPorCupom =
      Math.round((resumo.totalItens / resumo.totalVendasAtivas) * 10) / 10;
  }

  return base;
}

function montarPerfilErp(erpCliente, usuario) {
  const erpNorm =
    erpCliente?.ok && erpCliente.cliente
      ? normalizarClienteApi(erpCliente.cliente)
      : {};

  return {
    email: erpNorm.email || null,
    telefone: erpNorm.foneCel || erpNorm.telefone || null,
    endereco: erpNorm.enderecoTexto || null,
    dataNascimento: erpNorm.dtNasc || erpNorm.dataNascimento || null,
    sexo: labelSexo(erpNorm.sexo),
    estadoCivil: labelEstadoCivil(erpNorm.estadoCivil),
    erpCodigo:
      pickCampo(erpNorm, ["codigo", "codigo_cliente", "id"]) ||
      (usuario?.cliente_codigo != null ? String(usuario.cliente_codigo) : null),
    situacaoErp: pickCampo(erpNorm, ["situacao", "status"]),
  };
}

function montarBrindeProximo(pontos, brindeBarato) {
  if (!pontos || !brindeBarato) return null;

  const saldo = Number(pontos.saldo) || 0;
  const necessarios = brindeBarato.pontos;

  return {
    nome: brindeBarato.nome,
    pontosNecessarios: necessarios,
    faltamPontos: Math.max(0, necessarios - saldo),
    jaPodeResgatar: saldo >= necessarios,
  };
}

export async function obterFichaClienteAdmin(cpfCnpj, dias = DIAS_PADRAO) {
  const cpf = normalizarCpfCnpj(cpfCnpj);
  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return { ok: false, error: "CPF ou CNPJ inválido" };
  }

  const diasConsulta = normalizarDias(dias);
  const periodo = periodoUltimosDias(diasConsulta);

  const [usuario, vendasResult, erpCliente, brindeBarato] = await Promise.all([
    buscarUsuarioPorCpf(cpf),
    buscarVendasCliente(cpf, periodo.dataini, periodo.datafim),
    buscarClientePorCpfCnpj(cpf).catch(() => ({ ok: false })),
    obterBrindeMaisBarato(),
  ]);

  let pontos = null;
  let baixas = [];
  let sync = null;
  let auditoria = [];

  if (usuario) {
    sync = await sincronizarPontos(cpf, usuario.criado_em);
    pontos = await obterSaldoPontos(cpf);
    baixas = await obterHistoricoBaixas(cpf, 15);
    auditoria = await listarAuditoriaCliente(cpf, { limite: 12 });
  }

  const compras = vendasResult.ok
    ? await apresentarVendas(vendasResult.itens, periodo)
    : null;

  const nomeErp =
    erpCliente?.ok && erpCliente.cliente
      ? normalizarClienteApi(erpCliente.cliente).nome ||
        erpCliente.cliente.nome ||
        erpCliente.cliente.razaoSocial
      : null;

  const perfilErp = montarPerfilErp(erpCliente, usuario);
  const comportamento = montarComportamento(compras);
  const pontosResgatados = baixas.reduce(
    (acc, b) => acc + (Number(b.pontos) || 0),
    0
  );

  let fidelidade = null;
  if (usuario) {
    try {
      fidelidade = await obterNivelFidelidadeCliente(cpf, { usuario });
    } catch {
      fidelidade = nivelFidelidadeFallback(usuario);
    }
  }

  const clienteBase = usuario
    ? {
        cpf: usuario.cpf,
        nome: usuario.nome || nomeErp,
        clienteCodigo: usuario.cliente_codigo || perfilErp.erpCodigo,
        cadastradoEm: usuario.criado_em,
        dataInicioPlataforma: dataInicioPlataformaBR(usuario.criado_em),
        atualizadoEm: usuario.atualizado_em,
        aceiteRegulamentoEm: usuario.aceite_regulamento_em,
        aceitePrivacidadeEm: usuario.aceite_privacidade_em,
      }
    : {
        cpf,
        nome: nomeErp,
        clienteCodigo: perfilErp.erpCodigo,
        cadastradoEm: null,
        dataInicioPlataforma: null,
        atualizadoEm: null,
        aceiteRegulamentoEm: null,
        aceitePrivacidadeEm: null,
      };

  return {
    ok: true,
    periodo: {
      dias: diasConsulta,
      dataini: periodo.dataini,
      datafim: periodo.datafim,
    },
    noClube: !usuario,
    cliente: {
      ...clienteBase,
      ...perfilErp,
    },
    comportamento,
    resgatesResumo: {
      total: baixas.length,
      pontosResgatados,
    },
    fidelidade,
    pontos,
    brindeProximo: montarBrindeProximo(pontos, brindeBarato),
    baixas,
    auditoria,
    compras,
    sync: sync?.ok
      ? {
          novosCupons: sync.novosCupons,
          pontosCreditados: sync.pontosCreditados,
        }
      : null,
    erroVendas: vendasResult.ok ? null : vendasResult.error,
    valorReferenciaPonto: VALOR_REFERENCIA_PONTO,
    erpEncontrado: Boolean(erpCliente?.ok),
  };
}

async function buscarNomesErpLote(cpfs) {
  const mapa = new Map();
  const lista = [...new Set((cpfs || []).filter(Boolean))];
  const MAX_PARALELO = 5;

  for (let i = 0; i < lista.length; i += MAX_PARALELO) {
    const lote = lista.slice(i, i + MAX_PARALELO);
    const resultados = await Promise.allSettled(
      lote.map((cpf) => buscarClientePorCpfCnpj(cpf))
    );
    for (let j = 0; j < lote.length; j++) {
      const r = resultados[j];
      if (r.status === "fulfilled" && r.value?.ok && r.value.cliente) {
        const norm = normalizarClienteApi(r.value.cliente);
        const nome = String(norm.nome || norm.razaoSocial || "").trim();
        if (nome) mapa.set(lote[j], nome);
      }
    }
  }
  return mapa;
}

/**
 * Busca clientes para o CRM admin: CPF/CNPJ, nome, código ou trecho de CPF.
 */
export async function buscarClientesAdmin(termo, { limite = 15 } = {}) {
  const q = String(termo || "").trim();
  const lim = Math.min(Math.max(Number(limite) || 15, 1), 30);
  if (q.length < 2) {
    return { resultados: [], total: 0 };
  }

  const digits = q.replace(/\D/g, "");
  const resultados = [];
  const cpfsVistos = new Set();

  function incluir(item) {
    if (!item?.cpf || cpfsVistos.has(item.cpf)) return;
    cpfsVistos.add(item.cpf);
    resultados.push(item);
  }

  if (digits.length === 11 || digits.length === 14) {
    const cpf = normalizarCpfCnpj(digits);
    const usuario = await buscarUsuarioPorCpf(cpf);

    if (usuario) {
      incluir({
        cpf: usuario.cpf,
        nome: usuario.nome,
        clienteCodigo: usuario.cliente_codigo,
        noClube: false,
        origem: "clube",
      });
    }

    const erp = await buscarClientePorCpfCnpj(cpf).catch(() => ({ ok: false }));
    if (erp.ok && erp.cliente) {
      const norm = normalizarClienteApi(erp.cliente);
      const nomeErp = norm.nome || norm.razaoSocial || null;
      if (usuario) {
        const idx = resultados.findIndex((r) => r.cpf === usuario.cpf);
        if (idx >= 0 && !resultados[idx].nome && nomeErp) {
          resultados[idx].nome = nomeErp;
          resultados[idx].origem = "clube+erp";
        }
      } else {
        incluir({
          cpf,
          nome: nomeErp,
          clienteCodigo: pickCampo(norm, ["codigo", "codigo_cliente"]),
          noClube: true,
          origem: "erp",
        });
      }
    } else if (!usuario) {
      incluir({
        cpf,
        nome: null,
        clienteCodigo: null,
        noClube: true,
        origem: "cpf",
      });
    }

    return { resultados: resultados.slice(0, lim), total: resultados.length };
  }

  if (/^\d+$/.test(digits) && digits.length >= 3) {
    const { rows: porCodigo } = await getPool().query(
      `SELECT cpf, nome, cliente_codigo
       FROM usuario
       WHERE cliente_codigo::text = $1
       ORDER BY criado_em DESC
       LIMIT $2`,
      [digits, lim]
    );
    for (const row of porCodigo) {
      incluir({
        cpf: row.cpf,
        nome: row.nome,
        clienteCodigo: row.cliente_codigo,
        noClube: false,
        origem: "codigo",
      });
    }
  }

  if (digits.length >= 4) {
    const { rows: porCpfParcial } = await getPool().query(
      `SELECT cpf, nome, cliente_codigo
       FROM usuario
       WHERE cpf LIKE $1
       ORDER BY criado_em DESC
       LIMIT $2`,
      [`%${digits}%`, lim]
    );
    for (const row of porCpfParcial) {
      incluir({
        cpf: row.cpf,
        nome: row.nome,
        clienteCodigo: row.cliente_codigo,
        noClube: false,
        origem: "cpf-parcial",
      });
    }
  }

  if (/[a-zA-ZÀ-ÿ]/.test(q)) {
    const { rows: porNome } = await getPool().query(
      `SELECT cpf, nome, cliente_codigo
       FROM usuario
       WHERE nome ILIKE $1
       ORDER BY nome
       LIMIT $2`,
      [`%${q}%`, lim]
    );
    for (const row of porNome) {
      incluir({
        cpf: row.cpf,
        nome: row.nome,
        clienteCodigo: row.cliente_codigo,
        noClube: false,
        origem: "nome",
      });
    }
  }

  return { resultados: resultados.slice(0, lim), total: resultados.length };
}

export async function listarSegmentosClientes(dias = DIAS_PADRAO) {
  const diasConsulta = normalizarDias(dias);
  const periodo = periodoUltimosDias(diasConsulta);

  const comprasMap = await agruparComprasPorCpfWrpdv(
    periodo.dataini,
    periodo.datafim
  );

  const [{ rows: membros }, brindeBarato] = await Promise.all([
    getPool().query(
      `SELECT u.cpf, u.nome, u.criado_em, COALESCE(pc.saldo_pontos, 0)::int AS saldo_pontos
       FROM usuario u
       LEFT JOIN pontos_conta pc ON pc.cpf = u.cpf
       ORDER BY u.criado_em DESC`
    ),
    obterBrindeMaisBarato(),
  ]);

  const agora = Date.now();
  const limiteMs = DIAS_INATIVO * 24 * 60 * 60 * 1000;
  const cpfsMembros = new Set(membros.map((m) => m.cpf));

  const membrosEnriquecidos = membros.map((row) =>
    enriquecerComVendas(mapMembro(row), comprasMap, agora)
  );

  const maioresCompradoresTodos = [...membrosEnriquecidos]
    .filter((m) => m.totalGasto > 0)
    .sort((a, b) => b.totalGasto - a.totalGasto);

  const inativosTodos = membrosEnriquecidos
    .filter((m) => {
      if (!m.ultimaCompra) return true;
      return agora - new Date(m.ultimaCompra).getTime() > limiteMs;
    })
    .sort((a, b) => {
      const ta = a.ultimaCompra ? new Date(a.ultimaCompra).getTime() : 0;
      const tb = b.ultimaCompra ? new Date(b.ultimaCompra).getTime() : 0;
      return ta - tb;
    });

  const minPontosBrinde = brindeBarato?.pontos ?? null;

  const pertoDoPremioTodos =
    minPontosBrinde != null
      ? membrosEnriquecidos
          .filter(
            (m) =>
              m.saldoPontos > 0 &&
              m.saldoPontos < minPontosBrinde &&
              m.saldoPontos >= minPontosBrinde - MARGEM_PERTO_PREMIO
          )
          .sort((a, b) => b.saldoPontos - a.saldoPontos)
          .map((m) => ({
            ...m,
            brindeNome: brindeBarato.nome,
            brindePontos: minPontosBrinde,
            faltamPontos: minPontosBrinde - m.saldoPontos,
          }))
      : [];

  const { rows: expirandoRows } = await getPool().query(
    `SELECT pl.cpf,
            u.nome,
            COALESCE(pc.saldo_pontos, 0)::int AS saldo_pontos,
            MIN(pl.expires_at) AS proxima_expiracao,
            SUM(pl.saldo_restante)::int AS pontos_expirando
     FROM pontos_lote pl
     JOIN usuario u ON u.cpf = pl.cpf
     LEFT JOIN pontos_conta pc ON pc.cpf = pl.cpf
     WHERE pl.saldo_restante > 0
       AND pl.expirado_em IS NULL
       AND pl.expires_at > NOW()
       AND pl.expires_at <= NOW() + INTERVAL '60 days'
     GROUP BY pl.cpf, u.nome, pc.saldo_pontos
     ORDER BY proxima_expiracao ASC`
  );

  const pontosExpirandoTodos = expirandoRows.map((row) => ({
    cpf: row.cpf,
    nome: row.nome,
    saldoPontos: row.saldo_pontos,
    proximaExpiracao: row.proxima_expiracao,
    pontosExpirando: row.pontos_expirando,
    valorExpirando:
      Math.round(row.pontos_expirando * VALOR_REFERENCIA_PONTO * 100) / 100,
  }));

  const { rows: semResgateRows } = await getPool().query(
    `SELECT u.cpf, u.nome, COALESCE(pc.saldo_pontos, 0)::int AS saldo_pontos
     FROM usuario u
     JOIN pontos_conta pc ON pc.cpf = u.cpf
     WHERE pc.saldo_pontos >= 10
       AND NOT EXISTS (
         SELECT 1 FROM pontos_baixa pb WHERE pb.cpf = u.cpf
       )
     ORDER BY pc.saldo_pontos DESC`
  );

  const comPontosSemResgateTodos = semResgateRows.map((row) =>
    enriquecerComVendas(mapMembro(row), comprasMap, agora)
  );

  const compramForaTodos = [];
  for (const [cpf, vendas] of comprasMap) {
    if (cpfsMembros.has(cpf)) continue;
    compramForaTodos.push({
      cpf,
      nome: null,
      saldoPontos: 0,
      totalGasto: vendas.totalGasto,
      quantidadeCupons: vendas.quantidadeCupons,
      ultimaCompra: vendas.ultimaCompra,
      diasSemCompra: calcularDiasSemCompra(vendas.ultimaCompra, agora),
      ticketMedio:
        vendas.quantidadeCupons > 0
          ? Math.round((vendas.totalGasto / vendas.quantidadeCupons) * 100) /
            100
          : 0,
      foraDoClube: true,
    });
  }
  compramForaTodos.sort((a, b) => b.totalGasto - a.totalGasto);

  const topForaCpfs = compramForaTodos.slice(0, LIMITE_LISTA).map((c) => c.cpf);
  const nomesErpFora = await buscarNomesErpLote(topForaCpfs);
  for (const item of compramForaTodos) {
    if (!item.nome && nomesErpFora.has(item.cpf)) {
      item.nome = nomesErpFora.get(item.cpf);
    }
  }

  const totalMembros = membros.length;
  const membrosComCompra = membrosEnriquecidos.filter(
    (m) => m.quantidadeCupons > 0
  ).length;
  const totalCompradoresWrpdv = comprasMap.size;
  const taxaMembrosComprando =
    totalMembros > 0
      ? Math.round((membrosComCompra / totalMembros) * 100)
      : 0;

  return {
    periodo: {
      dias: diasConsulta,
      dataini: periodo.dataini,
      datafim: periodo.datafim,
    },
    resumo: {
      totalMembros,
      membrosComCompraNoPeriodo: membrosComCompra,
      cpfsComCompraWrpdv: totalCompradoresWrpdv,
      compramForaDoClube: compramForaTodos.length,
      taxaMembrosComprando,
      reaisPorPonto: REAIS_POR_PONTO,
      valorReferenciaPonto: VALOR_REFERENCIA_PONTO,
    },
    contagens: {
      compramForaDoClube: compramForaTodos.length,
      maioresCompradores: maioresCompradoresTodos.length,
      inativos: inativosTodos.length,
      pertoDoPremio: pertoDoPremioTodos.length,
      pontosExpirando: pontosExpirandoTodos.length,
      comPontosSemResgate: comPontosSemResgateTodos.length,
    },
    segmentos: {
      compramForaDoClube: compramForaTodos.slice(0, LIMITE_LISTA),
      maioresCompradores: maioresCompradoresTodos.slice(0, LIMITE_LISTA),
      inativos: inativosTodos.slice(0, LIMITE_LISTA),
      pertoDoPremio: pertoDoPremioTodos.slice(0, LIMITE_LISTA),
      pontosExpirando: pontosExpirandoTodos.slice(0, LIMITE_LISTA),
      comPontosSemResgate: comPontosSemResgateTodos.slice(0, LIMITE_LISTA),
    },
  };
}

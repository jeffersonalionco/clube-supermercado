import { Router } from "express";
import {
  atualizarClienteApi,
  buscarClientePorCpfCnpj,
  normalizarCpfCnpj,
} from "../services/apiClient.js";
import { buscarVendasCliente } from "../services/vendasService.js";
import { apresentarVendas } from "../services/vendasPresenter.js";
import { periodoMesAtual, validarPeriodoVendas } from "../utils/periodoVendas.js";
import {
  ajustarPeriodoAoCadastro,
  dataInicioPlataformaBR,
  filtrarItensAposCadastro,
} from "../utils/vendasPlataforma.js";
import { montarPayloadAtualizacao } from "../services/cadastroCliente.js";
import { apresentarCliente } from "../services/clientePresenter.js";
import { atualizarDadosUsuario } from "../services/usuarioService.js";
import { listarProdutosClubeDescontos } from "../services/produtosClubeDescontosService.js";
import {
  nivelFidelidadeFallback,
  obterNivelFidelidadeCliente,
} from "../services/nivelFidelidadeService.js";
import {
  obterExtratoPontos,
  obterHistoricoCompleto,
  obterSaldoPontos,
  REAIS_POR_PONTO,
  sincronizarPontos,
  sincronizarPontosDeItens,
} from "../services/pontosService.js";
import {
  listarBrindesCatalogo,
  listarCategoriasCatalogo,
} from "../services/brindesService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import {
  compararAlteracoesPerfil,
  EVENTOS_CLIENTE,
  registrarEventoCliente,
} from "../services/clienteAuditoriaService.js";
import {
  apresentarProgramaCliente,
  obterConfigPrograma,
  programaPontosAtivo,
} from "../services/programaConfigService.js";
import {
  apresentarConteudoCliente,
  obterConfigConteudo,
} from "../services/conteudoConfigService.js";
import {
  listarOfertasTv,
  proxyMediaTv,
  resolverMediaPathSeguro,
} from "../services/tvSlidesService.js";
import {
  obterEstadoRadio,
  proxyAudioRadio,
  resolverAudioRadioSeguro,
} from "../services/radioService.js";
import {
  buscarNovidadePublica,
  listarNovidadesPublicas,
} from "../services/novidadesService.js";

const MSG_PONTOS_INATIVO =
  "O programa de pontos não está disponível no momento.";

async function requirePontosAtivo(_req, res, next) {
  const ativo = await programaPontosAtivo();
  if (!ativo) {
    return res.status(403).json({ error: MSG_PONTOS_INATIVO });
  }
  next();
}

function resolverCodigoCliente(usuario, cliente) {
  const doUsuario = usuario.cliente_codigo;
  if (doUsuario != null && String(doUsuario).trim() !== "") {
    return String(doUsuario);
  }
  const doCliente =
    cliente?.codigo ?? cliente?.codigo_cliente ?? cliente?.id;
  return doCliente != null ? String(doCliente) : null;
}

const router = Router();

router.use(requireAuth);

/** Vídeo e conteúdo exibido na home do cliente. */
router.get("/conteudo", async (_req, res) => {
  try {
    const config = await obterConfigConteudo();
    return res.json(apresentarConteudoCliente(config));
  } catch (error) {
    console.error("[cliente/conteudo]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Produtos do clube de descontos (preço 2) para vitrine do cliente. */
router.get("/clube-descontos/produtos", async (req, res) => {
  try {
    const dados = await listarProdutosClubeDescontos({
      unidade: req.query.unidade,
      busca: req.query.busca,
      pagina: 1,
      limite: Math.min(24, Math.max(1, Number(req.query.limite) || 6)),
      atualizar: false,
    });

    return res.json({
      unidade: dados.unidade,
      sincronizadoEm: dados.sincronizadoEm,
      sincronizando: Boolean(dados.sincronizando),
      itens: dados.itens ?? [],
    });
  } catch (error) {
    console.error("[cliente/clube-descontos/produtos]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Status do programa de pontos para o cliente logado. */
router.get("/programa", async (_req, res) => {
  try {
    const config = await obterConfigPrograma();
    return res.json(apresentarProgramaCliente(config));
  } catch (error) {
    console.error("[cliente/programa]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Nível de fidelidade do ano corrente (gasto só após ativação do clube). */
router.get("/nivel", async (req, res) => {
  try {
    const clube = await obterNivelFidelidadeCliente(req.usuario.cpf, {
      usuario: req.usuario,
    });
    return res.json({ clube });
  } catch (error) {
    console.error("[cliente/nivel]", error.message);
    return res.json({ clube: nivelFidelidadeFallback(req.usuario) });
  }
});

/** Dados do cliente logado — CPF vem só do token, nunca do body/query. */
router.get("/me", async (req, res) => {
  try {
    const consulta = await buscarClientePorCpfCnpj(req.usuario.cpf);

    if (!consulta.ok) {
      return res.status(404).json({
        error: consulta.error || "Cadastro não encontrado na API",
      });
    }

    let clube;
    try {
      clube = await obterNivelFidelidadeCliente(req.usuario.cpf, {
        usuario: req.usuario,
      });
    } catch (error) {
      console.error("[cliente/me/nivel]", error.message);
      clube = nivelFidelidadeFallback(req.usuario);
    }

    const dados = apresentarCliente({
      usuario: req.usuario,
      cliente: consulta.cliente,
      raw: consulta.raw,
      clube,
    });

    return res.json({
      usuario: {
        id: req.usuario.id,
        cpf: req.usuario.cpf,
        nome: dados.perfil.nome,
        clienteCodigo: req.usuario.cliente_codigo,
      },
      ...dados,
    });
  } catch (error) {
    console.error("[cliente/me]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Atualiza dados do cliente logado — PUT /v1.8/clientes/{codigo}. */
router.put("/me", async (req, res) => {
  try {
    const consulta = await buscarClientePorCpfCnpj(req.usuario.cpf);

    if (!consulta.ok) {
      return res.status(404).json({
        error: consulta.error || "Cadastro não encontrado na API",
      });
    }

    const codigo = resolverCodigoCliente(req.usuario, consulta.cliente);
    if (!codigo) {
      return res.status(400).json({
        error: "Não foi possível identificar o código do seu cadastro.",
      });
    }

    const cpfBody = normalizarCpfCnpj(req.body?.cpf);
    if (cpfBody && cpfBody !== req.usuario.cpf) {
      return res.status(403).json({
        error: "Não é permitido alterar o CPF da conta.",
      });
    }

    let payload;
    let payloadAnterior;
    try {
      payloadAnterior = montarPayloadAtualizacao(
        { cpf: req.usuario.cpf },
        consulta.cliente
      );
      payload = montarPayloadAtualizacao(
        { ...req.body, cpf: req.usuario.cpf },
        consulta.cliente
      );
    } catch (err) {
      return res.status(400).json({ error: mensagemParaCliente(err.message) });
    }

    const resultado = await atualizarClienteApi(codigo, payload);

    if (!resultado.ok) {
      return res.status(400).json({ error: mensagemParaCliente(resultado.error) });
    }

    const atualizado = await buscarClientePorCpfCnpj(req.usuario.cpf);
    const clienteAtual = atualizado.ok ? atualizado.cliente : consulta.cliente;

    await atualizarDadosUsuario(req.usuario.id, {
      nome: payload.nome,
      clienteCodigo: Number(codigo) || codigo,
      dadosApi: clienteAtual,
    });

    const alteracoes = compararAlteracoesPerfil(payloadAnterior, payload);
    if (alteracoes.length) {
      await registrarEventoCliente({
        usuarioId: req.usuario.id,
        cpf: req.usuario.cpf,
        evento: EVENTOS_CLIENTE.ATUALIZACAO_PERFIL,
        sucesso: true,
        req,
        detalhes: { alteracoes },
      });
    }

    let clube;
    try {
      clube = await obterNivelFidelidadeCliente(req.usuario.cpf, {
        usuario: req.usuario,
      });
    } catch {
      clube = nivelFidelidadeFallback(req.usuario);
    }

    const dados = apresentarCliente({
      usuario: {
        ...req.usuario,
        nome: payload.nome,
        cliente_codigo: Number(codigo) || codigo,
      },
      cliente: clienteAtual,
      raw: atualizado.ok ? atualizado.raw : consulta.raw,
      clube,
    });

    return res.json({
      message: resultado.message || "Dados atualizados com sucesso",
      usuario: {
        id: req.usuario.id,
        cpf: req.usuario.cpf,
        nome: dados.perfil.nome,
        clienteCodigo: codigo,
      },
      ...dados,
    });
  } catch (error) {
    console.error("[cliente/me PUT]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Compras do cliente no período — máx. 90 dias. CPF só do token. */
router.get("/vendas", async (req, res) => {
  try {
    let dataini = req.query.dataini;
    let datafim = req.query.datafim;

    if (!dataini || !datafim) {
      const padrao = periodoMesAtual();
      dataini = padrao.dataini;
      datafim = padrao.datafim;
    }

    const periodoVal = validarPeriodoVendas(dataini, datafim);
    if (!periodoVal.ok) {
      return res.status(400).json({ error: periodoVal.error });
    }

    const periodoAjustado = ajustarPeriodoAoCadastro(
      periodoVal.dataini,
      periodoVal.datafim,
      req.usuario.criado_em
    );

    const periodoFinal = validarPeriodoVendas(
      periodoAjustado.dataini,
      periodoAjustado.datafim
    );

    if (!periodoFinal.ok) {
      return res.status(400).json({ error: periodoFinal.error });
    }

    const resultado = await buscarVendasCliente(
      req.usuario.cpf,
      periodoFinal.dataini,
      periodoFinal.datafim
    );

    if (!resultado.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(resultado.error),
      });
    }

    const itensElegiveis = filtrarItensAposCadastro(
      resultado.itens,
      req.usuario.criado_em
    );

    const itensParaPontos = itensElegiveis.filter(
      (item) =>
        !item.cancelada &&
        !item.convenio &&
        item.elegivelPontos !== false
    );

    if (await programaPontosAtivo()) {
      await sincronizarPontosDeItens(
        req.usuario.cpf,
        itensParaPontos,
        req.usuario.criado_em
      );
    }

    const apresentacao = await apresentarVendas(itensElegiveis, {
      dataini: periodoFinal.dataini,
      datafim: periodoFinal.datafim,
      dias: periodoFinal.dias,
    });

    return res.json({
      dataInicioPlataforma: dataInicioPlataformaBR(req.usuario.criado_em),
      ...apresentacao,
    });
  } catch (error) {
    console.error("[cliente/vendas]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Saldo de pontos — sincroniza cupons novos e retorna extrato recente. */
router.get("/pontos", requirePontosAtivo, async (req, res) => {
  try {
    const sync = await sincronizarPontos(req.usuario.cpf, req.usuario.criado_em);

    if (!sync.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(sync.error),
      });
    }

    const saldo = await obterSaldoPontos(req.usuario.cpf);
    const extrato = await obterExtratoPontos(req.usuario.cpf);

    return res.json({
      regra: {
        reaisPorPonto: REAIS_POR_PONTO,
        descricao: `1 ponto a cada R$ ${REAIS_POR_PONTO} em compras (saldo acumulado)`,
      },
      dataInicioPlataforma: dataInicioPlataformaBR(req.usuario.criado_em),
      saldo: saldo.saldo,
      valorPendente: saldo.valorPendente,
      faltaParaProximoPonto: saldo.faltaParaProximoPonto,
      cuponsProcessados: saldo.cupons,
      sync: {
        novosCupons: sync.novosCupons,
        pontosCreditados: sync.pontosCreditados,
        periodo: sync.periodo,
      },
      extrato,
    });
  } catch (error) {
    console.error("[cliente/pontos]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Histórico de pontos — compras contabilizadas e resgates. */
router.get("/pontos/historico", requirePontosAtivo, async (req, res) => {
  try {
    const sync = await sincronizarPontos(req.usuario.cpf, req.usuario.criado_em);

    if (!sync.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(sync.error),
      });
    }

    const saldo = await obterSaldoPontos(req.usuario.cpf);
    const historico = await obterHistoricoCompleto(
      req.usuario.cpf,
      50,
      req.usuario.criado_em
    );

    return res.json({
      regra: {
        reaisPorPonto: REAIS_POR_PONTO,
        descricao: `1 ponto a cada R$ ${REAIS_POR_PONTO} em compras (saldo acumulado)`,
      },
      dataInicioPlataforma: dataInicioPlataformaBR(req.usuario.criado_em),
      saldo: saldo.saldo,
      valorPendente: saldo.valorPendente,
      faltaParaProximoPonto: saldo.faltaParaProximoPonto,
      validadeMeses: saldo.validadeMeses,
      proximaExpiracao: saldo.proximaExpiracao,
      pontosProximaExpiracao: saldo.pontosProximaExpiracao,
      resumo: historico.resumo,
      timeline: historico.timeline,
      sync: {
        novosCupons: sync.novosCupons,
        pontosCreditados: sync.pontosCreditados,
      },
    });
  } catch (error) {
    console.error("[cliente/pontos/historico]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Catálogo de prêmios disponíveis — ativos e com estoque. */
router.get("/brindes", requirePontosAtivo, async (req, res) => {
  try {
    const categoria = String(req.query.categoria || "").trim() || null;
    const categorias = await listarCategoriasCatalogo();
    const brindes = await listarBrindesCatalogo({ categoria });
    const saldo = await obterSaldoPontos(req.usuario.cpf);

    return res.json({
      categorias,
      brindes,
      pontos: {
        saldo: saldo.saldo,
        faltaParaProximoPonto: saldo.faltaParaProximoPonto,
        reaisPorPonto: REAIS_POR_PONTO,
      },
      filtro: categoria,
    });
  } catch (error) {
    console.error("[cliente/brindes]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Ofertas da TV da loja (playlist ativa). */
router.get("/ofertas", async (_req, res) => {
  try {
    const dados = await listarOfertasTv();
    return res.json(dados);
  } catch (error) {
    console.error("[cliente/ofertas]", error.message);
    return res.status(502).json({
      error: "Não foi possível carregar as ofertas da loja no momento.",
    });
  }
});

/** Proxy de mídia das ofertas (aceita ?token= para <img>/<video>). */
router.get("/ofertas/media/:arquivo", async (req, res) => {
  const mediaPath = resolverMediaPathSeguro(req.params.arquivo);
  if (!mediaPath) {
    return res.status(400).json({ error: "Mídia inválida" });
  }

  try {
    const upstream = await proxyMediaTv(mediaPath, {
      range: req.headers.range,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status === 404 ? 404 : 502).json({
        error: "Mídia indisponível",
      });
    }

    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const acceptRanges = upstream.headers.get("accept-ranges");
    const contentRange = upstream.headers.get("content-range");
    const cacheControl = upstream.headers.get("cache-control");

    if (contentType) res.set("Content-Type", contentType);
    if (contentLength) res.set("Content-Length", contentLength);
    if (acceptRanges) res.set("Accept-Ranges", acceptRanges);
    if (contentRange) res.set("Content-Range", contentRange);
    res.set("Cache-Control", cacheControl || "private, max-age=300");

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (error) {
    console.error("[cliente/ofertas/media]", error.message);
    return res.status(502).json({ error: "Falha ao carregar mídia" });
  }
});

/** Estado ao vivo da Rádio Mercado (somente leitura). */
router.get("/radio", async (_req, res) => {
  try {
    const estado = await obterEstadoRadio();
    return res.json(estado);
  } catch (error) {
    console.error("[cliente/radio]", error.message);
    return res.status(502).json({
      error: "Rádio indisponível no momento.",
    });
  }
});

/** Proxy do áudio da rádio (aceita ?token= para <audio>). */
router.get("/radio/audio/:arquivo", async (req, res) => {
  const audioPath = resolverAudioRadioSeguro(req.params.arquivo);
  if (!audioPath) {
    return res.status(400).json({ error: "Áudio inválido" });
  }

  try {
    const upstream = await proxyAudioRadio(audioPath, {
      range: req.headers.range,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status === 404 ? 404 : 502).json({
        error: "Áudio indisponível",
      });
    }

    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    const acceptRanges = upstream.headers.get("accept-ranges");
    const contentRange = upstream.headers.get("content-range");

    if (contentType) res.set("Content-Type", contentType);
    if (contentLength) res.set("Content-Length", contentLength);
    if (acceptRanges) res.set("Accept-Ranges", acceptRanges);
    if (contentRange) res.set("Content-Range", contentRange);
    res.set("Cache-Control", "private, max-age=60");

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.send(buf);
  } catch (error) {
    console.error("[cliente/radio/audio]", error.message);
    return res.status(502).json({ error: "Falha ao carregar áudio" });
  }
});

router.get("/novidades", async (_req, res) => {
  try {
    const novidades = await listarNovidadesPublicas();
    return res.json({ novidades });
  } catch (error) {
    console.error("[cliente/novidades]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/novidades/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    const novidade = await buscarNovidadePublica(id);
    if (!novidade) {
      return res.status(404).json({ error: "Novidade não encontrada" });
    }
    return res.json({ novidade });
  } catch (error) {
    console.error("[cliente/novidades/:id]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

export default router;

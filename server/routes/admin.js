import { Router } from "express";
import { normalizarCpfCnpj } from "../services/apiClient.js";
import { criarTokenAdmin } from "../services/adminToken.js";
import {
  credenciaisAdminConfiguradas,
  validarCredenciaisAdmin,
} from "../services/adminAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { adminLoginLimiter } from "../middleware/rateLimit.js";
import {
  alterarSenhaUsuario,
  buscarUsuarioPorCpf,
  listarUsuarios,
} from "../services/usuarioService.js";
import { validarSenhaCadastro } from "../utils/senha.js";
import {
  EVENTOS_CLIENTE,
  registrarEventoCliente,
} from "../services/clienteAuditoriaService.js";
import {
  confirmarAssinaturaComprovante,
  expandirPedidoResgate,
  gerarHtmlComprovante,
  obterComprovantePorCodigo,
  registrarResgateComProvante,
} from "../services/resgateComprovanteService.js";
import {
  obterHistoricoBaixas,
  obterResumoPontosBrindes,
  obterSaldoPontos,
  sincronizarPontos,
} from "../services/pontosService.js";
import { listarBrindesCatalogo } from "../services/brindesService.js";
import { dataInicioPlataformaBR } from "../utils/vendasPlataforma.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import { listarAuditoriaCliente } from "../services/clienteAuditoriaService.js";
import {
  alterarSenhaAdministrador,
  atualizarAdministrador,
  criarAdministrador,
  listarAdministradores,
} from "../services/painelAdminService.js";
import { listarOperacoesRecentes } from "../services/adminOperacoesService.js";
import {
  listarSegmentosClientes,
  obterFichaClienteAdmin,
} from "../services/adminClientesService.js";
import {
  apresentarProgramaCliente,
  atualizarPontosHabilitado,
  obterConfigPrograma,
} from "../services/programaConfigService.js";
import {
  apresentarConteudoAdmin,
  atualizarVideoHome,
  obterConfigConteudo,
} from "../services/conteudoConfigService.js";
import { listarProdutosClubeDescontos } from "../services/produtosClubeDescontosService.js";

const router = Router();

router.post("/auth/login", adminLoginLimiter, async (req, res) => {
  const { usuario, senha } = req.body || {};

  if (!(await credenciaisAdminConfiguradas())) {
    return res.status(503).json({
      error: "Acesso administrativo não configurado no servidor",
    });
  }

  if (!usuario || !senha) {
    return res.status(400).json({ error: "Informe usuário e senha" });
  }

  const ok = await validarCredenciaisAdmin(usuario, senha);
  if (!ok) {
    return res.status(401).json({ error: "Usuário ou senha incorretos" });
  }

  const token = criarTokenAdmin(usuario);

  return res.json({
    success: true,
    token,
    admin: { usuario },
  });
});

router.use(requireAdmin);

router.get("/config/programa", async (_req, res) => {
  try {
    const config = await obterConfigPrograma({ forcar: true });
    return res.json({
      ...apresentarProgramaCliente(config),
      pontosHabilitado: config.pontosHabilitado,
      atualizadoEm: config.atualizadoEm?.toISOString() ?? null,
      atualizadoPor: config.atualizadoPor,
    });
  } catch (error) {
    console.error("[admin/config/programa GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/config/conteudo", async (_req, res) => {
  try {
    const config = await obterConfigConteudo({ forcar: true });
    return res.json(apresentarConteudoAdmin(config));
  } catch (error) {
    console.error("[admin/config/conteudo GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/config/conteudo", async (req, res) => {
  try {
    const { videoHomeUrl, videoHomeTitulo, videoHomeAtivo } = req.body || {};

    if (
      videoHomeUrl !== undefined &&
      videoHomeUrl !== null &&
      typeof videoHomeUrl !== "string"
    ) {
      return res.status(400).json({ error: "videoHomeUrl deve ser texto" });
    }
    if (
      videoHomeTitulo !== undefined &&
      videoHomeTitulo !== null &&
      typeof videoHomeTitulo !== "string"
    ) {
      return res.status(400).json({ error: "videoHomeTitulo deve ser texto" });
    }
    if (
      videoHomeAtivo !== undefined &&
      typeof videoHomeAtivo !== "boolean"
    ) {
      return res.status(400).json({
        error: "videoHomeAtivo deve ser true ou false",
      });
    }

    const config = await atualizarVideoHome(
      {
        url: videoHomeUrl,
        titulo: videoHomeTitulo,
        ativo: videoHomeAtivo,
      },
      req.admin?.usuario
    );

    return res.json({
      message: "Conteúdo da home atualizado",
      ...apresentarConteudoAdmin(config),
    });
  } catch (error) {
    if (error.code === "YOUTUBE_URL_INVALIDA") {
      return res.status(400).json({
        error: "Informe uma URL válida do YouTube (watch, youtu.be ou shorts)",
      });
    }
    console.error("[admin/config/conteudo PATCH]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/config/programa", async (req, res) => {
  try {
    const { pontosHabilitado } = req.body || {};
    if (typeof pontosHabilitado !== "boolean") {
      return res.status(400).json({
        error: "Informe pontosHabilitado como true ou false",
      });
    }

    const config = await atualizarPontosHabilitado(
      pontosHabilitado,
      req.admin?.usuario
    );

    return res.json({
      message: pontosHabilitado
        ? "Programa de pontos habilitado para clientes"
        : "Programa de pontos desabilitado para clientes",
      ...apresentarProgramaCliente(config),
      pontosHabilitado: config.pontosHabilitado,
      atualizadoEm: config.atualizadoEm?.toISOString() ?? null,
      atualizadoPor: config.atualizadoPor,
    });
  } catch (error) {
    console.error("[admin/config/programa PATCH]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/clube-descontos/produtos", async (req, res) => {
  try {
    const dados = await listarProdutosClubeDescontos({
      unidade: req.query.unidade,
      busca: req.query.busca,
      pagina: req.query.pagina,
      limite: req.query.limite,
      atualizar: req.query.atualizar === "1" || req.query.atualizar === "true",
    });
    return res.json(dados);
  } catch (error) {
    console.error("[admin/clube-descontos/produtos]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/resumo", async (_req, res) => {
  try {
    const resumo = await obterResumoPontosBrindes();
    return res.json(resumo);
  } catch (error) {
    console.error("[admin/resumo]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/operacoes", async (req, res) => {
  try {
    const limite = Number(req.query.limite) || 40;
    const dias = Number(req.query.dias) || 30;
    const dados = await listarOperacoesRecentes({ limite, dias });
    return res.json(dados);
  } catch (error) {
    console.error("[admin/operacoes]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/clientes/segmentos", async (req, res) => {
  try {
    const dias = Number(req.query.dias) || 90;
    const dados = await listarSegmentosClientes(dias);
    return res.json(dados);
  } catch (error) {
    console.error("[admin/clientes/segmentos]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/clientes/:cpf/ficha", async (req, res) => {
  const cpf = normalizarCpfCnpj(req.params.cpf);
  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return res.status(400).json({ error: "CPF ou CNPJ inválido" });
  }

  try {
    const dias = Number(req.query.dias) || 90;
    const ficha = await obterFichaClienteAdmin(cpf, dias);
    if (!ficha.ok) {
      return res.status(400).json({ error: ficha.error });
    }
    return res.json(ficha);
  } catch (error) {
    console.error("[admin/clientes/ficha]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/clientes/:cpf/pontos", async (req, res) => {
  const cpf = normalizarCpfCnpj(req.params.cpf);

  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return res.status(400).json({ error: "CPF ou CNPJ inválido" });
  }

  try {
    const usuario = await buscarUsuarioPorCpf(cpf);

    if (!usuario) {
      return res.status(404).json({
        error: "Cliente não cadastrado na plataforma do clube",
      });
    }

    const sync = await sincronizarPontos(cpf, usuario.criado_em);
    if (!sync.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(sync.error),
      });
    }

    const saldo = await obterSaldoPontos(cpf);
    const baixas = await obterHistoricoBaixas(cpf, 20);
    const brindes = await listarBrindesCatalogo();

    return res.json({
      cliente: {
        cpf: usuario.cpf,
        nome: usuario.nome,
        clienteCodigo: usuario.cliente_codigo,
        cadastradoEm: usuario.criado_em,
        dataInicioPlataforma: dataInicioPlataformaBR(usuario.criado_em),
      },
      pontos: saldo,
      baixas,
      brindes,
      sync: {
        novosCupons: sync.novosCupons,
        pontosCreditados: sync.pontosCreditados,
      },
    });
  } catch (error) {
    console.error("[admin/clientes/pontos]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.post("/clientes/:cpf/resgates", async (req, res) => {
  const cpf = normalizarCpfCnpj(req.params.cpf);
  const observacao = String(req.body?.observacao || "").trim();

  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return res.status(400).json({ error: "CPF ou CNPJ inválido" });
  }

  const pedido =
    Array.isArray(req.body?.itens) && req.body.itens.length
      ? { itens: req.body.itens }
      : Array.isArray(req.body?.brindeIds)
        ? req.body.brindeIds
        : req.body?.brindeId != null
          ? [req.body.brindeId]
          : [];

  const ids = expandirPedidoResgate(pedido);
  if (!ids.length) {
    return res.status(400).json({ error: "Selecione ao menos um brinde para resgate" });
  }

  try {
    const usuario = await buscarUsuarioPorCpf(cpf);

    if (!usuario) {
      return res.status(404).json({
        error: "Cliente não cadastrado na plataforma do clube",
      });
    }

    const comprovante = await registrarResgateComProvante(cpf, pedido, {
      observacao: observacao || undefined,
      adminUsuario: req.admin.usuario,
      clienteNome: usuario.nome,
    });

    const saldo = await obterSaldoPontos(cpf);
    const resumoItens = [];
    const contagem = new Map();
    for (const item of comprovante.itens) {
      const chave = item.brindeNome;
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
    for (const [nome, qtd] of contagem) {
      resumoItens.push(qtd > 1 ? `${nome} (×${qtd})` : nome);
    }
    const nomes = resumoItens.join(", ");

    return res.json({
      message: `Resgate registrado (código ${comprovante.codigo}): ${nomes}`,
      comprovante,
      htmlComprovante: gerarHtmlComprovante(comprovante),
      pontos: saldo,
    });
  } catch (error) {
    console.error("[admin/clientes/resgates]", error.message);
    const status = /insuficiente|esgotado|indisponível|não encontrado/i.test(error.message)
      ? 400
      : 500;
    return res.status(status).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/comprovantes/:codigo", async (req, res) => {
  const codigo = String(req.params.codigo || "").trim();
  if (!codigo) {
    return res.status(400).json({ error: "Informe o código do comprovante" });
  }

  try {
    const comprovante = await obterComprovantePorCodigo(codigo);
    if (!comprovante) {
      return res.status(404).json({ error: "Comprovante não encontrado" });
    }

    return res.json({
      comprovante,
      htmlComprovante: gerarHtmlComprovante(comprovante),
    });
  } catch (error) {
    console.error("[admin/comprovantes GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/comprovantes/:codigo/assinatura", async (req, res) => {
  const codigo = String(req.params.codigo || "").trim();
  const observacao = String(req.body?.observacao || "").trim();

  if (!codigo) {
    return res.status(400).json({ error: "Informe o código do comprovante" });
  }

  try {
    const comprovante = await confirmarAssinaturaComprovante(codigo, {
      adminUsuario: req.admin.usuario,
      observacao: observacao || undefined,
    });

    return res.json({
      message: "Assinatura do cliente confirmada e registrada no sistema",
      comprovante,
      htmlComprovante: gerarHtmlComprovante(comprovante),
    });
  } catch (error) {
    console.error("[admin/comprovantes/assinatura]", error.message);
    const status = /não encontrado|já confirmada/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/administradores", async (_req, res) => {
  try {
    const administradores = await listarAdministradores();
    return res.json({ administradores, total: administradores.length });
  } catch (error) {
    console.error("[admin/administradores GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/administradores", async (req, res) => {
  const { usuario, nome, senha, confirmacaoSenha } = req.body || {};

  if (!usuario || !senha) {
    return res.status(400).json({ error: "Informe usuário e senha" });
  }

  if (senha !== confirmacaoSenha) {
    return res.status(400).json({ error: "A confirmação da senha não confere" });
  }

  try {
    const admin = await criarAdministrador({ usuario, nome, senha });
    return res.status(201).json({
      message: `Administrador "${admin.usuario}" criado com sucesso`,
      administrador: admin,
    });
  } catch (error) {
    console.error("[admin/administradores POST]", error.message);
    const status = /já existe|pelo menos|usuário/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.put("/administradores/:id/senha", async (req, res) => {
  const id = Number(req.params.id);
  const novaSenha = String(req.body?.novaSenha || "");
  const confirmacao = String(req.body?.confirmacaoSenha || "");

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Administrador inválido" });
  }

  const validacao = validarSenhaCadastro(novaSenha);
  if (!validacao.ok) {
    return res.status(400).json({ error: validacao.error });
  }

  if (novaSenha !== confirmacao) {
    return res.status(400).json({ error: "A confirmação da senha não confere" });
  }

  try {
    const administrador = await alterarSenhaAdministrador(id, novaSenha);
    return res.json({
      message: "Senha do administrador atualizada",
      administrador,
    });
  } catch (error) {
    console.error("[admin/administradores/:id/senha PUT]", error.message);
    const status = /não encontrado/i.test(error.message) ? 404 : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/administradores/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Administrador inválido" });
  }

  try {
    const administrador = await atualizarAdministrador(
      id,
      {
        nome: req.body?.nome,
        ativo: req.body?.ativo,
      },
      { usuarioLogado: req.admin.usuario }
    );

    return res.json({
      message: administrador.ativo
        ? "Administrador atualizado"
        : "Administrador desativado",
      administrador,
    });
  } catch (error) {
    console.error("[admin/administradores/:id PATCH]", error.message);
    const status = /não encontrado|não pode|último/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/usuarios", async (req, res) => {
  try {
    const busca = String(req.query.busca || "").trim();
    const limite = Number(req.query.limite) || 50;
    const offset = Number(req.query.offset) || 0;
    const resultado = await listarUsuarios({ busca, limite, offset });
    return res.json(resultado);
  } catch (error) {
    console.error("[admin/usuarios GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/usuarios/:cpf", async (req, res) => {
  const cpf = normalizarCpfCnpj(req.params.cpf);

  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return res.status(400).json({ error: "CPF ou CNPJ inválido" });
  }

  try {
    const usuario = await buscarUsuarioPorCpf(cpf);

    if (!usuario) {
      return res.status(404).json({
        error: "Usuário não cadastrado na plataforma do clube",
      });
    }

    const saldo = await obterSaldoPontos(cpf);

    return res.json({
      usuario: {
        id: usuario.id,
        cpf: usuario.cpf,
        nome: usuario.nome,
        clienteCodigo: usuario.cliente_codigo,
        criadoEm: usuario.criado_em,
        atualizadoEm: usuario.atualizado_em,
        aceiteRegulamentoEm: usuario.aceite_regulamento_em,
        aceitePrivacidadeEm: usuario.aceite_privacidade_em,
        saldoPontos: saldo.saldo,
        dataInicioPlataforma: dataInicioPlataformaBR(usuario.criado_em),
      },
    });
  } catch (error) {
    console.error("[admin/usuarios/:cpf GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.put("/usuarios/:cpf/senha", async (req, res) => {
  const cpf = normalizarCpfCnpj(req.params.cpf);
  const novaSenha = String(req.body?.novaSenha || "");
  const confirmacao = String(req.body?.confirmacaoSenha || "");

  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return res.status(400).json({ error: "CPF ou CNPJ inválido" });
  }

  const validacao = validarSenhaCadastro(novaSenha);
  if (!validacao.ok) {
    return res.status(400).json({ error: validacao.error });
  }

  if (novaSenha !== confirmacao) {
    return res.status(400).json({ error: "A confirmação da senha não confere" });
  }

  try {
    const usuario = await buscarUsuarioPorCpf(cpf);

    if (!usuario) {
      return res.status(404).json({
        error: "Usuário não cadastrado na plataforma do clube",
      });
    }

    const atualizado = await alterarSenhaUsuario(usuario.id, novaSenha);

    await registrarEventoCliente({
      usuarioId: usuario.id,
      cpf: usuario.cpf,
      evento: EVENTOS_CLIENTE.SENHA_ADMIN,
      sucesso: true,
      detalhes: { adminUsuario: req.admin.usuario },
    });

    return res.json({
      message: "Senha atualizada com sucesso",
      usuario: {
        id: atualizado.id,
        cpf: atualizado.cpf,
        nome: atualizado.nome,
        clienteCodigo: atualizado.cliente_codigo,
        atualizadoEm: atualizado.atualizado_em,
      },
    });
  } catch (error) {
    console.error("[admin/usuarios/:cpf/senha PUT]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/clientes/:cpf/auditoria", async (req, res) => {
  const cpf = normalizarCpfCnpj(req.params.cpf);

  if (!cpf || (cpf.length !== 11 && cpf.length !== 14)) {
    return res.status(400).json({ error: "CPF ou CNPJ inválido" });
  }

  try {
    const usuario = await buscarUsuarioPorCpf(cpf);

    if (!usuario) {
      return res.status(404).json({
        error: "Cliente não cadastrado na plataforma do clube",
      });
    }

    const evento = String(req.query.evento || "").trim() || null;
    const limite = Number(req.query.limite) || 100;
    const eventos = await listarAuditoriaCliente(cpf, { limite, evento });

    return res.json({
      cliente: {
        cpf: usuario.cpf,
        nome: usuario.nome,
        clienteCodigo: usuario.cliente_codigo,
        cadastradoEm: usuario.criado_em,
      },
      eventos,
      total: eventos.length,
    });
  } catch (error) {
    console.error("[admin/clientes/auditoria]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

export default router;

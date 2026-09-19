import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import multer from "multer";
import {
  requireAtendente,
  requirePadaria,
  requirePadariaAdmin,
} from "../middleware/requirePadaria.js";
import {
  autenticarUsuarioPadaria,
  criarUsuarioPadaria,
  listarUsuariosPadaria,
  atualizarUsuarioPadaria,
} from "../services/padariaAuthService.js";
import {
  obterConfigPadaria,
  salvarConfigPadaria,
} from "../services/padariaConfigService.js";
import {
  listarCatalogoPublico,
  obterProdutoCatalogo,
  listarProdutosAdmin,
  obterProdutoAdmin,
  atualizarProdutoPadaria,
  adicionarProdutoPorCodigo,
  atualizarProdutosCadastrados,
  obterStatusSyncPadaria,
  definirImagemProduto,
  sincronizarProdutoCodigo,
} from "../services/padariaProdutosService.js";
import {
  listarCategoriasPadaria,
  criarCategoriaPadaria,
  atualizarCategoriaPadaria,
  excluirCategoriaPadaria,
} from "../services/padariaCategoriasService.js";
import {
  criarPedido,
  listarPedidos,
  listarPedidosConflitoHorario,
  obterPedido,
  listarProducaoDoDia,
  atualizarStatusPedido,
  atualizarPedidoAtendente,
  obterDashboardPadaria,
  buscarClientePorTelefone,
  MOTIVOS_CANCELAMENTO_LABEL,
} from "../services/padariaPedidosService.js";
import {
  listarDecoracoesCatalogo,
  listarDecoracoesAdmin,
  listarDecoracoesPorProduto,
  criarDecoracao,
  criarDecoracaoGlobal,
  atualizarDecoracao,
  excluirDecoracao,
  definirImagemDecoracao,
  obterDecoracao,
} from "../services/padariaDecoracoesService.js";
import { buscarClientesAdmin } from "../services/adminClientesService.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import { trackCatalogoMetaFireAndForget } from "../services/marketing/metaConversionsService.js";
import { normalizarTelefoneWa } from "../services/marketing/whatsappCloudService.js";

function whatsappEquipePublico() {
  return (
    normalizarTelefoneWa(process.env.WHATSAPP_REDIRECT_WA || "4598161551") ||
    "554598161551"
  );
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, "../uploads/padaria");
fs.mkdirSync(uploadDir, { recursive: true });

const extensoesPermitidas = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!/^image\//.test(file.mimetype) || !extensoesPermitidas.has(ext)) {
      return cb(new Error("Envie uma imagem JPG, PNG, WEBP ou GIF"));
    }
    cb(null, true);
  },
});

const router = Router();

/* —— Público —— */
router.get("/catalogo", async (req, res) => {
  try {
    const [produtos, categorias] = await Promise.all([
      listarCatalogoPublico({
        busca: String(req.query.busca || ""),
        categoriaId: req.query.categoriaId || null,
      }),
      listarCategoriasPadaria({ apenasAtivas: true }),
    ]);
    return res.json({
      produtos,
      categorias,
      whatsappEquipe: whatsappEquipePublico(),
    });
  } catch (error) {
    console.error("[padaria/catalogo]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/categorias", async (_req, res) => {
  try {
    const categorias = await listarCategoriasPadaria({ apenasAtivas: true });
    return res.json({ categorias });
  } catch (error) {
    console.error("[padaria/categorias]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/catalogo/decoracoes", async (req, res) => {
  try {
    const decoracoes = await listarDecoracoesCatalogo({
      busca: String(req.query.busca || ""),
    });
    return res.json({ decoracoes });
  } catch (error) {
    console.error("[padaria/catalogo/decoracoes]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/catalogo/:codigo", async (req, res) => {
  try {
    const produto = await obterProdutoCatalogo(req.params.codigo);
    if (!produto) {
      return res.status(404).json({ error: "Produto não encontrado no catálogo" });
    }
    return res.json({ produto });
  } catch (error) {
    console.error("[padaria/catalogo/:codigo]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

/* —— Auth —— */
router.post("/auth/login", async (req, res) => {
  try {
    const resultado = await autenticarUsuarioPadaria(
      req.body?.login,
      req.body?.senha
    );
    if (!resultado.ok) {
      return res.status(401).json({ error: resultado.error });
    }
    return res.json({
      token: resultado.token,
      usuario: resultado.usuario,
    });
  } catch (error) {
    console.error("[padaria/auth/login]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

/** Config de retirada (horário / antecedência) para o balcão. */
router.get("/config", requireAtendente, async (_req, res) => {
  try {
    const raw = await obterConfigPadaria();
    return res.json({
      config: {
        antecedenciaMinimaHoras: Number(raw.antecedencia_minima_horas) || 0,
        horarioRetiradaInicio: raw.horario_retirada_inicio || "08:00",
        horarioRetiradaFim: raw.horario_retirada_fim || "19:00",
      },
    });
  } catch (error) {
    console.error("[padaria/config GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

/* —— Atendente —— */
router.get("/clientes/busca", requireAtendente, async (req, res) => {
  try {
    const resultado = await buscarClientesAdmin(String(req.query.q || ""), {
      limite: Number(req.query.limite) || 10,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[padaria/clientes/busca]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/pedidos", requireAtendente, async (req, res) => {
  try {
    const pedido = await criarPedido({
      ...req.body,
      criadoPorId: req.padariaUsuario.id,
      criadoPorNome: req.padariaUsuario.nome,
    });
    trackCatalogoMetaFireAndForget({
      eventName: "Purchase",
      items: (pedido.itens || []).map((i) => ({
        codigo: i.produtoCodigo,
        nome: i.nome,
        preco: i.precoUnitario,
        quantidade: i.quantidade,
      })),
      actionSource: "physical_store",
      telefone: pedido.clienteTelefone,
      nome: pedido.clienteNome,
      externalId: pedido.clienteCpf,
      eventSourceUrl: "https://clube.mercadosuperama.com.br/#/padaria",
      orderId: pedido.codigoPublico,
    });
    return res.status(201).json({ pedido });
  } catch (error) {
    console.error("[padaria/pedidos POST]", error.message);
    const status = /informe|adicione|inválid|não está disponível|não é possível|deve ter|deve ser|passado|antecedência|formato/i.test(
      error.message
    )
      ? 400
      : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/pedidos", requireAtendente, async (req, res) => {
  try {
    const resultado = await listarPedidos({
      status: req.query.status,
      dataRetirada: req.query.dataRetirada,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      busca: req.query.busca,
      limite: req.query.limite,
      offset: req.query.offset,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[padaria/pedidos GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/pedidos/motivos-cancelamento", requireAtendente, (_req, res) => {
  return res.json({ motivos: MOTIVOS_CANCELAMENTO_LABEL });
});

router.get("/pedidos/conflito-horario", requireAtendente, async (req, res) => {
  try {
    const resultado = await listarPedidosConflitoHorario({
      dataRetirada: req.query.data || req.query.dataRetirada,
      horaRetirada: req.query.hora || req.query.horaRetirada,
      janelaMinutos: req.query.janelaMinutos ?? 15,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[padaria/pedidos/conflito-horario]", error.message);
    const status = /inválid/i.test(error.message) ? 400 : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/clientes/telefone", requireAtendente, async (req, res) => {
  try {
    const cliente = await buscarClientePorTelefone(req.query.telefone);
    return res.json({ cliente });
  } catch (error) {
    console.error("[padaria/clientes/telefone]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/dashboard", requireAtendente, async (req, res) => {
  try {
    const dashboard = await obterDashboardPadaria(req.query.data);
    return res.json({ dashboard });
  } catch (error) {
    console.error("[padaria/dashboard]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/pedidos/:id", requireAtendente, async (req, res) => {
  try {
    const pedido = await obterPedido(req.params.id);
    if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });
    return res.json({ pedido });
  } catch (error) {
    console.error("[padaria/pedidos/:id GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/pedidos/:id", requireAtendente, async (req, res) => {
  try {
    const pedido = await atualizarPedidoAtendente(
      req.params.id,
      req.body || {},
      req.padariaUsuario
    );
    return res.json({ pedido });
  } catch (error) {
    console.error("[padaria/pedidos/:id PATCH]", error.message);
    const status = /não encontrado|não pode|só é possível|não permitido|informe o motivo/i.test(
      error.message
    )
      ? 400
      : 500;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

/* —— Produção —— */
router.get("/producao", requirePadaria, async (req, res) => {
  try {
    const dados = await listarProducaoDoDia(req.query.data);
    return res.json(dados);
  } catch (error) {
    console.error("[padaria/producao]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/pedidos/:id/status", requirePadaria, async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim();
    // Produção avança/volta a fila; cancelamento/entrega ficam no atendente.
    if (!["novo", "em_producao", "pronto"].includes(status)) {
      return res.status(403).json({
        error: "Produção só pode iniciar, marcar pronto ou voltar o status",
      });
    }
    const pedido = await atualizarStatusPedido(
      req.params.id,
      status,
      req.padariaUsuario.id,
      {
        motivoCancelamento: req.body?.motivoCancelamento,
        usuarioNome: req.padariaUsuario.nome,
      }
    );
    return res.json({ pedido });
  } catch (error) {
    console.error("[padaria/pedidos/:id/status]", error.message);
    const statusCode = /não encontrado|não é possível|inválido|informe o motivo/i.test(
      error.message
    )
      ? 400
      : 500;
    return res
      .status(statusCode)
      .json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/admin/dashboard", requirePadariaAdmin, async (req, res) => {
  try {
    const dashboard = await obterDashboardPadaria(req.query.data);
    return res.json({ dashboard });
  } catch (error) {
    console.error("[padaria/admin/dashboard]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/admin/pedidos", requirePadariaAdmin, async (req, res) => {
  try {
    const resultado = await listarPedidos({
      status: req.query.status,
      dataRetirada: req.query.dataRetirada,
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      busca: req.query.busca,
      limite: req.query.limite,
      offset: req.query.offset,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[padaria/admin/pedidos]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

/* —— Admin / gestão —— */
router.get("/admin/sync/status", requirePadariaAdmin, (_req, res) => {
  return res.json({ status: obterStatusSyncPadaria() });
});

/** Atualiza preço/nome RP só dos produtos já cadastrados. */
router.post("/admin/sync", requirePadariaAdmin, async (req, res) => {
  try {
    const resultado = await atualizarProdutosCadastrados({
      forcar: Boolean(req.body?.forcar),
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[padaria/admin/sync]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/admin/produtos", requirePadariaAdmin, async (req, res) => {
  try {
    const resultado = await listarProdutosAdmin({
      busca: req.query.busca,
      apenasCatalogo: req.query.apenasCatalogo === "1",
      filtro: req.query.filtro,
      limite: req.query.limite,
      offset: req.query.offset,
    });
    return res.json(resultado);
  } catch (error) {
    console.error("[padaria/admin/produtos]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

/** Busca no RP por código interno e cadastra/ativa na padaria. */
router.post("/admin/produtos/adicionar", requirePadariaAdmin, async (req, res) => {
  try {
    const produto = await adicionarProdutoPorCodigo(req.body?.codigo, {
      ativarCatalogo: req.body?.ativarCatalogo !== false,
    });
    return res.json({ produto });
  } catch (error) {
    console.error("[padaria/admin/produtos/adicionar]", error.message);
    const status = /não encontrado/i.test(error.message) ? 404 : 400;
    return res
      .status(status)
      .json({ error: mensagemParaCliente(error.message) });
  }
});

/** Recarrega um código já cadastrado a partir do RP. */
router.post(
  "/admin/produtos/:codigo/atualizar-rp",
  requirePadariaAdmin,
  async (req, res) => {
    try {
      const produto = await sincronizarProdutoCodigo(req.params.codigo);
      return res.json({ produto });
    } catch (error) {
      console.error("[padaria/admin/produtos/atualizar-rp]", error.message);
      return res
        .status(400)
        .json({ error: mensagemParaCliente(error.message) });
    }
  }
);

/** Envia/atualiza o produto no catálogo Meta (WhatsApp). */
router.post(
  "/admin/produtos/:codigo/sync-meta",
  requirePadariaAdmin,
  async (req, res) => {
    try {
      const { sincronizarProdutoMetaCatalog } = await import(
        "../services/marketing/metaCatalogService.js"
      );
      const sync = await sincronizarProdutoMetaCatalog(req.params.codigo, {
        force: true,
      });
      const produto = await obterProdutoAdmin(req.params.codigo);
      return res.json({ produto, sync });
    } catch (error) {
      console.error("[padaria/admin/sync-meta]", error.message);
      return res
        .status(400)
        .json({ error: mensagemParaCliente(error.message) });
    }
  }
);

/**
 * Marca todos do catálogo ativo (com foto) e envia para a Meta
 * com brand/categoria Padaria Superama.
 */
router.post(
  "/admin/produtos/sync-meta-catalogo",
  requirePadariaAdmin,
  async (_req, res) => {
    try {
      const { sincronizarCatalogoAtivoPadariaMeta } = await import(
        "../services/marketing/metaCatalogService.js"
      );
      const resultado = await sincronizarCatalogoAtivoPadariaMeta();
      return res.json(resultado);
    } catch (error) {
      console.error("[padaria/admin/sync-meta-catalogo]", error.message);
      return res
        .status(400)
        .json({ error: mensagemParaCliente(error.message) });
    }
  }
);

router.get("/admin/produtos/:codigo", requirePadariaAdmin, async (req, res) => {
  try {
    const produto = await obterProdutoAdmin(req.params.codigo);
    if (!produto) return res.status(404).json({ error: "Produto não encontrado" });
    return res.json({ produto });
  } catch (error) {
    console.error("[padaria/admin/produtos/:codigo]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/admin/produtos/:codigo", requirePadariaAdmin, async (req, res) => {
  try {
    const produto = await atualizarProdutoPadaria(req.params.codigo, req.body || {});
    return res.json({ produto });
  } catch (error) {
    console.error("[padaria/admin/produtos PATCH]", error.message);
    const status = /não encontrado/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post(
  "/admin/produtos/:codigo/imagem",
  requirePadariaAdmin,
  (req, res) => {
    upload.single("imagem")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: mensagemParaCliente(err.message) });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem enviada" });
      }
      try {
        const url = `/uploads/padaria/${req.file.filename}`;
        const produto = await definirImagemProduto(req.params.codigo, url);
        return res.json({ produto, url });
      } catch (error) {
        console.error("[padaria/admin/imagem]", error.message);
        return res
          .status(400)
          .json({ error: mensagemParaCliente(error.message) });
      }
    });
  }
);

router.get("/admin/decoracoes", requirePadariaAdmin, async (req, res) => {
  try {
    const decoracoes = await listarDecoracoesAdmin({
      busca: String(req.query.busca || ""),
      produtoCodigo: String(req.query.produtoCodigo || ""),
      filtro: String(req.query.filtro || ""),
    });
    return res.json({ decoracoes, total: decoracoes.length });
  } catch (error) {
    console.error("[padaria/admin/decoracoes LIST]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/admin/decoracoes", requirePadariaAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const global = Boolean(body.global || body.todosBolos || body.vinculoTodos);
    const decoracao = global
      ? await criarDecoracaoGlobal(body)
      : await criarDecoracao(body.produtoCodigo || body.produto_codigo, body);
    return res.status(201).json({ decoracao });
  } catch (error) {
    console.error("[padaria/admin/decoracoes POST global]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get(
  "/admin/produtos/:codigo/decoracoes",
  requirePadariaAdmin,
  async (req, res) => {
    try {
      const produto = await obterProdutoAdmin(req.params.codigo);
      if (!produto) {
        return res.status(404).json({ error: "Produto não encontrado" });
      }
      const decoracoes = await listarDecoracoesPorProduto(req.params.codigo, {
        apenasAtivas: false,
      });
      return res.json({ decoracoes });
    } catch (error) {
      console.error("[padaria/admin/decoracoes GET]", error.message);
      return res.status(500).json({ error: mensagemParaCliente(error.message) });
    }
  }
);

router.post(
  "/admin/produtos/:codigo/decoracoes",
  requirePadariaAdmin,
  async (req, res) => {
    try {
      const decoracao = await criarDecoracao(req.params.codigo, req.body || {});
      return res.status(201).json({ decoracao });
    } catch (error) {
      console.error("[padaria/admin/decoracoes POST]", error.message);
      return res.status(400).json({ error: mensagemParaCliente(error.message) });
    }
  }
);

router.patch("/admin/decoracoes/:id", requirePadariaAdmin, async (req, res) => {
  try {
    const decoracao = await atualizarDecoracao(req.params.id, req.body || {});
    return res.json({ decoracao });
  } catch (error) {
    console.error("[padaria/admin/decoracoes PATCH]", error.message);
    const status = /não encontrada/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.delete("/admin/decoracoes/:id", requirePadariaAdmin, async (req, res) => {
  try {
    await excluirDecoracao(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[padaria/admin/decoracoes DELETE]", error.message);
    const status = /não encontrada/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post(
  "/admin/decoracoes/:id/imagem",
  requirePadariaAdmin,
  (req, res) => {
    upload.single("imagem")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ error: mensagemParaCliente(err.message) });
      }
      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem enviada" });
      }
      try {
        const atual = await obterDecoracao(req.params.id);
        if (!atual) {
          return res.status(404).json({ error: "Decoração não encontrada" });
        }
        const url = `/uploads/padaria/${req.file.filename}`;
        const decoracao = await definirImagemDecoracao(req.params.id, url);
        return res.json({ decoracao, url });
      } catch (error) {
        console.error("[padaria/admin/decoracao/imagem]", error.message);
        return res
          .status(400)
          .json({ error: mensagemParaCliente(error.message) });
      }
    });
  }
);

router.get("/admin/config", requirePadariaAdmin, async (_req, res) => {
  try {
    const config = await obterConfigPadaria();
    return res.json({ config });
  } catch (error) {
    console.error("[padaria/admin/config GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.put("/admin/config", requirePadariaAdmin, async (req, res) => {
  try {
    const config = await salvarConfigPadaria(req.body || {});
    return res.json({ config });
  } catch (error) {
    console.error("[padaria/admin/config PUT]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/admin/categorias", requirePadariaAdmin, async (_req, res) => {
  try {
    const categorias = await listarCategoriasPadaria({ apenasAtivas: false });
    return res.json({ categorias });
  } catch (error) {
    console.error("[padaria/admin/categorias]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/admin/categorias", requirePadariaAdmin, async (req, res) => {
  try {
    const categoria = await criarCategoriaPadaria(req.body || {});
    return res.status(201).json({ categoria });
  } catch (error) {
    console.error("[padaria/admin/categorias POST]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/admin/categorias/:id", requirePadariaAdmin, async (req, res) => {
  try {
    const categoria = await atualizarCategoriaPadaria(req.params.id, req.body || {});
    return res.json({ categoria });
  } catch (error) {
    console.error("[padaria/admin/categorias PATCH]", error.message);
    const status = /não encontrada/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.delete("/admin/categorias/:id", requirePadariaAdmin, async (req, res) => {
  try {
    await excluirCategoriaPadaria(req.params.id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[padaria/admin/categorias DELETE]", error.message);
    const status = /não encontrada/i.test(error.message) ? 404 : 400;
    return res.status(status).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/admin/usuarios", requirePadariaAdmin, async (_req, res) => {
  try {
    const usuarios = await listarUsuariosPadaria();
    return res.json({ usuarios });
  } catch (error) {
    console.error("[padaria/admin/usuarios GET]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.post("/admin/usuarios", requirePadariaAdmin, async (req, res) => {
  try {
    const usuario = await criarUsuarioPadaria(req.body || {});
    return res.status(201).json({ usuario });
  } catch (error) {
    console.error("[padaria/admin/usuarios POST]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

router.patch("/admin/usuarios/:id", requirePadariaAdmin, async (req, res) => {
  try {
    const usuario = await atualizarUsuarioPadaria(req.params.id, req.body || {});
    return res.json({ usuario });
  } catch (error) {
    console.error("[padaria/admin/usuarios PATCH]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

/** Seed inicial de gestor — só se não houver usuários (bootstrap). */
router.post("/admin/bootstrap", async (req, res) => {
  try {
    const usuarios = await listarUsuariosPadaria();
    if (usuarios.length > 0) {
      return res.status(400).json({
        error: "Já existem usuários da padaria. Use o painel para cadastrar.",
      });
    }
    const usuario = await criarUsuarioPadaria({
      login: req.body?.login || "gestor",
      senha: req.body?.senha || "padaria123",
      nome: req.body?.nome || "Gestor Padaria",
      papel: "gestor",
    });
    return res.status(201).json({
      usuario,
      message: "Usuário gestor criado. Altere a senha após o primeiro acesso.",
    });
  } catch (error) {
    console.error("[padaria/admin/bootstrap]", error.message);
    return res.status(400).json({ error: mensagemParaCliente(error.message) });
  }
});

export default router;

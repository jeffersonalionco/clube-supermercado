import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cake,
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Layers,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import { clearAdminSession, resolveImagemUrl } from "../../utils/adminSession.js";
import {
  fetchPadariaAdmin,
  formatarPrecoPadaria,
} from "../../utils/padariaSession.js";
import {
  dataLocalISO,
  formatDateTime,
  formatPhone,
  STATUS_PEDIDO,
} from "../../utils/padariaFormat.js";
import { imprimirPedidoPadaria } from "../../utils/padariaImpressao.js";
import PadariaStatusBadge from "../../components/padaria/PadariaStatusBadge.jsx";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import "../../styles/padaria.css";

const SUBS = [
  { id: "dashboard", label: "Operação", icon: LayoutDashboard },
  { id: "historico", label: "Histórico", icon: ClipboardList },
  { id: "produtos", label: "Produtos", icon: Cake },
  { id: "decoracoes", label: "Decorações", icon: Palette },
  { id: "categorias", label: "Categorias", icon: Layers },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "config", label: "Configuração", icon: Settings },
];

const FORM_DECO = {
  produtoCodigo: "",
  vinculoTodos: false,
  nome: "",
  codigo: "",
  descricao: "",
  preco: "0",
  controlaEstoque: false,
  estoque: "0",
};

const FILTROS_DECO = [
  { id: "", label: "Todas" },
  { id: "globais", label: "Todos os bolos" },
  { id: "ativas", label: "Ativas" },
  { id: "inativas", label: "Inativas" },
  { id: "pagas", label: "Com valor" },
  { id: "com_estoque", label: "Com estoque" },
  { id: "esgotadas", label: "Esgotadas" },
  { id: "sem_foto", label: "Sem foto" },
  { id: "sem_codigo", label: "Sem código" },
];

function hojeISO() {
  return dataLocalISO();
}

const FILTROS = [
  { id: "", label: "Todos" },
  { id: "catalogo", label: "No catálogo" },
  { id: "ocultos", label: "Fora do catálogo" },
  { id: "sem_categoria", label: "Sem categoria" },
  { id: "inativos_rp", label: "Inativos no RP" },
];

const FORM_USER = { login: "", senha: "", nome: "", papel: "atendente" };
const FORM_CAT = { nome: "", cor: "#0f766e", ordem: "100" };

function Badge({ ok, sim = "Sim", nao = "Não" }) {
  return (
    <span className={`admin-padaria-badge ${ok ? "admin-padaria-badge--ok" : "admin-padaria-badge--off"}`}>
      {ok ? sim : nao}
    </span>
  );
}

export default function AdminPadariaPage({ tab, onTabChange, onLogout, admin }) {
  const [sub, setSub] = useState("dashboard");
  const [produtos, setProdutos] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    noCatalogo: 0,
    foraCatalogo: 0,
    inativosRp: 0,
    semCategoria: 0,
  });
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [filtro, setFiltro] = useState("");
  const [codigoRp, setCodigoRp] = useState("");
  const [editando, setEditando] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncMetaCatalogo, setSyncMetaCatalogo] = useState(false);
  const [config, setConfig] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formCat, setFormCat] = useState(FORM_CAT);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [formUser, setFormUser] = useState(FORM_USER);
  const [dashboard, setDashboard] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [historicoTotal, setHistoricoTotal] = useState(0);
  const [histFiltro, setHistFiltro] = useState({
    dataInicio: hojeISO(),
    dataFim: hojeISO(),
    status: "",
    busca: "",
  });
  const [decoracoesAdmin, setDecoracoesAdmin] = useState([]);
  const [formDeco, setFormDeco] = useState(FORM_DECO);
  const [buscaDeco, setBuscaDeco] = useState("");
  const [buscaDecoAtiva, setBuscaDecoAtiva] = useState("");
  const [filtroDeco, setFiltroDeco] = useState("");
  const [filtroProdutoDeco, setFiltroProdutoDeco] = useState("");
  const [salvandoDecoAba, setSalvandoDecoAba] = useState(false);
  const [produtosOpcoes, setProdutosOpcoes] = useState([]);

  const handleAuthError = useCallback(
    (err) => {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setErro(mensagemParaUsuario(err.message));
    },
    [onLogout]
  );

  const carregarProdutos = useCallback(async () => {
    const params = new URLSearchParams({ limite: "200" });
    if (buscaAtiva) params.set("busca", buscaAtiva);
    if (filtro) params.set("filtro", filtro);
    const data = await fetchPadariaAdmin(`/admin/produtos?${params}`);
    setProdutos(data.produtos || []);
    setTotal(data.total || 0);
    if (data.stats) setStats(data.stats);
  }, [buscaAtiva, filtro]);

  const carregarSync = useCallback(async () => {
    const data = await fetchPadariaAdmin("/admin/sync/status");
    setSyncStatus(data.status);
  }, []);

  const carregarConfig = useCallback(async () => {
    const data = await fetchPadariaAdmin("/admin/config");
    setConfig(data.config);
  }, []);

  const carregarUsuarios = useCallback(async () => {
    const data = await fetchPadariaAdmin("/admin/usuarios");
    setUsuarios(data.usuarios || []);
  }, []);

  const carregarCategorias = useCallback(async () => {
    const data = await fetchPadariaAdmin("/admin/categorias");
    setCategorias(data.categorias || []);
  }, []);

  const carregarDashboard = useCallback(async () => {
    const data = await fetchPadariaAdmin(`/admin/dashboard?data=${hojeISO()}`);
    setDashboard(data.dashboard);
  }, []);

  const carregarDecoracoesAdmin = useCallback(async () => {
    const params = new URLSearchParams();
    if (buscaDecoAtiva) params.set("busca", buscaDecoAtiva);
    if (filtroDeco) params.set("filtro", filtroDeco);
    if (filtroProdutoDeco) params.set("produtoCodigo", filtroProdutoDeco);
    const data = await fetchPadariaAdmin(`/admin/decoracoes?${params}`);
    setDecoracoesAdmin(data.decoracoes || []);
  }, [buscaDecoAtiva, filtroDeco, filtroProdutoDeco]);

  const carregarProdutosOpcoes = useCallback(async () => {
    const data = await fetchPadariaAdmin("/admin/produtos?limite=500");
    setProdutosOpcoes(data.produtos || []);
  }, []);

  async function carregarHistorico(filtroAtual = histFiltro) {
    const params = new URLSearchParams({ limite: "80" });
    if (filtroAtual.dataInicio) params.set("dataInicio", filtroAtual.dataInicio);
    if (filtroAtual.dataFim) params.set("dataFim", filtroAtual.dataFim);
    if (filtroAtual.status) params.set("status", filtroAtual.status);
    if (filtroAtual.busca.trim()) params.set("busca", filtroAtual.busca.trim());
    const data = await fetchPadariaAdmin(`/admin/pedidos?${params}`);
    setHistorico(data.pedidos || []);
    setHistoricoTotal(data.total || 0);
  }

  useEffect(() => {
    setErro("");
    setLoading(true);
    const run = async () => {
      try {
        if (sub === "dashboard") {
          await carregarDashboard();
        } else if (sub === "historico") {
          await carregarHistorico();
        } else if (sub === "produtos") {
          await Promise.all([carregarProdutos(), carregarSync(), carregarCategorias()]);
        } else if (sub === "decoracoes") {
          await Promise.all([carregarDecoracoesAdmin(), carregarProdutosOpcoes()]);
        } else if (sub === "categorias") {
          await carregarCategorias();
        } else if (sub === "config") {
          await carregarConfig();
        } else if (sub === "usuarios") {
          await carregarUsuarios();
        }
      } catch (err) {
        handleAuthError(err);
      } finally {
        setLoading(false);
      }
    };
    run();
    // histFiltro é aplicado só no submit do formulário de histórico
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sub,
    carregarDashboard,
    carregarProdutos,
    carregarSync,
    carregarConfig,
    carregarUsuarios,
    carregarCategorias,
    carregarDecoracoesAdmin,
    carregarProdutosOpcoes,
    handleAuthError,
  ]);

  useEffect(() => {
    if (!editando) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setEditando(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editando]);

  const produtosVisiveis = useMemo(() => produtos, [produtos]);

  async function abrirEditor(produto) {
    setMsg("");
    setErro("");
    setEditando({
      codigo: produto.codigo,
      nomeRp: produto.nomeRp || "",
      nomeCatalogo: produto.nomeCatalogo || produto.nomeRp || "",
      descricao: produto.descricao || "",
      cobertura: produto.cobertura || "",
      recheio: produto.recheio || "",
      vendaPorKg: Boolean(produto.vendaPorKg),
      ativoCatalogo: Boolean(produto.ativoCatalogo),
      syncMetaCatalog: Boolean(produto.syncMetaCatalog),
      metaSyncErro: produto.metaSyncErro || "",
      metaSyncEm: produto.metaSyncEm || null,
      ativoRp: Boolean(produto.ativoRp),
      preco: produto.preco,
      imagemUrl: produto.imagemUrl || "",
      categoriaId: produto.categoriaId ?? "",
      decoracoes: produto.decoracoes || [],
      novaDecoracao: {
        nome: "",
        codigo: "",
        descricao: "",
        preco: "0",
        controlaEstoque: false,
        estoque: "0",
      },
      salvandoDecoracao: false,
    });
    try {
      const data = await fetchPadariaAdmin(
        `/admin/produtos/${encodeURIComponent(produto.codigo)}`
      );
      const full = data.produto;
      if (!full) return;
      setEditando((prev) =>
        prev && prev.codigo === full.codigo
          ? {
              ...prev,
              nomeRp: full.nomeRp || "",
              nomeCatalogo: full.nomeCatalogo || full.nomeRp || "",
              descricao: full.descricao || "",
              cobertura: full.cobertura || "",
              recheio: full.recheio || "",
              vendaPorKg: Boolean(full.vendaPorKg),
              ativoCatalogo: Boolean(full.ativoCatalogo),
              syncMetaCatalog: Boolean(full.syncMetaCatalog),
              metaSyncErro: full.metaSyncErro || "",
              metaSyncEm: full.metaSyncEm || null,
              ativoRp: Boolean(full.ativoRp),
              preco: full.preco,
              imagemUrl: full.imagemUrl || "",
              categoriaId: full.categoriaId ?? "",
              decoracoes: full.decoracoes || [],
            }
          : prev
      );
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function criarDecoracaoProduto() {
    if (!editando) return;
    const nome = String(editando.novaDecoracao?.nome || "").trim();
    if (nome.length < 2) {
      setErro("Informe o nome da decoração");
      return;
    }
    setEditando((prev) => (prev ? { ...prev, salvandoDecoracao: true } : prev));
    setErro("");
    try {
      const data = await fetchPadariaAdmin(
        `/admin/produtos/${encodeURIComponent(editando.codigo)}/decoracoes`,
        {
          method: "POST",
          body: {
            nome,
            codigo: editando.novaDecoracao?.codigo || "",
            descricao: editando.novaDecoracao?.descricao || "",
            preco: editando.novaDecoracao?.preco || "0",
            controlaEstoque: Boolean(editando.novaDecoracao?.controlaEstoque),
            estoque: editando.novaDecoracao?.controlaEstoque
              ? editando.novaDecoracao?.estoque || "0"
              : "0",
          },
        }
      );
      setEditando((prev) =>
        prev
          ? {
              ...prev,
              decoracoes: [...(prev.decoracoes || []), data.decoracao],
              novaDecoracao: {
                nome: "",
                codigo: "",
                descricao: "",
                preco: "0",
                controlaEstoque: false,
                estoque: "0",
              },
              salvandoDecoracao: false,
            }
          : prev
      );
      setMsg("Decoração adicionada.");
    } catch (err) {
      setEditando((prev) => (prev ? { ...prev, salvandoDecoracao: false } : prev));
      handleAuthError(err);
    }
  }

  async function atualizarDecoracaoProduto(deco, patch) {
    setErro("");
    try {
      const data = await fetchPadariaAdmin(`/admin/decoracoes/${deco.id}`, {
        method: "PATCH",
        body: patch,
      });
      setEditando((prev) =>
        prev
          ? {
              ...prev,
              decoracoes: (prev.decoracoes || []).map((d) =>
                d.id === deco.id ? data.decoracao : d
              ),
            }
          : prev
      );
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function excluirDecoracaoProduto(deco) {
    if (!window.confirm(`Excluir a decoração “${deco.nome}”?`)) return;
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/decoracoes/${deco.id}`, { method: "DELETE" });
      setEditando((prev) =>
        prev
          ? {
              ...prev,
              decoracoes: (prev.decoracoes || []).filter((d) => d.id !== deco.id),
            }
          : prev
      );
      setMsg("Decoração excluída.");
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function uploadImagemDecoracao(deco, file) {
    if (!file) return;
    setErro("");
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const data = await fetchPadariaAdmin(`/admin/decoracoes/${deco.id}/imagem`, {
        method: "POST",
        body: fd,
      });
      setEditando((prev) =>
        prev
          ? {
              ...prev,
              decoracoes: (prev.decoracoes || []).map((d) =>
                d.id === deco.id ? data.decoracao : d
              ),
            }
          : prev
      );
      setMsg("Foto da decoração atualizada.");
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function adicionarPorCodigo(e) {
    e.preventDefault();
    setMsg("");
    setErro("");
    const codigo = codigoRp.trim();
    if (!codigo) {
      setErro("Informe o código interno do produto");
      return;
    }
    setAdicionando(true);
    try {
      const data = await fetchPadariaAdmin("/admin/produtos/adicionar", {
        method: "POST",
        body: { codigo, ativarCatalogo: true },
      });
      setCodigoRp("");
      setMsg(`Produto ${data.produto.codigo} adicionado. Complete foto e extras.`);
      abrirEditor(data.produto);
      await carregarProdutos();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setAdicionando(false);
    }
  }

  async function atualizarPrecosCadastrados() {
    setMsg("");
    setErro("");
    try {
      await fetchPadariaAdmin("/admin/sync", {
        method: "POST",
        body: { forcar: true },
      });
      setMsg("Atualizando preços e nomes dos produtos cadastrados…");
      const poll = setInterval(async () => {
        try {
          const data = await fetchPadariaAdmin("/admin/sync/status");
          setSyncStatus(data.status);
          if (!data.status?.sincronizando) {
            clearInterval(poll);
            await carregarProdutos();
            setMsg(
              data.status?.erro
                ? `Falha: ${data.status.erro}`
                : `Preços atualizados: ${data.status?.atualizados || 0} produto(s)` +
                    (data.status?.falhas ? ` · ${data.status.falhas} falha(s)` : "")
            );
          }
        } catch {
          clearInterval(poll);
        }
      }, 1200);
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function sincronizarCatalogoMeta() {
    if (
      !window.confirm(
        "Marcar todos os produtos ativos no catálogo (com foto) e enviar para a Meta como Padaria Superama?"
      )
    ) {
      return;
    }
    setErro("");
    setMsg("");
    setSyncMetaCatalogo(true);
    try {
      const data = await fetchPadariaAdmin("/admin/produtos/sync-meta-catalogo", {
        method: "POST",
        body: {},
      });
      await carregarProdutos();
      const falhas = data?.falhas || 0;
      setMsg(
        falhas
          ? `Meta: ${data.ok}/${data.total} ok, ${falhas} falha(s).`
          : `Meta: ${data.ok} produto(s) enviados como Padaria Superama.`
      );
      if (data?.semImagem?.length) {
        setErro(`Sem foto (não enviados): ${data.semImagem.join(", ")}`);
      }
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSyncMetaCatalogo(false);
    }
  }

  async function atualizarUmDoRp(codigo) {
    setErro("");
    try {
      const data = await fetchPadariaAdmin(
        `/admin/produtos/${encodeURIComponent(codigo)}/atualizar-rp`,
        { method: "POST", body: {} }
      );
      setMsg(`RP atualizado: ${codigo}`);
      if (editando?.codigo === codigo) abrirEditor(data.produto);
      await carregarProdutos();
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function alternarCatalogo(produto) {
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/produtos/${encodeURIComponent(produto.codigo)}`, {
        method: "PATCH",
        body: { ativoCatalogo: !produto.ativoCatalogo },
      });
      if (editando?.codigo === produto.codigo) {
        setEditando((prev) =>
          prev ? { ...prev, ativoCatalogo: !produto.ativoCatalogo } : prev
        );
      }
      await carregarProdutos();
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function salvarProduto(e) {
    e.preventDefault();
    if (!editando) return;
    setSalvando(true);
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/produtos/${encodeURIComponent(editando.codigo)}`, {
        method: "PATCH",
        body: {
          nomeCatalogo: editando.nomeCatalogo,
          descricao: editando.descricao,
          cobertura: editando.cobertura,
          recheio: editando.recheio,
          vendaPorKg: editando.vendaPorKg,
          ativoCatalogo: editando.ativoCatalogo,
          syncMetaCatalog: editando.syncMetaCatalog,
          categoriaId: editando.categoriaId === "" ? null : Number(editando.categoriaId),
        },
      });
      setMsg(
        editando.syncMetaCatalog
          ? "Produto salvo. Sync com catálogo Meta/WhatsApp solicitado."
          : "Produto salvo."
      );
      setEditando(null);
      await carregarProdutos();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSalvando(false);
    }
  }

  async function uploadImagem(codigo, file) {
    setErro("");
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const data = await fetchPadariaAdmin(
        `/admin/produtos/${encodeURIComponent(codigo)}/imagem`,
        { method: "POST", body: fd }
      );
      if (editando?.codigo === codigo) {
        setEditando((prev) =>
          prev ? { ...prev, imagemUrl: data.produto?.imagemUrl || "" } : prev
        );
      }
      await carregarProdutos();
      setMsg("Foto atualizada.");
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function salvarConfig(e) {
    e.preventDefault();
    setMsg("");
    setErro("");
    try {
      await fetchPadariaAdmin("/admin/config", {
        method: "PUT",
        body: {
          departamento_rp: config.departamento_rp,
          unidade_rp: config.unidade_rp,
          antecedencia_minima_horas: config.antecedencia_minima_horas,
          horario_retirada_inicio: config.horario_retirada_inicio,
          horario_retirada_fim: config.horario_retirada_fim,
          impressora_host: config.impressora_host,
          impressora_porta: config.impressora_porta,
          impressora_largura_mm: config.impressora_largura_mm,
        },
      });
      setMsg("Configuração salva.");
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function testarImpressora(e) {
    e.preventDefault();
    setMsg("");
    setErro("");
    try {
      await fetchPadariaAdmin("/admin/impressora/teste", {
        method: "POST",
        body: { larguraMm: config.impressora_largura_mm },
      });
      setMsg(
        `Teste ESC/POS enviado para ${config.impressora_host || "10.1.1.13"}:${
          config.impressora_porta || "9100"
        }.`
      );
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function criarUsuario(e) {
    e.preventDefault();
    setMsg("");
    setErro("");
    try {
      await fetchPadariaAdmin("/admin/usuarios", {
        method: "POST",
        body: formUser,
      });
      setFormUser(FORM_USER);
      setMsg("Usuário criado.");
      await carregarUsuarios();
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function alternarUsuario(usuario) {
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/usuarios/${usuario.id}`, {
        method: "PATCH",
        body: { ativo: !usuario.ativo },
      });
      await carregarUsuarios();
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function criarCategoria(e) {
    e.preventDefault();
    setMsg("");
    setErro("");
    try {
      await fetchPadariaAdmin("/admin/categorias", {
        method: "POST",
        body: {
          nome: formCat.nome,
          cor: formCat.cor,
          ordem: Number(formCat.ordem) || 100,
        },
      });
      setFormCat(FORM_CAT);
      setMsg("Categoria criada.");
      await carregarCategorias();
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function alternarCategoria(cat) {
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/categorias/${cat.id}`, {
        method: "PATCH",
        body: { ativo: !cat.ativo },
      });
      await carregarCategorias();
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function excluirCategoria(cat) {
    if (!window.confirm(`Excluir a categoria “${cat.nome}”?`)) return;
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/categorias/${cat.id}`, {
        method: "DELETE",
      });
      setMsg("Categoria excluída.");
      await carregarCategorias();
    } catch (err) {
      handleAuthError(err);
    }
  }

  function aplicarBuscaDeco(e) {
    e.preventDefault();
    setBuscaDecoAtiva(buscaDeco.trim());
  }

  function patchDecoracaoLocal(decoAtualizada) {
    setDecoracoesAdmin((prev) =>
      prev.map((d) => (d.id === decoAtualizada.id ? { ...d, ...decoAtualizada } : d))
    );
    setEditando((prev) =>
      prev
        ? {
            ...prev,
            decoracoes: (prev.decoracoes || []).map((d) =>
              d.id === decoAtualizada.id ? { ...d, ...decoAtualizada } : d
            ),
          }
        : prev
    );
  }

  async function criarDecoracaoAba(e) {
    e.preventDefault();
    setMsg("");
    setErro("");
    const vinculoTodos = Boolean(formDeco.vinculoTodos);
    const produtoCodigo = String(formDeco.produtoCodigo || "").trim();
    const nome = String(formDeco.nome || "").trim();
    if (!vinculoTodos && !produtoCodigo) {
      setErro("Selecione o produto ou marque “Todos os bolos ativos”");
      return;
    }
    if (nome.length < 2) {
      setErro("Informe o nome da decoração");
      return;
    }
    setSalvandoDecoAba(true);
    try {
      await fetchPadariaAdmin("/admin/decoracoes", {
        method: "POST",
        body: {
          global: vinculoTodos,
          produtoCodigo: vinculoTodos ? undefined : produtoCodigo,
          nome,
          codigo: formDeco.codigo || "",
          descricao: formDeco.descricao || "",
          preco: formDeco.preco || "0",
          controlaEstoque: Boolean(formDeco.controlaEstoque),
          estoque: formDeco.controlaEstoque ? formDeco.estoque || "0" : "0",
        },
      });
      setFormDeco({
        ...FORM_DECO,
        vinculoTodos,
        produtoCodigo: vinculoTodos ? "" : produtoCodigo,
      });
      setMsg(
        vinculoTodos
          ? "Decoração criada para todos os bolos ativos. Envie a foto de exemplo, se quiser."
          : "Decoração adicionada. Agora envie a foto de exemplo, se quiser."
      );
      await carregarDecoracoesAdmin();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSalvandoDecoAba(false);
    }
  }

  async function atualizarDecoracaoAba(deco, patch) {
    setErro("");
    try {
      const data = await fetchPadariaAdmin(`/admin/decoracoes/${deco.id}`, {
        method: "PATCH",
        body: patch,
      });
      patchDecoracaoLocal({
        ...data.decoracao,
        produtoNome: data.decoracao.produtoNome || deco.produtoNome,
      });
    } catch (err) {
      handleAuthError(err);
      await carregarDecoracoesAdmin().catch(() => {});
    }
  }

  async function excluirDecoracaoAba(deco) {
    if (!window.confirm(`Excluir a decoração “${deco.nome}”?`)) return;
    setErro("");
    try {
      await fetchPadariaAdmin(`/admin/decoracoes/${deco.id}`, { method: "DELETE" });
      setDecoracoesAdmin((prev) => prev.filter((d) => d.id !== deco.id));
      setMsg("Decoração excluída.");
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function uploadImagemDecoracaoAba(deco, file) {
    if (!file) return;
    setErro("");
    try {
      const fd = new FormData();
      fd.append("imagem", file);
      const data = await fetchPadariaAdmin(`/admin/decoracoes/${deco.id}/imagem`, {
        method: "POST",
        body: fd,
      });
      patchDecoracaoLocal({
        ...data.decoracao,
        produtoNome: data.decoracao.produtoNome || deco.produtoNome,
      });
      setMsg("Foto da decoração atualizada.");
    } catch (err) {
      handleAuthError(err);
    }
  }

  function aplicarBusca(e) {
    e.preventDefault();
    setBuscaAtiva(busca.trim());
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      <div className="admin-padaria">
        <div className="admin-padaria__nav">
          {SUBS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`admin-padaria__nav-btn ${sub === id ? "is-active" : ""}`}
              onClick={() => {
                setSub(id);
                setEditando(null);
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
          <a
            className="admin-btn admin-btn--ghost admin-btn--sm admin-padaria__catalogo-link"
            href="#/padaria"
            target="_blank"
            rel="noreferrer"
          >
            Ver catálogo
            <ExternalLink size={14} />
          </a>
        </div>

        {(erro || msg) && (
          <div className="admin-feedback">
            {erro && <p className="admin-alert admin-alert--error">{erro}</p>}
            {msg && <p className="admin-alert admin-alert--success">{msg}</p>}
          </div>
        )}

        {sub === "dashboard" && (
          <section className="admin-padaria__operacao">
            {loading && !dashboard ? (
              <p className="admin-muted">Carregando operação do dia…</p>
            ) : dashboard ? (
              <>
                <div className="admin-padaria__stats">
                  <div className="admin-padaria__stat">
                    <strong>{dashboard.totais.hoje}</strong>
                    <span>Pedidos hoje</span>
                  </div>
                  <div className="admin-padaria__stat">
                    <strong>{dashboard.totais.novos}</strong>
                    <span>Novos</span>
                  </div>
                  <div className="admin-padaria__stat">
                    <strong>{dashboard.totais.emProducao}</strong>
                    <span>Em produção</span>
                  </div>
                  <div className="admin-padaria__stat">
                    <strong>{dashboard.totais.prontos}</strong>
                    <span>Prontos</span>
                  </div>
                  <div className="admin-padaria__stat">
                    <strong>{dashboard.totais.entregues}</strong>
                    <span>Entregues</span>
                  </div>
                  <div className="admin-padaria__stat">
                    <strong>{dashboard.totais.cancelados}</strong>
                    <span>Cancelados</span>
                  </div>
                </div>
                <div className="admin-padaria__card">
                  <div className="admin-padaria__card-head">
                    <h3>Próximas retiradas</h3>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => carregarDashboard().catch(handleAuthError)}
                    >
                      <RefreshCw size={14} /> Atualizar
                    </button>
                  </div>
                  {dashboard.proximasRetiradas?.length ? (
                    <ul className="admin-padaria__retiradas">
                      {dashboard.proximasRetiradas.map((p) => (
                        <li key={p.codigoPublico}>
                          <strong>{p.horaRetirada}</strong>
                          <span>{p.codigoPublico}</span>
                          <span>{p.clienteNome}</span>
                          <PadariaStatusBadge status={p.status} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="admin-muted">Nenhuma retirada pendente para hoje.</p>
                  )}
                </div>
                <div className="admin-padaria__atalhos">
                  <a className="admin-btn admin-btn--primary" href="#/padaria/atendente">
                    Abrir atendente
                  </a>
                  <a className="admin-btn" href="#/padaria/producao">
                    Abrir produção
                  </a>
                </div>
              </>
            ) : (
              <p className="admin-alert admin-alert--error">
                Não foi possível carregar o dashboard. Tente novamente.
              </p>
            )}
          </section>
        )}

        {sub === "historico" && (
          <section className="admin-padaria__historico">
            <form
              className="admin-padaria__hist-filtros"
              onSubmit={(e) => {
                e.preventDefault();
                setLoading(true);
                carregarHistorico()
                  .catch(handleAuthError)
                  .finally(() => setLoading(false));
              }}
            >
              <Field label="De">
                <input
                  type="date"
                  value={histFiltro.dataInicio}
                  onChange={(e) =>
                    setHistFiltro((f) => ({ ...f, dataInicio: e.target.value }))
                  }
                />
              </Field>
              <Field label="Até">
                <input
                  type="date"
                  value={histFiltro.dataFim}
                  onChange={(e) =>
                    setHistFiltro((f) => ({ ...f, dataFim: e.target.value }))
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  value={histFiltro.status}
                  onChange={(e) =>
                    setHistFiltro((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="">Todos</option>
                  {Object.entries(STATUS_PEDIDO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Código / cliente / telefone">
                <input
                  value={histFiltro.busca}
                  onChange={(e) =>
                    setHistFiltro((f) => ({ ...f, busca: e.target.value }))
                  }
                  placeholder="PAD-2026-… ou nome"
                />
              </Field>
              <button type="submit" className="admin-btn admin-btn--primary">
                Filtrar
              </button>
            </form>

            {loading ? (
              <p className="admin-muted">Carregando histórico…</p>
            ) : historico.length === 0 ? (
              <p className="admin-muted">Nenhum pedido encontrado no período.</p>
            ) : (
              <>
                <p className="admin-muted">{historicoTotal} pedido(s)</p>
                <div className="admin-padaria__hist-lista">
                  {historico.map((p) => (
                    <article key={p.id} className="admin-padaria__hist-card">
                      <header>
                        <strong>{p.codigoPublico}</strong>
                        <PadariaStatusBadge status={p.status} />
                      </header>
                      <p>
                        {p.clienteNome}
                        {p.clienteTelefone ? ` · ${formatPhone(p.clienteTelefone)}` : ""}
                      </p>
                      <p>Retirada {formatDateTime(p.dataRetirada, p.horaRetirada)}</p>
                      <ul>
                        {(p.itens || []).map((i) => (
                          <li key={i.id}>
                            {i.quantidade}x {i.nome} — {formatarPrecoPadaria(i.subtotal)}
                          </li>
                        ))}
                      </ul>
                      <footer>
                        <strong>Total {formatarPrecoPadaria(p.total)}</strong>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() =>
                            imprimirPedidoPadaria(p).catch((err) =>
                              console.warn("[admin/padaria] impressão:", err)
                            )
                          }
                        >
                          Imprimir cupom
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {sub === "produtos" && (
          <>
            <div className="admin-padaria__stats">
              <div className="admin-padaria__stat">
                <strong>{stats.total}</strong>
                <span>Cadastrados</span>
              </div>
              <div className="admin-padaria__stat">
                <strong>{stats.noCatalogo}</strong>
                <span>No catálogo</span>
              </div>
              <div className="admin-padaria__stat">
                <strong>{stats.foraCatalogo}</strong>
                <span>Fora do catálogo</span>
              </div>
              <div className="admin-padaria__stat">
                <strong>{stats.inativosRp}</strong>
                <span>Inativos no RP</span>
              </div>
              <div className="admin-padaria__stat">
                <strong>{stats.semCategoria || 0}</strong>
                <span>Sem categoria</span>
              </div>
            </div>

            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Adicionar do RP</h2>
                  <p className="admin-muted">
                    Digite o código interno. Buscamos só esse item e ativamos no catálogo.
                  </p>
                </div>
              </div>
              <form className="admin-padaria__add" onSubmit={adicionarPorCodigo}>
                <input
                  className="admin-padaria__input admin-padaria__input--code"
                  value={codigoRp}
                  onChange={(e) => setCodigoRp(e.target.value)}
                  placeholder="Código interno"
                  inputMode="numeric"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={adicionando}
                >
                  <Plus size={16} />
                  {adicionando ? "Buscando…" : "Buscar e ativar"}
                </button>
              </form>
            </section>

            <section className="admin-card admin-padaria__lista">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Produtos cadastrados</h2>
                  <p className="admin-muted">
                    {total} resultado(s)
                    {syncStatus?.sincronizando
                      ? ` · Atualizando RP ${syncStatus.atualizados}/${syncStatus.total}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={atualizarPrecosCadastrados}
                  disabled={syncStatus?.sincronizando || stats.total === 0}
                >
                  <RefreshCw size={14} className={syncStatus?.sincronizando ? "is-spin" : ""} />
                  Atualizar preços RP
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={sincronizarCatalogoMeta}
                  disabled={syncMetaCatalogo || stats.noCatalogo === 0}
                  title="Envia o catálogo ativo para o WhatsApp / Meta como Padaria Superama"
                >
                  <RefreshCw size={14} className={syncMetaCatalogo ? "is-spin" : ""} />
                  {syncMetaCatalogo ? "Enviando Meta…" : "Enviar catálogo → Meta"}
                </button>
              </div>

              <div className="admin-padaria__tools">
                <form className="admin-padaria__search" onSubmit={aplicarBusca}>
                  <Search size={16} className="admin-padaria__search-icon" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por código, nome, cobertura…"
                  />
                  <button type="submit" className="admin-btn admin-btn--primary admin-btn--sm">
                    Buscar
                  </button>
                  {(buscaAtiva || filtro) && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => {
                        setBusca("");
                        setBuscaAtiva("");
                        setFiltro("");
                      }}
                    >
                      Limpar
                    </button>
                  )}
                </form>
                <div className="admin-padaria__filters">
                  {FILTROS.map((f) => (
                    <button
                      key={f.id || "todos"}
                      type="button"
                      className={`admin-padaria__filter ${filtro === f.id ? "is-active" : ""}`}
                      onClick={() => setFiltro(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="admin-padaria__table-wrap">
                {loading ? (
                  <p className="admin-empty">Carregando…</p>
                ) : produtosVisiveis.length === 0 ? (
                  <p className="admin-empty">
                    {buscaAtiva || filtro
                      ? "Nenhum produto corresponde aos filtros."
                      : "Nenhum produto ainda. Adicione pelo código interno acima."}
                  </p>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Categoria</th>
                        <th>Código</th>
                        <th>Preço</th>
                        <th>Catálogo</th>
                        <th>RP</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtosVisiveis.map((p) => {
                        const img = resolveImagemUrl(p.imagemUrl);
                        return (
                          <tr key={p.codigo}>
                            <td>
                              <div className="admin-padaria__produto-cell">
                                {img ? (
                                  <img src={img} alt="" className="admin-padaria__thumb" />
                                ) : (
                                  <div className="admin-padaria__thumb admin-padaria__thumb--empty">
                                    —
                                  </div>
                                )}
                                <div>
                                  <strong>{p.nome}</strong>
                                  {(p.cobertura || p.recheio) && (
                                    <small className="admin-muted">
                                      {[p.cobertura, p.recheio].filter(Boolean).join(" · ")}
                                    </small>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              {p.categoriaNome ? (
                                <span
                                  className="admin-padaria-badge admin-padaria-badge--ok"
                                  style={{
                                    background: `${p.categoriaCor || "#0f766e"}22`,
                                    color: p.categoriaCor || "#0f766e",
                                  }}
                                >
                                  {p.categoriaNome}
                                </span>
                              ) : (
                                <span className="admin-padaria-badge admin-padaria-badge--off">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="mono">{p.codigo}</td>
                            <td>{formatarPrecoPadaria(p.preco, p.vendaPorKg)}</td>
                            <td>
                              <Badge ok={p.ativoCatalogo} sim="Ativo" nao="Oculto" />
                            </td>
                            <td>
                              <Badge ok={p.ativoRp} sim="OK" nao="Inativo" />
                            </td>
                            <td>
                              <div className="admin-padaria__acoes">
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--ghost admin-btn--sm"
                                  onClick={() => abrirEditor(p)}
                                  title="Editar"
                                >
                                  <Pencil size={14} />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--ghost admin-btn--sm"
                                  onClick={() => alternarCatalogo(p)}
                                  title={
                                    p.ativoCatalogo
                                      ? "Ocultar do catálogo"
                                      : "Ativar no catálogo"
                                  }
                                >
                                  {p.ativoCatalogo ? (
                                    <ToggleRight size={14} />
                                  ) : (
                                    <ToggleLeft size={14} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--ghost admin-btn--sm"
                                  onClick={() => atualizarUmDoRp(p.codigo)}
                                  title="Recarregar do RP"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {editando && (
              <div
                className="admin-padaria-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="padaria-edit-title"
              >
                <button
                  type="button"
                  className="admin-padaria-modal__backdrop"
                  aria-label="Fechar"
                  onClick={() => setEditando(null)}
                />
                <div className="admin-padaria-modal__panel">
                  <header className="admin-padaria-modal__head">
                    <div className="admin-padaria-modal__title-block">
                      <span className="admin-padaria-modal__eyebrow">Padaria · Catálogo</span>
                      <h3 id="padaria-edit-title">Editar produto</h3>
                      <div className="admin-padaria-modal__meta">
                        <span className="admin-padaria-modal__code">{editando.codigo}</span>
                        <span
                          className={`admin-padaria-modal__pill ${
                            editando.ativoCatalogo
                              ? "admin-padaria-modal__pill--ok"
                              : "admin-padaria-modal__pill--off"
                          }`}
                        >
                          {editando.ativoCatalogo ? "No catálogo" : "Oculto"}
                        </span>
                        <span
                          className={`admin-padaria-modal__pill ${
                            editando.ativoRp
                              ? "admin-padaria-modal__pill--ok"
                              : "admin-padaria-modal__pill--off"
                          }`}
                        >
                          RP {editando.ativoRp ? "ativo" : "inativo"}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="admin-padaria-modal__close"
                      onClick={() => setEditando(null)}
                      aria-label="Fechar"
                    >
                      <X size={18} />
                    </button>
                  </header>

                  <form className="admin-padaria-modal__body" onSubmit={salvarProduto}>
                    <div className="admin-padaria-modal__scroll">
                      <div className="admin-padaria-modal__layout">
                        <aside className="admin-padaria-modal__media">
                          <div className="admin-padaria-modal__photo">
                            {editando.imagemUrl ? (
                              <img
                                src={resolveImagemUrl(editando.imagemUrl)}
                                alt=""
                              />
                            ) : (
                              <div className="admin-padaria-modal__photo-empty">
                                <Upload size={28} strokeWidth={1.5} />
                                <span>Sem foto</span>
                              </div>
                            )}
                          </div>
                          <label className="admin-padaria-modal__upload">
                            <Upload size={15} />
                            {editando.imagemUrl ? "Trocar foto" : "Enviar foto"}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadImagem(editando.codigo, f);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <div className="admin-padaria-modal__price-card">
                            <span>Preço no RP</span>
                            <strong>
                              {formatarPrecoPadaria(editando.preco, editando.vendaPorKg)}
                            </strong>
                          </div>
                        </aside>

                        <div className="admin-padaria-modal__content">
                          <section className="admin-padaria-modal__section">
                            <h4>Identificação</h4>
                            <div className="admin-padaria-modal__field">
                              <label>Nome no RP</label>
                              <input value={editando.nomeRp} disabled />
                              <small>Somente leitura · vem do ERP</small>
                            </div>
                            <div className="admin-padaria-modal__field">
                              <label htmlFor="padaria-nome-catalogo">Nome no catálogo</label>
                              <input
                                id="padaria-nome-catalogo"
                                value={editando.nomeCatalogo}
                                onChange={(e) =>
                                  setEditando({ ...editando, nomeCatalogo: e.target.value })
                                }
                                placeholder={editando.nomeRp}
                                autoFocus
                              />
                              <small>Como o cliente vê no cardápio</small>
                            </div>
                            <div className="admin-padaria-modal__field">
                              <label htmlFor="padaria-categoria">Categoria</label>
                              <select
                                id="padaria-categoria"
                                value={editando.categoriaId}
                                onChange={(e) =>
                                  setEditando({ ...editando, categoriaId: e.target.value })
                                }
                              >
                                <option value="">Sem categoria</option>
                                {categorias
                                  .filter((c) => c.ativo !== false)
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.nome}
                                    </option>
                                  ))}
                              </select>
                              <small>Seção no autoatendimento (Bolos, Lanches…)</small>
                            </div>
                          </section>

                          <section className="admin-padaria-modal__section">
                            <h4>Detalhes do produto</h4>
                            <div className="admin-padaria-modal__field">
                              <label htmlFor="padaria-descricao">Descrição</label>
                              <textarea
                                id="padaria-descricao"
                                rows={3}
                                value={editando.descricao}
                                onChange={(e) =>
                                  setEditando({ ...editando, descricao: e.target.value })
                                }
                                placeholder="Texto curto para o cliente…"
                              />
                            </div>
                            <div className="admin-padaria-modal__grid-2">
                              <div className="admin-padaria-modal__field">
                                <label htmlFor="padaria-cobertura">Cobertura</label>
                                <input
                                  id="padaria-cobertura"
                                  value={editando.cobertura}
                                  onChange={(e) =>
                                    setEditando({ ...editando, cobertura: e.target.value })
                                  }
                                  placeholder="Ex.: Chocolate"
                                />
                              </div>
                              <div className="admin-padaria-modal__field">
                                <label htmlFor="padaria-recheio">Recheio</label>
                                <input
                                  id="padaria-recheio"
                                  value={editando.recheio}
                                  onChange={(e) =>
                                    setEditando({ ...editando, recheio: e.target.value })
                                  }
                                  placeholder="Ex.: Doce de leite"
                                />
                              </div>
                            </div>
                          </section>

                          <section className="admin-padaria-modal__section">
                            <h4>Decorações do bolo</h4>
                            <p className="admin-muted" style={{ margin: "0 0 0.75rem" }}>
                              Cadastre opções com foto e/ou código. No pedido, o cliente escolhe
                              o bolo e a decoração pelo código.
                            </p>

                            <div className="admin-padaria-deco-lista">
                              {(editando.decoracoes || []).length === 0 ? (
                                <p className="admin-muted">Nenhuma decoração cadastrada.</p>
                              ) : (
                                (editando.decoracoes || []).map((deco) => (
                                  <article key={deco.id} className="admin-padaria-deco-card">
                                    <div className="admin-padaria-deco-card__media">
                                      {deco.imagemUrl ? (
                                        <img
                                          src={resolveImagemUrl(deco.imagemUrl)}
                                          alt=""
                                        />
                                      ) : (
                                        <div className="admin-padaria-deco-card__ph">Sem foto</div>
                                      )}
                                      <label className="admin-btn admin-btn--ghost admin-btn--sm">
                                        <Upload size={14} />
                                        Foto
                                        <input
                                          type="file"
                                          accept="image/jpeg,image/png,image/webp,image/gif"
                                          hidden
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            e.target.value = "";
                                            uploadImagemDecoracao(deco, file);
                                          }}
                                        />
                                      </label>
                                    </div>
                                    <div className="admin-padaria-deco-card__fields">
                                      {deco.global && (
                                        <p
                                          className="admin-muted"
                                          style={{ margin: 0, fontSize: "0.8rem" }}
                                        >
                                          Global · todos os bolos
                                        </p>
                                      )}
                                      <input
                                        value={deco.nome}
                                        onChange={(e) =>
                                          setEditando((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  decoracoes: prev.decoracoes.map((d) =>
                                                    d.id === deco.id
                                                      ? { ...d, nome: e.target.value }
                                                      : d
                                                  ),
                                                }
                                              : prev
                                          )
                                        }
                                        onBlur={() =>
                                          atualizarDecoracaoProduto(deco, { nome: deco.nome })
                                        }
                                        placeholder="Nome da decoração"
                                        disabled={deco.global}
                                      />
                                      <input
                                        value={deco.codigo || ""}
                                        onChange={(e) =>
                                          setEditando((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  decoracoes: prev.decoracoes.map((d) =>
                                                    d.id === deco.id
                                                      ? { ...d, codigo: e.target.value }
                                                      : d
                                                  ),
                                                }
                                              : prev
                                          )
                                        }
                                        onBlur={() =>
                                          atualizarDecoracaoProduto(deco, {
                                            codigo: deco.codigo || "",
                                          })
                                        }
                                        placeholder="Código (ex.: DEC-01)"
                                        disabled={deco.global}
                                      />
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={deco.preco ?? 0}
                                        onChange={(e) =>
                                          setEditando((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  decoracoes: prev.decoracoes.map((d) =>
                                                    d.id === deco.id
                                                      ? { ...d, preco: e.target.value }
                                                      : d
                                                  ),
                                                }
                                              : prev
                                          )
                                        }
                                        onBlur={() =>
                                          atualizarDecoracaoProduto(deco, {
                                            preco: deco.preco ?? 0,
                                          })
                                        }
                                        placeholder="Valor adicional (R$)"
                                        disabled={deco.global}
                                      />
                                      <textarea
                                        rows={2}
                                        value={deco.descricao || ""}
                                        onChange={(e) =>
                                          setEditando((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  decoracoes: prev.decoracoes.map((d) =>
                                                    d.id === deco.id
                                                      ? { ...d, descricao: e.target.value }
                                                      : d
                                                  ),
                                                }
                                              : prev
                                          )
                                        }
                                        onBlur={() =>
                                          atualizarDecoracaoProduto(deco, {
                                            descricao: deco.descricao || "",
                                          })
                                        }
                                        placeholder="Descrição opcional"
                                        disabled={deco.global}
                                      />
                                      <div className="admin-padaria-deco-card__acoes">
                                        <span className="admin-muted" style={{ fontSize: "0.8rem" }}>
                                          {Number(deco.preco) > 0
                                            ? `+ ${formatarPrecoPadaria(deco.preco)}`
                                            : "Grátis"}
                                        </span>
                                        {deco.global ? (
                                          <span className="admin-muted" style={{ fontSize: "0.8rem" }}>
                                            Edite na aba Decorações
                                          </span>
                                        ) : (
                                          <>
                                            <button
                                              type="button"
                                              className="admin-btn admin-btn--ghost admin-btn--sm"
                                              onClick={() =>
                                                atualizarDecoracaoProduto(deco, {
                                                  ativo: !deco.ativo,
                                                })
                                              }
                                            >
                                              {deco.ativo ? "Desativar" : "Ativar"}
                                            </button>
                                            <button
                                              type="button"
                                              className="admin-btn admin-btn--ghost admin-btn--sm"
                                              onClick={() => excluirDecoracaoProduto(deco)}
                                            >
                                              <Trash2 size={14} /> Excluir
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </article>
                                ))
                              )}
                            </div>

                            <div className="admin-padaria-deco-nova">
                              <strong>Nova decoração</strong>
                              <div className="admin-padaria-modal__grid-2">
                                <div className="admin-padaria-modal__field">
                                  <label>Nome</label>
                                  <input
                                    value={editando.novaDecoracao?.nome || ""}
                                    onChange={(e) =>
                                      setEditando((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              novaDecoracao: {
                                                ...prev.novaDecoracao,
                                                nome: e.target.value,
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                    placeholder="Ex.: Flores em chantilly"
                                  />
                                </div>
                                <div className="admin-padaria-modal__field">
                                  <label>Código</label>
                                  <input
                                    value={editando.novaDecoracao?.codigo || ""}
                                    onChange={(e) =>
                                      setEditando((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              novaDecoracao: {
                                                ...prev.novaDecoracao,
                                                codigo: e.target.value,
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                    placeholder="Ex.: DEC-FLORES"
                                  />
                                </div>
                              </div>
                              <div className="admin-padaria-modal__grid-2">
                                <div className="admin-padaria-modal__field">
                                  <label>Valor adicional (R$)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={editando.novaDecoracao?.preco ?? "0"}
                                    onChange={(e) =>
                                      setEditando((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              novaDecoracao: {
                                                ...prev.novaDecoracao,
                                                preco: e.target.value,
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                    placeholder="0 = grátis"
                                  />
                                </div>
                                <div className="admin-padaria-modal__field">
                                  <label>Descrição</label>
                                  <input
                                    value={editando.novaDecoracao?.descricao || ""}
                                    onChange={(e) =>
                                      setEditando((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              novaDecoracao: {
                                                ...prev.novaDecoracao,
                                                descricao: e.target.value,
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                    placeholder="Opcional"
                                  />
                                </div>
                              </div>
                              <label
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  margin: "0.5rem 0",
                                  cursor: "pointer",
                                  fontSize: "0.88rem",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(
                                    editando.novaDecoracao?.controlaEstoque
                                  )}
                                  onChange={(e) =>
                                    setEditando((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            novaDecoracao: {
                                              ...prev.novaDecoracao,
                                              controlaEstoque: e.target.checked,
                                            },
                                          }
                                        : prev
                                    )
                                  }
                                />
                                Controlar estoque unitário
                              </label>
                              {editando.novaDecoracao?.controlaEstoque && (
                                <div className="admin-padaria-modal__field">
                                  <label>Estoque (un.)</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={editando.novaDecoracao?.estoque ?? "0"}
                                    onChange={(e) =>
                                      setEditando((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              novaDecoracao: {
                                                ...prev.novaDecoracao,
                                                estoque: e.target.value,
                                              },
                                            }
                                          : prev
                                      )
                                    }
                                  />
                                </div>
                              )}
                              <button
                                type="button"
                                className="admin-btn admin-btn--primary admin-btn--sm"
                                disabled={editando.salvandoDecoracao}
                                onClick={criarDecoracaoProduto}
                              >
                                <Plus size={14} />
                                {editando.salvandoDecoracao
                                  ? "Salvando…"
                                  : "Adicionar decoração"}
                              </button>
                            </div>
                          </section>

                          <section className="admin-padaria-modal__section">
                            <h4>Opções</h4>
                            <div className="admin-padaria-modal__toggles">
                              <label
                                className={`admin-padaria-modal__toggle ${
                                  editando.vendaPorKg ? "is-on" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={editando.vendaPorKg}
                                  onChange={(e) =>
                                    setEditando({
                                      ...editando,
                                      vendaPorKg: e.target.checked,
                                    })
                                  }
                                />
                                <span className="admin-padaria-modal__toggle-ui" aria-hidden />
                                <span>
                                  <strong>Venda por kg</strong>
                                  <small>Preço e quantidade em quilogramas</small>
                                </span>
                              </label>
                              <label
                                className={`admin-padaria-modal__toggle ${
                                  editando.ativoCatalogo ? "is-on" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={editando.ativoCatalogo}
                                  onChange={(e) =>
                                    setEditando({
                                      ...editando,
                                      ativoCatalogo: e.target.checked,
                                    })
                                  }
                                />
                                <span className="admin-padaria-modal__toggle-ui" aria-hidden />
                                <span>
                                  <strong>Ativo no catálogo</strong>
                                  <small>Aparece para cliente e atendente</small>
                                </span>
                              </label>
                              <label
                                className={`admin-padaria-modal__toggle ${
                                  editando.syncMetaCatalog ? "is-on" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(editando.syncMetaCatalog)}
                                  onChange={(e) =>
                                    setEditando({
                                      ...editando,
                                      syncMetaCatalog: e.target.checked,
                                    })
                                  }
                                />
                                <span className="admin-padaria-modal__toggle-ui" aria-hidden />
                                <span>
                                  <strong>Catálogo WhatsApp / Meta</strong>
                                  <small>
                                    Preço do ERP atualiza o catálogo do Facebook
                                    {editando.metaSyncErro
                                      ? ` · erro: ${editando.metaSyncErro}`
                                      : editando.metaSyncEm
                                        ? " · sincronizado"
                                        : ""}
                                  </small>
                                </span>
                              </label>
                            </div>
                          </section>
                        </div>
                      </div>
                    </div>

                    <footer className="admin-padaria-modal__foot">
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => atualizarUmDoRp(editando.codigo)}
                      >
                        <RefreshCw size={14} />
                        Recarregar RP
                      </button>
                      <div className="admin-padaria-modal__foot-actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => setEditando(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="admin-btn admin-btn--primary"
                          disabled={salvando}
                        >
                          {salvando ? "Salvando…" : "Salvar produto"}
                        </button>
                      </div>
                    </footer>
                  </form>
                </div>
              </div>
            )}
          </>
        )}

        {sub === "decoracoes" && (
          <div className="admin-padaria__usuarios">
            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Nova decoração</h2>
                  <p className="admin-muted">
                    Pode vincular a um bolo ou a todos os bolos ativos. Valor padrão é grátis (R$ 0).
                  </p>
                </div>
              </div>
              <form className="admin-padaria__user-form" onSubmit={criarDecoracaoAba}>
                <label
                  className="admin-padaria-modal__field"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.55rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formDeco.vinculoTodos}
                    onChange={(e) =>
                      setFormDeco({
                        ...formDeco,
                        vinculoTodos: e.target.checked,
                        produtoCodigo: e.target.checked ? "" : formDeco.produtoCodigo,
                      })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Todos os bolos ativos</strong>
                    <br />
                    <span className="admin-muted">
                      Aparece automaticamente em todos os bolos do catálogo (incluindo novos).
                    </span>
                  </span>
                </label>
                {!formDeco.vinculoTodos && (
                  <Field label="Produto (bolo)">
                    <select
                      value={formDeco.produtoCodigo}
                      onChange={(e) =>
                        setFormDeco({ ...formDeco, produtoCodigo: e.target.value })
                      }
                      required={!formDeco.vinculoTodos}
                    >
                      <option value="">Selecione…</option>
                      {produtosOpcoes.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {(p.nomeCatalogo || p.nomeRp || p.codigo) + ` (${p.codigo})`}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Nome">
                  <input
                    value={formDeco.nome}
                    onChange={(e) => setFormDeco({ ...formDeco, nome: e.target.value })}
                    required
                    placeholder="Ex.: Flores em chantilly"
                  />
                </Field>
                <Field label="Código" hint="O cliente informa no balcão">
                  <input
                    value={formDeco.codigo}
                    onChange={(e) => setFormDeco({ ...formDeco, codigo: e.target.value })}
                    placeholder="Ex.: DEC-FLORES"
                  />
                </Field>
                <Field
                  label="Valor adicional (R$)"
                  hint="0 = grátis. Soma no carrinho junto com o bolo."
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={formDeco.preco}
                    onChange={(e) => setFormDeco({ ...formDeco, preco: e.target.value })}
                    placeholder="0,00"
                  />
                </Field>
                <label
                  className="admin-padaria-modal__field"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.55rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formDeco.controlaEstoque}
                    onChange={(e) =>
                      setFormDeco({
                        ...formDeco,
                        controlaEstoque: e.target.checked,
                      })
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>Controlar estoque (unitário)</strong>
                    <br />
                    <span className="admin-muted">
                      Se desmarcado, a decoração fica sem limite de estoque.
                    </span>
                  </span>
                </label>
                {formDeco.controlaEstoque && (
                  <Field label="Estoque (unidades)">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={formDeco.estoque}
                      onChange={(e) =>
                        setFormDeco({ ...formDeco, estoque: e.target.value })
                      }
                      placeholder="0"
                    />
                  </Field>
                )}
                <Field label="Descrição">
                  <input
                    value={formDeco.descricao}
                    onChange={(e) =>
                      setFormDeco({ ...formDeco, descricao: e.target.value })
                    }
                    placeholder="Opcional"
                  />
                </Field>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary"
                  disabled={salvandoDecoAba}
                >
                  <Plus size={16} />
                  {salvandoDecoAba ? "Salvando…" : "Adicionar decoração"}
                </button>
              </form>
            </section>

            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Decorações cadastradas</h2>
                  <p className="admin-muted">
                    {decoracoesAdmin.length} decoração(ões)
                    {loading ? " · carregando…" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={() =>
                    carregarDecoracoesAdmin().catch(handleAuthError)
                  }
                >
                  <RefreshCw size={14} /> Atualizar
                </button>
              </div>

              <div className="admin-padaria__tools">
                <form className="admin-padaria__search" onSubmit={aplicarBuscaDeco}>
                  <Search size={16} className="admin-padaria__search-icon" />
                  <input
                    value={buscaDeco}
                    onChange={(e) => setBuscaDeco(e.target.value)}
                    placeholder="Buscar por nome, código ou bolo…"
                  />
                  <button type="submit" className="admin-btn admin-btn--ghost admin-btn--sm">
                    Buscar
                  </button>
                  <select
                    value={filtroProdutoDeco}
                    onChange={(e) => setFiltroProdutoDeco(e.target.value)}
                    aria-label="Filtrar por produto"
                    className="admin-select"
                    style={{ maxWidth: 260 }}
                  >
                    <option value="">Todos os produtos</option>
                    {produtosOpcoes.map((p) => (
                      <option key={p.codigo} value={p.codigo}>
                        {p.nomeCatalogo || p.nomeRp || p.codigo}
                      </option>
                    ))}
                  </select>
                </form>
                <div className="admin-padaria__filters">
                  {FILTROS_DECO.map((f) => (
                    <button
                      key={f.id || "all"}
                      type="button"
                      className={`admin-padaria__filter ${
                        filtroDeco === f.id ? "is-active" : ""
                      }`}
                      onClick={() => setFiltroDeco(f.id)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {loading && decoracoesAdmin.length === 0 ? (
                <p className="admin-empty">Carregando…</p>
              ) : decoracoesAdmin.length === 0 ? (
                <p className="admin-empty">
                  Nenhuma decoração ainda. Cadastre acima vinculando a um produto.
                </p>
              ) : (
                <div className="admin-padaria-deco-lista">
                  {decoracoesAdmin.map((deco) => (
                    <article key={deco.id} className="admin-padaria-deco-card">
                      <div className="admin-padaria-deco-card__media">
                        {deco.imagemUrl ? (
                          <img src={resolveImagemUrl(deco.imagemUrl)} alt="" />
                        ) : (
                          <div className="admin-padaria-deco-card__ph">Sem foto</div>
                        )}
                        <label className="admin-btn admin-btn--ghost admin-btn--sm">
                          <Upload size={14} />
                          Foto
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              uploadImagemDecoracaoAba(deco, file);
                            }}
                          />
                        </label>
                      </div>
                      <div className="admin-padaria-deco-card__fields">
                        <p className="admin-muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                          {deco.global
                            ? "Todos os bolos ativos"
                            : `${deco.produtoNome || "Produto"} · ${deco.produtoCodigo || ""}`}
                        </p>
                        <input
                          value={deco.nome}
                          onChange={(e) =>
                            setDecoracoesAdmin((prev) =>
                              prev.map((d) =>
                                d.id === deco.id ? { ...d, nome: e.target.value } : d
                              )
                            )
                          }
                          onBlur={() =>
                            atualizarDecoracaoAba(deco, { nome: deco.nome })
                          }
                          placeholder="Nome da decoração"
                        />
                        <input
                          value={deco.codigo || ""}
                          onChange={(e) =>
                            setDecoracoesAdmin((prev) =>
                              prev.map((d) =>
                                d.id === deco.id ? { ...d, codigo: e.target.value } : d
                              )
                            )
                          }
                          onBlur={() =>
                            atualizarDecoracaoAba(deco, {
                              codigo: deco.codigo || "",
                            })
                          }
                          placeholder="Código (ex.: DEC-01)"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={deco.preco ?? 0}
                          onChange={(e) =>
                            setDecoracoesAdmin((prev) =>
                              prev.map((d) =>
                                d.id === deco.id
                                  ? { ...d, preco: e.target.value }
                                  : d
                              )
                            )
                          }
                          onBlur={() =>
                            atualizarDecoracaoAba(deco, {
                              preco: deco.preco ?? 0,
                            })
                          }
                          placeholder="Valor adicional (R$)"
                          title="Valor adicional da decoração"
                        />
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: "0.85rem",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(deco.controlaEstoque)}
                            onChange={(e) =>
                              atualizarDecoracaoAba(deco, {
                                controlaEstoque: e.target.checked,
                                estoque: e.target.checked
                                  ? deco.estoque ?? 0
                                  : 0,
                              })
                            }
                          />
                          Controlar estoque
                        </label>
                        {deco.controlaEstoque && (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={deco.estoque ?? 0}
                            onChange={(e) =>
                              setDecoracoesAdmin((prev) =>
                                prev.map((d) =>
                                  d.id === deco.id
                                    ? { ...d, estoque: e.target.value }
                                    : d
                                )
                              )
                            }
                            onBlur={() =>
                              atualizarDecoracaoAba(deco, {
                                estoque: deco.estoque ?? 0,
                              })
                            }
                            placeholder="Estoque (un.)"
                            title="Estoque unitário"
                          />
                        )}
                        <textarea
                          rows={2}
                          value={deco.descricao || ""}
                          onChange={(e) =>
                            setDecoracoesAdmin((prev) =>
                              prev.map((d) =>
                                d.id === deco.id
                                  ? { ...d, descricao: e.target.value }
                                  : d
                              )
                            )
                          }
                          onBlur={() =>
                            atualizarDecoracaoAba(deco, {
                              descricao: deco.descricao || "",
                            })
                          }
                          placeholder="Descrição opcional"
                        />
                        <div className="admin-padaria-deco-card__acoes">
                          <Badge ok={deco.ativo} sim="Ativa" nao="Inativa" />
                          {deco.global && (
                            <span className="admin-padaria-badge admin-padaria-badge--ok">
                              Global
                            </span>
                          )}
                          <span className="admin-muted" style={{ fontSize: "0.8rem" }}>
                            {Number(deco.preco) > 0
                              ? `+ ${formatarPrecoPadaria(deco.preco)}`
                              : "Grátis"}
                            {deco.controlaEstoque
                              ? ` · estoque ${deco.estoque ?? 0}`
                              : " · sem estoque"}
                          </span>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            onClick={() =>
                              atualizarDecoracaoAba(deco, { ativo: !deco.ativo })
                            }
                          >
                            {deco.ativo ? "Desativar" : "Ativar"}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-btn--sm"
                            onClick={() => excluirDecoracaoAba(deco)}
                          >
                            <Trash2 size={14} /> Excluir
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {sub === "categorias" && (
          <div className="admin-padaria__usuarios">
            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Nova categoria</h2>
                  <p className="admin-muted">
                    Ex.: Bolos, Lanches, Salgados — aparecem no autoatendimento.
                  </p>
                </div>
              </div>
              <form className="admin-padaria__user-form" onSubmit={criarCategoria}>
                <Field label="Nome">
                  <input
                    value={formCat.nome}
                    onChange={(e) => setFormCat({ ...formCat, nome: e.target.value })}
                    required
                    placeholder="Ex: Bolos"
                  />
                </Field>
                <Field label="Cor">
                  <input
                    type="color"
                    value={formCat.cor}
                    onChange={(e) => setFormCat({ ...formCat, cor: e.target.value })}
                  />
                </Field>
                <Field label="Ordem" hint="Menor número aparece primeiro">
                  <input
                    type="number"
                    value={formCat.ordem}
                    onChange={(e) => setFormCat({ ...formCat, ordem: e.target.value })}
                  />
                </Field>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Criar categoria
                </button>
              </form>
            </section>

            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Categorias</h2>
                  <p className="admin-muted">{categorias.length} cadastrada(s)</p>
                </div>
              </div>
              {loading ? (
                <p className="admin-empty">Carregando…</p>
              ) : categorias.length === 0 ? (
                <p className="admin-empty">Nenhuma categoria ainda.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Ordem</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {categorias.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                fontWeight: 700,
                              }}
                            >
                              <span
                                style={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: 99,
                                  background: c.cor,
                                }}
                              />
                              {c.nome}
                            </span>
                          </td>
                          <td>{c.ordem}</td>
                          <td>
                            <Badge ok={c.ativo} sim="Ativa" nao="Inativa" />
                          </td>
                          <td>
                            <div className="admin-padaria__acoes">
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-btn--sm"
                                onClick={() => alternarCategoria(c)}
                              >
                                {c.ativo ? "Desativar" : "Ativar"}
                              </button>
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-btn--sm"
                                onClick={() => excluirCategoria(c)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {sub === "config" && config && (
          <section className="admin-card" style={{ maxWidth: 520 }}>
            <div className="admin-card__head">
              <div>
                <h2 className="admin-card__title">Configuração RP</h2>
                <p className="admin-muted">
                  Unidade usada na busca por código e na atualização de preços.
                </p>
              </div>
            </div>
            <form className="admin-padaria__config-form" onSubmit={salvarConfig}>
              <Field label="Unidade RP">
                <input
                  value={config.unidade_rp || ""}
                  onChange={(e) => setConfig({ ...config, unidade_rp: e.target.value })}
                />
              </Field>
              <Field
                label="Departamentos (referência)"
                hint="Opcional. O cadastro é só por código interno."
              >
                <input
                  value={config.departamento_rp || ""}
                  onChange={(e) =>
                    setConfig({ ...config, departamento_rp: e.target.value })
                  }
                  placeholder="Ex: 012,015"
                />
              </Field>
              <Field label="Antecedência mínima (horas)" hint="0 = só bloqueia passado">
                <input
                  type="number"
                  min="0"
                  value={config.antecedencia_minima_horas ?? "2"}
                  onChange={(e) =>
                    setConfig({ ...config, antecedencia_minima_horas: e.target.value })
                  }
                />
              </Field>
              <div className="admin-padaria__grid-2">
                <Field label="Horário retirada início">
                  <input
                    type="time"
                    value={config.horario_retirada_inicio || "08:00"}
                    onChange={(e) =>
                      setConfig({ ...config, horario_retirada_inicio: e.target.value })
                    }
                  />
                </Field>
                <Field label="Horário retirada fim">
                  <input
                    type="time"
                    value={config.horario_retirada_fim || "19:00"}
                    onChange={(e) =>
                      setConfig({ ...config, horario_retirada_fim: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field
                label="Bematech (PDV13)"
                hint="TCP RAW no print-server.ps1. Texto/ESC-POS — não usa o diálogo gráfico do Windows."
              >
                <input
                  value={config.impressora_host || ""}
                  onChange={(e) =>
                    setConfig({ ...config, impressora_host: e.target.value })
                  }
                  placeholder="10.1.1.13"
                />
              </Field>
              <div className="admin-padaria__grid-2">
                <Field label="Porta">
                  <input
                    type="number"
                    min="1"
                    max="65535"
                    value={config.impressora_porta ?? "9100"}
                    onChange={(e) =>
                      setConfig({ ...config, impressora_porta: e.target.value })
                    }
                  />
                </Field>
                <Field label="Largura do cupom">
                  <select
                    value={config.impressora_largura_mm === "58" ? "58" : "80"}
                    onChange={(e) =>
                      setConfig({ ...config, impressora_largura_mm: e.target.value })
                    }
                  >
                    <option value="80">80 mm</option>
                    <option value="58">58 mm</option>
                  </select>
                </Field>
              </div>
              <div className="admin-padaria__grid-2">
                <button type="submit" className="admin-btn admin-btn--primary">
                  Salvar configuração
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={testarImpressora}
                >
                  Testar cupom
                </button>
              </div>
            </form>
          </section>
        )}

        {sub === "usuarios" && (
          <div className="admin-padaria__usuarios">
            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Novo usuário</h2>
                  <p className="admin-muted">Atendente, produção ou gestor da padaria.</p>
                </div>
              </div>
              <form className="admin-padaria__user-form" onSubmit={criarUsuario}>
                <Field label="Login">
                  <input
                    value={formUser.login}
                    onChange={(e) => setFormUser({ ...formUser, login: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Senha">
                  <input
                    type="password"
                    value={formUser.senha}
                    onChange={(e) => setFormUser({ ...formUser, senha: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Nome">
                  <input
                    value={formUser.nome}
                    onChange={(e) => setFormUser({ ...formUser, nome: e.target.value })}
                  />
                </Field>
                <Field label="Papel">
                  <select
                    value={formUser.papel}
                    onChange={(e) => setFormUser({ ...formUser, papel: e.target.value })}
                  >
                    <option value="atendente">Atendente</option>
                    <option value="padaria">Produção</option>
                    <option value="gestor">Gestor</option>
                  </select>
                </Field>
                <button type="submit" className="admin-btn admin-btn--primary">
                  Criar usuário
                </button>
              </form>
            </section>

            <section className="admin-card">
              <div className="admin-card__head">
                <div>
                  <h2 className="admin-card__title">Usuários</h2>
                  <p className="admin-muted">{usuarios.length} cadastrado(s)</p>
                </div>
              </div>
              {loading ? (
                <p className="admin-empty">Carregando…</p>
              ) : usuarios.length === 0 ? (
                <p className="admin-empty">Nenhum usuário ainda.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Login</th>
                        <th>Nome</th>
                        <th>Papel</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {usuarios.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.login}</strong>
                          </td>
                          <td>{u.nome || "—"}</td>
                          <td>{u.papel}</td>
                          <td>
                            <Badge ok={u.ativo} sim="Ativo" nao="Inativo" />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost admin-btn--sm"
                              onClick={() => alternarUsuario(u)}
                            >
                              {u.ativo ? "Desativar" : "Ativar"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

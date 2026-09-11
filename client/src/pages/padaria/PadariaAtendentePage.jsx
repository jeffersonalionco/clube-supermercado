import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CheckCircle2,
  LogOut,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import PadariaLoginPage from "./PadariaLoginPage.jsx";
import PadariaStatusBadge from "../../components/padaria/PadariaStatusBadge.jsx";
import PadariaEmptyState from "../../components/padaria/PadariaEmptyState.jsx";
import PadariaLoadingState from "../../components/padaria/PadariaLoadingState.jsx";
import PadariaDecoracaoCarousel from "../../components/padaria/PadariaDecoracaoCarousel.jsx";
import {
  clearPadariaSession,
  fetchPadaria,
  formatarPrecoPadaria,
  loadPadariaSession,
} from "../../utils/padariaSession.js";
import {
  brParaIso,
  calcularSubtotalItemPadaria,
  dataLocalISO,
  formatDateTime,
  formatPhone,
  isoParaBr,
  normalizarHora24,
  STATUS_PEDIDO,
} from "../../utils/padariaFormat.js";
import { resolveImagemUrl } from "../../utils/adminSession.js";
import { imprimirPedidoPadaria, conectarImpressoraCupom, desconectarImpressoraCupom, impressoraSerialConectada, obterLarguraCupomMm, definirLarguraCupomMm } from "../../utils/padariaImpressao.js";
import { lockBodyScroll } from "../../utils/bodyScrollLock.js";
import {
  carregarVistos15min,
  carregarVistosPronto,
  desbloquearAudioPadaria,
  JANELA_RETIRADA_MIN,
  minutosParaRetirada,
  notificarSistema,
  pedirPermissaoNotificacao,
  salvarVistos15min,
  salvarVistosPronto,
  tocarAlertaSonoro,
} from "../../utils/padariaAlertas.js";
import "../../styles/padaria.css";

const MOTIVOS = [
  { id: "cliente_desistiu", label: "Cliente desistiu" },
  { id: "erro_pedido", label: "Erro no pedido" },
  { id: "falta_ingrediente", label: "Falta de ingrediente" },
  { id: "problema_operacional", label: "Problema operacional" },
  { id: "outro", label: "Outro" },
];

const DRAFT_KEY = "padaria.atendente.rascunho.v1";
const POLL_MS = 12000;

function hojeISO() {
  return dataLocalISO();
}

function draftDataBr(valor) {
  const iso = brParaIso(valor) || hojeISO();
  return isoParaBr(iso);
}

function draftHora(valor) {
  return normalizarHora24(valor) || "16:30";
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

function saveDraft(payload) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* quota / privado */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function labelDiffMinutos(diff) {
  const n = Number(diff);
  if (!Number.isFinite(n) || n === 0) return "mesmo horário";
  const abs = Math.abs(Math.round(n));
  if (n < 0) return `${abs} min antes`;
  return `${abs} min depois`;
}

function produtoBateBusca(p, qRaw) {
  const q = String(qRaw || "").trim().toLowerCase();
  if (!q) return true;
  const digitos = q.replace(/\D/g, "");
  const textos = [
    p.codigo,
    p.nome,
    p.codigoBarras,
    p.codigoBalanca,
    p.descricao,
  ].map((x) => String(x || "").toLowerCase());
  if (textos.some((t) => t.includes(q))) return true;
  if (!digitos) return false;
  const nums = [
    p.codigo,
    p.codigoBarras,
    p.codigoBalanca,
  ].map((x) => String(x || "").replace(/\D/g, ""));
  for (const n of nums) {
    if (!n) continue;
    if (n === digitos || n.includes(digitos)) return true;
    if (n.length > 1 && n.slice(0, -1) === digitos) return true;
    if (digitos.length > 1 && digitos.slice(0, -1) === n) return true;
  }
  return false;
}

function agruparPorCategoria(produtos, categorias) {
  const map = new Map();
  for (const cat of categorias) map.set(cat.id, { ...cat, produtos: [] });
  const sem = { id: null, nome: "Outros", slug: "outros", cor: "#64748b", produtos: [] };
  for (const p of produtos) {
    if (p.categoriaId && map.has(p.categoriaId)) map.get(p.categoriaId).produtos.push(p);
    else sem.produtos.push(p);
  }
  const grupos = [...map.values()].filter((g) => g.produtos.length > 0);
  if (sem.produtos.length) grupos.push(sem);
  return grupos;
}

export default function PadariaAtendentePage() {
  const draftInicial = useMemo(() => loadDraft(), []);
  const [session, setSession] = useState(() => loadPadariaSession());
  const [aba, setAba] = useState("novo");
  const [catalogo, setCatalogo] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [categoriaAtiva, setCategoriaAtiva] = useState("todas");
  const [buscaCatalogo, setBuscaCatalogo] = useState("");
  const [cartAberto, setCartAberto] = useState(false);
  const [produtoModal, setProdutoModal] = useState(null);
  const [qtdModal, setQtdModal] = useState("1");
  const [decoModal, setDecoModal] = useState(null);
  const [obsModal, setObsModal] = useState("");
  const [pedidoCriado, setPedidoCriado] = useState(null);
  const [confirmEntrega, setConfirmEntrega] = useState(null);
  const [conflitoHorario, setConflitoHorario] = useState(null);
  const [cancelando, setCancelando] = useState(null);
  const [motivoCancel, setMotivoCancel] = useState("cliente_desistiu");
  const menuRef = useRef(null);
  const pollBusy = useRef(false);

  const [clienteNome, setClienteNome] = useState(draftInicial?.clienteNome || "");
  const [clienteTelefone, setClienteTelefone] = useState(
    draftInicial?.clienteTelefone || ""
  );
  const [dataRetiradaBr, setDataRetiradaBr] = useState(() =>
    draftDataBr(draftInicial?.dataRetirada)
  );
  const [horaRetirada, setHoraRetirada] = useState(() =>
    draftHora(draftInicial?.horaRetirada)
  );
  const [observacao, setObservacao] = useState(draftInicial?.observacao || "");
  const [itens, setItens] = useState(() =>
    Array.isArray(draftInicial?.itens) ? draftInicial.itens : []
  );
  const [passo, setPasso] = useState(draftInicial?.passo || "itens");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [buscaPedidos, setBuscaPedidos] = useState("");
  const [dataFiltro, setDataFiltro] = useState(hojeISO());
  const [configRetirada, setConfigRetirada] = useState({
    antecedenciaMinimaHoras: 2,
    horarioRetiradaInicio: "08:00",
    horarioRetiradaFim: "19:00",
  });
  const [alertas, setAlertas] = useState([]);
  const [pedidoDetalhe, setPedidoDetalhe] = useState(null);
  const [cupomMm, setCupomMm] = useState(() => obterLarguraCupomMm());
  const [serialOk, setSerialOk] = useState(() => impressoraSerialConectada());
  const alertasSeeded = useRef(false);
  const alertasBusy = useRef(false);
  const statusMapRef = useRef(null);

  const podeAcessar =
    session?.usuario && ["atendente", "gestor"].includes(session.usuario.papel);

  const carregarCatalogo = useCallback(async () => {
    const res = await fetch("/api/padaria/catalogo");
    const data = await res.json();
    setCatalogo(data.produtos || []);
    setCategorias(data.categorias || []);
  }, []);

  const carregarPedidos = useCallback(async () => {
    const params = new URLSearchParams({ limite: "60" });
    if (filtroStatus) params.set("status", filtroStatus);
    if (buscaPedidos.trim()) params.set("busca", buscaPedidos.trim());
    if (dataFiltro) params.set("dataRetirada", dataFiltro);
    const data = await fetchPadaria(`/pedidos?${params}`);
    setPedidos(data.pedidos || []);
  }, [filtroStatus, buscaPedidos, dataFiltro]);

  const carregarDashboard = useCallback(async () => {
    const data = await fetchPadaria(`/dashboard?data=${hojeISO()}`);
    setDashboard(data.dashboard);
  }, []);

  const processarAlertasPedidos = useCallback((pedidosHoje) => {
    const dia = hojeISO();
    const seenPronto = carregarVistosPronto(dia);
    const seen15 = carregarVistos15min(dia);
    const novos = [];
    const agora = new Date();
    const lista = pedidosHoje || [];

    if (!statusMapRef.current) {
      statusMapRef.current = new Map();
      for (const p of lista) {
        statusMapRef.current.set(String(p.id), p.status);
      }
    } else {
      for (const p of lista) {
        const id = String(p.id);
        const prev = statusMapRef.current.get(id);
        if (prev === "pronto" && p.status === "em_producao") {
          seenPronto.delete(id);
          novos.push({
            key: `reverteu-${id}-${Date.now()}`,
            tipo: "reverteu",
            pedido: p,
            de: "pronto",
            para: "em_producao",
          });
        } else if (prev === "em_producao" && p.status === "novo") {
          novos.push({
            key: `reverteu-${id}-${Date.now()}`,
            tipo: "reverteu",
            pedido: p,
            de: "em_producao",
            para: "novo",
          });
        }
        statusMapRef.current.set(id, p.status);
      }
    }

    for (const p of lista) {
      if (p.status !== "pronto") continue;
      const id = String(p.id);

      if (!alertasSeeded.current) {
        seenPronto.add(id);
      } else if (!seenPronto.has(id)) {
        seenPronto.add(id);
        novos.push({
          key: `pronto-${id}-${Date.now()}`,
          tipo: "pronto",
          pedido: p,
        });
      }

      const mins = minutosParaRetirada(p.dataRetirada, p.horaRetirada, agora);
      if (
        mins != null &&
        mins >= 0 &&
        mins <= JANELA_RETIRADA_MIN &&
        !seen15.has(id)
      ) {
        seen15.add(id);
        novos.push({
          key: `retirada15-${id}`,
          tipo: "retirada_15",
          pedido: p,
          minutos: mins,
        });
      }
    }

    salvarVistosPronto(dia, seenPronto);
    salvarVistos15min(dia, seen15);

    if (!alertasSeeded.current) {
      alertasSeeded.current = true;
      const so15 = novos.filter((a) => a.tipo === "retirada_15");
      if (!so15.length) return;
      setAlertas((prev) => [...so15, ...prev].slice(0, 10));
      tocarAlertaSonoro();
      for (const a of so15) {
        notificarSistema({
          titulo: "Retirada em breve",
          corpo: `${a.pedido.codigoPublico} · ${a.pedido.clienteNome} · ${String(a.pedido.horaRetirada || "").slice(0, 5)}`,
          tag: a.key,
        });
      }
      return;
    }

    if (!novos.length) return;
    setAlertas((prev) => {
      const keys = new Set(prev.map((x) => x.key));
      const add = novos.filter((a) => !keys.has(a.key));
      if (!add.length) return prev;
      return [...add, ...prev].slice(0, 10);
    });
    tocarAlertaSonoro();
    for (const a of novos) {
      if (a.tipo === "pronto") {
        notificarSistema({
          titulo: "Pedido pronto",
          corpo: `${a.pedido.codigoPublico} · ${a.pedido.clienteNome} — pronto para retirada`,
          tag: `pronto-${a.pedido.id}`,
        });
      } else if (a.tipo === "reverteu") {
        notificarSistema({
          titulo: "Status voltou na padaria",
          corpo: `${a.pedido.codigoPublico} · ${a.pedido.clienteNome} — ${STATUS_PEDIDO[a.de]} → ${STATUS_PEDIDO[a.para]}`,
          tag: `reverteu-${a.pedido.id}`,
        });
      } else {
        notificarSistema({
          titulo: "Retirada em breve",
          corpo: `${a.pedido.codigoPublico} · ${a.pedido.clienteNome} · ${String(a.pedido.horaRetirada || "").slice(0, 5)}`,
          tag: a.key,
        });
      }
    }
  }, []);

  const verificarAlertas = useCallback(async () => {
    if (alertasBusy.current) return;
    alertasBusy.current = true;
    try {
      const data = await fetchPadaria(
        `/pedidos?dataRetirada=${encodeURIComponent(hojeISO())}&limite=100`
      );
      processarAlertasPedidos(data.pedidos || []);
    } finally {
      alertasBusy.current = false;
    }
  }, [processarAlertasPedidos]);

  useEffect(() => {
    if (!podeAcessar) return;
    carregarCatalogo().catch(() => {});
    fetchPadaria("/config")
      .then((data) => {
        if (data?.config) setConfigRetirada(data.config);
      })
      .catch(() => {});
    pedirPermissaoNotificacao();
    verificarAlertas().catch(() => {});
    const unlock = () => {
      desbloquearAudioPadaria();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [podeAcessar, carregarCatalogo, verificarAlertas]);

  useEffect(() => {
    if (!podeAcessar || aba !== "lista") return;
    setLoading(true);
    Promise.all([carregarPedidos(), carregarDashboard()])
      .catch((err) => {
        if (err.code === "UNAUTHORIZED") {
          clearPadariaSession();
          setSession(null);
        }
        setErro(err.message);
      })
      .finally(() => setLoading(false));
  }, [podeAcessar, aba, carregarPedidos, carregarDashboard]);

  /* Alertas sempre; lista/catálogo só com aba visível */
  useEffect(() => {
    if (!podeAcessar) return undefined;

    const tick = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        await verificarAlertas();
        if (!document.hidden) {
          await Promise.all([
            carregarPedidos(),
            carregarDashboard(),
            carregarCatalogo(),
          ]);
        }
      } catch (err) {
        if (err?.code === "UNAUTHORIZED") {
          clearPadariaSession();
          setSession(null);
        }
      } finally {
        pollBusy.current = false;
      }
    };

    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    podeAcessar,
    carregarPedidos,
    carregarDashboard,
    carregarCatalogo,
    verificarAlertas,
  ]);

  /* Persiste rascunho do pedido em montagem */
  useEffect(() => {
    if (!podeAcessar) return;
    const temConteudo =
      itens.length > 0 ||
      clienteNome.trim() ||
      clienteTelefone.trim() ||
      observacao.trim();
    if (!temConteudo) {
      clearDraft();
      return;
    }
    saveDraft({
      itens,
      clienteNome,
      clienteTelefone,
      dataRetirada: brParaIso(dataRetiradaBr) || hojeISO(),
      horaRetirada: normalizarHora24(horaRetirada) || horaRetirada,
      observacao,
      passo,
      salvoEm: Date.now(),
    });
  }, [
    podeAcessar,
    itens,
    clienteNome,
    clienteTelefone,
    dataRetiradaBr,
    horaRetirada,
    observacao,
    passo,
  ]);

  useEffect(() => {
    if (!produtoModal) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === "Escape") {
        setProdutoModal(null);
        setDecoModal(null);
        setObsModal("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [produtoModal]);

  useEffect(() => {
    if (!conflitoHorario) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === "Escape") setConflitoHorario(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [conflitoHorario]);

  useEffect(() => {
    if (!pedidoDetalhe && alertas.length === 0) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (pedidoDetalhe) setPedidoDetalhe(null);
      else if (alertas.length) {
        setAlertas((prev) => prev.slice(1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [pedidoDetalhe, alertas.length]);

  function abrirDetalhePedido(pedido, { dispensarAlertaKey } = {}) {
    if (!pedido) return;
    setPedidoDetalhe(pedido);
    if (dispensarAlertaKey) {
      setAlertas((prev) => prev.filter((x) => x.key !== dispensarAlertaKey));
    }
  }

  const grupos = useMemo(
    () => agruparPorCategoria(catalogo, categorias),
    [catalogo, categorias]
  );
  const gruposVisiveis = useMemo(() => {
    let base = grupos;
    if (categoriaAtiva === "outros") base = grupos.filter((g) => g.id == null);
    else if (categoriaAtiva !== "todas") {
      base = grupos.filter((g) => String(g.id) === String(categoriaAtiva));
    }
    if (!buscaCatalogo.trim()) return base;
    return base
      .map((g) => ({
        ...g,
        produtos: g.produtos.filter((p) => produtoBateBusca(p, buscaCatalogo)),
      }))
      .filter((g) => g.produtos.length > 0);
  }, [grupos, categoriaAtiva, buscaCatalogo]);

  const totalCarrinho = useMemo(
    () => itens.reduce((acc, i) => acc + i.subtotal, 0),
    [itens]
  );
  const qtdItens = useMemo(
    () => itens.reduce((acc, i) => acc + Number(i.quantidade || 0), 0),
    [itens]
  );

  function limparPedidoEmAndamento() {
    setItens([]);
    setClienteNome("");
    setClienteTelefone("");
    setObservacao("");
    setDataRetiradaBr(isoParaBr(hojeISO()));
    setHoraRetirada("16:30");
    setPasso("itens");
    setObsModal("");
    setDecoModal(null);
    setProdutoModal(null);
    clearDraft();
    setOkMsg("Pedido em andamento limpo.");
  }

  async function handleImprimirCupom(pedido) {
    if (!pedido) return;
    setErro("");
    try {
      const r = await imprimirPedidoPadaria(pedido, { larguraMm: cupomMm });
      setOkMsg(
        r.modo === "escpos"
          ? "Cupom enviado à impressora."
          : `Impressão de cupom ${cupomMm}mm — escolha a Epson/Bematech e use margens zeradas.`
      );
    } catch (err) {
      setErro(err.message || "Falha ao imprimir cupom.");
    }
  }

  async function handleConectarImpressora() {
    setErro("");
    try {
      if (serialOk) {
        await desconectarImpressoraCupom();
        setSerialOk(false);
        setOkMsg("Impressora desconectada. A impressão voltará ao diálogo do Windows.");
        return;
      }
      await conectarImpressoraCupom();
      setSerialOk(true);
      setOkMsg("Impressora conectada para envio direto (ESC/POS).");
    } catch (err) {
      if (err?.name === "NotFoundError") return;
      setErro(
        err.message ||
          "Não foi possível conectar. Use Chrome/Edge ou imprima pelo diálogo escolhendo a Epson/Bematech."
      );
    }
  }

  function abrirProduto(prod) {
    setProdutoModal(prod);
    setQtdModal(prod.vendaPorKg ? "0.500" : "1");
    setDecoModal(null);
    setObsModal("");
    setErro("");
  }

  function adicionarAoCarrinho(prod, quantidade, decoracao = null, obsItem = "") {
    const q = Number(quantidade);
    if (!prod || !(q > 0)) {
      setErro("Informe uma quantidade válida");
      return;
    }
    const deco = decoracao === undefined ? decoModal : decoracao;
    const obs =
      obsItem !== undefined && obsItem !== null
        ? String(obsItem).trim()
        : String(obsModal || "").trim();
    if (deco && deco.controlaEstoque && deco.disponivel === false) {
      setErro(`Decoração “${deco.nome}” sem estoque`);
      return;
    }
    setErro("");
    const decoId = deco?.id || null;
    const decoPreco = Number(deco?.preco) || 0;
    const porKg = Boolean(prod.vendaPorKg);
    setItens((prev) => {
      const existente = prev.find(
        (x) =>
          x.produtoCodigo === prod.codigo &&
          (x.decoracaoId || null) === decoId &&
          String(x.obsItem || "") === obs
      );
      if (existente) {
        const novaQtd = existente.quantidade + q;
        return prev.map((x) =>
          x.key === existente.key
            ? {
                ...x,
                quantidade: novaQtd,
                decoracaoPreco: decoPreco,
                subtotal: calcularSubtotalItemPadaria({
                  precoUnitario: prod.preco,
                  quantidade: novaQtd,
                  decoracaoPreco: decoPreco,
                  vendaPorKg: porKg,
                }),
              }
            : x
        );
      }
      return [
        ...prev,
        {
          key: `${prod.codigo}-${decoId || "x"}-${Date.now()}`,
          produtoCodigo: prod.codigo,
          nome: prod.nome,
          quantidade: q,
          precoUnitario: prod.preco,
          unidade: porKg ? "KG" : "UN",
          subtotal: calcularSubtotalItemPadaria({
            precoUnitario: prod.preco,
            quantidade: q,
            decoracaoPreco: decoPreco,
            vendaPorKg: porKg,
          }),
          cobertura: prod.cobertura || "",
          recheio: prod.recheio || "",
          obsItem: obs || "",
          decoracaoId: decoId,
          decoracaoCodigo: deco?.codigo || null,
          decoracaoNome: deco?.nome || null,
          decoracaoPreco: decoPreco,
        },
      ];
    });
    setProdutoModal(null);
    setDecoModal(null);
    setObsModal("");
    setCartAberto(true);
  }

  function atualizarObsItem(key, valor) {
    setItens((prev) =>
      prev.map((x) =>
        x.key === key ? { ...x, obsItem: String(valor || "") } : x
      )
    );
  }

  function ajustarQtd(key, delta) {
    setItens((prev) =>
      prev
        .map((x) => {
          if (x.key !== key) return x;
          const step = x.unidade === "KG" ? 0.1 : 1;
          const nova = Math.round((x.quantidade + delta * step) * 1000) / 1000;
          if (nova <= 0) return null;
          return {
            ...x,
            quantidade: nova,
            subtotal: calcularSubtotalItemPadaria({
              precoUnitario: x.precoUnitario,
              quantidade: nova,
              decoracaoPreco: x.decoracaoPreco || 0,
              unidade: x.unidade,
            }),
          };
        })
        .filter(Boolean)
    );
  }

  function removerItem(key) {
    setItens((prev) => prev.filter((x) => x.key !== key));
  }

  async function buscarTelefone() {
    const tel = clienteTelefone.replace(/\D/g, "");
    if (tel.length < 8) return;
    try {
      const data = await fetchPadaria(`/clientes/telefone?telefone=${encodeURIComponent(tel)}`);
      if (data.cliente?.nome) {
        setClienteNome(data.cliente.nome);
        if (data.cliente.telefone) setClienteTelefone(data.cliente.telefone);
        setOkMsg("Cliente encontrado — dados preenchidos.");
      }
    } catch {
      /* silencioso */
    }
  }

  async function enviarPedidoCriado(dataIso, horaNorm) {
    setEnviando(true);
    try {
      const data = await fetchPadaria("/pedidos", {
        method: "POST",
        body: {
          clienteNome,
          clienteTelefone,
          dataRetirada: dataIso,
          horaRetirada: horaNorm,
          observacao,
          itens: itens.map((i) => ({
            produtoCodigo: i.produtoCodigo,
            quantidade: i.quantidade,
            cobertura: i.cobertura,
            recheio: i.recheio,
            obsItem: i.obsItem || "",
            decoracaoId: i.decoracaoId,
            decoracaoCodigo: i.decoracaoCodigo,
          })),
        },
      });
      setPedidoCriado(data.pedido);
      setConflitoHorario(null);
      setClienteNome("");
      setClienteTelefone("");
      setObservacao("");
      setDataRetiradaBr(isoParaBr(hojeISO()));
      setHoraRetirada("16:30");
      setItens([]);
      setPasso("itens");
      setCartAberto(false);
      clearDraft();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearPadariaSession();
        setSession(null);
      }
      setErro(err.message || "Não foi possível criar o pedido.");
      setPasso("cliente");
      setConflitoHorario(null);
    } finally {
      setEnviando(false);
    }
  }

  async function criarPedido(e, { ignorarConflito = false } = {}) {
    e?.preventDefault?.();
    if (enviando) return;
    setErro("");
    setOkMsg("");
    if (!clienteNome.trim()) {
      setErro("Informe o nome do cliente");
      setPasso("cliente");
      return;
    }
    const dataIso = brParaIso(dataRetiradaBr);
    const horaNorm = normalizarHora24(horaRetirada);
    if (!dataIso) {
      setErro("Data inválida. Use dia-mês-ano, por exemplo 31-08-2026.");
      setPasso("cliente");
      return;
    }
    if (!horaNorm) {
      setErro("Hora inválida. Use formato 24h, por exemplo 16:30.");
      setPasso("cliente");
      return;
    }
    setDataRetiradaBr(isoParaBr(dataIso));
    setHoraRetirada(horaNorm);

    if (!ignorarConflito) {
      setEnviando(true);
      try {
        const conflito = await fetchPadaria(
          `/pedidos/conflito-horario?data=${encodeURIComponent(dataIso)}&hora=${encodeURIComponent(horaNorm)}&janelaMinutos=15`
        );
        if (conflito?.temConflito && Array.isArray(conflito.pedidos) && conflito.pedidos.length) {
          setConflitoHorario(conflito);
          setEnviando(false);
          return;
        }
      } catch (err) {
        if (err.code === "UNAUTHORIZED") {
          clearPadariaSession();
          setSession(null);
          setEnviando(false);
          return;
        }
        /* Se a checagem falhar, segue com o pedido (não bloqueia a venda). */
      }
      setEnviando(false);
    }

    await enviarPedidoCriado(dataIso, horaNorm);
  }

  async function confirmarEntrega() {
    if (!confirmEntrega || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await fetchPadaria(`/pedidos/${confirmEntrega.id}`, {
        method: "PATCH",
        body: { status: "entregue" },
      });
      setOkMsg(`Pedido ${confirmEntrega.codigoPublico} entregue.`);
      const entregueId = confirmEntrega.id;
      setConfirmEntrega(null);
      setAlertas((prev) => prev.filter((a) => a.pedido?.id !== entregueId));
      setPedidoDetalhe((atual) =>
        atual?.id === entregueId ? null : atual
      );
      await carregarPedidos();
      await carregarDashboard();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelando || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await fetchPadaria(`/pedidos/${cancelando.id}`, {
        method: "PATCH",
        body: { status: "cancelado", motivoCancelamento: motivoCancel },
      });
      setOkMsg(`Pedido ${cancelando.codigoPublico} cancelado.`);
      setCancelando(null);
      await carregarPedidos();
      await carregarDashboard();
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!session || !podeAcessar) {
    return (
      <PadariaLoginPage
        titulo="Área do atendente"
        subtitulo="Monte pedidos no balcão — rápido e seguro."
        papeisOk={["atendente", "gestor"]}
        onLogin={setSession}
      />
    );
  }

  if (pedidoCriado) {
    return (
      <div className="padaria-app pk-login">
        <div className="pk-login__card" style={{ textAlign: "center" }}>
          <CheckCircle2 size={48} color="var(--pk-primary)" strokeWidth={1.75} aria-hidden />
          <p className="padaria-hero__tag">Pedido criado</p>
          <p className="pk-success-code">{pedidoCriado.codigoPublico}</p>
          <p>
            {pedidoCriado.clienteNome} · Retirada{" "}
            {formatDateTime(pedidoCriado.dataRetirada, pedidoCriado.horaRetirada)}
          </p>
          <p className="padaria-tile__preco">{formatarPrecoPadaria(pedidoCriado.total)}</p>
          <div className="pk-checkout" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
              onClick={() => handleImprimirCupom(pedidoCriado)}
            >
              <Printer size={16} strokeWidth={2} /> Imprimir cupom
            </button>
            <button
              type="button"
              className="padaria-btn padaria-btn--secondary padaria-btn--lg padaria-btn--block"
              onClick={() => {
                setPedidoCriado(null);
                setAba("novo");
              }}
            >
              Nova encomenda
            </button>
            <button
              type="button"
              className="padaria-btn padaria-btn--ghost padaria-btn--block"
              onClick={() => {
                setPedidoCriado(null);
                setAba("lista");
              }}
            >
              Ver pedidos
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`padaria-app pk-kiosk ${cartAberto ? "pk-cart-drawer-open" : ""}`}>
      <header className="pk-kiosk__top">
        <div className="pk-kiosk__brand">
          <strong>Padaria · Pedidos</strong>
          <span>{session.usuario.nome}</span>
        </div>
        <div className="pk-kiosk__nav">
          <button
            type="button"
            className={`padaria-btn padaria-btn--sm ${aba === "novo" ? "padaria-btn--primary" : "padaria-btn--ghost"}`}
            onClick={() => setAba("novo")}
          >
            Nova encomenda
          </button>
          <button
            type="button"
            className={`padaria-btn padaria-btn--sm ${aba === "lista" ? "padaria-btn--primary" : "padaria-btn--ghost"}`}
            onClick={() => setAba("lista")}
          >
            Pedidos
            {alertas.length > 0 && (
              <span className="pk-nav-badge" aria-hidden>
                {alertas.length}
              </span>
            )}
          </button>
            <button
              type="button"
              className="padaria-btn padaria-btn--ghost padaria-btn--sm"
              onClick={handleConectarImpressora}
              title="Conexão direta USB/serial (Chrome/Edge). Sem isso, use o diálogo do Windows."
            >
              {serialOk ? "Impressora OK" : "Conectar impressora"}
            </button>
            <label className="pk-cupom-largura" title="Largura do papel do cupom">
              <span>Cupom</span>
              <select
                value={cupomMm}
                onChange={(e) => {
                  const v = definirLarguraCupomMm(e.target.value);
                  setCupomMm(v);
                }}
                aria-label="Largura do cupom"
              >
                <option value={80}>80 mm</option>
                <option value={58}>58 mm</option>
              </select>
            </label>
            <button
              type="button"
              className="padaria-btn padaria-btn--ghost padaria-btn--sm"
              onClick={() => {
                clearPadariaSession();
                setSession(null);
              }}
            >
              <LogOut size={14} /> Sair
            </button>
        </div>
      </header>

      {alertas.length > 0 && !pedidoDetalhe && (() => {
        const a = alertas[0];
        const p = a.pedido;
        const titulo =
          a.tipo === "pronto"
            ? "Pedido pronto na padaria!"
            : a.tipo === "reverteu"
              ? "Status voltou na padaria"
              : "Retirada em até 15 minutos!";
        const detalhe =
          a.tipo === "pronto"
            ? "A padaria finalizou este pedido. Confira os dados com o cliente na retirada."
            : a.tipo === "reverteu"
              ? `A produção devolveu o pedido de ${STATUS_PEDIDO[a.de] || a.de} para ${STATUS_PEDIDO[a.para] || a.para}.`
              : "O cliente deve chegar em breve. Confira o pedido e prepare a entrega.";
        return (
          <div
            className={`padaria-modal pk-alerta-popup pk-alerta-popup--${a.tipo}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="alerta-pedido-titulo"
          >
            <div className="padaria-modal__backdrop pk-alerta-popup__backdrop" />
            <div className="padaria-modal__panel pk-alerta-popup__panel">
              <div className="pk-alerta-popup__icon" aria-hidden>
                <Bell size={36} strokeWidth={2.2} />
              </div>
              <div className="padaria-modal__head pk-alerta-popup__head">
                <h2 id="alerta-pedido-titulo">{titulo}</h2>
              </div>
              <div className="padaria-modal__body pk-alerta-popup__body">
                <p className="pk-alerta-popup__codigo">{p.codigoPublico}</p>
                <p className="pk-alerta-popup__cliente">{p.clienteNome}</p>
                <p className="pk-alerta-popup__meta">
                  Retirada {formatDateTime(p.dataRetirada, p.horaRetirada)}
                  {a.tipo === "retirada_15" && a.minutos != null
                    ? ` · em ${a.minutos} min`
                    : ""}
                  {p.clienteTelefone
                    ? ` · ${formatPhone(p.clienteTelefone)}`
                    : ""}
                </p>
                <p className="pk-alerta-popup__msg">{detalhe}</p>
                {alertas.length > 1 && (
                  <p className="pk-alerta-popup__fila">
                    +{alertas.length - 1} aviso
                    {alertas.length - 1 > 1 ? "s" : ""} na fila
                  </p>
                )}
              </div>
              <div className="padaria-modal__foot pk-alerta-popup__foot">
                <button
                  type="button"
                  className="padaria-btn padaria-btn--ghost"
                  onClick={() => setAlertas((prev) => prev.slice(1))}
                >
                  Depois
                </button>
                <button
                  type="button"
                  className="padaria-btn padaria-btn--primary padaria-btn--lg"
                  onClick={() =>
                    abrirDetalhePedido(p, { dispensarAlertaKey: a.key })
                  }
                >
                  Ver pedido
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {pedidoDetalhe && (
        <div
          className="padaria-modal pk-pedido-detalhe"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pedido-detalhe-titulo"
        >
          <div
            className="padaria-modal__backdrop"
            onClick={() => setPedidoDetalhe(null)}
          />
          <div className="padaria-modal__panel pk-pedido-detalhe__panel">
            <div className="padaria-modal__head">
              <h2 id="pedido-detalhe-titulo">Conferir pedido</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => setPedidoDetalhe(null)}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <div className="pk-pedido-detalhe__topo">
                <div>
                  <p className="pk-pedido-detalhe__codigo">
                    {pedidoDetalhe.codigoPublico}
                  </p>
                  <PadariaStatusBadge status={pedidoDetalhe.status} />
                </div>
                <p className="pk-pedido-detalhe__total">
                  {formatarPrecoPadaria(pedidoDetalhe.total)}
                </p>
              </div>

              <dl className="pk-pedido-detalhe__dados">
                <div>
                  <dt>Cliente</dt>
                  <dd>{pedidoDetalhe.clienteNome}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>
                    {pedidoDetalhe.clienteTelefone
                      ? formatPhone(pedidoDetalhe.clienteTelefone)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Retirada</dt>
                  <dd>
                    {formatDateTime(
                      pedidoDetalhe.dataRetirada,
                      pedidoDetalhe.horaRetirada
                    )}
                  </dd>
                </div>
                {pedidoDetalhe.observacao ? (
                  <div>
                    <dt>Observação</dt>
                    <dd>{pedidoDetalhe.observacao}</dd>
                  </div>
                ) : null}
              </dl>

              <h3 className="pk-pedido-detalhe__itens-titulo">Itens</h3>
              <ul className="pk-pedido-detalhe__itens">
                {(pedidoDetalhe.itens || []).map((i) => (
                  <li key={i.id || `${i.produtoCodigo}-${i.nome}`}>
                    <div className="pk-pedido-detalhe__item-main">
                      <strong>
                        {i.quantidade}
                        {String(i.unidade || "").toUpperCase() === "KG"
                          ? " kg"
                          : "×"}{" "}
                        {i.nome}
                      </strong>
                      <span>{formatarPrecoPadaria(i.subtotal)}</span>
                    </div>
                    {(i.decoracaoNome || i.obsItem || i.cobertura || i.recheio) && (
                      <div className="pk-pedido-detalhe__item-extra">
                        {i.decoracaoNome
                          ? `Decoração: ${i.decoracaoNome}${
                              i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""
                            }${
                              Number(i.decoracaoPreco) > 0
                                ? ` · ${formatarPrecoPadaria(i.decoracaoPreco)}`
                                : ""
                            }`
                          : null}
                        {i.cobertura ? ` · Cobertura: ${i.cobertura}` : ""}
                        {i.recheio ? ` · Recheio: ${i.recheio}` : ""}
                        {i.obsItem ? ` · Obs.: ${i.obsItem}` : ""}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="pk-pedido-detalhe__hint">
                Confira código, nome e itens com o cliente antes de entregar.
              </p>
            </div>
            <div className="padaria-modal__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                onClick={() => handleImprimirCupom(pedidoDetalhe)}
              >
                <Printer size={14} strokeWidth={2} /> Imprimir cupom
              </button>
              {pedidoDetalhe.status === "pronto" ? (
                <button
                  type="button"
                  className="padaria-btn padaria-btn--primary"
                  onClick={() => {
                    setConfirmEntrega(pedidoDetalhe);
                    setPedidoDetalhe(null);
                  }}
                >
                  Entregar
                </button>
              ) : (
                <button
                  type="button"
                  className="padaria-btn padaria-btn--secondary"
                  onClick={() => setPedidoDetalhe(null)}
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {okMsg && (
        <p className="padaria-alert padaria-alert--ok" style={{ margin: "0.75rem 1rem 0" }}>
          {okMsg}
        </p>
      )}

      {aba === "novo" ? (
        <>
          <div className="pk-kiosk__busca">
            <Search size={18} strokeWidth={2} aria-hidden />
            <input
              value={buscaCatalogo}
              onChange={(e) => {
                setBuscaCatalogo(e.target.value);
                setCategoriaAtiva("todas");
              }}
              placeholder="Buscar por nome, código ERP ou balança…"
              aria-label="Buscar produto no catálogo"
              enterKeyHint="search"
              autoComplete="off"
            />
            {buscaCatalogo && (
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => setBuscaCatalogo("")}
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <nav className="pk-kiosk__cats" aria-label="Categorias">
            <button
              type="button"
              className={`padaria-cat-chip ${categoriaAtiva === "todas" ? "is-active" : ""}`}
              style={{ "--chip-color": "#0f766e" }}
              onClick={() => setCategoriaAtiva("todas")}
            >
              Todos
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`padaria-cat-chip ${categoriaAtiva === String(c.id) ? "is-active" : ""}`}
                style={{ "--chip-color": c.cor }}
                onClick={() => {
                  setCategoriaAtiva(String(c.id));
                  requestAnimationFrame(() =>
                    document.getElementById(`cat-${c.slug}`)?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  );
                }}
              >
                {c.nome}
              </button>
            ))}
          </nav>

          <div className="pk-kiosk__body">
            <main className="pk-kiosk__menu" ref={menuRef}>
              {gruposVisiveis.length === 0 ? (
                <div className="padaria-empty">
                  <p>
                    {buscaCatalogo.trim()
                      ? "Nenhum produto encontrado para essa busca."
                      : "Nenhum produto no catálogo."}
                  </p>
                </div>
              ) : (
                gruposVisiveis.map((grupo) => (
                  <section
                    key={grupo.slug || "outros"}
                    id={`cat-${grupo.slug || "outros"}`}
                    className="padaria-section"
                  >
                    <div className="padaria-section__head">
                      <h2 style={{ color: grupo.cor || undefined }}>{grupo.nome}</h2>
                      <span>{grupo.produtos.length} itens</span>
                    </div>
                    <div className="padaria-grid">
                      {grupo.produtos.map((p) => {
                        const img = resolveImagemUrl(p.imagemUrl);
                        return (
                          <div key={p.codigo} className="padaria-tile pk-kiosk-tile">
                            <button
                              type="button"
                              onClick={() => abrirProduto(p)}
                              style={{
                                all: "unset",
                                cursor: "pointer",
                                display: "flex",
                                flexDirection: "column",
                                height: "100%",
                              }}
                            >
                              {img ? (
                                <img className="padaria-tile__img" src={img} alt="" />
                              ) : (
                                <div className="padaria-tile__img--ph">Sem foto</div>
                              )}
                              <div className="padaria-tile__body">
                                <h3>{p.nome}</h3>
                                <p className="padaria-tile__preco">
                                  {formatarPrecoPadaria(p.preco, p.vendaPorKg)}
                                </p>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="pk-kiosk-tile__add"
                              aria-label={`Adicionar ${p.nome}`}
                              onClick={() => {
                                if ((p.decoracoes || []).length) {
                                  abrirProduto(p);
                                } else {
                                  adicionarAoCarrinho(p, p.vendaPorKg ? 0.5 : 1);
                                }
                              }}
                            >
                              <Plus size={18} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </main>

            <aside className="pk-cart">
              <div className="pk-cart__head">
                <h2>
                  {passo === "itens"
                    ? "Pedido"
                    : passo === "cliente"
                      ? "Cliente e retirada"
                      : "Confirmar"}
                </h2>
                <div className="pk-cart__head-actions">
                  {(itens.length > 0 ||
                    clienteNome ||
                    clienteTelefone ||
                    observacao) && (
                    <button
                      type="button"
                      className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                      onClick={limparPedidoEmAndamento}
                    >
                      Limpar
                    </button>
                  )}
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                    onClick={() => setCartAberto(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {passo === "itens" && (
                <>
                  <div className="pk-cart__items">
                    {itens.length === 0 ? (
                      <p style={{ color: "var(--pk-muted)", fontSize: "0.9rem" }}>
                        Toque nos produtos para montar o pedido.
                      </p>
                    ) : (
                      itens.map((i) => (
                        <div key={i.key} className="pk-cart-item">
                          <div>
                            <strong>{i.nome}</strong>
                            {i.decoracaoNome && (
                              <>
                                <br />
                                <small>
                                  Deco: {i.decoracaoNome}
                                  {i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""}
                                  {Number(i.decoracaoPreco) > 0
                                    ? ` · +${formatarPrecoPadaria(i.decoracaoPreco)}`
                                    : ""}
                                </small>
                              </>
                            )}
                            <br />
                            <small>
                              Bolo {formatarPrecoPadaria(i.precoUnitario)}
                              {i.unidade === "KG" ? "/kg" : ""} · {i.unidade}
                              {Number(i.decoracaoPreco) > 0
                                ? ` + deco ${formatarPrecoPadaria(i.decoracaoPreco)} (fixo)`
                                : ""}
                            </small>
                            <label className="pk-cart-item__obs">
                              <span>Obs. do item</span>
                              <input
                                type="text"
                                value={i.obsItem || ""}
                                placeholder="Ex.: sem cereja, escrito João…"
                                onChange={(e) =>
                                  atualizarObsItem(i.key, e.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                            <strong>{formatarPrecoPadaria(i.subtotal)}</strong>
                            <div className="pk-qty">
                              <button type="button" onClick={() => ajustarQtd(i.key, -1)}>
                                <Minus size={14} />
                              </button>
                              <span>{i.quantidade}</span>
                              <button type="button" onClick={() => ajustarQtd(i.key, 1)}>
                                <Plus size={14} />
                              </button>
                            </div>
                            <button
                              type="button"
                              className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                              onClick={() => removerItem(i.key)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pk-cart__foot">
                    <div className="pk-cart__total">
                      <span>Total</span>
                      <strong>{formatarPrecoPadaria(totalCarrinho)}</strong>
                    </div>
                    <button
                      type="button"
                      className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
                      disabled={itens.length === 0}
                      onClick={() => setPasso("cliente")}
                    >
                      Continuar · Cliente
                    </button>
                  </div>
                </>
              )}

              {passo === "cliente" && (
                <form
                  className="pk-cart__foot pk-checkout"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const dataIso = brParaIso(dataRetiradaBr);
                    const horaNorm = normalizarHora24(horaRetirada);
                    if (!clienteNome.trim()) {
                      setErro("Informe o nome do cliente");
                      return;
                    }
                    if (!dataIso) {
                      setErro(
                        "Data inválida. Use dia-mês-ano, por exemplo 31-08-2026."
                      );
                      return;
                    }
                    if (!horaNorm) {
                      setErro(
                        "Hora inválida. Use formato 24h, por exemplo 16:30."
                      );
                      return;
                    }
                    setDataRetiradaBr(isoParaBr(dataIso));
                    setHoraRetirada(horaNorm);
                    setPasso("resumo");
                  }}
                >
                  <label className="pk-checkout__field">
                    Nome do cliente
                    <input
                      className="pk-checkout__control"
                      value={clienteNome}
                      onChange={(e) => setClienteNome(e.target.value)}
                      required
                      autoFocus
                    />
                  </label>
                  <label className="pk-checkout__field">
                    Telefone
                    <input
                      className="pk-checkout__control"
                      value={clienteTelefone}
                      onChange={(e) => setClienteTelefone(e.target.value)}
                      onBlur={buscarTelefone}
                      placeholder="(45) 99999-9999"
                    />
                  </label>
                  <div className="pk-checkout__row">
                    <label className="pk-checkout__field">
                      Data de retirada
                      <input
                        type="date"
                        className="pk-checkout__control"
                        value={brParaIso(dataRetiradaBr) || ""}
                        min={hojeISO()}
                        onChange={(e) => {
                          const iso = e.target.value;
                          setDataRetiradaBr(iso ? isoParaBr(iso) : "");
                        }}
                        required
                      />
                      <span className="pk-checkout__meta">
                        {dataRetiradaBr || "Escolha no calendário"}
                      </span>
                    </label>
                    <label className="pk-checkout__field">
                      Hora (24h)
                      <input
                        type="time"
                        className="pk-checkout__control"
                        value={normalizarHora24(horaRetirada) || ""}
                        min={configRetirada.horarioRetiradaInicio}
                        max={configRetirada.horarioRetiradaFim}
                        step="60"
                        onChange={(e) => {
                          const h = normalizarHora24(e.target.value);
                          if (h) setHoraRetirada(h);
                          else setHoraRetirada(e.target.value);
                        }}
                        required
                      />
                      <span className="pk-checkout__meta">
                        {normalizarHora24(horaRetirada) || "—"}
                      </span>
                    </label>
                  </div>
                  <p className="pk-field-hint pk-checkout__rules">
                    Horário {configRetirada.horarioRetiradaInicio}–
                    {configRetirada.horarioRetiradaFim}
                    {configRetirada.antecedenciaMinimaHoras > 0
                      ? ` · mínimo ${configRetirada.antecedenciaMinimaHoras}h de antecedência`
                      : ""}
                  </p>
                  <label className="pk-checkout__field">
                    Observação
                    <textarea
                      className="pk-checkout__control"
                      rows={2}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                    />
                  </label>
                  <button type="submit" className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block">
                    Revisar pedido
                  </button>
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--ghost padaria-btn--block"
                    onClick={() => setPasso("itens")}
                  >
                    Voltar aos itens
                  </button>
                </form>
              )}

              {passo === "resumo" && (
                <div className="pk-cart__foot">
                  <div className="pk-resumo">
                    <h3>Resumo do pedido</h3>
                    <p>
                      <strong>Cliente:</strong> {clienteNome}
                    </p>
                    <p>
                      <strong>Telefone:</strong> {clienteTelefone || "—"}
                    </p>
                    <p>
                      <strong>Retirada:</strong>{" "}
                      {formatDateTime(brParaIso(dataRetiradaBr), horaRetirada)}
                    </p>
                    <ul>
                      {itens.map((i) => (
                        <li key={i.key}>
                          {i.quantidade}
                          {i.unidade === "KG" ? "kg" : "x"} {i.nome}
                          {i.decoracaoNome
                            ? ` · ${i.decoracaoNome}${
                                i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""
                              }${
                                Number(i.decoracaoPreco) > 0
                                  ? ` +${formatarPrecoPadaria(i.decoracaoPreco)}`
                                  : ""
                              }`
                            : ""}
                          {i.obsItem ? ` · obs: ${i.obsItem}` : ""}{" "}
                          <strong>{formatarPrecoPadaria(i.subtotal)}</strong>
                        </li>
                      ))}
                    </ul>
                    {observacao && (
                      <p>
                        <strong>Obs:</strong> {observacao}
                      </p>
                    )}
                    <div className="pk-cart__total">
                      <span>TOTAL</span>
                      <strong>{formatarPrecoPadaria(totalCarrinho)}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
                    disabled={enviando}
                    onClick={criarPedido}
                  >
                    {enviando ? "Confirmando…" : "Confirmar pedido"}
                  </button>
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--ghost padaria-btn--block"
                    onClick={() => setPasso("cliente")}
                  >
                    Voltar
                  </button>
                </div>
              )}
            </aside>
          </div>

          {itens.length > 0 && (
            <button type="button" className="pk-fab-cart" onClick={() => setCartAberto(true)}>
              <ShoppingBag size={18} />
              {qtdItens} · {formatarPrecoPadaria(totalCarrinho)}
            </button>
          )}
        </>
      ) : (
        <section className="pk-lista">
          {dashboard && (
            <div className="pk-dash">
              <div><strong>{dashboard.totais.hoje}</strong><span>Hoje</span></div>
              <div><strong>{dashboard.totais.novos}</strong><span>Novos</span></div>
              <div><strong>{dashboard.totais.emProducao}</strong><span>Produção</span></div>
              <div><strong>{dashboard.totais.prontos}</strong><span>Prontos</span></div>
              <div><strong>{dashboard.totais.entregues}</strong><span>Entregues</span></div>
              <div><strong>{dashboard.totais.cancelados}</strong><span>Cancelados</span></div>
            </div>
          )}

          <div className="padaria-row" style={{ justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--pk-display)", fontSize: "var(--pk-fs-h2)" }}>
              Pedidos
            </h2>
            <div className="padaria-row pk-filtros">
              <input
                type="date"
                className="pk-filtro-input"
                value={dataFiltro}
                onChange={(e) => setDataFiltro(e.target.value)}
                aria-label="Data"
              />
              <input
                className="pk-filtro-input"
                value={buscaPedidos}
                onChange={(e) => setBuscaPedidos(e.target.value)}
                placeholder="Código, cliente, telefone…"
                aria-label="Buscar pedidos"
              />
              <select
                className="pk-filtro-input"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                aria-label="Status"
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_PEDIDO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => carregarPedidos().then(carregarDashboard)}
                aria-label="Atualizar"
              >
                <RefreshCw size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {loading ? (
            <PadariaLoadingState label="Carregando pedidos…" />
          ) : pedidos.length === 0 ? (
            <PadariaEmptyState
              title="Nenhum pedido encontrado"
              description="Não existem pedidos para os filtros selecionados."
            />
          ) : (
            pedidos.map((p) => (
              <article key={p.id} className="pk-pedido">
                <div className="pk-pedido__top">
                  <strong>{p.codigoPublico}</strong>
                  <PadariaStatusBadge status={p.status} />
                </div>
                <p className="pk-pedido__cliente">{p.clienteNome}</p>
                <p className="pk-pedido__meta">
                  {p.clienteTelefone ? `${formatPhone(p.clienteTelefone)} · ` : ""}
                  Retirada {formatDateTime(p.dataRetirada, p.horaRetirada)}
                </p>
                <ul className="pk-pedido__itens">
                  {p.itens?.map((i) => (
                    <li key={i.id}>
                      {i.quantidade}x {i.nome}
                      {i.decoracaoNome
                        ? ` · deco ${i.decoracaoNome}${
                            i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""
                          }`
                        : ""}
                      {i.obsItem ? ` · obs: ${i.obsItem}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="pk-pedido__total">{formatarPrecoPadaria(p.total)}</p>
                <div className="pk-pedido__acoes">
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--secondary padaria-btn--sm"
                    onClick={() => abrirDetalhePedido(p)}
                  >
                    Ver pedido
                  </button>
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                    onClick={() => handleImprimirCupom(p)}
                  >
                    <Printer size={14} strokeWidth={2} /> Cupom
                  </button>
                  {p.status === "pronto" && (
                    <button
                      type="button"
                      className="padaria-btn padaria-btn--primary padaria-btn--sm"
                      onClick={() => setConfirmEntrega(p)}
                    >
                      Entregar
                    </button>
                  )}
                  {["novo", "em_producao"].includes(p.status) && (
                    <button
                      type="button"
                      className="padaria-btn padaria-btn--danger padaria-btn--sm"
                      onClick={() => {
                        setCancelando(p);
                        setMotivoCancel("cliente_desistiu");
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      )}

      {produtoModal && (
        <div className="padaria-modal" role="dialog" aria-modal="true">
          <div className="padaria-modal__backdrop" onClick={() => setProdutoModal(null)} />
          <div className="padaria-modal__panel">
            <div className="padaria-modal__media-wrap">
              {resolveImagemUrl(produtoModal.imagemUrl) ? (
                <img
                  className="padaria-modal__img"
                  src={resolveImagemUrl(produtoModal.imagemUrl)}
                  alt=""
                />
              ) : (
                <div className="padaria-modal__img--ph">Sem foto</div>
              )}
            </div>
            <div className="padaria-modal__head">
              <h2>{produtoModal.nome}</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => {
                  setProdutoModal(null);
                  setDecoModal(null);
                }}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <p className="padaria-tile__preco">
                {formatarPrecoPadaria(produtoModal.preco, produtoModal.vendaPorKg)}
              </p>
              {(produtoModal.decoracoes || []).filter((d) => d.ativo !== false)
                .length > 0 && (
                <PadariaDecoracaoCarousel
                  decoracoes={produtoModal.decoracoes}
                  selecionada={decoModal}
                  onSelect={setDecoModal}
                  permitirSemDecoracao
                  modo="atendente"
                />
              )}
              <label>
                Quantidade ({produtoModal.vendaPorKg ? "kg" : "un"})
                <input
                  type="number"
                  min="0.001"
                  step={produtoModal.vendaPorKg ? "0.1" : "1"}
                  value={qtdModal}
                  onChange={(e) => setQtdModal(e.target.value)}
                />
              </label>
              <label>
                Observação do item
                <textarea
                  rows={2}
                  value={obsModal}
                  onChange={(e) => setObsModal(e.target.value)}
                  placeholder="Ex.: escrito Feliz Aniversário, sem cereja…"
                />
              </label>
              {decoModal && Number(decoModal.preco) > 0 && (
                <p className="pk-field-hint" style={{ marginTop: "0.5rem" }}>
                  Estimativa: bolo{" "}
                  {formatarPrecoPadaria(
                    Number(produtoModal.preco) * Number(qtdModal || 0)
                  )}
                  {" + "}
                  decoração {formatarPrecoPadaria(decoModal.preco)} (fixo)
                  {" = "}
                  <strong>
                    {formatarPrecoPadaria(
                      calcularSubtotalItemPadaria({
                        precoUnitario: produtoModal.preco,
                        quantidade: qtdModal,
                        decoracaoPreco: decoModal.preco,
                        vendaPorKg: produtoModal.vendaPorKg,
                      })
                    )}
                  </strong>
                </p>
              )}
            </div>
            <div className="padaria-modal__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                onClick={() => setProdutoModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--primary"
                onClick={() =>
                  adicionarAoCarrinho(produtoModal, qtdModal, decoModal, obsModal)
                }
              >
                Adicionar ao pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {conflitoHorario && (
        <div className="padaria-modal" role="dialog" aria-modal="true" aria-labelledby="conflito-horario-titulo">
          <div
            className="padaria-modal__backdrop"
            onClick={() => !enviando && setConflitoHorario(null)}
          />
          <div className="padaria-modal__panel padaria-modal__panel--sm padaria-conflito-panel">
            <div className="padaria-modal__head">
              <h2 id="conflito-horario-titulo">Horário próximo ocupado</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => setConflitoHorario(null)}
                disabled={enviando}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <p className="padaria-conflito-lead">
                Já existe pedido para retirada em{" "}
                <strong>
                  {formatDateTime(conflitoHorario.data, conflitoHorario.hora)}
                </strong>{" "}
                (janela de ±{conflitoHorario.janelaMinutos || 15} min).
                Deseja continuar neste horário mesmo assim?
              </p>
              <ul className="padaria-conflito-lista">
                {(conflitoHorario.pedidos || []).map((p) => (
                  <li key={p.id}>
                    <div className="padaria-conflito-lista__main">
                      <strong>{p.codigoPublico}</strong>
                      <span>{p.clienteNome}</span>
                    </div>
                    <div className="padaria-conflito-lista__meta">
                      <span>{String(p.horaRetirada || "").slice(0, 5)}</span>
                      <span>{labelDiffMinutos(p.minutosDiferenca)}</span>
                      <PadariaStatusBadge status={p.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="padaria-modal__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                disabled={enviando}
                onClick={() => {
                  setConflitoHorario(null);
                  setPasso("cliente");
                  setCartAberto(true);
                }}
              >
                Trocar horário
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--warning"
                disabled={enviando}
                onClick={() => criarPedido(null, { ignorarConflito: true })}
              >
                {enviando ? "Confirmando…" : "Continuar mesmo assim"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmEntrega && (
        <div className="padaria-modal" role="dialog" aria-modal="true">
          <div className="padaria-modal__backdrop" onClick={() => setConfirmEntrega(null)} />
          <div className="padaria-modal__panel padaria-modal__panel--sm">
            <div className="padaria-modal__head">
              <h2>Confirmar entrega?</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => setConfirmEntrega(null)}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <p>
                <strong>{confirmEntrega.codigoPublico}</strong>
                <br />
                Cliente: {confirmEntrega.clienteNome}
                <br />
                Retirada:{" "}
                {formatDateTime(
                  confirmEntrega.dataRetirada,
                  confirmEntrega.horaRetirada
                )}
              </p>
            </div>
            <div className="padaria-modal__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                onClick={() => setConfirmEntrega(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--primary"
                disabled={enviando}
                onClick={confirmarEntrega}
              >
                {enviando ? "Confirmando…" : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelando && (
        <div className="padaria-modal" role="dialog" aria-modal="true">
          <div className="padaria-modal__backdrop" onClick={() => setCancelando(null)} />
          <div className="padaria-modal__panel padaria-modal__panel--sm">
            <div className="padaria-modal__head">
              <h2>Cancelar pedido</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => setCancelando(null)}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <p>
                <strong>{cancelando.codigoPublico}</strong> · {cancelando.clienteNome}
              </p>
              <label>
                Motivo
                <select
                  value={motivoCancel}
                  onChange={(e) => setMotivoCancel(e.target.value)}
                >
                  {MOTIVOS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="padaria-modal__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                onClick={() => setCancelando(null)}
              >
                Voltar
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--danger"
                disabled={enviando}
                onClick={confirmarCancelamento}
              >
                {enviando ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && (
        <div
          className="padaria-erro-popup"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="pk-erro-titulo"
        >
          <div
            className="padaria-erro-popup__backdrop"
            onClick={() => setErro("")}
          />
          <div className="padaria-erro-popup__panel">
            <h2 id="pk-erro-titulo">Atenção</h2>
            <p>{erro}</p>
            <button
              type="button"
              className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
              onClick={() => setErro("")}
              autoFocus
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

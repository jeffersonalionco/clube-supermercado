import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  ChevronRight,
  LogOut,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import PadariaLoginPage from "./PadariaLoginPage.jsx";
import {
  PadariaFotosBadge,
  PadariaFotosGaleria,
  PadariaFotosStrip,
} from "../../components/padaria/PadariaFotosPedido.jsx";
import {
  clearPadariaSession,
  fetchPadaria,
  formatarPrecoPadaria,
  loadPadariaSession,
} from "../../utils/padariaSession.js";
import {
  dataLocalISO,
  formatDateTime,
  formatPhone,
  STATUS_PEDIDO,
} from "../../utils/padariaFormat.js";
import {
  tocarAlertaSonoro,
  tocarAlertaCancelamento,
  desbloquearAudioPadaria,
  onAudioPadariaChange,
  audioPadariaLiberado,
  notificarSistema,
  pedirPermissaoNotificacao,
} from "../../utils/padariaAlertas.js";
import { imprimirPedidoPadaria } from "../../utils/padariaImpressao.js";
import { lockBodyScroll } from "../../utils/bodyScrollLock.js";
import "../../styles/padaria.css";

const POLL_MS = 12000;
const POPUP_MS = 40000;
const CANCEL_SOUND_MS = 6500;
const SEEN_NOVOS_KEY = "padaria.producao.vistos.novo.v1";
const SEEN_CANCEL_KEY = "padaria.producao.vistos.cancelado.v1";
const ORDEN_KEY = "padaria.producao.ordenacao.v1";

const OPCOES_ORDEN = [
  { id: "hora", label: "Horário de entrega" },
  { id: "criacao", label: "Ordem de criação" },
  { id: "recentes", label: "Mais recentes" },
];

function loadOrdenacao() {
  try {
    const v = localStorage.getItem(ORDEN_KEY);
    if (OPCOES_ORDEN.some((o) => o.id === v)) return v;
  } catch {
    /* ignore */
  }
  return "hora";
}

function ordenarPedidos(lista, modo) {
  const arr = [...(lista || [])];
  const ts = (v) => {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  if (modo === "criacao") {
    arr.sort(
      (a, b) => ts(a.criadoEm) - ts(b.criadoEm) || Number(a.id) - Number(b.id)
    );
  } else if (modo === "recentes") {
    arr.sort(
      (a, b) => ts(b.criadoEm) - ts(a.criadoEm) || Number(b.id) - Number(a.id)
    );
  } else {
    arr.sort((a, b) => {
      const ha = String(a.horaRetirada || "99:99");
      const hb = String(b.horaRetirada || "99:99");
      return ha.localeCompare(hb) || Number(a.id) - Number(b.id);
    });
  }
  return arr;
}

function labelAcaoStatus(de, para) {
  if (de === "novo" && para === "em_producao") return "Iniciar produção";
  if (de === "em_producao" && para === "pronto") return "Marcar como pronto";
  if (de === "em_producao" && para === "novo") return "Voltar para Novos";
  if (de === "pronto" && para === "em_producao") return "Voltar para Em produção";
  return "Alterar status";
}

function hojeISO() {
  return dataLocalISO();
}

function labelTempo(minutos) {
  if (minutos == null) return "";
  if (minutos < 0) return `Atrasado ${Math.abs(minutos)} min`;
  if (minutos === 0) return "Agora";
  return `Em ${minutos} min`;
}

function qtdItem(i) {
  return `${i.quantidade}${
    String(i.unidade || "").toUpperCase() === "KG" ? "kg" : "×"
  }`;
}

function extrasItem(i) {
  return [
    i.decoracaoNome
      ? `Deco: ${i.decoracaoNome}${
          i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""
        }${
          Number(i.decoracaoPreco) > 0
            ? ` · +${formatarPrecoPadaria(i.decoracaoPreco)}`
            : ""
        }`
      : null,
    i.cobertura,
    i.recheio,
    i.obsItem,
  ].filter(Boolean);
}

function previewItens(itens = []) {
  if (!itens.length) return "Sem itens";
  const primeiros = itens
    .slice(0, 2)
    .map((i) => `${qtdItem(i)} ${i.nome}`)
    .join(" · ");
  const extra = itens.length > 2 ? ` · +${itens.length - 2}` : "";
  return `${primeiros}${extra}`;
}

const IDLE_TOPO_MS = 20000;

function PkProdColLista({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let timer = null;
    let emUso = false;

    const limpar = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const voltarAoTopo = () => {
      if (emUso || el.scrollTop <= 1) return;
      el.scrollTo({ top: 0, behavior: "smooth" });
    };

    const agendar = () => {
      limpar();
      if (emUso || el.scrollTop <= 1) return;
      timer = window.setTimeout(voltarAoTopo, IDLE_TOPO_MS);
    };

    const pausar = () => {
      emUso = true;
      limpar();
    };

    const soltar = () => {
      if (!emUso) return;
      emUso = false;
      agendar();
    };

    el.addEventListener("scroll", agendar, { passive: true });
    el.addEventListener("pointerdown", pausar);
    el.addEventListener("wheel", agendar, { passive: true });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);

    return () => {
      limpar();
      el.removeEventListener("scroll", agendar);
      el.removeEventListener("pointerdown", pausar);
      el.removeEventListener("wheel", agendar);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, []);

  return (
    <div ref={ref} className="pk-prod__col-lista">
      {children}
    </div>
  );
}

function loadSeenSet(storageKey, dia) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const data = JSON.parse(raw);
    if (data?.dia !== dia || !Array.isArray(data.ids)) return new Set();
    return new Set(data.ids.map(String));
  } catch {
    return new Set();
  }
}

function saveSeenSet(storageKey, dia, set) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ dia, ids: [...set] })
    );
  } catch {
    /* ignore */
  }
}

function loadSeenNovos(dia) {
  return loadSeenSet(SEEN_NOVOS_KEY, dia);
}

function saveSeenNovos(dia, set) {
  saveSeenSet(SEEN_NOVOS_KEY, dia, set);
}

function loadSeenCancelados(dia) {
  return loadSeenSet(SEEN_CANCEL_KEY, dia);
}

function saveSeenCancelados(dia, set) {
  saveSeenSet(SEEN_CANCEL_KEY, dia, set);
}

export default function PadariaProducaoPage() {
  const [session, setSession] = useState(() => loadPadariaSession());
  const [data, setData] = useState(hojeISO());
  const [pedidos, setPedidos] = useState([]);
  const [resumo, setResumo] = useState({ novo: 0, emProducao: 0, pronto: 0 });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [acaoId, setAcaoId] = useState(null);
  const [popupFila, setPopupFila] = useState([]);
  const [cancelFila, setCancelFila] = useState([]);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const [somAtivo, setSomAtivo] = useState(() => audioPadariaLiberado());
  const [ordenacao, setOrdenacao] = useState(() => loadOrdenacao());
  const [confirmStatus, setConfirmStatus] = useState(null);
  const [pedidoAbertoId, setPedidoAbertoId] = useState(null);
  const [fotoLightbox, setFotoLightbox] = useState(false);

  const seeded = useRef(false);
  const seededCancel = useRef(false);
  const pollBusy = useRef(false);
  const popupTimer = useRef(null);
  const popupTick = useRef(null);
  const cancelSoundTimer = useRef(null);

  const podeAcessar =
    session?.usuario && ["padaria", "gestor"].includes(session.usuario.papel);

  const popupAtual = popupFila[0] || null;
  const cancelAtual = cancelFila[0] || null;
  const pedidoAberto =
    pedidoAbertoId != null
      ? pedidos.find((p) => p.id === pedidoAbertoId) || null
      : null;

  const fecharPopupAtual = useCallback(() => {
    if (popupTimer.current) {
      window.clearTimeout(popupTimer.current);
      popupTimer.current = null;
    }
    if (popupTick.current) {
      window.clearInterval(popupTick.current);
      popupTick.current = null;
    }
    setSegundosRestantes(0);
    setPopupFila((prev) => prev.slice(1));
  }, []);

  const fecharCancelAtual = useCallback(() => {
    if (cancelSoundTimer.current) {
      window.clearInterval(cancelSoundTimer.current);
      cancelSoundTimer.current = null;
    }
    setCancelFila((prev) => prev.slice(1));
  }, []);

  const enfileirarNovos = useCallback((lista) => {
    const dia = hojeISO();
    const seen = loadSeenNovos(dia);
    const candidatos = (lista || []).filter((p) => p.status === "novo");

    if (!seeded.current) {
      for (const p of candidatos) seen.add(String(p.id));
      saveSeenNovos(dia, seen);
      seeded.current = true;
      return;
    }

    const chegando = [];
    for (const p of candidatos) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      chegando.push(p);
    }
    saveSeenNovos(dia, seen);
    if (!chegando.length) return;

    setPopupFila((prev) => {
      const ids = new Set(prev.map((p) => String(p.id)));
      const add = chegando.filter((p) => !ids.has(String(p.id)));
      return add.length ? [...prev, ...add] : prev;
    });
    tocarAlertaSonoro();
    for (const p of chegando) {
      notificarSistema({
        titulo: "Novo pedido na padaria",
        corpo: `${p.codigoPublico} · ${p.clienteNome} · retirada ${String(p.horaRetirada || "").slice(0, 5)}`,
        tag: `novo-${p.id}`,
      });
    }
  }, []);

  const enfileirarCancelados = useCallback((lista) => {
    const dia = hojeISO();
    const seen = loadSeenCancelados(dia);
    const candidatos = lista || [];

    if (!seededCancel.current) {
      for (const p of candidatos) seen.add(String(p.id));
      saveSeenCancelados(dia, seen);
      seededCancel.current = true;
      return;
    }

    const chegando = [];
    for (const p of candidatos) {
      const id = String(p.id);
      if (seen.has(id)) continue;
      seen.add(id);
      chegando.push(p);
    }
    saveSeenCancelados(dia, seen);
    if (!chegando.length) return;

    setCancelFila((prev) => {
      const ids = new Set(prev.map((x) => String(x.id)));
      const add = chegando.filter((x) => !ids.has(String(x.id)));
      return add.length ? [...prev, ...add] : prev;
    });
    tocarAlertaCancelamento();
    for (const p of chegando) {
      notificarSistema({
        titulo: "Pedido cancelado",
        corpo: `${p.codigoPublico} · ${p.clienteNome} — pare a produção`,
        tag: `cancel-${p.id}`,
      });
    }
  }, []);

  const carregar = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setErro("");
      }
      try {
        const res = await fetchPadaria(`/producao?data=${data}`);
        const lista = res.pedidos || [];
        setPedidos(lista);
        setResumo(res.resumo || { novo: 0, emProducao: 0, pronto: 0 });
        enfileirarNovos(lista);
        enfileirarCancelados(res.cancelados || []);
      } catch (err) {
        if (err.code === "UNAUTHORIZED") {
          clearPadariaSession();
          setSession(null);
        }
        if (!silent) setErro(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [data, enfileirarNovos, enfileirarCancelados]
  );

  useEffect(() => {
    if (!podeAcessar) return undefined;
    pedirPermissaoNotificacao();
    seeded.current = false;
    seededCancel.current = false;
    const offAudio = onAudioPadariaChange(setSomAtivo);
    const unlock = () => {
      desbloquearAudioPadaria();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    carregar();
    const tick = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        await carregar({ silent: true });
      } finally {
        pollBusy.current = false;
      }
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") {
        desbloquearAudioPadaria();
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      offAudio();
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [podeAcessar, carregar]);

  /* Auto-fecha o popup de NOVO em 40s (cancelamento NÃO auto-fecha) */
  useEffect(() => {
    if (!popupAtual || cancelAtual) return undefined;

    setSegundosRestantes(Math.ceil(POPUP_MS / 1000));
    if (popupTimer.current) window.clearTimeout(popupTimer.current);
    if (popupTick.current) window.clearInterval(popupTick.current);

    popupTimer.current = window.setTimeout(() => {
      fecharPopupAtual();
    }, POPUP_MS);

    popupTick.current = window.setInterval(() => {
      setSegundosRestantes((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => {
      if (popupTimer.current) {
        window.clearTimeout(popupTimer.current);
        popupTimer.current = null;
      }
      if (popupTick.current) {
        window.clearInterval(popupTick.current);
        popupTick.current = null;
      }
    };
  }, [popupAtual?.id, cancelAtual, fecharPopupAtual]);

  /* Alarme repetido enquanto o cancelamento estiver na tela */
  useEffect(() => {
    if (!cancelAtual) {
      if (cancelSoundTimer.current) {
        window.clearInterval(cancelSoundTimer.current);
        cancelSoundTimer.current = null;
      }
      return undefined;
    }
    const tocar = async () => {
      await desbloquearAudioPadaria();
      tocarAlertaCancelamento();
    };
    tocar();
    cancelSoundTimer.current = window.setInterval(() => {
      tocar();
    }, CANCEL_SOUND_MS);
    return () => {
      if (cancelSoundTimer.current) {
        window.clearInterval(cancelSoundTimer.current);
        cancelSoundTimer.current = null;
      }
    };
  }, [cancelAtual?.id]);

  useEffect(() => {
    setPedidoAbertoId(null);
  }, [data]);

  useEffect(() => {
    const bloquear =
      popupAtual ||
      cancelAtual ||
      pedidoAberto ||
      confirmStatus ||
      fotoLightbox;
    if (!bloquear) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (cancelAtual) return;
      if (fotoLightbox) return;
      if (confirmStatus && !acaoId) {
        setConfirmStatus(null);
        return;
      }
      if (pedidoAbertoId != null) {
        setPedidoAbertoId(null);
        return;
      }
      if (popupAtual) fecharPopupAtual();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [
    popupAtual,
    cancelAtual,
    pedidoAberto,
    confirmStatus,
    fotoLightbox,
    acaoId,
    pedidoAbertoId,
    fecharPopupAtual,
  ]);

  async function mudarStatus(id, status) {
    if (acaoId) return;
    setAcaoId(id);
    setErro("");
    setMsg("");
    try {
      const deStatus = confirmStatus?.pedido?.status;
      await fetchPadaria(`/pedidos/${id}/status`, {
        method: "PATCH",
        body: { status },
      });
      let mensagem = "Status atualizado.";
      if (status === "pronto") mensagem = "Pedido marcado como pronto.";
      else if (status === "novo") mensagem = "Pedido voltou para Novos.";
      else if (status === "em_producao") {
        mensagem =
          deStatus === "pronto"
            ? "Pedido voltou para Em produção. Atendente será avisado."
            : "Pedido iniciado.";
      }
      setMsg(mensagem);
      setConfirmStatus(null);
      if (popupAtual?.id === id) fecharPopupAtual();
      await carregar({ silent: true });
    } catch (err) {
      setErro(err.message);
    } finally {
      setAcaoId(null);
    }
  }

  function pedirConfirmacaoStatus(pedido, statusDestino) {
    if (!pedido || acaoId) return;
    setConfirmStatus({
      pedido,
      de: pedido.status,
      para: statusDestino,
    });
  }

  if (!session || !podeAcessar) {
    return (
      <PadariaLoginPage
        titulo="Produção da padaria"
        subtitulo="Acompanhe a fila e avance os pedidos."
        papeisOk={["padaria", "gestor"]}
        onLogin={setSession}
      />
    );
  }

  const colunas = [
    {
      id: "novo",
      titulo: "Novos",
      count: resumo.novo,
      items: ordenarPedidos(
        pedidos.filter((p) => p.status === "novo"),
        ordenacao
      ),
      acao: (p) => (
        <button
          type="button"
          className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
          disabled={acaoId === p.id}
          onClick={() => pedirConfirmacaoStatus(p, "em_producao")}
        >
          Iniciar produção
        </button>
      ),
    },
    {
      id: "em_producao",
      titulo: "Em produção",
      count: resumo.emProducao,
      items: ordenarPedidos(
        pedidos.filter((p) => p.status === "em_producao"),
        ordenacao
      ),
      acao: (p) => (
        <div className="pk-prod__acoes-col">
          <button
            type="button"
            className="padaria-btn padaria-btn--amber padaria-btn--lg padaria-btn--block"
            disabled={acaoId === p.id}
            onClick={() => pedirConfirmacaoStatus(p, "pronto")}
          >
            Marcar como pronto
          </button>
        </div>
      ),
    },
    {
      id: "pronto",
      titulo: "Prontos",
      count: resumo.pronto,
      items: ordenarPedidos(
        pedidos.filter((p) => p.status === "pronto"),
        ordenacao
      ),
      acao: (p) => (
        <button
          type="button"
          className="padaria-btn padaria-btn--ghost padaria-btn--lg padaria-btn--block"
          disabled={acaoId === p.id}
          onClick={() => pedirConfirmacaoStatus(p, "em_producao")}
        >
          Voltar para Em produção
        </button>
      ),
    },
  ];

  return (
    <div className="padaria-app pk-prod">
      <div className="pk-prod__chrome">
      <header className="pk-prod__top">
        <div>
          <h1>Produção</h1>
          <p className="pk-prod__user">
            {session.usuario.nome}
            {loading ? " · atualizando…" : ""}
          </p>
        </div>
        <div className="pk-prod__menu">
          <a
            className="padaria-btn padaria-btn--secondary padaria-btn--sm"
            href="#/padaria?from=producao"
          >
            <BookOpen size={14} strokeWidth={2} /> Catálogo
          </a>
          <label className="pk-prod__orden">
            <span>Ordenar</span>
            <select
              value={ordenacao}
              onChange={(e) => {
                const v = e.target.value;
                setOrdenacao(v);
                try {
                  localStorage.setItem(ORDEN_KEY, v);
                } catch {
                  /* ignore */
                }
              }}
              aria-label="Ordenar pedidos nas colunas"
            >
              {OPCOES_ORDEN.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <input
            type="date"
            className="pk-prod__date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            aria-label="Data da produção"
          />
          <button
            type="button"
            className="padaria-btn padaria-btn--ghost"
            onClick={() => carregar()}
            aria-label="Atualizar"
          >
            <RefreshCw size={16} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="padaria-btn padaria-btn--ghost"
            onClick={() => {
              clearPadariaSession();
              setSession(null);
            }}
            aria-label="Sair"
          >
            <LogOut size={16} strokeWidth={2} />
          </button>
        </div>
      </header>

      {erro && <p className="padaria-alert">{erro}</p>}
      {msg && <p className="padaria-alert padaria-alert--ok">{msg}</p>}

      {!somAtivo && (
        <button
          type="button"
          className="pk-prod__som"
          onClick={async () => {
            const ok = await desbloquearAudioPadaria();
            if (ok) tocarAlertaSonoro();
          }}
        >
          🔊 Toque aqui para ativar o som dos alertas
        </button>
      )}
      </div>

      <div className="pk-prod__kanban">
        {colunas.map((col) => (
          <section key={col.id} className="pk-prod__col">
            <h2>
              {col.titulo}
              <span className="pk-prod__count">{col.count}</span>
            </h2>
            <PkProdColLista>
            {col.items.map((p) => (
              <article
                key={p.id}
                className={`pk-prod__card pk-prod__card--compact${
                  p.atrasado
                    ? " pk-prod__card--atrasado"
                    : p.urgente
                      ? " pk-prod__card--urgente"
                      : ""
                }${p.status === "pronto" ? " pk-prod__card--pronto" : ""}${
                  pedidoAbertoId === p.id ? " pk-prod__card--aberto" : ""
                }`}
              >
                <button
                  type="button"
                  className="pk-prod__card-hit"
                  onClick={() => setPedidoAbertoId(p.id)}
                  aria-label={`${p.codigoPublico}, ${p.clienteNome}, retirada ${p.horaRetirada}. Abrir itens e fotos.`}
                >
                  <div className="pk-prod__card-top">
                    <div className="pk-prod__hora">{p.horaRetirada}</div>
                    <div className="pk-prod__card-meta">
                      <PadariaFotosBadge qtd={p.fotos?.length} />
                      {(p.atrasado || p.urgente) && (
                        <span
                          className={`pk-prod__badge ${
                            p.atrasado
                              ? "pk-prod__badge--atrasado"
                              : "pk-prod__badge--urgente"
                          }`}
                        >
                          {labelTempo(p.minutosParaRetirada)}
                        </span>
                      )}
                      <ChevronRight
                        className="pk-prod__abrir-ico"
                        size={18}
                        strokeWidth={2.2}
                        aria-hidden
                      />
                    </div>
                  </div>
                  <div className="pk-prod__codigo">{p.codigoPublico}</div>
                  <div className="pk-prod__cliente">{p.clienteNome}</div>
                  <p className="pk-prod__preview">
                    {p.itens?.length || 0}{" "}
                    {(p.itens?.length || 0) === 1 ? "item" : "itens"}
                    {p.observacao ? " · obs" : ""}
                    {" · "}
                    {previewItens(p.itens)}
                  </p>
                  <PadariaFotosStrip fotos={p.fotos} max={3} />
                </button>
                <div className="pk-prod__card-acoes">
                  {col.acao?.(p)}
                </div>
              </article>
            ))}
            {col.items.length === 0 && (
              <p className="pk-prod__empty">Nenhum pedido</p>
            )}
            </PkProdColLista>
          </section>
        ))}
      </div>

      {pedidoAberto && (
        <div
          className="padaria-modal pk-prod-detalhe"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prod-detalhe-titulo"
        >
          <div
            className="padaria-modal__backdrop"
            onClick={() => !fotoLightbox && setPedidoAbertoId(null)}
          />
          <div className="padaria-modal__panel pk-prod-detalhe__panel">
            <div className="padaria-modal__head">
              <div>
                <p className="pk-prod-detalhe__eyebrow">Detalhe da produção</p>
                <h2 id="prod-detalhe-titulo">{pedidoAberto.codigoPublico}</h2>
              </div>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={() => setPedidoAbertoId(null)}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <div className="pk-prod-detalhe__resumo">
                <p className="pk-prod-detalhe__hora">{pedidoAberto.horaRetirada}</p>
                <div>
                  <p className="pk-prod-detalhe__cliente">
                    {pedidoAberto.clienteNome}
                  </p>
                  <p className="pk-prod-detalhe__meta">
                    Retirada{" "}
                    {formatDateTime(
                      pedidoAberto.dataRetirada,
                      pedidoAberto.horaRetirada
                    )}
                    {pedidoAberto.clienteTelefone
                      ? ` · ${formatPhone(pedidoAberto.clienteTelefone)}`
                      : ""}
                  </p>
                </div>
                {(pedidoAberto.atrasado || pedidoAberto.urgente) && (
                  <span
                    className={`pk-prod__badge ${
                      pedidoAberto.atrasado
                        ? "pk-prod__badge--atrasado"
                        : "pk-prod__badge--urgente"
                    }`}
                  >
                    {labelTempo(pedidoAberto.minutosParaRetirada)}
                  </span>
                )}
              </div>

              <h3 className="pk-prod-detalhe__bloco-titulo">Itens</h3>
              <ul className="pk-prod-detalhe__itens">
                {(pedidoAberto.itens || []).map((i) => {
                  const extras = extrasItem(i);
                  const deco = extras.find((x) => String(x).startsWith("Deco:"));
                  const resto = extras.filter((x) => !String(x).startsWith("Deco:"));
                  return (
                    <li key={i.id || `${i.produtoCodigo}-${i.nome}`}>
                      <strong>
                        {qtdItem(i)} {i.nome}
                      </strong>
                      {deco ? <span>{deco}</span> : null}
                      {resto.length ? <span>{resto.join(" · ")}</span> : null}
                    </li>
                  );
                })}
              </ul>

              {pedidoAberto.observacao ? (
                <p className="pk-prod-detalhe__obs">
                  <strong>Obs.:</strong> {pedidoAberto.observacao}
                </p>
              ) : null}

              <PadariaFotosGaleria
                fotos={pedidoAberto.fotos}
                onLightboxChange={setFotoLightbox}
              />
            </div>
            <div className="padaria-modal__foot pk-prod-detalhe__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                onClick={() =>
                  imprimirPedidoPadaria(pedidoAberto).catch((err) =>
                    setErro(err.message || "Falha ao imprimir")
                  )
                }
              >
                <Printer size={14} strokeWidth={2} /> Cupom
              </button>
              {pedidoAberto.status === "novo" ? (
                <button
                  type="button"
                  className="padaria-btn padaria-btn--primary"
                  disabled={acaoId === pedidoAberto.id}
                  onClick={() =>
                    pedirConfirmacaoStatus(pedidoAberto, "em_producao")
                  }
                >
                  Iniciar produção
                </button>
              ) : null}
              {pedidoAberto.status === "em_producao" ? (
                <>
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--amber"
                    disabled={acaoId === pedidoAberto.id}
                    onClick={() => pedirConfirmacaoStatus(pedidoAberto, "pronto")}
                  >
                    Marcar como pronto
                  </button>
                  <button
                    type="button"
                    className="padaria-btn padaria-btn--ghost"
                    disabled={acaoId === pedidoAberto.id}
                    onClick={() => pedirConfirmacaoStatus(pedidoAberto, "novo")}
                  >
                    Voltar para Novos
                  </button>
                </>
              ) : null}
              {pedidoAberto.status === "pronto" ? (
                <button
                  type="button"
                  className="padaria-btn padaria-btn--ghost"
                  disabled={acaoId === pedidoAberto.id}
                  onClick={() =>
                    pedirConfirmacaoStatus(pedidoAberto, "em_producao")
                  }
                >
                  Voltar para Em produção
                </button>
              ) : null}
              <button
                type="button"
                className="padaria-btn padaria-btn--secondary"
                onClick={() => setPedidoAbertoId(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelAtual && (
        <div
          className="padaria-modal pk-cancel-popup"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="prod-cancel-titulo"
        >
          <div className="padaria-modal__backdrop pk-cancel-popup__backdrop" />
          <div className="pk-cancel-popup__flash" aria-hidden />
          <div className="padaria-modal__panel pk-cancel-popup__panel">
            <div className="pk-cancel-popup__cabecalho">
              <div className="pk-cancel-popup__icone" aria-hidden>
                <AlertTriangle size={34} strokeWidth={2.4} />
              </div>
              <div>
                <p className="pk-cancel-popup__eyebrow">Atenção — pare a produção</p>
                <h2 id="prod-cancel-titulo">Pedido cancelado</h2>
              </div>
            </div>

            <div className="pk-cancel-popup__corpo">
              <p className="pk-cancel-popup__codigo">{cancelAtual.codigoPublico}</p>
              <p className="pk-cancel-popup__cliente">{cancelAtual.clienteNome}</p>
              <div className="pk-cancel-popup__chips">
                <span>
                  Retirada{" "}
                  {formatDateTime(
                    cancelAtual.dataRetirada,
                    cancelAtual.horaRetirada
                  )}
                </span>
                {cancelAtual.motivoCancelamentoLabel ? (
                  <span>Motivo: {cancelAtual.motivoCancelamentoLabel}</span>
                ) : null}
                {cancelAtual.canceladoPorNome ? (
                  <span>Por: {cancelAtual.canceladoPorNome}</span>
                ) : null}
              </div>

              <div className="pk-cancel-popup__bloco">
                <h3>Itens — não produzir / descartar</h3>
                {(cancelAtual.itens || []).length === 0 ? (
                  <p className="pk-cancel-popup__vazio">Sem itens listados.</p>
                ) : (
                  <ul className="pk-cancel-popup__itens">
                    {(cancelAtual.itens || []).map((i) => (
                      <li key={i.id || `${i.produtoCodigo}-${i.nome}`}>
                        <span className="pk-cancel-popup__qtd">
                          {i.quantidade}
                          {String(i.unidade || "").toUpperCase() === "KG"
                            ? " kg"
                            : "×"}
                        </span>
                        <strong>{i.nome}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="pk-cancel-popup__aviso">
                Este aviso <strong>não fecha sozinho</strong>. Confirme na
                produção e toque em “Entendi” para continuar.
                {cancelFila.length > 1
                  ? ` · +${cancelFila.length - 1} cancelamento(s) na fila`
                  : ""}
              </p>
            </div>

            <div className="pk-cancel-popup__acoes">
              {!somAtivo && (
                <button
                  type="button"
                  className="padaria-btn padaria-btn--secondary padaria-btn--lg"
                  onClick={async () => {
                    const ok = await desbloquearAudioPadaria();
                    if (ok) tocarAlertaCancelamento();
                  }}
                >
                  Ativar som agora
                </button>
              )}
              <button
                type="button"
                className="padaria-btn padaria-btn--danger padaria-btn--lg pk-cancel-popup__btn"
                onClick={fecharCancelAtual}
              >
                Entendi — fechar aviso
              </button>
            </div>
          </div>
        </div>
      )}

      {popupAtual && !cancelAtual && (
        <div
          className="padaria-modal pk-alerta-popup pk-alerta-popup--novo"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="prod-novo-titulo"
        >
          <div className="padaria-modal__backdrop pk-alerta-popup__backdrop" />
          <div className="padaria-modal__panel pk-alerta-popup__panel pk-prod-popup">
            <button
              type="button"
              className="pk-prod-popup__fechar"
              onClick={fecharPopupAtual}
              aria-label="Fechar aviso"
            >
              <X size={18} strokeWidth={2} />
            </button>

            <div className="pk-prod-popup__cabecalho">
              <div className="pk-prod-popup__icone" aria-hidden>
                <Bell size={28} strokeWidth={2.2} />
              </div>
              <div>
                <p className="pk-prod-popup__eyebrow">Produção</p>
                <h2 id="prod-novo-titulo">Novo pedido</h2>
              </div>
            </div>

            <div className="pk-prod-popup__corpo">
              <div className="pk-prod-popup__resumo">
                <p className="pk-prod-popup__codigo">{popupAtual.codigoPublico}</p>
                <p className="pk-prod-popup__cliente">{popupAtual.clienteNome}</p>
                <div className="pk-prod-popup__chips">
                  <span>
                    Retirada{" "}
                    {formatDateTime(
                      popupAtual.dataRetirada,
                      popupAtual.horaRetirada
                    )}
                  </span>
                  {popupAtual.clienteTelefone ? (
                    <span>{formatPhone(popupAtual.clienteTelefone)}</span>
                  ) : null}
                </div>
              </div>

              <div className="pk-prod-popup__bloco">
                <h3>Itens do pedido</h3>
                {(popupAtual.itens || []).length === 0 ? (
                  <p className="pk-prod-popup__vazio">Nenhum item listado.</p>
                ) : (
                  <ul className="pk-prod-popup__itens">
                    {(popupAtual.itens || []).map((i) => (
                      <li key={i.id || `${i.produtoCodigo}-${i.nome}`}>
                        <span className="pk-prod-popup__qtd">
                          {i.quantidade}
                          {String(i.unidade || "").toUpperCase() === "KG"
                            ? " kg"
                            : "×"}
                        </span>
                        <div className="pk-prod-popup__item-txt">
                          <strong>{i.nome}</strong>
                          {(i.decoracaoNome ||
                            i.cobertura ||
                            i.recheio ||
                            i.obsItem) && (
                            <span>
                              {[
                                i.decoracaoNome
                                  ? `Deco: ${i.decoracaoNome}${
                                      i.decoracaoCodigo
                                        ? ` (${i.decoracaoCodigo})`
                                        : ""
                                    }`
                                  : null,
                                i.cobertura,
                                i.recheio,
                                i.obsItem,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {popupAtual.observacao ? (
                <p className="pk-prod-popup__obs">
                  <strong>Obs.:</strong> {popupAtual.observacao}
                </p>
              ) : null}

              <PadariaFotosGaleria
                fotos={popupAtual.fotos}
                titulo="Fotos de referência"
                onLightboxChange={setFotoLightbox}
              />

              <div className="pk-prod-popup__timer">
                <p>
                  Fecha automaticamente em <strong>{segundosRestantes}s</strong>
                  {popupFila.length > 1
                    ? ` · +${popupFila.length - 1} na fila`
                    : ""}
                </p>
                <div
                  className="pk-prod-popup__barra"
                  aria-hidden
                  style={{
                    ["--pct"]: `${Math.max(
                      0,
                      (segundosRestantes / (POPUP_MS / 1000)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div className="pk-prod-popup__acoes">
              <button
                type="button"
                className="padaria-btn padaria-btn--secondary"
                onClick={fecharPopupAtual}
              >
                Fechar
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--primary padaria-btn--lg"
                disabled={acaoId === popupAtual.id}
                onClick={() => pedirConfirmacaoStatus(popupAtual, "em_producao")}
              >
                {acaoId === popupAtual.id ? "…" : "Iniciar produção"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmStatus && (
        <div
          className="padaria-modal pk-confirm-status"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-status-titulo"
        >
          <div
            className="padaria-modal__backdrop"
            onClick={() => !acaoId && setConfirmStatus(null)}
          />
          <div className="padaria-modal__panel pk-confirm-status__panel">
            <div className="padaria-modal__head">
              <h2 id="confirm-status-titulo">Confirmar alteração</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                disabled={!!acaoId}
                onClick={() => setConfirmStatus(null)}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              <p className="pk-confirm-status__codigo">
                {confirmStatus.pedido.codigoPublico}
              </p>
              <p className="pk-confirm-status__cliente">
                {confirmStatus.pedido.clienteNome}
              </p>
              <p className="pk-confirm-status__fluxo">
                <span>{STATUS_PEDIDO[confirmStatus.de] || confirmStatus.de}</span>
                <span aria-hidden>→</span>
                <strong>
                  {STATUS_PEDIDO[confirmStatus.para] || confirmStatus.para}
                </strong>
              </p>
              <p className="pk-confirm-status__hint">
                {labelAcaoStatus(confirmStatus.de, confirmStatus.para)}
                {(confirmStatus.de === "pronto" &&
                  confirmStatus.para === "em_producao") ||
                (confirmStatus.de === "em_producao" &&
                  confirmStatus.para === "novo")
                  ? " — o atendente será notificado."
                  : ""}
              </p>
            </div>
            <div className="padaria-modal__foot">
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost"
                disabled={!!acaoId}
                onClick={() => setConfirmStatus(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="padaria-btn padaria-btn--primary"
                disabled={!!acaoId}
                onClick={() =>
                  mudarStatus(confirmStatus.pedido.id, confirmStatus.para)
                }
              >
                {acaoId ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

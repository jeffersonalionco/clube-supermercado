import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  LogOut,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import PadariaLoginPage from "./PadariaLoginPage.jsx";
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
    if (!popupAtual && !cancelAtual) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (cancelAtual) return;
      fecharPopupAtual();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [popupAtual, cancelAtual, fecharPopupAtual]);

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
          <button
            type="button"
            className="padaria-btn padaria-btn--ghost padaria-btn--block"
            disabled={acaoId === p.id}
            onClick={() => pedirConfirmacaoStatus(p, "novo")}
          >
            Voltar para Novos
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

      <div className="pk-prod__kanban">
        {colunas.map((col) => (
          <section key={col.id} className="pk-prod__col">
            <h2>
              {col.titulo}
              <span className="pk-prod__count">{col.count}</span>
            </h2>
            {col.items.map((p) => (
              <article
                key={p.id}
                className={`pk-prod__card${
                  p.atrasado
                    ? " pk-prod__card--atrasado"
                    : p.urgente
                      ? " pk-prod__card--urgente"
                      : ""
                }${p.status === "pronto" ? " pk-prod__card--pronto" : ""}`}
              >
                <div className="pk-prod__hora">{p.horaRetirada}</div>
                <div className="pk-prod__codigo">{p.codigoPublico}</div>
                <div className="pk-prod__cliente">{p.clienteNome}</div>
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
                <ul>
                  {p.itens?.map((i) => (
                    <li key={i.id}>
                      <strong>
                        {i.quantidade}
                        {i.unidade === "KG" ? "kg" : "x"}
                      </strong>{" "}
                      {i.nome}
                      {i.decoracaoNome && (
                        <div className="pk-prod__codigo">
                          Deco: {i.decoracaoNome}
                          {i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""}
                          {Number(i.decoracaoPreco) > 0
                            ? ` · +${formatarPrecoPadaria(i.decoracaoPreco)}`
                            : ""}
                        </div>
                      )}
                      {(i.cobertura || i.recheio || i.obsItem) && (
                        <div className="pk-prod__codigo">
                          {[i.cobertura, i.recheio, i.obsItem]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {p.observacao && (
                  <p className="pk-prod__obs">OBS: {p.observacao}</p>
                )}
                <button
                  type="button"
                  className="padaria-btn padaria-btn--ghost padaria-btn--sm padaria-btn--block"
                  onClick={() =>
                    imprimirPedidoPadaria(p).catch((err) =>
                      setErro(err.message || "Falha ao imprimir")
                    )
                  }
                >
                  <Printer size={14} strokeWidth={2} /> Imprimir cupom
                </button>
                {col.acao?.(p)}
              </article>
            ))}
            {col.items.length === 0 && (
              <p className="pk-prod__empty">Nenhum pedido</p>
            )}
          </section>
        ))}
      </div>

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

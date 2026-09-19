import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Cake, Check, MessageCircle, Search, Store, X } from "lucide-react";
import { formatarPrecoPadaria } from "../../utils/padariaSession.js";
import {
  WHATSAPP_PADARIA_E164,
  linkWhatsAppPadaria,
  montarMensagemPedidoPadaria,
} from "../../utils/whatsappPadaria.js";
import { resolveImagemUrl } from "../../utils/adminSession.js";
import PadariaEmptyState from "../../components/padaria/PadariaEmptyState.jsx";
import PadariaErrorState from "../../components/padaria/PadariaErrorState.jsx";
import PadariaLoadingState from "../../components/padaria/PadariaLoadingState.jsx";
import PadariaDecoracaoCarousel from "../../components/padaria/PadariaDecoracaoCarousel.jsx";
import { lockBodyScroll } from "../../utils/bodyScrollLock.js";
import {
  ensureMetaPixel,
  rastrearInteresseProduto,
  trackFunilEncomenda,
} from "../../lib/metaPixel.js";
import "../../styles/padaria.css";

const IDLE_CATALOGO_MS = 2 * 60 * 1000;

function hashFromProducao() {
  try {
    const q = String(window.location.hash.split("?")[1] || "");
    return new URLSearchParams(q).get("from") === "producao";
  } catch {
    return false;
  }
}

function codigoFromHash() {
  try {
    const q = String(window.location.hash.split("?")[1] || "");
    return String(new URLSearchParams(q).get("codigo") || "").trim();
  } catch {
    return "";
  }
}

function agruparPorCategoria(produtos, categorias) {
  const map = new Map();
  for (const cat of categorias) {
    map.set(cat.id, { ...cat, produtos: [] });
  }
  const sem = {
    id: null,
    nome: "Outros",
    slug: "outros",
    cor: "#64748b",
    produtos: [],
  };
  for (const p of produtos) {
    if (p.categoriaId && map.has(p.categoriaId)) {
      map.get(p.categoriaId).produtos.push(p);
    } else {
      sem.produtos.push(p);
    }
  }
  const grupos = [...map.values()].filter((g) => g.produtos.length > 0);
  if (sem.produtos.length) grupos.push(sem);
  return grupos;
}

export default function PadariaCatalogoPage() {
  const [aba, setAba] = useState("cardapio");
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [decoracoes, setDecoracoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState(null);
  const [decoSelecionada, setDecoSelecionada] = useState(null);
  const [catAtiva, setCatAtiva] = useState("todas");
  const [passoMeta, setPassoMeta] = useState("idle");
  const [whatsappEquipe, setWhatsappEquipe] = useState(WHATSAPP_PADARIA_E164);
  const [modoProducao] = useState(() => hashFromProducao());
  const [idleRestante, setIdleRestante] = useState(() =>
    hashFromProducao() ? Math.ceil(IDLE_CATALOGO_MS / 1000) : 0
  );
  const lastActive = useRef(Date.now());

  const fecharDetalhe = useCallback(() => {
    setDetalhe(null);
    setPassoMeta("idle");
  }, []);

  const voltarProducao = useCallback(() => {
    window.location.hash = "#/padaria/producao";
  }, []);

  useEffect(() => {
    if (!modoProducao) return undefined;
    const marcarAtivo = () => {
      lastActive.current = Date.now();
      setIdleRestante(Math.ceil(IDLE_CATALOGO_MS / 1000));
    };
    const eventos = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"];
    for (const ev of eventos) {
      window.addEventListener(ev, marcarAtivo, { passive: true });
    }
    const id = window.setInterval(() => {
      const falta = IDLE_CATALOGO_MS - (Date.now() - lastActive.current);
      if (falta <= 0) {
        voltarProducao();
        return;
      }
      setIdleRestante(Math.ceil(falta / 1000));
    }, 1000);
    return () => {
      window.clearInterval(id);
      for (const ev of eventos) {
        window.removeEventListener(ev, marcarAtivo);
      }
    };
  }, [modoProducao, voltarProducao]);

  useEffect(() => {
    if (!detalhe) return undefined;
    const unlock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === "Escape") fecharDetalhe();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
    };
  }, [detalhe, fecharDetalhe]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (buscaAtiva) params.set("busca", buscaAtiva);
      if (aba === "decoracoes") {
        const res = await fetch(`/api/padaria/catalogo/decoracoes?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao carregar decorações");
        setDecoracoes(data.decoracoes || []);
      } else {
        const res = await fetch(`/api/padaria/catalogo?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha ao carregar catálogo");
        setProdutos(data.produtos || []);
        setCategorias(data.categorias || []);
        if (data.whatsappEquipe) setWhatsappEquipe(data.whatsappEquipe);
      }
    } catch (err) {
      setErro(err.message);
      setProdutos([]);
      setDecoracoes([]);
    } finally {
      setLoading(false);
    }
  }, [buscaAtiva, aba]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!modoProducao) ensureMetaPixel();
  }, [modoProducao]);

  // Deep link do WhatsApp: #/padaria?codigo=618705
  useEffect(() => {
    if (loading || aba !== "cardapio" || !produtos.length) return;
    const codigo = codigoFromHash();
    if (!codigo) return;
    const p = produtos.find(
      (x) => String(x.codigo) === codigo || String(x.codigoBarras) === codigo
    );
    if (p) {
      setDetalhe(p);
      setDecoSelecionada(null);
      setPassoMeta("idle");
      if (!modoProducao) rastrearInteresseProduto(p);
    }
  }, [loading, aba, produtos, modoProducao]);

  const grupos = useMemo(
    () => agruparPorCategoria(produtos, categorias),
    [produtos, categorias]
  );

  const gruposVisiveis = useMemo(() => {
    if (catAtiva === "todas") return grupos;
    if (catAtiva === "outros") return grupos.filter((g) => g.id == null);
    return grupos.filter((g) => String(g.id) === String(catAtiva));
  }, [grupos, catAtiva]);

  function handleBuscar(e) {
    e.preventDefault();
    setBuscaAtiva(busca.trim());
  }

  function irCategoria(id) {
    setCatAtiva(id);
    if (id === "todas") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const slug =
      id === "outros"
        ? "outros"
        : categorias.find((c) => String(c.id) === String(id))?.slug || id;
    requestAnimationFrame(() => {
      document.getElementById(`pub-${slug}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function abrirProduto(p) {
    setDetalhe(p);
    setDecoSelecionada(null); // padrão: bolo sem decoração
    setPassoMeta("idle");
    if (!modoProducao) rastrearInteresseProduto(p);
  }

  async function abrirDecoracao(deco) {
    setPassoMeta("idle");
    if (deco.global || !deco.produtoCodigo) {
      setDetalhe({
        codigo: null,
        nome: deco.nome,
        preco: deco.preco || 0,
        descricao: deco.descricao || null,
        decoracoes: [deco],
        imagemUrl: deco.imagemUrl || null,
        vendaPorKg: false,
        _somenteDecoracao: true,
      });
      setDecoSelecionada(deco);
      return;
    }
    try {
      const res = await fetch(
        `/api/padaria/catalogo/${encodeURIComponent(deco.produtoCodigo)}`
      );
      const data = await res.json();
      if (res.ok && data.produto) {
        setDetalhe(data.produto);
        const match =
          (data.produto.decoracoes || []).find((d) => d.id === deco.id) || deco;
        setDecoSelecionada(match);
        if (!modoProducao) rastrearInteresseProduto(data.produto);
        return;
      }
    } catch {
      /* fallback abaixo */
    }
    setDetalhe({
      codigo: deco.produtoCodigo,
      nome: deco.produtoNome || "Produto",
      preco: null,
      decoracoes: [deco],
      imagemUrl: null,
    });
    setDecoSelecionada(deco);
    if (!modoProducao && deco.produtoCodigo) {
      rastrearInteresseProduto({
        codigo: deco.produtoCodigo,
        nome: deco.produtoNome,
        preco: null,
      });
    }
  }

  const decoracoesDetalhe = (detalhe?.decoracoes || []).filter(
    (d) => d.ativo !== false
  );

  const podeRastrearCompra =
    !modoProducao &&
    Boolean(detalhe?.codigo) &&
    !detalhe?._somenteDecoracao;

  function mensagemWhatsAppPedido() {
    if (!detalhe) return "";
    return montarMensagemPedidoPadaria({
      nome: detalhe.nome,
      codigo: detalhe.codigo,
      precoLabel:
        detalhe.preco != null
          ? formatarPrecoPadaria(detalhe.preco, detalhe.vendaPorKg)
          : null,
      decoracaoNome: decoSelecionada?.nome || null,
      decoracaoCodigo: decoSelecionada?.codigo || null,
    });
  }

  const linkWhatsAppPedido = detalhe
    ? linkWhatsAppPadaria(mensagemWhatsAppPedido(), whatsappEquipe)
    : "#";

  function handleEncomendarWhatsApp() {
    if (!podeRastrearCompra || !detalhe) return;
    if (passoMeta === "enviando") return;
    setPassoMeta("enviando");
    trackFunilEncomenda(detalhe)
      .catch(() => {})
      .finally(() => setPassoMeta("compra"));
  }

  return (
    <div className="padaria-app padaria-app--catalogo">
      <div className="padaria-shell">
        {modoProducao && (
          <div className="padaria-catalogo-idle">
            <button
              type="button"
              className="padaria-btn padaria-btn--secondary"
              onClick={voltarProducao}
            >
              <ArrowLeft size={16} strokeWidth={2} /> Voltar à produção
            </button>
            <span>
              Sem uso: retorna em{" "}
              <strong>
                {Math.floor(idleRestante / 60)}:
                {String(idleRestante % 60).padStart(2, "0")}
              </strong>
            </span>
          </div>
        )}
        <div className="padaria-topbar">
          <div className="padaria-brandbar">
            <div className="padaria-brandbar__mark">
              <strong>Superama</strong>
              <span>Padaria</span>
            </div>
            <p className="padaria-brandbar__note">
              Encomende e confirme com a padaria no WhatsApp
            </p>
          </div>

          <div className="padaria-tabs" role="tablist" aria-label="Seções do catálogo">
            <button
              type="button"
              role="tab"
              aria-selected={aba === "cardapio"}
              className={`padaria-tabs__btn ${aba === "cardapio" ? "is-active" : ""}`}
              onClick={() => {
                setAba("cardapio");
                setBuscaAtiva("");
                setBusca("");
              }}
            >
              Cardápio
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === "decoracoes"}
              className={`padaria-tabs__btn ${aba === "decoracoes" ? "is-active" : ""}`}
              onClick={() => {
                setAba("decoracoes");
                setBuscaAtiva("");
                setBusca("");
                setCatAtiva("todas");
              }}
            >
              Decorações
            </button>
          </div>
        </div>

        <header className="padaria-intro">
          <h1>Feito sob encomenda</h1>
          <p>
            Escolha o produto e a decoração. Depois confirme no WhatsApp — sem
            a confirmação da equipe o pedido não é feito.
          </p>
        </header>

        {aba === "cardapio" && (
          <nav className="padaria-cats" aria-label="Categorias">
            <button
              type="button"
              className={`padaria-cat-chip ${catAtiva === "todas" ? "is-active" : ""}`}
              style={{ "--chip-color": "var(--pk-primary)" }}
              onClick={() => irCategoria("todas")}
            >
              Todos
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`padaria-cat-chip ${catAtiva === String(c.id) ? "is-active" : ""}`}
                style={{ "--chip-color": c.cor }}
                onClick={() => irCategoria(String(c.id))}
              >
                {c.nome}
              </button>
            ))}
          </nav>
        )}

        <div className="padaria-search-wrap">
          <form className="padaria-search" onSubmit={handleBuscar}>
            <Search
              size={18}
              strokeWidth={2}
              className="padaria-search__icon"
              aria-hidden
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={
                aba === "decoracoes"
                  ? "Código ou nome da decoração"
                  : "Buscar no cardápio"
              }
              aria-label="Buscar no catálogo"
              enterKeyHint="search"
            />
            <button type="submit" className="padaria-btn padaria-btn--primary">
              Buscar
            </button>
          </form>
        </div>

        <div className="padaria-content">
          {erro ? (
            <PadariaErrorState
              title="Não foi possível carregar"
              description={erro}
              onRetry={carregar}
            />
          ) : loading ? (
            <PadariaLoadingState
              label={
                aba === "decoracoes"
                  ? "Carregando decorações…"
                  : "Carregando cardápio…"
              }
            />
          ) : aba === "decoracoes" ? (
            decoracoes.length === 0 ? (
              <PadariaEmptyState
                icon={Cake}
                title="Nenhuma decoração no catálogo"
                description={
                  buscaAtiva
                    ? "Tente outro código ou nome."
                    : "As decorações cadastradas aparecerão aqui."
                }
              />
            ) : (
              <section className="padaria-section">
                <div className="padaria-section__head">
                  <h2>Decorações</h2>
                  <span>
                    {decoracoes.length}{" "}
                    {decoracoes.length === 1 ? "opção" : "opções"}
                  </span>
                </div>
                <PadariaDecoracaoCarousel
                  decoracoes={decoracoes}
                  selecionada={null}
                  onSelect={(d) => {
                    if (d) abrirDecoracao(d);
                  }}
                  permitirSemDecoracao={false}
                  modo="catalogo"
                />
              </section>
            )
          ) : gruposVisiveis.length === 0 ? (
            <PadariaEmptyState
              icon={Cake}
              title="Nenhum produto encontrado"
              description={
                buscaAtiva
                  ? "Tente outro termo de busca."
                  : "O cardápio será atualizado em breve."
              }
            />
          ) : (
            gruposVisiveis.map((grupo) => (
              <section
                key={grupo.slug || "outros"}
                id={`pub-${grupo.slug || "outros"}`}
                className="padaria-section"
              >
                <div className="padaria-section__head">
                  <h2>{grupo.nome}</h2>
                  <span>
                    {grupo.produtos.length}{" "}
                    {grupo.produtos.length === 1 ? "item" : "itens"}
                  </span>
                </div>
                <div className="padaria-grid">
                  {grupo.produtos.map((p) => {
                    const img = resolveImagemUrl(p.imagemUrl);
                    const qtdDeco = (p.decoracoes || []).length;
                    return (
                      <button
                        key={p.codigo}
                        type="button"
                        className="padaria-tile"
                        onClick={() => abrirProduto(p)}
                      >
                        <div className="padaria-tile__media">
                          {img ? (
                            <img className="padaria-tile__img" src={img} alt="" loading="lazy" />
                          ) : (
                            <div className="padaria-tile__img--ph">
                              <Cake size={26} strokeWidth={1.4} aria-hidden />
                              <span>Sem foto</span>
                            </div>
                          )}
                          <span className="padaria-tile__price-tag">
                            {formatarPrecoPadaria(p.preco, p.vendaPorKg)}
                          </span>
                        </div>
                        <div className="padaria-tile__body">
                          <h3>{p.nome}</h3>
                          {qtdDeco > 0 ? (
                            <p className="padaria-tile__meta">
                              {qtdDeco} {qtdDeco === 1 ? "decoração" : "decorações"}
                            </p>
                          ) : (p.cobertura || p.recheio) ? (
                            <p className="padaria-tile__meta">
                              {[p.cobertura, p.recheio].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="padaria-cta">
          <strong>Como encomendar</strong>
          <p>
            Confirme o pedido no WhatsApp com a equipe da padaria. Só depois
            da confirmação a encomenda é feita.
          </p>
        </aside>

        <footer className="padaria-staff-links">
          <a href="#/padaria/atendente">Atendente</a>
          <span aria-hidden>·</span>
          <a href="#/padaria/producao">Produção</a>
        </footer>
      </div>

      {detalhe && (
        <div
          className="padaria-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pk-detalhe-titulo"
        >
          <div
            className="padaria-modal__backdrop"
            onClick={fecharDetalhe}
          />
          <div className="padaria-modal__panel padaria-modal__panel--catalogo">
            <div className="padaria-modal__grab" aria-hidden />
            <div className="padaria-modal__media-wrap">
              {resolveImagemUrl(detalhe.imagemUrl) ? (
                <img
                  className="padaria-modal__img"
                  src={resolveImagemUrl(detalhe.imagemUrl)}
                  alt=""
                />
              ) : (
                <div className="padaria-modal__img--ph">
                  <Cake size={36} strokeWidth={1.4} aria-hidden />
                  Sem foto
                </div>
              )}
            </div>
            <div className="padaria-modal__head">
              <h2 id="pk-detalhe-titulo">{detalhe.nome}</h2>
              <button
                type="button"
                className="padaria-btn padaria-btn--ghost padaria-btn--sm"
                onClick={fecharDetalhe}
                aria-label="Fechar"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="padaria-modal__body">
              {detalhe._somenteDecoracao ? (
                <>
                  <p className="padaria-tile__meta" style={{ marginTop: 0 }}>
                    Disponível em todos os bolos ativos
                  </p>
                  <p className="padaria-tile__preco" style={{ display: "block" }}>
                    {Number(decoSelecionada?.preco ?? detalhe.preco) > 0
                      ? `+ ${formatarPrecoPadaria(
                          decoSelecionada?.preco ?? detalhe.preco
                        )}`
                      : "Grátis"}
                  </p>
                  {decoSelecionada?.codigo && (
                    <p>
                      Código: <strong>{decoSelecionada.codigo}</strong>
                    </p>
                  )}
                  {(decoSelecionada?.descricao || detalhe.descricao) && (
                    <p>{decoSelecionada?.descricao || detalhe.descricao}</p>
                  )}
                  <p className="padaria-modal__hint">
                    <Store size={14} strokeWidth={2.25} aria-hidden />
                    Mostre o código no balcão. O valor soma com o bolo no pedido.
                  </p>
                </>
              ) : (
                <>
              {detalhe.categoriaNome && (
                <span
                  className="padaria-cat-chip is-active"
                  style={{
                    "--chip-color": detalhe.categoriaCor || "var(--pk-primary)",
                    pointerEvents: "none",
                    width: "fit-content",
                  }}
                >
                  {detalhe.categoriaNome}
                </span>
              )}
              {detalhe.preco != null && (
                <p className="padaria-tile__preco" style={{ display: "block" }}>
                  {formatarPrecoPadaria(detalhe.preco, detalhe.vendaPorKg)}
                </p>
              )}
              {detalhe.descricao ? <p>{detalhe.descricao}</p> : null}
              {(detalhe.cobertura || detalhe.recheio) && (
                <p>
                  {[
                    detalhe.cobertura && `Cobertura: ${detalhe.cobertura}`,
                    detalhe.recheio && `Recheio: ${detalhe.recheio}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              {decoracoesDetalhe.length > 0 && (
                <PadariaDecoracaoCarousel
                  decoracoes={decoracoesDetalhe}
                  selecionada={decoSelecionada}
                  onSelect={setDecoSelecionada}
                  permitirSemDecoracao
                  modo="catalogo"
                />
              )}

              <p className="padaria-modal__hint">
                <Store size={14} strokeWidth={2.25} aria-hidden />
                Confirme no WhatsApp
                {detalhe.codigo ? ` · ${detalhe.codigo}` : ""}
              </p>
                </>
              )}
            </div>
            <div className="padaria-modal__foot">
              {passoMeta === "compra" ? (
                <>
                  <p className="padaria-encomenda-ok">
                    <Check size={16} strokeWidth={2.4} aria-hidden />
                    O pedido só é feito quando a equipe confirmar no WhatsApp.
                    Código <strong>{detalhe.codigo}</strong>
                    {decoSelecionada?.codigo
                      ? ` · deco ${decoSelecionada.codigo}`
                      : ""}
                    .
                  </p>
                  <a
                    className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
                    href={linkWhatsAppPedido}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={18} strokeWidth={2.2} aria-hidden />
                    Falar no WhatsApp
                  </a>
                </>
              ) : podeRastrearCompra ? (
                <a
                  className="padaria-btn padaria-btn--primary padaria-btn--lg padaria-btn--block"
                  href={linkWhatsAppPedido}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleEncomendarWhatsApp}
                >
                  <MessageCircle size={18} strokeWidth={2.2} aria-hidden />
                  {passoMeta === "enviando"
                    ? "Abrindo WhatsApp…"
                    : "Encomendar no WhatsApp"}
                </a>
              ) : null}
              <button
                type="button"
                className={`padaria-btn padaria-btn--lg padaria-btn--block ${
                  passoMeta === "compra" || !podeRastrearCompra
                    ? "padaria-btn--primary"
                    : "padaria-btn--secondary"
                }`}
                onClick={fecharDetalhe}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

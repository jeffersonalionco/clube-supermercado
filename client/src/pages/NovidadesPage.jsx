import { useCallback, useEffect, useState } from "react";
import ClientTabHeader from "../components/ClientTabHeader.jsx";
import EmptyState from "../components/EmptyState.jsx";
import PullToRefresh from "../components/PullToRefresh.jsx";
import { IconNews } from "../components/icons/ClientIcons.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { resolveImagemUrl } from "../utils/imagem.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/novidades.css";

function formatarData(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function NovidadesPage({ tabMode = false, onInicio }) {
  const [novidades, setNovidades] = useState([]);
  const [selecionada, setSelecionada] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setError("");
    try {
      const data = await fetchAutenticado("/api/cliente/novidades");
      setNovidades(data.novidades || []);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
      setNovidades([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirDetalhe(id) {
    try {
      const data = await fetchAutenticado(`/api/cliente/novidades/${id}`);
      setSelecionada(data.novidade);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  if (selecionada) {
    const img = resolveImagemUrl(selecionada.imagemUrl);
    return (
      <div className={`novidades-page${tabMode ? " novidades-page--tab" : ""}`}>
        <div className="novidade-detalhe-bar">
          <button
            type="button"
            className="novidade-detalhe-bar__back"
            onClick={() => setSelecionada(null)}
          >
            ← Voltar
          </button>
        </div>
        <article className="novidade-detalhe">
          {img && (
            <img className="novidade-detalhe__img" src={img} alt="" />
          )}
          <p className="novidade-detalhe__data">{formatarData(selecionada.publicadoEm)}</p>
          <h1 className="novidade-detalhe__titulo">{selecionada.titulo}</h1>
          {selecionada.resumo && (
            <p className="novidade-detalhe__resumo">{selecionada.resumo}</p>
          )}
          <div className="novidade-detalhe__corpo">
            {String(selecionada.corpo || "")
              .split(/\n+/)
              .filter(Boolean)
              .map((par, i) => (
                <p key={i}>{par}</p>
              ))}
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className={`novidades-page${tabMode ? " novidades-page--tab" : ""}`}>
      {tabMode && <ClientTabHeader title="Novidades" onInicio={onInicio} />}

      <PullToRefresh onRefresh={carregar}>
        <main className="novidades-page__main">
          {loading ? (
            <p className="novidades-page__status">Carregando…</p>
          ) : error ? (
            <EmptyState
              title="Não foi possível carregar"
              description={error}
              actionLabel="Tentar de novo"
              onAction={carregar}
            />
          ) : novidades.length === 0 ? (
            <EmptyState
              title="Nenhuma novidade ainda"
              description="Em breve a loja publica avisos e dicas por aqui."
            />
          ) : (
            <ul className="novidades-lista">
              {novidades.map((n) => {
                const img = resolveImagemUrl(n.imagemUrl);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="novidade-card"
                      onClick={() => abrirDetalhe(n.id)}
                    >
                      {img ? (
                        <img className="novidade-card__img" src={img} alt="" loading="lazy" />
                      ) : (
                        <span className="novidade-card__placeholder" aria-hidden>
                          <IconNews size={28} />
                        </span>
                      )}
                      <span className="novidade-card__body">
                        <span className="novidade-card__data">
                          {formatarData(n.publicadoEm)}
                        </span>
                        <strong className="novidade-card__titulo">{n.titulo}</strong>
                        {n.resumo && (
                          <span className="novidade-card__resumo">{n.resumo}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}

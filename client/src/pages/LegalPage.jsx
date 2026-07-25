import { useCallback, useEffect, useState } from "react";
import Logo from "../components/Logo.jsx";
import MetajiCredit from "../components/MetajiCredit.jsx";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { renderizarConteudoLegal } from "../utils/legalContent.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/legal.css";

const LABELS = {
  regulamento: "Regulamento",
  privacidade: "Privacidade",
};

function formatarData(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function ConteudoLegal({ conteudo }) {
  const blocos = renderizarConteudoLegal(conteudo);
  return (
    <div className="legal-body">
      {blocos.map((bloco, i) => {
        if (bloco.tipo === "h2") {
          return (
            <h2 key={i} className="legal-h2">
              {bloco.texto}
            </h2>
          );
        }
        if (bloco.tipo === "ul") {
          return (
            <ul key={i} className="legal-list">
              {bloco.itens.map((item, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: item }} />
              ))}
            </ul>
          );
        }
        return (
          <p
            key={i}
            className="legal-p"
            dangerouslySetInnerHTML={{ __html: bloco.texto }}
          />
        );
      })}
    </div>
  );
}

export default function LegalPage({ slug, onVoltar }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(apiUrl(`/api/legal/${slug}`));
      const { data } = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(mensagemParaUsuario(data.error));
      }

      setDados(data);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const tituloPagina = dados?.titulo || LABELS[slug] || "Documento";

  return (
    <div className="legal-app">
      <header className="legal-header">
        <div className="legal-header__inner">
          <button type="button" className="legal-header__back" onClick={onVoltar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Voltar
          </button>
          <div className="legal-header__brand">
            <Logo variant="header" className="legal-header__logo" />
            <div>
              <p className="legal-header__tag">Clube Superama+</p>
              <h1 className="legal-header__title">{tituloPagina}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="legal-main">
        {loading && (
          <div className="legal-loading" aria-busy="true">
            <span className="legal-loading__spinner" />
            <p>Carregando documento…</p>
          </div>
        )}

        {error && (
          <div className="legal-alert" role="alert">
            <p>{error}</p>
            <button type="button" className="legal-btn" onClick={carregar}>
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && dados && (
          <article className="legal-article">
            {formatarData(dados.atualizadoEm) && (
              <p className="legal-updated">
                Última atualização: {formatarData(dados.atualizadoEm)}
              </p>
            )}
            <ConteudoLegal conteudo={dados.conteudo} />
          </article>
        )}
      </main>
      <MetajiCredit className="metaji-credit--legal" />
    </div>
  );
}

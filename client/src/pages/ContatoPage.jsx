import { useCallback, useEffect, useState } from "react";
import InfoRow from "../components/InfoRow.jsx";
import SubpageLayout from "../components/SubpageLayout.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";

function IconContact() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16v12H4V6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ContatoPage({ onVoltar, onEditar }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [perfil, setPerfil] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAutenticado("/api/cliente/me");
      setPerfil(data?.perfil || null);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onVoltar?.();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [onVoltar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const temContato =
    perfil?.email || perfil?.telefone || perfil?.endereco;

  return (
    <SubpageLayout
      title="Meu contato"
      onVoltar={onVoltar}
      loading={loading}
      error={error}
      onRetry={carregar}
    >
      {perfil && (
        <section className="subpage-card">
          <div className="subpage-card__head">
            <span className="subpage-card__icon subpage-card__icon--contact" aria-hidden>
              <IconContact />
            </span>
            <div>
              <h2 className="subpage-card__title">Formas de contato</h2>
              <p className="subpage-card__sub">
                E-mail, telefone e endereço cadastrados
              </p>
            </div>
          </div>

          {onEditar && (
            <button
              type="button"
              className="home-btn home-btn--primary subpage-card__action"
              onClick={onEditar}
            >
              Atualizar contato
            </button>
          )}

          <div className="subpage-card__body">
            <InfoRow label="E-mail" value={perfil.email} />
            <InfoRow label="Telefone" value={perfil.telefone} />
            <InfoRow label="Endereço" value={perfil.endereco} />
            {!temContato && (
              <p className="home-empty">
                Nenhum contato cadastrado ainda. Use o botão acima para
                atualizar seus dados.
              </p>
            )}
          </div>
        </section>
      )}
    </SubpageLayout>
  );
}

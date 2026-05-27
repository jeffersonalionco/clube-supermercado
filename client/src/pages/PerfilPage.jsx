import { useCallback, useEffect, useState } from "react";
import InfoRow from "../components/InfoRow.jsx";
import SubpageLayout from "../components/SubpageLayout.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PerfilPage({ onVoltar, onEditar }) {
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

  return (
    <SubpageLayout
      title="Meu perfil"
      onVoltar={onVoltar}
      loading={loading}
      error={error}
      onRetry={carregar}
    >
      {perfil && (
        <section className="subpage-card">
          <div className="subpage-card__head">
            <span className="subpage-card__icon" aria-hidden>
              <IconUser />
            </span>
            <div>
              <h2 className="subpage-card__title">Dados pessoais</h2>
              <p className="subpage-card__sub">
                Informações cadastradas no clube
              </p>
            </div>
          </div>

          {onEditar && (
            <button
              type="button"
              className="home-btn home-btn--primary subpage-card__action"
              onClick={onEditar}
            >
              Editar meus dados
            </button>
          )}

          <div className="subpage-card__body">
            <InfoRow label="Nome completo" value={perfil.nome} />
            <InfoRow label="CPF" value={perfil.documento} />
            <InfoRow label="Data de nascimento" value={perfil.dataNascimento} />
            <InfoRow label="Estado civil" value={perfil.estadoCivil} />
            <InfoRow label="Sexo" value={perfil.sexo} />
            {perfil.codigoCliente && (
              <InfoRow label="Número do cliente" value={perfil.codigoCliente} />
            )}
            {perfil.membroDesde && (
              <InfoRow
                label="Cliente desde"
                value={new Date(perfil.membroDesde).toLocaleDateString("pt-BR")}
              />
            )}
            {!perfil.nome &&
              !perfil.documento &&
              !perfil.dataNascimento && (
                <p className="home-empty">Nenhum dado de perfil disponível.</p>
              )}
          </div>
        </section>
      )}
    </SubpageLayout>
  );
}

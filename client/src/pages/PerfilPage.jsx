import { useCallback, useEffect, useState } from "react";
import InfoRow from "../components/InfoRow.jsx";
import SubpageLayout from "../components/SubpageLayout.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/perfil-whatsapp.css";

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
  const [whatsappInfo, setWhatsappInfo] = useState(null);
  const [salvandoWa, setSalvandoWa] = useState(false);
  const [waMsg, setWaMsg] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAutenticado("/api/cliente/me");
      setPerfil(data?.perfil || null);
      setWhatsappInfo(data?.whatsappInfo || data?.perfil?.whatsappInfo || null);
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

  async function alternarWhatsappInfo(liberado) {
    setSalvandoWa(true);
    setWaMsg("");
    try {
      const data = await fetchAutenticado("/api/cliente/whatsapp-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ liberado }),
      });
      setWhatsappInfo(data?.whatsappInfo || null);
      setWaMsg(
        liberado
          ? "Pronto! Este número pode ver mais informações no WhatsApp."
          : "Acesso ampliado no WhatsApp desativado."
      );
    } catch (err) {
      setWaMsg(mensagemParaUsuario(err.message));
    } finally {
      setSalvandoWa(false);
    }
  }

  const liberado = Boolean(whatsappInfo?.liberado);
  const telLabel =
    whatsappInfo?.telefoneCadastro ||
    whatsappInfo?.telefoneConfirmado ||
    perfil?.telefone ||
    null;

  return (
    <SubpageLayout
      title="Meu perfil"
      onVoltar={onVoltar}
      loading={loading}
      error={error}
      onRetry={carregar}
    >
      {perfil && (
        <>
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

          <section className="subpage-card perfil-wa" id="whatsapp-info">
            <div className="subpage-card__head">
              <div>
                <h2 className="subpage-card__title">Informações no WhatsApp</h2>
                <p className="subpage-card__sub">
                  Libere nível e pontos no canal oficial do Superama, só neste
                  celular cadastrado.
                </p>
              </div>
            </div>

            <div className="perfil-wa__body">
              <p className="perfil-wa__aviso">
                Dados básicos (nome, CPF parcial e código) podem aparecer no
                WhatsApp em <strong>Meu Clube</strong>. Nível e pontos só depois
                desta liberação.
              </p>

              {perfil.documento && (
                <p className="perfil-wa__tel">
                  Conta logada: <strong>{perfil.nome}</strong> · CPF{" "}
                  <strong>{perfil.documento}</strong>
                </p>
              )}

              {telLabel ? (
                <p className="perfil-wa__tel">
                  Número do cadastro: <strong>{telLabel}</strong>
                </p>
              ) : (
                <p className="perfil-wa__tel perfil-wa__tel--warn">
                  Cadastre um celular em <strong>Editar meus dados</strong> antes
                  de liberar.
                </p>
              )}

              <label className="perfil-wa__toggle">
                <input
                  type="checkbox"
                  checked={liberado}
                  disabled={
                    salvandoWa || (!liberado && !whatsappInfo?.temTelefoneCadastro)
                  }
                  onChange={(e) => alternarWhatsappInfo(e.target.checked)}
                />
                <span>
                  {liberado
                    ? "Acesso ampliado ativo neste WhatsApp"
                    : "Quero liberar informações do Clube neste WhatsApp"}
                </span>
              </label>

              {waMsg && <p className="perfil-wa__msg">{waMsg}</p>}
            </div>
          </section>
        </>
      )}
    </SubpageLayout>
  );
}

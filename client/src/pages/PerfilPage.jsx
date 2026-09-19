import { useCallback, useEffect, useState } from "react";
import ClientTabHeader from "../components/ClientTabHeader.jsx";
import InfoRow from "../components/InfoRow.jsx";
import SubpageLayout from "../components/SubpageLayout.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import { formatarMoeda } from "../utils/moeda.js";
import "../styles/perfil-whatsapp.css";
import "../styles/perfil-hub.css";

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

function IconWa() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5a8.5 8.5 0 00-7.2 12.9L4 21l4.8-.8A8.5 8.5 0 1012 3.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 9.6c.2-.4.4-.4.6-.4h.5c.2 0 .3.1.4.3l.6 1.4c.1.2 0 .4-.1.5l-.4.5c-.1.1-.1.3 0 .4.4.6 1 1.2 1.6 1.6.2.1.3.1.4 0l.5-.4c.2-.1.4-.1.5 0l1.4.6c.2.1.3.2.3.4v.5c0 .2 0 .4-.4.6-.4.2-.9.3-1.4.2-2.3-.4-4.3-2.2-5-4.4-.2-.6-.1-1.2.2-1.7z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconCredito() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="6"
        width="18"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M7 15h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function iniciaisDoNome(nome) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "C";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function pctUsado(limite, utilizado) {
  if (!limite) return 0;
  return Math.min(100, Math.round((utilizado / limite) * 100));
}

export default function PerfilPage({
  tabMode = false,
  onVoltar,
  onInicio,
  onEditar,
  onLogout,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [perfil, setPerfil] = useState(null);
  const [whatsappInfo, setWhatsappInfo] = useState(null);
  const [crediario, setCrediario] = useState(null);
  const [salvandoWa, setSalvandoWa] = useState(false);
  const [waMsg, setWaMsg] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, cred] = await Promise.all([
        fetchAutenticado("/api/cliente/me"),
        fetchAutenticado("/api/cliente/crediario").catch(() => ({
          crediario: null,
        })),
      ]);
      setPerfil(me?.perfil || null);
      setWhatsappInfo(me?.whatsappInfo || me?.perfil?.whatsappInfo || null);
      setCrediario(cred?.crediario || null);
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

  const primeiroNome = String(perfil?.nome || "")
    .trim()
    .split(/\s+/)[0];

  const pctCred =
    crediario != null
      ? pctUsado(crediario.limiteCredito, crediario.limiteUtilizado)
      : 0;
  const tomCred =
    pctCred >= 90 ? "critico" : pctCred >= 80 ? "alerta" : null;

  const conteudo =
    perfil && (
      <div className="perfil-hub">
        <section className="perfil-hub__hero" aria-label="Resumo da conta">
          <span className="perfil-hub__avatar" aria-hidden>
            {iniciaisDoNome(perfil.nome)}
          </span>
          <div className="perfil-hub__hero-text">
            <p className="perfil-hub__hello">
              {primeiroNome ? `Olá, ${primeiroNome}` : "Sua conta"}
            </p>
            <h2 className="perfil-hub__nome">{perfil.nome || "Cliente"}</h2>
            {perfil.codigoCliente ? (
              <p className="perfil-hub__meta">
                Código do Clube · {perfil.codigoCliente}
              </p>
            ) : null}
          </div>
        </section>

        {crediario ? (
          <section
            className={`subpage-card perfil-cred${
              tomCred ? ` perfil-cred--${tomCred}` : ""
            }`}
            aria-label="Seu crédito"
          >
            <div className="subpage-card__head">
              <span className="subpage-card__icon perfil-cred__icon" aria-hidden>
                <IconCredito />
              </span>
              <div>
                <h2 className="subpage-card__title">
                  Limite para comprar no Superama
                </h2>
                <p className="subpage-card__sub">
                  Saldo do seu crediário no mercado
                </p>
              </div>
            </div>

            <div className="perfil-cred__grid">
              <article className="perfil-cred__kpi perfil-cred__kpi--destaque">
                <span>Disponível</span>
                <strong>{formatarMoeda(crediario.saldoCredito)}</strong>
              </article>
              <article className="perfil-cred__kpi">
                <span>Limite</span>
                <strong>{formatarMoeda(crediario.limiteCredito)}</strong>
              </article>
              <article className="perfil-cred__kpi">
                <span>Utilizado</span>
                <strong>{formatarMoeda(crediario.limiteUtilizado)}</strong>
              </article>
            </div>

            <div className="perfil-cred__barra" aria-hidden>
              <div
                className="perfil-cred__barra-fill"
                style={{ width: `${pctCred}%` }}
              />
            </div>
            <p className="perfil-cred__hint">
              {pctCred}% do limite em uso
              {crediario.limiteUtilizadoDia > 0
                ? ` · hoje ${formatarMoeda(crediario.limiteUtilizadoDia)}`
                : ""}
            </p>
            {tomCred === "critico" ? (
              <p className="perfil-cred__aviso">
                Seu limite está quase no fim. Vale acompanhar o disponível antes
                da próxima compra.
              </p>
            ) : tomCred === "alerta" ? (
              <p className="perfil-cred__aviso">
                Você já usou boa parte do limite. Ainda resta{" "}
                {formatarMoeda(crediario.saldoCredito)} disponível.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="subpage-card">
          <div className="subpage-card__head">
            <span className="subpage-card__icon" aria-hidden>
              <IconUser />
            </span>
            <div>
              <h2 className="subpage-card__title">Dados pessoais</h2>
              <p className="subpage-card__sub">
                Informações cadastradas no Clube
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
            {!perfil.nome && !perfil.documento && !perfil.dataNascimento && (
              <p className="home-empty">Nenhum dado de perfil disponível.</p>
            )}
          </div>
        </section>

        <section className="subpage-card perfil-wa" id="whatsapp-info">
          <div className="subpage-card__head">
            <span className="subpage-card__icon perfil-wa__icon" aria-hidden>
              <IconWa />
            </span>
            <div>
              <h2 className="subpage-card__title">Informações no WhatsApp</h2>
              <p className="subpage-card__sub">
                Libere nível e pontos no canal oficial, só neste celular
                cadastrado
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
                Conta: <strong>{perfil.nome}</strong> · CPF{" "}
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

        {onLogout && tabMode ? (
          <div className="perfil-hub__sair">
            <button
              type="button"
              className="home-btn home-btn--ghost"
              onClick={onLogout}
            >
              Sair da conta
            </button>
          </div>
        ) : null}
      </div>
    );

  if (tabMode) {
    if (loading) {
      return (
        <div className="perfil-app perfil-app--tab">
          <ClientTabHeader title="Perfil" onInicio={onInicio} />
          <main className="perfil-app__main">
            <p className="perfil-app__status">Carregando…</p>
          </main>
        </div>
      );
    }
    if (error) {
      return (
        <div className="perfil-app perfil-app--tab">
          <ClientTabHeader title="Perfil" onInicio={onInicio} />
          <main className="perfil-app__main">
            <p className="perfil-app__status perfil-app__status--err">{error}</p>
            <button
              type="button"
              className="home-btn home-btn--primary"
              onClick={carregar}
            >
              Tentar novamente
            </button>
          </main>
        </div>
      );
    }
    return (
      <div className="perfil-app perfil-app--tab">
        <ClientTabHeader title="Perfil" onInicio={onInicio} />
        <main className="perfil-app__main">{conteudo}</main>
      </div>
    );
  }

  return (
    <SubpageLayout
      title="Meu perfil"
      onVoltar={onVoltar}
      loading={loading}
      error={error}
      onRetry={carregar}
    >
      {conteudo}
    </SubpageLayout>
  );
}

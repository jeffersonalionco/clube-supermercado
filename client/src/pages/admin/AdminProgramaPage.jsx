import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminProgramaPage({ tab, onTabChange, onLogout, admin }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await fetchAdmin("/api/admin/config/programa");
      setConfig(data);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleToggle() {
    if (!config || salvando) return;

    const ligar = !config.pontosHabilitado;
    const msg = ligar
      ? "Habilitar o programa de pontos para os clientes? Pontos passarão a contar apenas a partir de agora."
      : "Desabilitar o programa de pontos? Clientes deixarão de ver pontos e prêmios; apenas o histórico de compras permanece visível.";

    if (!window.confirm(msg)) return;

    setSalvando(true);
    setError("");
    setSuccess("");

    try {
      const data = await fetchAdmin("/api/admin/config/programa", {
        method: "PATCH",
        body: JSON.stringify({ pontosHabilitado: ligar }),
      });
      setConfig(data);
      setSuccess(data.message || "Configuração atualizada.");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSalvando(false);
    }
  }

  const ativo = Boolean(config?.pontosHabilitado);

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      {error && <p className="admin-alert admin-alert--error">{error}</p>}
      {success && <p className="admin-alert admin-alert--success">{success}</p>}

      {loading ? (
        <p className="admin-muted">Carregando configuração…</p>
      ) : (
        <div className="admin-programa">
          <section className="admin-card admin-programa__card">
            <div className="admin-programa__head">
              <div>
                <h2>Programa de pontos</h2>
                <p className="admin-muted">
                  Controla se clientes veem pontos, prêmios e acumulam saldo nas compras.
                </p>
              </div>
              <span
                className={`admin-programa__badge${ativo ? " admin-programa__badge--on" : ""}`}
              >
                {ativo ? "Ativo para clientes" : "Desligado"}
              </span>
            </div>

            <label className="admin-programa__toggle">
              <input
                type="checkbox"
                checked={ativo}
                disabled={salvando}
                onChange={handleToggle}
              />
              <span className="admin-programa__toggle-ui" aria-hidden />
              <span>
                <strong>Programa de pontos ativo para clientes</strong>
                <small>
                  {ativo
                    ? "Clientes veem abas Pontos e Prêmios e acumulam pontos nas compras elegíveis."
                    : "Clientes veem apenas Início e Compras; nenhum ponto é gerado."}
                </small>
              </span>
            </label>

            <dl className="admin-programa__meta">
              <div>
                <dt>Última alteração</dt>
                <dd>{formatarData(config?.atualizadoEm)}</dd>
              </div>
              <div>
                <dt>Alterado por</dt>
                <dd>{config?.atualizadoPor || "—"}</dd>
              </div>
              {config?.pontosHabilitadoEm && (
                <div>
                  <dt>Ativo desde</dt>
                  <dd>{formatarData(config.pontosHabilitadoEm)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="admin-card admin-programa__info">
            <h3>Como funciona</h3>
            <ul>
              <li>
                <strong>Desligado:</strong> o histórico de compras continua disponível; pontos e
                prêmios ficam ocultos e nenhum saldo novo é calculado.
              </li>
              <li>
                <strong>Ao ligar:</strong> a data de ativação é registrada; só compras a partir
                dessa data (e após o cadastro no clube) geram pontos.
              </li>
              <li>
                <strong>Painel interno:</strong> baixa de pontos, brindes e CRM continuam
                acessíveis para preparação e atendimento.
              </li>
            </ul>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

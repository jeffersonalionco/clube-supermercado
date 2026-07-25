import { useCallback, useEffect, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { formatarMoeda } from "../../utils/moeda.js";

const POLL_MS = 3000;

function formatarDataHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function textoProgresso(progresso) {
  if (!progresso) return null;
  const partes = [];
  if (progresso.totalCatalogo > 0) {
    partes.push(
      `${progresso.totalCatalogo.toLocaleString("pt-BR")} produtos analisados`
    );
  }
  if (progresso.candidatos > 0) {
    partes.push(`${progresso.candidatos} candidato(s) com preço 2`);
  }
  if (progresso.confirmados > 0 && progresso.candidatos > 0) {
    partes.push(
      `confirmando ${progresso.confirmados}/${progresso.candidatos} na API`
    );
  } else if (progresso.totalClube > 0) {
    partes.push(
      `${progresso.totalClube} com preço 2 encontrado(s)`
    );
  }
  return partes.length ? partes.join(" · ") : null;
}

export default function AdminClubeDescontosPage({
  tab,
  onTabChange,
  onLogout,
  admin,
}) {
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const pararPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const carregar = useCallback(
    async ({ forcar = false, silencioso = false } = {}) => {
      if (!silencioso) {
        if (forcar) setAtualizando(true);
        else setLoading(true);
      }
      setError("");

      try {
        const params = new URLSearchParams();
        if (buscaAtiva) params.set("busca", buscaAtiva);
        params.set("pagina", String(pagina));
        params.set("limite", "50");
        if (forcar) params.set("atualizar", "1");

        const data = await fetchAdmin(
          `/api/admin/clube-descontos/produtos?${params}`
        );

        if (data.erroSync) {
          setError(mensagemParaUsuario(data.erroSync));
        }

        setDados(data);

        if (data.sincronizando) {
          if (!pollRef.current) {
            pollRef.current = setInterval(() => {
              carregar({ silencioso: true });
            }, POLL_MS);
          }
        } else {
          pararPoll();
        }
      } catch (err) {
        pararPoll();
        if (err.code === "UNAUTHORIZED") {
          clearAdminSession();
          onLogout();
          return;
        }
        setDados(null);
        setError(mensagemParaUsuario(err.message));
      } finally {
        setLoading(false);
        setAtualizando(false);
      }
    },
    [buscaAtiva, pagina, onLogout, pararPoll]
  );

  useEffect(() => {
    carregar();
    return () => pararPoll();
  }, [carregar, pararPoll]);

  function handleBuscar(e) {
    e.preventDefault();
    setPagina(1);
    setBuscaAtiva(busca.trim());
  }

  function handlePagina(nova) {
    if (!dados || nova < 1 || nova > dados.totalPaginas) return;
    setPagina(nova);
  }

  const itens = dados?.itens || [];
  const sincronizando = Boolean(dados?.sincronizando);
  const progressoTexto = textoProgresso(dados?.progresso);

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      {error && <p className="admin-alert admin-alert--error">{error}</p>}

      <section className="admin-card admin-clube-descontos">
        <div className="admin-card__head">
          <div>
            <h2 className="admin-card__title">Clube de descontos</h2>
            <p className="admin-muted">
              Produtos com <strong>preço 2</strong> cadastrado no ERP — estão no
              clube de descontos da loja.
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            onClick={() => carregar({ forcar: true })}
            disabled={sincronizando && atualizando}
          >
            {sincronizando && atualizando ? "Atualizando…" : "Atualizar catálogo"}
          </button>
        </div>

        <div className="admin-clube-descontos__resumo">
          <div className="admin-clube-descontos__stat">
            <span className="admin-clube-descontos__stat-valor">
              {loading && !dados ? "…" : dados?.totalClube ?? 0}
            </span>
            <span className="admin-clube-descontos__stat-label">
              Itens no clube
            </span>
          </div>
          <div className="admin-clube-descontos__stat">
            <span className="admin-clube-descontos__stat-valor">
              {loading && !dados
                ? "…"
                : dados?.totalCatalogo?.toLocaleString("pt-BR") ?? "—"}
            </span>
            <span className="admin-clube-descontos__stat-label">
              {dados?.apenasAtivos === false
                ? "Catálogo consultado"
                : "Produtos ativos consultados"}
            </span>
          </div>
          <div className="admin-clube-descontos__stat admin-clube-descontos__stat--wide">
            <span className="admin-clube-descontos__stat-label">Unidade</span>
            <span className="admin-clube-descontos__stat-meta">
              {dados?.unidade || "—"}
              {dados?.sincronizadoEm && (
                <> · Sincronizado {formatarDataHora(dados.sincronizadoEm)}</>
              )}
            </span>
          </div>
        </div>

        <form className="admin-clube-descontos__busca" onSubmit={handleBuscar}>
          <input
            type="search"
            className="admin-clube-descontos__input"
            placeholder="Buscar por nome, código ou EAN…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            disabled={sincronizando && !itens.length}
          />
          <button
            type="submit"
            className="admin-btn admin-btn--primary admin-btn--sm"
            disabled={sincronizando && !itens.length}
          >
            Buscar
          </button>
          {buscaAtiva && (
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={() => {
                setBusca("");
                setBuscaAtiva("");
                setPagina(1);
              }}
            >
              Limpar
            </button>
          )}
        </form>

        {sincronizando && (
          <div className="admin-clube-descontos__sync" aria-live="polite">
            <span className="home-loading__spinner" aria-hidden />
            <div>
              <p className="admin-clube-descontos__sync-titulo">
                Sincronizando catálogo com o ERP…
              </p>
              <p className="admin-muted">
                {progressoTexto ||
                  "A primeira consulta pode levar cerca de 1 minuto. A página atualiza automaticamente."}
              </p>
            </div>
          </div>
        )}

        {loading && !dados && !sincronizando && (
          <p className="admin-empty">Carregando…</p>
        )}

        {!sincronizando && !loading && dados && itens.length === 0 && (
          <p className="admin-empty">
            {buscaAtiva
              ? "Nenhum item do clube corresponde à busca."
              : "Nenhum produto com preço 2 encontrado nesta unidade."}
          </p>
        )}

        {itens.length > 0 && (
          <>
            <div className="admin-clube-descontos__tabela-wrap">
              <table className="admin-clube-descontos__tabela">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th>EAN</th>
                    <th>Preço 1</th>
                    <th>Preço 2 (clube)</th>
                    <th>Economia</th>
                    <th>Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item) => (
                    <tr key={item.codigo}>
                      <td className="admin-clube-descontos__codigo">{item.codigo}</td>
                      <td>
                        <span className="admin-clube-descontos__nome">
                          {item.descricao || "—"}
                        </span>
                        {item.marca && (
                          <span className="admin-clube-descontos__marca">
                            {item.marca}
                          </span>
                        )}
                      </td>
                      <td className="admin-clube-descontos__ean">
                        {item.codigoBarras || "—"}
                      </td>
                      <td className="admin-clube-descontos__preco admin-clube-descontos__preco--riscado">
                        {formatarMoeda(item.preco1)}
                      </td>
                      <td className="admin-clube-descontos__preco admin-clube-descontos__preco--clube">
                        {formatarMoeda(item.preco2)}
                      </td>
                      <td className="admin-clube-descontos__economia">
                        {item.economia > 0 ? (
                          <>
                            {formatarMoeda(item.economia)}
                            <span className="admin-clube-descontos__pct">
                              −
                              {item.percentualDesconto.toLocaleString("pt-BR", {
                                maximumFractionDigits: 1,
                              })}
                              %
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{item.estoque > 0 ? item.estoque : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {dados.totalPaginas > 1 && (
              <div className="admin-clube-descontos__paginacao">
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={pagina <= 1 || loading}
                  onClick={() => handlePagina(pagina - 1)}
                >
                  Anterior
                </button>
                <span className="admin-muted">
                  Página {dados.pagina} de {dados.totalPaginas}
                  {buscaAtiva && ` · ${dados.total} resultado(s)`}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={pagina >= dados.totalPaginas || loading}
                  onClick={() => handlePagina(pagina + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}

        <p className="admin-clube-descontos__nota admin-muted">
          A varredura usa a lista do ERP (pode atrasar). Cada item do clube é
          confirmado por consulta individual na API para exibir o preço 2
          atual. Cache local: 30 minutos. Use &quot;Atualizar catálogo&quot; após
          alterar preços no RP.
        </p>
      </section>
    </AdminLayout>
  );
}

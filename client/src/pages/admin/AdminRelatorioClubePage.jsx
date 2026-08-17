import { useCallback, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { imprimirHtmlComprovante } from "../../utils/comprovanteResgate.js";

function dataLocalInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function intervaloRapido(tipo) {
  const fim = new Date();
  fim.setHours(12, 0, 0, 0);
  const inicio = new Date(fim);

  if (tipo === "hoje") {
    /* inicio = fim */
  } else if (tipo === "ultimos7") {
    inicio.setDate(inicio.getDate() - 6);
  } else if (tipo === "ultimos30") {
    inicio.setDate(inicio.getDate() - 29);
  } else if (tipo === "mes") {
    inicio.setDate(1);
  } else {
    return { inicio: "", fim: "" };
  }

  return {
    inicio: dataLocalInput(inicio),
    fim: dataLocalInput(fim),
  };
}

const OPCOES_PERIODO = [
  { id: "hoje", label: "Hoje" },
  { id: "ultimos7", label: "Últimos 7 dias" },
  { id: "ultimos30", label: "Últimos 30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "personalizado", label: "Personalizado" },
];

function formatarDataBr(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

function formatarDataHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function montarHtmlRelatorio(relatorio, adminUsuario) {
  const cad = relatorio.cadastros || {};
  const vendas = relatorio.vendas || {};
  const periodo = relatorio.periodo || {};
  const novos = relatorio.novosClientes || [];
  const produtos = relatorio.produtosVendidos || [];

  const linhasClientes = novos.length
    ? novos
        .map(
          (item, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escaparHtml(item.nome)}</td>
            <td>${escaparHtml(formatarCpfCnpj(item.cpf))}</td>
            <td>${escaparHtml(item.clienteCodigo != null ? String(item.clienteCodigo) : "—")}</td>
            <td>${escaparHtml(formatarDataHora(item.cadastradoEm))}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Nenhum cliente cadastrado neste período.</td></tr>`;

  const linhasProdutos = produtos.length
    ? produtos
        .map(
          (item, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escaparHtml(item.descricao)}</td>
            <td>${escaparHtml(item.codigo)}</td>
            <td class="num">${escaparHtml(String(item.quantidade))}</td>
            <td class="num">${escaparHtml(formatarMoeda(item.valorTotal))}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Sem produtos vendidos no período.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório do Clube Superama+</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #12263a; margin: 24px; font-size: 12px; }
    h1 { margin: 0 0 4px; font-size: 20px; color: #1b4fa0; }
    h2 { margin: 22px 0 8px; font-size: 14px; color: #1b4fa0; border-bottom: 1px solid #d7e0ea; padding-bottom: 4px; }
    .meta { color: #5b6b7c; margin-bottom: 16px; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0 8px; }
    .kpi { border: 1px solid #d7e0ea; border-radius: 8px; padding: 10px; }
    .kpi strong { display: block; font-size: 18px; margin-top: 4px; }
    .kpi span { color: #5b6b7c; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #d7e0ea; padding: 6px 8px; text-align: left; }
    th { background: #f3f7fb; font-size: 11px; }
    td.num, th.num { text-align: right; }
    .nota { margin-top: 18px; color: #5b6b7c; font-size: 11px; }
    @media print {
      body { margin: 12mm; }
      .kpis { break-inside: avoid; }
      table { break-inside: auto; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Relatório do Clube Superama+</h1>
  <p class="meta">
    Período: <strong>${escaparHtml(formatarDataBr(periodo.dataInicio))} a ${escaparHtml(formatarDataBr(periodo.dataFim))}</strong>
    (${periodo.dias || "—"} dia(s))<br/>
    Gerado em ${escaparHtml(formatarDataHora(relatorio.geradoEm))}
    ${adminUsuario ? ` · por ${escaparHtml(adminUsuario)}` : ""}
  </p>

  <div class="kpis">
    <div class="kpi"><span>Clientes cadastrados (total)</span><strong>${cad.total ?? 0}</strong></div>
    <div class="kpi"><span>Novos cadastros no período</span><strong>${cad.noPeriodo ?? 0}</strong></div>
    <div class="kpi"><span>Valor vendido (membros)</span><strong>${escaparHtml(formatarMoeda(vendas.valorVendido))}</strong></div>
    <div class="kpi"><span>Cupons de membros</span><strong>${vendas.quantidadeCupons ?? 0}</strong></div>
    <div class="kpi"><span>Produtos distintos</span><strong>${vendas.quantidadeProdutos ?? produtos.length}</strong></div>
    <div class="kpi"><span>Ticket médio</span><strong>${escaparHtml(formatarMoeda(vendas.ticketMedio))}</strong></div>
  </div>

  <h2>Novos clientes no período (${novos.length})</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Nome</th><th>CPF</th><th>Cód. ERP</th><th>Cadastrado em</th></tr>
    </thead>
    <tbody>${linhasClientes}</tbody>
  </table>

  <h2>Produtos vendidos no período (${produtos.length})</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Produto</th><th>Código</th><th class="num">Qtd.</th><th class="num">Valor</th></tr>
    </thead>
    <tbody>${linhasProdutos}</tbody>
  </table>

  <p class="nota">
    ${escaparHtml(vendas.descricao || "")}
    Lista completa de produtos nas compras com CPF de membros do clube.
  </p>
</body>
</html>`;
}

export default function AdminRelatorioClubePage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
}) {
  const inicial = useMemo(() => intervaloRapido("ultimos30"), []);
  const [periodo, setPeriodo] = useState("ultimos30");
  const [dataInicio, setDataInicio] = useState(inicial.inicio);
  const [dataFim, setDataFim] = useState(inicial.fim);
  const [relatorio, setRelatorio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    if (!dataInicio || !dataFim) {
      setError("Informe a data inicial e a data final.");
      return;
    }
    if (dataInicio > dataFim) {
      setError("A data inicial não pode ser posterior à data final.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        dataInicio,
        dataFim,
      });
      const data = await fetchAdmin(`/api/admin/relatorio-clube?${params}`);
      setRelatorio(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setRelatorio(null);
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, onLogout]);

  function handleSelecionarPeriodo(novoPeriodo) {
    setPeriodo(novoPeriodo);
    if (novoPeriodo !== "personalizado") {
      const intervalo = intervaloRapido(novoPeriodo);
      setDataInicio(intervalo.inicio);
      setDataFim(intervalo.fim);
    }
  }

  function handleGerar(event) {
    event.preventDefault();
    carregar();
  }

  function handleImprimir() {
    if (!relatorio) return;
    imprimirHtmlComprovante(
      montarHtmlRelatorio(relatorio, admin?.usuario || admin?.nome)
    );
  }

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  const cad = relatorio?.cadastros;
  const vendas = relatorio?.vendas;

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-relatorio-stack">
        <header className="admin-page-head">
          <div>
            {onVoltarHub ? (
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={onVoltarHub}
              >
                ← Relatórios
              </button>
            ) : null}
            <h1>Relatório do clube</h1>
            <p>
              Cadastros, vendas de membros e produtos mais vendidos — com opção
              de impressão.
            </p>
          </div>
          {relatorio && (
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={handleImprimir}
            >
              Imprimir relatório
            </button>
          )}
        </header>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        <section className="admin-card">
          <header className="admin-card__head">
            <div>
              <h2>Período</h2>
              <p className="admin-card__sub admin-card__sub--tight">
                Máximo de 90 dias. Vendas consideram CPF de clientes com conta
                no site.
              </p>
            </div>
          </header>

          <form className="admin-relatorio-filtros" onSubmit={handleGerar}>
            <fieldset className="admin-usuarios-periodo">
              <legend>Atalhos</legend>
              <div className="admin-usuarios-periodo__opcoes">
                {OPCOES_PERIODO.map((opcao) => (
                  <button
                    key={opcao.id}
                    type="button"
                    className={`admin-usuarios-periodo__opcao${
                      periodo === opcao.id
                        ? " admin-usuarios-periodo__opcao--ativa"
                        : ""
                    }`}
                    onClick={() => handleSelecionarPeriodo(opcao.id)}
                    aria-pressed={periodo === opcao.id}
                  >
                    {opcao.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="admin-usuarios-periodo__datas">
              <label>
                <span>Data inicial</span>
                <input
                  type="date"
                  value={dataInicio}
                  max={dataFim || undefined}
                  onChange={(e) => {
                    setPeriodo("personalizado");
                    setDataInicio(e.target.value);
                  }}
                  required
                />
              </label>
              <label>
                <span>Data final</span>
                <input
                  type="date"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => {
                    setPeriodo("personalizado");
                    setDataFim(e.target.value);
                  }}
                  required
                />
              </label>
            </div>

            <div className="admin-relatorio-filtros__acoes">
              <button
                type="submit"
                className="admin-btn admin-btn--primary"
                disabled={loading}
              >
                {loading ? "Gerando…" : "Gerar relatório"}
              </button>
            </div>
          </form>
        </section>

        {loading && !relatorio && (
          <p className="admin-usuarios-loading">Montando relatório…</p>
        )}

        {relatorio && (
          <>
            <div className="admin-usuarios-stats" aria-label="Indicadores">
              <article className="admin-usuarios-stat">
                <span className="admin-usuarios-stat__valor">
                  {cad?.total ?? 0}
                </span>
                <span className="admin-usuarios-stat__label">
                  Clientes cadastrados (total)
                </span>
              </article>
              <article className="admin-usuarios-stat">
                <span className="admin-usuarios-stat__valor">
                  {cad?.noPeriodo ?? 0}
                </span>
                <span className="admin-usuarios-stat__label">
                  Novos no período
                </span>
              </article>
              <article className="admin-usuarios-stat admin-usuarios-stat--saldo">
                <span className="admin-usuarios-stat__valor">
                  {formatarMoeda(vendas?.valorVendido)}
                </span>
                <span className="admin-usuarios-stat__label">
                  Valor vendido (membros)
                </span>
              </article>
              <article className="admin-usuarios-stat">
                <span className="admin-usuarios-stat__valor">
                  {vendas?.quantidadeCupons ?? 0}
                </span>
                <span className="admin-usuarios-stat__label">Cupons</span>
              </article>
              <article className="admin-usuarios-stat">
                <span className="admin-usuarios-stat__valor">
                  {vendas?.quantidadeProdutos ??
                    relatorio.produtosVendidos?.length ??
                    0}
                </span>
                <span className="admin-usuarios-stat__label">
                  Produtos distintos
                </span>
              </article>
              <article className="admin-usuarios-stat admin-usuarios-stat--filtro">
                <span className="admin-usuarios-stat__valor">
                  {formatarMoeda(vendas?.ticketMedio)}
                </span>
                <span className="admin-usuarios-stat__label">Ticket médio</span>
              </article>
            </div>

            <p className="admin-relatorio-nota">{vendas?.descricao}</p>

            <div className="admin-relatorio-listas">
              <section className="admin-card">
                <header className="admin-card__head">
                  <div>
                    <h2>Novos clientes no período</h2>
                    <p className="admin-card__sub admin-card__sub--tight">
                      Lista completa · {relatorio.novosClientes?.length ?? 0}{" "}
                      cadastro(s)
                    </p>
                  </div>
                </header>
                {(relatorio.novosClientes || []).length === 0 ? (
                  <p className="admin-usuarios-loading">
                    Nenhum cliente cadastrado neste período.
                  </p>
                ) : (
                  <div className="admin-table-wrap admin-table-wrap--scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Cliente</th>
                          <th>CPF</th>
                          <th>Cód. ERP</th>
                          <th>Cadastrado em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatorio.novosClientes.map((item, index) => (
                          <tr key={item.cpf}>
                            <td>{index + 1}</td>
                            <td>{item.nome}</td>
                            <td>{formatarCpfCnpj(item.cpf)}</td>
                            <td>{item.clienteCodigo ?? "—"}</td>
                            <td>{formatarDataHora(item.cadastradoEm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="admin-card">
                <header className="admin-card__head">
                  <div>
                    <h2>Produtos vendidos</h2>
                    <p className="admin-card__sub admin-card__sub--tight">
                      Lista completa ·{" "}
                      {relatorio.produtosVendidos?.length ?? 0} produto(s) ·
                      quantidade e valor
                    </p>
                  </div>
                </header>
                {(relatorio.produtosVendidos || []).length === 0 ? (
                  <p className="admin-usuarios-loading">
                    Sem produtos vendidos neste período.
                  </p>
                ) : (
                  <div className="admin-table-wrap admin-table-wrap--scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Produto</th>
                          <th>Código</th>
                          <th>Qtd.</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatorio.produtosVendidos.map((item, index) => (
                          <tr key={`${item.codigo}-${index}`}>
                            <td>{index + 1}</td>
                            <td>{item.descricao}</td>
                            <td>{item.codigo}</td>
                            <td>{item.quantidade}</td>
                            <td>{formatarMoeda(item.valorTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

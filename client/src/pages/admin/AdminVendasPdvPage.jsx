import { useCallback, useEffect, useState } from "react";
import {
  Monitor,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Users,
  ShoppingCart,
  DollarSign,
  Receipt,
  AlertCircle,
} from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
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
  if (tipo === "hoje") { /* same day */ }
  else if (tipo === "ultimos7") inicio.setDate(inicio.getDate() - 6);
  else if (tipo === "ultimos30") inicio.setDate(inicio.getDate() - 29);
  else if (tipo === "mes") inicio.setDate(1);
  else return { inicio: "", fim: "" };
  return { inicio: dataLocalInput(inicio), fim: dataLocalInput(fim) };
}

const OPCOES_PERIODO = [
  { id: "hoje", label: "Hoje" },
  { id: "ultimos7", label: "7 dias" },
  { id: "ultimos30", label: "30 dias" },
  { id: "mes", label: "Este mês" },
  { id: "custom", label: "Personalizado" },
];

function formatarMoeda(v) {
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarDataHora(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(valor); }
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function montarHtmlRelatorioPdv(relatorio, adminUsuario) {
  const pdvs = relatorio?.pdvs || [];
  const naoMembros = relatorio?.naoMembros?.clientes || [];
  const periodo = relatorio?.periodo || {};
  const geradoEm = formatarDataHora(relatorio?.geradoEm);

  const blocosPdvs = pdvs.length
    ? pdvs
        .map((pdv) => {
          const linhasClientes = (pdv.clientes || []).length
            ? pdv.clientes
                .map(
                  (c) => `<tr>
                    <td>${escaparHtml(c.nome)}</td>
                    <td>${escaparHtml(formatarCpfCnpj(c.cpf))}</td>
                    <td class="num">${escaparHtml(c.cupons)}</td>
                    <td class="num">${escaparHtml(formatarMoeda(c.totalGasto))}</td>
                  </tr>`
                )
                .join("")
            : `<tr><td colspan="4">Sem clientes membros neste caixa.</td></tr>`;

          const linhasNaoMembros = (pdv.naoMembros || []).length
            ? pdv.naoMembros
                .map(
                  (c) => `<tr>
                    <td>${escaparHtml(c.nome)}</td>
                    <td>${escaparHtml(formatarCpfCnpj(c.cpf))}</td>
                    <td class="num">${escaparHtml(c.cupons)}</td>
                    <td class="num">${escaparHtml(formatarMoeda(c.totalGasto))}</td>
                  </tr>`
                )
                .join("")
            : `<tr><td colspan="4">Nenhum cliente fora do clube neste caixa.</td></tr>`;

          return `
            <section class="bloco">
              <h2>Caixa / PDV ${escaparHtml(pdv.pdv)}</h2>
              <div class="kpis">
                <div class="kpi"><span>Valor vendido</span><strong>${escaparHtml(formatarMoeda(pdv.totalVendido))}</strong></div>
                <div class="kpi"><span>Cupons</span><strong>${escaparHtml(pdv.quantidadeCupons)}</strong></div>
                <div class="kpi"><span>Clientes únicos</span><strong>${escaparHtml(pdv.clientesUnicos)}</strong></div>
                <div class="kpi"><span>Ticket médio</span><strong>${escaparHtml(formatarMoeda(pdv.ticketMedio))}</strong></div>
              </div>

              <h3>Clientes do clube</h3>
              <table>
                <thead><tr><th>Nome</th><th>CPF</th><th class="num">Cupons</th><th class="num">Total gasto</th></tr></thead>
                <tbody>${linhasClientes}</tbody>
              </table>

              <h3>Clientes com CPF fora do clube</h3>
              <table>
                <thead><tr><th>Nome</th><th>CPF</th><th class="num">Cupons</th><th class="num">Total gasto</th></tr></thead>
                <tbody>${linhasNaoMembros}</tbody>
              </table>
            </section>
          `;
        })
        .join("")
    : `<p>Sem dados de PDV no período selecionado.</p>`;

  const linhasNaoMembrosGeral = naoMembros.length
    ? naoMembros
        .map(
          (c) => `<tr>
            <td>${escaparHtml(c.nome)}</td>
            <td>${escaparHtml(formatarCpfCnpj(c.cpf))}</td>
            <td class="num">${escaparHtml(c.cupons)}</td>
            <td class="num">${escaparHtml(formatarMoeda(c.totalGasto))}</td>
            <td>${escaparHtml((c.pdvs || []).join(", "))}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Sem clientes fora do clube no período.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório PDV Clube Superama+</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #12263a; margin: 22px; font-size: 12px; }
    h1 { margin: 0 0 4px; font-size: 20px; color: #1b4fa0; }
    h2 { margin: 16px 0 6px; font-size: 14px; color: #1b4fa0; border-bottom: 1px solid #d7e0ea; padding-bottom: 4px; }
    h3 { margin: 12px 0 6px; font-size: 12px; color: #1f3552; }
    .meta { color: #5b6b7c; margin-bottom: 14px; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
    .kpi { border: 1px solid #d7e0ea; border-radius: 7px; padding: 8px; }
    .kpi strong { display: block; font-size: 15px; margin-top: 3px; }
    .kpi span { color: #5b6b7c; font-size: 11px; }
    .bloco { margin: 14px 0 22px; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border: 1px solid #d7e0ea; padding: 5px 7px; text-align: left; }
    th { background: #f3f7fb; font-size: 11px; }
    .num { text-align: right; }
    .rodape { margin-top: 16px; color: #5b6b7c; font-size: 11px; }
    @media print {
      body { margin: 10mm; }
      .bloco { page-break-inside: avoid; }
      table { break-inside: auto; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Relatório de Vendas por PDV / Caixa</h1>
  <p class="meta">
    Período: <strong>${escaparHtml(periodo.dataInicio)} a ${escaparHtml(periodo.dataFim)}</strong><br/>
    Gerado em ${escaparHtml(geradoEm)}${adminUsuario ? ` · por ${escaparHtml(adminUsuario)}` : ""}
  </p>

  <div class="kpis">
    <div class="kpi"><span>Total vendido</span><strong>${escaparHtml(formatarMoeda(relatorio?.totalGeral || 0))}</strong></div>
    <div class="kpi"><span>Cupons</span><strong>${escaparHtml(relatorio?.cuponsGeral || 0)}</strong></div>
    <div class="kpi"><span>PDVs ativos</span><strong>${escaparHtml(relatorio?.pdvsAtivos || 0)}</strong></div>
    <div class="kpi"><span>Ticket médio geral</span><strong>${escaparHtml(formatarMoeda(relatorio?.ticketMedioGeral || 0))}</strong></div>
  </div>

  ${blocosPdvs}

  <section class="bloco">
    <h2>Clientes com CPF fora do clube (consolidado)</h2>
    <table>
      <thead><tr><th>Nome</th><th>CPF</th><th class="num">Cupons</th><th class="num">Total gasto</th><th>PDVs</th></tr></thead>
      <tbody>${linhasNaoMembrosGeral}</tbody>
    </table>
  </section>

  <p class="rodape">Relatório operacional estilo RP — sem gráficos, foco em dados de decisão por caixa.</p>
</body>
</html>`;
}

function calcularInsightsPdv(pdv) {
  const cupons = pdv?.cupons || [];
  const total = cupons.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const valorConvenio = cupons
    .filter((c) => c.convenio)
    .reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const valorNormal = Math.max(0, total - valorConvenio);
  const pctConvenioValor = total > 0 ? (valorConvenio / total) * 100 : 0;

  const faixas = { manha: 0, tarde: 0, noite: 0, madrugada: 0 };
  for (const cupom of cupons) {
    const d = new Date(cupom.dataHora);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getHours();
    const v = Number(cupom.valor) || 0;
    if (h >= 6 && h < 12) faixas.manha += v;
    else if (h >= 12 && h < 18) faixas.tarde += v;
    else if (h >= 18 && h < 24) faixas.noite += v;
    else faixas.madrugada += v;
  }
  const picoEntrada = Object.entries(faixas).sort((a, b) => b[1] - a[1])[0];
  const labels = {
    manha: "Manhã",
    tarde: "Tarde",
    noite: "Noite",
    madrugada: "Madrugada",
  };

  return {
    valorConvenio,
    valorNormal,
    pctConvenioValor,
    faixaPico: picoEntrada ? labels[picoEntrada[0]] : "—",
    valorFaixaPico: picoEntrada ? picoEntrada[1] : 0,
  };
}

function PdvCard({ pdv, aberto, onToggle }) {
  const pct = pdv._pctTotal ?? 0;
  const insights = calcularInsightsPdv(pdv);
  return (
    <div className="pdv-card">
      <button type="button" className="pdv-card__header" onClick={onToggle}>
        <div className="pdv-card__id">
          <Monitor size={18} />
          <strong>Caixa {pdv.pdv}</strong>
        </div>
        <div className="pdv-card__kpis">
          <span className="pdv-kpi"><DollarSign size={14} /> {formatarMoeda(pdv.totalVendido)}</span>
          <span className="pdv-kpi"><Receipt size={14} /> {pdv.quantidadeCupons} cupons</span>
          <span className="pdv-kpi"><Users size={14} /> {pdv.clientesUnicos} clientes</span>
          <span className="pdv-kpi"><ShoppingCart size={14} /> TM {formatarMoeda(pdv.ticketMedio)}</span>
        </div>
        <div className="pdv-mini-mix" title={`Crediário em valor: ${formatarMoeda(insights.valorConvenio)}`}>
          <small>Crediário (R$)</small>
          <div className="pdv-mini-mix__bar">
            <span style={{ width: `${Math.min(100, insights.pctConvenioValor)}%` }} />
          </div>
          <strong>{insights.pctConvenioValor.toFixed(1)}%</strong>
        </div>
        <div className="pdv-card__pct">{pct.toFixed(1)}%</div>
        {aberto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {aberto && (
        <div className="pdv-card__body">
          <div className="pdv-insights">
            <div className="pdv-insight">
              <span className="pdv-insight__label">Valor no crediário</span>
              <strong>{formatarMoeda(insights.valorConvenio)}</strong>
            </div>
            <div className="pdv-insight">
              <span className="pdv-insight__label">Valor em outros meios</span>
              <strong>{formatarMoeda(insights.valorNormal)}</strong>
            </div>
            <div className="pdv-insight">
              <span className="pdv-insight__label">Faixa de pico (R$)</span>
              <strong>{insights.faixaPico} · {formatarMoeda(insights.valorFaixaPico)}</strong>
            </div>
          </div>

          <div className="pdv-section">
            <h4>Clientes ({pdv.clientes.length})</h4>
            <div className="pdv-table-wrap">
              <table className="pdv-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CPF</th>
                    <th style={{ textAlign: "right" }}>Cupons</th>
                    <th style={{ textAlign: "right" }}>Total gasto</th>
                    <th>Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {pdv.clientes.map((c) => (
                    <tr key={c.cpf}>
                      <td>{c.nome}</td>
                      <td className="mono">{formatarCpfCnpj(c.cpf)}</td>
                      <td style={{ textAlign: "right" }}>{c.cupons}</td>
                      <td style={{ textAlign: "right" }}>{formatarMoeda(c.totalGasto)}</td>
                      <td>{c.cuponsConvenio > 0 && <span className="pdv-tag pdv-tag--convenio">Crediário ({c.cuponsConvenio})</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {pdv.naoMembros && pdv.naoMembros.length > 0 && (
            <div className="pdv-section pdv-section--alerta">
              <h4><AlertCircle size={15} style={{ marginRight: 4, color: "#92400e" }} /> Fora do clube ({pdv.naoMembros.length})</h4>
              <p className="pdv-section__hint">Informaram CPF neste caixa mas não são membros do clube</p>
              <div className="pdv-table-wrap">
                <table className="pdv-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th style={{ textAlign: "right" }}>Cupons</th>
                      <th style={{ textAlign: "right" }}>Total gasto</th>
                      <th>Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pdv.naoMembros.map((c) => (
                      <tr key={c.cpf}>
                        <td>{c.nome}</td>
                        <td className="mono">{formatarCpfCnpj(c.cpf)}</td>
                        <td style={{ textAlign: "right" }}>{c.cupons}</td>
                        <td style={{ textAlign: "right" }}>{formatarMoeda(c.totalGasto)}</td>
                        <td>{c.cuponsConvenio > 0 && <span className="pdv-tag pdv-tag--convenio">Crediário ({c.cuponsConvenio})</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pdv-section">
            <h4>Últimos cupons ({pdv.cupons.length})</h4>
            <div className="pdv-table-wrap">
              <table className="pdv-table">
                <thead>
                  <tr>
                    <th>Cupom</th>
                    <th>Data/hora</th>
                    <th>Cliente</th>
                    <th style={{ textAlign: "right" }}>Valor</th>
                    <th>Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {pdv.cupons.slice(0, 50).map((c, i) => (
                    <tr key={`${c.cupom}-${i}`}>
                      <td className="mono">{c.cupom}</td>
                      <td>{formatarDataHora(c.dataHora)}</td>
                      <td>{c.nome}</td>
                      <td style={{ textAlign: "right" }}>{formatarMoeda(c.valor)}</td>
                      <td>
                        {c.convenio
                          ? <span className="pdv-tag pdv-tag--convenio">Crediário</span>
                          : <span className="pdv-tag pdv-tag--normal">{c.forma || "—"}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminVendasPdvPage({ tab, onTabChange, onLogout, admin, onVoltarHub }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [periodo, setPeriodo] = useState("ultimos7");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [abertos, setAbertos] = useState(new Set());

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      let params;
      if (periodo === "custom" && customInicio && customFim) {
        const di = customInicio.split("-").reverse().join("/");
        const df = customFim.split("-").reverse().join("/");
        params = `dataInicio=${di}&dataFim=${df}`;
      } else {
        const iv = intervaloRapido(periodo);
        if (iv.inicio) {
          const di = iv.inicio.split("-").reverse().join("/");
          const df = iv.fim.split("-").reverse().join("/");
          params = `dataInicio=${di}&dataFim=${df}`;
        } else {
          params = "dias=7";
        }
      }
      const data = await fetchAdmin(`/api/admin/relatorio/vendas-pdv?${params}`);
      setDados(data);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [periodo, customInicio, customFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const togglePdv = (pdv) => {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(pdv)) next.delete(pdv);
      else next.add(pdv);
      return next;
    });
  };

  const pdvs = (dados?.pdvs || []).map((p) => ({
    ...p,
    _pctTotal: dados.totalGeral > 0 ? (p.totalVendido / dados.totalGeral) * 100 : 0,
  }));
  const topPdvs = [...pdvs].slice(0, 5);
  const maxTopPdv = topPdvs[0]?.totalVendido || 0;
  const handleImprimirRelatorio = () => {
    if (!dados) return;
    imprimirHtmlComprovante(montarHtmlRelatorioPdv(dados, admin?.usuario || admin?.nome));
  };

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      <header className="admin-page-head">
        <button
          type="button"
          className="admin-btn admin-btn--ghost admin-btn--sm"
          onClick={onVoltarHub}
          style={{ marginBottom: "0.5rem" }}
        >
          <ArrowLeft size={15} style={{ marginRight: 4 }} /> Voltar
        </button>
        <h1>Vendas por PDV / Caixa</h1>
        <p>Quanto cada caixa vendeu no clube, cupons e clientes atendidos</p>
        {dados && (
          <div style={{ marginTop: "0.6rem" }}>
            <button type="button" className="admin-btn admin-btn--primary" onClick={handleImprimirRelatorio}>
              Imprimir relatório RP
            </button>
          </div>
        )}
      </header>

      {/* Filtros */}
      <div className="admin-relatorio-filtros" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {OPCOES_PERIODO.map((op) => (
            <button
              key={op.id}
              type="button"
              className={`admin-btn admin-btn--sm ${periodo === op.id ? "" : "admin-btn--ghost"}`}
              onClick={() => setPeriodo(op.id)}
            >
              {op.label}
            </button>
          ))}
        </div>
        {periodo === "custom" && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem" }}>
            <input type="date" value={customInicio} onChange={(e) => setCustomInicio(e.target.value)} className="admin-input" />
            <span>até</span>
            <input type="date" value={customFim} onChange={(e) => setCustomFim(e.target.value)} className="admin-input" />
            <button type="button" className="admin-btn admin-btn--sm" onClick={carregar}>Buscar</button>
          </div>
        )}
      </div>

      {loading && <p style={{ color: "var(--admin-muted)" }}>Carregando dados dos PDVs…</p>}
      {erro && <p style={{ color: "var(--admin-danger)" }}>{erro}</p>}

      {dados && !loading && (
        <>
          {/* Resumo geral */}
          <div className="pdv-resumo">
            <div className="pdv-resumo__item">
              <span className="pdv-resumo__label">Total vendido</span>
              <span className="pdv-resumo__value">{formatarMoeda(dados.totalGeral)}</span>
            </div>
            <div className="pdv-resumo__item">
              <span className="pdv-resumo__label">Cupons</span>
              <span className="pdv-resumo__value">{dados.cuponsGeral}</span>
            </div>
            <div className="pdv-resumo__item">
              <span className="pdv-resumo__label">PDVs ativos</span>
              <span className="pdv-resumo__value">{dados.pdvsAtivos}</span>
            </div>
            <div className="pdv-resumo__item">
              <span className="pdv-resumo__label">Ticket médio geral</span>
              <span className="pdv-resumo__value">{formatarMoeda(dados.ticketMedioGeral)}</span>
            </div>
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--admin-muted)", margin: "0.75rem 0 0.25rem" }}>
            Período: {dados.periodo.dataInicio} a {dados.periodo.dataFim}
          </p>

          {topPdvs.length > 0 && (
            <div className="pdv-top-chart">
              <h3>Top caixas por valor vendido</h3>
              <div className="pdv-top-chart__list">
                {topPdvs.map((p) => {
                  const width = maxTopPdv > 0 ? (p.totalVendido / maxTopPdv) * 100 : 0;
                  return (
                    <div key={`top-${p.pdv}`} className="pdv-top-chart__row">
                      <span className="pdv-top-chart__label">PDV {p.pdv}</span>
                      <div className="pdv-top-chart__bar">
                        <span style={{ width: `${Math.max(8, width)}%` }} />
                      </div>
                      <strong>{formatarMoeda(p.totalVendido)}</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cards por PDV */}
          <div className="pdv-list">
            {pdvs.map((p) => (
              <PdvCard
                key={p.pdv}
                pdv={p}
                aberto={abertos.has(p.pdv)}
                onToggle={() => togglePdv(p.pdv)}
              />
            ))}
            {pdvs.length === 0 && (
              <p style={{ color: "var(--admin-muted)", padding: "2rem 0", textAlign: "center" }}>
                Nenhuma venda do clube encontrada no período.
              </p>
            )}
          </div>

          {/* Não membros */}
          {dados.naoMembros && dados.naoMembros.total > 0 && (
            <div className="pdv-nao-membros">
              <div className="pdv-nao-membros__header">
                <AlertCircle size={20} />
                <div>
                  <h3>Clientes com CPF que NÃO são do clube</h3>
                  <p>
                    {dados.naoMembros.total} clientes informaram CPF no caixa mas não estão cadastrados no programa.
                    {" "}Eles geraram <strong>{dados.naoMembros.cupons} cupons</strong> totalizando <strong>{formatarMoeda(dados.naoMembros.valorTotal)}</strong> no período.
                  </p>
                </div>
              </div>
              <div className="pdv-table-wrap">
                <table className="pdv-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th style={{ textAlign: "right" }}>Cupons</th>
                      <th style={{ textAlign: "right" }}>Total gasto</th>
                      <th>Pagamento</th>
                      <th>Caixas</th>
                      <th>Última compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.naoMembros.clientes.map((c) => (
                      <tr key={c.cpf}>
                        <td>{c.nome}</td>
                        <td className="mono">{formatarCpfCnpj(c.cpf)}</td>
                        <td style={{ textAlign: "right" }}>{c.cupons}</td>
                        <td style={{ textAlign: "right" }}>{formatarMoeda(c.totalGasto)}</td>
                        <td>{c.cuponsConvenio > 0 && <span className="pdv-tag pdv-tag--convenio">Crediário ({c.cuponsConvenio})</span>}</td>
                        <td>{c.pdvs.join(", ")}</td>
                        <td>{formatarDataHora(c.ultimaCompra)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

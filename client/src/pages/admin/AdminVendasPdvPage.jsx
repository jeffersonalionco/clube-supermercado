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
  Printer,
  X,
  Loader2,
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

function resumoFinanceiroPdv(pdv, totalGeral = 0) {
  const cupons = pdv?.cupons || [];
  const valorConvenio = cupons
    .filter((c) => c.convenio)
    .reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const valorForaClube = (pdv?.naoMembros || []).reduce(
    (s, c) => s + (Number(c.totalGasto) || 0),
    0
  );

  return {
    pctTotal: totalGeral > 0 ? ((pdv.totalVendido / totalGeral) * 100).toFixed(1) : "0.0",
    membros: (pdv?.clientes || []).length,
    foraClube: (pdv?.naoMembros || []).length,
    valorForaClube,
    valorConvenio,
    pctConvenio: pdv.totalVendido > 0 ? ((valorConvenio / pdv.totalVendido) * 100).toFixed(1) : "0.0",
  };
}

function montarHtmlRelatorioPdv(relatorio, adminUsuario) {
  const pdvs = relatorio?.pdvs || [];
  const naoMembros = relatorio?.naoMembros?.clientes || [];
  const periodo = relatorio?.periodo || {};
  const geradoEm = formatarDataHora(relatorio?.geradoEm);
  const totalGeral = Number(relatorio?.totalGeral) || 0;

  const linhasResumoPdvs = pdvs.length
    ? pdvs
        .map((pdv) => {
          const r = resumoFinanceiroPdv(pdv, totalGeral);
          return `<tr>
            <td><strong>${escaparHtml(pdv.pdv)}</strong></td>
            <td class="num">${escaparHtml(formatarMoeda(pdv.totalVendido))}</td>
            <td class="num">${escaparHtml(pdv.quantidadeCupons)}</td>
            <td class="num">${escaparHtml(pdv.clientesUnicos)}</td>
            <td class="num">${escaparHtml(formatarMoeda(pdv.ticketMedio))}</td>
            <td class="num">${escaparHtml(r.pctTotal)}%</td>
            <td class="num">${escaparHtml(r.membros)}</td>
            <td class="num">${escaparHtml(r.foraClube)}</td>
            <td class="num">${escaparHtml(formatarMoeda(r.valorForaClube))}</td>
            <td class="num">${escaparHtml(formatarMoeda(r.valorConvenio))}</td>
            <td class="num">${escaparHtml(r.pctConvenio)}%</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="11">Sem dados de PDV no período selecionado.</td></tr>`;

  const pdvsForaClube = (relatorio?.pdvsForaClube || pdvs.filter(
    (p) => (p.resumoForaClube?.totalVendido || 0) > 0
  )).sort(
    (a, b) =>
      (b.resumoForaClube?.totalVendido || 0) - (a.resumoForaClube?.totalVendido || 0)
  );
  const totalForaClube = Number(relatorio?.naoMembros?.valorTotal) || 0;

  const linhasResumoForaClube = pdvsForaClube.length
    ? pdvsForaClube
        .map((pdv) => {
          const f = pdv.resumoForaClube || {};
          return `<tr>
            <td><strong>${escaparHtml(pdv.pdv)}</strong></td>
            <td class="num">${escaparHtml(formatarMoeda(f.totalVendido || 0))}</td>
            <td class="num">${escaparHtml(f.quantidadeCupons || 0)}</td>
            <td class="num">${escaparHtml(f.clientesUnicos || 0)}</td>
            <td class="num">${escaparHtml(formatarMoeda(f.ticketMedio || 0))}</td>
            <td class="num">${escaparHtml(Number(f.pctDoTotalFora || 0).toFixed(1))}%</td>
            <td class="num">${escaparHtml(formatarMoeda(f.valorConvenio || 0))}</td>
            <td class="num">${escaparHtml(Number(f.pctConvenio || 0).toFixed(1))}%</td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="8">Nenhuma venda com CPF fora do clube no período.</td></tr>`;

  const totalConvenioFora = pdvsForaClube.reduce(
    (s, pdv) => s + (Number(pdv.resumoForaClube?.valorConvenio) || 0),
    0
  );
  const pctConvenioFora =
    totalForaClube > 0 ? ((totalConvenioFora / totalForaClube) * 100).toFixed(1) : "0.0";

  const topForaClube = [...naoMembros]
    .sort((a, b) => (Number(b.totalGasto) || 0) - (Number(a.totalGasto) || 0))
    .slice(0, 5);

  const linhasTopForaClube = topForaClube.length
    ? topForaClube
        .map(
          (c, i) => `<tr>
            <td>${i + 1}</td>
            <td>${escaparHtml(c.nome)}</td>
            <td>${escaparHtml(formatarCpfCnpj(c.cpf))}</td>
            <td class="num">${escaparHtml(c.cupons)}</td>
            <td class="num">${escaparHtml(formatarMoeda(c.totalGasto))}</td>
            <td>${escaparHtml((c.pdvs || []).join(", "))}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="6">Nenhum cliente fora do clube no período.</td></tr>`;

  const totalConvenio = pdvs.reduce((s, pdv) => {
    const r = resumoFinanceiroPdv(pdv, totalGeral);
    return s + r.valorConvenio;
  }, 0);
  const pctConvenioGeral = totalGeral > 0 ? ((totalConvenio / totalGeral) * 100).toFixed(1) : "0.0";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Resumo PDV Clube Superama+</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #12263a; margin: 18px; font-size: 11px; }
    h1 { margin: 0 0 4px; font-size: 18px; color: #1b4fa0; }
    h2 { margin: 14px 0 6px; font-size: 13px; color: #1b4fa0; border-bottom: 1px solid #d7e0ea; padding-bottom: 3px; }
    .meta { color: #5b6b7c; margin-bottom: 10px; line-height: 1.45; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin: 8px 0 12px; }
    .kpi { border: 1px solid #d7e0ea; border-radius: 6px; padding: 7px; }
    .kpi strong { display: block; font-size: 14px; margin-top: 2px; }
    .kpi span { color: #5b6b7c; font-size: 10px; }
    .bloco { margin: 10px 0 14px; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border: 1px solid #d7e0ea; padding: 4px 6px; text-align: left; font-size: 10.5px; }
    th { background: #f3f7fb; font-size: 10px; }
    .num { text-align: right; }
    .nota { margin: 8px 0 0; color: #5b6b7c; font-size: 10px; line-height: 1.4; }
    .rodape { margin-top: 12px; color: #5b6b7c; font-size: 10px; }
    @media print {
      body { margin: 8mm; font-size: 10px; }
      .bloco { page-break-inside: avoid; }
      tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Resumo de Vendas por PDV / Caixa</h1>
  <p class="meta">
    Período: <strong>${escaparHtml(periodo.dataInicio)} a ${escaparHtml(periodo.dataFim)}</strong><br/>
    Gerado em ${escaparHtml(geradoEm)}${adminUsuario ? ` · por ${escaparHtml(adminUsuario)}` : ""}<br/>
    Formato resumido para impressão (1–2 folhas). Detalhes completos disponíveis na tela do painel.
  </p>

  <div class="kpis">
    <div class="kpi"><span>Total vendido (clube)</span><strong>${escaparHtml(formatarMoeda(totalGeral))}</strong></div>
    <div class="kpi"><span>Cupons · PDVs ativos</span><strong>${escaparHtml(relatorio?.cuponsGeral || 0)} · ${escaparHtml(relatorio?.pdvsAtivos || 0)}</strong></div>
    <div class="kpi"><span>Ticket médio geral</span><strong>${escaparHtml(formatarMoeda(relatorio?.ticketMedioGeral || 0))}</strong></div>
    <div class="kpi"><span>Fora do clube (clientes)</span><strong>${escaparHtml(relatorio?.naoMembros?.total || 0)}</strong></div>
    <div class="kpi"><span>Valor fora do clube</span><strong>${escaparHtml(formatarMoeda(relatorio?.naoMembros?.valorTotal || 0))}</strong></div>
    <div class="kpi"><span>Crediário (valor · %)</span><strong>${escaparHtml(formatarMoeda(totalConvenio))} · ${escaparHtml(pctConvenioGeral)}%</strong></div>
  </div>

  <section class="bloco">
    <h2>Resumo por caixa / PDV</h2>
    <table>
      <thead>
        <tr>
          <th>PDV</th>
          <th class="num">Vendido</th>
          <th class="num">Cupons</th>
          <th class="num">Clientes</th>
          <th class="num">Ticket</th>
          <th class="num">% total</th>
          <th class="num">Membros</th>
          <th class="num">Fora clube</th>
          <th class="num">R$ fora</th>
          <th class="num">R$ crediário</th>
          <th class="num">% cred.</th>
        </tr>
      </thead>
      <tbody>${linhasResumoPdvs}</tbody>
    </table>
    <p class="nota">Membros = clientes cadastrados no clube. Fora clube = informaram CPF mas não estão no programa.</p>
  </section>

  <section class="bloco">
    <h2>Resumo por caixa / PDV — clientes FORA do clube</h2>
    <table>
      <thead>
        <tr>
          <th>PDV</th>
          <th class="num">Vendido</th>
          <th class="num">Cupons</th>
          <th class="num">Clientes</th>
          <th class="num">Ticket</th>
          <th class="num">% total</th>
          <th class="num">R$ crediário</th>
          <th class="num">% cred.</th>
        </tr>
      </thead>
      <tbody>${linhasResumoForaClube}</tbody>
    </table>
    <p class="nota">
      Total fora do clube: ${escaparHtml(formatarMoeda(totalForaClube))}
      · ${escaparHtml(relatorio?.naoMembros?.cupons || 0)} cupons
      · ${escaparHtml(relatorio?.naoMembros?.total || 0)} clientes
      · Crediário: ${escaparHtml(formatarMoeda(totalConvenioFora))} (${escaparHtml(pctConvenioFora)}%)
    </p>
  </section>

  <section class="bloco">
    <h2>Top 5 oportunidades — CPF fora do clube (por valor)</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Nome</th><th>CPF</th><th class="num">Cupons</th><th class="num">Total gasto</th><th>PDVs</th></tr>
      </thead>
      <tbody>${linhasTopForaClube}</tbody>
    </table>
    ${naoMembros.length > 5 ? `<p class="nota">+ ${naoMembros.length - 5} cliente(s) fora do clube não listados. Consulte o painel para detalhes.</p>` : ""}
  </section>

  <p class="rodape">Clube Superama+ · Relatório operacional resumido</p>
</body>
</html>`;
}

const ESTILOS_IMPRESSAO_PDV = `
  body { font-family: Arial, Helvetica, sans-serif; color: #12263a; margin: 18px; font-size: 11px; }
  h1 { margin: 0 0 4px; font-size: 18px; color: #1b4fa0; }
  h2 { margin: 14px 0 6px; font-size: 13px; color: #1b4fa0; border-bottom: 1px solid #d7e0ea; padding-bottom: 3px; }
  h3 { margin: 10px 0 5px; font-size: 11px; color: #1f3552; }
  .meta { color: #5b6b7c; margin-bottom: 10px; line-height: 1.45; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin: 8px 0 10px; }
  .kpi { border: 1px solid #d7e0ea; border-radius: 6px; padding: 7px; }
  .kpi strong { display: block; font-size: 13px; margin-top: 2px; }
  .kpi span { color: #5b6b7c; font-size: 10px; }
  .bloco { margin: 10px 0 14px; break-inside: avoid; }
  .bloco-pdv { page-break-after: always; }
  .bloco-pdv:last-child { page-break-after: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #d7e0ea; padding: 4px 6px; text-align: left; font-size: 10.5px; }
  th { background: #f3f7fb; font-size: 10px; }
  .num { text-align: right; }
  .vazio { color: #5b6b7c; font-size: 10px; margin: 4px 0; }
  .nota { margin: 6px 0 0; color: #5b6b7c; font-size: 10px; }
  .rodape { margin-top: 12px; color: #5b6b7c; font-size: 10px; }
  @media print {
    body { margin: 8mm; font-size: 10px; }
    .bloco { page-break-inside: avoid; }
    tr { break-inside: avoid; }
  }
`;

function metaImpressaoPdv(relatorio, adminUsuario) {
  const periodo = relatorio?.periodo || {};
  return `
    Período: <strong>${escaparHtml(periodo.dataInicio)} a ${escaparHtml(periodo.dataFim)}</strong><br/>
    Gerado em ${escaparHtml(formatarDataHora(relatorio?.geradoEm))}${adminUsuario ? ` · por ${escaparHtml(adminUsuario)}` : ""}
  `;
}

function tabelaClientesImpressao(clientes, mensagemVazia) {
  if (!clientes?.length) {
    return `<p class="vazio">${escaparHtml(mensagemVazia)}</p>`;
  }
  const linhas = clientes
    .map(
      (c) => `<tr>
        <td>${escaparHtml(c.nome)}</td>
        <td>${escaparHtml(formatarCpfCnpj(c.cpf))}</td>
        <td class="num">${escaparHtml(c.cupons)}</td>
        <td class="num">${escaparHtml(formatarMoeda(c.totalGasto))}</td>
        <td class="num">${c.cuponsConvenio > 0 ? escaparHtml(`${c.cuponsConvenio} cupom(ns)`) : "—"}</td>
      </tr>`
    )
    .join("");
  return `<table>
    <thead>
      <tr><th>Nome</th><th>CPF</th><th class="num">Cupons</th><th class="num">Total gasto</th><th class="num">Crediário</th></tr>
    </thead>
    <tbody>${linhas}</tbody>
  </table>`;
}

function montarBlocoPdvDetalhe(pdv, { quebraPagina = false } = {}) {
  const r = resumoFinanceiroPdv(pdv);
  const fora = pdv.resumoForaClube || {};
  const insights = calcularInsightsPdv(pdv);

  return `
    <section class="bloco bloco-pdv${quebraPagina ? "" : ""}">
      <h2>Caixa / PDV ${escaparHtml(pdv.pdv)}</h2>
      <div class="kpis">
        <div class="kpi"><span>Clube — vendido</span><strong>${escaparHtml(formatarMoeda(pdv.totalVendido))}</strong></div>
        <div class="kpi"><span>Clube — cupons · clientes</span><strong>${escaparHtml(pdv.quantidadeCupons)} · ${escaparHtml(pdv.clientesUnicos)}</strong></div>
        <div class="kpi"><span>Fora clube — vendido</span><strong>${escaparHtml(formatarMoeda(fora.totalVendido || r.valorForaClube))}</strong></div>
        <div class="kpi"><span>Fora clube — cupons · clientes</span><strong>${escaparHtml(fora.quantidadeCupons || 0)} · ${escaparHtml(fora.clientesUnicos || r.foraClube)}</strong></div>
        <div class="kpi"><span>Ticket clube</span><strong>${escaparHtml(formatarMoeda(pdv.ticketMedio))}</strong></div>
        <div class="kpi"><span>Crediário clube (R$ · %)</span><strong>${escaparHtml(formatarMoeda(r.valorConvenio))} · ${escaparHtml(r.pctConvenio)}%</strong></div>
        <div class="kpi"><span>Crediário fora (R$ · %)</span><strong>${escaparHtml(formatarMoeda(fora.valorConvenio || 0))} · ${escaparHtml(Number(fora.pctConvenio || 0).toFixed(1))}%</strong></div>
        <div class="kpi"><span>Faixa de pico (clube)</span><strong>${escaparHtml(insights.faixaPico)} · ${escaparHtml(formatarMoeda(insights.valorFaixaPico))}</strong></div>
      </div>

      <h3>Clientes do clube (${(pdv.clientes || []).length})</h3>
      ${tabelaClientesImpressao(pdv.clientes, "Nenhum cliente do clube neste caixa.")}

      <h3>Clientes com CPF fora do clube (${(pdv.naoMembros || []).length})</h3>
      ${tabelaClientesImpressao(pdv.naoMembros, "Nenhum cliente fora do clube neste caixa.")}
    </section>
  `;
}

function montarHtmlRelatorioPdvDetalhe(pdv, relatorio, adminUsuario) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>PDV ${escaparHtml(pdv.pdv)} — Clube Superama+</title>
  <style>${ESTILOS_IMPRESSAO_PDV}</style>
</head>
<body>
  <h1>Relatório detalhado — Caixa ${escaparHtml(pdv.pdv)}</h1>
  <p class="meta">${metaImpressaoPdv(relatorio, adminUsuario)}</p>
  ${montarBlocoPdvDetalhe(pdv)}
  <p class="rodape">Listagem completa por cliente · Clube Superama+</p>
</body>
</html>`;
}

function montarHtmlRelatorioPdvDetalheTodos(relatorio, adminUsuario) {
  const pdvs = relatorio?.pdvs || [];
  const blocos = pdvs.length
    ? pdvs.map((pdv, i) => montarBlocoPdvDetalhe(pdv, { quebraPagina: i < pdvs.length - 1 })).join("")
    : `<p class="vazio">Sem dados de PDV no período.</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório detalhado por PDV — Clube Superama+</title>
  <style>${ESTILOS_IMPRESSAO_PDV}</style>
</head>
<body>
  <h1>Relatório detalhado por caixa / PDV</h1>
  <p class="meta">${metaImpressaoPdv(relatorio, adminUsuario)}<br/>Um bloco por caixa, com todos os clientes (clube e fora do clube).</p>
  ${blocos}
  <p class="rodape">Clube Superama+ · ${escaparHtml(pdvs.length)} caixa(s)</p>
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

function CelulaClienteClicavel({ cliente, pdv, onVerCliente }) {
  const abrir = () =>
    onVerCliente?.({
      cpf: cliente.cpf,
      nome: cliente.nome,
      pdv: pdv ?? null,
    });

  return (
    <>
      <td>
        <button type="button" className="pdv-cliente-link" onClick={abrir} title="Ver cupons e itens">
          {cliente.nome}
        </button>
      </td>
      <td className="mono">
        <button
          type="button"
          className="pdv-cliente-link pdv-cliente-link--mono"
          onClick={abrir}
          title="Ver cupons e itens"
        >
          {formatarCpfCnpj(cliente.cpf)}
        </button>
      </td>
    </>
  );
}

function PdvClienteCuponsModal({ aberto, cliente, periodo, onFechar }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!aberto || !cliente?.cpf || !periodo) return undefined;

    let cancelado = false;
    (async () => {
      setLoading(true);
      setErro(null);
      setDados(null);
      try {
        const params = new URLSearchParams({
          cpf: cliente.cpf,
          dataInicio: periodo.dataInicio,
          dataFim: periodo.dataFim,
        });
        if (cliente.pdv) params.set("pdv", cliente.pdv);
        const res = await fetchAdmin(
          `/api/admin/relatorio/vendas-pdv/cliente-cupons?${params}`
        );
        if (!cancelado) setDados(res);
      } catch (err) {
        if (!cancelado) setErro(mensagemParaUsuario(err.message));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [aberto, cliente?.cpf, cliente?.pdv, periodo?.dataInicio, periodo?.dataFim]);

  if (!aberto || !cliente) return null;

  const tituloPdv = cliente.pdv ? ` · Caixa ${cliente.pdv}` : "";

  return (
    <div className="admin-mkt-modal pdv-modal" role="dialog" aria-modal="true" aria-label="Cupons do cliente">
      <div className="admin-mkt-modal__backdrop" onClick={onFechar} />
      <div className="admin-mkt-modal__panel pdv-modal__panel">
        <header className="admin-mkt-modal__head pdv-modal__head">
          <div>
            <h3>{cliente.nome || dados?.nome || "Cliente"}</h3>
            <p className="pdv-modal__sub">
              {formatarCpfCnpj(cliente.cpf)}
              {tituloPdv}
              {periodo && (
                <>
                  {" · "}
                  {periodo.dataInicio} a {periodo.dataFim}
                </>
              )}
            </p>
          </div>
          <button type="button" className="pdv-modal__close" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="admin-mkt-modal__body pdv-modal__body">
          {loading && (
            <p className="pdv-modal__status">
              <Loader2 size={16} className="pdv-modal__spin" /> Carregando cupons…
            </p>
          )}
          {erro && <p className="pdv-modal__erro">{erro}</p>}

          {dados && !loading && (
            <>
              <div className="pdv-modal__resumo">
                <div>
                  <span>Status</span>
                  <strong>
                    {dados.membroClube ? (
                      <span className="pdv-tag pdv-tag--normal">Membro do clube</span>
                    ) : (
                      <span className="pdv-tag pdv-tag--convenio">Fora do clube</span>
                    )}
                  </strong>
                </div>
                <div>
                  <span>Cupons</span>
                  <strong>{dados.totais.quantidadeCupons}</strong>
                </div>
                <div>
                  <span>Itens</span>
                  <strong>{dados.totais.quantidadeItens}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{formatarMoeda(dados.totais.valorTotal)}</strong>
                </div>
              </div>

              {dados.cupons.length === 0 ? (
                <p className="pdv-modal__vazio">Nenhum cupom encontrado no período{dados.pdv ? ` no caixa ${dados.pdv}` : ""}.</p>
              ) : (
                <div className="pdv-cupons-list">
                  {dados.cupons.map((cupom) => (
                    <article key={cupom.chaveCupom} className="pdv-cupom-card">
                      <header className="pdv-cupom-card__head">
                        <div>
                          <strong>Cupom {cupom.numeroDcto}</strong>
                          <span className="pdv-cupom-card__meta">
                            Caixa {cupom.pdv} · {cupom.data}
                            {cupom.cancelada && (
                              <span className="pdv-tag pdv-tag--cancelado">Cancelado</span>
                            )}
                          </span>
                        </div>
                        <div className="pdv-cupom-card__valor">
                          <strong>{formatarMoeda(cupom.valorTotalCupom)}</strong>
                          {cupom.convenio ? (
                            <span className="pdv-tag pdv-tag--convenio">Crediário</span>
                          ) : (
                            <span className="pdv-tag pdv-tag--normal">{cupom.formaPagamento || "—"}</span>
                          )}
                        </div>
                      </header>

                      {(cupom.produtos || []).length > 0 ? (
                        <div className="pdv-table-wrap">
                          <table className="pdv-table pdv-table--compact">
                            <thead>
                              <tr>
                                <th>Código</th>
                                <th>Produto</th>
                                <th style={{ textAlign: "right" }}>Qtd</th>
                                <th style={{ textAlign: "right" }}>Valor</th>
                                <th style={{ textAlign: "right" }}>Desc.</th>
                                <th style={{ textAlign: "right" }}>Líquido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cupom.produtos.map((item, idx) => (
                                <tr key={`${cupom.chaveCupom}-${idx}`}>
                                  <td className="mono">{item.codigoProduto || item.codigoBarras || "—"}</td>
                                  <td>
                                    {item.descricao || "—"}
                                    {item.oferta === "SIM" && (
                                      <span className="pdv-tag pdv-tag--oferta">Oferta</span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: "right" }}>{item.quantidadeUnitaria ?? "—"}</td>
                                  <td style={{ textAlign: "right" }}>{formatarMoeda(item.valorBruto ?? item.valorTotal)}</td>
                                  <td style={{ textAlign: "right" }}>
                                    {(item.valorDesconto || 0) > 0 ? formatarMoeda(item.valorDesconto) : "—"}
                                  </td>
                                  <td style={{ textAlign: "right" }}>{formatarMoeda(item.valorLiquido ?? item.valorTotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan={3} />
                                <td style={{ textAlign: "right" }}>{formatarMoeda(cupom.subtotalItens)}</td>
                                <td style={{ textAlign: "right" }}>
                                  {(cupom.totalDesconto || 0) > 0 ? formatarMoeda(cupom.totalDesconto) : "—"}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <strong>{formatarMoeda(cupom.valorTotalCupom)}</strong>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <p className="pdv-cupom-card__sem-itens">Sem itens registrados neste cupom.</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PdvCard({ pdv, aberto, onToggle, onImprimir, onVerCliente }) {
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
        <button
          type="button"
          className="pdv-card__print"
          title={`Imprimir caixa ${pdv.pdv}`}
          aria-label={`Imprimir caixa ${pdv.pdv}`}
          onClick={(e) => {
            e.stopPropagation();
            onImprimir?.(pdv);
          }}
        >
          <Printer size={16} />
        </button>
        {aberto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {aberto && (
        <div className="pdv-card__body">
          <div className="pdv-card__print-bar">
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={() => onImprimir?.(pdv)}
            >
              <Printer size={14} style={{ marginRight: 4 }} />
              Imprimir este caixa (todos os clientes)
            </button>
          </div>
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
                      <CelulaClienteClicavel cliente={c} pdv={pdv.pdv} onVerCliente={onVerCliente} />
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
                        <CelulaClienteClicavel cliente={c} pdv={pdv.pdv} onVerCliente={onVerCliente} />
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
                      <td>
                        {c.cpf ? (
                          <button
                            type="button"
                            className="pdv-cliente-link"
                            onClick={() =>
                              onVerCliente?.({
                                cpf: c.cpf,
                                nome: c.nome,
                                pdv: pdv.pdv,
                              })
                            }
                            title="Ver cupons e itens"
                          >
                            {c.nome}
                          </button>
                        ) : (
                          c.nome
                        )}
                      </td>
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
  const [clienteModal, setClienteModal] = useState(null);

  const abrirClienteModal = useCallback((cliente) => {
    setClienteModal(cliente);
  }, []);

  const fecharClienteModal = useCallback(() => {
    setClienteModal(null);
  }, []);

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
  const handleImprimirPdv = (pdv) => {
    if (!dados || !pdv) return;
    imprimirHtmlComprovante(
      montarHtmlRelatorioPdvDetalhe(pdv, dados, admin?.usuario || admin?.nome)
    );
  };
  const handleImprimirTodosDetalhado = () => {
    if (!dados) return;
    imprimirHtmlComprovante(
      montarHtmlRelatorioPdvDetalheTodos(dados, admin?.usuario || admin?.nome)
    );
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
          <div className="pdv-print-actions">
            <button type="button" className="admin-btn admin-btn--primary admin-btn--sm" onClick={handleImprimirRelatorio}>
              Imprimir resumo RP
            </button>
            <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={handleImprimirTodosDetalhado}>
              Imprimir todos os caixas (detalhado)
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
          <p style={{ fontSize: "0.72rem", color: "var(--admin-muted)", margin: "0 0 0.75rem", lineHeight: 1.4 }}>
            Membros: vendas contabilizadas a partir do cadastro no clube. Fora do clube: CPF informado no caixa sem cadastro.
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
                onImprimir={handleImprimirPdv}
                onVerCliente={abrirClienteModal}
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
                        <td>
                          <button
                            type="button"
                            className="pdv-cliente-link"
                            onClick={() => abrirClienteModal({ cpf: c.cpf, nome: c.nome, pdv: null })}
                            title="Ver cupons e itens (todos os caixas)"
                          >
                            {c.nome}
                          </button>
                        </td>
                        <td className="mono">
                          <button
                            type="button"
                            className="pdv-cliente-link pdv-cliente-link--mono"
                            onClick={() => abrirClienteModal({ cpf: c.cpf, nome: c.nome, pdv: null })}
                            title="Ver cupons e itens (todos os caixas)"
                          >
                            {formatarCpfCnpj(c.cpf)}
                          </button>
                        </td>
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

      <PdvClienteCuponsModal
        aberto={Boolean(clienteModal)}
        cliente={clienteModal}
        periodo={dados?.periodo}
        onFechar={fecharClienteModal}
      />
    </AdminLayout>
  );
}

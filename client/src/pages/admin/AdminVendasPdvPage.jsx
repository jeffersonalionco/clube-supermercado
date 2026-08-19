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
} from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

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

function PdvCard({ pdv, aberto, onToggle }) {
  const pct = pdv._pctTotal ?? 0;
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
        <div className="pdv-card__pct">{pct.toFixed(1)}%</div>
        {aberto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {aberto && (
        <div className="pdv-card__body">
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
                  </tr>
                </thead>
                <tbody>
                  {pdv.clientes.map((c) => (
                    <tr key={c.cpf}>
                      <td>{c.nome}</td>
                      <td className="mono">{formatarCpfCnpj(c.cpf)}</td>
                      <td style={{ textAlign: "right" }}>{c.cupons}</td>
                      <td style={{ textAlign: "right" }}>{formatarMoeda(c.totalGasto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

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
                  </tr>
                </thead>
                <tbody>
                  {pdv.cupons.slice(0, 50).map((c, i) => (
                    <tr key={`${c.cupom}-${i}`}>
                      <td className="mono">{c.cupom}</td>
                      <td>{formatarDataHora(c.dataHora)}</td>
                      <td>{c.nome}</td>
                      <td style={{ textAlign: "right" }}>{formatarMoeda(c.valor)}</td>
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
        </>
      )}
    </AdminLayout>
  );
}

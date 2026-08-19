import { useCallback, useEffect, useState } from "react";
import {
  Users,
  DollarSign,
  ShoppingCart,
  Send,
  Mail,
  Search,
  BarChart3,
  Gift,
  TrendingUp,
  Sun,
  Cloud,
  Moon,
} from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";

const CACHE_KEY = "admin_dash_cache";
const CACHE_TTL = 5 * 60_000;

function lerCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data;
  } catch { return null; }
}
function salvarCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Bom dia", Icon: Sun };
  if (h < 18) return { text: "Boa tarde", Icon: Cloud };
  return { text: "Boa noite", Icon: Moon };
}

function dataHoje() {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function KpiCard({ label, value, sub, Icon, color }) {
  return (
    <div className={`dash-kpi dash-kpi--${color}`}>
      <div className="dash-kpi__header">
        <span className="dash-kpi__label">{label}</span>
        <span className="dash-kpi__icon">
          <Icon size={20} />
        </span>
      </div>
      <div className="dash-kpi__value">{value}</div>
      {sub && <div className="dash-kpi__sub">{sub}</div>}
    </div>
  );
}

export default function AdminDashboardPage(props) {
  const { onTabChange } = props;
  const [dados, setDados] = useState(() => lerCache());

  const carregar = useCallback(async () => {
    try {
      const data = await fetchAdmin("/relatorio-clube?dias=30");
      setDados(data);
      salvarCache(data);
    } catch {
      /* silencia — dashboard mostra dados quando disponíveis */
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const { text: greeting, Icon: GreetIcon } = saudacao();
  const admin = props.admin?.usuario || "admin";

  const totalMembros = dados?.cadastros?.total ?? "—";
  const novosPeriodo = dados?.cadastros?.noPeriodo;
  const vendasClube = dados?.vendas?.valorVendido != null
    ? `R$ ${Number(dados.vendas.valorVendido).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`
    : "—";
  const ticketMedio = dados?.vendas?.ticketMedio != null
    ? `R$ ${Number(dados.vendas.ticketMedio).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    : "—";
  const cupons = dados?.vendas?.quantidadeCupons ?? "—";

  return (
    <AdminLayout {...props}>
      <div className="dash">
        {/* Saudação */}
        <div className="dash-welcome">
          <span className="dash-welcome__icon">
            <GreetIcon size={28} />
          </span>
          <div>
            <h2 className="dash-welcome__title">{greeting}, {admin}</h2>
            <p className="dash-welcome__date">{dataHoje()}</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="dash-kpis">
          <KpiCard label="Membros cadastrados" value={totalMembros} Icon={Users} color="blue" sub={novosPeriodo ? `+${novosPeriodo} no período` : null} />
          <KpiCard label="Vendas clube (30d)" value={vendasClube} Icon={DollarSign} color="green" sub={dados?.vendas?.membrosComCompra ? `${dados.vendas.membrosComCompra} membros compraram` : null} />
          <KpiCard label="Ticket médio" value={ticketMedio} Icon={ShoppingCart} color="orange" sub="Média por compra" />
          <KpiCard label="Cupons no período" value={cupons} Icon={Send} color="red" sub={dados?.vendas?.quantidadeProdutos ? `${dados.vendas.quantidadeProdutos} produtos vendidos` : null} />
        </div>

        {/* Ações rápidas */}
        <div className="dash-actions-card">
          <h3 className="dash-card__title">Ações rápidas</h3>
          <p className="dash-card__subtitle">Atalhos para tarefas frequentes</p>
          <div className="dash-actions">
            <button type="button" className="dash-action dash-action--primary" onClick={() => onTabChange("marketing")}>
              <span className="dash-action__icon"><Mail size={18} /></span>
              Nova campanha de e-mail
            </button>
            <button type="button" className="dash-action" onClick={() => onTabChange("clientes")}>
              <span className="dash-action__icon"><Search size={18} /></span>
              Consultar cliente por CPF
            </button>
            <button type="button" className="dash-action" onClick={() => onTabChange("relatorio")}>
              <span className="dash-action__icon"><BarChart3 size={18} /></span>
              Ver relatório do clube
            </button>
            <button type="button" className="dash-action" onClick={() => onTabChange("brindes")}>
              <span className="dash-action__icon"><Gift size={18} /></span>
              Cadastrar novo brinde
            </button>
          </div>
        </div>

        {/* Resumo de vendas */}
        {dados?.vendas && (
          <div className="dash-resumo-card">
            <h3 className="dash-card__title">
              <TrendingUp size={18} style={{ marginRight: 6 }} />
              Resumo de vendas no período
            </h3>
            <p className="dash-card__subtitle">{dados.periodo?.dataini} a {dados.periodo?.datafim}</p>
            <div className="dash-resumo-grid">
              <div className="dash-resumo-item">
                <span className="dash-resumo-item__label">Valor vendido</span>
                <span className="dash-resumo-item__value">R$ {Number(dados.vendas.valorVendido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="dash-resumo-item">
                <span className="dash-resumo-item__label">Cupons (compras)</span>
                <span className="dash-resumo-item__value">{dados.vendas.quantidadeCupons}</span>
              </div>
              <div className="dash-resumo-item">
                <span className="dash-resumo-item__label">Membros que compraram</span>
                <span className="dash-resumo-item__value">{dados.vendas.membrosComCompra}</span>
              </div>
              <div className="dash-resumo-item">
                <span className="dash-resumo-item__label">Produtos vendidos</span>
                <span className="dash-resumo-item__value">{dados.vendas.quantidadeProdutos}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

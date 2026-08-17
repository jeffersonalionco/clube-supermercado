import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession } from "../../utils/adminSession.js";

const PAINEIS = [
  {
    id: "radar-compras",
    titulo: "Radar de Compras",
    descricao:
      "Faturamento de membros, ticket médio, ativos, top 10 produtos e inativos para reativação.",
    status: "ativo",
    cta: "Abrir",
  },
  {
    id: "segmentacao-rfm",
    titulo: "Segmentação RFM",
    descricao:
      "Recência, frequência e valor — Champions, Em risco, Hibernando e listas para e-mail.",
    status: "ativo",
    cta: "Abrir",
  },
  {
    id: "niveis-fidelidade",
    titulo: "Níveis e fidelidade",
    descricao:
      "Bronze → Diamante, perto do upgrade e listas por persona para campanha e pauta.",
    status: "ativo",
    cta: "Abrir",
  },
  {
    id: "funil-novos-membros",
    titulo: "Funil de novos membros",
    descricao:
      "Cadastro → 1ª compra → 2ª compra. Conversão, tempo médio e e-mails de ativação.",
    status: "ativo",
    cta: "Abrir",
  },
  {
    id: "clube",
    titulo: "Relatório do Clube",
    descricao:
      "Cadastros novos no período, vendas de membros e lista completa de produtos (imprimível).",
    status: "ativo",
    cta: "Abrir",
  },
];

const ICONE = {
  "radar-compras": "◎",
  "segmentacao-rfm": "◇",
  "niveis-fidelidade": "◆",
  "funil-novos-membros": "▷",
  clube: "▦",
};

export default function AdminRelatoriosHubPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onAbrirPainel,
}) {
  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-marketing-stack">
        <header className="admin-page-head">
          <div>
            <h1>Relatórios</h1>
            <p>
              Painéis para marketing e editorial: quem ativar, quem reter e o
              que comunicar.
            </p>
          </div>
        </header>

        <div className="admin-marketing-canais">
          {PAINEIS.map((painel) => (
            <button
              key={painel.id}
              type="button"
              className="admin-marketing-canal"
              onClick={() => onAbrirPainel(painel.id)}
            >
              <span className="admin-marketing-canal__icone" aria-hidden>
                {ICONE[painel.id] || "▦"}
              </span>
              <span className="admin-marketing-canal__corpo">
                <strong>{painel.titulo}</strong>
                <span>{painel.descricao}</span>
              </span>
              <span className="admin-marketing-canal__cta">{painel.cta}</span>
            </button>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}

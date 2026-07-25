import { useCallback, useEffect, useState } from "react";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { ADMIN_RESUMO_REFRESH } from "./AdminResumoPontos.jsx";

function formatarDataHora(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleString("pt-BR", {
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

function labelOperacaoEstoque(operacao) {
  if (operacao === "entrada") return "Entrada de estoque";
  if (operacao === "saida") return "Saída de estoque";
  if (operacao === "ajuste") return "Ajuste de estoque";
  if (operacao === "resgate") return "Saída por resgate";
  return operacao;
}

function OperacaoItem({ item }) {
  if (item.tipo === "resgate") {
    return (
      <li
        className={`admin-operacao admin-operacao--resgate${item.assinaturaPendente ? " admin-operacao--pendente" : ""}`}
      >
        <div className="admin-operacao__top">
          <strong>Resgate · {item.codigo}</strong>
          <time>{formatarDataHora(item.criadoEm)}</time>
        </div>
        <p className="admin-operacao__corpo">
          <span>{item.clienteNome || "Cliente"}</span>
          <span> · {formatarCpfCnpj(item.cpf)}</span>
          <span> · −{item.pontos} pts</span>
          {item.brindes && <span> · {item.brindes}</span>}
        </p>
        <p className="admin-operacao__meta">
          Por {item.adminUsuario}
          {item.assinaturaPendente ? (
            <span className="admin-operacao__badge admin-operacao__badge--alerta">
              Assinatura pendente
            </span>
          ) : (
            <span className="admin-operacao__badge admin-operacao__badge--ok">
              Assinado
            </span>
          )}
        </p>
      </li>
    );
  }

  return (
    <li className="admin-operacao admin-operacao--estoque">
      <div className="admin-operacao__top">
        <strong>{labelOperacaoEstoque(item.operacao)}</strong>
        <time>{formatarDataHora(item.criadoEm)}</time>
      </div>
      <p className="admin-operacao__corpo">
        <span>{item.brindeNome}</span>
        <span>
          {" "}
          · {item.quantidade} un. ({item.estoqueAntes} → {item.estoqueDepois})
        </span>
      </p>
      {item.observacao && <p className="admin-operacao__obs">{item.observacao}</p>}
      <p className="admin-operacao__meta">Por {item.adminUsuario}</p>
    </li>
  );
}

export default function AdminOperacoesRecentes({
  onLogout,
  titulo = "Operações recentes do painel",
  abertoInicial = true,
  dias = 30,
}) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(abertoInicial);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdmin(`/api/admin/operacoes?limite=40&dias=${dias}`);
      setDados(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout?.();
        return;
      }
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [dias, onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    function onRefresh() {
      carregar();
    }
    window.addEventListener(ADMIN_RESUMO_REFRESH, onRefresh);
    return () => window.removeEventListener(ADMIN_RESUMO_REFRESH, onRefresh);
  }, [carregar]);

  return (
    <section className="admin-operacoes" aria-label={titulo}>
      <button
        type="button"
        className="admin-operacoes__toggle"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
      >
        <span>{titulo}</span>
        {dados?.pendentesAssinatura > 0 && (
          <span className="admin-operacoes__alerta">
            {dados.pendentesAssinatura} assinatura
            {dados.pendentesAssinatura === 1 ? "" : "s"} pendente
            {dados.pendentesAssinatura === 1 ? "" : "s"}
          </span>
        )}
        <span className="admin-operacoes__chevron" aria-hidden>
          {aberto ? "▾" : "▸"}
        </span>
      </button>

      {aberto && (
        <div className="admin-operacoes__corpo">
          {loading && !dados && <p className="admin-empty">Carregando…</p>}
          {!loading && dados?.operacoes?.length === 0 && (
            <p className="admin-empty">Nenhuma operação nos últimos {dados?.dias || dias} dias.</p>
          )}
          {dados?.operacoes?.length > 0 && (
            <>
              <p className="admin-operacoes__sub">
                Últimos {dados.total} registros (resgates e movimentações de estoque).
              </p>
              <ul className="admin-operacoes__lista">
                {dados.operacoes.map((item) => (
                  <OperacaoItem key={`${item.tipo}-${item.id}`} item={item} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

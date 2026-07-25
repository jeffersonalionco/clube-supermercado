import { useCallback, useEffect, useState } from "react";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { VALOR_REFERENCIA_PONTO } from "../../utils/pontosReferencia.js";

export const ADMIN_RESUMO_REFRESH = "admin-resumo-refresh";

function formatarNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

export default function AdminResumoPontos({
  onLogout,
  recolhivel = false,
  destaqueRisco = false,
}) {
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detalheAberto, setDetalheAberto] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);

    try {
      const data = await fetchAdmin("/api/admin/resumo");
      setResumo(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout?.();
        return;
      }
      setResumo(null);
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

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

  if (loading && !resumo) {
    const loadingEl = (
      <p className="admin-resumo__loading">Carregando resumo…</p>
    );
    if (recolhivel) {
      return (
        <details className="admin-resumo-details">
          <summary>Resumo geral do clube (gestão)</summary>
          <section className="admin-resumo" aria-label="Resumo de pontos e brindes">
            {loadingEl}
          </section>
        </details>
      );
    }
    return (
      <section className="admin-resumo" aria-label="Resumo de pontos e brindes">
        {loadingEl}
      </section>
    );
  }

  if (!resumo) return null;

  const { pontos, brindes, balanco, clientes } = resumo;
  const deficit = balanco.deficitPontos > 0;
  const valorPonto = resumo.valorReferenciaPonto ?? VALOR_REFERENCIA_PONTO;
  const passivoReais =
    pontos.passivoBrindesReais ?? pontos.emCirculacao * valorPonto;
  const coberturaReais =
    brindes.coberturaBrindesReais ?? brindes.pontosNoEstoque * valorPonto;
  const deficitReais = balanco.deficitReais ?? balanco.deficitPontos * valorPonto;

  const brindesAtivosComEstoque = (brindes.itens || []).filter(
    (b) => b.ativo && b.estoque > 0
  );

  const conteudo = (
    <section className="admin-resumo" aria-label="Resumo de pontos e brindes">
      {(destaqueRisco || deficit) && (
        <div
          className={`admin-resumo__risco${deficit ? " admin-resumo__risco--alerta" : " admin-resumo__risco--ok"}`}
          role={deficit ? "alert" : "status"}
        >
          {deficit ? (
            <>
              <strong>Risco: estoque não cobre os pontos dos clientes</strong>
              <p>
                Clientes têm <strong>{formatarNumero(pontos.emCirculacao)} pts</strong> (
                {formatarMoeda(passivoReais)} em referência), mas o estoque só cobre{" "}
                <strong>{formatarNumero(brindes.pontosNoEstoque)} pts</strong> (
                {formatarMoeda(coberturaReais)}). Faltam{" "}
                <strong>{formatarNumero(balanco.deficitPontos)} pts</strong> (
                {formatarMoeda(deficitReais)}) em brindes.
              </p>
            </>
          ) : (
            <>
              <strong>Cobertura em dia</strong>
              <p>
                O estoque cobre os {formatarNumero(pontos.emCirculacao)} pontos em circulação
                {balanco.excedentePontos > 0 &&
                  ` (excedente de ${formatarNumero(balanco.excedentePontos)} pts)`}
                .
              </p>
            </>
          )}
        </div>
      )}

      <div className="admin-resumo__grid">
        <article className="admin-resumo__card admin-resumo__card--clientes">
          <p className="admin-resumo__label">Pontos devidos aos clientes</p>
          <p className="admin-resumo__valor">{formatarNumero(pontos.emCirculacao)}</p>
          <p className="admin-resumo__hint">
            {clientes.comSaldo} cliente{clientes.comSaldo === 1 ? "" : "s"} com saldo · passivo ref.{" "}
            {formatarMoeda(passivoReais)}
          </p>
        </article>

        <article className="admin-resumo__card admin-resumo__card--brindes">
          <p className="admin-resumo__label">Pontos em brindes (estoque)</p>
          <p className="admin-resumo__valor">{formatarNumero(brindes.pontosNoEstoque)}</p>
          <p className="admin-resumo__hint">
            {brindes.unidadesEstoque} unidade{brindes.unidadesEstoque === 1 ? "" : "s"} · cobertura ref.{" "}
            {formatarMoeda(coberturaReais)}
          </p>
        </article>

        <article
          className={`admin-resumo__card admin-resumo__card--balanco ${deficit ? "admin-resumo__card--alerta" : "admin-resumo__card--ok"}`}
        >
          <p className="admin-resumo__label">
            {deficit ? "Déficit de cobertura" : "Cobertura do estoque"}
          </p>
          <p className="admin-resumo__valor">
            {deficit
              ? `-${formatarNumero(balanco.deficitPontos)}`
              : `${balanco.coberturaPercentual}%`}
          </p>
          <p className="admin-resumo__hint">
            {deficit
              ? `${formatarMoeda(deficitReais)} em brindes a repor · ${balanco.coberturaPercentual}% coberto`
              : balanco.excedentePontos > 0
                ? `Excedente de ${formatarNumero(balanco.excedentePontos)} pts no estoque`
                : "Estoque cobre o saldo total dos clientes"}
          </p>
        </article>

        <article className="admin-resumo__card admin-resumo__card--resgates">
          <p className="admin-resumo__label">Pontos já resgatados</p>
          <p className="admin-resumo__valor">{formatarNumero(pontos.resgatados)}</p>
          <p className="admin-resumo__hint">
            {pontos.totalResgates} resgate{pontos.totalResgates === 1 ? "" : "s"} · ref.{" "}
            {formatarMoeda(valorPonto)}/pt
          </p>
        </article>
      </div>

      {brindesAtivosComEstoque.length > 0 && (
        <div className="admin-resumo__detalhe">
          <button
            type="button"
            className="admin-resumo__toggle"
            onClick={() => setDetalheAberto((v) => !v)}
            aria-expanded={detalheAberto}
          >
            {detalheAberto ? "Ocultar detalhamento por brinde" : "Ver pontos por brinde"}
          </button>

          {detalheAberto && (
            <div className="admin-resumo__tabela-wrap">
              <table className="admin-resumo__tabela">
                <thead>
                  <tr>
                    <th>Brinde</th>
                    <th>Estoque</th>
                    <th>Pts/un.</th>
                    <th>Pts no estoque</th>
                    <th>Valor ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {brindesAtivosComEstoque.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.nome}</strong>
                        {item.categoria && <small>{item.categoria}</small>}
                      </td>
                      <td>{item.estoque}</td>
                      <td>{item.pontos}</td>
                      <td>
                        <strong>{formatarNumero(item.pontosNoEstoque)}</strong>
                      </td>
                      <td>
                        {item.valorNoEstoque != null
                          ? formatarMoeda(item.valorNoEstoque)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );

  if (recolhivel) {
    return (
      <details className="admin-resumo-details" open={destaqueRisco}>
        <summary>Resumo geral do clube (gestão)</summary>
        {conteudo}
      </details>
    );
  }

  return conteudo;
}

export function dispararAtualizacaoResumoAdmin() {
  window.dispatchEvent(new Event(ADMIN_RESUMO_REFRESH));
}

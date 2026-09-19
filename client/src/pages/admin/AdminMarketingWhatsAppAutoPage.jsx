import { useCallback, useEffect, useMemo, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import "../../styles/wa-auto-metricas.css";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 14, label: "14 dias" },
  { dias: 30, label: "30 dias" },
];

const LABELS_ACAO = {
  menu: "Menu",
  menu_membro: "Menu (membro)",
  menu_visitante: "Menu (visitante)",
  ofertas: "Ofertas de hoje",
  conversar: "Falar com a loja",
  clube: "Abrir o Clube",
  facebook: "Ver Facebook",
  ver_menu: "Abrir o menu",
  ice_ofertas: "Quebra-gelo · Ofertas",
  ice_clube: "Quebra-gelo · Clube",
  ice_cadastro: "Quebra-gelo · Cadastro",
  catalog_inquiry: "Catálogo · interesse",
  catalog_order: "Catálogo · pedido",
  catalog_pedido_pronto: "Catálogo · pronto p/ equipe",
  catalog_cancelou: "Catálogo · cancelou",
  meu_clube: "Meu Clube",
  clube_mais: "Ver benefícios",
  clube_liberar: "Liberar WhatsApp",
  clube_compra: "Última compra",
  clube_credito: "Meu crédito",
  clube_voltar: "Menu principal",
  cooldown_menu: "Menu bloqueado",
  cooldown_ofertas: "Ofertas em cooldown",
  rate_limit: "Rate limit",
};

function formatarHora(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatarDiaCurto(isoDate) {
  try {
    const [y, m, d] = String(isoDate).split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return isoDate;
  }
}

function formatarTelCompleto(tel, exibicao) {
  if (exibicao) return exibicao;
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  }
  return tel || "—";
}

function BarraFunil({ label, valor, max, tom, hint }) {
  const pctBar = max > 0 ? Math.max(valor > 0 ? 6 : 0, Math.round((valor / max) * 100)) : 0;
  return (
    <div className={`wa-funil__row wa-funil__row--${tom}`}>
      <div className="wa-funil__meta">
        <span className="wa-funil__label">{label}</span>
        <span className="wa-funil__direita">
          {hint ? <span className="wa-funil__hint">{hint}</span> : null}
          <span className="wa-funil__valor">{valor}</span>
        </span>
      </div>
      <div className="wa-funil__track" aria-hidden>
        <div
          className="wa-funil__fill"
          style={{ width: valor > 0 ? `${pctBar}%` : "0%" }}
        />
      </div>
    </div>
  );
}

function SplitBar({ esquerda, direita, labelEsq, labelDir }) {
  const total = Number(esquerda || 0) + Number(direita || 0);
  const pctE = total > 0 ? Math.round((esquerda / total) * 100) : 0;
  const pctD = total > 0 ? 100 - pctE : 0;
  return (
    <div className="wa-split">
      <div className={`wa-split__track${total === 0 ? " wa-split__track--vazio" : ""}`} aria-hidden>
        {total > 0 ? (
          <>
            <span className="wa-split__membro" style={{ width: `${pctE}%` }} />
            <span className="wa-split__visitante" style={{ width: `${pctD}%` }} />
          </>
        ) : null}
      </div>
      <div className="wa-split__labels">
        <span>
          <strong>{esquerda || 0}</strong> {labelEsq}
          {total > 0 ? ` (${pctE}%)` : ""}
        </span>
        <span>
          <strong>{direita || 0}</strong> {labelDir}
          {total > 0 ? ` (${pctD}%)` : ""}
        </span>
      </div>
    </div>
  );
}

function Kpi({ valor, label, hint, tom }) {
  return (
    <article
      className={`admin-usuarios-stat${tom ? ` admin-usuarios-stat--${tom}` : ""}`}
    >
      <span className="admin-usuarios-stat__valor">{valor}</span>
      <span className="admin-usuarios-stat__label">{label}</span>
      {hint ? <span className="wa-kpi-hint">{hint}</span> : null}
    </article>
  );
}

export default function AdminMarketingWhatsAppAutoPage({
  tab,
  onTabChange,
  onLogout,
  admin,
  onVoltarHub,
  onAbrirCampanhas,
}) {
  const [dias, setDias] = useState(7);
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/auto-reply/metricas?dias=${dias}`
      );
      setDados(data);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
      setDados(null);
    } finally {
      setLoading(false);
    }
  }, [dias, onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const maxSerie = useMemo(() => {
    if (!dados?.serieDiaria?.length) return 1;
    let m = 1;
    for (const d of dados.serieDiaria) {
      m = Math.max(
        m,
        (d.menu || 0) +
          (d.ofertas || 0) +
          (d.conversar || 0) +
          (d.clube || 0) +
          (d.facebook || 0) +
          (d.meu_clube || 0)
      );
    }
    return m;
  }, [dados]);

  const maxFunil = Math.max(
    dados?.totais?.menu || 0,
    dados?.totais?.ofertas || 0,
    dados?.totais?.conversar || 0,
    dados?.totais?.clube || 0,
    dados?.totais?.meu_clube || 0,
    1
  );

  const mc = dados?.meuClube?.totais || {};
  const maxFunilClube = Math.max(
    mc.meu_clube || 0,
    mc.clube_mais || 0,
    mc.clube_liberar || 0,
    mc.clube_compra || 0,
    1
  );

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  const t = dados?.totais || {};
  const c = dados?.conversoes || {};
  const aud = dados?.audiencia || {};
  const bloq = dados?.bloqueios || {};
  const mcConv = dados?.meuClube?.conversoes || {};
  const vazio = loading && !dados;

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-marketing-stack wa-auto">
        <header className="admin-page-head wa-auto__head">
          <div className="wa-auto__head-texto">
            <button
              type="button"
              className="admin-btn admin-btn--ghost admin-btn--sm"
              onClick={onVoltarHub}
            >
              ← Marketing
            </button>
            <h1>Auto-resposta WhatsApp</h1>
            <p>
              Menu, ofertas, Meu Clube, bloqueios e perfil de quem interage.
            </p>
          </div>
          <div className="wa-auto__head-actions">
            {onAbrirCampanhas && (
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={onAbrirCampanhas}
              >
                Campanhas
              </button>
            )}
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={carregar}
              disabled={loading}
            >
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>
        </header>

        <div className="admin-marketing-tabs" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              role="tab"
              aria-selected={dias === p.dias}
              className={dias === p.dias ? "is-active" : ""}
              onClick={() => setDias(p.dias)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        {vazio ? (
          <p className="admin-usuarios-loading">Carregando métricas…</p>
        ) : (
          <>
            <section className="admin-usuarios-stats" aria-label="Indicadores">
              <Kpi
                valor={t.menu || 0}
                label="Menus enviados"
                hint={`${dados?.unicos?.menu || 0} números únicos`}
                tom="saldo"
              />
              <Kpi
                valor={t.ofertas || 0}
                label="Ofertas de hoje"
                hint={`${c.ofertas || 0}% do menu`}
              />
              <Kpi
                valor={t.meu_clube || 0}
                label="Meu Clube"
                hint={`${c.meu_clube || 0}% do menu`}
                tom="filtro"
              />
              <Kpi
                valor={t.conversar || 0}
                label="Falar com a loja"
                hint={`${c.conversar || 0}% do menu`}
              />
              <Kpi
                valor={bloq.total || 0}
                label="Bloqueios"
                hint="cooldown + rate limit"
              />
            </section>

            <div className="wa-auto__grid">
              <section className="admin-card">
                <header className="wa-card-head">
                  <h2>Funil de engajamento</h2>
                  <p>Volume de respostas no período</p>
                </header>
                <div className="wa-funil">
                  <BarraFunil label="Menu enviado" valor={t.menu || 0} max={maxFunil} tom="menu" />
                  <BarraFunil label="Ofertas de hoje" valor={t.ofertas || 0} max={maxFunil} tom="ofertas" />
                  <BarraFunil label="Meu Clube" valor={t.meu_clube || 0} max={maxFunil} tom="meu-clube" />
                  <BarraFunil label="Falar com a loja" valor={t.conversar || 0} max={maxFunil} tom="conversar" />
                  <BarraFunil label="Abrir o Clube" valor={t.clube || 0} max={maxFunil} tom="clube" />
                </div>
              </section>

              <section className="admin-card">
                <header className="wa-card-head">
                  <h2>Atividade diária</h2>
                  <p>Menus e cliques por dia (Brasília)</p>
                </header>
                <div className="wa-bars" role="img" aria-label="Gráfico diário">
                  {(dados?.serieDiaria || []).map((dia) => {
                    const total =
                      (dia.menu || 0) +
                      (dia.ofertas || 0) +
                      (dia.conversar || 0) +
                      (dia.clube || 0) +
                      (dia.facebook || 0) +
                      (dia.meu_clube || 0);
                    return (
                      <div key={dia.data} className="wa-bars__col">
                        <div className="wa-bars__stack" title={`${total} eventos`}>
                          {dia.menu > 0 && (
                            <span
                              className="wa-bars__seg wa-bars__seg--menu"
                              style={{
                                flexGrow: dia.menu,
                                flexBasis: 0,
                              }}
                            />
                          )}
                          {dia.ofertas > 0 && (
                            <span
                              className="wa-bars__seg wa-bars__seg--ofertas"
                              style={{
                                flexGrow: dia.ofertas,
                                flexBasis: 0,
                              }}
                            />
                          )}
                          {dia.meu_clube > 0 && (
                            <span
                              className="wa-bars__seg wa-bars__seg--meu-clube"
                              style={{
                                flexGrow: dia.meu_clube,
                                flexBasis: 0,
                              }}
                            />
                          )}
                          {dia.conversar > 0 && (
                            <span
                              className="wa-bars__seg wa-bars__seg--conversar"
                              style={{
                                flexGrow: dia.conversar,
                                flexBasis: 0,
                              }}
                            />
                          )}
                          {dia.clube > 0 && (
                            <span
                              className="wa-bars__seg wa-bars__seg--clube"
                              style={{
                                flexGrow: dia.clube,
                                flexBasis: 0,
                              }}
                            />
                          )}
                          {total === 0 && <span className="wa-bars__seg wa-bars__seg--empty" />}
                          {total > 0 && (
                            <span
                              className="wa-bars__spacer"
                              style={{ flexGrow: Math.max(0, maxSerie - total), flexBasis: 0 }}
                              aria-hidden
                            />
                          )}
                        </div>
                        <span className="wa-bars__label">{formatarDiaCurto(dia.data)}</span>
                        <span className={`wa-bars__n${total ? "" : " is-zero"}`}>{total}</span>
                      </div>
                    );
                  })}
                </div>
                <ul className="wa-legend">
                  <li>
                    <i className="wa-dot wa-dot--menu" /> Menu
                  </li>
                  <li>
                    <i className="wa-dot wa-dot--ofertas" /> Ofertas
                  </li>
                  <li>
                    <i className="wa-dot wa-dot--meu-clube" /> Meu Clube
                  </li>
                  <li>
                    <i className="wa-dot wa-dot--conversar" /> Loja
                  </li>
                  <li>
                    <i className="wa-dot wa-dot--clube" /> Abrir Clube
                  </li>
                </ul>
              </section>
            </div>

            <div className="wa-auto__grid">
              <section className="admin-card">
                <header className="wa-card-head">
                  <h2>Funil Meu Clube</h2>
                  <p>Painel → benefícios, liberação e última compra</p>
                </header>
                <div className="wa-funil">
                  <BarraFunil
                    label="Abriu Meu Clube"
                    valor={mc.meu_clube || 0}
                    max={maxFunilClube}
                    tom="meu-clube"
                    hint={
                      dados?.meuClube?.unicos?.meu_clube
                        ? `${dados.meuClube.unicos.meu_clube} únicos`
                        : null
                    }
                  />
                  <BarraFunil
                    label="Ver benefícios"
                    valor={mc.clube_mais || 0}
                    max={maxFunilClube}
                    tom="beneficios"
                    hint={mcConv.beneficios ? `${mcConv.beneficios}%` : null}
                  />
                  <BarraFunil
                    label="Como liberar"
                    valor={mc.clube_liberar || 0}
                    max={maxFunilClube}
                    tom="liberar"
                    hint={mcConv.liberar ? `${mcConv.liberar}%` : null}
                  />
                  <BarraFunil
                    label="Última compra"
                    valor={mc.clube_compra || 0}
                    max={maxFunilClube}
                    tom="compra"
                    hint={mcConv.compra ? `${mcConv.compra}%` : null}
                  />
                </div>
              </section>

              <section className="admin-card">
                <header className="wa-card-head">
                  <h2>Bloqueios do canal</h2>
                  <p>Quando o bot segura o envio para não saturar</p>
                </header>
                <ul className="wa-bloq-lista">
                  <li>
                    <div>
                      <strong>Menu em cooldown</strong>
                      <span>{bloq.pctMenuBloqueado || 0}% das tentativas de menu</span>
                    </div>
                    <em>{bloq.cooldown_menu || 0}</em>
                  </li>
                  <li>
                    <div>
                      <strong>Ofertas em cooldown</strong>
                      <span>{bloq.pctOfertasCooldown || 0}% dos pedidos de ofertas</span>
                    </div>
                    <em>{bloq.cooldown_ofertas || 0}</em>
                  </li>
                  <li>
                    <div>
                      <strong>Rate limit</strong>
                      <span>{bloq.pctRateLimit || 0}% (limite por minuto)</span>
                    </div>
                    <em>{bloq.rate_limit || 0}</em>
                  </li>
                </ul>
                {(bloq.total || 0) === 0 && (
                  <p className="wa-bloq__empty">
                    Nenhum bloqueio neste período — o canal está fluindo.
                  </p>
                )}
              </section>
            </div>

            <section className="admin-card">
              <header className="wa-card-head">
                <h2>Membro vs visitante</h2>
                <p>
                  Cadastro no mesmo celular → “Meu Clube”; sem cadastro → “Abrir o
                  Clube”
                </p>
              </header>
              <div className="wa-aud">
                <div className="wa-aud__block">
                  <h3>Menus enviados</h3>
                  <SplitBar
                    esquerda={aud.menuMembro || 0}
                    direita={aud.menuVisitante || 0}
                    labelEsq="membros"
                    labelDir="visitantes"
                  />
                  {(aud.menuLegado || 0) > 0 && (
                    <p className="wa-aud__legado">
                      + {aud.menuLegado} menus anteriores sem classificação
                    </p>
                  )}
                </div>
                <div className="wa-aud__block">
                  <h3>CTA do terceiro botão</h3>
                  <SplitBar
                    esquerda={aud.meuClube || 0}
                    direita={aud.abrirClube || 0}
                    labelEsq="Meu Clube"
                    labelDir="Abrir o Clube"
                  />
                </div>
              </div>
            </section>

            <section className="admin-card">
              <header className="wa-card-head">
                <h2>Atividade recente</h2>
                <p>Últimos eventos da auto-resposta</p>
              </header>
              {!dados?.recentes?.length ? (
                <p className="wa-empty">
                  Ainda não há métricas neste período. Assim que alguém receber o
                  menu ou clicar em um botão, os números aparecem aqui.
                </p>
              ) : (
                <div className="wa-feed">
                  {dados.recentes.map((ev) => (
                    <article
                      key={ev.id}
                      className={`wa-feed__item wa-feed__item--${ev.acao}`}
                    >
                      <span className="wa-feed__acao">
                        {LABELS_ACAO[ev.acao] || ev.acao}
                      </span>
                      <div className="wa-feed__quem">
                        {ev.nome ? (
                          <>
                            <strong className="wa-feed__nome">{ev.nome}</strong>
                            <span className="wa-feed__meta">
                              {ev.cpfMascarado ? `CPF ${ev.cpfMascarado}` : null}
                              {ev.clienteCodigo
                                ? `${ev.cpfMascarado ? " · " : ""}Cód. ${ev.clienteCodigo}`
                                : null}
                            </span>
                          </>
                        ) : (
                          <strong className="wa-feed__nome wa-feed__nome--anon">
                            Sem cadastro no Clube
                          </strong>
                        )}
                        <span className="wa-feed__tel">
                          {formatarTelCompleto(ev.telefone, ev.telefoneExibicao)}
                        </span>
                      </div>
                      <time className="wa-feed__hora" dateTime={ev.criadoEm}>
                        {formatarHora(ev.criadoEm)}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

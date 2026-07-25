import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import AdminProgramaBanner from "../../components/admin/AdminProgramaBanner.jsx";
import AdminResumoPontos, {
  dispararAtualizacaoResumoAdmin,
} from "../../components/admin/AdminResumoPontos.jsx";
import AdminComprovantePainel from "../../components/admin/AdminComprovantePainel.jsx";
import AdminOperacoesRecentes from "../../components/admin/AdminOperacoesRecentes.jsx";
import Field from "../../components/Field.jsx";
import { formatarCpfCnpj, cpfValido } from "../../utils/cpf.js";
import { fetchAdmin, clearAdminSession } from "../../utils/adminSession.js";
import { resolveImagemUrl } from "../../utils/imagem.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { imprimirComprovante, carregarComprovante } from "../../utils/adminComprovante.js";
import { adminQueryFromHash } from "../../utils/adminHash.js";
import {
  itensCarrinhoParaApi,
  maxQuantidadeBrinde,
  pontosNoCarrinho,
  quantidadeBrinde,
  totalUnidadesCarrinho,
} from "../../utils/resgateCarrinho.js";

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

function formatarValorAuditoria(valor) {
  if (valor == null || valor === "") return "—";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}

function DetalhesEventoAuditoria({ detalhes }) {
  if (!detalhes || typeof detalhes !== "object") return null;

  if (Array.isArray(detalhes.alteracoes) && detalhes.alteracoes.length > 0) {
    return (
      <ul className="admin-auditoria-alteracoes">
        {detalhes.alteracoes.map((alt) => (
          <li key={alt.campo}>
            <strong>{alt.campo}</strong>: {formatarValorAuditoria(alt.de)} →{" "}
            {formatarValorAuditoria(alt.para)}
          </li>
        ))}
      </ul>
    );
  }

  const extras = Object.entries(detalhes).filter(([chave]) => chave !== "alteracoes");
  if (!extras.length) return null;

  return (
    <ul className="admin-auditoria-alteracoes">
      {extras.map(([chave, valor]) => (
        <li key={chave}>
          <strong>{chave}</strong>: {formatarValorAuditoria(valor)}
        </li>
      ))}
    </ul>
  );
}

function PassoIndicador({ numero, titulo, descricao, estado }) {
  return (
    <li className={`admin-baixa-passo admin-baixa-passo--${estado}`}>
      <span className="admin-baixa-passo__num" aria-hidden>
        {estado === "concluido" ? "✓" : numero}
      </span>
      <div>
        <strong>{titulo}</strong>
        <small>{descricao}</small>
      </div>
    </li>
  );
}

export default function AdminPontosPage({ tab, onTabChange, onLogout, admin }) {
  const [cpfBusca, setCpfBusca] = useState("");
  const [cpfAtual, setCpfAtual] = useState("");
  const [dados, setDados] = useState(null);
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [loadingResgate, setLoadingResgate] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [quantidades, setQuantidades] = useState({});
  const [observacao, setObservacao] = useState("");
  const [comprovanteAtual, setComprovanteAtual] = useState(null);
  const [htmlComprovante, setHtmlComprovante] = useState("");
  const [loadingReimpressao, setLoadingReimpressao] = useState(null);

  const carregarCliente = useCallback(async (cpfNumeros, opts = {}) => {
    const { resetarComprovante = true, resetarMensagens = true } = opts;
    setLoadingBusca(true);
    if (resetarMensagens) {
      setError("");
      setSucesso("");
    }

    try {
      const [data, auditoria] = await Promise.all([
        fetchAdmin(`/api/admin/clientes/${cpfNumeros}/pontos`),
        fetchAdmin(`/api/admin/clientes/${cpfNumeros}/auditoria?limite=100`),
      ]);
      setDados({ ...data, auditoria: auditoria.eventos ?? [] });
      setCpfAtual(cpfNumeros);
      setQuantidades({});
      if (resetarComprovante) {
        setComprovanteAtual(null);
        setHtmlComprovante("");
      }
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setDados(null);
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingBusca(false);
    }
  }, [onLogout]);

  const cpfInicialCarregado = useRef(false);

  useEffect(() => {
    if (cpfInicialCarregado.current) return;
    const cpfParam = adminQueryFromHash().get("cpf");
    if (!cpfParam) return;

    const cpfNorm = cpfParam.replace(/\D/g, "");
    if (cpfNorm.length !== 11 && cpfNorm.length !== 14) return;

    cpfInicialCarregado.current = true;
    setCpfBusca(formatarCpfCnpj(cpfNorm));
    carregarCliente(cpfNorm);
  }, [carregarCliente]);

  function handleBuscar(event) {
    event.preventDefault();
    const cpfNorm = cpfBusca.replace(/\D/g, "");

    if (!cpfValido(cpfNorm) && cpfNorm.length !== 14) {
      setError("Informe um CPF válido");
      return;
    }

    if (
      comprovanteAtual &&
      !comprovanteAtual.assinaturaConfirmadaEm &&
      !window.confirm(
        "Há um comprovante aguardando assinatura. Buscar outro cliente mesmo assim?"
      )
    ) {
      return;
    }

    carregarCliente(cpfNorm);
  }

  function ajustarQuantidade(brinde, delta) {
    const key = String(brinde.id);
    const catalogo = dados?.brindes || [];
    const saldo = dados?.pontos?.saldo ?? 0;

    setQuantidades((prev) => {
      const atual = quantidadeBrinde(prev, brinde.id);
      const max = maxQuantidadeBrinde(brinde, saldo, prev, catalogo);
      const novo = Math.max(0, Math.min(atual + delta, max));

      if (novo === 0) {
        const { [key]: _, ...resto } = prev;
        return resto;
      }
      return { ...prev, [key]: novo };
    });
  }

  const pontosSelecionados = useMemo(
    () => pontosNoCarrinho(dados?.brindes, quantidades),
    [dados, quantidades]
  );

  const unidadesSelecionadas = useMemo(
    () => totalUnidadesCarrinho(quantidades),
    [quantidades]
  );

  const linhasCarrinho = useMemo(() => {
    return (dados?.brindes || [])
      .map((brinde) => {
        const qtd = quantidadeBrinde(quantidades, brinde.id);
        if (qtd <= 0) return null;
        return {
          ...brinde,
          quantidade: qtd,
          pontosLinha: qtd * (Number(brinde.pontos) || 0),
        };
      })
      .filter(Boolean);
  }, [dados, quantidades]);

  async function handleResgate(event) {
    event.preventDefault();
    setError("");
    setSucesso("");

    if (unidadesSelecionadas <= 0) {
      setError("Selecione ao menos um prêmio para resgate");
      return;
    }

    if (!cpfAtual) return;

    setLoadingResgate(true);

    try {
      const resultado = await fetchAdmin(`/api/admin/clientes/${cpfAtual}/resgates`, {
        method: "POST",
        body: JSON.stringify({
          itens: itensCarrinhoParaApi(quantidades),
          observacao: observacao.trim() || undefined,
        }),
      });

      const mensagem = resultado.message || "Resgate registrado";
      const comprovante = resultado.comprovante;
      const html = resultado.htmlComprovante || "";

      setQuantidades({});
      setObservacao("");
      dispararAtualizacaoResumoAdmin();
      await carregarCliente(cpfAtual, {
        resetarComprovante: false,
        resetarMensagens: false,
      });

      setSucesso(mensagem);
      setComprovanteAtual(comprovante);
      setHtmlComprovante(html);

      if (html) {
        try {
          imprimirComprovante(html);
        } catch (printErr) {
          setError(mensagemParaUsuario(printErr.message));
        }
      }
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingResgate(false);
    }
  }

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  async function handleReimprimirComprovante(codigo) {
    if (!codigo) return;
    setError("");
    setLoadingReimpressao(codigo);
    try {
      const resultado = await carregarComprovante(codigo);
      setComprovanteAtual(resultado.comprovante);
      setHtmlComprovante(resultado.htmlComprovante || "");
      if (resultado.htmlComprovante) {
        imprimirComprovante(resultado.htmlComprovante);
      }
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingReimpressao(null);
    }
  }

  const saldoCliente = dados?.pontos?.saldo ?? 0;
  const saldoInsuficiente = pontosSelecionados > saldoCliente;
  const pontosRestantes = Math.max(0, saldoCliente - pontosSelecionados);
  const aguardandoAssinatura =
    comprovanteAtual && !comprovanteAtual.assinaturaConfirmadaEm;
  const passoBusca = !dados ? "ativo" : "concluido";
  const passoPremio =
    dados && !aguardandoAssinatura && unidadesSelecionadas === 0 && !comprovanteAtual
      ? "ativo"
      : dados
        ? "concluido"
        : "pendente";
  const passoConfirmar =
    unidadesSelecionadas > 0 ? "ativo" : comprovanteAtual ? "concluido" : "pendente";
  const passoAssinatura = aguardandoAssinatura
    ? "ativo"
    : comprovanteAtual?.assinaturaConfirmadaEm
      ? "concluido"
      : "pendente";

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <AdminProgramaBanner />
      <div className="admin-pontos-stack admin-baixa-atendimento">
        <ol className="admin-baixa-passos" aria-label="Passos do atendimento">
          <PassoIndicador
            numero="1"
            titulo="Buscar cliente"
            descricao="Digite o CPF e clique em Buscar"
            estado={passoBusca}
          />
          <PassoIndicador
            numero="2"
            titulo="Escolher prêmio"
            descricao="Toque no que o cliente quer levar"
            estado={dados ? passoPremio : "pendente"}
          />
          <PassoIndicador
            numero="3"
            titulo="Confirmar e imprimir"
            descricao="Gera o comprovante para assinatura"
            estado={dados ? passoConfirmar : "pendente"}
          />
          <PassoIndicador
            numero="4"
            titulo="Assinatura do cliente"
            descricao="Confirme após o cliente assinar"
            estado={dados || comprovanteAtual ? passoAssinatura : "pendente"}
          />
        </ol>

        <AdminResumoPontos onLogout={handleSair} destaqueRisco />

        {(error || sucesso) && (
          <div className="admin-feedback admin-baixa-feedback">
            {error && (
              <p className="admin-alert admin-baixa-alert" role="alert">
                {error}
              </p>
            )}
            {sucesso && (
              <p className="admin-success admin-baixa-success" role="status">
                {sucesso}
              </p>
            )}
          </div>
        )}

        <section className="admin-card admin-baixa-busca">
          <div className="admin-baixa-busca__head">
            <span className="admin-baixa-etapa">Passo 1</span>
            <h2>Buscar o cliente</h2>
            <p>Pedir o CPF do cliente, digitar abaixo e clicar em <strong>Buscar cliente</strong>.</p>
          </div>
          <form className="admin-baixa-busca__form" onSubmit={handleBuscar}>
            <Field label="CPF do cliente" id="admin-cpf">
              <input
                id="admin-cpf"
                className="admin-baixa-cpf-input"
                name="cpf"
                inputMode="numeric"
                value={cpfBusca}
                onChange={(e) => setCpfBusca(formatarCpfCnpj(e.target.value))}
                placeholder="000.000.000-00"
                autoComplete="off"
                required
              />
            </Field>
            <button
              type="submit"
              className="admin-btn admin-btn--primary admin-btn--lg"
              disabled={loadingBusca}
            >
              {loadingBusca ? "Buscando…" : "Buscar cliente"}
            </button>
          </form>
        </section>

        {dados && (
          <>
            <section className="admin-baixa-hero" aria-label="Cliente selecionado">
              <div className="admin-baixa-hero__cliente">
                <p className="admin-baixa-hero__rotulo">Cliente encontrado</p>
                <h2 className="admin-baixa-hero__nome">{dados.cliente.nome || "Sem nome"}</h2>
                <p className="admin-baixa-hero__cpf">{formatarCpfCnpj(dados.cliente.cpf)}</p>
              </div>
              <div
                className={`admin-baixa-hero__saldo ${saldoCliente <= 0 ? "admin-baixa-hero__saldo--zero" : ""}`}
              >
                <span className="admin-baixa-hero__saldo-valor">{saldoCliente}</span>
                <span className="admin-baixa-hero__saldo-label">
                  {saldoCliente === 1 ? "ponto disponível" : "pontos disponíveis"}
                </span>
                {pontosSelecionados > 0 && (
                  <p className="admin-baixa-hero__restante">
                    Restam <strong>{pontosRestantes}</strong> após esta seleção
                  </p>
                )}
              </div>
            </section>

            {saldoCliente <= 0 && (
              <p className="admin-alert admin-baixa-alert" role="alert">
                Este cliente não tem pontos para resgatar no momento.
              </p>
            )}

            {comprovanteAtual && (
              <AdminComprovantePainel
                comprovante={comprovanteAtual}
                htmlComprovante={htmlComprovante}
                onAtualizado={async (resultado) => {
                  setComprovanteAtual(resultado.comprovante);
                  setHtmlComprovante(resultado.htmlComprovante || "");
                  setSucesso(resultado.message || "Assinatura registrada");
                  dispararAtualizacaoResumoAdmin();
                  if (cpfAtual) {
                    await carregarCliente(cpfAtual, {
                      resetarComprovante: false,
                      resetarMensagens: false,
                    });
                  }
                }}
                onConcluido={() => {
                  setSucesso("Atendimento concluído. Pode iniciar um novo resgate.");
                }}
                onFechar={() => {
                  setComprovanteAtual(null);
                  setHtmlComprovante("");
                }}
              />
            )}

            <section
              className={`admin-card admin-baixa-premios${aguardandoAssinatura ? " admin-baixa-premios--bloqueado" : ""}`}
            >
              <div className="admin-baixa-premios__head">
                <span className="admin-baixa-etapa">Passo 2</span>
                <h2>Escolher o prêmio</h2>
                <p>
                  Use os botões <strong>+</strong> e <strong>−</strong> para escolher quantas
                  unidades de cada prêmio. Pode levar 2 ou mais do mesmo item, se houver estoque e
                  pontos.
                </p>
              </div>

              {aguardandoAssinatura && (
                <p className="admin-baixa-bloqueio" role="status">
                  Confirme a assinatura do comprovante acima para liberar um novo resgate.
                </p>
              )}

              {!dados.brindes?.length ? (
                <p className="admin-empty admin-baixa-empty">
                  Não há prêmios disponíveis no estoque no momento. Avise o gerente.
                </p>
              ) : (
                <div className="admin-resgate-grid admin-resgate-grid--atendimento">
                  {(dados.brindes || []).map((brinde) => {
                    const img = resolveImagemUrl(brinde.imagemUrl);
                    const qtd = quantidadeBrinde(quantidades, brinde.id);
                    const maxQtd = maxQuantidadeBrinde(
                      brinde,
                      saldoCliente,
                      quantidades,
                      dados.brindes
                    );
                    const selecionado = qtd > 0;

                    return (
                      <article
                        key={brinde.id}
                        className={`admin-resgate-card admin-resgate-card--atendimento admin-resgate-card--qty ${selecionado ? "admin-resgate-card--sel" : ""} ${maxQtd <= 0 && !selecionado ? "admin-resgate-card--off" : ""}`}
                      >
                        {selecionado && (
                          <span className="admin-resgate-card__check" aria-hidden>
                            {qtd}
                          </span>
                        )}
                        <div className="admin-resgate-card__img">
                          {img ? (
                            <img src={img} alt="" />
                          ) : (
                            <span aria-hidden>🎁</span>
                          )}
                        </div>
                        <div className="admin-resgate-card__body">
                          <strong>{brinde.nome}</strong>
                          <span className="admin-resgate-card__pts">{brinde.pontos} pontos cada</span>
                          <small className="admin-resgate-card__estoque">
                            {brinde.estoque} em estoque
                          </small>
                        </div>
                        <div className="admin-resgate-qty">
                          <button
                            type="button"
                            className="admin-resgate-qty__btn"
                            aria-label={`Menos um ${brinde.nome}`}
                            disabled={qtd <= 0 || aguardandoAssinatura}
                            onClick={() => ajustarQuantidade(brinde, -1)}
                          >
                            −
                          </button>
                          <span className="admin-resgate-qty__valor" aria-live="polite">
                            {qtd}
                          </span>
                          <button
                            type="button"
                            className="admin-resgate-qty__btn"
                            aria-label={`Mais um ${brinde.nome}`}
                            disabled={qtd >= maxQtd || aguardandoAssinatura}
                            onClick={() => ajustarQuantidade(brinde, 1)}
                          >
                            +
                          </button>
                        </div>
                        {maxQtd <= 0 && !selecionado && saldoCliente < brinde.pontos && (
                          <small className="admin-resgate-card__warn">Pontos insuficientes</small>
                        )}
                        {maxQtd <= 0 && !selecionado && brinde.estoque <= 0 && (
                          <small className="admin-resgate-card__warn">Esgotado</small>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {linhasCarrinho.length > 0 && (
              <section className="admin-baixa-confirmar admin-card">
                <div className="admin-baixa-confirmar__head">
                  <span className="admin-baixa-etapa">Passo 3</span>
                  <h2>Finalizar o resgate</h2>
                  <p>Confira com o cliente e clique no botão verde. O comprovante abrirá para impressão.</p>
                </div>

                <div className="admin-baixa-confirmar__resumo">
                  <p className="admin-baixa-confirmar__titulo">O cliente vai levar:</p>
                  <ul className="admin-baixa-confirmar__lista">
                    {linhasCarrinho.map((b) => (
                      <li key={b.id}>
                        <span>
                          {b.nome}
                          {b.quantidade > 1 ? ` × ${b.quantidade}` : ""}
                        </span>
                        <strong>{b.pontosLinha} pts</strong>
                      </li>
                    ))}
                  </ul>
                  <p className="admin-baixa-confirmar__total">
                    Total: <strong>{pontosSelecionados} pontos</strong>
                    <span>
                      {" "}
                      (saldo após resgate: {saldoCliente - pontosSelecionados})
                    </span>
                  </p>
                </div>

                {saldoInsuficiente && (
                  <p className="admin-alert" role="alert">
                    Saldo insuficiente. Remova algum prêmio da seleção.
                  </p>
                )}

                <form className="admin-baixa-confirmar__form" onSubmit={handleResgate}>
                  <Field label="Observação (opcional)" id="admin-obs">
                    <input
                      id="admin-obs"
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                      placeholder="Ex.: Caixa 3, loja centro"
                    />
                  </Field>
                  <button
                    type="submit"
                    className="admin-btn admin-btn--primary admin-btn--lg admin-btn--block"
                    disabled={loadingResgate || saldoInsuficiente || aguardandoAssinatura}
                  >
                    {loadingResgate
                      ? "Gerando comprovante…"
                      : "Confirmar resgate e imprimir comprovante"}
                  </button>
                  <p className="admin-baixa-confirmar__dica">
                    Depois da impressão, peça a assinatura do cliente no comprovante e confirme no
                    sistema.
                  </p>
                </form>
              </section>
            )}

            <details className="admin-baixa-extra">
              <summary>Histórico de resgates deste cliente</summary>
              <div className="admin-baixa-extra__corpo">
                {dados.baixas?.length ? (
                  <ul className="admin-lista">
                    {dados.baixas.map((item) => (
                      <li key={item.id} className="admin-lista__item">
                        <div>
                          <strong>-{item.pontos} pts</strong>
                          {item.brindeNome && <span> · {item.brindeNome}</span>}
                        </div>
                        {item.codigoResgate && (
                          <p className="admin-lista__codigo">
                            Código: <strong>{item.codigoResgate}</strong>
                            {item.assinaturaConfirmadaEm && (
                              <span className="admin-lista__assinado"> · Assinado</span>
                            )}
                            <button
                              type="button"
                              className="admin-link-btn"
                              disabled={loadingReimpressao === item.codigoResgate}
                              onClick={() => handleReimprimirComprovante(item.codigoResgate)}
                            >
                              {loadingReimpressao === item.codigoResgate
                                ? "Abrindo…"
                                : " · Reimprimir"}
                            </button>
                          </p>
                        )}
                        <small>
                          {formatarDataHora(item.criadoEm)} · {item.adminUsuario}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Nenhum resgate anterior.</p>
                )}
              </div>
            </details>

            <details className="admin-baixa-extra">
              <summary>Consulta técnica (acessos e alterações do cliente)</summary>
              <div className="admin-baixa-extra__corpo">
                {dados.auditoria?.length ? (
                  <ul className="admin-auditoria">
                    {dados.auditoria.map((item) => (
                      <li
                        key={item.id}
                        className={`admin-auditoria__item${item.sucesso ? "" : " admin-auditoria__item--falha"}`}
                      >
                        <div className="admin-auditoria__top">
                          <strong>{item.eventoLabel || item.evento}</strong>
                          <time>{formatarDataHora(item.criadoEm)}</time>
                        </div>
                        <DetalhesEventoAuditoria detalhes={item.detalhes} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-empty">Nenhum registro.</p>
                )}
              </div>
            </details>
          </>
        )}

        <AdminOperacoesRecentes onLogout={handleSair} />
      </div>
    </AdminLayout>
  );
}

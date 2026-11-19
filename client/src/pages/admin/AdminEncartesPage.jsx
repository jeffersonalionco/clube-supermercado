import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Image, LayoutTemplate, PackagePlus, Trash2 } from "lucide-react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { apiUrl } from "../../utils/api.js";
import { fetchAdmin } from "../../utils/adminSession.js";
import { obterFormatosCampanhaEncarte, obterGrupoModeloEncarte } from "../../../../shared/modelosEncarte.js";
import { precoAnteriorEncarte, precoAtualEncarte, precoManualValido, unidadeExibidaEncarte, validadePrecoEncarte } from "../../../../shared/precosEncarte.js";
import EncarteCatalogo, { API_ENCARTE, CampoImagem, enviarImagemEncarte } from "./EncarteCatalogo.jsx";
import EncarteBiblioteca from "./EncarteBiblioteca.jsx";
import EncarteGaleria from "./EncarteGaleria.jsx";
import EncarteAnimacao from "./EncarteAnimacao.jsx";
import EncartePreviaTelaCheia from "./EncartePreviaTelaCheia.jsx";
import EncarteSaida from "./EncarteSaida.jsx";
import EncarteSelecaoFormatos from "./EncarteSelecaoFormatos.jsx";
import { dataEncarte, gerarImagemEncarte, hojeSp, ImagemProduto, moedaEncarte, PreviaEncarte, rotuloPreco } from "./EncarteFolha.jsx";
import "./adminEncartes.css";

const LIMITE_ITENS = 24;
function RevisaoPrecos({ revisao, aplicar }) {
  return (
    <section className="encarte-painel encarte-revisao">
      <h2>Revise os preços antes de finalizar</h2>
      <ul>
        {revisao.alterados.map(({ anterior, atual }) => {
          const deAnterior = precoAnteriorEncarte(anterior);
          const deAtual = precoAnteriorEncarte(atual);
          const validadeAnterior = validadePrecoEncarte(anterior);
          const validadeAtual = validadePrecoEncarte(atual);
          return (
            <li key={atual.codigo}>
              <strong>{atual.descricao}</strong>
              <span>{rotuloPreco[anterior.tipo]} {moedaEncarte.format(precoAtualEncarte(anterior))}/{unidadeExibidaEncarte(anterior)}
                {validadeAnterior && ` até ${dataEncarte(validadeAnterior)}`}
                {" → "}{rotuloPreco[atual.tipo]} {moedaEncarte.format(precoAtualEncarte(atual))}/{unidadeExibidaEncarte(atual)}
                {validadeAtual && ` até ${dataEncarte(validadeAtual)}`}
              </span>
              {deAnterior !== deAtual && (
                <span>Preço anterior: {deAnterior === null ? "—" : moedaEncarte.format(deAnterior)}
                  {" → "}{deAtual === null ? "—" : moedaEncarte.format(deAtual)}
                </span>
              )}
            </li>
          );
        })}
        {revisao.indisponiveis.map((codigo) => <li key={codigo}>Produto #{codigo} indisponível.</li>)}
      </ul>
      <button type="button" onClick={aplicar}>Aplicar revisão</button>
    </section>
  );
}

export default function AdminEncartesPage({ onVoltar, ...layout }) {
  const [area, setArea] = useState("modelos");
  const [historico, setHistorico] = useState(null);
  const [dados, setDados] = useState(null);
  const [produtoEmEdicao, setProdutoEmEdicao] = useState(null);
  const [registro, setRegistro] = useState(null);
  const [formatoAtivo, setFormatoAtivo] = useState(null);
  const [paginas, setPaginas] = useState({});
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [revisao, setRevisao] = useState(null);
  const [progressoSync, setProgressoSync] = useState(null);
  const [progressoPacote, setProgressoPacote] = useState("");
  const [versaoCatalogo, setVersaoCatalogo] = useState(0);
  const finalizado = Boolean(registro?.finalizado_em);
  const onLogout = layout.onLogout;

  const executar = useCallback(async (acao) => {
    setOcupado(true);
    setErro("");
    setMensagem("");
    try {
      await acao();
    } catch (falha) {
      if (falha.code === "UNAUTHORIZED") onLogout();
      else setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }, [onLogout]);

  const carregarHistorico = useCallback(async () => {
    setHistorico(await fetchAdmin(API_ENCARTE));
  }, []);

  useEffect(() => {
    executar(carregarHistorico);
  }, [executar, carregarHistorico]);

  function abrir(dadosNovos, registroNovo = null) {
    setProdutoEmEdicao(null);
    setDados(dadosNovos);
    setRegistro(registroNovo);
    setFormatoAtivo(dadosNovos.modelo);
    setPaginas({});
    setRevisao(null);
    setErro("");
    setMensagem("");
    setArea("editor");
  }

  function mudarArea(nova) {
    setErro("");
    setMensagem("");
    setArea(nova);
  }

  function escolher(modelo, formatos) {
    const hoje = hojeSp();
    abrir({
      titulo: modelo.tema === "black-friday" ? "Ofertas Black Friday" : modelo.nome,
      modelo: modelo.id, unidade: historico.unidade, inicio: hoje, fim: hoje, itens: [],
      ...(formatos?.length > 1 ? { formatos } : {}),
    });
  }

  async function abrirHistorico(id) {
    const { encarte } = await fetchAdmin(`${API_ENCARTE}/${id}`);
    abrir(encarte.dados, encarte);
  }

  async function adicionar(codigo) {
    if (dados.itens.some((item) => item.codigo === codigo)) return;
    const { item } = await fetchAdmin(`${API_ENCARTE}/produtos/${encodeURIComponent(codigo)}/adicionar`, {
      method: "POST", body: JSON.stringify({ unidade: dados.unidade }),
    });
    if (dados.itens.some((anterior) => anterior.codigo === item.codigo)) return;
    atualizarItens([...dados.itens, item]);
    selecionarPagina(Math.floor(dados.itens.length / porPagina) + 1);
  }

  function atualizarItens(itens) {
    setDados({ ...dados, itens });
    setProdutoEmEdicao((codigo) => itens.some((item) => item.codigo === codigo) ? codigo : null);
    setRevisao(null);
  }

  function atualizarItem(codigo, campos) {
    atualizarItens(dados.itens.map((item) => item.codigo === codigo ? { ...item, ...campos } : item));
  }

  function moverItem(indice, delta) {
    const itens = [...dados.itens];
    const destino = indice + delta;
    [itens[indice], itens[destino]] = [itens[destino], itens[indice]];
    atualizarItens(itens);
    selecionarPagina(Math.floor(destino / porPagina) + 1);
  }

  async function sincronizarPrecos() {
    setProgressoSync(0);
    try {
      const params = new URLSearchParams({ unidade: dados.unidade });
      const rota = `${API_ENCARTE}/sincronizacao`;
      let status = await fetchAdmin(rota, {
        method: "POST",
        body: JSON.stringify({ unidade: dados.unidade }),
      });
      while (status.sincronizando) {
        setProgressoSync(status.totalCatalogo);
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        status = await fetchAdmin(`${rota}?${params}`);
      }
      if (status.erroSync) throw new Error("A sincronização falhou. Tente novamente.");

      setVersaoCatalogo((atual) => atual + 1);
      if (dados.itens.length) {
        const { revisao: resultado } = await fetchAdmin(`${API_ENCARTE}/revisar-precos`, {
          method: "POST",
          body: JSON.stringify({ dados }),
        });
        const mudou = resultado.alterados.length || resultado.indisponiveis.length;
        if (mudou) setRevisao(resultado);
        else atualizarItens(resultado.itens);
        setMensagem(mudou ? "Sincronização concluída. Revise as alterações nos produtos." : "Sincronização concluída. Os preços do encarte estão atualizados.");
      } else {
        setMensagem("Sincronização concluída.");
      }
    } finally {
      setProgressoSync(null);
    }
  }

  async function salvar(finalizar) {
    const resultado = await fetchAdmin(API_ENCARTE, {
      method: "POST",
      body: JSON.stringify({ id: registro?.id, versao: registro?.versao, dados, finalizar }),
    });
    if (resultado.revisao) {
      setRevisao(resultado.revisao);
      return;
    }
    setRevisao(null);
    setRegistro(resultado.encarte);
    setDados(resultado.encarte.dados);
    await carregarHistorico();
    setMensagem(finalizar ? "Encarte finalizado. As páginas estão prontas para baixar." : "Rascunho salvo.");
  }

  async function publicarPagina() {
    const imagem = await gerarImagemEncarte(modelo);
    const body = new FormData();
    body.append("imagem", imagem, "encarte.png");
    const params = new URLSearchParams({ formato: modelo.id });
    const { publicacao } = await fetchAdmin(
      `${API_ENCARTE}/${registro.id}/publicacoes/${pagina}?${params}`, { method: "POST", body }
    );
    setRegistro((atual) => ({
      ...atual, publicacoes: [...(atual.publicacoes ?? []), publicacao],
    }));
    setMensagem(`Link público da página ${pagina} gerado.`);
  }

  const formatos = obterFormatosCampanhaEncarte(dados);
  const modelo = formatos.find(({ id }) => id === formatoAtivo) ?? formatos[0];
  const dadosDaPrevia = useMemo(() => dados && { ...dados, modelo: modelo.id }, [dados, modelo.id]);
  const opcoesFormatos = obterGrupoModeloEncarte(dados?.modelo)?.versoes ?? [];
  const etiquetas = modelo.tema === "etiquetas";
  const etiquetaBlackFriday = modelo.id === "a4-black-friday-dobro";
  const etiquetaClubeOferta = modelo.id === "a4-clube-oferta";
  const porPagina = modelo.colunas * modelo.linhas;
  const total = Math.max(1, Math.ceil((dados?.itens.length ?? 0) / porPagina));
  const pagina = Math.min(paginas[modelo.id] ?? 1, total);
  const publicacao = registro?.publicacoes?.find((item) =>
    item.pagina === pagina && (item.formato || formatos[0].id) === modelo.id
  );
  const linkPublico = publicacao
    ? new URL(apiUrl(`/api/marketing/encartes/publicados/${publicacao.id}.png`), window.location.origin).href
    : null;

  function selecionarPagina(nova) {
    setPaginas((atuais) => ({ ...atuais, [modelo.id]: nova }));
  }

  function atualizarFormatos(selecionados) {
    const principal = selecionados.includes(dados.modelo) ? dados.modelo : selecionados[0];
    setDados({ ...dados, modelo: principal, formatos: selecionados });
    if (!selecionados.includes(modelo.id)) setFormatoAtivo(principal);
    setRevisao(null);
  }

  const paginacao = (
    <div className="encarte-acoes encarte-paginacao">
      <button type="button" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => selecionarPagina(pagina - 1)}><ChevronLeft size={16} /></button>
      <span aria-live="polite">{pagina}/{total}</span>
      <button type="button" aria-label="Próxima página" disabled={pagina >= total} onClick={() => selecionarPagina(pagina + 1)}><ChevronRight size={16} /></button>
    </div>
  );
  const abasFormatos = formatos.length > 1 && (
    <div className="encarte-abas-formatos" role="group" aria-label="Formato da prévia">
      {formatos.map((formato) => (
        <button type="button" key={formato.id} aria-pressed={modelo.id === formato.id}
          onClick={() => setFormatoAtivo(formato.id)}>{formato.formato}</button>
      ))}
    </div>
  );
  const previa = {
    dados: dadosDaPrevia, pagina, total,
    itens: dados?.itens.slice((pagina - 1) * porPagina, pagina * porPagina),
  };

  return (
    <AdminLayout {...layout}>
      <main className="admin-encartes">
        <header className="encarte-cabecalho">
          <button type="button" className="encarte-voltar" onClick={onVoltar}><ArrowLeft size={16} /> Marketing</button>
          <h1>Encartes</h1>
        </header>
        <nav className="encarte-nav" aria-label="Encartes">
          <button type="button" disabled={ocupado} aria-current={area === "modelos" ? "page" : undefined} onClick={() => mudarArea("modelos")}>
            <LayoutTemplate size={17} /> Modelos
          </button>
          {dados && (
            <button type="button" disabled={ocupado} aria-current={area === "editor" ? "page" : undefined} onClick={() => mudarArea("editor")}>
              {finalizado ? "Encarte aberto" : "Editor"}
            </button>
          )}
          <button type="button" disabled={ocupado} aria-current={area === "imagens" ? "page" : undefined} onClick={() => mudarArea("imagens")}>
            <Image size={17} /> Imagens Encarte
          </button>
          {historico && (
            <label className="encarte-historico">
              <span>Histórico</span>
              <select aria-label="Abrir encarte do histórico" value={area === "editor" ? registro?.id ?? "" : ""}
                disabled={ocupado} onChange={(evento) => {
                  const id = evento.target.value;
                  if (id) executar(() => abrirHistorico(id));
                }}>
                <option value="">Abrir encarte</option>
                {historico.encartes.map((encarte) => (
                  <option key={encarte.id} value={encarte.id}>
                    {encarte.titulo} · {encarte.finalizado_em ? "Finalizado" : "Rascunho"} · #{encarte.id}
                  </option>
                ))}
              </select>
            </label>
          )}
        </nav>
        {erro && !finalizado && <p className="admin-alert" role="alert">{erro}</p>}
        {mensagem && !finalizado && <p className="encarte-feedback" role="status">{mensagem}</p>}
        {ocupado && <p className="encarte-secundario" role="status">Aguarde…</p>}
        {!historico && !ocupado && <button type="button" onClick={() => executar(carregarHistorico)}>Recarregar encartes</button>}
        {historico && area === "modelos" && (
          <>
            <div className="encarte-intro"><h2>Escolha um modelo</h2><p>Abra o editor com o layout no tamanho do canal de divulgação.</p></div>
            <EncarteGaleria escolher={escolher} />
          </>
        )}
        {historico && area === "imagens" && (
          <EncarteBiblioteca unidade={dados?.unidade || historico.unidade} onSessaoExpirada={onLogout}
            onVincular={(imagem) => {
              if (finalizado) return;
              setDados((atual) => atual && ({
                ...atual,
                itens: atual.itens.map((item) => item.codigo === imagem.codigo ? { ...item, imagemId: imagem.id } : item),
              }));
            }} />
        )}
        {dados && area === "editor" && (
          <fieldset className={`encarte-controles ${finalizado ? "encarte-finalizado-grade" : "encarte-editor-grade"}`} disabled={ocupado}>
            {!finalizado && (
              <form className="encarte-editor" onSubmit={(evento) => {
                evento.preventDefault();
                executar(() => salvar(false));
              }}>
                <section className="encarte-painel">
                  <div className="encarte-painel-titulo encarte-campanha-topo">
                    <div><h2>Campanha</h2><p>{modelo.nome} · {formatos.length > 1 ? `${formatos.length} formatos` : modelo.formato}</p></div>
                    <button type="button" className="encarte-ir-previa" onClick={() => {
                      document.getElementById("encarte-previa").scrollIntoView({ block: "start" });
                    }}>Ver prévia</button>
                  </div>
                  <div className="encarte-campos">
                    <label className="encarte-campo encarte-titulo-campo">Título
                      <input required maxLength={70} value={dados.titulo} onChange={(evento) => setDados({ ...dados, titulo: evento.target.value })} />
                    </label>
                    <label className="encarte-campo">Loja
                      <input required inputMode="numeric" pattern="[0-9]{1,6}" value={dados.unidade}
                        disabled={dados.itens.length > 0} onChange={(evento) => setDados({ ...dados, unidade: evento.target.value })} />
                    </label>
                    {["inicio", "fim"].map((campo) => (
                      <label className="encarte-campo" key={campo}>{campo === "inicio" ? "Início" : "Válido até"}
                        <input required type="date" value={dados[campo]} min={campo === "fim" ? dados.inicio : undefined}
                          onChange={(evento) => {
                            setDados({ ...dados, [campo]: evento.target.value });
                            setRevisao(null);
                          }} />
                      </label>
                    ))}
                  </div>
                  {opcoesFormatos.length > 1 && (
                    <EncarteSelecaoFormatos titulo="Formatos da campanha" modelo={modelo.nome} confirmar="Aplicar formatos"
                      opcoes={opcoesFormatos} selecionados={formatos.map(({ id }) => id)} onChange={atualizarFormatos} />
                  )}
                </section>
                <section className="encarte-painel">
                  <div className="encarte-painel-titulo encarte-campanha-topo">
                    <div className="encarte-painel-titulo"><PackagePlus size={20} /><h2>Adicionar produtos</h2></div>
                    <button type="button" disabled={!/^\d{1,6}$/.test(dados.unidade)}
                      onClick={() => executar(sincronizarPrecos)}>Sincronizar preços</button>
                  </div>
                  {progressoSync !== null && <p role="status" className="encarte-secundario">
                    Sincronizando preços com o ERP… {progressoSync > 0 && `${progressoSync.toLocaleString("pt-BR")} produtos lidos.`}
                  </p>}
                  <EncarteCatalogo key={dados.unidade} unidade={dados.unidade} versaoCatalogo={versaoCatalogo} onSessaoExpirada={onLogout}
                    selecionados={dados.itens.map((item) => item.codigo)} cheio={dados.itens.length >= LIMITE_ITENS}
                    onSelecionar={(codigo) => executar(() => adicionar(codigo))} />
                </section>
                <section className="encarte-painel">
                  <div className="encarte-painel-titulo"><div><h2>Produtos no encarte</h2><p>{dados.itens.length} de {LIMITE_ITENS}</p></div></div>
                  {!dados.itens.length && <p className="encarte-secundario">Adicione produtos pelo catálogo para montar a primeira página.</p>}
                  <ol className="encarte-itens">
                    {dados.itens.map((item, indice) => (
                      <li key={item.codigo}>
                        <details open={produtoEmEdicao === item.codigo}>
                          <summary onClick={(evento) => {
                            evento.preventDefault();
                            setProdutoEmEdicao((codigo) => codigo === item.codigo ? null : item.codigo);
                          }}>
                            <div className="encarte-miniatura"><ImagemProduto id={item.imagemId} /></div>
                            <div className="encarte-resultado-texto">
                              <strong>{item.nome || item.descricao}</strong>
                              <small>{moedaEncarte.format(precoAtualEncarte(item))}/{unidadeExibidaEncarte(item)} · {rotuloPreco[item.tipo]}
                                {item.precoAtualEditado != null && " · Preço manual"}
                                {validadePrecoEncarte(item) && ` · Até ${dataEncarte(item.validade)}`}
                              </small>
                            </div>
                            <ChevronDown size={16} />
                          </summary>
                          <div className="encarte-item-acoes">
                            <fieldset className="encarte-item-grupo">
                              <legend>Apresentação</legend>
                              <label className="encarte-campo">Nome de exibição
                                <input maxLength={90} value={item.nome ?? ""} placeholder={item.descricao}
                                  onChange={(evento) => atualizarItem(item.codigo, { nome: evento.target.value })} />
                              </label>
                              {etiquetaBlackFriday ? (
                                <label className="encarte-campo">Descrição da etiqueta
                                  <input maxLength={60} value={item.descricaoEtiqueta ?? ""} placeholder={item.unidadeMedida}
                                    onChange={(evento) => atualizarItem(item.codigo, { descricaoEtiqueta: evento.target.value })} />
                                </label>
                              ) : !etiquetaClubeOferta && (
                                <div className="encarte-item-midia">
                                  <CampoImagem texto={item.imagemId ? "Trocar imagem" : "Adicionar imagem"} onArquivo={(arquivo) => executar(async () => {
                                    const imagem = await enviarImagemEncarte(item.codigo, dados.unidade, arquivo);
                                    atualizarItem(item.codigo, { imagemId: imagem.id });
                                    setMensagem(`Imagem vinculada ao produto #${item.codigo}.`);
                                  })} />
                                  <label className="encarte-checkbox"><input type="checkbox" checked={Boolean(item.destaque)}
                                    onChange={(evento) => atualizarItem(item.codigo, { destaque: evento.target.checked })} /> Destaque</label>
                                </div>
                              )}
                            </fieldset>
                            <fieldset className="encarte-item-grupo encarte-edicao-precos">
                              <legend>Preços</legend>
                              <div className="encarte-item-campos">
                                <label className="encarte-campo">Preço atual, em R$
                                  <input type="number" min=".01" step=".01"
                                    value={item.precoAtualEditado ?? ""} placeholder={item.preco.toFixed(2)}
                                    onChange={(evento) => atualizarItem(item.codigo, {
                                      precoAtualEditado: evento.target.value === "" ? null : evento.target.valueAsNumber,
                                    })} />
                                  <small>Em branco, usa o valor do ERP.</small>
                                </label>
                                {modelo.tema === "black-friday" && (
                                  <label className="encarte-campo">Etiqueta de unidade
                                    <input maxLength={12} value={item.unidadeMedidaEditada ?? ""}
                                      placeholder={item.unidadeMedida}
                                      onChange={(evento) => atualizarItem(item.codigo, { unidadeMedidaEditada: evento.target.value })} />
                                    <small>Exemplos: cx, un, kg. Em branco, usa a unidade do ERP.</small>
                                  </label>
                                )}
                              </div>
                              {modelo.permitePrecoAnterior && (
                                <div className="encarte-item-preco-anterior">
                                  <label className="encarte-checkbox">
                                    <input type="checkbox" checked={item.mostrarPrecoAnterior !== false}
                                      onChange={(evento) => atualizarItem(item.codigo, {
                                        mostrarPrecoAnterior: evento.target.checked,
                                        ...(!evento.target.checked && !precoManualValido(item.precoAnteriorEditado)
                                          ? { precoAnteriorEditado: null } : {}),
                                      })} />
                                    Mostrar preço anterior (De)
                                  </label>
                                  {item.mostrarPrecoAnterior !== false && (
                                    <label className="encarte-campo">Preço anterior (De), em R$
                                      <input type="number" min=".01" step=".01"
                                        value={item.precoAnteriorEditado ?? ""} placeholder={item.precoAnterior?.toFixed(2)}
                                        onChange={(evento) => atualizarItem(item.codigo, {
                                          precoAnteriorEditado: evento.target.value === "" ? null : evento.target.valueAsNumber,
                                        })} />
                                      <small>Em branco, mostra o valor do ERP quando ele for maior que o preço atual.</small>
                                    </label>
                                  )}
                                </div>
                              )}
                            </fieldset>
                            {modelo.permiteLimite && (
                              <fieldset className="encarte-item-grupo">
                                <legend>Limite por cliente</legend>
                                <label className="encarte-checkbox">
                                  <input type="checkbox" checked={Boolean(item.limitado)} onChange={(evento) =>
                                    atualizarItem(item.codigo, { limitado: evento.target.checked, limite: null })} />
                                  Produto limitado
                                </label>
                                {item.limitado && (
                                  <label className="encarte-campo">Máximo por cliente ({unidadeExibidaEncarte(item)}), opcional
                                    <input type="number" min=".001" max="9999" step=".001" value={item.limite ?? ""}
                                      onChange={(evento) => atualizarItem(item.codigo, { limite: evento.target.value === "" ? null : evento.target.valueAsNumber })} />
                                  </label>
                                )}
                              </fieldset>
                            )}
                            <div className="encarte-item-rodape">
                              <div className="encarte-acoes">
                                <button type="button" aria-label={`Subir ${item.descricao}`} disabled={indice === 0} onClick={() => moverItem(indice, -1)}><ArrowUp size={15} aria-hidden="true" /> Subir</button>
                                <button type="button" aria-label={`Descer ${item.descricao}`} disabled={indice === dados.itens.length - 1} onClick={() => moverItem(indice, 1)}><ArrowDown size={15} aria-hidden="true" /> Descer</button>
                              </div>
                              <button type="button" className="encarte-remover" onClick={() => atualizarItens(dados.itens.filter((produto) => produto.codigo !== item.codigo))}><Trash2 size={15} aria-hidden="true" /> Remover</button>
                            </div>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ol>
                </section>
                {revisao && <RevisaoPrecos revisao={revisao} aplicar={() => {
                  atualizarItens(revisao.itens.filter((item) => !revisao.indisponiveis.includes(item.codigo)));
                }} />}
                <div className="encarte-editor-rodape">
                  {registro?.id && <button type="button" onClick={() => executar(() => abrirHistorico(registro.id))}>Reabrir salvo</button>}
                  <button type="submit">Salvar rascunho</button>
                  <button type="button" className="encarte-principal" disabled={!dados.itens.length}
                    onClick={(evento) => { if (evento.currentTarget.form.reportValidity()) executar(() => salvar(true)); }}>
                    Conferir e finalizar
                  </button>
                </div>
              </form>
            )}
            <aside id="encarte-previa" className="encarte-previa-painel">
              <div className="encarte-previa-topo">
                <div className="encarte-previa-titulo">
                  {finalizado && <span className="encarte-finalizado-status">Finalizado</span>}
                  <h2>{finalizado ? dados.titulo : "Prévia"}</h2>
                  <p>{etiquetas ? `A4 · ${modelo.larguraMm} × ${modelo.alturaMm} mm` : `${modelo.largura * 2} × ${modelo.altura * 2} px`}</p>
                </div>
                <div className="encarte-acoes">
                  {paginacao}
                  <EncartePreviaTelaCheia modelo={modelo} previa={previa} abasFormatos={abasFormatos} paginacao={paginacao} />
                </div>
              </div>
              {abasFormatos}
              <div className={`encarte-previa-fundo encarte-previa-fundo--${modelo.id}${finalizado ? " encarte-finalizado-palco" : ""}`}
                style={finalizado ? { "--encarte-proporcao": modelo.largura / modelo.altura } : undefined}>
                <PreviaEncarte {...previa} exportavel />
              </div>
              {!etiquetas && !finalizado && (
                <EncarteAnimacao key={modelo.id} dados={dadosDaPrevia} modelo={modelo} total={total} onLogout={onLogout}
                  editar={(animacao) => setDados((atual) => ({ ...atual, animacao }))} />
              )}
            </aside>
            {finalizado && (
              <EncarteSaida dados={dados} dadosDaPrevia={dadosDaPrevia} modelo={modelo} formatos={formatos}
                pagina={pagina} total={total} registroId={registro.id} linkPublico={linkPublico}
                publicarPagina={publicarPagina} duplicar={() => abrir({ ...dados, inicio: hojeSp(), fim: hojeSp() })}
                executar={executar} onLogout={onLogout}
                onProgresso={setProgressoPacote} onMensagem={setMensagem}
                mensagem={ocupado ? progressoPacote || "Aguarde…" : mensagem} erro={erro} />
            )}
          </fieldset>
        )}
      </main>
    </AdminLayout>
  );
}

import { useEffect, useRef, useState } from "react";
import { fetchAdmin, resolveImagemUrl } from "../../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../../utils/mensagensUsuario.js";

const STATUS = {
  novo: "Novo",
  em_producao: "Em produção",
  pronto: "Pronto",
};

function moeda(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(iso) {
  const [ano, mes, dia] = String(iso || "").split("-");
  if (!dia || !mes || !ano) return iso || "";
  return `${dia}/${mes}/${ano}`;
}

function nomeDecoracao(item) {
  return (item.decoracoes || []).find((d) => String(d.id) === String(item.decoracaoId))?.nome || "";
}

function estimar(item) {
  const deco = (item.decoracoes || []).find((d) => String(d.id) === String(item.decoracaoId));
  const extra = deco ? Number(deco.preco) || 0 : 0;
  if (item.vendaPorKg) return item.preco * Number(item.quantidade) + extra;
  return (item.preco + extra) * Number(item.quantidade);
}

export default function PedidoWhatsapp({
  telefone,
  conversa,
  semente,
  onSementeConsumida,
  onFechar,
  onEnviado,
}) {
  const [contexto, setContexto] = useState(null);
  const [nome, setNome] = useState("");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categorias, setCategorias] = useState([]);
  const [achados, setAchados] = useState([]);
  const [itens, setItens] = useState([]);
  const [dataRetirada, setDataRetirada] = useState("");
  const [horaRetirada, setHoraRetirada] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoId, setEnviandoId] = useState(null);
  const [enviados, setEnviados] = useState([]);
  const [confirmando, setConfirmando] = useState(false);
  const confirmarRef = useRef(null);
  const podeAnotar = Boolean(conversa?.atendimento?.meu);
  const consumirRef = useRef(onSementeConsumida);
  consumirRef.current = onSementeConsumida;

  useEffect(() => {
    let vivo = true;
    setContexto(null);
    setItens([]);
    setBusca("");
    setCategoria("");
    setAchados([]);
    setDataRetirada("");
    setHoraRetirada("");
    setObservacao("");
    setErro("");
    setAviso("");
    setEnviados([]);
    setConfirmando(false);
    fetchAdmin(`/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}/pedidos`)
      .then((data) => {
        if (!vivo) return;
        setContexto(data);
        setNome(data.nomeSugerido || "");
      })
      .catch((err) => {
        if (vivo) setErro(mensagemParaUsuario(err.message));
      });
    return () => {
      vivo = false;
    };
  }, [telefone]);

  useEffect(() => {
    if (!semente?.length) return undefined;
    let vivo = true;
    fetchAdmin("/api/admin/marketing/whatsapp/caixa/catalogo/resolver", {
      method: "POST",
      body: JSON.stringify({
        codigos: semente.map((item) => item.codigo),
      }),
    })
      .then(async (data) => {
        if (!vivo) return;
        const faltando = [];
        const linhas = [];
        for (const produto of data.produtos || []) {
          const origem = semente.find((item) => item.codigo === produto.codigo);
          if (!produto.encontrado) {
            faltando.push(produto.codigo);
            continue;
          }
          const decoracoes = await carregarDecoracoes(produto.codigo);
          linhas.push(linhaDe(produto, origem?.quantidade || 1, decoracoes));
        }
        setItens((prev) => [...linhas, ...prev].slice(0, 8));
        if (faltando.length) setErro(`Fora do catálogo: ${faltando.join(", ")}`);
      })
      .catch((err) => {
        if (vivo) setErro(mensagemParaUsuario(err.message));
      })
      .finally(() => {
        if (vivo) consumirRef.current();
      });
    return () => {
      vivo = false;
    };
  }, [semente]);

  useEffect(() => {
    const q = busca.trim();
    let vivo = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.length >= 2) params.set("q", q);
      if (categoria) params.set("categoria", categoria);
      fetchAdmin(`/api/admin/marketing/whatsapp/caixa/catalogo?${params}`)
        .then((data) => {
          if (!vivo) return;
          setAchados(data.produtos || []);
          setCategorias(data.categorias || []);
        })
        .catch(() => {
          if (vivo) setAchados([]);
        });
    }, q.length >= 2 ? 250 : 0);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [busca, categoria]);

  async function carregarDecoracoes(codigo) {
    const data = await fetchAdmin(
      `/api/admin/marketing/whatsapp/caixa/catalogo/${encodeURIComponent(codigo)}/decoracoes`
    );
    return data.decoracoes || [];
  }

  function linhaDe(produto, quantidade, decoracoes) {
    return {
      chave: `${produto.codigo}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...produto,
      quantidade: produto.vendaPorKg ? Number(quantidade) || 1 : Math.max(1, Math.round(Number(quantidade) || 1)),
      decoracaoId: "",
      decoracoes,
    };
  }

  async function adicionar(produto) {
    setErro("");
    if (itens.length >= 8) {
      setErro("O pedido aceita até 8 itens.");
      return;
    }
    try {
      const decoracoes = await carregarDecoracoes(produto.codigo);
      setItens((prev) => [...prev, linhaDe(produto, 1, decoracoes)]);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    }
  }

  async function anotar() {
    setErro("");
    setAviso("");
    setSalvando(true);
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}/pedidos`,
        {
          method: "POST",
          body: JSON.stringify({
            nomeCliente: nome,
            dataRetirada,
            horaRetirada,
            observacao,
            itens: itens.map((item) => ({
              codigo: item.codigo,
              quantidade: Number(item.quantidade),
              decoracaoId: item.decoracaoId || null,
            })),
          }),
        }
      );
      setContexto((atual) => ({
        ...(atual || {}),
        pedidos: [
          data.pedido,
          ...((atual?.pedidos || []).filter((p) => p.id !== data.pedido.id)),
        ],
      }));
      setItens([]);
      setObservacao("");
      setConfirmando(false);
      setAviso(data.repetido ? "Esse pedido já tinha sido anotado agora." : `Pedido ${data.pedido.codigoPublico} anotado.`);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    } finally {
      setSalvando(false);
    }
  }

  async function enviarResumo(pedido) {
    setErro("");
    setEnviandoId(pedido.id);
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}/pedidos/${pedido.id}/resumo`,
        { method: "POST", body: "{}" }
      );
      setEnviados((prev) => [...prev, pedido.id]);
      if (data.mensagem) onEnviado(data);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    } finally {
      setEnviandoId(null);
    }
  }

  useEffect(() => {
    if (!confirmando) return undefined;
    confirmarRef.current?.focus();
    function noTeclado(evento) {
      if (evento.key === "Escape" && !salvando) setConfirmando(false);
    }
    window.addEventListener("keydown", noTeclado);
    return () => window.removeEventListener("keydown", noTeclado);
  }, [confirmando, salvando]);

  const total = itens.reduce((acc, item) => acc + (estimar(item) || 0), 0);
  const horario = contexto?.horario;
  const prontoParaAbrir =
    podeAnotar && itens.length > 0 && dataRetirada && horaRetirada && nome.trim().length >= 2;

  return (
    <aside className="wa-caixa__pedido" aria-label="Pedido do catálogo">
      <header className="wa-caixa__ficha-head">
        <strong>Pedido</strong>
        <span className="wa-caixa__pedido-quem">
          {nome || conversa?.nome || "Cliente"} · {conversa?.telefoneFormatado}
        </span>
        <button type="button" className="wa-caixa__tool" onClick={onFechar} aria-label="Fechar pedido">
          ×
        </button>
      </header>
      {(erro || aviso || !podeAnotar) && (
        <div className="wa-caixa__pedido-avisos">
          {erro && <p className="wa-caixa__pedido-erro">{erro}</p>}
          {aviso && <p className="wa-caixa__pedido-ok">{aviso}</p>}
          {!podeAnotar && <p className="wa-caixa__pedido-nota">Inicie o atendimento para anotar o pedido.</p>}
        </div>
      )}
      <div className="wa-caixa__pedido-corpo">
        <section className="wa-caixa__pedido-vitrine" aria-label="Catálogo">
          <input
            className="wa-caixa__pedido-busca-input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, código, cobertura ou recheio"
            aria-label="Buscar produto"
          />
          {categorias.length > 0 && (
            <div className="wa-caixa__pedido-cats">
              <button type="button" className={!categoria ? "is-on" : ""} onClick={() => setCategoria("")}>
                Todos
              </button>
              {categorias.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={String(categoria) === String(cat.id) ? "is-on" : ""}
                  onClick={() => setCategoria(String(cat.id))}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          )}
          <div className="wa-caixa__pedido-grade">
            {achados.map((produto) => {
              const foto = resolveImagemUrl(produto.imagemUrl);
              const detalhe = [produto.cobertura, produto.recheio].filter(Boolean).join(" · ");
              return (
                <button
                  key={produto.codigo}
                  type="button"
                  className="wa-caixa__card"
                  disabled={!podeAnotar}
                  onClick={() => adicionar(produto)}
                >
                  {foto ? <img src={foto} alt="" /> : <span className="wa-caixa__card-sem">Sem foto</span>}
                  <strong>{produto.nome}</strong>
                  <span>
                    {produto.categoriaNome ? `${produto.categoriaNome} · ` : ""}
                    {produto.codigo} · {produto.vendaPorKg ? `${moeda(produto.preco)}/kg` : moeda(produto.preco)}
                  </span>
                  {detalhe && <em>{detalhe}</em>}
                </button>
              );
            })}
            {!achados.length && <p className="wa-caixa__pedido-nota">Nenhum produto encontrado.</p>}
          </div>
        </section>

        <section className="wa-caixa__pedido-comanda" aria-label="Comanda">
          {contexto?.pedidos?.length > 0 && (
            <div className="wa-caixa__pedido-abertos">
              {contexto.pedidos.map((pedido) => (
                <p key={pedido.id}>
                  <strong>{pedido.codigoPublico}</strong>
                  <span>
                    {STATUS[pedido.status] || pedido.status} ·{" "}
                    {String(pedido.dataRetirada || "").split("-").reverse().join("/")} {pedido.horaRetirada}
                  </span>
                  {podeAnotar && conversa?.janelaAberta && !enviados.includes(pedido.id) && (
                    <button type="button" disabled={enviandoId === pedido.id} onClick={() => enviarResumo(pedido)}>
                      Enviar resumo
                    </button>
                  )}
                  {enviados.includes(pedido.id) && <em>Resumo enviado</em>}
                  {podeAnotar && conversa && !conversa.janelaAberta && <em>Janela fechada</em>}
                </p>
              ))}
            </div>
          )}

          <label>
            Nome no pedido
            <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeAnotar} maxLength={120} />
          </label>
          {contexto?.cpfMascarado && <p className="wa-caixa__pedido-nota">CPF {contexto.cpfMascarado}</p>}

          <div className="wa-caixa__pedido-linhas">
            {!itens.length && <p className="wa-caixa__pedido-nota">Toque em um produto para incluir.</p>}
            {itens.map((item) => {
              const foto = resolveImagemUrl(item.imagemUrl);
              return (
                <div className="wa-caixa__pedido-linha" key={item.chave}>
                  {foto ? <img src={foto} alt="" /> : <span className="wa-caixa__card-sem" />}
                  <div>
                    <strong>{item.nome}</strong>
                    {item.vendaPorKg && <em>Valor final na balança</em>}
                    {item.decoracoes?.length > 0 && (
                      <select
                        value={item.decoracaoId}
                        aria-label={`Decoração de ${item.nome}`}
                        onChange={(e) =>
                          setItens((prev) =>
                            prev.map((l) => (l.chave === item.chave ? { ...l, decoracaoId: e.target.value } : l))
                          )
                        }
                      >
                        <option value="">Sem decoração</option>
                        {item.decoracoes.map((deco) => (
                          <option key={deco.id} value={deco.id}>
                            {deco.nome}
                            {deco.preco ? ` · ${moeda(deco.preco)}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <label className="wa-caixa__pedido-qtd">
                    {item.vendaPorKg ? "kg" : "un"}
                    <input
                      type="number"
                      aria-label={item.vendaPorKg ? "Peso em quilos" : "Quantidade"}
                      min={item.vendaPorKg ? "0.1" : "1"}
                      max={item.vendaPorKg ? "30" : "40"}
                      step={item.vendaPorKg ? "0.1" : "1"}
                      value={item.quantidade}
                      onChange={(e) =>
                        setItens((prev) =>
                          prev.map((l) => (l.chave === item.chave ? { ...l, quantidade: e.target.value } : l))
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setItens((prev) => prev.filter((l) => l.chave !== item.chave))}
                  >
                    Tirar
                  </button>
                </div>
              );
            })}
          </div>

          <div className="wa-caixa__pedido-quando">
            <label>
              Retirada
              <input type="date" value={dataRetirada} onChange={(e) => setDataRetirada(e.target.value)} disabled={!podeAnotar} />
            </label>
            <label>
              Hora
              <input type="time" value={horaRetirada} onChange={(e) => setHoraRetirada(e.target.value)} disabled={!podeAnotar} />
            </label>
          </div>
          {horario && (
            <p className="wa-caixa__pedido-nota">
              Entre {horario.inicio} e {horario.fim}
              {horario.antecedenciaHoras > 0 ? `, com ${horario.antecedenciaHoras}h de antecedência` : ""}.
            </p>
          )}
          <label>
            Recado para a padaria
            <textarea
              rows={2}
              maxLength={400}
              value={observacao}
              disabled={!podeAnotar}
              placeholder="Ex.: escrever Parabéns Ana"
              onChange={(e) => setObservacao(e.target.value)}
            />
          </label>
          <div className="wa-caixa__pedido-rodape">
            <p className="wa-caixa__pedido-total">
              {itens.length ? `${itens.length} ${itens.length === 1 ? "item" : "itens"} · ${moeda(total)}` : "Nenhum item"}
              {itens.some((item) => item.vendaPorKg) ? " · kg na balança" : ""}
            </p>
            <button
              type="button"
              className="wa-caixa__iniciar"
              disabled={!prontoParaAbrir || salvando}
              onClick={() => {
                setErro("");
                setConfirmando(true);
              }}
            >
              Anotar pedido
            </button>
          </div>
        </section>
      </div>
      {confirmando && (
        <div className="wa-caixa__confirma" role="presentation">
          <div
            className="wa-caixa__confirma-caixa"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirma-pedido-titulo"
          >
            <h2 id="confirma-pedido-titulo">Abrir este pedido?</h2>
            <p>
              A padaria recebe como pedido novo para <strong>{nome.trim()}</strong>.
            </p>
            <ul>
              {itens.map((item) => {
                const deco = nomeDecoracao(item);
                const qtd = item.vendaPorKg ? `${item.quantidade} kg` : `${item.quantidade} un`;
                return (
                  <li key={item.chave}>
                    <span>
                      {qtd} · {item.nome}
                      {deco ? ` · ${deco}` : ""}
                    </span>
                    <span>{moeda(estimar(item))}</span>
                  </li>
                );
              })}
            </ul>
            <p>
              Retirada <strong>{dataBr(dataRetirada)}</strong> às <strong>{horaRetirada}</strong>
            </p>
            {observacao.trim() && <p>Recado: {observacao.trim()}</p>}
            <p className="wa-caixa__pedido-total">Total estimado {moeda(total)}</p>
            {erro && <p className="wa-caixa__pedido-erro">{erro}</p>}
            <div className="wa-caixa__confirma-acoes">
              <button type="button" onClick={() => setConfirmando(false)} disabled={salvando}>
                Voltar
              </button>
              <button type="button" ref={confirmarRef} onClick={anotar} disabled={salvando}>
                {salvando ? "Abrindo…" : "Confirmar abertura"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

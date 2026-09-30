import { useEffect, useRef, useState } from "react";
import { fetchAdmin } from "../../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../../utils/mensagensUsuario.js";

function moeda(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PedidoErpWhatsapp({ telefone, conversa, onFechar, onEnviado }) {
  const [nome, setNome] = useState(conversa?.nome || "");
  const [cpf, setCpf] = useState("");
  const [observacao, setObservacao] = useState("");
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState([]);
  const [avisoBusca, setAvisoBusca] = useState("");
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [pedidoAberto, setPedidoAberto] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const confirmarRef = useRef(null);
  const podeAnotar = Boolean(conversa?.atendimento?.meu);

  useEffect(() => {
    setNome(conversa?.nome || "");
    setCpf("");
    setObservacao("");
    setBusca("");
    setAchados([]);
    setItens([]);
    setErro("");
    setAviso("");
    setPedidoAberto(null);
    setConfirmando(false);
  }, [telefone, conversa?.nome]);

  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) {
      setAchados([]);
      setAvisoBusca("");
      return undefined;
    }
    let vivo = true;
    const timer = setTimeout(() => {
      fetchAdmin(`/api/admin/marketing/whatsapp/caixa/erp/produtos?q=${encodeURIComponent(q)}`)
        .then((data) => {
          if (!vivo) return;
          setAchados(data.produtos || []);
          setAvisoBusca(data.aviso || "");
        })
        .catch((err) => {
          if (!vivo) return;
          setAchados([]);
          setAvisoBusca(mensagemParaUsuario(err.message));
        });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [busca]);

  useEffect(() => {
    if (!confirmando) return undefined;
    confirmarRef.current?.focus();
    function noTeclado(evento) {
      if (evento.key === "Escape" && !salvando) setConfirmando(false);
    }
    window.addEventListener("keydown", noTeclado);
    return () => window.removeEventListener("keydown", noTeclado);
  }, [confirmando, salvando]);

  function incluir(produto) {
    if (!podeAnotar) return;
    if (!(produto.preco > 0)) {
      setErro("Esse produto está sem preço na unidade.");
      return;
    }
    setErro("");
    setItens((prev) => {
      const existe = prev.find((item) => item.codigo === produto.codigo);
      if (existe) {
        return prev.map((item) =>
          item.codigo === produto.codigo ? { ...item, quantidade: Number(item.quantidade) + 1 } : item
        );
      }
      if (prev.length >= 8) return prev;
      return [...prev, { ...produto, quantidade: 1 }];
    });
  }

  const total = itens.reduce((acc, item) => acc + item.preco * Number(item.quantidade || 0), 0);
  const pronto = podeAnotar && nome.trim().length >= 2 && itens.length > 0;

  async function abrirPedido() {
    setErro("");
    setSalvando(true);
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}/erp/pedidos`,
        {
          method: "POST",
          body: JSON.stringify({
            nomeCliente: nome,
            cpf,
            observacao,
            itens: itens.map((item) => ({ codigo: item.codigo, quantidade: Number(item.quantidade) })),
          }),
        }
      );
      setPedidoAberto(data);
      setItens([]);
      setObservacao("");
      setConfirmando(false);
      setAviso(`Pedido ERP ${data.codigoPedido} aberto.`);
    } catch (err) {
      setErro(err.message || "O ERP não abriu o pedido.");
    } finally {
      setSalvando(false);
    }
  }

  async function enviarResumo() {
    if (!pedidoAberto?.resumo) return;
    setEnviando(true);
    setErro("");
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}/responder`,
        { method: "POST", body: JSON.stringify({ texto: pedidoAberto.resumo }) }
      );
      onEnviado(data);
      setAviso("Resumo enviado na conversa.");
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <aside className="wa-caixa__pedido" aria-label="Pedido ERP">
      <header className="wa-caixa__ficha-head">
        <strong>Pedido ERP</strong>
        <span className="wa-caixa__pedido-quem">
          {nome || "Cliente"} · {conversa?.telefoneFormatado}
        </span>
        <button type="button" className="wa-caixa__tool" onClick={onFechar} aria-label="Fechar pedido ERP">
          ×
        </button>
      </header>
      {(erro || aviso || !podeAnotar) && (
        <div className="wa-caixa__pedido-avisos">
          {erro && <p className="wa-caixa__pedido-erro">{erro}</p>}
          {aviso && <p className="wa-caixa__pedido-ok">{aviso}</p>}
          {!podeAnotar && <p className="wa-caixa__pedido-nota">Inicie o atendimento para abrir o pedido no ERP.</p>}
        </div>
      )}
      <div className="wa-caixa__pedido-corpo">
        <section className="wa-caixa__pedido-vitrine" aria-label="Produtos do ERP">
          <input
            className="wa-caixa__pedido-busca-input"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Código ou nome do produto"
            aria-label="Buscar produto no ERP"
          />
          <p className="wa-caixa__pedido-nota">
            Código consulta a unidade na hora. Nome percorre as primeiras páginas do catálogo.
          </p>
          {avisoBusca && <p className="wa-caixa__pedido-nota">{avisoBusca}</p>}
          <div className="wa-caixa__pedido-grade">
            {achados.map((produto) => (
              <button
                key={produto.codigo}
                type="button"
                className="wa-caixa__card"
                disabled={!podeAnotar}
                onClick={() => incluir(produto)}
              >
                <span className="wa-caixa__card-sem">{produto.codigo}</span>
                <strong>{produto.nome}</strong>
                <span>
                  {moeda(produto.preco)}
                  {produto.estoque != null ? ` · estoque ${produto.estoque}` : ""}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="wa-caixa__pedido-comanda" aria-label="Itens do pedido ERP">
          {pedidoAberto && (
            <div className="wa-caixa__pedido-ok">
              Código ERP {pedidoAberto.codigoPedido}
              {conversa?.janelaAberta && (
                <button type="button" disabled={enviando} onClick={enviarResumo}>
                  {enviando ? "Enviando…" : "Enviar resumo"}
                </button>
              )}
            </div>
          )}
          <label>
            Nome no pedido
            <input value={nome} maxLength={120} disabled={!podeAnotar} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label>
            CPF, se não for do clube
            <input
              value={cpf}
              inputMode="numeric"
              maxLength={14}
              disabled={!podeAnotar}
              placeholder="Somente se quiser vincular"
              onChange={(e) => setCpf(e.target.value)}
            />
          </label>
          <p className="wa-caixa__pedido-nota">Pagamento 000 · à vista</p>
          <div className="wa-caixa__pedido-linhas">
            {!itens.length && <p className="wa-caixa__pedido-nota">Busque um produto e toque para incluir.</p>}
            {itens.map((item) => (
              <div className="wa-caixa__pedido-linha" key={item.codigo}>
                <span className="wa-caixa__card-sem">{item.codigo}</span>
                <div>
                  <strong>{item.nome}</strong>
                  <em>{moeda(item.preco)}</em>
                </div>
                <input
                  type="number"
                  min="0.001"
                  max="999"
                  step="1"
                  value={item.quantidade}
                  aria-label={`Quantidade de ${item.nome}`}
                  onChange={(e) =>
                    setItens((prev) =>
                      prev.map((atual) =>
                        atual.codigo === item.codigo ? { ...atual, quantidade: e.target.value } : atual
                      )
                    )
                  }
                />
                <button type="button" onClick={() => setItens((prev) => prev.filter((atual) => atual.codigo !== item.codigo))}>
                  Tirar
                </button>
              </div>
            ))}
          </div>
          <label>
            Observação
            <textarea
              rows={2}
              maxLength={300}
              value={observacao}
              disabled={!podeAnotar}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </label>
          <div className="wa-caixa__pedido-rodape">
            <p className="wa-caixa__pedido-total">
              {itens.length ? `${itens.length} ${itens.length === 1 ? "item" : "itens"} · ${moeda(total)}` : "Nenhum item"}
            </p>
            <button
              type="button"
              className="wa-caixa__iniciar"
              disabled={!pronto || salvando}
              onClick={() => {
                setErro("");
                setConfirmando(true);
              }}
            >
              Abrir no ERP
            </button>
          </div>
        </section>
      </div>
      {confirmando && (
        <div className="wa-caixa__confirma" role="presentation">
          <div className="wa-caixa__confirma-caixa" role="dialog" aria-modal="true" aria-labelledby="confirma-erp">
            <h2 id="confirma-erp">Abrir este pedido no ERP?</h2>
            <p>
              Isso grava um pedido de venda na loja para <strong>{nome.trim()}</strong>.
            </p>
            <ul>
              {itens.map((item) => (
                <li key={item.codigo}>
                  <span>
                    {item.quantidade}× {item.nome}
                  </span>
                  <span>{moeda(item.preco * Number(item.quantidade))}</span>
                </li>
              ))}
            </ul>
            <p className="wa-caixa__pedido-total">Total {moeda(total)}</p>
            <p>Pagamento 000 · à vista</p>
            {erro && <p className="wa-caixa__pedido-erro">{erro}</p>}
            <div className="wa-caixa__confirma-acoes">
              <button type="button" disabled={salvando} onClick={() => setConfirmando(false)}>
                Voltar
              </button>
              <button type="button" ref={confirmarRef} disabled={salvando} onClick={abrirPedido}>
                {salvando ? "Abrindo…" : "Confirmar no ERP"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

import { useEffect, useState } from "react";
import { ImagePlus } from "lucide-react";
import { fetchAdmin } from "../../utils/adminSession.js";
import EncarteCatalogo, { API_ENCARTE, CampoImagem, enviarImagemEncarte } from "./EncarteCatalogo.jsx";
import { ImagemProduto } from "./EncarteFolha.jsx";

export default function EncarteBiblioteca({ unidade, onSessaoExpirada, onVincular }) {
  const [selecionado, setSelecionado] = useState(null);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState(null);
  const [recarregar, setRecarregar] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const controle = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ busca, pagina });
        const dados = await fetchAdmin(`${API_ENCARTE}/imagens?${params}`, { signal: controle.signal });
        if (!controle.signal.aborted) setLista(dados);
      } catch (falha) {
        if (controle.signal.aborted) return;
        if (falha.code === "UNAUTHORIZED") onSessaoExpirada();
        else setErro(falha.message);
      }
    }, 200);
    return () => { controle.abort(); window.clearTimeout(timer); };
  }, [busca, pagina, recarregar, onSessaoExpirada]);

  async function executar(acao) {
    setOcupado(true);
    setErro("");
    setMensagem("");
    try {
      await acao();
    } catch (falha) {
      if (falha.code === "UNAUTHORIZED") onSessaoExpirada();
      else setErro(falha.message);
    } finally {
      setOcupado(false);
    }
  }

  function vincular(arquivo) {
    executar(async () => {
      const imagem = await enviarImagemEncarte(selecionado.codigo, unidade, arquivo);
      setSelecionado({ ...selecionado, imagemId: imagem.id });
      onVincular(imagem);
      setBusca("");
      setPagina(1);
      setRecarregar((valor) => valor + 1);
      setMensagem(`Imagem vinculada ao produto #${imagem.codigo}.`);
    });
  }

  function selecionarProduto(codigo) {
    executar(async () => {
      setSelecionado(null);
      const { item } = await fetchAdmin(`${API_ENCARTE}/produtos/${encodeURIComponent(codigo)}/adicionar`, {
        method: "POST",
        body: JSON.stringify({ unidade }),
      });
      setSelecionado(item);
      if (item.imagemId) {
        onVincular({ codigo: item.codigo, id: item.imagemId });
        setBusca("");
        setPagina(1);
        setRecarregar((valor) => valor + 1);
        setMensagem("Imagem disponível para o produto. Você pode substituí-la por um arquivo do computador.");
      } else {
        setMensagem("Envie uma imagem do computador para este produto.");
      }
    });
  }

  return (
    <fieldset className="encarte-controles encarte-biblioteca" disabled={ocupado}>
      <section className="encarte-painel">
        <div className="encarte-painel-titulo">
          <ImagePlus size={20} aria-hidden="true" />
          <div><h2>Vincular imagem a um produto</h2><p>Busque o produto no ERP da loja {unidade}.</p></div>
        </div>
        <EncarteCatalogo unidade={unidade} biblioteca onSessaoExpirada={onSessaoExpirada}
          versaoCatalogo={recarregar} onSelecionar={selecionarProduto} />
        {ocupado && <p role="status" className="encarte-secundario">Processando imagem do produto…</p>}
        {selecionado && (
          <div className="encarte-vinculo">
            <div className="encarte-miniatura"><ImagemProduto id={selecionado.imagemId} /></div>
            <div><strong>{selecionado.descricao}</strong><small>Código ERP {selecionado.codigo}</small></div>
            <CampoImagem texto={selecionado.imagemId ? "Substituir imagem" : "Enviar imagem"} onArquivo={vincular} />
          </div>
        )}
        <p className="encarte-secundario">JPG, PNG ou WebP · até 5 MB</p>
      </section>
      <section className="encarte-painel">
        <div className="encarte-painel-titulo">
          <div><h2>Banco de imagens</h2><p>Imagens usadas automaticamente nos próximos encartes.</p></div>
        </div>
        <label className="encarte-campo">Filtrar por descrição ou código
          <input value={busca} onChange={(evento) => {
            setBusca(evento.target.value); setPagina(1); setLista(null); setErro("");
          }} />
        </label>
        {!lista && !erro && <p role="status" className="encarte-secundario">Carregando imagens…</p>}
        {lista?.imagens.length === 0 && <p>Nenhuma imagem encontrada.</p>}
        {lista?.imagens.length > 0 && (
          <ul className="encarte-imagens-grade">
            {lista.imagens.map((imagem) => (
              <li key={imagem.id}>
                <button type="button" onClick={() => {
                  setSelecionado({ ...imagem, imagemId: imagem.id });
                  setErro("");
                  setMensagem("");
                }}>
                  <span className="encarte-imagem-banco"><ImagemProduto id={imagem.id} /></span>
                  <strong>{imagem.descricao}</strong>
                  <small>#{imagem.codigo}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {lista && (pagina > 1 || lista.temMais) && (
          <div className="encarte-acoes">
            <button type="button" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span>Página {pagina}</span>
            <button type="button" disabled={!lista.temMais} onClick={() => setPagina(pagina + 1)}>Próxima</button>
          </div>
        )}
      </section>
      {erro && <p className="admin-alert" role="alert">{erro}</p>}
      {mensagem && <p className="encarte-feedback" role="status">{mensagem}</p>}
    </fieldset>
  );
}

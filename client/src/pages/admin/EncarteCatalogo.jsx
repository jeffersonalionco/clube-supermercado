import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { fetchAdmin } from "../../utils/adminSession.js";
import { ImagemProduto, moedaEncarte, rotuloPreco } from "./EncarteFolha.jsx";

export const API_ENCARTE = "/api/admin/marketing/encartes";
export const TIPOS_IMAGEM = "image/jpeg,image/png,image/webp";

export async function enviarImagemEncarte(codigo, unidade, arquivo) {
  const params = new URLSearchParams({ unidade });
  if (arquivo.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter até 5 MB.");
  try {
    const bitmap = await createImageBitmap(arquivo);
    bitmap.close();
  } catch {
    throw new Error("Não foi possível ler a imagem. Use um arquivo JPG, PNG ou WebP.");
  }
  const body = new FormData();
  body.append("imagem", arquivo);
  const { imagem } = await fetchAdmin(`${API_ENCARTE}/imagens/${codigo}?${params}`, { method: "POST", body });
  return imagem;
}

export function CampoImagem({ texto, onArquivo, disabled }) {
  return (
    <label className="encarte-upload">
      <input type="file" accept={TIPOS_IMAGEM} disabled={disabled} aria-label={texto} onChange={(evento) => {
        const arquivo = evento.target.files?.[0];
        evento.target.value = "";
        if (arquivo) onArquivo(arquivo);
      }} />
      <span>{texto}</span>
    </label>
  );
}

export default function EncarteCatalogo({ unidade, onSelecionar, selecionados = [], cheio, onSessaoExpirada, biblioteca, versaoCatalogo }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [catalogo, setCatalogo] = useState(null);
  const [erro, setErro] = useState("");
  const [repetir, setRepetir] = useState(0);
  const termo = busca.trim();

  useEffect(() => {
    if (!/^\d{1,6}$/.test(unidade) || (!tipo && termo.length < 2 && !/^\d$/.test(termo))) return;
    const controle = new AbortController();
    let timer;
    async function carregar(continuar = false) {
      try {
        const params = new URLSearchParams({ unidade, busca: termo, tipo, pagina });
        if (continuar) params.set("continuar", "1");
        const resultado = await fetchAdmin(`${API_ENCARTE}/produtos?${params}`, { signal: controle.signal });
        if (controle.signal.aborted) return;
        setCatalogo(resultado);
        if (resultado.sincronizando) timer = window.setTimeout(() => carregar(true), 1250);
      } catch (falha) {
        if (controle.signal.aborted) return;
        if (falha.code === "UNAUTHORIZED") onSessaoExpirada();
        else setErro(falha.message);
      }
    }
    timer = window.setTimeout(carregar, 250);
    return () => {
      controle.abort();
      window.clearTimeout(timer);
    };
  }, [unidade, termo, tipo, pagina, repetir, versaoCatalogo, onSessaoExpirada]);

  function limparResultados() {
    setPagina(1);
    setCatalogo(null);
    setErro("");
  }

  function mudarPagina(nova) {
    setErro("");
    setCatalogo(null);
    setPagina(nova);
  }

  const consultando = /^\d{1,6}$/.test(unidade) && (tipo || termo.length >= 2 || /^\d$/.test(termo));
  return (
    <div className="encarte-catalogo">
      <div className="encarte-busca">
        <Search size={17} aria-hidden="true" />
        <input aria-label="Descrição, código interno ou código de barras"
          placeholder="Descrição, código interno ou de barras" value={busca} maxLength={100}
          onChange={(evento) => { setBusca(evento.target.value); limparResultados(); }}
          onKeyDown={(evento) => { if (evento.key === "Enter") evento.preventDefault(); }} />
        {busca && (
          <button type="button" className="encarte-limpar" aria-label="Limpar busca" onClick={() => {
            setBusca(""); limparResultados();
          }}><X size={15} /></button>
        )}
      </div>
      {!biblioteca && (
        <div className="encarte-filtros" aria-label="Tipos de preço">
          {[["", "Todos"], ["loja", "Oferta da loja"], ["clube", "Preço Clube"]].map(([valor, rotulo]) => (
            <button type="button" key={valor} aria-pressed={valor === tipo} onClick={() => {
              if (tipo !== valor) { setTipo(valor); limparResultados(); }
            }}>{rotulo}</button>
          ))}
        </div>
      )}
      {erro && <p role="alert">{erro}</p>}
      {consultando && !catalogo && !erro && <p role="status" className="encarte-secundario">Buscando produtos…</p>}
      {catalogo?.sincronizando && <p role="status" className="encarte-secundario">Consultando o catálogo do ERP…</p>}
      {(erro || catalogo?.erroSync) && (
        <button type="button" onClick={() => { setErro(""); setRepetir(repetir + 1); }}>Tentar novamente</button>
      )}
      {catalogo && !catalogo.sincronizando && !catalogo.erroSync && !catalogo.itens.length && <p>{catalogo.aviso || "Nenhum produto encontrado."}</p>}
      {catalogo?.itens.length > 0 && (
        <ul className="encarte-resultados">
          {catalogo.itens.map((item) => (
            <li key={item.codigo}>
              <div className="encarte-miniatura"><ImagemProduto id={item.imagemId} /></div>
              <div className="encarte-resultado-texto">
                <strong>{item.descricao}</strong>
                <small>#{item.codigo}{!biblioteca && ` · ${moedaEncarte.format(item.preco)} · ${rotuloPreco[item.tipo]}`}</small>
              </div>
              <button type="button" disabled={cheio || selecionados.includes(item.codigo)} onClick={() => onSelecionar(item.codigo)}>
                {biblioteca ? "Selecionar" : selecionados.includes(item.codigo) ? "Adicionado" : "Adicionar"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {catalogo?.totalPaginas > 1 && (
        <div className="encarte-acoes">
          <button type="button" disabled={pagina === 1} onClick={() => mudarPagina(pagina - 1)}>Anterior</button>
          <span>{pagina}/{catalogo.totalPaginas}</span>
          <button type="button" disabled={pagina >= catalogo.totalPaginas} onClick={() => mudarPagina(pagina + 1)}>Próxima</button>
        </div>
      )}
    </div>
  );
}

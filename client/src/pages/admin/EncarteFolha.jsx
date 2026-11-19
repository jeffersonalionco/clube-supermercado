import { useLayoutEffect, useRef, useState } from "react";
import { Package } from "lucide-react";
import { apiUrl } from "../../utils/api.js";
import "./etiquetasEncarte.css";
import { obterModeloEncarte } from "../../../../shared/modelosEncarte.js";
import { precoAnteriorEncarte, precoAtualEncarte, unidadeExibidaEncarte, validadePrecoEncarte } from "../../../../shared/precosEncarte.js";

export const moedaEncarte = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const rotuloPreco = { clube: "Preço Clube", loja: "Oferta da loja", normal: "Preço normal" };
export const hojeSp = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function dataEncarte(data) {
  return data?.split("-").reverse().join("/") || "";
}

export function ImagemProduto({ id }) {
  return id
    ? <img crossOrigin="anonymous" src={apiUrl(`/api/marketing/encartes/imagens/${id}`)} alt="" />
    : <span className="encarte-imagem-padrao" aria-hidden="true"><Package strokeWidth={1.35} /></span>;
}

const quantidadeEncarte = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const arteAcougue = `${import.meta.env.BASE_URL}encarte-tv-acougue.png`;

function CabecalhoAcougue({ dados, vertical }) {
  const diaUnicoFuturo = dados.inicio === dados.fim && dados.inicio > hojeSp();
  return (
    <header className="encarte-acougue-cabecalho">
      {vertical && (
        <div className="encarte-acougue-arte-social">
          <img src={arteAcougue} alt="" />
        </div>
      )}
      <div className="encarte-acougue-dados">
        <h2>{dados.titulo || "Açougue Superama"}</h2>
        {dados.fim && (
          <div className="encarte-acougue-periodo">
            <span>{diaUnicoFuturo ? "Válido em" : "Válido até"}</span>
            <strong>{dataEncarte(dados.fim)}</strong>
            {dados.inicio && dados.inicio !== dados.fim && (
              <small>A partir de {dataEncarte(dados.inicio)}</small>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

const ARTES_OFERTAS = {
  "black-friday": {
    fundo: "encarte-black-friday-fundo.png", marca: "encarte-black-friday-marca.png",
    marcaAlt: "Black Friday Superama", titulo: "Ofertas Black Friday",
  },
  hortifruti: {
    fundo: "encarte-terca-hortifruti-fundo.png", marca: "logo.png",
    marcaAlt: "Superama+", chamada: "Ofertas do dia",
  },
  limpeza: {
    fundo: "encarte-quinta-limpeza-fundo.png", marcaAlt: "Superama — Rede de Supermercados",
    chamada: "Ofertas do dia",
  },
};

function CabecalhoOfertas({ dados, modelo }) {
  const arte = ARTES_OFERTAS[modelo.tema];
  const diaUnicoFuturo = dados.inicio === dados.fim && dados.inicio > hojeSp();
  return (
    <header className="encarte-bf-cabecalho">
      <img className="encarte-bf-fundo" src={`${import.meta.env.BASE_URL}${arte.fundo}`}
        alt={arte.marca ? "" : arte.marcaAlt} />
      <div className="encarte-bf-marca">
        {arte.marca && <img src={`${import.meta.env.BASE_URL}${arte.marca}`} alt={arte.marcaAlt} />}
      </div>
      <div className="encarte-bf-campanha">
        {arte.chamada && <span className="encarte-ofertas-chamada">{arte.chamada}</span>}
        <h2 className={dados.titulo.length > 44 ? "encarte-titulo-longo" : undefined}>
          {dados.titulo || arte.titulo || modelo.nome}
        </h2>
        {dados.fim && (
          <p className="encarte-bf-validade">
            {dados.inicio && dados.inicio !== dados.fim ? (
              <>De <strong>{dataEncarte(dados.inicio)}</strong> até <strong>{dataEncarte(dados.fim)}</strong></>
            ) : (
              <>{diaUnicoFuturo ? "Válido em" : "Válido até"} <strong>{dataEncarte(dados.fim)}</strong></>
            )}
          </p>
        )}
      </div>
    </header>
  );
}

const precoEtiqueta = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function EtiquetaBlackFriday({ item }) {
  const nome = item.nome || item.descricao;
  const valor = precoEtiqueta.format(precoAtualEncarte(item));
  const anterior = precoAnteriorEncarte(item);
  return (
    <div className="encarte-black-friday">
      <div className="encarte-black-friday-marca" aria-label="Black Friday">
        <span>Black</span>
        <b>Friday</b>
      </div>
      <div className="encarte-black-friday-produto">
        <strong className={nome.length > 36 ? "encarte-black-friday-nome-longo" : undefined}>{nome}</strong>
        <p>{item.descricaoEtiqueta?.trim() || item.unidadeMedida}</p>
      </div>
      <div className={`encarte-black-friday-preco${anterior ? " encarte-black-friday-preco--comparacao" : ""}`}>
        {anterior && (
          <div className="encarte-black-friday-preco-anterior">De: <s>{moedaEncarte.format(anterior)}</s></div>
        )}
        <div className="encarte-black-friday-valor">
          <span>R$</span>
          <b className={valor.length > 6 ? "encarte-black-friday-valor-longo" : undefined}>{valor}</b>
        </div>
      </div>
      {item.tipo === "clube" && <small className="encarte-black-friday-clube">Preço Clube · CPF no caixa</small>}
    </div>
  );
}

const marcaEtiquetaSuperama = `${import.meta.env.BASE_URL}encarte-superama-preto.png`;
const qrCadastroEtiquetaClube = `${import.meta.env.BASE_URL}encarte-clube-cadastro-qr.png`;

function EtiquetaClubeOferta({ item }) {
  const clube = item.tipo === "clube";
  const nome = item.nome || item.descricao;
  const anterior = precoAnteriorEncarte(item);
  const valor = precoEtiqueta.format(precoAtualEncarte(item));
  const [inteiro, centavos] = valor.split(",");
  const tamanhoPreco = Math.max(20, Math.min(108, 520 / valor.length));
  const classeNome = nome.length > 60 ? "encarte-promocao-nome-extenso"
    : nome.length > 32 ? "encarte-promocao-nome-longo" : undefined;
  return (
    <div className={`encarte-etiqueta-promocional encarte-etiqueta-promocional--${clube ? "clube" : "loja"}`}>
      <span className="encarte-promocao-ondas" aria-hidden="true" />
      <header className="encarte-promocao-cabecalho">
        {clube ? <img src={marcaEtiquetaSuperama} alt="Superama+" /> : <span>Oferta da loja</span>}
      </header>
      {clube && (
        <div className="encarte-promocao-cadastro">
          <img src={qrCadastroEtiquetaClube} alt="QR code para cadastro no Clube Superama+" />
          <span>Cadastre-se<br />no Clube</span>
        </div>
      )}
      <div className="encarte-promocao-produto">
        <strong className={classeNome}>{nome}</strong>
      </div>
      <div className="encarte-promocao-anterior-area">
        {anterior !== null && (
          <div className="encarte-promocao-anterior">
            <span>De:</span>
            <s className={precoEtiqueta.format(anterior).length > 7 ? "encarte-promocao-anterior-longo" : undefined}>
              <small>R$</small> {precoEtiqueta.format(anterior)}
            </s>
          </div>
        )}
      </div>
      <div className="encarte-promocao-preco">
        <div className="encarte-promocao-chamada">
          {clube ? (
            <><span>Preço do<br /><b>Clube</b></span><img src={marcaEtiquetaSuperama} alt="Superama+" /></>
          ) : <span>Por<br />apenas</span>}
        </div>
        <div className="encarte-promocao-valor" style={{ "--tamanho-preco": `${tamanhoPreco}px` }}>
          <span className="encarte-promocao-moeda">R$</span>
          <b>{inteiro}<span className="encarte-promocao-centavos">,{centavos}</span></b>
        </div>
      </div>
    </div>
  );
}

function EtiquetasA4({ dados, itens, modelo, exportavel }) {
  const blackFriday = modelo.id === "a4-black-friday-dobro";
  const clubeOferta = modelo.id === "a4-clube-oferta";
  return (
    <article id={exportavel ? "encarte-folha-exportavel" : undefined}
      className={`encarte-etiquetas-a4${blackFriday ? " encarte-etiquetas-a4--black-friday" : ""}${clubeOferta ? " encarte-etiquetas-a4--clube-oferta" : ""}`}
      style={{ width: modelo.largura, height: modelo.altura, "--colunas": modelo.colunas, "--linhas": modelo.linhas }}>
      {itens.map((item) => {
        if (blackFriday) return <EtiquetaBlackFriday key={item.codigo} item={item} />;
        if (clubeOferta) return <EtiquetaClubeOferta key={item.codigo} item={item} />;
        const nome = item.nome || item.descricao;
        const promocional = item.tipo !== "normal";
        const validadePreco = validadePrecoEncarte(item);
        const validade = validadePreco && validadePreco < dados.fim ? validadePreco : dados.fim;
        return (
          <div className={`encarte-etiqueta encarte-etiqueta--${item.tipo}`} key={item.codigo}>
            <div className="encarte-etiqueta-cabecalho">
              <span>{promocional ? rotuloPreco[item.tipo] : "Superama"}</span>
              <small>Cód. {item.codigo}</small>
            </div>
            <strong className={nome.length > 56 ? "encarte-etiqueta-nome-longo" : undefined}>{nome}</strong>
            <p className="encarte-etiqueta-preco">
              <b>{moedaEncarte.format(precoAtualEncarte(item))}</b>
              <small>/ {item.unidadeMedida}</small>
            </p>
            <div className="encarte-etiqueta-rodape">
              {promocional && validade && <span>Válido até {dataEncarte(validade)}</span>}
              {item.tipo === "clube" && <span>CPF no caixa</span>}
            </div>
          </div>
        );
      })}
    </article>
  );
}

export function FolhasImpressaoEtiquetas({ dados, modelo, total }) {
  const porPagina = modelo.colunas * modelo.linhas;
  return (
    <div id="encarte-folhas-impressao" hidden>
      {Array.from({ length: total }, (_, indice) => (
        <div className="encarte-etiquetas-pagina" key={indice}>
          <EtiquetasA4 dados={dados} modelo={modelo}
            itens={dados.itens.slice(indice * porPagina, (indice + 1) * porPagina)} />
        </div>
      ))}
    </div>
  );
}

export async function imprimirEtiquetasA4() {
  const folhas = document.getElementById("encarte-folhas-impressao");
  const { default: estilos } = await import("./etiquetasEncarte.css?inline");
  document.getElementById("encarte-janela-impressao")?.remove();
  const quadro = document.createElement("iframe");
  quadro.id = "encarte-janela-impressao";
  quadro.title = "Impressão das etiquetas de gôndola";
  quadro.style.cssText = "position:fixed;bottom:0;right:0;width:1px;height:1px;border:0;";
  document.body.append(quadro);

  try {
    const documento = quadro.contentDocument;
    const janela = quadro.contentWindow;
    documento.title = "Etiquetas de Gôndola — A4";
    documento.documentElement.lang = "pt-BR";
    const css = documento.createElement("style");
    css.textContent = `@page { size: A4 portrait; margin: 0; } body { margin: 0; } ${estilos}`;
    documento.head.append(css);
    for (const folha of folhas.children) documento.body.append(folha.cloneNode(true));
    await documento.fonts.ready;
    await Promise.all([...documento.images].map((imagem) => imagem.decode()));
    janela.addEventListener("afterprint", () => quadro.remove(), { once: true });
    janela.focus();
    janela.print();
  } catch (erro) {
    quadro.remove();
    throw erro;
  }
}

function Folha({ dados, itens, pagina, total, exportavel }) {
  const modelo = obterModeloEncarte(dados.modelo);
  if (modelo.tema === "etiquetas") return <EtiquetasA4 dados={dados} itens={itens} modelo={modelo} exportavel={exportavel} />;
  const ofertas = Boolean(ARTES_OFERTAS[modelo.tema]);
  const blackFriday = modelo.tema === "black-friday";
  const colunas = modelo.id === "classico" ? modelo.colunas : Math.min(modelo.colunas, itens.length || modelo.colunas);
  const linhas = modelo.id === "classico" ? modelo.linhas : Math.max(1, Math.ceil(itens.length / colunas));
  const periodo = dados.inicio === dados.fim
    ? dataEncarte(dados.inicio)
    : `${dataEncarte(dados.inicio)} a ${dataEncarte(dados.fim)}`;
  return (
    <article id={exportavel ? "encarte-folha-exportavel" : undefined}
      className={`encarte-folha encarte-folha--${modelo.id}${modelo.tema === "acougue" ? " encarte-folha--acougue" : ""}${ofertas ? ` encarte-folha--ofertas encarte-folha--${modelo.tema}` : ""}`}
      style={{ width: modelo.largura, height: modelo.altura, "--colunas": colunas, "--linhas": linhas }}>
      {modelo.id === "tv-acougue" && (
        <img className="encarte-acougue-fundo" src={arteAcougue} alt="" />
      )}
      {modelo.tema === "acougue" && <CabecalhoAcougue dados={dados} vertical={modelo.id !== "tv-acougue"} />}
      {ofertas && <CabecalhoOfertas dados={dados} modelo={modelo} />}
      {modelo.tema !== "acougue" && !ofertas && (
        <header className="encarte-arte-cabecalho">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Superama+" />
          <div>
            <h2 className={dados.titulo.length > 44 ? "encarte-titulo-longo" : undefined}>{dados.titulo || "Ofertas Superama"}</h2>
            <p>{periodo ? `Loja ${dados.unidade} · ${periodo}` : "Superama+"}</p>
          </div>
        </header>
      )}
      <div className="encarte-arte-grade">
        {itens.map((item) => {
          const nome = item.nome || item.descricao;
          const anterior = modelo.permitePrecoAnterior ? precoAnteriorEncarte(item) : null;
          const preco = moedaEncarte.format(precoAtualEncarte(item));
          const unidade = unidadeExibidaEncarte(item);
          const validade = validadePrecoEncarte(item);
          return (
            <div key={item.codigo} className={`encarte-arte-produto encarte-arte-produto--${item.tipo}${item.destaque ? " encarte-arte-destaque" : ""}`}>
              {blackFriday && <span className="encarte-bf-card-marca" aria-hidden="true">Black<br />Friday</span>}
              {(modelo.id !== "classico" || item.imagemId) && <div className="encarte-arte-imagem" data-encarte-animar="foto"><ImagemProduto id={item.imagemId} /></div>}
              <div className="encarte-arte-texto">
                {item.tipo !== "normal" && <span className="encarte-arte-selo" data-encarte-animar="selo">{rotuloPreco[item.tipo]}</span>}
                <strong data-encarte-animar="nome" className={nome.length > 56 ? "encarte-nome-longo" : undefined}>{nome}</strong>
                {ofertas ? (
                  <div className="encarte-bf-precos" data-encarte-animar="preco">
                    {anterior && <small className="encarte-bf-preco-anterior">De: <s>{moedaEncarte.format(anterior)}</s></small>}
                    <p className={blackFriday && preco.length + unidade.length > 16 ? "encarte-bf-preco-compacto" : undefined}>
                      {blackFriday ? (
                        <><span className="encarte-bf-moeda">R$</span>{" "}<span className="encarte-bf-valor">{precoEtiqueta.format(precoAtualEncarte(item))}</span></>
                      ) : preco}{" "}
                      <small>/ {unidade}</small>
                    </p>
                  </div>
                ) : (
                  <p data-encarte-animar="preco">{preco} <small>/ {unidade}</small></p>
                )}
                {modelo.permiteLimite && item.limitado && (
                  <small className="encarte-arte-limite">{item.limite
                    ? `Limite: ${quantidadeEncarte.format(item.limite)} ${unidade} por cliente`
                    : "Quantidade limitada"}</small>
                )}
                {validade && validade < dados.fim && <small>Válido até {dataEncarte(validade)}</small>}
              </div>
            </div>
          );
        })}
      </div>
      <footer className="encarte-arte-rodape">
        <span>Produtos sujeitos à disponibilidade.{dados.itens.some((item) => item.tipo === "clube") && " Preço Clube com CPF no caixa."}</span>
        <span>{pagina}/{total}</span>
      </footer>
    </article>
  );
}

export function PreviaEncarte({ dados, itens, pagina = 1, total = 1, exportavel = false, ampliar = false }) {
  const modelo = obterModeloEncarte(dados.modelo);
  const area = useRef(null);
  const [largura, definirLargura] = useState(0);
  useLayoutEffect(() => {
    const elemento = area.current;
    const medir = () => definirLargura(elemento.clientWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);
  const escala = ampliar ? largura / modelo.largura : Math.min(1, largura / modelo.largura);
  return (
    <div className="encarte-arte-area" ref={area} style={{ height: modelo.altura * escala }}>
      <div style={{ transform: `scale(${escala})`, transformOrigin: "top left" }}>
        <Folha dados={dados} itens={itens} pagina={pagina} total={total} exportavel={exportavel} />
      </div>
    </div>
  );
}

export function FolhasDigitaisEncarte({ dados, modelo }) {
  const porPagina = modelo.colunas * modelo.linhas;
  const total = Math.ceil(dados.itens.length / porPagina);
  return (
    <div className="encarte-folhas-digitais" data-formato={modelo.id} aria-hidden="true" inert>
      {Array.from({ length: total }, (_, indice) => (
        <Folha key={indice} dados={dados} pagina={indice + 1} total={total}
          itens={dados.itens.slice(indice * porPagina, (indice + 1) * porPagina)} />
      ))}
    </div>
  );
}

export async function capturarFolhaEncarte(folha, modelo, { escala = 2, ocultar } = {}) {
  await Promise.all([...folha.querySelectorAll("img")].map(async (imagem) => {
    try {
      await imagem.decode();
    } catch {
      throw new Error("Uma imagem do encarte não carregou. Reabra o encarte e tente novamente.");
    }
  }));
  const html2pdf = (await import("html2pdf.js")).default;
  const { largura, altura } = modelo;
  const worker = html2pdf().set({
    jsPDF: { unit: "px", format: [largura, altura], orientation: largura > altura ? "landscape" : "portrait" },
    html2canvas: {
      scale: escala, width: largura, height: altura, useCORS: true, logging: false,
      onclone: ocultar ? (doc) => {
        const copia = doc.querySelector(".html2pdf__container");
        for (const elemento of copia.querySelectorAll(ocultar)) elemento.style.visibility = "hidden";
      } : undefined,
    },
    pagebreak: { mode: [] },
  }).from(folha);
  try {
    return await worker.toCanvas().get("canvas");
  } finally {
    worker.prop.overlay?.remove();
  }
}

export async function gerarImagemEncarte(modelo, formato = "png", folha = document.getElementById("encarte-folha-exportavel")) {
  const canvas = await capturarFolhaEncarte(folha, modelo);
  const tipo = formato === "jpg" ? "image/jpeg" : "image/png";
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar a imagem do encarte."));
    }, tipo, .94);
  });
}


export async function baixarEncarte(modelo, pagina, id, formato) {
  const imagem = await gerarImagemEncarte(modelo, formato);
  baixarArquivoEncarte(imagem, `encarte-${modelo.id}-${id}-pagina-${pagina}.${formato}`);
}

export function baixarArquivoEncarte(arquivo, nome) {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement("a");
  link.download = nome;
  link.href = url;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

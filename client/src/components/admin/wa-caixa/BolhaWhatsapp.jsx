import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { primeiroLinkHttps, parseTextoWhatsapp, partirBlocosMensagem } from "./formatarTextoWhatsapp.js";
import MidiaWhatsapp from "./MidiaWhatsapp.jsx";
import PreviaLink from "./PreviaLink.jsx";
import TextoWhatsapp from "./TextoWhatsapp.jsx";

const REACOES = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

function rotuloOrigem(origem) {
  if (origem === "campanha") return "Campanha";
  if (origem === "atendimento") return "Atendimento";
  if (origem === "sistema") return "Superama";
  return "Cliente";
}

function hora(valor) {
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function agruparReacoes(loja, cliente) {
  const mapa = new Map();
  for (const emoji of [cliente, loja]) {
    if (!emoji) continue;
    mapa.set(emoji, (mapa.get(emoji) || 0) + 1);
  }
  return [...mapa.entries()];
}

export default function BolhaWhatsapp({
  mensagem,
  agrupada,
  busca,
  atendendo = false,
  onTelefone,
  onVirarPedido,
  onTentar,
  onReagir,
  onApagar,
  onCompartilhar,
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef(null);
  const detalhe = mensagem.detalhe || {};
  const saindo = mensagem.direcao === "out";
  const foneLoja = saindo && mensagem.origem === "sistema";
  const acionavel = Number(mensagem.id) > 0 && !mensagem.pendente && !mensagem.enviando;
  const classeBase = [
    "wa-caixa__bolha",
    saindo ? "wa-caixa__bolha--out" : "wa-caixa__bolha--in",
    mensagem.origem === "campanha" ? "wa-caixa__bolha--campanha" : "",
    mensagem.origem === "atendimento" ? "wa-caixa__bolha--atendimento" : "",
    mensagem.tipo === "sticker" ? "wa-caixa__bolha--sticker" : "",
    mensagem.enviando ? "wa-caixa__bolha--enviando" : "",
    mensagem.falha ? "wa-caixa__bolha--falha" : "",
    mensagem.apagada ? "wa-caixa__bolha--apagada" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const lado = `wa-caixa__lado ${saindo ? "wa-caixa__lado--out" : "wa-caixa__lado--in"}${
    agrupada ? "" : " wa-caixa__lado--quebra"
  }`;

  useEffect(() => {
    if (!menuAberto) return undefined;
    function fechar(evento) {
      if (!menuRef.current?.contains(evento.target)) setMenuAberto(false);
    }
    function tecla(evento) {
      if (evento.key === "Escape") setMenuAberto(false);
    }
    document.addEventListener("pointerdown", fechar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fechar);
      document.removeEventListener("keydown", tecla);
    };
  }, [menuAberto]);

  function abrirMenu() {
    setMenuAberto((v) => !v);
  }

  const reacoes = agruparReacoes(mensagem.reacaoLoja, mensagem.reacaoCliente);
  const menu = acionavel && (onReagir || onApagar || onCompartilhar) && (
    <div className="wa-caixa__msg-menu" ref={menuRef}>
      <button
        type="button"
        className="wa-caixa__msg-mais"
        aria-expanded={menuAberto}
        aria-label="Ações da mensagem"
        onClick={abrirMenu}
      >
        <MoreHorizontal size={16} strokeWidth={2.25} aria-hidden />
      </button>
      {menuAberto && (
        <div className="wa-caixa__msg-pop" role="menu">
          {onReagir && mensagem.podeReagir && (
            <div className="wa-caixa__reagir" role="group" aria-label="Reagir">
              {REACOES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={mensagem.reacaoLoja === emoji ? "is-on" : ""}
                  disabled={!atendendo}
                  title={atendendo ? `Reagir com ${emoji}` : "Inicie o atendimento para reagir"}
                  aria-label={`Reagir com ${emoji}`}
                  onClick={() => {
                    setMenuAberto(false);
                    onReagir(mensagem, emoji);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {onCompartilhar && mensagem.podeCompartilhar && (
            <button
              type="button"
              role="menuitem"
              disabled={!atendendo}
              title={atendendo ? "Enviar para outro contato" : "Inicie o atendimento para compartilhar"}
              onClick={() => {
                setMenuAberto(false);
                onCompartilhar(mensagem);
              }}
            >
              Compartilhar
            </button>
          )}
          {onApagar && (
            <button
              type="button"
              role="menuitem"
              title="Some só nesta tela. O WhatsApp oficial não apaga no celular do cliente."
              onClick={() => {
                setMenuAberto(false);
                onApagar(mensagem, "mim");
              }}
            >
              Apagar daqui
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (mensagem.apagada) {
    return (
      <div className={lado}>
        <article className={classeBase}>
          <p>Mensagem apagada</p>
          <footer>
            <time>{hora(mensagem.criadoEm)}</time>
          </footer>
        </article>
      </div>
    );
  }

  const legendas = new Set(["Imagem", "Áudio", "Vídeo", "Figurinha", "Documento", "Localização", "Contato"]);
  const texto = detalhe.temMidia && legendas.has(mensagem.texto) ? "" : mensagem.texto || "";
  const partes = texto ? partirBlocosMensagem(texto) : [""];
  const link = primeiroLinkHttps(parseTextoWhatsapp(texto));

  return (
    <div className={lado}>
      {partes.map((parte, indice) => {
        const ultima = indice === partes.length - 1;
        return (
          <article key={`${mensagem.id}-${indice}`} className={classeBase}>
            {indice === 0 && <MidiaWhatsapp mensagem={mensagem} />}
            {indice === 0 && detalhe.autorNome && (
              <strong className="wa-caixa__autor">{detalhe.autorNome}</strong>
            )}
            {indice === 0 && detalhe.encaminhada && (
              <span className="wa-caixa__encaminhada">Encaminhada</span>
            )}
            {parte && (
              <TextoWhatsapp
                texto={parte}
                busca={busca}
                onTelefone={onTelefone}
                foneLoja={foneLoja}
              />
            )}
            {ultima && detalhe.cta?.url && (
              <a className="wa-caixa__cta" href={detalhe.cta.url} target="_blank" rel="noopener noreferrer">
                {detalhe.cta.texto || "Abrir"}
              </a>
            )}
            {ultima && detalhe.itens?.length > 0 && (
              <ul className="wa-caixa__itens">
                {detalhe.itens.map((item) => (
                  <li key={`${item.codigo}-${item.quantidade}`}>
                    {item.quantidade}× {item.codigo}
                  </li>
                ))}
              </ul>
            )}
            {ultima && detalhe.itens?.length > 0 && onVirarPedido && (
              <button type="button" className="wa-caixa__virar" onClick={() => onVirarPedido(detalhe.itens)}>
                Virar pedido
              </button>
            )}
            {ultima && link && <PreviaLink url={link} />}
            {ultima && (
              <footer>
                {!detalhe.autorNome && <span>{rotuloOrigem(mensagem.origem)}</span>}
                {mensagem.enviando ? (
                  <span className="wa-caixa__relogio" aria-label="Enviando" />
                ) : (
                  <time>{hora(mensagem.criadoEm)}</time>
                )}
                {mensagem.falha && <span className="wa-caixa__envio-falha">{mensagem.falha}</span>}
                {mensagem.falha && onTentar && (
                  <button type="button" className="wa-caixa__retentar" onClick={() => onTentar(mensagem)}>
                    Tentar de novo
                  </button>
                )}
                {menu}
              </footer>
            )}
          </article>
        );
      })}
      {reacoes.length > 0 && (
        <div className="wa-caixa__reacoes" aria-label="Reações">
          {reacoes.map(([emoji, qtd]) => (
            <span key={emoji}>
              {emoji}
              {qtd > 1 ? ` ${qtd}` : ""}
            </span>
          ))}
        </div>
      )}
      {detalhe.botoes?.length > 0 && (
        <div className="wa-caixa__chips">
          {detalhe.botoes.map((botao) => (
            <span key={botao} className="wa-caixa__chip">
              {botao}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

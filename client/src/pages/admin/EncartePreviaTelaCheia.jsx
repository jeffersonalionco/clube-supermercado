import { useEffect, useId, useRef, useState } from "react";
import { Maximize, Minimize } from "lucide-react";
import { PreviaEncarte } from "./EncarteFolha.jsx";

export default function EncartePreviaTelaCheia({ modelo, previa, abasFormatos, paginacao }) {
  const dialogo = useRef(null);
  const conteudo = useRef(null);
  const tituloId = useId();
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    const elemento = conteudo.current;
    function aoMudarTelaCheia() {
      if (!document.fullscreenElement) dialogo.current.close();
    }
    elemento.addEventListener("fullscreenchange", aoMudarTelaCheia);
    return () => elemento.removeEventListener("fullscreenchange", aoMudarTelaCheia);
  }, []);

  function abrir() {
    dialogo.current.showModal();
    setAberta(true);
    // O diálogo já ocupa a janela quando o navegador não aceita a tela cheia nativa.
    if (document.fullscreenEnabled) conteudo.current.requestFullscreen?.().catch(() => {});
  }

  function aoFechar() {
    setAberta(false);
    if (document.fullscreenElement === conteudo.current) document.exitFullscreen().catch(() => {});
  }

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={abrir}>
        <Maximize size={16} aria-hidden="true" /> Tela cheia
      </button>
      <dialog ref={dialogo} className="encarte-tela-cheia" aria-labelledby={tituloId} onClose={aoFechar}>
        <div ref={conteudo} className="encarte-tela-cheia-conteudo">
          <header className="encarte-tela-cheia-topo">
            <h2 id={tituloId}>Prévia do encarte</h2>
            <button type="button" onClick={() => dialogo.current.close()}>
              <Minimize size={16} aria-hidden="true" /> Sair da tela cheia
            </button>
          </header>
          {aberta && (
            <>
              {(abasFormatos || previa.total > 1) && (
                <div className="encarte-tela-cheia-controles">
                  {abasFormatos}
                  {previa.total > 1 && paginacao}
                </div>
              )}
              <div className="encarte-tela-cheia-palco" style={{ "--encarte-proporcao": modelo.largura / modelo.altura }}>
                <PreviaEncarte {...previa} ampliar />
              </div>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}

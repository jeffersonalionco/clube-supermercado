import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function JanelaAdmin({
  titulo,
  subtitulo,
  onFechar,
  children,
  rodape,
  larga = false,
}) {
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;

  useEffect(() => {
    function aoTeclar(event) {
      if (event.key === "Escape") fecharRef.current();
    }
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  return (
    <div className="admin-janela" role="presentation" onClick={onFechar}>
      <div
        className={`admin-janela__painel ${larga ? "admin-janela__painel--larga" : "admin-janela__painel--media"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-janela-titulo"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-janela__head">
          <div>
            <h2 id="admin-janela-titulo">{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button type="button" className="admin-janela__fechar" onClick={onFechar} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className="admin-janela__corpo">{children}</div>
        {rodape && <footer className="admin-janela__rodape">{rodape}</footer>}
      </div>
    </div>
  );
}

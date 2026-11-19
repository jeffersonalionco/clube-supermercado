import { useId, useRef, useState } from "react";
import { Layers, X } from "lucide-react";
import { LIMITE_FORMATOS_ENCARTE } from "../../../../shared/modelosEncarte.js";

export default function EncarteSelecaoFormatos({ opcoes, selecionados, titulo, modelo, confirmar, onChange }) {
  const dialogo = useRef(null);
  const tituloId = useId();
  const modeloId = useId();
  const [rascunho, setRascunho] = useState(selecionados);

  function abrir() {
    setRascunho(selecionados);
    dialogo.current.showModal();
  }

  const quantidade = rascunho.length;
  return (
    <div className="encarte-seletor-formatos">
      <button type="button" className="encarte-formato-abrir" aria-haspopup="dialog" onClick={abrir}>
        <Layers size={16} aria-hidden="true" /> {titulo}
      </button>
      <dialog ref={dialogo} className="encarte-formatos-dialogo" aria-labelledby={tituloId} aria-describedby={modeloId}>
        <header className="encarte-formatos-cabecalho">
          <div>
            <h2 id={tituloId}>{titulo}</h2>
            <p id={modeloId}>{modelo}</p>
          </div>
          <button type="button" aria-label="Fechar seleção de formatos" onClick={() => dialogo.current.close()}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <fieldset className="encarte-selecao-formatos">
          <legend>Selecione até {LIMITE_FORMATOS_ENCARTE} formatos</legend>
          {opcoes.map((opcao) => {
            const selecionado = rascunho.includes(opcao.id);
            return (
              <label className="encarte-selecao-formato" key={opcao.id}>
                <input type="checkbox" checked={selecionado}
                  disabled={selecionado ? quantidade === 1 : quantidade >= LIMITE_FORMATOS_ENCARTE}
                  onChange={() => setRascunho((atuais) => selecionado
                    ? atuais.filter((id) => id !== opcao.id)
                    : [...atuais, opcao.id])} />
                <span>{opcao.formato}</span>
                <small>{opcao.largura * 2} × {opcao.altura * 2} px</small>
              </label>
            );
          })}
        </fieldset>
        <footer className="encarte-formatos-acoes">
          <button type="button" onClick={() => dialogo.current.close()}>Cancelar</button>
          <button type="button" className="encarte-principal" onClick={() => {
            dialogo.current.close();
            onChange(rascunho);
          }}>{confirmar ?? `Abrir editor com ${quantidade} ${quantidade === 1 ? "formato" : "formatos"}`}</button>
        </footer>
      </dialog>
    </div>
  );
}

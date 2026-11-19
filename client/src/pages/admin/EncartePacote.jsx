import { Download } from "lucide-react";
import { useState } from "react";
import { baixarArquivoEncarte, FolhasDigitaisEncarte, gerarImagemEncarte } from "./EncarteFolha.jsx";

export default function EncartePacote({ dados, formatos, modeloAtivo, registroId, executar, progresso }) {
  const [extensao, setExtensao] = useState("png");

  async function exportar(modelos) {
    const divisao = document.getElementById("encarte-folhas-pacote");
    const arquivos = {};
    const { zipSync } = await import("fflate");
    try {
      for (const modelo of modelos) {
        const folhas = divisao.querySelector(`[data-formato="${modelo.id}"]`).children;
        for (const [indice, folha] of [...folhas].entries()) {
          progresso(`Preparando ${modelo.formato}, página ${indice + 1} de ${folhas.length}…`);
          const imagem = await gerarImagemEncarte(modelo, extensao, folha);
          arquivos[`${modelo.id}/pagina-${indice + 1}.${extensao}`] = new Uint8Array(await imagem.arrayBuffer());
        }
      }
      const zip = zipSync(arquivos, { level: 0 });
      const nome = modelos.length === 1 ? modelos[0].id : "todos-os-formatos";
      baixarArquivoEncarte(new Blob([zip], { type: "application/zip" }), `encarte-${registroId}-${nome}-${extensao}.zip`);
    } finally {
      progresso("");
    }
  }

  return (
    <>
      <div className="encarte-exportacao-pacote">
        <label className="encarte-campo">Imagens do pacote
          <select value={extensao} onChange={(evento) => setExtensao(evento.target.value)}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <button type="button" onClick={() => executar(() => exportar([modeloAtivo]))}>
          <Download size={16} aria-hidden="true" /> Formato atual (ZIP)
        </button>
        <button type="button" className="encarte-principal" onClick={() => executar(() => exportar(formatos))}>
          <Download size={16} aria-hidden="true" /> Todos os formatos (ZIP)
        </button>
      </div>
      <div id="encarte-folhas-pacote" aria-hidden="true" inert>
        {formatos.map((modelo) => (
          <FolhasDigitaisEncarte key={modelo.id} dados={{ ...dados, modelo: modelo.id }} modelo={modelo} />
        ))}
      </div>
    </>
  );
}

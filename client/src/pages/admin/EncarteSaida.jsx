import { Copy, CopyPlus, Download, ExternalLink, Link2, Printer } from "lucide-react";
import EncarteAnimacao from "./EncarteAnimacao.jsx";
import EncartePacote from "./EncartePacote.jsx";
import { baixarEncarte, FolhasImpressaoEtiquetas, imprimirEtiquetasA4 } from "./EncarteFolha.jsx";

export default function EncarteSaida({
  dados, dadosDaPrevia, modelo, formatos, pagina, total, registroId, linkPublico,
  publicarPagina, duplicar, executar, onLogout, onProgresso, onMensagem, mensagem, erro,
}) {
  const etiquetas = modelo.tema === "etiquetas";
  return (
    <aside className="encarte-painel encarte-saida" aria-label="Exportar e compartilhar">
      <header className="encarte-saida-topo">
        <div>
          <h2>Exportar e compartilhar</h2>
          <p>{modelo.formato} · Página {pagina} de {total}</p>
        </div>
        <button type="button" className="encarte-saida-duplicar" onClick={duplicar}>
          <CopyPlus size={16} aria-hidden="true" /> Duplicar encarte
        </button>
      </header>

      <section className="encarte-saida-secao">
        <h3>{etiquetas ? "Impressão e imagens" : "Imagem da página atual"}</h3>
        {etiquetas && (
          <>
            <button type="button" className="encarte-principal" onClick={() => executar(imprimirEtiquetasA4)}>
              <Printer size={16} aria-hidden="true" /> Imprimir folhas A4
            </button>
            <FolhasImpressaoEtiquetas dados={dadosDaPrevia} modelo={modelo} total={total} />
          </>
        )}
        <div className="encarte-saida-botoes">
          {["png", "jpg"].map((extensao) => (
            <button key={extensao} type="button" onClick={() => executar(() => baixarEncarte(modelo, pagina, registroId, extensao))}>
              <Download size={16} aria-hidden="true" /> Baixar {extensao.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {formatos.length > 1 && (
        <section className="encarte-saida-secao">
          <h3>Pacote de imagens</h3>
          <p>Todas as páginas do formato atual ou de todos os formatos.</p>
          <EncartePacote dados={dados} formatos={formatos} modeloAtivo={modelo} registroId={registroId}
            executar={executar} progresso={onProgresso} />
        </section>
      )}

      <section className="encarte-saida-secao">
        <h3>Compartilhar página</h3>
        {linkPublico ? (
          <>
            <label className="encarte-campo">Link público
              <input value={linkPublico} readOnly onFocus={(evento) => evento.target.select()} />
            </label>
            <div className="encarte-saida-botoes">
              <a href={linkPublico} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} aria-hidden="true" /> Abrir imagem
              </a>
              {navigator.clipboard && <button type="button" onClick={() => executar(async () => {
                await navigator.clipboard.writeText(linkPublico);
                onMensagem("Link copiado.");
              })}><Copy size={16} aria-hidden="true" /> Copiar link</button>}
            </div>
          </>
        ) : (
          <button type="button" onClick={() => executar(publicarPagina)}>
            <Link2 size={16} aria-hidden="true" /> Gerar link público
          </button>
        )}
      </section>

      {!etiquetas && dados.animacao?.ativa === true && (
        <section className="encarte-saida-secao">
          <h3>Vídeo do formato atual</h3>
          <EncarteAnimacao key={modelo.id} dados={dadosDaPrevia} modelo={modelo} total={total}
            onLogout={onLogout} registroId={registroId} />
        </section>
      )}
      <div className="encarte-saida-feedback" aria-live="polite">
        {erro ? <p className="admin-alert" role="alert">{erro}</p> :
          <p className="encarte-secundario">{mensagem}</p>}
      </div>
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { Clapperboard, Download, Pause, Play, RotateCcw, X } from "lucide-react";
import { fetchAdmin } from "../../utils/adminSession.js";
import {
  EFEITOS_ELEMENTOS_ENCARTE, ELEMENTOS_ENCARTE, ENTRADAS_ENCARTE,
  MAX_SEGUNDOS_ENCARTE, MIN_SEGUNDOS_ENCARTE, normalizarAnimacaoEncarte,
  TRANSICOES_ENCARTE, VELOCIDADES_ENCARTE,
} from "../../../../shared/animacaoEncarte.js";
import { API_ENCARTE } from "./EncarteCatalogo.jsx";
import { FolhasDigitaisEncarte, PreviaEncarte } from "./EncarteFolha.jsx";
import { criarReprodutorEncarte, gravarVideoEncarte, prepararCenasEncarte } from "./animarEncarte.js";

const DURACOES = Array.from({ length: MAX_SEGUNDOS_ENCARTE - MIN_SEGUNDOS_ENCARTE + 1 }, (_, indice) => {
  const segundos = MIN_SEGUNDOS_ENCARTE + indice;
  return [segundos, `${segundos} s`];
});

function Seletor({ rotulo, opcoes, valor, onChange, disabled }) {
  return (
    <label className="encarte-campo">{rotulo}
      <select value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {opcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
      </select>
    </label>
  );
}

function Configuracoes({ config, editar, total }) {
  const novaSemente = () => crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  const mudar = (campo) => (valor) => editar({
    ...config, [campo]: valor,
    semente: valor === "aleatorio" && !config.semente ? novaSemente() : config.semente,
  });
  const usaSorteio = config.entrada === "aleatorio" ||
    (config.efeitoElementos === "aleatorio" && config.elementos.length > 0) ||
    (config.transicao === "aleatorio" && total > 1);
  return (
    <div className="encarte-animacao-config">
      <label className="encarte-checkbox">
        <input type="checkbox" checked={config.ativa} onChange={(e) => mudar("ativa")(e.target.checked)} />
        Animar encarte
      </label>
      {config.ativa && (
        <>
          <fieldset className="encarte-animacao-opcoes">
            <legend>Produtos e elementos</legend>
            <Seletor rotulo="Entrada dos produtos" valor={config.entrada} opcoes={ENTRADAS_ENCARTE} onChange={mudar("entrada")} />
            <div className="encarte-animacao-elementos" role="group" aria-label="Elementos a animar">
              {ELEMENTOS_ENCARTE.map(([valor, nome]) => (
                <label className="encarte-checkbox" key={valor}>
                  <input type="checkbox" checked={config.elementos.includes(valor)} onChange={(e) => mudar("elementos")(
                    e.target.checked ? [...config.elementos, valor] : config.elementos.filter((id) => id !== valor)
                  )} />
                  {nome}
                </label>
              ))}
            </div>
            <div className="encarte-animacao-campos">
              <Seletor rotulo="Efeito dos elementos" valor={config.efeitoElementos} opcoes={EFEITOS_ELEMENTOS_ENCARTE}
                disabled={!config.elementos.length} onChange={mudar("efeitoElementos")} />
              <Seletor rotulo="Velocidade dos efeitos" valor={config.velocidade} opcoes={VELOCIDADES_ENCARTE} onChange={mudar("velocidade")} />
            </div>
          </fieldset>
          <fieldset className="encarte-animacao-opcoes">
            <legend>Páginas</legend>
            <Seletor rotulo="Segundos por página" valor={config.segundos} opcoes={DURACOES} onChange={(valor) => mudar("segundos")(Number(valor))} />
            <div className="encarte-animacao-campos">
              <Seletor rotulo="Transição entre páginas" valor={config.transicao} opcoes={TRANSICOES_ENCARTE}
                disabled={total < 2} onChange={mudar("transicao")} />
              <Seletor rotulo="Velocidade da transição" valor={config.velocidadeTransicao} opcoes={VELOCIDADES_ENCARTE}
                disabled={total < 2 || config.transicao === "direta"} onChange={mudar("velocidadeTransicao")} />
            </div>
            {total < 2 && <small className="encarte-secundario">As transições ficam disponíveis a partir da segunda página.</small>}
          </fieldset>
          {usaSorteio && (
            <div className="encarte-acoes">
              <button type="button" onClick={() => editar({ ...config, semente: novaSemente() })}>Sortear novamente</button>
              <small className="encarte-secundario">O mesmo sorteio é usado na prévia e no vídeo.</small>
            </div>
          )}
          <label className="encarte-checkbox">
            <input type="checkbox" checked={config.repetir} onChange={(e) => mudar("repetir")(e.target.checked)} />
            Repetir na prévia
          </label>
        </>
      )}
    </div>
  );
}

export default function EncarteAnimacao({ dados, modelo, total, registroId, editar, onLogout }) {
  const config = normalizarAnimacaoEncarte(dados.animacao);
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState("");
  const [erro, setErro] = useState("");
  const [previaPronta, setPreviaPronta] = useState(false);
  const [reproduzindo, setReproduzindo] = useState(false);
  const dialogo = useRef(null);
  const canvas = useRef(null);
  const folhas = useRef(null);
  const tarefa = useRef(null);
  const previa = useRef({ frame: null, tempo: 0, reprodutor: null });

  useEffect(() => {
    const atual = previa.current;
    setPreviaPronta(false);
    setReproduzindo(false);
    setEstado("");
    setErro("");
    return () => {
      tarefa.current?.abort();
      tarefa.current = null;
      cancelAnimationFrame(atual.frame);
      atual.reprodutor = null;
      atual.tempo = 0;
    };
  }, [aberto, dados, modelo]);

  function pausar() {
    cancelAnimationFrame(previa.current.frame);
    setReproduzindo(false);
  }

  function reproduzir(reiniciar = false) {
    const atual = previa.current;
    const { reprodutor } = atual;
    cancelAnimationFrame(atual.frame);
    if (reiniciar || atual.tempo >= reprodutor.duracao) atual.tempo = 0;
    const inicio = performance.now() - atual.tempo * 1000;
    setReproduzindo(true);
    function animar(agora) {
      atual.tempo = Math.max(0, (agora - inicio) / 1000);
      if (atual.tempo >= reprodutor.duracao && !config.repetir) {
        reprodutor.desenhar(reprodutor.duracao);
        setReproduzindo(false);
        return;
      }
      reprodutor.desenhar(atual.tempo % reprodutor.duracao);
      atual.frame = requestAnimationFrame(animar);
    }
    atual.frame = requestAnimationFrame(animar);
  }

  async function executar(acao) {
    if (tarefa.current) return;
    setErro("");
    const controle = new AbortController();
    tarefa.current = controle;
    try {
      await acao(controle.signal);
    } catch (falha) {
      if (!controle.signal.aborted) {
        if (falha.code === "UNAUTHORIZED") onLogout();
        else setErro(falha.message || "Não foi possível preparar a animação.");
      }
    } finally {
      if (tarefa.current === controle) {
        tarefa.current = null;
        setEstado("");
      }
    }
  }

  async function montarCenas(escala, sinal) {
    const paginas = [...folhas.current.querySelector(".encarte-folhas-digitais").children];
    return prepararCenasEncarte(paginas, modelo, config, escala, sinal,
      (pagina, quantidade) => setEstado(`Preparando página ${pagina} de ${quantidade}…`));
  }

  function abrirPrevia() {
    executar(async (sinal) => {
      previa.current.reprodutor = criarReprodutorEncarte(canvas.current, await montarCenas(1, sinal), config);
      setPreviaPronta(true);
      reproduzir(true);
    });
  }

  function baixarVideo() {
    executar(async (sinal) => {
      pausar();
      const captura = document.createElement("canvas");
      const cenas = await montarCenas(2, sinal);
      const reprodutor = criarReprodutorEncarte(captura, cenas, config);
      setEstado("Gravando vídeo… Mantenha esta aba aberta.");
      let segundoAnterior = -1;
      let video = await gravarVideoEncarte(captura, reprodutor, sinal, (tempo, duracao) => {
        const segundo = Math.floor(tempo);
        if (segundo === segundoAnterior) return;
        segundoAnterior = segundo;
        setEstado(`Gravando vídeo… ${segundo} de ${duracao} s. Mantenha esta aba aberta.`);
      });

      if (!video.type.startsWith("video/mp4")) {
        setEstado("Convertendo vídeo para MP4…");
        const body = new FormData();
        body.append("video", video, "encarte.webm");
        const params = new URLSearchParams({ formato: modelo.id });
        video = await fetchAdmin(`${API_ENCARTE}/${registroId}/video?${params}`, { method: "POST", body, signal: sinal, resposta: "blob" });
      }

      sinal.throwIfAborted();
      const url = URL.createObjectURL(video);
      const link = document.createElement("a");
      link.download = `encarte-${modelo.id}-${registroId}.mp4`;
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  if (!editar && !config.ativa) return null;

  function abrirDialogo() {
    setAberto(true);
    dialogo.current.showModal();
  }

  function fecharDialogo() {
    tarefa.current?.abort();
    pausar();
    setAberto(false);
  }

  return (
    <section className="encarte-animacao">
      <button type="button" className="encarte-animacao-abrir" onClick={abrirDialogo}>
        <Clapperboard size={18} aria-hidden="true" /> {editar ? "Configurar animação" : "Prévia e vídeo"}
      </button>
      {config.ativa && <span className="encarte-secundario">Animação ativa · {total * config.segundos} s</span>}
      <dialog ref={dialogo} className="encarte-animacao-dialogo" onClose={fecharDialogo} aria-labelledby="encarte-animacao-titulo">
        {aberto && (
          <>
            <header className="encarte-animacao-cabecalho">
              <div>
                <h2 id="encarte-animacao-titulo">Animação do encarte</h2>
                <p className="encarte-secundario">{dados.titulo} · {modelo.formato}</p>
              </div>
              <button type="button" aria-label="Fechar configurações de animação" onClick={() => dialogo.current.close()}>
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            <div className={`encarte-animacao-corpo${editar ? "" : " encarte-animacao-corpo--video"}`}>
              {editar && <Configuracoes config={config} editar={editar} total={total} />}
              <section className="encarte-animacao-previa" aria-label="Prévia">
                <div className="encarte-animacao-palco">
                  <div className="encarte-animacao-quadro" style={{ "--largura-animacao": `${56 * modelo.largura / modelo.altura}dvh` }}>
                    {!previaPronta && (
                      <PreviaEncarte dados={dados} total={total} itens={dados.itens.slice(0, modelo.colunas * modelo.linhas)} />
                    )}
                    <canvas ref={canvas} hidden={!previaPronta} className="encarte-animacao-canvas" aria-label="Prévia animada do encarte" />
                  </div>
                </div>
                {config.ativa && (
                  <>
                    <div className="encarte-animacao-reproducao">
                      <p className="encarte-secundario">{total * config.segundos} s · {total} {total === 1 ? "página" : "páginas"}</p>
                      <div className="encarte-acoes">
                        {!previaPronta ? (
                          <button type="button" disabled={!dados.itens.length || Boolean(estado)} onClick={abrirPrevia}><Play size={16} /> Reproduzir prévia</button>
                        ) : (
                          <>
                            <button type="button" disabled={Boolean(estado)} onClick={reproduzindo ? pausar : () => reproduzir()}>
                              {reproduzindo ? <Pause size={16} /> : <Play size={16} />} {reproduzindo ? "Pausar" : "Reproduzir"}
                            </button>
                            <button type="button" disabled={Boolean(estado)} onClick={() => reproduzir(true)}><RotateCcw size={16} /> Reiniciar</button>
                          </>
                        )}
                        {registroId && <button type="button" className="encarte-principal" disabled={!dados.itens.length || Boolean(estado)} onClick={baixarVideo}>
                          <Download size={16} /> Baixar MP4
                        </button>}
                      </div>
                    </div>
                    {estado && <p className="encarte-secundario" role="status">{estado}</p>}
                    {erro && <p className="admin-alert" role="alert">{erro}</p>}
                    <div ref={folhas}><FolhasDigitaisEncarte dados={dados} modelo={modelo} /></div>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}

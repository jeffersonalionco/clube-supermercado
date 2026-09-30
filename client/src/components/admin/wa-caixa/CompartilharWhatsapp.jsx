import { useEffect, useState } from "react";
import { fetchAdmin } from "../../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../../utils/mensagensUsuario.js";

function nomeContato(contato) {
  return contato.nomeWa || contato.nomeClube || contato.telefoneExibicao || "Contato";
}

function horaJanela(valor) {
  if (!valor) return "";
  return new Date(valor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function CompartilharWhatsapp({ aberto, enviando, erroEnvio = "", onFechar, onEscolher }) {
  const [busca, setBusca] = useState("");
  const [contatos, setContatos] = useState([]);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!aberto) return undefined;
    setBusca("");
    setErro("");
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return undefined;
    let vivo = true;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ busca, limit: "80" });
      fetchAdmin(`/api/admin/marketing/whatsapp/contatos?${qs}`)
        .then((data) => {
          if (vivo) setContatos(data.contatos || []);
        })
        .catch((err) => {
          if (vivo) setErro(mensagemParaUsuario(err.message));
        });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [aberto, busca]);

  if (!aberto) return null;

  return (
    <div className="wa-caixa__dialogo-fundo" role="presentation" onClick={onFechar}>
      <div
        className="wa-caixa__dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-compartilhar-titulo"
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="wa-caixa__dialogo-head">
          <strong id="wa-compartilhar-titulo">Compartilhar com</strong>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </header>
        <p className="wa-caixa__dialogo-nota">
          Só dá para enviar para quem escreveu nas últimas 24 horas. Contato com a janela fechada fica bloqueado.
        </p>
        <input
          type="search"
          value={busca}
          placeholder="Nome ou telefone"
          aria-label="Buscar contato"
          onChange={(evento) => setBusca(evento.target.value)}
          autoFocus
        />
        {(erro || erroEnvio) && <p className="wa-caixa__pedido-erro">{erro || erroEnvio}</p>}
        <ul className="wa-caixa__dialogo-lista">
          {contatos.length === 0 ? (
            <li className="wa-caixa__vazio">Nenhum contato nesta busca.</li>
          ) : (
            [...contatos]
              .sort((a, b) => Number(b.janelaAberta) - Number(a.janelaAberta))
              .map((contato) => {
                const aberta = contato.janelaAberta === true;
                const hora = horaJanela(contato.janelaAte);
                return (
                  <li key={contato.telefone}>
                    <button
                      type="button"
                      disabled={enviando || !aberta}
                      title={
                        aberta
                          ? "Janela aberta. Pode receber agora."
                          : "Janela fechada. Esse contato precisa escrever de novo."
                      }
                      onClick={() => {
                        if (!aberta) {
                          setErro("Esse contato está com a janela de 24 horas fechada.");
                          return;
                        }
                        onEscolher(contato.telefone);
                      }}
                    >
                      <strong>{nomeContato(contato)}</strong>
                      <span>
                        {contato.telefoneExibicao}
                        {contato.temClube ? " · Clube" : ""}
                        {" · "}
                        <em className={aberta ? "is-ok" : "is-off"}>
                          {aberta ? `Janela aberta até ${hora}` : "Janela fechada"}
                        </em>
                      </span>
                    </button>
                  </li>
                );
              })
          )}
        </ul>
      </div>
    </div>
  );
}

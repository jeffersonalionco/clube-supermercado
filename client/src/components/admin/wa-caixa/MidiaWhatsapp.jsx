import { useEffect, useState } from "react";
import { apiUrl } from "../../../utils/api.js";
import { loadAdminSession } from "../../../utils/adminSession.js";

function useMidia(mensagemId, ativoMidia) {
  const [url, setUrl] = useState("");
  const [falha, setFalha] = useState(false);

  useEffect(() => {
    if (!ativoMidia) return undefined;
    let vivo = true;
    let objeto = "";
    const session = loadAdminSession();
    fetch(apiUrl(`/api/admin/marketing/whatsapp/caixa/mensagens/${mensagemId}/midia`), {
      headers: { Authorization: `Bearer ${session?.token || ""}` },
    })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error("midia");
        objeto = URL.createObjectURL(await resposta.blob());
        if (vivo) setUrl(objeto);
        else URL.revokeObjectURL(objeto);
      })
      .catch(() => {
        if (vivo) setFalha(true);
      });
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [mensagemId, ativoMidia]);

  return { url, falha };
}

export default function MidiaWhatsapp({ mensagem }) {
  const detalhe = mensagem.detalhe || {};
  const local = detalhe.previaUrl || "";
  const remoto = useMidia(mensagem.id, Boolean(detalhe.temMidia) && !local);
  const url = local || remoto.url;
  const falha = remoto.falha;
  const [aberta, setAberta] = useState(false);
  const mime = detalhe.mime || "";

  if (!detalhe.temMidia) {
    return null;
  }
  if (falha) {
    return <p className="wa-caixa__midia-falha">Não foi possível abrir este arquivo.</p>;
  }
  if (!url) {
    return <div className="wa-caixa__midia-espera" aria-hidden />;
  }

  if (mime.startsWith("audio/")) {
    return (
      <div className="wa-caixa__audio">
        <span>{detalhe.voice ? "Mensagem de voz" : "Áudio"}</span>
        <audio controls preload="none" src={url} />
      </div>
    );
  }

  if (mime.startsWith("video/")) {
    return <video className="wa-caixa__video" controls preload="metadata" src={url} />;
  }

  if (!mime.startsWith("image/")) {
    return (
      <a className="wa-caixa__doc" href={url} download={detalhe.nomeArquivo || "arquivo"}>
        {detalhe.nomeArquivo || "Arquivo"}
      </a>
    );
  }

  const figurinha = mensagem.tipo === "sticker";
  return (
    <>
      <button
        type="button"
        className={`wa-caixa__foto${figurinha ? " wa-caixa__foto--sticker" : ""}`}
        onClick={() => setAberta(true)}
      >
        <img src={url} alt={figurinha ? "Figurinha" : "Imagem enviada"} />
      </button>
      {aberta && (
        <div className="wa-caixa__luz" role="dialog" aria-modal="true" onClick={() => setAberta(false)}>
          <img src={url} alt="" onClick={(evento) => evento.stopPropagation()} />
        </div>
      )}
    </>
  );
}

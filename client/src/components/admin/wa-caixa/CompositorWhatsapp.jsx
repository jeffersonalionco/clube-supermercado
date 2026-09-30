import { useEffect, useRef, useState } from "react";

const MAX_ANEXOS = 10;
const ACEITA =
  "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/mpeg,audio/ogg,audio/mp4,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.mp4,.3gp,.mp3,.ogg,.m4a";

const MIME_DOC = {
  txt: "text/plain",
  csv: "text/plain",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function extensao(nome) {
  const ext = String(nome || "").split(".").pop().toLowerCase();
  return ext && ext.length <= 5 ? ext : "";
}

export function mimeLocal(arquivo) {
  const peloNome = MIME_DOC[extensao(arquivo?.name)];
  if (peloNome) return peloNome;
  const mime = arquivo?.type || "";
  return mime && mime !== "application/octet-stream" ? mime : "";
}

function limiteDoArquivo(arquivo) {
  return tipoLocal(arquivo) === "image" ? 5 * 1024 * 1024 : 16 * 1024 * 1024;
}

export function arquivoCabeNoWhatsapp(arquivo) {
  return arquivo.size <= limiteDoArquivo(arquivo);
}

export function avisoArquivoGrande(arquivo) {
  const tipo = tipoLocal(arquivo);
  const mb = Math.round(limiteDoArquivo(arquivo) / (1024 * 1024));
  if (tipo === "image") return `A foto passou de ${mb} MB.`;
  if (tipo === "video") return `O vídeo passou de ${mb} MB.`;
  if (tipo === "audio") return `O áudio passou de ${mb} MB.`;
  return `O arquivo passou de ${mb} MB.`;
}

export function tipoLocal(arquivo) {
  if (MIME_DOC[extensao(arquivo?.name)]) return "document";
  const mime = arquivo.type || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || /\.pdf$/i.test(arquivo.name)) return "document";
  return "outro";
}

const EMOJIS = [
  "😀", "😁", "😊", "😉", "😍", "😘", "😅", "😂",
  "🙂", "🤗", "😎", "🤝", "👍", "👏", "🙏", "✅",
  "❤️", "💚", "✨", "🎉", "🔥", "⭐", "💬", "📞",
  "🛒", "🏪", "🍞", "🧀", "🥛", "🍎", "☕", "🎁",
];

export default function CompositorWhatsapp({ pronto, aberto, onEnviar, onEnviarMidia }) {
  const [texto, setTexto] = useState("");
  const [emojis, setEmojis] = useState(false);
  const [anexos, setAnexos] = useState([]);
  const [limite, setLimite] = useState("");
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const campoRef = useRef(null);
  const caixaRef = useRef(null);
  const arquivoRef = useRef(null);
  const anexosRef = useRef([]);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(0);
  const cancelarRef = useRef(false);

  useEffect(() => {
    const anteriores = anexosRef.current;
    const atuais = new Set(anexos.map((item) => item.url));
    for (const item of anteriores) {
      if (!atuais.has(item.url)) URL.revokeObjectURL(item.url);
    }
    anexosRef.current = anexos;
  }, [anexos]);

  useEffect(() => {
    return () => {
      for (const item of anexosRef.current) URL.revokeObjectURL(item.url);
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((faixa) => faixa.stop());
    };
  }, []);

  useEffect(() => {
    if (!emojis) return undefined;
    function fechar(evento) {
      if (!caixaRef.current?.contains(evento.target)) setEmojis(false);
    }
    document.addEventListener("mousedown", fechar);
    return () => document.removeEventListener("mousedown", fechar);
  }, [emojis]);

  function inserirEmoji(emoji) {
    const campo = campoRef.current;
    const inicio = campo?.selectionStart ?? texto.length;
    const fim = campo?.selectionEnd ?? texto.length;
    const proximo = `${texto.slice(0, inicio)}${emoji}${texto.slice(fim)}`;
    setTexto(proximo.slice(0, 4000));
    setEmojis(false);
    requestAnimationFrame(() => {
      campo?.focus();
      const pos = inicio + emoji.length;
      campo?.setSelectionRange(pos, pos);
    });
  }

  function tirarAnexo(url) {
    setAnexos((atual) => atual.filter((item) => item.url !== url));
    setLimite("");
  }

  function soltarMicrofone() {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((faixa) => faixa.stop());
    streamRef.current = null;
  }

  function mimeGravacao() {
    const tipos = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return tipos.find((tipo) => window.MediaRecorder?.isTypeSupported?.(tipo)) || "";
  }

  function guardarGravacao(blob, mime) {
    if (blob.size < 800) {
      setLimite("Gravação muito curta.");
      return;
    }
    const base = mime.split(";")[0];
    const ext = base.includes("ogg") ? "ogg" : base.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `voz.${ext}`, { type: base });
    file.voz = true;
    setAnexos((atual) =>
      [...atual, { file, url: URL.createObjectURL(file), tipo: "audio" }].slice(0, MAX_ANEXOS)
    );
    setLimite("");
  }

  async function iniciarGravacao() {
    if (gravando) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setLimite("Este navegador não grava áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mimeGravacao();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const pedacos = [];
      cancelarRef.current = false;
      rec.ondataavailable = (evento) => {
        if (evento.data?.size) pedacos.push(evento.data);
      };
      rec.onstop = () => {
        const cancelado = cancelarRef.current;
        cancelarRef.current = false;
        soltarMicrofone();
        setGravando(false);
        if (cancelado) return;
        const tipo = rec.mimeType || mime || "audio/webm";
        guardarGravacao(new Blob(pedacos, { type: tipo }), tipo);
      };
      streamRef.current = stream;
      recRef.current = rec;
      rec.start();
      setSegundos(0);
      setGravando(true);
      setEmojis(false);
      setLimite("");
      timerRef.current = setInterval(() => {
        setSegundos((atual) => {
          if (atual >= 179) {
            recRef.current?.stop();
            return atual;
          }
          return atual + 1;
        });
      }, 1000);
    } catch {
      soltarMicrofone();
      setGravando(false);
      setLimite("Não foi possível usar o microfone.");
    }
  }

  function pararGravacao(cancelar) {
    cancelarRef.current = Boolean(cancelar);
    clearInterval(timerRef.current);
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else {
      soltarMicrofone();
      setGravando(false);
    }
  }

  function escolherArquivo(evento) {
    const lista = [...(evento.target.files || [])];
    evento.target.value = "";
    if (!lista.length) return;
    const espaco = MAX_ANEXOS - anexos.length;
    if (espaco <= 0) {
      setLimite("Até 10 arquivos por vez.");
      return;
    }
    const grande = lista.find((file) => !arquivoCabeNoWhatsapp(file));
    const cabem = lista.filter((file) => arquivoCabeNoWhatsapp(file));
    if (!cabem.length) {
      setLimite(grande ? avisoArquivoGrande(grande) : "");
      return;
    }
    const novos = cabem.slice(0, espaco).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      tipo: tipoLocal(file),
    }));
    setLimite(
      grande
        ? avisoArquivoGrande(grande)
        : cabem.length > espaco
          ? "Até 10 arquivos por vez."
          : ""
    );
    setAnexos((atual) => [...atual, ...novos].slice(0, MAX_ANEXOS));
    setEmojis(false);
  }

  function enviar() {
    if (!aberto || gravando) return;
    if (anexos.length) {
      const arquivos = anexos.map((item) => item.file);
      const legenda = texto.trim();
      setTexto("");
      setAnexos([]);
      setLimite("");
      onEnviarMidia?.(arquivos, legenda);
      return;
    }
    const corpo = texto.trim();
    if (!corpo) return;
    setTexto("");
    onEnviar?.(corpo);
  }

  if (!pronto) {
    return <div className="wa-caixa__compositor wa-caixa__compositor--espera" />;
  }

  if (!aberto) {
    return (
      <div className="wa-caixa__compositor wa-caixa__compositor--fechado">
        <p>Janela de 24 horas fechada. A resposta livre volta quando o cliente escrever de novo.</p>
      </div>
    );
  }

  const nota =
    limite ||
    (anexos.length > 0 && anexos.every((item) => item.tipo === "audio") && texto.trim()
      ? "A legenda do áudio sai na mensagem seguinte."
      : anexos.length > 1 && texto.trim()
        ? "A legenda vai na última mídia."
        : "");

  return (
    <form
      className={`wa-caixa__compositor${anexos.length || limite ? " wa-caixa__compositor--anexo" : ""}`}
      ref={caixaRef}
      onSubmit={(evento) => {
        evento.preventDefault();
        enviar();
      }}
    >
      {limite && anexos.length === 0 && <p className="wa-caixa__previa-nota">{limite}</p>}
      {anexos.length > 0 && (
        <div className="wa-caixa__previa">
          {anexos.map((anexo) => (
            <div key={anexo.url} className="wa-caixa__previa-item">
              {anexo.tipo === "image" && <img src={anexo.url} alt="" />}
              {anexo.tipo === "video" && <video src={anexo.url} muted playsInline />}
              {anexo.tipo === "audio" && <span>{anexo.file.voz ? "Voz" : "Áudio"}</span>}
              {anexo.tipo !== "image" && anexo.tipo !== "video" && anexo.tipo !== "audio" && (
                <span>{anexo.file.name}</span>
              )}
              <button type="button" aria-label="Tirar arquivo" onClick={() => tirarAnexo(anexo.url)}>
                ×
              </button>
            </div>
          ))}
          {nota && <p className="wa-caixa__previa-nota">{nota}</p>}
        </div>
      )}
      {emojis && (
        <div className="wa-caixa__emojis" role="listbox" aria-label="Emojis">
          {EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => inserirEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="wa-caixa__tool wa-caixa__tool--emoji"
        aria-label="Emojis"
        aria-expanded={emojis}
        onClick={() => setEmojis((v) => !v)}
      >
        ☺
      </button>
      <button
        type="button"
        className="wa-caixa__tool wa-caixa__tool--emoji"
        aria-label="Anexar fotos, vídeos, áudios ou arquivos"
        onClick={() => arquivoRef.current?.click()}
      >
        +
      </button>
      <input
        ref={arquivoRef}
        type="file"
        accept={ACEITA}
        multiple
        hidden
        onChange={escolherArquivo}
      />
      {gravando ? (
        <div className="wa-caixa__gravando" role="status">
          <span className="wa-caixa__gravando-ponto" />
          <span>{`${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`}</span>
          <button type="button" onClick={() => pararGravacao(true)}>
            Cancelar
          </button>
          <button type="button" onClick={() => pararGravacao(false)}>
            Parar
          </button>
        </div>
      ) : (
        <textarea
          ref={campoRef}
          rows={1}
          value={texto}
          maxLength={anexos.length ? 900 : 4000}
          placeholder={anexos.length ? "Legenda (opcional)" : "Escreva uma resposta"}
          aria-label={anexos.length ? "Legenda" : "Resposta"}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === "Enter" && !evento.shiftKey) {
              evento.preventDefault();
              enviar();
            }
          }}
        />
      )}
      {!gravando && (
        <button
          type="button"
          className="wa-caixa__tool"
          aria-label="Gravar áudio"
          onClick={iniciarGravacao}
        >
          Gravar
        </button>
      )}
      <button type="submit" className="wa-caixa__enviar" disabled={gravando || (!anexos.length && !texto.trim())}>
        Enviar
      </button>
    </form>
  );
}

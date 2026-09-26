import { useEffect, useState } from "react";
import { Camera, ImageIcon, X } from "lucide-react";
import { resolveImagemUrl } from "../../utils/adminSession.js";

export const PADARIA_MAX_FOTOS_PEDIDO = 5;
export const PADARIA_FOTO_MAX_BYTES = 5 * 1024 * 1024;

const TIPOS_OK = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function urlFotoPadaria(url) {
  return resolveImagemUrl(url);
}

export function validarArquivoFotoPadaria(file) {
  if (!file) return "Arquivo inválido";
  if (file.size > PADARIA_FOTO_MAX_BYTES) {
    return "Cada foto deve ter no máximo 5 MB";
  }
  const tipoOk =
    TIPOS_OK.has(file.type) || /\.(jpe?g|png|webp|gif)$/i.test(file.name || "");
  if (!tipoOk) return "Use JPG, PNG, WEBP ou GIF";
  return null;
}

export function criarFotoLocal(file) {
  return {
    key: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    preview: URL.createObjectURL(file),
    name: file.name || "foto",
  };
}

export function revogarFotosLocais(lista) {
  for (const foto of lista || []) {
    if (foto?.preview) URL.revokeObjectURL(foto.preview);
  }
}

export function PadariaFotosStrip({ fotos = [], max = 3, className = "" }) {
  const lista = (fotos || []).filter((f) => f?.url || f?.preview);
  if (!lista.length) return null;
  const visiveis = lista.slice(0, max);
  const extra = lista.length - visiveis.length;
  return (
    <div className={`pk-fotos-strip ${className}`.trim()} aria-hidden>
      {visiveis.map((foto) => (
        <img
          key={foto.id || foto.key}
          src={foto.preview || urlFotoPadaria(foto.url)}
          alt=""
        />
      ))}
      {extra > 0 ? (
        <span className="pk-fotos-strip__more">+{extra}</span>
      ) : null}
    </div>
  );
}

export function PadariaFotosGaleria({
  fotos = [],
  titulo = "Fotos de referência",
  onLightboxChange,
  onRemover,
  removendoId,
}) {
  const lista = (fotos || []).filter((f) => f?.url || f?.preview);
  const [aberta, setAberta] = useState(null);

  useEffect(() => {
    onLightboxChange?.(aberta != null);
  }, [aberta, onLightboxChange]);

  useEffect(() => {
    if (aberta == null) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberta(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta]);

  if (!lista.length) return null;

  const fotoAberta = lista[aberta] || null;

  return (
    <div className="pk-fotos-galeria">
      {titulo ? <h3 className="pk-fotos-galeria__titulo">{titulo}</h3> : null}
      <div className="pk-fotos-galeria__grid">
        {lista.map((foto, idx) => (
          <div key={foto.id || foto.key || foto.url} className="pk-fotos-galeria__item">
            <button
              type="button"
              className="pk-fotos-galeria__thumb"
              onClick={() => setAberta(idx)}
              aria-label={`Ampliar foto ${idx + 1} de ${lista.length}`}
            >
              <img
                src={foto.preview || urlFotoPadaria(foto.url)}
                alt={`Referência ${idx + 1}`}
              />
            </button>
            {onRemover && foto.id ? (
              <button
                type="button"
                className="pk-fotos-galeria__x"
                disabled={Boolean(removendoId)}
                onClick={() => onRemover(foto)}
                aria-label="Remover foto"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {fotoAberta ? (
        <div className="pk-foto-lightbox" role="dialog" aria-modal="true">
          <button
            type="button"
            className="pk-foto-lightbox__backdrop"
            aria-label="Fechar foto"
            onClick={() => setAberta(null)}
          />
          <img
            className="pk-foto-lightbox__img"
            src={fotoAberta.preview || urlFotoPadaria(fotoAberta.url)}
            alt="Foto de referência ampliada"
          />
          <button
            type="button"
            className="pk-foto-lightbox__fechar"
            onClick={() => setAberta(null)}
            aria-label="Fechar"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function PadariaFotosCheckout({ fotos = [], onChange, disabled }) {
  const restantes = Math.max(0, PADARIA_MAX_FOTOS_PEDIDO - (fotos?.length || 0));

  function escolher(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length || disabled) return;
    const atuais = fotos || [];
    const aceitos = [];
    let erro = "";
    for (const file of files) {
      if (atuais.length + aceitos.length >= PADARIA_MAX_FOTOS_PEDIDO) {
        erro = `No máximo ${PADARIA_MAX_FOTOS_PEDIDO} fotos por pedido`;
        break;
      }
      const invalido = validarArquivoFotoPadaria(file);
      if (invalido) {
        erro = invalido;
        continue;
      }
      aceitos.push(criarFotoLocal(file));
    }
    if (aceitos.length) onChange?.([...atuais, ...aceitos], erro);
    else if (erro) onChange?.(atuais, erro);
  }

  function remover(key) {
    const atual = (fotos || []).find((f) => f.key === key);
    if (atual?.preview) URL.revokeObjectURL(atual.preview);
    onChange?.(
      (fotos || []).filter((f) => f.key !== key),
      ""
    );
  }

  return (
    <div className="pk-fotos-checkout">
      <div className="pk-fotos-checkout__head">
        <span>Fotos de referência</span>
        <small>Opcional · até {PADARIA_MAX_FOTOS_PEDIDO}</small>
      </div>
      {fotos.length > 0 ? (
        <div className="pk-fotos-checkout__lista">
          {fotos.map((foto) => (
            <div key={foto.key} className="pk-fotos-checkout__item">
              <img src={foto.preview} alt="" />
              <button
                type="button"
                className="pk-fotos-checkout__x"
                onClick={() => remover(foto.key)}
                disabled={disabled}
                aria-label="Remover foto"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="pk-fotos-checkout__hint">
          Anexe a foto do bolo, da escrita ou da referência do cliente. A
          produção vê no toque do card.
        </p>
      )}
      {restantes > 0 ? (
        <label className={`pk-fotos-checkout__add ${disabled ? "is-disabled" : ""}`}>
          <Camera size={16} strokeWidth={2} />
          {fotos.length ? "Adicionar outra" : "Adicionar fotos"}
          <span>
            {fotos.length}/{PADARIA_MAX_FOTOS_PEDIDO}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            disabled={disabled}
            onChange={escolher}
          />
        </label>
      ) : (
        <p className="pk-fotos-checkout__limite">Limite de 5 fotos atingido</p>
      )}
    </div>
  );
}

export function PadariaFotosBadge({ qtd }) {
  const n = Number(qtd) || 0;
  if (n <= 0) return null;
  return (
    <span className="pk-fotos-badge" title={`${n} foto(s) de referência`}>
      <ImageIcon size={12} strokeWidth={2.2} />
      {n}
    </span>
  );
}

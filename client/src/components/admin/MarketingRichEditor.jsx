import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, parseApiResponse } from "../../utils/api.js";
import {
  loadAdminSession,
  clearAdminSession,
  resolveImagemUrl,
} from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

function extrairYoutubeId(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?[^#]*v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{6,})/i,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1];
  }
  try {
    const u = new URL(s);
    const v = u.searchParams.get("v");
    if (v) return v;
  } catch {
    /* ignore */
  }
  return null;
}

function urlAssistirVideo(pathRelativo) {
  const src = encodeURIComponent(pathRelativo);
  return `#/assistir-video?src=${src}`;
}

function blocoYoutube(videoId) {
  const watch = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const thumb = `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mkt-yt" style="margin:16px 0;"><tr><td align="center"><a href="${watch}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;"><img src="${thumb}" alt="Assistir no YouTube" width="560" style="max-width:100%;height:auto;display:block;border:0;border-radius:8px;" /></a><p style="margin:10px 0 0;text-align:center;"><a href="${watch}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#e31c23;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;">▶ Assistir no YouTube</a></p></td></tr></table><p><br></p>`;
}

function blocoVideoArquivo(pathRelativo, titulo = "Assistir vídeo") {
  const watch = urlAssistirVideo(pathRelativo);
  const label = String(titulo || "Assistir vídeo").replace(/</g, "");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="mkt-video" style="margin:16px 0;"><tr><td align="center" style="background:#0f172a;border-radius:12px;padding:28px 18px;"><div style="font-size:28px;line-height:1;margin-bottom:10px;">▶</div><a href="${watch}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#1b4fa0;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:8px;">${label}</a><p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Abre no navegador · enviado do computador</p></td></tr></table><p><br></p>`;
}

function blocoBotao(label, url) {
  const texto = String(label || "Saiba mais").trim() || "Saiba mais";
  return `<table role="presentation" cellspacing="0" cellpadding="0" class="mkt-btn" style="margin:18px 0;"><tr><td align="center" style="border-radius:8px;background:#1b4fa0;"><a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${texto.replace(/</g, "")}</a></td></tr></table><p><br></p>`;
}

function blocoImagem(src, alt = "") {
  const url = resolveImagemUrl(src) || src;
  return `<p style="margin:12px 0;"><img src="${url}" alt="${String(alt || "").replace(/"/g, "")}" style="max-width:100%;height:auto;display:block;border:0;border-radius:8px;" /></p>`;
}

async function uploadMarketingArquivo(file) {
  const session = loadAdminSession();
  if (!session?.token) throw new Error("Sessão de administrador não encontrada");

  const formData = new FormData();
  formData.append("arquivo", file);

  const response = await fetch(apiUrl("/api/admin/marketing/upload"), {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
    body: formData,
  });
  const { data } = await parseApiResponse(response);
  if (response.status === 401) {
    clearAdminSession();
    const err = new Error("Sessão expirada. Faça login novamente.");
    err.code = "UNAUTHORIZED";
    throw err;
  }
  if (!response.ok) {
    throw new Error(mensagemParaUsuario(data.error));
  }
  return data;
}

const TOOLS = [
  { id: "bold", label: "N", title: "Negrito", cmd: "bold", className: "is-bold" },
  { id: "italic", label: "I", title: "Itálico", cmd: "italic", className: "is-italic" },
  { id: "underline", label: "S", title: "Sublinhado", cmd: "underline", className: "is-underline" },
  { id: "sep1", sep: true },
  { id: "h2", label: "Título", title: "Título", block: "H2" },
  { id: "h3", label: "Subtítulo", title: "Subtítulo", block: "H3" },
  { id: "p", label: "Texto", title: "Parágrafo", block: "P" },
  { id: "sep2", sep: true },
  { id: "ul", label: "• Lista", title: "Lista", cmd: "insertUnorderedList" },
  { id: "ol", label: "1. Lista", title: "Lista numerada", cmd: "insertOrderedList" },
  { id: "sep3", sep: true },
  { id: "left", label: "⟸", title: "Alinhar à esquerda", cmd: "justifyLeft" },
  { id: "center", label: "⇔", title: "Centralizar", cmd: "justifyCenter" },
  { id: "right", label: "⟹", title: "Alinhar à direita", cmd: "justifyRight" },
  { id: "sep4", sep: true },
  { id: "link", label: "Link", title: "Inserir link", action: "link" },
  { id: "uploadImg", label: "⬆ Imagem", title: "Enviar imagem do computador", action: "uploadImage", className: "is-upload" },
  { id: "uploadVid", label: "⬆ Vídeo", title: "Enviar vídeo do computador", action: "uploadVideo", className: "is-upload" },
  { id: "image", label: "URL img", title: "Imagem por URL", action: "image" },
  { id: "youtube", label: "YouTube", title: "Vídeo do YouTube", action: "youtube" },
  { id: "button", label: "Botão", title: "Botão / CTA", action: "button" },
  { id: "hr", label: "—", title: "Linha", action: "hr" },
  { id: "sep5", sep: true },
  { id: "undo", label: "↺", title: "Desfazer", cmd: "undo" },
  { id: "redo", label: "↻", title: "Refazer", cmd: "redo" },
  { id: "clear", label: "Limpar", title: "Limpar formatação", cmd: "removeFormat" },
];

function ModalShell({ title, children, onClose }) {
  return (
    <div className="admin-mkt-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="admin-mkt-modal__backdrop" onClick={onClose} />
      <div className="admin-mkt-modal__panel">
        <header className="admin-mkt-modal__head">
          <h3>{title}</h3>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={onClose}>
            Fechar
          </button>
        </header>
        <div className="admin-mkt-modal__body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Editor visual para campanhas de e-mail (HTML e-mail-safe).
 */
export default function MarketingRichEditor({
  value = "",
  disabled = false,
  onChange,
  onUnauthorized,
}) {
  const editorRef = useRef(null);
  const savedRange = useRef(null);
  const imageFileRef = useRef(null);
  const videoFileRef = useRef(null);
  const lastExternal = useRef(null);
  const [modal, setModal] = useState(null);
  const [formModal, setFormModal] = useState({});
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [erroModal, setErroModal] = useState("");

  const emitir = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastExternal.current = html;
    onChange?.(html);
  }, [onChange]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value || "<p><br></p>";
    if (next === lastExternal.current) return;
    if (el.innerHTML === next) {
      lastExternal.current = next;
      return;
    }
    el.innerHTML = next;
    lastExternal.current = next;
  }, [value]);

  function focarEditor() {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  }

  function salvarSelecao() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0);
    }
  }

  function inserirHtml(html) {
    focarEditor();
    const ok = document.execCommand("insertHTML", false, html);
    if (!ok) {
      const el = editorRef.current;
      if (el) {
        el.innerHTML = `${el.innerHTML}${html}`;
      }
    }
    emitir();
  }

  function aplicarCmd(cmd, valueArg = null) {
    focarEditor();
    document.execCommand(cmd, false, valueArg);
    emitir();
  }

  function aplicarBloco(tag) {
    focarEditor();
    document.execCommand("formatBlock", false, tag);
    emitir();
  }

  function abrirModal(tipo) {
    salvarSelecao();
    setErroModal("");
    if (tipo === "link") {
      const sel = window.getSelection()?.toString() || "";
      setFormModal({ url: "https://", texto: sel });
    } else if (tipo === "image") {
      setFormModal({ url: "", alt: "" });
    } else if (tipo === "youtube") {
      setFormModal({ url: "" });
    } else if (tipo === "button") {
      setFormModal({ label: "Ver ofertas", url: "https://" });
    } else {
      setFormModal({});
    }
    setModal(tipo);
  }

  function fecharModal() {
    setModal(null);
    setErroModal("");
    setFormModal({});
  }

  async function processarUpload(file, esperado) {
    if (!file) return;
    salvarSelecao();
    setUploading(true);
    setUploadMsg(
      esperado === "video"
        ? `Enviando vídeo “${file.name}”…`
        : `Enviando imagem “${file.name}”…`
    );
    setErroModal("");
    try {
      const data = await uploadMarketingArquivo(file);
      if (esperado === "image" && data.tipo !== "image") {
        throw new Error("Selecione um arquivo de imagem");
      }
      if (esperado === "video" && data.tipo !== "video") {
        throw new Error("Selecione um arquivo de vídeo (MP4, WEBM ou MOV)");
      }
      if (data.tipo === "video") {
        inserirHtml(blocoVideoArquivo(data.url, "Assistir vídeo"));
      } else {
        inserirHtml(blocoImagem(data.url, formModal.alt || file.name));
      }
      setUploadMsg(
        data.tipo === "video" ? "Vídeo inserido." : "Imagem inserida."
      );
      fecharModal();
      setTimeout(() => setUploadMsg(""), 2500);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onUnauthorized?.();
        return;
      }
      const msg = mensagemParaUsuario(err.message);
      setErroModal(msg);
      setUploadMsg(msg);
    } finally {
      setUploading(false);
    }
  }

  function confirmarLink() {
    const url = String(formModal.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      setErroModal("Informe um link começando com http:// ou https://");
      return;
    }
    const texto =
      String(formModal.texto || "").trim() || url.replace(/^https?:\/\//i, "");
    focarEditor();
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      document.execCommand("createLink", false, url);
      const anchor = sel.anchorNode?.parentElement?.closest?.("a") || null;
      if (anchor) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
        anchor.setAttribute("style", "color:#1b4fa0;");
      }
    } else {
      inserirHtml(
        `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#1b4fa0;">${texto.replace(/</g, "")}</a>`
      );
      fecharModal();
      return;
    }
    emitir();
    fecharModal();
  }

  function confirmarImagemUrl() {
    const url = String(formModal.url || "").trim();
    if (!url) {
      setErroModal("Informe a URL da imagem ou faça upload.");
      return;
    }
    if (!/^(https?:\/\/|\/uploads\/)/i.test(url)) {
      setErroModal("Use URL https:// ou caminho /uploads/...");
      return;
    }
    inserirHtml(blocoImagem(url, formModal.alt));
    fecharModal();
  }

  function confirmarYoutube() {
    const id = extrairYoutubeId(formModal.url);
    if (!id) {
      setErroModal("Cole um link válido do YouTube (watch, youtu.be ou shorts).");
      return;
    }
    inserirHtml(blocoYoutube(id));
    fecharModal();
  }

  function confirmarBotao() {
    const url = String(formModal.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      setErroModal("Informe um link começando com http:// ou https://");
      return;
    }
    inserirHtml(blocoBotao(formModal.label, url));
    fecharModal();
  }

  function onTool(tool) {
    if (disabled || uploading) return;
    if (tool.cmd) {
      aplicarCmd(tool.cmd);
      return;
    }
    if (tool.block) {
      aplicarBloco(tool.block);
      return;
    }
    if (tool.action === "hr") {
      inserirHtml('<hr style="border:none;border-top:1px solid #d7e0ea;margin:20px 0;" /><p><br></p>');
      return;
    }
    if (tool.action === "uploadImage") {
      salvarSelecao();
      imageFileRef.current?.click();
      return;
    }
    if (tool.action === "uploadVideo") {
      salvarSelecao();
      videoFileRef.current?.click();
      return;
    }
    if (tool.action) abrirModal(tool.action);
  }

  return (
    <div className={`admin-mkt-editor${disabled ? " admin-mkt-editor--disabled" : ""}`}>
      <div className="admin-mkt-editor__toolbar" role="toolbar" aria-label="Formatação">
        {TOOLS.map((tool) =>
          tool.sep ? (
            <span key={tool.id} className="admin-mkt-editor__sep" aria-hidden />
          ) : (
            <button
              key={tool.id}
              type="button"
              className={`admin-mkt-editor__btn${tool.className ? ` ${tool.className}` : ""}`}
              title={tool.title}
              disabled={disabled || uploading}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onTool(tool)}
            >
              {tool.label}
            </button>
          )
        )}
      </div>

      {(uploading || uploadMsg) && (
        <p
          className={`admin-mkt-editor__status${uploading ? " is-busy" : ""}`}
          role="status"
        >
          {uploadMsg || "Enviando…"}
        </p>
      )}

      <div
        ref={editorRef}
        className="admin-mkt-editor__surface"
        contentEditable={!disabled && !uploading}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Conteúdo do e-mail"
        data-placeholder="Escreva a mensagem da campanha…"
        onInput={emitir}
        onBlur={salvarSelecao}
        onKeyUp={salvarSelecao}
        onMouseUp={salvarSelecao}
      />

      <p className="admin-mkt-editor__hint">
        Use <strong>⬆ Imagem</strong> e <strong>⬆ Vídeo</strong> para enviar
        direto do computador. No e-mail o vídeo aparece como botão que abre o
        player no navegador (clientes de e-mail não reproduzem vídeo embutido).
      </p>

      <input
        ref={imageFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          processarUpload(file, "image");
        }}
      />
      <input
        ref={videoFileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          processarUpload(file, "video");
        }}
      />

      {modal === "link" && (
        <ModalShell title="Inserir link" onClose={fecharModal}>
          <label className="admin-mkt-modal__field">
            Texto
            <input
              value={formModal.texto || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, texto: e.target.value }))
              }
              placeholder="Texto do link"
            />
          </label>
          <label className="admin-mkt-modal__field">
            URL
            <input
              value={formModal.url || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, url: e.target.value }))
              }
              placeholder="https://..."
            />
          </label>
          {erroModal && <p className="admin-alert">{erroModal}</p>}
          <div className="admin-relatorio-filtros__acoes">
            <button type="button" className="admin-btn admin-btn--primary" onClick={confirmarLink}>
              Inserir link
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "image" && (
        <ModalShell title="Imagem" onClose={fecharModal}>
          <div className="admin-upload">
            <label className="admin-upload__label">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  processarUpload(file, "image");
                }}
              />
              {uploading ? "Enviando…" : "⬆ Enviar do computador"}
            </label>
          </div>
          <p className="admin-mkt-modal__nota">Ou cole uma URL:</p>
          <label className="admin-mkt-modal__field">
            Texto alternativo
            <input
              value={formModal.alt || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, alt: e.target.value }))
              }
              placeholder="Descrição da imagem"
            />
          </label>
          <label className="admin-mkt-modal__field">
            URL da imagem
            <input
              value={formModal.url || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, url: e.target.value }))
              }
              placeholder="https://... ou /uploads/..."
            />
          </label>
          {erroModal && <p className="admin-alert">{erroModal}</p>}
          <div className="admin-relatorio-filtros__acoes">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              disabled={uploading}
              onClick={confirmarImagemUrl}
            >
              Inserir pela URL
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "youtube" && (
        <ModalShell title="Vídeo" onClose={fecharModal}>
          <div className="admin-upload">
            <label className="admin-upload__label">
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  processarUpload(file, "video");
                }}
              />
              {uploading ? "Enviando…" : "⬆ Enviar vídeo do computador"}
            </label>
          </div>
          <p className="admin-mkt-modal__nota">
            Ou cole um link do YouTube (capa clicável no e-mail):
          </p>
          <label className="admin-mkt-modal__field">
            Link do YouTube
            <input
              value={formModal.url || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, url: e.target.value }))
              }
              placeholder="https://www.youtube.com/watch?v=... ou youtu.be/..."
            />
          </label>
          {erroModal && <p className="admin-alert">{erroModal}</p>}
          <div className="admin-relatorio-filtros__acoes">
            <button type="button" className="admin-btn admin-btn--primary" onClick={confirmarYoutube}>
              Inserir YouTube
            </button>
          </div>
        </ModalShell>
      )}

      {modal === "button" && (
        <ModalShell title="Botão / CTA" onClose={fecharModal}>
          <label className="admin-mkt-modal__field">
            Texto do botão
            <input
              value={formModal.label || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, label: e.target.value }))
              }
              placeholder="Ver ofertas"
            />
          </label>
          <label className="admin-mkt-modal__field">
            Link de destino
            <input
              value={formModal.url || ""}
              onChange={(e) =>
                setFormModal((p) => ({ ...p, url: e.target.value }))
              }
              placeholder="https://..."
            />
          </label>
          {erroModal && <p className="admin-alert">{erroModal}</p>}
          <div className="admin-relatorio-filtros__acoes">
            <button type="button" className="admin-btn admin-btn--primary" onClick={confirmarBotao}>
              Inserir botão
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

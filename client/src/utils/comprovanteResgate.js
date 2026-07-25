function validarHtmlComprovante(html) {
  const conteudo = String(html || "").trim();
  if (!conteudo) {
    throw new Error("Comprovante indisponível para impressão");
  }
  return conteudo;
}

function criarIframeComprovante(conteudo, { paraPdf = false } = {}) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Comprovante de resgate");
  Object.assign(iframe.style, {
    position: "fixed",
    left: paraPdf ? "-10000px" : "0",
    top: "0",
    width: paraPdf ? "794px" : "0",
    height: paraPdf ? "1123px" : "0",
    border: "0",
    opacity: paraPdf ? "1" : "0",
    pointerEvents: "none",
  });
  document.body.appendChild(iframe);

  const janela = iframe.contentWindow;
  if (!janela) {
    iframe.remove();
    throw new Error("Não foi possível abrir o comprovante");
  }

  janela.document.open();
  janela.document.write(conteudo);
  janela.document.close();

  return { iframe, janela };
}

function aguardarIframe(iframe) {
  return new Promise((resolve) => {
    const concluir = () => setTimeout(resolve, 200);
    if (iframe.contentDocument?.readyState === "complete") {
      concluir();
    } else {
      iframe.addEventListener("load", concluir, { once: true });
    }
  });
}

export function imprimirHtmlComprovante(html) {
  const conteudo = validarHtmlComprovante(html);
  const { iframe, janela } = criarIframeComprovante(conteudo);

  const remover = () => {
    iframe.remove();
  };

  const imprimir = () => {
    try {
      janela.focus();
      janela.print();
    } finally {
      setTimeout(remover, 1500);
    }
  };

  aguardarIframe(iframe).then(imprimir);
}

export async function baixarPdfHtmlComprovante(html, codigo) {
  const conteudo = validarHtmlComprovante(html);
  const { iframe, janela } = criarIframeComprovante(conteudo, { paraPdf: true });

  try {
    await aguardarIframe(iframe);
    const elemento = janela.document.querySelector(".wrap") || janela.document.body;
    const html2pdf = (await import("html2pdf.js")).default;
    const codigoLimpo = String(codigo || "clube").replace(/\s+/g, "");

    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: `comprovante-resgate-${codigoLimpo}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(elemento)
      .save();
  } finally {
    iframe.remove();
  }
}

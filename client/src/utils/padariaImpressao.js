import {
  fetchPadaria,
  fetchPadariaAdmin,
  loadPadariaSession,
} from "./padariaSession.js";
import {
  formatDateTime,
  formatPhone,
  formatarPrecoPadaria,
  STATUS_PEDIDO,
} from "./padariaFormat.js";

const STORAGE_LARGURA = "padaria.impressora.largura.v1";

/** Largura do cupom em mm (58 ou 80). */
export function obterLarguraCupomMm() {
  try {
    const v = Number(localStorage.getItem(STORAGE_LARGURA));
    if (v === 58 || v === 80) return v;
  } catch {
    /* ignore */
  }
  return 80;
}

export function definirLarguraCupomMm(mm) {
  const v = Number(mm) === 58 ? 58 : 80;
  try {
    localStorage.setItem(STORAGE_LARGURA, String(v));
  } catch {
    /* ignore */
  }
  return v;
}

function escaparHtmlImpressao(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[caractere]);
}

/**
 * Abre a folha de impressao do pedido. No dialogo do navegador o usuario pode
 * escolher uma impressora ou salvar o documento como PDF.
 */
export function imprimirPedidoPdfPadaria(pedido) {
  if (!pedido) throw new Error("Pedido indisponivel para impressao");

  const escapar = escaparHtmlImpressao;
  const codigo = pedido.codigoPublico || pedido.id || "-";
  const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
  const linhas = itens.length
    ? itens.map((item) => {
        const quantidade = Number(item.quantidade) || 0;
        const quantidadeTexto =
          String(item.unidade || "").toUpperCase() === "KG"
            ? quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " kg"
            : quantidade.toLocaleString("pt-BR") + "x";
        const detalhes = [
          item.decoracaoNome
            ? "Decoracao: " + item.decoracaoNome +
              (item.decoracaoCodigo ? " (" + item.decoracaoCodigo + ")" : "")
            : "",
          item.cobertura ? "Cobertura: " + item.cobertura : "",
          item.recheio ? "Recheio: " + item.recheio : "",
          item.obsItem ? "Obs.: " + item.obsItem : "",
        ].filter(Boolean).map(escapar).join("<br>");
        return "<tr><td>" + escapar(quantidadeTexto) + "</td><td><strong>" +
          escapar(item.nome || "Produto") + "</strong>" +
          (detalhes ? '<div class="item-details">' + detalhes + "</div>" : "") +
          '</td><td class="price">' +
          escapar(formatarPrecoPadaria(item.subtotal ?? 0)) + "</td></tr>";
      }).join("")
    : '<tr><td colspan="3">Nenhum item informado</td></tr>';

  const cliente = pedido.clienteNome || "-";
  const telefone = pedido.clienteTelefone
    ? formatPhone(pedido.clienteTelefone)
    : "-";
  const retirada =
    pedido.dataRetirada || pedido.horaRetirada
      ? formatDateTime(pedido.dataRetirada, pedido.horaRetirada)
      : "-";
  const criadoEm = pedido.criadoEm
    ? new Date(pedido.criadoEm).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "-";
  const criadoPor = pedido.criadoPorNome || "-";
  const observacao = pedido.observacao
    ? '<section class="note"><h2>Observacao do pedido</h2><p>' +
      escapar(pedido.observacao) + "</p></section>"
    : "";
  const html = [
    "<!doctype html><html lang='pt-BR'><head>",
    "<meta charset='UTF-8'>",
    "<meta name='viewport' content='width=device-width, initial-scale=1'>",
    "<title>Pedido " + escapar(codigo) + "</title>",
    "<style>",
    "@page{size:A4;margin:14mm}*{box-sizing:border-box}",
    "body{margin:0;color:#17211d;font:14px Arial,Helvetica,sans-serif}",
    "main{max-width:780px;margin:0 auto}",
    ".toolbar{max-width:780px;margin:16px auto;padding:0 16px;text-align:right}",
    ".toolbar button{border:0;border-radius:8px;padding:12px 16px;background:#0b5f56;color:#fff;font:600 14px Arial,sans-serif}",
    "h1{margin:0;font-size:24px}.code{margin:6px 0 20px;color:#0b5f56;font-size:18px;font-weight:700}",
    ".meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}",
    ".meta div,.note{padding:10px 12px;border:1px solid #d8ddd9;border-radius:8px}",
    ".label{display:block;margin-bottom:4px;color:#5f6b64;font-size:11px;font-weight:700;text-transform:uppercase}",
    "h2{margin:0 0 8px;font-size:14px}table{width:100%;border-collapse:collapse}",
    "th,td{padding:10px 8px;border-bottom:1px solid #d8ddd9;text-align:left;vertical-align:top}",
    "th{color:#5f6b64;font-size:11px;text-transform:uppercase}.price{text-align:right;white-space:nowrap}",
    ".item-details{margin-top:4px;color:#5f6b64;font-size:12px;line-height:1.45}",
    ".total{display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:2px solid #17211d;font-size:18px;font-weight:700}",
    ".note{margin-top:18px}.note p{margin:0;white-space:pre-wrap}",
    "@media print{.no-print{display:none!important}main{max-width:none}}",
    "</style></head><body>",
    '<div class="toolbar no-print"><button onclick="window.print()">Imprimir ou salvar como PDF</button></div>',
    "<main><h1>Encomenda da padaria</h1>",
    '<p class="code">Pedido ' + escapar(codigo) + "</p>",
    '<section class="meta">',
    '<div><span class="label">Cliente</span>' + escapar(cliente) + "</div>",
    '<div><span class="label">Telefone</span>' + escapar(telefone) + "</div>",
    '<div><span class="label">Retirada</span>' + escapar(retirada) + "</div>",
    '<div><span class="label">Status</span>' +
      escapar(STATUS_PEDIDO[pedido.status] || pedido.status || "-") + "</div>",
    '<div><span class="label">Criado em</span>' + escapar(criadoEm) + "</div>",
    '<div><span class="label">Criado por</span>' + escapar(criadoPor) + "</div>",
    "</section>",
    "<h2>Itens</h2><table><thead><tr><th>Qtd.</th><th>Produto</th><th class='price'>Subtotal</th></tr></thead>",
    "<tbody>" + linhas + "</tbody></table>",
    '<div class="total"><span>Total</span><span>' +
      escapar(formatarPrecoPadaria(pedido.total ?? 0)) + "</span></div>",
    observacao,
    "</main></body></html>",
  ].join("");

  const janela = window.open("", "_blank");
  if (!janela) {
    throw new Error("O navegador bloqueou a janela. Permita pop-ups para imprimir ou salvar em PDF.");
  }
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
  janela.focus();
  window.setTimeout(() => {
    if (!janela.closed) janela.print();
  }, 250);
}

function postImpressao(pathPadaria, pathAdmin, body) {
  if (loadPadariaSession()?.token) {
    return fetchPadaria(pathPadaria, { method: "POST", body });
  }
  return fetchPadariaAdmin(pathAdmin, { method: "POST", body });
}

/**
 * Manda o cupom em ESC/POS para o print-server do PDV13 (TCP 9100).
 * Não usa o diálogo do Windows nem a máquina do notebook.
 */
export async function imprimirPedidoPadaria(pedido, { larguraMm } = {}) {
  if (!pedido?.id) throw new Error("Pedido indisponível");
  const mm = Number(larguraMm) === 58 ? 58 : obterLarguraCupomMm();
  return postImpressao(
    `/pedidos/${pedido.id}/imprimir`,
    `/admin/pedidos/${pedido.id}/imprimir`,
    { larguraMm: mm }
  );
}

export async function imprimirTestePadaria({ larguraMm } = {}) {
  const mm = Number(larguraMm) === 58 ? 58 : obterLarguraCupomMm();
  return postImpressao("/impressora/teste", "/admin/impressora/teste", {
    larguraMm: mm,
  });
}

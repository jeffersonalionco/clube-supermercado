import { formatarPrecoPadaria } from "./padariaSession.js";
import { formatDateTime, formatPhone } from "./padariaFormat.js";
import { imprimirHtmlComprovante } from "./comprovanteResgate.js";

const STORAGE_LARGURA = "padaria.impressora.largura.v1";

function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function semAcento(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function linhaTracejada(largura = 42) {
  return "-".repeat(Math.max(24, Math.min(48, largura)));
}

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

function colunasPorLargura(mm = obterLarguraCupomMm()) {
  return mm <= 58 ? 32 : 42;
}

function padLinha(esquerda, direita, cols) {
  const e = String(esquerda ?? "");
  const d = String(direita ?? "");
  const espaco = Math.max(1, cols - e.length - d.length);
  return e + " ".repeat(espaco) + d;
}

function linhasItensTexto(pedido, cols) {
  const linhas = [];
  for (const i of pedido.itens || []) {
    const qtd =
      String(i.unidade || "").toUpperCase() === "KG"
        ? `${i.quantidade}kg`
        : `${i.quantidade}x`;
    const nome = semAcento(i.nome || "");
    const preco = formatarPrecoPadaria(i.subtotal);
    linhas.push(padLinha(`${qtd} ${nome}`.slice(0, cols - 1), "", cols));
    if (i.decoracaoNome) {
      const deco = semAcento(
        `  deco: ${i.decoracaoNome}${i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""}`
      );
      linhas.push(deco.slice(0, cols));
    }
    if (i.obsItem) {
      linhas.push(semAcento(`  obs: ${i.obsItem}`).slice(0, cols));
    }
    linhas.push(padLinha("", preco, cols));
  }
  return linhas;
}

/**
 * HTML otimizado para impressoras de cupom (Epson TM, Bematech MP, etc.)
 * Use a impressora térmica no diálogo do Windows e margens zeradas.
 */
export function montarHtmlPedidoPadaria(pedido, { larguraMm } = {}) {
  if (!pedido) throw new Error("Pedido indisponível");
  const mm = Number(larguraMm) === 58 ? 58 : obterLarguraCupomMm();
  const cols = colunasPorLargura(mm);
  const itens = (pedido.itens || [])
    .map((i) => {
      const qtdLabel =
        String(i.unidade || "").toUpperCase() === "KG"
          ? `${escapar(i.quantidade)} kg`
          : `${escapar(i.quantidade)}x`;
      const extras = [
        i.decoracaoNome
          ? `Deco: ${i.decoracaoNome}${
              i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""
            }${
              Number(i.decoracaoPreco) > 0
                ? ` +${formatarPrecoPadaria(i.decoracaoPreco)}`
                : ""
            }`
          : "",
        i.cobertura ? `Cobertura: ${i.cobertura}` : "",
        i.recheio ? `Recheio: ${i.recheio}` : "",
        i.obsItem ? `Obs: ${i.obsItem}` : "",
      ]
        .filter(Boolean)
        .map((t) => `<div class="extra">${escapar(t)}</div>`)
        .join("");
      return `<div class="item">
        <div class="item__row">
          <span class="item__qtd">${qtdLabel}</span>
          <span class="item__nome">${escapar(i.nome)}</span>
          <span class="item__preco">${escapar(formatarPrecoPadaria(i.subtotal))}</span>
        </div>
        ${extras}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Cupom ${escapar(pedido.codigoPublico)}</title>
  <style>
    @page {
      size: ${mm}mm auto;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: "Courier New", Courier, monospace;
      font-size: ${mm <= 58 ? "11px" : "12px"};
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .cupom {
      width: ${mm}mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 2mm 2.5mm 4mm;
    }
    .centro { text-align: center; }
    .marca { font-weight: 700; font-size: 1.15em; letter-spacing: 0.04em; }
    .codigo {
      font-size: 1.45em;
      font-weight: 700;
      letter-spacing: 0.06em;
      margin: 4px 0;
    }
    .sep {
      border: 0;
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .linha { margin: 2px 0; word-break: break-word; }
    .item { margin: 5px 0; }
    .item__row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 4px;
      align-items: start;
    }
    .item__qtd { font-weight: 700; white-space: nowrap; }
    .item__preco { white-space: nowrap; font-weight: 700; }
    .extra { font-size: 0.92em; margin-left: 2px; }
    .total {
      display: flex;
      justify-content: space-between;
      font-size: 1.2em;
      font-weight: 700;
      margin-top: 4px;
    }
    .rodape { margin-top: 8px; font-size: 0.9em; }
    @media print {
      html, body { width: ${mm}mm; }
      .cupom { padding: 0 1.5mm 3mm; }
    }
  </style>
</head>
<body>
  <div class="cupom">
    <div class="centro marca">SUPERAMA</div>
    <div class="centro">PADARIA · ENCOMENDA</div>
    <hr class="sep" />
    <div class="centro codigo">${escapar(pedido.codigoPublico)}</div>
    <div class="linha"><strong>Cliente:</strong> ${escapar(pedido.clienteNome)}</div>
    <div class="linha"><strong>Tel:</strong> ${escapar(formatPhone(pedido.clienteTelefone) || "—")}</div>
    <div class="linha"><strong>Retirada:</strong> ${escapar(
      formatDateTime(pedido.dataRetirada, pedido.horaRetirada)
    )}</div>
    <div class="linha"><strong>Status:</strong> ${escapar(pedido.status || "—")}</div>
    <hr class="sep" />
    ${itens || '<div class="linha">Sem itens</div>'}
    <hr class="sep" />
    <div class="total">
      <span>TOTAL</span>
      <span>${escapar(formatarPrecoPadaria(pedido.total))}</span>
    </div>
    ${
      pedido.observacao
        ? `<hr class="sep" /><div class="linha"><strong>Obs:</strong> ${escapar(
            pedido.observacao
          )}</div>`
        : ""
    }
    <hr class="sep" />
    <div class="centro rodape">Confira o pedido na retirada</div>
    <div class="centro rodape">${escapar(new Date().toLocaleString("pt-BR"))}</div>
    <!-- cols ref ${cols} -->
  </div>
</body>
</html>`;
}

/* —— ESC/POS (Epson / Bematech e compatíveis) —— */

const ESC = 0x1b;
const GS = 0x1d;

function encoderTexto(texto) {
  // ASCII seguro para a maioria das térmicas BR (evita codepage errado).
  const limpo = semAcento(texto);
  const out = new Uint8Array(limpo.length);
  for (let i = 0; i < limpo.length; i += 1) {
    const code = limpo.charCodeAt(i);
    out[i] = code < 128 ? code : 63; // ?
  }
  return out;
}

function concatBytes(partes) {
  const total = partes.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function cmd(...bytes) {
  return new Uint8Array(bytes);
}

function textoLinha(str, cols) {
  return encoderTexto(`${String(str).slice(0, cols)}\n`);
}

/** Monta bytes ESC/POS para cupom (corte parcial no final). */
export function montarEscPosPedidoPadaria(pedido, { larguraMm } = {}) {
  if (!pedido) throw new Error("Pedido indisponível");
  const mm = Number(larguraMm) === 58 ? 58 : obterLarguraCupomMm();
  const cols = colunasPorLargura(mm);
  const sep = `${linhaTracejada(cols)}\n`;
  const partes = [
    cmd(ESC, 0x40), // init
    cmd(ESC, 0x61, 0x01), // center
    cmd(ESC, 0x45, 0x01), // bold on
    textoLinha("SUPERAMA", cols),
    cmd(ESC, 0x45, 0x00),
    textoLinha("PADARIA - ENCOMENDA", cols),
    cmd(ESC, 0x61, 0x00), // left
    encoderTexto(sep),
    cmd(ESC, 0x61, 0x01),
    cmd(ESC, 0x45, 0x01),
    textoLinha(String(pedido.codigoPublico || ""), cols),
    cmd(ESC, 0x45, 0x00),
    cmd(ESC, 0x61, 0x00),
    textoLinha(`Cliente: ${pedido.clienteNome || ""}`, cols),
    textoLinha(`Tel: ${formatPhone(pedido.clienteTelefone) || "-"}`, cols),
    textoLinha(
      `Retirada: ${formatDateTime(pedido.dataRetirada, pedido.horaRetirada)}`,
      cols
    ),
    encoderTexto(sep),
  ];

  for (const linha of linhasItensTexto(pedido, cols)) {
    partes.push(textoLinha(linha, cols));
  }

  partes.push(encoderTexto(sep));
  partes.push(cmd(ESC, 0x45, 0x01));
  partes.push(
    textoLinha(padLinha("TOTAL", formatarPrecoPadaria(pedido.total), cols), cols)
  );
  partes.push(cmd(ESC, 0x45, 0x00));

  if (pedido.observacao) {
    partes.push(encoderTexto(sep));
    partes.push(textoLinha(`Obs: ${pedido.observacao}`, cols));
  }

  partes.push(encoderTexto(sep));
  partes.push(cmd(ESC, 0x61, 0x01));
  partes.push(textoLinha("Confira o pedido na retirada", cols));
  partes.push(textoLinha(new Date().toLocaleString("pt-BR"), cols));
  partes.push(cmd(ESC, 0x61, 0x00));
  partes.push(cmd(0x0a, 0x0a, 0x0a));
  // Corte parcial (Epson / muitas Bematech ESC/POS)
  partes.push(cmd(GS, 0x56, 0x01));

  return concatBytes(partes);
}

/* —— Web Serial (impressão direta USB/serial) —— */

let serialPort = null;
let serialWriter = null;

export function impressoraSerialConectada() {
  return Boolean(serialPort);
}

export async function conectarImpressoraCupom() {
  if (!("serial" in navigator)) {
    throw new Error(
      "Este navegador não suporta impressão direta (use Chrome/Edge). Você ainda pode imprimir pelo diálogo escolhendo a Epson/Bematech."
    );
  }
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 9600 });
  serialPort = port;
  serialWriter = port.writable.getWriter();
  return true;
}

export async function desconectarImpressoraCupom() {
  try {
    if (serialWriter) {
      serialWriter.releaseLock();
      serialWriter = null;
    }
    if (serialPort) {
      await serialPort.close();
      serialPort = null;
    }
  } catch {
    serialWriter = null;
    serialPort = null;
  }
}

async function imprimirEscPosSerial(bytes) {
  if (!serialPort || !serialWriter) {
    throw new Error("Impressora não conectada");
  }
  await serialWriter.write(bytes);
}

/**
 * Imprime o pedido em formato cupom.
 * 1) Se houver impressora serial conectada → ESC/POS direto
 * 2) Senão → diálogo de impressão do Windows (escolha Epson/Bematech)
 */
export async function imprimirPedidoPadaria(pedido, opts = {}) {
  const preferirSerial = opts.preferirSerial !== false && impressoraSerialConectada();
  if (preferirSerial) {
    try {
      const bytes = montarEscPosPedidoPadaria(pedido, opts);
      await imprimirEscPosSerial(bytes);
      return { modo: "escpos" };
    } catch (err) {
      console.warn("[padaria/impressao] ESC/POS falhou, usando diálogo:", err);
    }
  }
  imprimirHtmlComprovante(montarHtmlPedidoPadaria(pedido, opts));
  return { modo: "html" };
}

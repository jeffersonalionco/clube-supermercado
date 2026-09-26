import net from "node:net";
import { obterConfigPadaria } from "./padariaConfigService.js";

const HOST_PADRAO = "10.1.1.13";
const PORTA_PADRAO = 9100;
const ESC = 0x1b;
const GS = 0x1d;

function hostPermitido(host) {
  const h = String(host || "").trim();
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

export function destinoImpressoraPadaria(config = {}) {
  const host =
    String(config.impressora_host || process.env.PADARIA_IMPRESSORA_HOST || HOST_PADRAO).trim() ||
    HOST_PADRAO;
  const porta = Number(config.impressora_porta || process.env.PADARIA_IMPRESSORA_PORTA || PORTA_PADRAO);
  const larguraMm = Number(config.impressora_largura_mm) === 58 ? 58 : 80;
  return {
    host,
    porta: Number.isInteger(porta) && porta > 0 && porta < 65536 ? porta : PORTA_PADRAO,
    larguraMm,
  };
}

function semAcento(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function colunasPorLargura(mm) {
  return mm <= 58 ? 32 : 42;
}

function linhaTracejada(largura) {
  return "-".repeat(Math.max(24, Math.min(48, largura)));
}

function padLinha(esquerda, direita, cols) {
  const e = String(esquerda ?? "");
  const d = String(direita ?? "");
  const espaco = Math.max(1, cols - e.length - d.length);
  return e + " ".repeat(espaco) + d;
}

function formatarPreco(valor) {
  const n = Number(valor);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarTel(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(tel || "-").trim() || "-";
}

function formatarDataHora(data, hora) {
  let dia = "";
  if (data instanceof Date && !Number.isNaN(data.getTime())) {
    dia = data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } else {
    const s = String(data || "").slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    dia = m ? `${m[3]}/${m[2]}/${m[1]}` : String(data || "-");
  }
  const h = String(hora || "").slice(0, 5);
  return h ? `${dia} ${h}` : dia;
}

function cmd(...bytes) {
  return Buffer.from(bytes);
}

function textoLinha(str, cols) {
  const linha = `${semAcento(str).slice(0, cols)}\n`;
  const out = Buffer.alloc(linha.length);
  for (let i = 0; i < linha.length; i += 1) {
    const code = linha.charCodeAt(i);
    out[i] = code < 128 ? code : 63;
  }
  return out;
}

function linhasItens(pedido, cols) {
  const linhas = [];
  for (const i of pedido.itens || []) {
    const qtd =
      String(i.unidade || "").toUpperCase() === "KG"
        ? `${i.quantidade}kg`
        : `${i.quantidade}x`;
    linhas.push(`${qtd} ${semAcento(i.nome || "")}`.slice(0, cols));
    if (i.decoracaoNome) {
      linhas.push(
        semAcento(
          `  deco: ${i.decoracaoNome}${i.decoracaoCodigo ? ` (${i.decoracaoCodigo})` : ""}`
        ).slice(0, cols)
      );
    }
    if (i.obsItem) {
      linhas.push(semAcento(`  obs: ${i.obsItem}`).slice(0, cols));
    }
    linhas.push(padLinha("", formatarPreco(i.subtotal), cols));
  }
  return linhas;
}

/** Bytes ESC/POS (texto). A Bematech rejeita gráfico/PDF. */
export function montarEscPosPedidoPadaria(pedido, { larguraMm = 80 } = {}) {
  if (!pedido) throw new Error("Pedido indisponível");
  const mm = Number(larguraMm) === 58 ? 58 : 80;
  const cols = colunasPorLargura(mm);
  const sep = `${linhaTracejada(cols)}\n`;
  const partes = [
    cmd(ESC, 0x40),
    cmd(ESC, 0x61, 0x01),
    cmd(ESC, 0x45, 0x01),
    textoLinha("SUPERAMA", cols),
    cmd(ESC, 0x45, 0x00),
    textoLinha("PADARIA - ENCOMENDA", cols),
    cmd(ESC, 0x61, 0x00),
    Buffer.from(sep, "ascii"),
    cmd(ESC, 0x61, 0x01),
    cmd(ESC, 0x45, 0x01),
    textoLinha(String(pedido.codigoPublico || ""), cols),
    cmd(ESC, 0x45, 0x00),
    cmd(ESC, 0x61, 0x00),
    textoLinha(`Cliente: ${pedido.clienteNome || ""}`, cols),
    textoLinha(`Tel: ${formatarTel(pedido.clienteTelefone)}`, cols),
    textoLinha(
      `Retirada: ${formatarDataHora(pedido.dataRetirada, pedido.horaRetirada)}`,
      cols
    ),
    Buffer.from(sep, "ascii"),
  ];

  for (const linha of linhasItens(pedido, cols)) {
    partes.push(textoLinha(linha, cols));
  }

  partes.push(Buffer.from(sep, "ascii"));
  partes.push(cmd(ESC, 0x45, 0x01));
  partes.push(textoLinha(padLinha("TOTAL", formatarPreco(pedido.total), cols), cols));
  partes.push(cmd(ESC, 0x45, 0x00));

  if (pedido.observacao) {
    partes.push(Buffer.from(sep, "ascii"));
    partes.push(textoLinha(`Obs: ${pedido.observacao}`, cols));
  }

  const nFotos = Array.isArray(pedido.fotos) ? pedido.fotos.length : 0;
  if (nFotos > 0) {
    partes.push(
      textoLinha(
        nFotos === 1
          ? "1 foto de referencia na producao"
          : `${nFotos} fotos de referencia na producao`,
        cols
      )
    );
  }

  partes.push(Buffer.from(sep, "ascii"));
  partes.push(cmd(ESC, 0x61, 0x01));
  partes.push(textoLinha("Confira o pedido na retirada", cols));
  partes.push(
    textoLinha(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), cols)
  );
  partes.push(cmd(ESC, 0x61, 0x00));
  partes.push(cmd(0x0a, 0x0a, 0x0a, 0x0a));
  partes.push(cmd(GS, 0x56, 0x01));
  partes.push(cmd(ESC, 0x69));

  return Buffer.concat(partes);
}

export function montarEscPosTeste({ larguraMm = 80 } = {}) {
  const mm = Number(larguraMm) === 58 ? 58 : 80;
  const cols = colunasPorLargura(mm);
  return Buffer.concat([
    cmd(ESC, 0x40),
    cmd(ESC, 0x61, 0x01),
    cmd(ESC, 0x45, 0x01),
    textoLinha("SUPERAMA", cols),
    cmd(ESC, 0x45, 0x00),
    textoLinha("TESTE PADARIA ESC/POS", cols),
    cmd(ESC, 0x61, 0x00),
    textoLinha(linhaTracejada(cols), cols),
    textoLinha("Texto cru para a Bematech", cols),
    textoLinha("via PDV13:9100", cols),
    textoLinha(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), cols),
    cmd(0x0a, 0x0a, 0x0a),
    cmd(GS, 0x56, 0x01),
    cmd(ESC, 0x69),
  ]);
}

export function enviarRawTcp(host, porta, buffer, timeoutMs = 8000) {
  if (!hostPermitido(host)) {
    throw new Error("Host da impressora inválido. Use um IP da rede interna (ex.: 10.1.1.13).");
  }
  const dados = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  return new Promise((resolve, reject) => {
    let feito = false;
    const terminar = (err, ok) => {
      if (feito) return;
      feito = true;
      if (err) reject(err);
      else resolve(ok);
    };

    const socket = net.connect({ host, port: porta }, () => {
      socket.write(dados, (err) => {
        if (err) {
          socket.destroy();
          terminar(err);
          return;
        }
        // O print-server do PDV13 costuma manter o TCP aberto; quem fecha somos nós.
        socket.end(() => {
          terminar(null, { host, porta, bytes: dados.length });
          setTimeout(() => {
            if (!socket.destroyed) socket.destroy();
          }, 300);
        });
      });
    });

    socket.setTimeout(timeoutMs);
    socket.on("timeout", () => {
      if (socket.writableEnded && !feito) {
        terminar(null, { host, porta, bytes: dados.length });
        socket.destroy();
        return;
      }
      socket.destroy();
      terminar(
        new Error(
          `PDV13 (${host}:${porta}) não respondeu. Confira se o print-server.ps1 está no ar.`
        )
      );
    });
    socket.on("error", (err) => {
      const msg =
        err?.code === "ECONNREFUSED"
          ? `PDV13 (${host}:${porta}) recusou a conexão. O print-server.ps1 está rodando?`
          : err?.code === "ETIMEDOUT" || err?.code === "EHOSTUNREACH"
            ? `Não alcançou ${host}:${porta} na rede.`
            : err.message || String(err);
      terminar(new Error(msg));
    });
  });
}

export async function imprimirPedidoNaBematech(pedido, { larguraMm } = {}) {
  const config = await obterConfigPadaria();
  const destino = destinoImpressoraPadaria(config);
  const mm =
    Number(larguraMm) === 58 || Number(larguraMm) === 80
      ? Number(larguraMm)
      : destino.larguraMm;
  const bytes = montarEscPosPedidoPadaria(pedido, { larguraMm: mm });
  await enviarRawTcp(destino.host, destino.porta, bytes);
  return {
    ok: true,
    host: destino.host,
    porta: destino.porta,
    larguraMm: mm,
    bytes: bytes.length,
  };
}

export async function imprimirTesteNaBematech({ larguraMm } = {}) {
  const config = await obterConfigPadaria();
  const destino = destinoImpressoraPadaria(config);
  const mm =
    Number(larguraMm) === 58 || Number(larguraMm) === 80
      ? Number(larguraMm)
      : destino.larguraMm;
  const bytes = montarEscPosTeste({ larguraMm: mm });
  await enviarRawTcp(destino.host, destino.porta, bytes);
  return {
    ok: true,
    host: destino.host,
    porta: destino.porta,
    larguraMm: mm,
    bytes: bytes.length,
  };
}

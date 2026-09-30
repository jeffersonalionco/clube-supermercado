import test from "node:test";
import assert from "node:assert/strict";
import { validarUrlPreview } from "../services/marketing/whatsappPreviewService.js";
import {
  atendimentoVigente,
  nomeExibicaoAtendente,
  textoFimAtendimento,
  textoInicioAtendimento,
  textoMensagemAtendente,
} from "../services/marketing/whatsappAtendimentoService.js";
import {
  quantidadePedidoValida,
  telefoneCasaCom,
  textoResumoPedido,
} from "../services/marketing/whatsappPedidoCaixaService.js";
import {
  mensagemErp,
  montarCorpoPedidoErp,
  produtoErpPublico,
  textoResumoErp,
} from "../services/marketing/whatsappPedidoErpService.js";
import {
  cpfMascaradoDaFicha,
  detalheDePayloadSaida,
  detalhePublico,
  emojiRecebido,
  podeApagarParaTodos,
  reacaoLojaValida,
} from "../services/marketing/whatsappConversaService.js";
import { classificarMidiaEnvio } from "../services/marketing/whatsappMidiaCaixaService.js";
import {
  normalizarTelefoneWa,
  parseTextoWhatsapp,
  partirBlocosMensagem,
  primeiroLinkHttps,
} from "../../client/src/components/admin/wa-caixa/formatarTextoWhatsapp.js";

test("formatação do WhatsApp vira marcas, sem HTML", () => {
  const nodes = parseTextoWhatsapp("Olá *mundo* e _clube_");
  assert.equal(nodes[0].kind, "text");
  assert.equal(nodes[1].kind, "bold");
  assert.equal(nodes[1].children[0].value, "mundo");
  assert.equal(nodes[3].kind, "italic");
  assert.equal(JSON.stringify(nodes).includes("<script"), false);
});

test("link https e telefone viram nós clicáveis", () => {
  const nodes = parseTextoWhatsapp("Veja https://superama.com.br/oferta e ligue (45) 99999-0001");
  const link = nodes.find((n) => n.kind === "link");
  const fone = nodes.find((n) => n.kind === "phone");
  assert.equal(link.href, "https://superama.com.br/oferta");
  assert.equal(fone.telefone, "5545999990001");
  assert.equal(primeiroLinkHttps(nodes), "https://superama.com.br/oferta");
  assert.equal(normalizarTelefoneWa("45 99999-0001"), "5545999990001");
});

test("menu automático vira três blocos e some a linha de traços", () => {
  const menu = [
    "Você está no canal oficial de ofertas do Superama.",
    "",
    "🛒 *OFERTAS DE HOJE*",
    "",
    "Consulte as ofertas do dia.",
    "",
    "💬 *ATENDIMENTO*",
    "Fale com a equipe:",
    "",
    "📞 (45) 9816-1551",
    "",
    "━━━━━━━━━━━━━━",
    "",
    "*Clube Superama+*",
    "Identificamos você no Clube.",
  ].join("\n");
  const blocos = partirBlocosMensagem(menu);
  assert.equal(blocos.length, 3);
  assert.match(blocos[0], /OFERTAS DE HOJE/);
  assert.match(blocos[1], /ATENDIMENTO/);
  assert.match(blocos[2], /Clube Superama/);
  assert.equal(blocos.some((b) => b.includes("━━")), false);
  assert.equal(partirBlocosMensagem("só um oi").length, 1);
});

test("javascript e credencial na URL não viram link", () => {
  const nodes = parseTextoWhatsapp("veja javascript:alert(1) e http://user:senha@evil.com/a");
  assert.equal(nodes.some((n) => n.kind === "link"), false);
});

test("prévia recusa rede interna e protocolo inseguro", async () => {
  assert.equal((await validarUrlPreview("http://10.1.1.195/admin")).ok, false);
  assert.equal((await validarUrlPreview("https://127.0.0.1/")).ok, false);
  assert.equal((await validarUrlPreview("https://169.254.169.254/latest")).ok, false);
  assert.equal((await validarUrlPreview("file:///etc/passwd")).ok, false);
  assert.equal((await validarUrlPreview("https://user:senha@example.com/")).ok, false);
  assert.equal((await validarUrlPreview("https://localhost/painel")).ok, false);
});

test("apagar para todos só vale para saída recente com identificador", () => {
  const agora = Date.parse("2026-09-30T12:00:00Z");
  assert.equal(
    podeApagarParaTodos({
      direcao: "out",
      wamid: "wamid.1",
      criadoEm: "2026-09-30T10:00:00Z",
      agora,
    }),
    true
  );
  assert.equal(
    podeApagarParaTodos({
      direcao: "in",
      wamid: "wamid.1",
      criadoEm: "2026-09-30T10:00:00Z",
      agora,
    }),
    false
  );
  assert.equal(
    podeApagarParaTodos({
      direcao: "out",
      wamid: "wamid.1",
      criadoEm: "2026-09-27T10:00:00Z",
      agora,
    }),
    false
  );
  assert.equal(reacaoLojaValida("👍"), true);
  assert.equal(reacaoLojaValida("não"), false);
  assert.equal(emojiRecebido("❤️"), "❤️");
  assert.equal(emojiRecebido(""), "");
  assert.equal(emojiRecebido("x".repeat(40)), null);
});

test("detalhe público não entrega caminho de arquivo", () => {
  const publico = detalhePublico({
    arquivo: "../../etc/passwd",
    mime: "image/jpeg",
    botoes: ["Ofertas"],
  });
  assert.equal(publico.temMidia, true);
  assert.equal(publico.arquivo, undefined);
  assert.equal(detalhePublico({ autorNome: "Ana\n*Souza*" }).autorNome, "Ana *Souza*");
  assert.equal(cpfMascaradoDaFicha(true, "12345678901"), "123.***.***-01");
  assert.equal(cpfMascaradoDaFicha(false, "12345678901"), null);
  assert.deepEqual(publico.botoes, ["Ofertas"]);
  const saida = detalheDePayloadSaida({
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "Escolha" },
      action: { buttons: [{ reply: { title: "Ofertas" } }] },
    },
  });
  assert.deepEqual(saida.botoes, ["Ofertas"]);
});

test("nome do atendimento cabe no cabeçalho e a ausência vence em 30 minutos", () => {
  assert.equal(nomeExibicaoAtendente("  Ana\n*Souza*  ", "ana"), "Ana Souza");
  assert.equal(nomeExibicaoAtendente("", "caixa"), "caixa");
  const agora = Date.parse("2026-09-26T12:00:00.000Z");
  assert.equal(atendimentoVigente("2026-09-26T11:40:00.000Z", agora), true);
  assert.equal(atendimentoVigente("2026-09-26T11:29:00.000Z", agora), false);
  assert.equal(
    textoMensagemAtendente("Kalebe - Supervisor", "texto enviado"),
    "*Kalebe - Supervisor*\n\ntexto enviado"
  );
  assert.equal(
    textoInicioAtendimento("Kalebe - Supervisor"),
    "💬 *Atendimento iniciado*\n\n*Kalebe - Supervisor*\niniciou seu atendimento pela empresa."
  );
  assert.equal(
    textoFimAtendimento("Kalebe - Supervisor"),
    "✅ *Atendimento encerrado*\n\n*Kalebe - Supervisor*\nfinalizou seu atendimento.\n\n*Superama* agradece seu contato."
  );
  assert.equal(quantidadePedidoValida(2, false), null);
  assert.equal(quantidadePedidoValida(1.5, false), "Use uma quantidade inteira.");
  assert.equal(quantidadePedidoValida(0.05, true), "O peso mínimo é 0,1 kg.");
  assert.equal(telefoneCasaCom("(45) 99999-0001", "5545999990001"), true);
  assert.equal(telefoneCasaCom("(41) 99999-0001", "5545999990001"), false);
  const resumo = textoResumoPedido({
    codigoPublico: "PAD-2026-000123",
    dataRetirada: "2026-09-27",
    horaRetirada: "16:00",
    total: 80,
    itens: [{ nome: "Bolo chocolate", quantidade: 1, unidade: "UN", decoracaoNome: null }],
  });
  assert.equal(resumo.includes("*PAD-2026-000123*"), true);
  assert.equal(resumo.includes("Retirada: *27/09/2026* às *16:00*"), true);
  assert.equal(resumo.includes("1× Bolo chocolate"), true);
});

test("pedido ERP manda código, quantidade e preço da unidade", () => {
  const produto = produtoErpPublico({ Codigo: "100", Descricao: "Arroz", PrecoPDV: 4.5, Estoque1: 3 });
  assert.equal(produto.codigo, "100");
  assert.equal(produto.preco, 4.5);
  const corpo = montarCorpoPedidoErp({
    unidade: "001",
    nome: "Ana",
    cpf: "123.456.789-01",
    fone: "5545999990001",
    codigoCliente: 10,
    observacao: "teste",
    numeroPedidoCliente: "WA12345",
    itens: [{ codigo: produto.codigo, quantidade: 2, preco: produto.preco }],
    momento: { data: "26/09/2026", dataHora: "26/09/2026 11:00:00" },
  });
  assert.equal(corpo.unidade, "001");
  assert.equal(corpo.cpf, "12345678901");
  assert.equal(corpo.codigoCliente, 10);
  assert.equal(corpo.origem, "WhatsApp");
  assert.equal(corpo.codigoDocumento, "8200");
  assert.equal(corpo.numeroPedidoCliente, "12345");
  assert.equal(corpo.formaPagamento, "000");
  assert.equal(corpo.financeiro, undefined);
  assert.equal(corpo.itens[0].codigoProduto, 100);
  assert.equal(corpo.itens[0].qtdEmbalagem, 1);
  assert.equal(corpo.itens[0].valorProduto, 4.5);
  assert.equal(corpo.itens[0].valorBrutoTotal, 9);
  assert.equal(corpo.itens[0].percDesconto, undefined);
  assert.equal(corpo.itens[0].valorDesconto, undefined);
  assert.equal(textoResumoErp({ codigoPedido: 7, itens: [{ quantidade: 2, nome: "Arroz" }], total: 9 }).includes("Código *7*"), true);
  assert.equal(mensagemErp({ response: { messages: [{ message: "at br.com.rpinfo.Falha" }, { message: "Unidade inválida" }] } }, "falha"), "Unidade inválida");
});

test("envio de mídia aceita foto e PDF e recusa GIF e arquivo grande", () => {
  const foto = classificarMidiaEnvio(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  assert.equal(foto.ok, true);
  assert.equal(foto.tipo, "image");
  assert.equal(foto.mime, "image/jpeg");
  const pdf = classificarMidiaEnvio(Buffer.from("%PDF-1.4", "ascii"));
  assert.equal(pdf.tipo, "document");
  const txt = classificarMidiaEnvio(Buffer.from("lista de compras\n"), "notas.txt");
  assert.equal(txt.ok, true);
  assert.equal(txt.tipo, "document");
  assert.equal(txt.mime, "text/plain");
  assert.equal(classificarMidiaEnvio(Buffer.from("olá"), "virus.exe").ok, false);
  assert.equal(classificarMidiaEnvio(Buffer.from([0, 1, 2, 3]), "a.txt").ok, false);
  const voz = classificarMidiaEnvio(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]), "voz.webm");
  assert.equal(voz.ok, true);
  assert.equal(voz.tipo, "audio");
  assert.equal(voz.mime, "audio/webm");
  const publicoTxt = detalhePublico({ arquivo: "abc.txt", mime: "text/plain", nomeArquivo: "notas.txt" });
  assert.equal(publicoTxt.temMidia, true);
  assert.equal(publicoTxt.nomeArquivo, "notas.txt");
  assert.equal(classificarMidiaEnvio(Buffer.from("GIF89a", "ascii")).ok, false);
  const grande = Buffer.alloc(5 * 1024 * 1024 + 1);
  grande[0] = 0xff;
  grande[1] = 0xd8;
  grande[2] = 0xff;
  assert.match(classificarMidiaEnvio(grande).error, /5 MB/);
  const publico = detalhePublico({
    arquivo: "abc.jpg",
    mime: "image/jpeg",
    autorNome: "Ana",
  });
  assert.equal(publico.temMidia, true);
  assert.equal(publico.autorNome, "Ana");
  assert.equal(publico.arquivo, undefined);
});

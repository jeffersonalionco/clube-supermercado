import "dotenv/config";
import { initDatabase, getPool } from "../db.js";
import { criarCampanhaEmail } from "../services/marketing/campanhaService.js";

function brl(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseBr(n) {
  return Number(String(n).replace(/\./g, "").replace(",", "."));
}

/** [codigo, nome, normal, clube] — como enviado pelo usuário */
const RAW = `
143995|Melao Amarelo Nacional [melicia] Kg|4,99|4,73|
144975|Pimentao Verde Kg|9,79|9,35|
145149|Cenoura Kg|4,99|4,73|
194689|Alface Un|3,50|3,19|
194697|Agriao Un|3,50|3,19|
199222|Berinjela Kg|8,99|7,95|
199249|Batata Doce Kg|2,99|2,85|
199257|Chuchu Kg|2,96|2,53|
199320|Pepino Kg|4,60|4,39|
199559|Rucula Un|3,50|3,19|
199630|Chicoria Un|3,50|3,19|
202630|Laranja Pera Kg|2,69|2,55|
240680|Poncan Kg|4,99|4,29|
258989|Almeirao Un|3,50|3,19|
555266|Pimentao Amar/Verm Kg|21,85|19,99|
`
  .trim()
  .split("\n")
  .map((linha) => {
    const [codigo, nome, normal, clube] = linha.split("|").map((s) => s.trim());
    return {
      codigo,
      nome: nome
        .replace(/\bMelao\b/i, "Melão")
        .replace(/\bPimentao\b/i, "Pimentão")
        .replace(/\bAgriao\b/i, "Agrião")
        .replace(/\bRucula\b/i, "Rúcula")
        .replace(/\bChicoria\b/i, "Chicória")
        .replace(/\bAlmeirao\b/i, "Almeirão")
        .replace(/\bPoncan\b/i, "Ponkan")
        .replace(/\[melicia\]/i, "(Melícia)"),
      normal: parseBr(normal),
      clube: parseBr(clube),
    };
  });

function grupoDe(nome) {
  const n = nome.toLowerCase();
  if (
    /alface|agrião|agriao|rúcula|rucula|chicória|chicoria|almeirão|almeirao/.test(
      n
    )
  ) {
    return "Folhas e verdes";
  }
  if (
    /pimentão|pimentao|cenoura|berinjela|batata|chuchu|pepino/.test(n)
  ) {
    return "Legumes";
  }
  if (/melão|melao|laranja|ponkan|poncan/.test(n)) {
    return "Frutas";
  }
  return "Hortifruti";
}

function linhaOferta({ nome, normal, clube }) {
  const economia = Math.round((normal - clube) * 100) / 100;
  return `
<tr>
  <td style="padding:14px 12px;border-bottom:1px solid #e8eef5;vertical-align:top;">
    <div style="font-size:15px;font-weight:700;color:#12263a;line-height:1.35;margin:0 0 8px;">${nome}</div>
    <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
      <tr>
        <td style="padding:0 8px 0 0;vertical-align:top;width:50%;">
          <div style="background:#ecfdf5;border:1px solid #99f6e4;border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0f766e;margin:0 0 2px;">Preço Clube Superama+</div>
            <div style="font-size:20px;font-weight:800;color:#047857;line-height:1.1;">${brl(clube)}</div>
          </div>
        </td>
        <td style="padding:0;vertical-align:top;width:50%;">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin:0 0 2px;">Preço normal</div>
            <div style="font-size:16px;font-weight:600;color:#94a3b8;text-decoration:line-through;line-height:1.2;">${brl(normal)}</div>
          </div>
        </td>
      </tr>
    </table>
    <div style="margin-top:8px;font-size:12px;color:#0f766e;font-weight:600;">Economia de ${brl(economia)} no clube</div>
  </td>
</tr>`.trim();
}

function montarHtml() {
  const porGrupo = new Map();
  for (const item of RAW) {
    const g = grupoDe(item.nome);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(item);
  }

  const ordem = ["Frutas", "Legumes", "Folhas e verdes", "Hortifruti"];
  const secoes = ordem
    .filter((t) => porGrupo.has(t))
    .map((titulo) => {
      const itens = porGrupo.get(titulo);
      return `
<h2 style="margin:28px 0 10px;font-size:17px;color:#1b4fa0;border-bottom:2px solid #dbeafe;padding-bottom:6px;">${titulo}</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
  ${itens.map(linhaOferta).join("\n")}
</table>`;
    })
    .join("\n");

  return `
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#12263a;">Terça da Verdura no Superama</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
  Frescos selecionados para a sua mesa — e com
  <strong style="color:#047857;">preço especial do Clube Superama+</strong>.
  Compare com o <strong style="color:#64748b;">preço normal</strong> e economize apresentando seu CPF no caixa.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:#ecfdf5;border:1px solid #99f6e4;border-radius:10px;">
  <tr>
    <td style="padding:14px 16px;">
      <div style="font-size:13px;font-weight:700;color:#047857;margin:0 0 4px;">Terça da Verdura · Superama</div>
      <div style="font-size:15px;color:#12263a;font-weight:700;">04/08/2026 (terça-feira)</div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.4;">
        Preços do clube válidos para participantes do Clube Superama+ identificados no caixa.
        Ofertas sujeitas a estoque e validade do dia.
      </div>
    </td>
  </tr>
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
  <tr>
    <td width="50%" style="padding:0 6px 0 0;">
      <div style="background:#ecfdf5;border-radius:8px;padding:10px;text-align:center;border:1px solid #99f6e4;">
        <div style="font-size:11px;color:#0f766e;font-weight:700;">NO CLUBE</div>
        <div style="font-size:13px;color:#047857;">Preço com desconto</div>
      </div>
    </td>
    <td width="50%" style="padding:0 0 0 6px;">
      <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;border:1px solid #e2e8f0;">
        <div style="font-size:11px;color:#64748b;font-weight:700;">SEM CLUBE</div>
        <div style="font-size:13px;color:#94a3b8;text-decoration:line-through;">Preço normal</div>
      </div>
    </td>
  </tr>
</table>

${secoes}

<p style="margin:24px 0 8px;font-size:14px;line-height:1.5;color:#334155;">
  É só apresentar o CPF do clube no caixa e aproveitar a Terça da Verdura. Te esperamos no Superama!
</p>
<p style="margin:0;font-size:13px;color:#64748b;">
  Dúvidas? Fale com a gente pelo atendimento da loja ou pelo site do clube.
</p>
`.trim();
}

function montarMarkdown() {
  const linhas = RAW.map(({ nome, normal, clube }) => {
    return `- **${nome}** — Clube: **${brl(clube)}** · Normal: ~~${brl(normal)}~~`;
  });
  return [
    "# Terça da Verdura · Clube Superama+",
    "",
    "Validade: **04/08/2026**",
    "",
    "Preço do clube em destaque. Preço normal riscado para comparar.",
    "",
    ...linhas,
    "",
    "Apresente o CPF do clube no caixa. Ofertas sujeitas a estoque.",
  ].join("\n");
}

async function main() {
  await initDatabase();
  const html = montarHtml();
  const md = montarMarkdown();

  const resultado = await criarCampanhaEmail(
    {
      assunto: "Terça da Verdura · 04/08 — preços do Clube Superama+",
      preheader:
        "Frutas, legumes e folhas com preço especial do clube — só nesta terça",
      corpoMd: md,
      corpoHtml: html,
      publico: "todos_elegiveis",
      emailsEspecificos: [],
    },
    { adminUsuario: "sistema" }
  );

  if (!resultado.ok) {
    console.error("Falha:", resultado.error);
    process.exit(1);
  }

  console.log("Campanha rascunho criada:");
  console.log(`  id: ${resultado.campanha.id}`);
  console.log(`  assunto: ${resultado.campanha.assunto}`);
  console.log(`  status: ${resultado.campanha.status}`);
  console.log(`  itens: ${RAW.length}`);
  await getPool().end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await getPool().end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

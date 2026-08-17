import "dotenv/config";
import { initDatabase, getPool } from "../db.js";
import { criarCampanhaEmail } from "../services/marketing/campanhaService.js";

function brl(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const OFERTAS = [
  ["112755", "Água Sanitária Qboa 1L", 3.35, 3.99],
  ["126110", "Margarina Qualy 500g com sal", 7.69, 8.39],
  ["244449", "Margarina Qualy 500g sem sal", 7.69, 8.39],
  ["268534", "Carne suína paleta (kg)", 11.99, 13.99],
  ["270547", "Carne suína pernil (kg)", 11.99, 13.99],
  ["332488", "Refrigerante Sukita Laranja 2L", 4.99, 6.59],
  ["478822", "Amaciante Ypê 2L Ternura Rosa", 7.99, 9.19],
  ["605379", "Linguiça Friella Toscana (kg)", 15.99, 17.99],
  ["613355", "Filé Sassami Lar IQF 1kg", 17.99, 19.99],
  ["660205", "Amaciante Ypê 2L Intenso", 7.99, 9.19],
  ["667269", "Amaciante Ypê 2L Amor Branco", 7.99, 9.19],
  ["839434", "Veja Multiuso Original 500ml", 3.95, 4.69],
  ["869732", "Mortadela Perdigão Bolo Ouro fatias 200g", 7.99, 9.99],
  ["915920", "Veja Multiuso Floral 500ml", 3.95, 4.69],
  ["920223", "Veja Multiuso Lavanda 500ml", 3.95, 4.69],
  ["937398", "Veja Multiuso Campestre 500ml", 3.95, 4.69],
  ["939536", "Farinha de trigo Rio Azul Premium T1 5kg", 18.99, 20.79],
  ["964689", "Sabão em pó Omo 1,6kg Lavagem Perfeita", 22.99, 25.69],
  ["991694", "Sabão em pó Omo 1,6kg Puro Cuidado", 22.99, 25.69],
  ["1005685", "Biscoito Isabela Due Tortinha Geleia Morango 140g", 2.45, 2.99],
  ["1006746", "Biscoito Isabela Tortinhas Limão 140g", 2.45, 2.99],
  ["1006762", "Biscoito Isabela Tortinhas Chocolate Suíço 140g", 2.45, 2.99],
  ["1010654", "Biscoito Isabela Tortinhas Chocolate 140g", 2.45, 2.99],
  ["1010662", "Biscoito Isabela Tortinhas Morango 140g", 2.45, 2.99],
  ["1011472", "Biscoito Isabela Tortinhas Chocolate Branco 140g", 2.45, 2.99],
  ["1011600", "Biscoito Isabela Due Tortinha Cheesecake 140g", 2.45, 2.99],
  ["1014897", "Suco Ades Uva 1L", 4.99, 5.98],
  ["1068687", "Sabão em pó Omo 1,6kg Lavanda", 22.99, 25.69],
  ["1072153", "Biscoito Isabela Tortinhas Trufa 140g", 2.45, 2.99],
  ["1072161", "Biscoito Isabela Tortinhas Chocolate Avelã 140g", 2.45, 2.99],
  ["1104969", "Café Coamo Tradicional 500g", 19.59, 21.99],
];

function grupoDe(nome) {
  const n = nome.toLowerCase();
  if (/carne|linguiça|linguica|filé|file|sassami|mortadela|suína|suina/.test(n)) {
    return "Açougue e frios";
  }
  if (/biscoito|isabela/.test(n)) return "Biscoitos";
  if (/omo|ypê|ype|veja|água sanit|agua sanit|amaciante|sabão|sabao/.test(n)) {
    return "Limpeza";
  }
  if (/margarina|farinha|café|cafe|sukita|ades|refrigerante|suco/.test(n)) {
    return "Mercearia e bebidas";
  }
  return "Ofertas selecionadas";
}

function linhaOferta([, nome, clube, normal]) {
  const economia = normal - clube;
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
  for (const item of OFERTAS) {
    const g = grupoDe(item[1]);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(item);
  }

  const secoes = [...porGrupo.entries()]
    .map(([titulo, itens]) => {
      return `
<h2 style="margin:28px 0 10px;font-size:17px;color:#1b4fa0;border-bottom:2px solid #dbeafe;padding-bottom:6px;">${titulo}</h2>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
  ${itens.map(linhaOferta).join("\n")}
</table>`;
    })
    .join("\n");

  return `
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#12263a;">Olá! Chegaram ofertas especiais do Clube Superama+</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155;">
  Separados com carinho para quem faz parte do clube: abaixo você vê o
  <strong style="color:#047857;">preço exclusivo do Clube Superama+</strong>
  ao lado do <strong style="color:#64748b;">preço normal</strong>, para comparar sem confusão.
</p>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
  <tr>
    <td style="padding:14px 16px;">
      <div style="font-size:13px;font-weight:700;color:#1b4fa0;margin:0 0 4px;">Validade das ofertas</div>
      <div style="font-size:15px;color:#12263a;font-weight:700;">31/07/2026 a 01/08/2026</div>
      <div style="font-size:12px;color:#64748b;margin-top:6px;line-height:1.4;">
        Preços do clube válidos para participantes do Clube Superama+ identificados no caixa.
        Ofertas sujeitas a estoque.
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
  É só apresentar o CPF do clube no caixa e aproveitar. Te esperamos no Superama!
</p>
<p style="margin:0;font-size:13px;color:#64748b;">
  Dúvidas? Fale com a gente pelo atendimento da loja ou pelo site do clube.
</p>
`.trim();
}

function montarMarkdown() {
  const linhas = OFERTAS.map(([, nome, clube, normal]) => {
    return `- **${nome}** — Clube: **${brl(clube)}** · Normal: ~~${brl(normal)}~~`;
  });
  return [
    "# Ofertas Clube Superama+",
    "",
    "Validade: **31/07/2026 a 01/08/2026**",
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
      assunto: "Ofertas do Clube Superama+ · 31/07 a 01/08",
      preheader: "Preço do clube e preço normal lado a lado — sem confusão",
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
  console.log(`  itens: ${OFERTAS.length}`);
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

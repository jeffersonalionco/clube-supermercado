import "dotenv/config";
import { initDatabase, getPool } from "../db.js";
import { atualizarCampanhaEmail } from "../services/marketing/campanhaService.js";

const CAMPANHA_ID = 4;

function brl(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parseBr(n) {
  return Number(String(n).replace(/\./g, "").replace(",", "."));
}

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
  if (/alface|agrião|rúcula|chicória|almeirão/.test(n)) return "Folhas";
  if (/pimentão|cenoura|berinjela|batata|chuchu|pepino/.test(n)) {
    return "Legumes";
  }
  if (/melão|laranja|ponkan/.test(n)) return "Frutas";
  return "Hortifruti";
}

function cardProduto({ nome, normal, clube }) {
  const economia = Math.round((normal - clube) * 100) / 100;
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 12px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff;">
  <tr>
    <td style="padding:16px 16px 12px;">
      <div style="font-size:16px;font-weight:800;color:#12263a;line-height:1.3;letter-spacing:-0.01em;">${nome}</div>
    </td>
  </tr>
  <tr>
    <td style="padding:0 16px 14px;">
      <!-- Preço clube em destaque (mobile-first) -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;">
        <tr>
          <td style="padding:12px 14px;">
            <div style="font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#047857;margin:0 0 4px;">No Clube Superama+</div>
            <div style="font-size:28px;font-weight:800;color:#047857;line-height:1;letter-spacing:-0.02em;">${brl(clube)}</div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding:0;vertical-align:middle;">
            <span style="font-size:13px;color:#64748b;">Preço normal&nbsp;</span>
            <span style="font-size:14px;color:#94a3b8;text-decoration:line-through;font-weight:600;">${brl(normal)}</span>
          </td>
          <td style="padding:0;text-align:right;vertical-align:middle;">
            <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:12px;font-weight:800;padding:5px 10px;border-radius:999px;">− ${brl(economia)}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

function montarHtml() {
  const porGrupo = new Map();
  for (const item of RAW) {
    const g = grupoDe(item.nome);
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g).push(item);
  }

  const ordem = ["Frutas", "Legumes", "Folhas", "Hortifruti"];
  const secoes = ordem
    .filter((t) => porGrupo.has(t))
    .map((titulo) => {
      const itens = porGrupo.get(titulo);
      return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 8px;">
  <tr>
    <td style="padding:0 0 10px;">
      <div style="font-size:13px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#1b4fa0;">${titulo}</div>
      <div style="height:3px;width:40px;background:#e31c23;border-radius:2px;margin-top:6px;"></div>
    </td>
  </tr>
</table>
${itens.map(cardProduto).join("\n")}`;
    })
    .join("\n");

  return `
<!-- Hero -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;background:linear-gradient(135deg,#0d2b66 0%,#1b4fa0 100%);border-radius:16px;overflow:hidden;">
  <tr>
    <td style="padding:22px 18px;text-align:center;">
      <div style="font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.75);margin:0 0 8px;">Clube Superama+</div>
      <div style="font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;letter-spacing:-0.02em;margin:0 0 8px;">Terça da Verdura</div>
      <div style="display:inline-block;background:#e31c23;color:#fff;font-size:14px;font-weight:800;padding:8px 14px;border-radius:999px;">04/08/2026</div>
    </td>
  </tr>
</table>

<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#12263a;line-height:1.35;">
  Frescos com preço especial do clube
</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#475569;">
  Em cada item, o <strong style="color:#047857;">preço do Clube</strong> aparece em destaque.
  O preço normal fica riscado para você comparar na hora.
</p>

<!-- Como ler -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
  <tr>
    <td style="padding:14px 16px;">
      <div style="font-size:12px;font-weight:800;color:#1b4fa0;margin:0 0 8px;letter-spacing:0.04em;text-transform:uppercase;">Como ler os preços</div>
      <div style="font-size:14px;color:#334155;line-height:1.5;margin:0 0 6px;">
        <strong style="color:#047857;">Verde grande</strong> = preço com CPF do clube no caixa
      </div>
      <div style="font-size:14px;color:#334155;line-height:1.5;">
        <strong style="color:#94a3b8;text-decoration:line-through;">Cinza riscado</strong> = preço normal da loja
      </div>
    </td>
  </tr>
</table>

${secoes}

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;">
  <tr>
    <td style="padding:18px 16px;text-align:center;">
      <div style="font-size:16px;font-weight:800;color:#0d2b66;margin:0 0 6px;">É só mostrar o CPF no caixa</div>
      <div style="font-size:14px;color:#475569;line-height:1.45;margin:0 0 4px;">
        Ofertas desta terça · sujeitas a estoque
      </div>
      <div style="font-size:13px;color:#64748b;">Te esperamos no Superama</div>
    </td>
  </tr>
</table>
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

  const resultado = await atualizarCampanhaEmail(CAMPANHA_ID, {
    assunto: "Terça da Verdura · 04/08 — preços do Clube Superama+",
    preheader:
      "Preço do clube em destaque. Compare com o normal e economize no caixa.",
    corpoMd: md,
    corpoHtml: html,
    publico: "todos_elegiveis",
    emailsEspecificos: [],
  });

  if (!resultado.ok) {
    console.error("Falha:", resultado.error);
    process.exit(1);
  }

  console.log("Rascunho atualizado (mobile-friendly):");
  console.log(`  id: ${resultado.campanha.id}`);
  console.log(`  assunto: ${resultado.campanha.assunto}`);
  console.log(`  status: ${resultado.campanha.status}`);
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

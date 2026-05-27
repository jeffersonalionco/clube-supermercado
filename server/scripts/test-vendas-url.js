import "../env.js";
import { fetchApiToken, lerRespostaApi } from "../services/apiClient.js";

const cpf = process.argv[2];
const dataini = process.argv[3] || "01/04/2026";
const datafim = process.argv[4] || "30/04/2026";

if (!cpf) {
  console.error("Uso: node scripts/test-vendas-url.js CPF [dataini] [datafim]");
  process.exit(1);
}

const base = process.env.API_BASE_URL || "http://10.1.1.198:9000";
const tokenHeader = process.env.AUTH_TOKEN_HEADER || "token";

import { dataBRParaApi } from "../utils/periodoVendas.js";

const paths = [
  `/v1.0/clientes/${cpf}/vendas/datainicial/${dataBRParaApi(dataini)}/datafinal/${dataBRParaApi(datafim)}`,
];

const token = await fetchApiToken();

for (const path of paths) {
  console.log("\n---", path);
  const res = await fetch(`${base}${path}`, {
    headers: { [tokenHeader]: token },
  });
  const { data, parseError } = await lerRespostaApi(res);
  console.log("HTTP", res.status, "status:", data?.response?.status);
  console.log("msg:", data?.response?.messages?.[0]?.message || data?.response?.message);
  console.log("itens:", data?.response?.vendas?.itens?.length ?? "—");
  if (parseError) console.log("parse:", parseError);
}

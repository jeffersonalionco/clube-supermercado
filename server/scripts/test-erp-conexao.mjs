import "../env.js";
import {
  buscarClientePorCpfCnpj,
  fetchApiToken,
} from "../services/apiClient.js";

const cpfTeste = process.argv[2] || "12764500955";

async function main() {
  const baseUrl = process.env.API_BASE_URL || "http://10.1.1.198:9000";
  console.log("API_BASE_URL:", baseUrl);
  console.log("API_USUARIO:", process.env.API_USUARIO ? "configurado" : "AUSENTE");

  console.log("\n1) Teste de autenticação ERP...");
  try {
    const token = await fetchApiToken();
    console.log("   OK — token obtido:", token ? `${String(token).slice(0, 12)}…` : "(vazio)");
  } catch (err) {
    console.log("   FALHA:", err.message);
    if (err.cause) console.log("   cause:", err.cause.message || err.cause);
    process.exitCode = 1;
    return;
  }

  console.log(`\n2) Consulta cliente CPF ${cpfTeste}...`);
  try {
    const r = await buscarClientePorCpfCnpj(cpfTeste);
    console.log("   ok:", r.ok);
    if (r.ok) {
      console.log("   codigo:", r.cliente?.codigo ?? r.cliente?.id ?? "(sem codigo)");
      console.log("   nome:", r.cliente?.nome ?? r.cliente?.razaoSocial ?? "(sem nome)");
    } else {
      console.log("   error:", r.error);
    }
  } catch (err) {
    console.log("   EXCEÇÃO:", err.message);
    if (err.cause) console.log("   cause:", err.cause.message || err.cause);
    process.exitCode = 1;
  }
}

main();

/**
 * Testa payload de cadastro com RG vazio (sem gravar senha local).
 * Uso: node scripts/test-cadastro-rg-vazio.mjs [cpf]
 * Se não informar CPF, gera um CPF válido aleatório só para o teste na API.
 */
import "dotenv/config";
import { montarPayloadCadastro } from "../services/cadastroCliente.js";
import { buscarClientePorCpfCnpj, cadastrarClienteApi } from "../services/apiClient.js";

function digitoCpf(nums) {
  let soma = 0;
  for (let i = 0; i < nums.length; i += 1) {
    soma += nums[i] * (nums.length + 1 - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function gerarCpfValido() {
  const n = [];
  for (let i = 0; i < 9; i += 1) n.push(Math.floor(Math.random() * 10));
  // evita sequência óbvia 000...
  if (n.every((d) => d === n[0])) n[8] = (n[8] + 1) % 10;
  n.push(digitoCpf(n));
  n.push(digitoCpf(n));
  return n.join("");
}

async function main() {
  const cpfArg = String(process.argv[2] || "").replace(/\D/g, "");
  const cpf = cpfArg.length === 11 ? cpfArg : gerarCpfValido();

  const payload = montarPayloadCadastro({
    cpf,
    nome: "Cliente Teste Rg Vazio",
    email: `teste.rg.vazio.${cpf.slice(-4)}@example.com`,
    celular: "45999990000",
    dataNascimento: "15/05/1990",
    sexo: "M",
    estadoCivil: "SOLTEIRO",
  });

  console.log("--- Payload (trecho RG/IE) ---");
  console.log(
    JSON.stringify(
      {
        cpf: payload.cpf,
        rg: payload.rg,
        ie: payload.ie,
        orgaoExpRG: payload.orgaoExpRG,
        ufExpRG: payload.ufExpRG,
        tipoCliente: payload.tipoCliente,
      },
      null,
      2
    )
  );

  if (payload.rg !== "") {
    console.error("FALHA: esperado rg === \"\", recebido:", JSON.stringify(payload.rg));
    process.exit(1);
  }
  console.log("OK: payload montado com rg vazio.");

  console.log("\n--- Consulta CPF na API ---");
  const consulta = await buscarClientePorCpfCnpj(cpf);
  if (consulta.ok) {
    console.log(
      `CPF ${cpf} já existe no RP (código ${consulta.cliente?.codigo ?? "?"}). Não vou cadastrar de novo.`
    );
    console.log("Teste local do payload: OK. Use outro CPF para testar POST.");
    process.exit(0);
  }
  console.log(`CPF ${cpf} não encontrado no RP — tentando cadastrar...`);

  console.log("\n--- POST /clientes (API RP) ---");
  const resultado = await cadastrarClienteApi(payload);
  if (!resultado.ok) {
    console.error("API recusou o cadastro:");
    console.error(resultado.error || resultado);
    process.exit(1);
  }

  console.log("API aceitou o cadastro com RG vazio.");
  console.log(
    JSON.stringify(
      {
        codigo: resultado.codigo ?? null,
        message: resultado.message ?? null,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

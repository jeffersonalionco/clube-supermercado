import bcrypt from "bcrypt";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function perguntar(texto) {
  return new Promise((resolve) => {
    rl.question(texto, (resposta) => resolve(resposta));
  });
}

async function main() {
  const senha = process.argv[2] || (await perguntar("Senha do admin: "));
  rl.close();

  if (!senha || senha.length < 8) {
    console.error("Use uma senha com pelo menos 8 caracteres.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(senha, 12);
  console.log("\nAdicione ao server/.env:\n");
  console.log(`ADMIN_SENHA_HASH=${hash}`);
  console.log("\nRemova ou comente ADMIN_SENHA após configurar o hash.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

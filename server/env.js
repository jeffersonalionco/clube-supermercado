import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, ".env") });

/** Operação sempre em horário de Brasília, salvo override explícito no .env */
if (!process.env.TZ) {
  process.env.TZ = "America/Sao_Paulo";
}

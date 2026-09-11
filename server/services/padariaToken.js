import jwt from "jsonwebtoken";
import { getPadariaSessionSecret } from "../config/security.js";

const EXPIRES_IN = process.env.PADARIA_SESSION_EXPIRES_IN || "12h";
const PAPEIS = new Set(["atendente", "padaria", "gestor"]);

export function criarTokenPadaria({ id, login, nome, papel }) {
  if (!PAPEIS.has(papel)) {
    throw new Error("Papel de padaria inválido");
  }

  return jwt.sign(
    {
      sub: String(id),
      login,
      nome,
      role: "padaria",
      papel,
    },
    getPadariaSessionSecret(),
    { expiresIn: EXPIRES_IN }
  );
}

export function verificarTokenPadaria(token) {
  const payload = jwt.verify(token, getPadariaSessionSecret());
  if (payload.role !== "padaria" || !PAPEIS.has(payload.papel)) {
    throw new Error("Token sem permissão da padaria");
  }
  return payload;
}

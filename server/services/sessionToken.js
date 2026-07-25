import jwt from "jsonwebtoken";
import { getSessionSecret } from "../config/security.js";

const EXPIRES_IN = process.env.SESSION_EXPIRES_IN || "7d";

export function criarTokenSessao(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      cpf: usuario.cpf,
    },
    getSessionSecret(),
    { expiresIn: EXPIRES_IN }
  );
}

export function verificarTokenSessao(token) {
  return jwt.verify(token, getSessionSecret());
}

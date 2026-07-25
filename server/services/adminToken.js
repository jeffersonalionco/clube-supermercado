import jwt from "jsonwebtoken";
import { getAdminSessionSecret } from "../config/security.js";

const EXPIRES_IN = process.env.ADMIN_SESSION_EXPIRES_IN || "8h";

export function criarTokenAdmin(usuario) {
  return jwt.sign(
    {
      sub: "admin",
      usuario,
      role: "admin",
    },
    getAdminSessionSecret(),
    { expiresIn: EXPIRES_IN }
  );
}

export function verificarTokenAdmin(token) {
  const payload = jwt.verify(token, getAdminSessionSecret());
  if (payload.role !== "admin") {
    throw new Error("Token sem permissão de administrador");
  }
  return payload;
}

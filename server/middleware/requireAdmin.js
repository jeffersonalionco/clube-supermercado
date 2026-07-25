import { verificarTokenAdmin } from "../services/adminToken.js";

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão de administrador não informada" });
  }

  const token = header.slice(7);

  try {
    const payload = verificarTokenAdmin(token);
    req.admin = { usuario: payload.usuario };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    return res.status(401).json({ error: "Sessão de administrador inválida" });
  }
}

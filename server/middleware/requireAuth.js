import jwt from "jsonwebtoken";
import { buscarUsuarioPorId } from "../services/usuarioService.js";

const SECRET = process.env.SESSION_SECRET || "altere-isso-em-producao";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão não informada" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, SECRET);
    const usuario = await buscarUsuarioPorId(payload.sub);

    if (!usuario || usuario.cpf !== payload.cpf) {
      return res.status(401).json({ error: "Sessão inválida" });
    }

    req.usuario = usuario;
    req.tokenPayload = payload;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    return res.status(401).json({ error: "Sessão inválida" });
  }
}

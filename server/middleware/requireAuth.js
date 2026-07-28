import jwt from "jsonwebtoken";
import { getSessionSecret } from "../config/security.js";
import { buscarUsuarioPorId } from "../services/usuarioService.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  const queryToken =
    typeof req.query?.token === "string" ? req.query.token.trim() : "";

  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : queryToken || null;

  if (!token) {
    return res.status(401).json({ error: "Sessão não informada" });
  }

  try {
    const payload = jwt.verify(token, getSessionSecret());
    const usuario = await buscarUsuarioPorId(payload.sub);

    if (!usuario || usuario.cpf !== payload.cpf) {
      return res.status(401).json({ error: "Sessão inválida" });
    }

    const versaoAtual = Number(usuario.senha_versao) || 1;
    const versaoToken = payload.sv != null ? Number(payload.sv) : 1;
    if (versaoToken !== versaoAtual) {
      return res.status(401).json({
        error: "Sessão expirada após alteração de senha. Faça login novamente.",
      });
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

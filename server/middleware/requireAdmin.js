import { verificarTokenAdmin } from "../services/adminToken.js";
import { carregarAcessoPorUsuario } from "../services/painelAdminService.js";

export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sessão de administrador não informada" });
  }

  const token = header.slice(7);

  try {
    const payload = verificarTokenAdmin(token);
    const acesso = await carregarAcessoPorUsuario(payload.usuario);
    if (!acesso?.ativo) {
      return res.status(401).json({ error: "Sessão de administrador inválida" });
    }
    req.admin = {
      usuario: acesso.usuario,
      id: acesso.id,
      nome: acesso.nome,
    };
    req.adminAcesso = acesso;
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    if (error.name === "JsonWebTokenError" || error.message === "Token sem permissão de administrador") {
      return res.status(401).json({ error: "Sessão de administrador inválida" });
    }
    console.error("[requireAdmin]", error.message);
    return res.status(500).json({ error: "Não foi possível confirmar o acesso" });
  }
}

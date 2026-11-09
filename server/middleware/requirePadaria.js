import { verificarTokenPadaria } from "../services/padariaToken.js";
import { verificarTokenAdmin } from "../services/adminToken.js";
import { carregarAcessoPorUsuario } from "../services/painelAdminService.js";
import { temFerramenta } from "../../shared/permissoesAdmin.js";
import { ferramentasExigidas } from "../services/permissoesRotas.js";

function extrairBearer(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function montarUsuarioPadaria(payload) {
  return {
    id: Number(payload.sub),
    login: payload.login,
    nome: payload.nome,
    papel: payload.papel,
  };
}

export function requirePadariaAuth(papeisPermitidos = null) {
  const allowed = papeisPermitidos
    ? new Set(Array.isArray(papeisPermitidos) ? papeisPermitidos : [papeisPermitidos])
    : null;

  return (req, res, next) => {
    const token = extrairBearer(req);
    if (!token) {
      return res.status(401).json({ error: "Sessão da padaria não informada" });
    }

    try {
      const payload = verificarTokenPadaria(token);
      if (allowed && !allowed.has(payload.papel)) {
        return res.status(403).json({ error: "Sem permissão para esta operação" });
      }
      req.padariaUsuario = montarUsuarioPadaria(payload);
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
      }
      return res.status(401).json({ error: "Sessão da padaria inválida" });
    }
  };
}

/** Atendente ou gestor. */
export const requireAtendente = requirePadariaAuth(["atendente", "gestor"]);

/** Padaria (produção) ou gestor. */
export const requirePadaria = requirePadariaAuth(["padaria", "gestor"]);

/** Atendente, produção ou gestor — cupom na Bematech. */
export const requireOperacaoPadaria = requirePadariaAuth([
  "atendente",
  "padaria",
  "gestor",
]);

/** Só gestor padaria. */
export const requireGestorPadaria = requirePadariaAuth(["gestor"]);

/**
 * Gestão de catálogo: gestor da padaria OU admin do clube.
 */
export function requirePadariaAdmin(req, res, next) {
  const token = extrairBearer(req);
  if (!token) {
    return res.status(401).json({ error: "Sessão não informada" });
  }

  try {
    const payload = verificarTokenPadaria(token);
    if (payload.papel === "gestor") {
      req.padariaUsuario = montarUsuarioPadaria(payload);
      req.padariaAdminVia = "gestor";
      return next();
    }
  } catch {
    /* tenta admin do clube */
  }

  let adminPayload;
  try {
    adminPayload = verificarTokenAdmin(token);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
    }
    return res.status(401).json({ error: "Sessão inválida para gestão da padaria" });
  }

  carregarAcessoPorUsuario(adminPayload.usuario)
    .then((acesso) => {
      if (!acesso?.ativo) {
        return res.status(401).json({ error: "Sessão inválida para gestão da padaria" });
      }
      const exigidas = ferramentasExigidas("padaria", req.method, req.path);
      if (!temFerramenta(acesso, exigidas)) {
        return res.status(403).json({
          error: "Esta ferramenta não foi liberada para o seu usuário.",
          codigo: "sem_ferramenta",
        });
      }
      req.admin = { usuario: acesso.usuario, id: acesso.id, nome: acesso.nome };
      req.adminAcesso = acesso;
      req.padariaAdminVia = "admin-clube";
      return next();
    })
    .catch((error) => {
      console.error("[padaria/admin]", error.message);
      return res.status(500).json({ error: "Não foi possível confirmar o acesso" });
    });
}

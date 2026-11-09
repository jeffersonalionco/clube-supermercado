import { temFerramenta } from "../../shared/permissoesAdmin.js";
import { ferramentasExigidas } from "../services/permissoesRotas.js";

export function guardarEscopo(escopo) {
  return (req, res, next) => {
    try {
      const exigidas = ferramentasExigidas(escopo, req.method, req.path);
      if (temFerramenta(req.adminAcesso, exigidas)) return next();
      return res.status(403).json({
        error: "Esta ferramenta não foi liberada para o seu usuário.",
        codigo: "sem_ferramenta",
      });
    } catch (error) {
      console.error("[permissoes]", error.message);
      return res.status(500).json({ error: "Não foi possível confirmar o acesso" });
    }
  };
}

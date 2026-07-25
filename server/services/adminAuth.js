import bcrypt from "bcrypt";
import {
  buscarAdminAtivoPorUsuario,
  credenciaisAdminDisponiveis,
} from "./painelAdminService.js";

export async function credenciaisAdminConfiguradas() {
  return credenciaisAdminDisponiveis();
}

export async function validarCredenciaisAdmin(usuario, senha) {
  const login = String(usuario || "").trim().toLowerCase();
  if (!login) return false;

  const adminDb = await buscarAdminAtivoPorUsuario(login);
  if (adminDb?.senha_hash) {
    try {
      return await bcrypt.compare(String(senha || ""), adminDb.senha_hash);
    } catch {
      return false;
    }
  }

  if (!process.env.ADMIN_USUARIO) return false;

  if (login !== String(process.env.ADMIN_USUARIO || "").trim().toLowerCase()) {
    return false;
  }

  const hash = process.env.ADMIN_SENHA_HASH;
  if (hash) {
    try {
      return await bcrypt.compare(String(senha || ""), hash);
    } catch {
      return false;
    }
  }

  return String(senha || "") === String(process.env.ADMIN_SENHA || "");
}

import jwt from "jsonwebtoken";

const SECRET = process.env.SESSION_SECRET || "altere-isso-em-producao";
const EXPIRES_IN = process.env.SESSION_EXPIRES_IN || "7d";

export function criarTokenSessao(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      cpf: usuario.cpf,
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verificarTokenSessao(token) {
  return jwt.verify(token, SECRET);
}

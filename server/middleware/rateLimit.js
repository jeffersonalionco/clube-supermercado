import rateLimit from "express-rate-limit";

const mensagemPadrao = {
  error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: mensagemPadrao,
});

export const verificarCpfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CPF_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
  message: mensagemPadrao,
});

export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_ADMIN_MAX || 15),
  standardHeaders: true,
  legacyHeaders: false,
  message: mensagemPadrao,
});

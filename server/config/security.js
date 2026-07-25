const DEFAULT_SESSION_SECRET = "altere-isso-em-producao";

export function getSessionSecret() {
  return process.env.SESSION_SECRET || DEFAULT_SESSION_SECRET;
}

export function getAdminSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SESSION_SECRET ||
    DEFAULT_SESSION_SECRET
  );
}

export function isProducao() {
  return process.env.NODE_ENV === "production";
}

export function avisarConfigInsegura() {
  const avisos = [];

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === DEFAULT_SESSION_SECRET) {
    avisos.push(
      "SESSION_SECRET ausente ou padrão — defina uma chave longa e aleatória no .env"
    );
  }

  if (
    process.env.ADMIN_SESSION_SECRET &&
    process.env.ADMIN_SESSION_SECRET === process.env.SESSION_SECRET
  ) {
    avisos.push(
      "ADMIN_SESSION_SECRET igual ao SESSION_SECRET — prefira chaves distintas"
    );
  } else if (!process.env.ADMIN_SESSION_SECRET && isProducao()) {
    avisos.push(
      "ADMIN_SESSION_SECRET não definido — tokens admin usam o mesmo segredo do cliente"
    );
  }

  if (process.env.ADMIN_SENHA && !process.env.ADMIN_SENHA_HASH && isProducao()) {
    avisos.push(
      "ADMIN_SENHA em texto plano — gere ADMIN_SENHA_HASH com: npm run hash-admin-senha"
    );
  }

  if (!process.env.CORS_ORIGINS && isProducao()) {
    avisos.push(
      "CORS_ORIGINS não definido — qualquer site pode chamar a API no navegador"
    );
  }

  for (const msg of avisos) {
    console.warn(`[segurança] ${msg}`);
  }
}

export function corsOptions() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw?.trim()) {
    return { origin: true };
  }

  const permitidos = new Set(
    raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  );

  return {
    origin(origin, callback) {
      if (!origin || permitidos.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  };
}

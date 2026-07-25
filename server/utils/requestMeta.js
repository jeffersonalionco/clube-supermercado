/**
 * Extrai IP, user-agent e informações básicas de dispositivo da requisição HTTP.
 */
export function obterIpCliente(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const primeiro = String(forwarded).split(",")[0]?.trim();
    if (primeiro) return primeiro.slice(0, 45);
  }

  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim().slice(0, 45);

  return String(req.socket?.remoteAddress || req.ip || "").slice(0, 45) || null;
}

function detectarSistema(ua) {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Desconhecido";
}

function detectarNavegador(ua) {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return "Opera";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/firefox\//i.test(ua)) return "Firefox";
  return "Desconhecido";
}

function detectarDispositivo(ua) {
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  if (/mobile|iphone|android/i.test(ua)) return "Celular";
  return "Computador";
}

export function obterContextoRequisicao(req) {
  const userAgent = String(req.headers["user-agent"] || "").trim().slice(0, 500);
  const ua = userAgent || "";

  return {
    ip: obterIpCliente(req),
    userAgent: ua || null,
    dispositivo: ua ? detectarDispositivo(ua) : null,
    navegador: ua ? detectarNavegador(ua) : null,
    sistema: ua ? detectarSistema(ua) : null,
  };
}

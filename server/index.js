import "./env.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { avisarConfigInsegura, corsOptions } from "./config/security.js";
import { initDatabase } from "./db.js";
import { testarConexaoWrpdv } from "./db/wrpdv.js";
import authRoutes from "./routes/auth.js";
import clienteRoutes from "./routes/cliente.js";
import adminRoutes from "./routes/admin.js";
import adminBrindesRoutes from "./routes/adminBrindes.js";
import adminLegalRoutes from "./routes/adminLegal.js";
import adminNovidadesRoutes from "./routes/adminNovidades.js";
import adminMarketingRoutes from "./routes/adminMarketing.js";
import marketingPublicoRoutes from "./routes/marketingPublico.js";
import legalRoutes from "./routes/legal.js";
import padariaRoutes from "./routes/padaria.js";
import whatsappWebhookRoutes from "./routes/whatsappWebhook.js";
import { mensagemParaCliente } from "./utils/mensagemCliente.js";
import { retomarEnviosPendentesNoBoot } from "./services/marketing/emailEnvioService.js";
import { retomarEnviosWhatsappPendentesNoBoot } from "./services/marketing/whatsappEnvioService.js";
import { limparEventosWebhookAntigos } from "./services/marketing/whatsappAutoReplyService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

function localNetworkUrls(port) {
  const urls = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        urls.push(`http://${iface.address}:${port}`);
      }
    }
  }
  return urls;
}

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions()));
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      if (req.originalUrl?.startsWith("/api/webhooks/whatsapp")) {
        req.rawBody = buf;
      }
    },
  })
);

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use(
  "/uploads",
  (_req, res, next) => {
    // Mídia precisa ser legível por clientes externos (Meta / WhatsApp)
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  },
  express.static(path.join(__dirname, "uploads"), {
    setHeaders(res, filePath) {
      if (/\.mp4$/i.test(filePath)) {
        res.setHeader("Content-Type", "video/mp4");
      }
    },
  })
);
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/auth", authRoutes);
app.use("/api/legal", legalRoutes);
app.use("/api/cliente", clienteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/brindes", adminBrindesRoutes);
app.use("/api/admin/legal", adminLegalRoutes);
app.use("/api/admin/novidades", adminNovidadesRoutes);
app.use("/api/admin/marketing", adminMarketingRoutes);
app.use("/api/marketing", marketingPublicoRoutes);
app.use("/api/padaria", padariaRoutes);
app.use("/api/webhooks/whatsapp", whatsappWebhookRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota da API não encontrada" });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Corpo da requisição JSON inválido" });
  }
  console.error("[server]", err);
  if (req.path.startsWith("/api")) {
    return res.status(500).json({
      error: mensagemParaCliente(err.message) || "Erro interno",
    });
  }
  next(err);
});

async function start() {
  avisarConfigInsegura();

  try {
    await initDatabase();
  } catch (error) {
    console.error("Falha ao iniciar PostgreSQL:", error.message);
    console.error(
      "Verifique se o PostgreSQL está rodando e as credenciais em server/.env"
    );
    process.exit(1);
  }

  try {
    await testarConexaoWrpdv();
    const wrpdvHost = process.env.WRPDV_HOST || "10.1.1.250";
    const wrpdvDb = process.env.WRPDV_DATABASE || "wrpdv";
    console.log(`WR PDV conectado (${wrpdvHost}/${wrpdvDb}).`);
  } catch (error) {
    console.warn("WR PDV indisponível — compras e pontos podem falhar:", error.message);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Servidor local:  http://localhost:${PORT}`);
    const network = localNetworkUrls(PORT);
    if (network.length) {
      console.log("Rede local (API):");
      network.forEach((url) => console.log(`  ${url}`));
    }
    retomarEnviosPendentesNoBoot().catch((err) => {
      console.error("[marketing/boot]", err.message);
    });
    retomarEnviosWhatsappPendentesNoBoot().catch((err) => {
      console.error("[marketing/whatsapp/boot]", err.message);
    });
    limparEventosWebhookAntigos(14).catch(() => {});
    setInterval(() => {
      limparEventosWebhookAntigos(14).catch(() => {});
    }, 24 * 60 * 60 * 1000);

    // Cache de preço 2 aquecido para a auto-resposta "Ofertas de hoje"
    import("./services/produtosClubeDescontosService.js")
      .then(({ aquecerCacheClubeDescontos }) => {
        aquecerCacheClubeDescontos();
        console.log("[clube-descontos] aquecimento do cache iniciado");
      })
      .catch((err) => {
        console.warn("[clube-descontos] aquecimento falhou:", err.message);
      });
  });
}

start();

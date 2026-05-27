import "./env.js";
import cors from "cors";
import express from "express";
import os from "os";
import { initDatabase } from "./db.js";
import authRoutes from "./routes/auth.js";
import clienteRoutes from "./routes/cliente.js";

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

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

app.use(cors({ origin: true }));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/cliente", clienteRoutes);

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
    return res.status(500).json({ error: err.message || "Erro interno" });
  }
  next(err);
});

async function start() {
  try {
    await initDatabase();
  } catch (error) {
    console.error("Falha ao iniciar PostgreSQL:", error.message);
    console.error(
      "Verifique se o PostgreSQL está rodando e as credenciais em server/.env"
    );
    process.exit(1);
  }

  app.listen(PORT, HOST, () => {
    console.log(`Servidor local:  http://localhost:${PORT}`);
    const network = localNetworkUrls(PORT);
    if (network.length) {
      console.log("Rede local (API):");
      network.forEach((url) => console.log(`  ${url}`));
    }
  });
}

start();

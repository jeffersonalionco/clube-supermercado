import { buscarVendasClienteWrpdv } from "./wrpdvVendasService.js";

/** Fonte de vendas do clube — WR PDV (PostgreSQL local da loja). */
export async function buscarVendasCliente(cpfCnpj, dataini, datafim) {
  return buscarVendasClienteWrpdv(cpfCnpj, dataini, datafim);
}

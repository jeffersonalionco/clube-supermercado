import { useCallback, useEffect, useState } from "react";
import { fetchAdmin } from "../../utils/adminSession.js";

export default function AdminProgramaBanner() {
  const [ativo, setAtivo] = useState(true);
  const [carregado, setCarregado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const data = await fetchAdmin("/api/admin/config/programa");
      setAtivo(Boolean(data.pontosHabilitado));
    } catch {
      setAtivo(true);
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!carregado || ativo) return null;

  return (
    <p className="admin-alert admin-alert--warn admin-programa-banner">
      Programa de pontos <strong>desligado</strong> para clientes — apenas histórico de compras
      visível. Baixas e cadastro de brindes seguem disponíveis no painel.
    </p>
  );
}

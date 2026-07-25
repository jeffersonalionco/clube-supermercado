import { useState } from "react";
import {
  confirmarAssinaturaComprovante,
  imprimirComprovante,
  baixarPdfComprovante,
} from "../../utils/adminComprovante.js";
import { formatarCpfCnpj } from "../../utils/cpf.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import { agruparItensComprovante } from "../../utils/resgateCarrinho.js";

function formatarDataHora(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function AdminComprovantePainel({
  comprovante,
  htmlComprovante,
  onAtualizado,
  onFechar,
  onConcluido,
  assinaturaObrigatoria = true,
}) {
  const [loadingAssinatura, setLoadingAssinatura] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [erro, setErro] = useState("");

  if (!comprovante) return null;

  async function handleImprimir() {
    setErro("");
    try {
      imprimirComprovante(htmlComprovante);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    }
  }

  async function handleBaixarPdf() {
    setErro("");
    setLoadingPdf(true);
    try {
      await baixarPdfComprovante(htmlComprovante, comprovante.codigo);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    } finally {
      setLoadingPdf(false);
    }
  }

  async function handleConfirmarAssinatura() {
    setErro("");
    setLoadingAssinatura(true);
    try {
      const resultado = await confirmarAssinaturaComprovante(comprovante.codigo);
      onAtualizado?.(resultado);
      onConcluido?.(resultado);
    } catch (err) {
      setErro(mensagemParaUsuario(err.message));
    } finally {
      setLoadingAssinatura(false);
    }
  }

  function handleFechar() {
    if (assinaturaObrigatoria && !comprovante.assinaturaConfirmadaEm) {
      const ok = window.confirm(
        "A assinatura do cliente ainda não foi confirmada. Fechar mesmo assim? O resgate já foi registrado, mas ficará pendente na auditoria."
      );
      if (!ok) return;
    }
    onFechar?.();
  }

  const assinado = Boolean(comprovante.assinaturaConfirmadaEm);
  const itensAgrupados = agruparItensComprovante(comprovante.itens || []);

  return (
    <section
      className={`admin-comprovante-painel${!assinado ? " admin-comprovante-painel--pendente" : ""}`}
      aria-live="polite"
    >
      {!assinado && (
        <p className="admin-comprovante-painel__alerta" role="alert">
          <strong>Passo obrigatório:</strong> imprima o comprovante, peça a assinatura do cliente e
          clique em <strong>Confirmar assinatura</strong> antes de iniciar outro resgate.
        </p>
      )}

      <header className="admin-comprovante-painel__head">
        <div>
          <p className="admin-section-label">
            {assinado ? "Comprovante concluído" : "Comprovante aguardando assinatura"}
          </p>
          <h3 className="admin-comprovante-painel__codigo">{comprovante.codigo}</h3>
          <p className="admin-comprovante-painel__sub">
            {comprovante.clienteNome || "Cliente"} · {formatarCpfCnpj(comprovante.cpf)}
          </p>
        </div>
        {onFechar && (
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-btn--sm"
            onClick={handleFechar}
          >
            {assinado ? "Fechar" : "Fechar (pendente)"}
          </button>
        )}
      </header>

      <ul className="admin-comprovante-painel__itens">
        {itensAgrupados.map((item) => (
          <li key={`${item.brindeId}-${item.brindeNome}`}>
            <strong>
              {item.brindeNome}
              {item.quantidade > 1 ? ` × ${item.quantidade}` : ""}
            </strong>
            <span>-{item.pontos} pts</span>
          </li>
        ))}
      </ul>

      <p className="admin-comprovante-painel__totais">
        Total: <strong>{comprovante.pontosTotal} pontos</strong> · Saldo{" "}
        {comprovante.saldoAntes} → {comprovante.saldoDepois}
      </p>

      {htmlComprovante ? (
        <div className="admin-comprovante-painel__preview">
          <p className="admin-comprovante-painel__preview-label">Prévia do comprovante</p>
          <iframe
            title="Prévia do comprovante de resgate"
            srcDoc={htmlComprovante}
            className="admin-comprovante-painel__iframe"
          />
        </div>
      ) : (
        <p className="admin-comprovante-painel__hint">
          Prévia do comprovante indisponível. Use Reimprimir no histórico se necessário.
        </p>
      )}

      {assinado ? (
        <p className="admin-comprovante-painel__ok">
          Assinatura confirmada em {formatarDataHora(comprovante.assinaturaConfirmadaEm)}
          {comprovante.assinaturaAdminUsuario && (
            <> por {comprovante.assinaturaAdminUsuario}</>
          )}
        </p>
      ) : (
        <p className="admin-comprovante-painel__hint">
          1. Imprima ou baixe o PDF · 2. Cliente assina no papel · 3. Confirme abaixo
        </p>
      )}

      {erro && (
        <p className="admin-alert" role="alert">
          {erro}
        </p>
      )}

      <div className="admin-comprovante-painel__acoes">
        {!assinado && (
          <button
            type="button"
            className="admin-btn admin-btn--primary admin-btn--lg"
            disabled={loadingAssinatura}
            onClick={handleConfirmarAssinatura}
          >
            {loadingAssinatura ? "Registrando…" : "Confirmar assinatura do cliente"}
          </button>
        )}
        <button type="button" className="admin-btn admin-btn--ghost" onClick={handleImprimir}>
          {assinado ? "Reimprimir" : "Imprimir comprovante"}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          disabled={loadingPdf || !htmlComprovante}
          onClick={handleBaixarPdf}
        >
          {loadingPdf ? "Gerando PDF…" : "Baixar PDF"}
        </button>
      </div>
    </section>
  );
}

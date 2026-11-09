import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import { clearAdminSession, fetchAdmin, loadAdminSession } from "../../utils/adminSession.js";
import { apiUrl } from "../../utils/api.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";
import "../../styles/admin.css";

const TIPOS = [
  { id: "", label: "Todos" },
  { id: "reclamacao", label: "Reclamações" },
  { id: "sugestao", label: "Sugestões" },
  { id: "elogio", label: "Elogios" },
];

const STATUS = [
  { id: "", label: "Todos" },
  { id: "aberto", label: "Abertos" },
  { id: "lido", label: "Lidos" },
  { id: "resolvido", label: "Resolvidos" },
];

const ROTULO = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  elogio: "Elogio",
  aberto: "Aberto",
  lido: "Lido",
  resolvido: "Resolvido",
};

function quando(valor) {
  if (!valor) return "—";
  try {
    return new Date(valor).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function cpfExibir(valor) {
  const d = String(valor || "").replace(/\D/g, "");
  if (d.length !== 11) return valor || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function telefoneExibir(valor) {
  const d = String(valor || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  return valor || "—";
}

async function urlMidia(ticketId, mensagemId) {
  const session = loadAdminSession();
  const response = await fetch(
    apiUrl(
      `/api/admin/marketing/ouvidoria/${ticketId}/mensagens/${mensagemId}/arquivo`
    ),
    { headers: { Authorization: `Bearer ${session?.token || ""}` } }
  );
  if (!response.ok) return null;
  return URL.createObjectURL(await response.blob());
}

export default function AdminOuvidoriaPage({ tab, onTabChange, onLogout, admin, onVoltar }) {
  const [tipo, setTipo] = useState("");
  const [status, setStatus] = useState("aberto");
  const [lista, setLista] = useState([]);
  const [totais, setTotais] = useState([]);
  const [ticket, setTicket] = useState(null);
  const [midias, setMidias] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (tipo) qs.set("tipo", tipo);
      if (status) qs.set("status", status);
      const dados = await fetchAdmin(`/api/admin/marketing/ouvidoria?${qs}`);
      setLista(dados.itens || []);
      setTotais(dados.totais || []);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [onLogout, status, tipo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    return () => {
      Object.values(midias).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [midias]);

  async function abrir(id) {
    setError("");
    try {
      const dados = await fetchAdmin(`/api/admin/marketing/ouvidoria/${id}`);
      setTicket(dados.ticket);
      const urls = {};
      for (const msg of dados.ticket.mensagens || []) {
        if (msg.arquivo) {
          const url = await urlMidia(id, msg.id);
          if (url) urls[msg.id] = url;
        }
      }
      setMidias((atual) => {
        Object.values(atual).forEach((url) => URL.revokeObjectURL(url));
        return urls;
      });
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    }
  }

  async function mudarStatus(novo) {
    if (!ticket) return;
    try {
      await fetchAdmin(`/api/admin/marketing/ouvidoria/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: novo }),
      });
      setTicket((atual) => ({ ...atual, status: novo }));
      carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    }
  }

  const abertos = totais
    .filter((item) => item.status === "aberto")
    .reduce((soma, item) => soma + item.n, 0);

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      <div className="admin-ouvidoria">
        <header className="admin-page-head">
          <div>
            <h1>Sugestões e reclamações</h1>
            <p>
              O que os clientes mandam pelo WhatsApp: texto, áudio e foto, ligados à conta quando o número está no clube.
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={onVoltar}>
            Voltar
          </button>
        </header>

        <p className="admin-ouvidoria__abertos">
          {abertos} em aberto
        </p>

        <div className="admin-ouvidoria__filtros">
          {TIPOS.map((item) => (
            <button
              key={item.id || "tipo"}
              type="button"
              className={`admin-btn admin-btn--sm ${tipo === item.id ? "admin-btn--primary" : "admin-btn--ghost"}`}
              onClick={() => setTipo(item.id)}
            >
              {item.label}
            </button>
          ))}
          <span className="admin-ouvidoria__sep" />
          {STATUS.map((item) => (
            <button
              key={item.id || "status"}
              type="button"
              className={`admin-btn admin-btn--sm ${status === item.id ? "admin-btn--primary" : "admin-btn--ghost"}`}
              onClick={() => setStatus(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="admin-alert" role="alert">
            {error}
          </p>
        )}

        <div className="admin-ouvidoria__grade">
          <ul className="admin-ouvidoria__lista">
            {loading && <li className="admin-ouvidoria__vazio">Carregando…</li>}
            {!loading && lista.length === 0 && (
              <li className="admin-ouvidoria__vazio">Nenhum registro nesse filtro.</li>
            )}
            {lista.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`admin-ouvidoria__item${ticket?.id === item.id ? " is-ativo" : ""}`}
                  onClick={() => abrir(item.id)}
                >
                  <span className={`admin-ouvidoria__tipo admin-ouvidoria__tipo--${item.tipo}`}>
                    {ROTULO[item.tipo]}
                  </span>
                  <strong>{item.nome || telefoneExibir(item.telefone)}</strong>
                  <span>{item.previa || "Sem texto — pode ter áudio ou foto"}</span>
                  <small>
                    {quando(item.atualizado_em)} · {item.mensagens} mensagem
                    {item.mensagens === 1 ? "" : "s"} · {ROTULO[item.status]}
                  </small>
                </button>
              </li>
            ))}
          </ul>

          <article className="admin-ouvidoria__detalhe">
            {!ticket && <p className="admin-ouvidoria__vazio">Escolha um registro para ler.</p>}
            {ticket && (
              <>
                <header>
                  <span className={`admin-ouvidoria__tipo admin-ouvidoria__tipo--${ticket.tipo}`}>
                    {ROTULO[ticket.tipo]} · nº {ticket.id}
                  </span>
                  <h2>{ticket.nome || "Cliente sem cadastro no clube"}</h2>
                  <p>
                    {telefoneExibir(ticket.telefone)}
                    {ticket.cpf ? ` · CPF ${cpfExibir(ticket.cpf)}` : ""}
                  </p>
                  <p>{ROTULO[ticket.status]} · aberto em {quando(ticket.criado_em)}</p>
                </header>
                <div className="admin-ouvidoria__acoes">
                  {ticket.status !== "lido" && (
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => mudarStatus("lido")}>
                      Marcar como lido
                    </button>
                  )}
                  {ticket.status !== "resolvido" && (
                    <button type="button" className="admin-btn admin-btn--primary" onClick={() => mudarStatus("resolvido")}>
                      Resolvido
                    </button>
                  )}
                  {ticket.status !== "aberto" && (
                    <button type="button" className="admin-btn admin-btn--ghost" onClick={() => mudarStatus("aberto")}>
                      Reabrir
                    </button>
                  )}
                </div>
                <ol className="admin-ouvidoria__msgs">
                  {(ticket.mensagens || []).map((msg) => (
                    <li key={msg.id}>
                      <small>{quando(msg.criado_em)}</small>
                      {msg.texto && <p>{msg.texto}</p>}
                      {msg.tipo === "image" && midias[msg.id] && (
                        <img src={midias[msg.id]} alt="Foto enviada pelo cliente" />
                      )}
                      {msg.tipo === "audio" && midias[msg.id] && (
                        <audio controls src={midias[msg.id]} />
                      )}
                      {msg.tipo === "video" && midias[msg.id] && (
                        <video controls src={midias[msg.id]} />
                      )}
                      {msg.arquivo && !midias[msg.id] && <p>Arquivo indisponível.</p>}
                    </li>
                  ))}
                  {(ticket.mensagens || []).length === 0 && (
                    <li>O cliente escolheu o tipo e ainda não mandou conteúdo.</li>
                  )}
                </ol>
              </>
            )}
          </article>
        </div>
      </div>
    </AdminLayout>
  );
}

import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import Field from "../../components/Field.jsx";
import { fetchAdmin } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
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

function formatarBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const FORM_VAZIO = {
  ativo: false,
  hora: "02:00",
  host: "10.1.1.195",
  share: "backup",
  pasta: "clube",
  usuario: "Administrador",
  senha: "",
  dominio: "",
  limiarGb: 10,
  manterAbaixo: 2,
  manterAcima: 1,
};

export default function AdminBackupPage({ tab, onTabChange, onLogout, admin }) {
  const [form, setForm] = useState(FORM_VAZIO);
  const [meta, setMeta] = useState(null);
  const [execucoes, setExecucoes] = useState([]);
  const [remoto, setRemoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [rodandoRemoto, setRodandoRemoto] = useState("");
  const [conferindo, setConferindo] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdmin("/api/admin/backup");
      setForm({
        ativo: Boolean(data.ativo),
        hora: data.hora || "02:00",
        host: data.host || "10.1.1.195",
        share: data.share || "backup",
        pasta: data.pasta || "clube",
        usuario: data.usuario || "",
        senha: "",
        dominio: data.dominio || "",
        limiarGb: data.limiarGb ?? 10,
        manterAbaixo: data.manterAbaixo ?? 2,
        manterAcima: data.manterAcima ?? 1,
      });
      setMeta(data);
      setExecucoes(data.execucoes || []);
      setRemoto(data.remoto || null);
      setRodando(Boolean(data.rodando));
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rodandoRemotoFlag =
    Boolean(rodandoRemoto) || Boolean(remoto?.sistemas?.some((s) => s.rodando));

  useEffect(() => {
    if (!rodando && !rodandoRemotoFlag) return undefined;
    const id = window.setInterval(() => {
      fetchAdmin("/api/admin/backup")
        .then((data) => {
          setExecucoes(data.execucoes || []);
          setRodando(Boolean(data.rodando));
          setRemoto(data.remoto || null);
          setMeta((prev) => ({ ...prev, ...data }));
        })
        .catch(() => {});
    }, 3000);
    return () => window.clearInterval(id);
  }, [rodando, rodandoRemotoFlag]);

  function setCampo(chave, valor) {
    setForm((prev) => ({ ...prev, [chave]: valor }));
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchAdmin("/api/admin/backup", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          senha: form.senha || undefined,
        }),
      });
      setSuccess(data.message || "Configuração salva.");
      setForm((prev) => ({ ...prev, senha: "" }));
      setMeta((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSalvando(false);
    }
  }

  async function testar() {
    setTestando(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchAdmin("/api/admin/backup/testar", { method: "POST" });
      setSuccess(data.message || "Pasta acessível.");
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setTestando(false);
    }
  }

  async function executar() {
    if (
      !window.confirm(
        "Gerar agora o backup completo (banco + imagens + guia de restauração) e enviar para \\\\10.1.1.195\\backup\\clube?"
      )
    ) {
      return;
    }
    setRodando(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchAdmin("/api/admin/backup/executar", { method: "POST" });
      setSuccess(data.message || "Backup concluído.");
      await carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
      setRodando(false);
    }
  }

  async function executarRemoto(sistema) {
    const rotulo = sistema === "all" ? "ERP e WR PDV" : sistema === "erp" ? "ERP" : "WR PDV";
    if (
      !window.confirm(
        `Disparar backup de ${rotulo} agora? O clube só envia o comando; o dump (pode passar de 100 GB) grava direto no disco D da 195 e pode levar horas.`
      )
    ) {
      return;
    }
    setRodandoRemoto(sistema);
    setError("");
    setSuccess("");
    try {
      const data = await fetchAdmin("/api/admin/backup/executar-remoto", {
        method: "POST",
        body: JSON.stringify({ sistema }),
      });
      setSuccess(data.mensagem || "Comando enviado.");
      setRodandoRemoto("");
      await carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
      setRodandoRemoto("");
    }
  }

  async function conferirRemoto() {
    setConferindo(true);
    setError("");
    setSuccess("");
    try {
      const data = await fetchAdmin("/api/admin/backup/conferir", { method: "POST" });
      setSuccess(data.message || "Conferência feita.");
      await carregar();
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setConferindo(false);
    }
  }

  const destino = `\\\\${form.host || "10.1.1.195"}\\${form.share || "backup"}\\${
    form.pasta || "clube"
  }`;

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={onLogout} admin={admin}>
      {error && <p className="admin-alert admin-alert--error">{error}</p>}
      {success && <p className="admin-alert admin-alert--success">{success}</p>}

      {loading ? (
        <p className="admin-muted">Carregando backup…</p>
      ) : (
        <div className="admin-backup">
          <section className="admin-card admin-programa__card">
            <div className="admin-programa__head">
              <div>
                <h2>Backup automático do clube</h2>
                <p className="admin-muted">
                  Pacote diário com o banco, as fotos (padaria, brindes, novidades,
                  marketing) e um RESTAURAR.txt com GitHub, variáveis do .env e
                  passo a passo, em {destino}. WR PDV e ERP vão cada um para a
                  pasta no mesmo disco D.
                </p>
              </div>
              <span
                className={`admin-programa__badge${form.ativo ? " admin-programa__badge--on" : ""}`}
              >
                {form.ativo ? "Agenda ligada" : "Agenda desligada"}
              </span>
            </div>

            <form className="admin-backup__form" onSubmit={salvar}>
              <label className="admin-programa__toggle">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setCampo("ativo", e.target.checked)}
                />
                <span className="admin-programa__toggle-ui" aria-hidden />
                <span>
                  <strong>Rodar todo dia automaticamente</strong>
                  <small>
                    No horário de Brasília. O pacote tem banco + imagens. Se ficar
                    abaixo de {form.limiarGb} GB, guarda {form.manterAbaixo} cópias;
                    se passar disso, guarda {form.manterAcima}.
                  </small>
                </span>
              </label>

              <div className="admin-backup__grid">
                <Field label="Horário (Brasília)" hint="Ex.: 02:00">
                  <input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setCampo("hora", e.target.value)}
                    required
                  />
                </Field>
                <Field label="IP do servidor de backup">
                  <input
                    value={form.host}
                    onChange={(e) => setCampo("host", e.target.value)}
                    placeholder="10.1.1.195"
                    required
                  />
                </Field>
                <Field label="Compartilhamento" hint="Nome do share do disco D">
                  <input
                    value={form.share}
                    onChange={(e) => setCampo("share", e.target.value)}
                    placeholder="backup"
                    required
                  />
                </Field>
                <Field label="Pasta dentro do share" hint="Será criada se não existir">
                  <input
                    value={form.pasta}
                    onChange={(e) => setCampo("pasta", e.target.value)}
                    placeholder="clube"
                    required
                  />
                </Field>
                <Field label="Usuário SMB" hint="Deixe vazio se o share for convidado">
                  <input
                    value={form.usuario}
                    onChange={(e) => setCampo("usuario", e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Senha SMB"
                  hint={
                    meta?.senhaDefinida
                      ? "Já há senha gravada. Preencha só para trocar."
                      : "Opcional"
                  }
                >
                  <input
                    type="password"
                    value={form.senha}
                    onChange={(e) => setCampo("senha", e.target.value)}
                    autoComplete="new-password"
                    placeholder={meta?.senhaDefinida ? "••••••••" : ""}
                  />
                </Field>
                <Field label="Domínio" hint="Opcional">
                  <input
                    value={form.dominio}
                    onChange={(e) => setCampo("dominio", e.target.value)}
                    placeholder="WORKGROUP"
                  />
                </Field>
                <Field label="Limiar (GB)" hint="Abaixo disso guarda 2 cópias">
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    value={form.limiarGb}
                    onChange={(e) => setCampo("limiarGb", e.target.value)}
                  />
                </Field>
                <Field label="Cópias se menor que o limiar">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={form.manterAbaixo}
                    onChange={(e) => setCampo("manterAbaixo", e.target.value)}
                  />
                </Field>
                <Field label="Cópias se maior ou igual">
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.manterAcima}
                    onChange={(e) => setCampo("manterAcima", e.target.value)}
                  />
                </Field>
              </div>

              <div className="admin-backup__actions">
                <button type="submit" className="admin-btn admin-btn--primary" disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar regras"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={testar}
                  disabled={testando || rodando}
                >
                  {testando ? "Testando…" : "Testar pasta"}
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={executar}
                  disabled={rodando}
                >
                  {rodando ? "Gerando backup…" : "Rodar agora"}
                </button>
              </div>
            </form>

            <dl className="admin-programa__meta">
              <div>
                <dt>Último sucesso</dt>
                <dd>{formatarData(meta?.ultimoSucessoEm)}</dd>
              </div>
              <div>
                <dt>Última alteração</dt>
                <dd>
                  {formatarData(meta?.atualizadoEm)}
                  {meta?.atualizadoPor ? ` · ${meta.atualizadoPor}` : ""}
                </dd>
              </div>
            </dl>
            {meta?.ultimoErro ? (
              <p className="admin-muted">Último erro: {meta.ultimoErro}</p>
            ) : null}
          </section>

          {(remoto?.sistemas || []).map((sis) => (
            <section key={sis.id} className="admin-card admin-programa__card">
              <div className="admin-programa__head">
                <div>
                  <h2>{sis.titulo}</h2>
                  <p className="admin-muted">
                    Dump completo do banco <code>{sis.banco}</code> em 10.1.1.250,
                    gravado direto em {sis.destino}. Uma cópia. Agenda 02:00,
                    conferência 06:30. O clube só dispara o comando na 195.
                  </p>
                </div>
                <span
                  className={`admin-programa__badge${sis.ativo ? " admin-programa__badge--on" : ""}`}
                >
                  {sis.rodando ? "Dump em andamento" : sis.ativo ? "Agenda 02:00" : "Desligado"}
                </span>
              </div>
              <dl className="admin-programa__meta">
                <div>
                  <dt>Último sucesso</dt>
                  <dd>{formatarData(sis.ultimoSucessoEm)}</dd>
                </div>
                <div>
                  <dt>Arquivo</dt>
                  <dd>{sis.ultimoArquivo || sis.statusArquivo?.arquivo || "—"}</dd>
                </div>
                <div>
                  <dt>Tamanho</dt>
                  <dd>
                    {sis.statusArquivo?.tamanhoHumano ||
                      formatarBytes(sis.ultimoBytes)}
                  </dd>
                </div>
              </dl>
              {sis.ultimoErro ? (
                <p className="admin-muted">Último erro: {sis.ultimoErro}</p>
              ) : null}
              {sis.statusArquivo?.erro ? (
                <p className="admin-muted">Status na pasta: {sis.statusArquivo.erro}</p>
              ) : null}
              <div className="admin-backup__actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost"
                  onClick={() => executarRemoto(sis.id)}
                  disabled={Boolean(rodandoRemoto) || sis.rodando}
                >
                  {rodandoRemoto === sis.id || sis.rodando
                    ? "Disparando…"
                    : "Rodar agora"}
                </button>
              </div>
            </section>
          ))}

          <section className="admin-card">
            <div className="admin-programa__head">
              <div>
                <h2 className="admin-card__title">Conferência 06:30</h2>
                <p className="admin-muted">
                  Lê D:\BKP_WRPDV e D:\BKP_ERP na 195 e registra sucesso ou falha
                  no histórico. Roda sozinha de manhã; use o botão para checar agora.
                </p>
              </div>
            </div>
            <div className="admin-backup__actions">
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={conferirRemoto}
                disabled={conferindo}
              >
                {conferindo ? "Conferindo…" : "Conferir pastas agora"}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => executarRemoto("all")}
                disabled={Boolean(rodandoRemoto) || rodandoRemotoFlag}
              >
                {rodandoRemoto === "all" ? "Disparando…" : "Rodar ERP + WR PDV"}
              </button>
            </div>
          </section>

          <section className="admin-card">
            <h2 className="admin-card__title">Histórico</h2>
            {execucoes.length === 0 ? (
              <p className="admin-muted">Nenhum backup ainda.</p>
            ) : (
              <div className="admin-backup__tabela">
                <table>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Sistema</th>
                      <th>Arquivo</th>
                      <th>Tamanho</th>
                      <th>Status</th>
                      <th>Retenção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucoes.map((ex) => (
                      <tr key={ex.id}>
                        <td>{formatarData(ex.iniciadoEm)}</td>
                        <td>
                          {ex.sistema === "erp"
                            ? "ERP"
                            : ex.sistema === "wrpdv"
                              ? "WR PDV"
                              : "Clube"}
                        </td>
                        <td>{ex.arquivo || "—"}</td>
                        <td>{formatarBytes(ex.tamanhoBytes)}</td>
                        <td>
                          {ex.status === "ok"
                            ? "Ok"
                            : ex.status === "rodando"
                              ? "Rodando"
                              : ex.erro || "Erro"}
                        </td>
                        <td>
                          {ex.status === "ok"
                            ? `manteve ${ex.mantidos} · apagou ${ex.removidos || 0}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}

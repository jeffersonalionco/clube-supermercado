import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout.jsx";
import AdminProgramaBanner from "../../components/admin/AdminProgramaBanner.jsx";
import AdminAjudaPontosBrindes from "../../components/admin/AdminAjudaPontosBrindes.jsx";
import { dispararAtualizacaoResumoAdmin } from "../../components/admin/AdminResumoPontos.jsx";
import AdminOperacoesRecentes from "../../components/admin/AdminOperacoesRecentes.jsx";
import {
  VALOR_REFERENCIA_PONTO,
  formatarValorReferenciaPonto,
  sugerirPontosPorValor,
} from "../../utils/pontosReferencia.js";
import Field from "../../components/Field.jsx";
import {
  clearAdminSession,
  fetchAdmin,
  resolveImagemUrl,
  uploadAdminImagem,
} from "../../utils/adminSession.js";
import { formatarMoeda } from "../../utils/moeda.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

const FORM_VAZIO = {
  nome: "",
  descricao: "",
  imagemUrl: "",
  valor: "",
  pontos: "",
  estoque: "0",
  categoria: "",
  ativo: true,
};

const CATEGORIAS_SUGESTOES = [
  "Kit Churrasco",
  "Bazar",
  "Casa",
  "Cozinha",
  "Eletrônicos",
  "Infantil",
  "Bebidas",
  "Alimentação",
];

const ESTOQUE_VAZIO = {
  operacao: "entrada",
  quantidade: "",
  observacao: "",
};

function labelOperacaoEstoque(operacao) {
  if (operacao === "entrada") return "Entrada";
  if (operacao === "saida") return "Saída";
  if (operacao === "ajuste") return "Ajuste";
  return operacao;
}

function statusEstoque(estoque) {
  if (estoque <= 0) return { label: "Esgotado", classe: "admin-estoque--zero" };
  if (estoque <= 5) return { label: "Baixo", classe: "admin-estoque--baixo" };
  return { label: "Disponível", classe: "admin-estoque--ok" };
}

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

export default function AdminBrindesPage({ tab, onTabChange, onLogout, admin }) {
  const [brindes, setBrindes] = useState([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingSalvar, setLoadingSalvar] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [estoqueForm, setEstoqueForm] = useState(ESTOQUE_VAZIO);
  const [estoqueMovimentos, setEstoqueMovimentos] = useState([]);
  const [estoqueAtual, setEstoqueAtual] = useState(null);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [pontosManual, setPontosManual] = useState(false);

  const carregar = useCallback(async () => {
    setLoadingLista(true);
    setError("");

    try {
      const [data, cats] = await Promise.all([
        fetchAdmin("/api/admin/brindes"),
        fetchAdmin("/api/admin/brindes/categorias"),
      ]);
      setBrindes(data.brindes || []);
      setCategorias(cats.categorias || []);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingLista(false);
    }
  }, [onLogout]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function handleSair() {
    clearAdminSession();
    onLogout();
  }

  function atualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  function atualizarValor(valor) {
    setForm((prev) => {
      const next = { ...prev, valor };
      if (!pontosManual) {
        const sugerido = sugerirPontosPorValor(valor);
        if (sugerido != null) {
          next.pontos = String(sugerido);
        }
      }
      return next;
    });
  }

  function atualizarPontos(valor) {
    setPontosManual(true);
    atualizarCampo("pontos", valor);
  }

  function limparFormulario() {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setPontosManual(false);
    setEstoqueForm(ESTOQUE_VAZIO);
    setEstoqueMovimentos([]);
    setEstoqueAtual(null);
  }

  async function carregarEstoque(brindeId) {
    const data = await fetchAdmin(`/api/admin/brindes/${brindeId}/estoque`);
    setEstoqueAtual(data.brinde?.estoque ?? 0);
    setEstoqueMovimentos(data.movimentos || []);
  }

  async function iniciarEdicao(brinde) {
    setEditandoId(brinde.id);
    setPontosManual(true);
    setForm({
      nome: brinde.nome || "",
      descricao: brinde.descricao || "",
      imagemUrl: brinde.imagemUrl || "",
      valor: brinde.valor != null ? String(brinde.valor) : "",
      pontos: String(brinde.pontos ?? ""),
      estoque: String(brinde.estoque ?? 0),
      categoria: brinde.categoria || "",
      ativo: brinde.ativo !== false,
    });
    setEstoqueForm(ESTOQUE_VAZIO);
    setError("");
    setSucesso("");

    try {
      await carregarEstoque(brinde.id);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLoadingUpload(true);
    setError("");

    try {
      const data = await uploadAdminImagem(file);
      atualizarCampo("imagemUrl", data.url);
      setSucesso("Imagem enviada com sucesso");
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingUpload(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSucesso("");
    setLoadingSalvar(true);

    const payload = {
      nome: form.nome,
      descricao: form.descricao,
      imagemUrl: form.imagemUrl,
      valor: form.valor,
      pontos: Number(form.pontos),
      categoria: form.categoria.trim(),
      ativo: form.ativo,
    };

    if (!editandoId) {
      payload.estoque = Number(form.estoque) || 0;
    }

    try {
      if (editandoId) {
        await fetchAdmin(`/api/admin/brindes/${editandoId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setSucesso("Brinde atualizado");
      } else {
        await fetchAdmin("/api/admin/brindes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSucesso("Brinde cadastrado");
      }

      limparFormulario();
      dispararAtualizacaoResumoAdmin();
      await carregar();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingSalvar(false);
    }
  }

  async function handleExcluir(id) {
    if (!window.confirm("Excluir este brinde?")) return;

    setError("");
    setSucesso("");

    try {
      await fetchAdmin(`/api/admin/brindes/${id}`, { method: "DELETE" });
      if (editandoId === id) limparFormulario();
      setSucesso("Brinde excluído");
      dispararAtualizacaoResumoAdmin();
      await carregar();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    }
  }

  async function handleMovimentarEstoque(event) {
    event.preventDefault();
    if (!editandoId) return;

    setError("");
    setSucesso("");
    setLoadingEstoque(true);

    try {
      const resultado = await fetchAdmin(`/api/admin/brindes/${editandoId}/estoque`, {
        method: "POST",
        body: JSON.stringify({
          operacao: estoqueForm.operacao,
          quantidade: Number(estoqueForm.quantidade),
          observacao: estoqueForm.observacao.trim(),
        }),
      });

      setSucesso(resultado.message || "Estoque atualizado");
      setEstoqueForm(ESTOQUE_VAZIO);
      setEstoqueAtual(resultado.brinde?.estoque ?? null);
      dispararAtualizacaoResumoAdmin();
      await carregarEstoque(editandoId);
      await carregar();
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoadingEstoque(false);
    }
  }

  const previewUrl = resolveImagemUrl(form.imagemUrl);
  const opcoesCategoria = [
    ...new Set([...CATEGORIAS_SUGESTOES, ...categorias].filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const labelQuantidadeEstoque =
    estoqueForm.operacao === "ajuste" ? "Estoque final" : "Quantidade";

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <AdminProgramaBanner />
      {(error || sucesso) && (
        <div className="admin-feedback">
          {error && (
            <p className="admin-alert" role="alert">
              {error}
            </p>
          )}
          {sucesso && (
            <p className="admin-success" role="status">
              {sucesso}
            </p>
          )}
        </div>
      )}

      <div className="admin-brindes-layout">
        <section className="admin-card admin-brindes-layout__form">
          <div className="admin-card__head">
            <div className="admin-card__head-title">
              <h2>{editandoId ? "Editar brinde" : "Cadastrar brinde"}</h2>
              <AdminAjudaPontosBrindes />
            </div>
            {editandoId && (
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm"
                onClick={limparFormulario}
              >
                Cancelar
              </button>
            )}
          </div>

          <form className="admin-form admin-form--brinde" onSubmit={handleSubmit}>
            <Field label="Nome" id="brinde-nome">
              <input
                id="brinde-nome"
                value={form.nome}
                onChange={(e) => atualizarCampo("nome", e.target.value)}
                placeholder="Ex.: Kit churrasco"
                required
              />
            </Field>

            <Field label="Descrição" id="brinde-desc">
              <textarea
                id="brinde-desc"
                className="admin-textarea"
                rows={3}
                value={form.descricao}
                onChange={(e) => atualizarCampo("descricao", e.target.value)}
                placeholder="Detalhes do brinde para o cliente"
              />
            </Field>

            <div className="admin-form__row">
              <Field label="Valor de referência (R$)" id="brinde-valor">
                <input
                  id="brinde-valor"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => atualizarValor(e.target.value)}
                  placeholder="0,00"
                />
              </Field>
              <Field label="Pontos necessários" id="brinde-pontos">
                <input
                  id="brinde-pontos"
                  type="number"
                  min="1"
                  step="1"
                  value={form.pontos}
                  onChange={(e) => atualizarPontos(e.target.value)}
                  required
                />
                {!pontosManual && form.valor && form.pontos && (
                  <p className="admin-field-hint admin-field-hint--ok">
                    Calculado: valor ÷ {formatarValorReferenciaPonto()} = {form.pontos} pts
                  </p>
                )}
                {pontosManual && form.valor && sugerirPontosPorValor(form.valor) != null && (
                  <p className="admin-field-hint">
                    Sugestão: {sugerirPontosPorValor(form.valor)} pts (
                    {formatarValorReferenciaPonto()}/pt) ·{" "}
                    <button
                      type="button"
                      className="admin-link-btn"
                      onClick={() => {
                        const sugerido = sugerirPontosPorValor(form.valor);
                        if (sugerido != null) {
                          setPontosManual(false);
                          atualizarCampo("pontos", String(sugerido));
                        }
                      }}
                    >
                      Aplicar sugestão
                    </button>
                  </p>
                )}
              </Field>
            </div>

            {!editandoId && (
              <Field label="Estoque inicial" id="brinde-estoque">
                <input
                  id="brinde-estoque"
                  type="number"
                  min="0"
                  step="1"
                  value={form.estoque}
                  onChange={(e) => atualizarCampo("estoque", e.target.value)}
                  required
                />
              </Field>
            )}

            <Field label="Imagem (URL ou upload)" id="brinde-img-url">
              <input
                id="brinde-img-url"
                value={form.imagemUrl}
                onChange={(e) => atualizarCampo("imagemUrl", e.target.value)}
                placeholder="/uploads/brindes/arquivo.jpg ou https://..."
              />
            </Field>

            <Field label="Categoria" id="brinde-categoria">
              <input
                id="brinde-categoria"
                list="brinde-categorias-list"
                value={form.categoria}
                onChange={(e) => atualizarCampo("categoria", e.target.value)}
                placeholder="Ex.: Kit Churrasco, Bazar"
                required
              />
              <datalist id="brinde-categorias-list">
                {opcoesCategoria.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </Field>

            <div className="admin-upload">
              <label className="admin-upload__label">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleUpload}
                  disabled={loadingUpload}
                />
                <span className="admin-btn admin-btn--ghost">
                  {loadingUpload ? "Enviando…" : "Enviar imagem do computador"}
                </span>
              </label>
            </div>

            {previewUrl && (
              <div className="admin-img-preview">
                <img src={previewUrl} alt="Prévia do brinde" />
              </div>
            )}

            <label className="admin-check">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => atualizarCampo("ativo", e.target.checked)}
              />
              Brinde ativo (visível para resgate)
            </label>

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={loadingSalvar}
            >
              {loadingSalvar
                ? "Salvando…"
                : editandoId
                  ? "Salvar alterações"
                  : "Cadastrar brinde"}
            </button>
          </form>

          {editandoId && (
            <div className="admin-estoque-panel">
              <div className="admin-estoque-panel__head">
                <h3>Controle de estoque</h3>
                <span className={`admin-estoque-badge ${statusEstoque(estoqueAtual ?? 0).classe}`}>
                  {estoqueAtual ?? 0} un. · {statusEstoque(estoqueAtual ?? 0).label}
                </span>
              </div>

              <form className="admin-form admin-form--estoque" onSubmit={handleMovimentarEstoque}>
                <div className="admin-form__row admin-form__row--3">
                  <Field label="Operação" id="estoque-op">
                    <select
                      id="estoque-op"
                      className="admin-select"
                      value={estoqueForm.operacao}
                      onChange={(e) =>
                        setEstoqueForm((prev) => ({ ...prev, operacao: e.target.value }))
                      }
                    >
                      <option value="entrada">Entrada (+)</option>
                      <option value="saida">Saída (-)</option>
                      <option value="ajuste">Ajuste (inventário)</option>
                    </select>
                  </Field>
                  <Field label={labelQuantidadeEstoque} id="estoque-qtd">
                    <input
                      id="estoque-qtd"
                      type="number"
                      min={estoqueForm.operacao === "ajuste" ? "0" : "1"}
                      step="1"
                      value={estoqueForm.quantidade}
                      onChange={(e) =>
                        setEstoqueForm((prev) => ({ ...prev, quantidade: e.target.value }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Observação" id="estoque-obs">
                    <input
                      id="estoque-obs"
                      value={estoqueForm.observacao}
                      onChange={(e) =>
                        setEstoqueForm((prev) => ({ ...prev, observacao: e.target.value }))
                      }
                      placeholder="Motivo da movimentação"
                      required
                    />
                  </Field>
                </div>
                <button
                  type="submit"
                  className="admin-btn admin-btn--primary admin-btn--sm"
                  disabled={loadingEstoque}
                >
                  {loadingEstoque ? "Salvando…" : "Registrar movimentação"}
                </button>
              </form>

              {estoqueMovimentos.length > 0 && (
                <ul className="admin-lista admin-lista--estoque">
                  {estoqueMovimentos.map((mov) => (
                    <li key={mov.id} className="admin-lista__item">
                      <div>
                        <strong>{labelOperacaoEstoque(mov.operacao)}</strong>
                        <span>
                          {" "}
                          · {mov.quantidade} un. ({mov.estoqueAntes} → {mov.estoqueDepois})
                        </span>
                      </div>
                      <p>{mov.observacao}</p>
                      <small>
                        {formatarDataHora(mov.criadoEm)} · {mov.adminUsuario}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="admin-card">
          <div className="admin-card__head">
            <h2>Catálogo</h2>
            <span className="admin-badge-count">
              {loadingLista ? "…" : `${brindes.length} cadastrado${brindes.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {loadingLista ? (
            <p className="admin-empty">Carregando…</p>
          ) : brindes.length === 0 ? (
            <p className="admin-empty">Nenhum brinde cadastrado ainda.</p>
          ) : (
            <div className="admin-brinde-grid">
              {brindes.map((brinde) => {
                const img = resolveImagemUrl(brinde.imagemUrl);
                const estoqueInfo = statusEstoque(brinde.estoque ?? 0);
                return (
                  <article
                    key={brinde.id}
                    className={`admin-brinde-card ${!brinde.ativo ? "admin-brinde-card--inativo" : ""} ${brinde.estoque <= 0 ? "admin-brinde-card--esgotado" : ""}`}
                  >
                    <div className="admin-brinde-card__media">
                      {img ? (
                        <img src={img} alt={brinde.nome} />
                      ) : (
                        <span className="admin-brinde-card__sem-img">Sem imagem</span>
                      )}
                    </div>
                    <div className="admin-brinde-card__body">
                      <div className="admin-brinde-card__top">
                        <h3>{brinde.nome}</h3>
                        <div className="admin-brinde-card__badges">
                          <span className={`admin-estoque-badge ${estoqueInfo.classe}`}>
                            {brinde.estoque ?? 0} un.
                          </span>
                          {!brinde.ativo && (
                            <span className="admin-brinde-card__badge">Inativo</span>
                          )}
                        </div>
                      </div>
                      {brinde.descricao && <p>{brinde.descricao}</p>}
                      <ul className="admin-brinde-card__meta">
                        {brinde.categoria && <li>{brinde.categoria}</li>}
                        <li>
                          <strong>{brinde.pontos}</strong> pts
                        </li>
                        {brinde.valor != null && (
                          <li>Ref. {formatarMoeda(brinde.valor)}</li>
                        )}
                      </ul>
                      <small>Atualizado {formatarDataHora(brinde.atualizadoEm)}</small>
                      <div className="admin-brinde-card__actions">
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => iniciarEdicao(brinde)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger admin-btn--sm"
                          onClick={() => handleExcluir(brinde.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <AdminOperacoesRecentes
        onLogout={handleSair}
        titulo="Movimentações recentes (estoque e resgates)"
        abertoInicial={false}
      />
    </AdminLayout>
  );
}

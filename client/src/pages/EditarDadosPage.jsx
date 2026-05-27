import { useCallback, useEffect, useState } from "react";
import Logo from "../components/Logo.jsx";
import Field from "../components/Field.jsx";
import { fetchAutenticado } from "../utils/session.js";
import { formatarCpfCnpj } from "../utils/cpf.js";
import {
  dataNascimentoValida,
  formatarDataNascimento,
  formatarTelefone,
} from "../utils/format.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/auth-mobile.css";
import "../styles/home.css";

function Btn({ loading, children, variant = "primary", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={`home-btn home-btn--${variant === "ghost" ? "ghost" : "primary"}`}
      disabled={loading}
      {...props}
    >
      {loading && <span className="home-loading__spinner" aria-hidden style={{ width: "1.25rem", height: "1.25rem", marginRight: "0.5rem" }} />}
      {children}
    </button>
  );
}

function preencherFormulario(data) {
  const f = data?.formulario || {};
  return {
    nome: f.nome || data?.perfil?.nome || "",
    email: f.email || data?.perfil?.email || "",
    telefone: f.celular || "",
    dataNascimento: f.dataNascimento || data?.perfil?.dataNascimento || "",
    sexo: f.sexo || "",
    estadoCivil: f.estadoCivil || "",
    endereco: f.endereco?.endereco || "",
    cep: f.endereco?.cep || "",
    uf: f.endereco?.uf || "",
    cidade: f.endereco?.cidade || "",
  };
}

export default function EditarDadosPage({ onVoltar, onSalvo }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [cpf, setCpf] = useState("");

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cep, setCep] = useState("");
  const [uf, setUf] = useState("");
  const [cidade, setCidade] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAutenticado("/api/cliente/me");
      const f = preencherFormulario(data);
      setCpf(data?.perfil?.documentoRaw || data?.usuario?.cpf || "");
      setNome(f.nome);
      setEmail(f.email);
      setTelefone(f.telefone ? formatarTelefone(f.telefone) : "");
      setDataNascimento(
        f.dataNascimento.includes("/")
          ? f.dataNascimento
          : formatarDataNascimento(f.dataNascimento)
      );
      setSexo(f.sexo);
      setEstadoCivil(f.estadoCivil);
      setEndereco(f.endereco);
      setCep(f.cep);
      setUf(f.uf);
      setCidade(f.cidade);
    } catch (err) {
      if (err.code === "UNAUTHORIZED") {
        onVoltar?.();
        return;
      }
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }, [onVoltar]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSucesso("");

    if (!dataNascimentoValida(dataNascimento)) {
      setError("Informe uma data de nascimento válida");
      return;
    }

    if (!nome.trim() || nome.trim().length < 2) {
      setError("Informe o nome completo");
      return;
    }

    if (!email.trim()) {
      setError("Informe o e-mail");
      return;
    }

    const telDigits = telefone.replace(/\D/g, "");
    if (telDigits.length < 10) {
      setError("Informe um telefone válido");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        nome: nome.trim(),
        email: email.trim(),
        celular: telDigits,
        dataNascimento,
      };

      if (sexo) payload.sexo = sexo;
      if (estadoCivil) payload.estadoCivil = estadoCivil;

      if (endereco.trim() || cep || uf || cidade) {
        payload.endereco = {
          endereco: endereco.trim(),
          cep: cep.replace(/\D/g, ""),
          uf: uf.trim().toUpperCase().slice(0, 2),
          cidade: cidade ? Number(cidade) : undefined,
        };
      }

      await fetchAutenticado("/api/cliente/me", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setSucesso("Seus dados foram atualizados.");
      setTimeout(() => onSalvo?.(), 1200);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="home-app">
        <div className="home-loading">
          <Logo variant="compact" className="home-loading__logo" />
          <span className="home-loading__spinner" />
          <p>Carregando seus dados…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="home-app">
      <header className="home-header">
        <button type="button" className="home-header__sair" onClick={onVoltar}>
          Voltar
        </button>
        <span className="home-header__tag">Editar dados</span>
        <span style={{ width: "3.5rem" }} aria-hidden />
      </header>

      <main className="home-main" style={{ paddingTop: "1rem" }}>
        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
          style={{ maxWidth: "480px", margin: "0 auto" }}
        >
          <h2 className="auth-form-title">Atualizar cadastro</h2>
          <p className="auth-form-sub">
            Altere apenas os campos que deseja. O CPF não pode ser modificado.
          </p>

          {error && (
            <div className="auth-alert auth-alert--error" role="alert">
              <span className="auth-alert__icon" aria-hidden>!</span>
              <span>{error}</span>
            </div>
          )}

          {sucesso && (
            <div className="auth-alert auth-alert--success" role="status">
              <span>{sucesso}</span>
            </div>
          )}

          <Field label="CPF" id="cpf-editar">
            <input
              id="cpf-editar"
              type="text"
              value={formatarCpfCnpj(cpf)}
              readOnly
              disabled
            />
          </Field>

          <Field label="Nome completo *" id="nome-editar">
            <input
              id="nome-editar"
              type="text"
              autoComplete="name"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              disabled={saving}
              required
            />
          </Field>

          <Field label="E-mail *" id="email-editar">
            <input
              id="email-editar"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              required
            />
          </Field>

          <Field label="Celular / WhatsApp *" id="tel-editar">
            <input
              id="tel-editar"
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
              disabled={saving}
              required
            />
          </Field>

          <Field label="Data de nascimento *" id="nasc-editar">
            <input
              id="nasc-editar"
              type="text"
              inputMode="numeric"
              placeholder="dia/mês/ano"
              value={dataNascimento}
              onChange={(e) =>
                setDataNascimento(formatarDataNascimento(e.target.value))
              }
              disabled={saving}
              required
            />
          </Field>

          <Field label="Sexo" id="sexo-editar">
            <select
              id="sexo-editar"
              className="auth-select"
              value={sexo}
              onChange={(e) => setSexo(e.target.value)}
              disabled={saving}
            >
              <option value="">Prefiro não informar</option>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </Field>

          <Field label="Estado civil" id="ec-editar">
            <select
              id="ec-editar"
              className="auth-select"
              value={estadoCivil}
              onChange={(e) => setEstadoCivil(e.target.value)}
              disabled={saving}
            >
              <option value="">Manter padrão</option>
              <option value="SOLTEIRO">Solteiro(a)</option>
              <option value="CASADO">Casado(a)</option>
              <option value="DIVORCIADO">Divorciado(a)</option>
              <option value="VIUVO">Viúvo(a)</option>
              <option value="OUTROS">Outros</option>
            </select>
          </Field>

          <h3 className="auth-form-title" style={{ fontSize: "1rem", marginTop: "1.25rem" }}>
            Endereço
          </h3>

          <Field label="CEP" id="cep-editar">
            <input
              id="cep-editar"
              type="text"
              inputMode="numeric"
              value={cep}
              onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
              disabled={saving}
            />
          </Field>

          <Field label="Logradouro" id="rua-editar">
            <input
              id="rua-editar"
              type="text"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              disabled={saving}
            />
          </Field>

          <Field label="Cidade (código)" id="cidade-editar">
            <input
              id="cidade-editar"
              type="text"
              inputMode="numeric"
              value={cidade}
              onChange={(e) => setCidade(e.target.value.replace(/\D/g, ""))}
              disabled={saving}
            />
          </Field>

          <Field label="UF" id="uf-editar">
            <input
              id="uf-editar"
              type="text"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              disabled={saving}
            />
          </Field>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.5rem" }}>
            <Btn loading={saving} type="submit">
              {saving ? "Salvando…" : "Salvar alterações"}
            </Btn>
            <Btn variant="ghost" type="button" onClick={onVoltar} disabled={saving}>
              Cancelar
            </Btn>
          </div>
        </form>
      </main>
    </div>
  );
}

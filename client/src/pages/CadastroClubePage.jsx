import { useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import Field from "../components/Field.jsx";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { formatarCpfCnpj } from "../utils/cpf.js";
import {
  dataNascimentoValida,
  formatarDataNascimento,
  formatarTelefone,
} from "../utils/format.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import "../styles/auth-mobile.css";

function Btn({ loading, children, variant = "primary", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={`auth-btn auth-btn--${variant}`}
      disabled={loading}
      {...props}
    >
      {loading && <span className="auth-btn__spinner" aria-hidden />}
      {children}
    </button>
  );
}

export default function CadastroClubePage({ cpf, onVoltar }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

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

    setLoading(true);

    try {
      const payload = {
        cpf: String(cpf).replace(/\D/g, ""),
        celular: telDigits,
        dataNascimento,
        nome: nome.trim(),
        email: email.trim(),
      };

      if (sexo) payload.sexo = sexo;
      if (estadoCivil) payload.estadoCivil = estadoCivil;

      const response = await fetch(apiUrl("/api/auth/cadastro-clube"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const { data } = await parseApiResponse(response);

      if (!response.ok) {
        throw new Error(mensagemParaUsuario(data.error));
      }

      setEnviado(true);
    } catch (err) {
      setError(mensagemParaUsuario(err.message));
    } finally {
      setLoading(false);
    }
  }

  if (enviado) {
    return (
      <AuthShell
        variant="clube"
        badge="Clube Superama"
        title="Cadastro realizado!"
        description="Agora você já pode acessar sua conta."
        onBack={onVoltar}
        backLabel="Login"
        footer={
          <div className="auth-footer__inner">
            <Btn onClick={onVoltar}>Ir para o login</Btn>
          </div>
        }
      >
        <div className="auth-success">
          <div className="auth-success__icon" aria-hidden>
            ✓
          </div>
          <h2>Parabéns{nome ? `, ${nome.split(" ")[0]}` : ""}!</h2>
          <p>
            Seu cadastro no Clube Superama foi concluído com sucesso.
          </p>
          <p className="auth-form-sub" style={{ marginTop: "0.75rem" }}>
            Use seu CPF e crie uma senha de acesso na próxima tela.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      variant="clube"
      badge="Novo membro"
      title="Cadastre-se no clube"
      description="Preencha seus dados para fazer parte do Clube Superama."
      onBack={onVoltar}
      backLabel="Login"
      footer={
        <div className="auth-footer__inner">
          <Btn loading={loading} type="submit" form="form-clube">
            {loading ? "Cadastrando" : "Quero entrar no clube"}
          </Btn>
          <Btn variant="ghost" onClick={onVoltar} disabled={loading}>
            Já tenho cadastro
          </Btn>
        </div>
      }
    >
      <form id="form-clube" onSubmit={handleSubmit} noValidate>
        <h2 className="auth-form-title">Seus dados</h2>
        <p className="auth-form-sub">Campos marcados com * são obrigatórios.</p>

        {error && (
          <div className="auth-alert auth-alert--error" role="alert">
            <span className="auth-alert__icon" aria-hidden>!</span>
            <span>{error}</span>
          </div>
        )}

        <Field label="CPF *" id="cpf-clube">
          <input id="cpf-clube" type="text" value={formatarCpfCnpj(cpf)} readOnly />
        </Field>

        <Field label="Data de nascimento *" id="nascimento">
          <input
            id="nascimento"
            type="text"
            inputMode="numeric"
            placeholder="dia/mês/ano"
            value={dataNascimento}
            onChange={(e) => setDataNascimento(formatarDataNascimento(e.target.value))}
            disabled={loading}
            required
          />
        </Field>

        <Field label="Celular / WhatsApp *" id="tel">
          <input
            id="tel"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(00) 00000-0000"
            value={telefone}
            onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
            disabled={loading}
            required
          />
        </Field>

        <Field label="Nome completo *" id="nome">
          <input
            id="nome"
            type="text"
            autoComplete="name"
            placeholder="Como no documento"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={loading}
            required
          />
        </Field>

        <Field label="E-mail *" id="email">
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
        </Field>

        <Field label="Sexo" id="sexo">
          <select
            id="sexo"
            className="auth-select"
            value={sexo}
            onChange={(e) => setSexo(e.target.value)}
            disabled={loading}
          >
            <option value="">Prefiro não informar</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </Field>

        <Field label="Estado civil" id="estadoCivil">
          <select
            id="estadoCivil"
            className="auth-select"
            value={estadoCivil}
            onChange={(e) => setEstadoCivil(e.target.value)}
            disabled={loading}
          >
            <option value="">Solteiro(a)</option>
            <option value="SOLTEIRO">Solteiro(a)</option>
            <option value="CASADO">Casado(a)</option>
            <option value="DIVORCIADO">Divorciado(a)</option>
            <option value="VIUVO">Viúvo(a)</option>
            <option value="OUTROS">Outros</option>
          </select>
        </Field>
      </form>
    </AuthShell>
  );
}

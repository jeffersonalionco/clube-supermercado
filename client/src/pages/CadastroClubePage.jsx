import { useState } from "react";
import AuthShell from "../components/AuthShell.jsx";
import Field from "../components/Field.jsx";
import { apiUrl, parseApiResponse } from "../utils/api.js";
import { cpfSomenteValido, formatarCpf } from "../utils/cpf.js";
import {
  dataNascimentoValida,
  emailValido,
  formatarDataNascimento,
  formatarTelefone,
  IDADE_MINIMA_CADASTRO,
  LIMITE_EMAIL,
  LIMITE_NOME,
  maiorDeIdadeCadastro,
  nomeValido,
  telefoneValido,
} from "../utils/format.js";
import { mensagemParaUsuario } from "../utils/mensagensUsuario.js";
import AceiteLegal from "../components/AceiteLegal.jsx";
import { useProgramaPublico } from "../hooks/useProgramaPublico.js";
import "../styles/auth-mobile.css";
import "../styles/legal.css";

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

function limparErroCampo(setErros, campo) {
  setErros((prev) => {
    if (!prev[campo]) return prev;
    const next = { ...prev };
    delete next[campo];
    return next;
  });
}

export default function CadastroClubePage({
  cpf,
  onVoltar,
  onCadastroConcluido,
  onAbrirRegulamento,
  onAbrirPrivacidade,
}) {
  const pontosAtivo = useProgramaPublico();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [sexo, setSexo] = useState("");
  const [estadoCivil, setEstadoCivil] = useState("");
  const [aceiteLegal, setAceiteLegal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState(false);

  function validarCampos() {
    const erros = {};

    if (!cpfSomenteValido(cpf)) {
      erros.cpf = "CPF inválido";
    }

    if (!dataNascimentoValida(dataNascimento)) {
      erros.dataNascimento = "Informe uma data válida (DD/MM/AAAA)";
    } else if (!maiorDeIdadeCadastro(dataNascimento)) {
      erros.dataNascimento = `É necessário ter pelo menos ${IDADE_MINIMA_CADASTRO} anos`;
    }

    if (!telefoneValido(telefone)) {
      erros.telefone = "Informe um celular válido com DDD";
    }

    if (!nomeValido(nome)) {
      erros.nome = `Nome completo (apenas letras, 2 a ${LIMITE_NOME} caracteres)`;
    }

    if (!emailValido(email)) {
      erros.email = "Informe um e-mail válido";
    }

    if (!aceiteLegal) {
      erros.aceiteLegal = "Aceite o Regulamento e a Política de Privacidade";
    }

    return erros;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const erros = validarCampos();
    setFieldErrors(erros);

    if (Object.keys(erros).length) {
      const qtd = Object.keys(erros).length;
      setError(
        qtd === 1
          ? "Corrija o campo destacado em vermelho para continuar."
          : `Corrija os ${qtd} campos destacados em vermelho para continuar.`
      );

      const ordem = [
        "cpf",
        "dataNascimento",
        "telefone",
        "nome",
        "email",
        "aceiteLegal",
      ];
      const primeiro = ordem.find((k) => erros[k]);
      if (primeiro && primeiro !== "aceiteLegal") {
        document.getElementById(
          primeiro === "dataNascimento"
            ? "nascimento"
            : primeiro === "telefone"
              ? "tel"
              : primeiro === "cpf"
                ? "cpf-clube"
                : primeiro
        )?.focus?.();
      }
      return;
    }

    setLoading(true);

    try {
      const payload = {
        cpf: String(cpf).replace(/\D/g, ""),
        celular: telefone.replace(/\D/g, ""),
        dataNascimento,
        nome: nome.trim().replace(/\s+/g, " "),
        email: email.trim().toLowerCase(),
        aceiteLegal: true,
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

  function irParaCriarSenha() {
    const digits = String(cpf).replace(/\D/g, "");
    if (onCadastroConcluido) {
      onCadastroConcluido({
        cpf: digits,
        nome: nome.trim().replace(/\s+/g, " "),
      });
      return;
    }
    onVoltar?.();
  }

  if (enviado) {
    return (
      <AuthShell
        variant="clube"
        badge="Clube Superama"
        title="Cadastro realizado!"
        description="Falta só criar sua senha de acesso."
        onBack={onVoltar}
        backLabel="Login"
        footer={
          <div className="auth-footer__inner">
            <div className="auth-callout auth-callout--destaque" role="status">
              <strong>Próximo passo: criar senha</strong>
              <p>
                Você ainda não tem senha. Na próxima tela, digite uma senha nova
                (mínimo 8 caracteres) e entre no clube.
              </p>
            </div>
            <Btn onClick={irParaCriarSenha}>Criar minha senha agora</Btn>
          </div>
        }
      >
        <div className="auth-success">
          <div className="auth-success__icon" aria-hidden>
            ✓
          </div>
          <h2>Parabéns{nome ? `, ${nome.split(" ")[0]}` : ""}!</h2>
          <p>Seu cadastro no Clube Superama+ foi concluído com sucesso.</p>
          <p className="auth-form-sub" style={{ marginTop: "0.75rem" }}>
            CPF: <strong>{formatarCpf(cpf)}</strong>
          </p>
        </div>
      </AuthShell>
    );
  }

  const resumoErro =
    error ||
    (Object.keys(fieldErrors).length
      ? "Corrija os campos destacados em vermelho."
      : "");

  return (
    <AuthShell
      variant="clube"
      badge="Novo membro"
      title="Cadastre-se no clube"
      description={
        pontosAtivo
          ? "Preencha seus dados para fazer parte do Clube Superama."
          : "Cadastre-se e aproveite descontos em produtos selecionados na loja."
      }
      onBack={onVoltar}
      backLabel="Login"
      footer={
        <div className="auth-footer__inner">
          {resumoErro && (
            <div className="auth-alert auth-alert--error auth-alert--footer" role="alert">
              <span className="auth-alert__icon" aria-hidden>
                !
              </span>
              <span>{resumoErro}</span>
            </div>
          )}
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

        <Field label="CPF *" id="cpf-clube" error={fieldErrors.cpf}>
          <input
            id="cpf-clube"
            type="text"
            value={formatarCpf(cpf)}
            readOnly
            aria-invalid={Boolean(fieldErrors.cpf)}
          />
        </Field>

        <Field
          label="Data de nascimento *"
          id="nascimento"
          error={fieldErrors.dataNascimento}
        >
          <input
            id="nascimento"
            type="text"
            inputMode="numeric"
            placeholder="dia/mês/ano"
            value={dataNascimento}
            onChange={(e) => {
              setDataNascimento(formatarDataNascimento(e.target.value));
              limparErroCampo(setFieldErrors, "dataNascimento");
              setError("");
            }}
            disabled={loading}
            required
            aria-invalid={Boolean(fieldErrors.dataNascimento)}
          />
        </Field>

        <Field label="Celular / WhatsApp *" id="tel" error={fieldErrors.telefone}>
          <input
            id="tel"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(00) 00000-0000"
            value={telefone}
            onChange={(e) => {
              setTelefone(formatarTelefone(e.target.value));
              limparErroCampo(setFieldErrors, "telefone");
              setError("");
            }}
            disabled={loading}
            required
            aria-invalid={Boolean(fieldErrors.telefone)}
          />
        </Field>

        <Field label="Nome completo *" id="nome" error={fieldErrors.nome}>
          <input
            id="nome"
            type="text"
            autoComplete="name"
            placeholder="Como no documento"
            value={nome}
            maxLength={LIMITE_NOME}
            onChange={(e) => {
              setNome(e.target.value);
              limparErroCampo(setFieldErrors, "nome");
              setError("");
            }}
            disabled={loading}
            required
            aria-invalid={Boolean(fieldErrors.nome)}
          />
        </Field>

        <Field label="E-mail *" id="email" error={fieldErrors.email}>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            maxLength={LIMITE_EMAIL}
            onChange={(e) => {
              setEmail(e.target.value);
              limparErroCampo(setFieldErrors, "email");
              setError("");
            }}
            disabled={loading}
            required
            aria-invalid={Boolean(fieldErrors.email)}
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

        <AceiteLegal
          checked={aceiteLegal}
          onChange={(v) => {
            setAceiteLegal(v);
            if (v) limparErroCampo(setFieldErrors, "aceiteLegal");
            setError("");
          }}
          onAbrirRegulamento={onAbrirRegulamento}
          onAbrirPrivacidade={onAbrirPrivacidade}
          erro={Boolean(fieldErrors.aceiteLegal)}
        />
        {fieldErrors.aceiteLegal && (
          <small className="auth-field__error auth-field__error--aceite">
            {fieldErrors.aceiteLegal}
          </small>
        )}
      </form>
    </AuthShell>
  );
}

import { normalizarCpfCnpj } from "./apiClient.js";

const ESTADO_CIVIL_VALIDOS = [
  "CASADO",
  "SOLTEIRO",
  "DIVORCIADO",
  "VIUVO",
  "OUTROS",
];

/** Valores fixos do payload que funcionou na API (substituídos só dados do usuário). */
const FIXOS = {
  sexo: process.env.CADASTRO_SEXO_PADRAO || "M",
  tipo: "F",
  tipoCliente: "SM",
  foneComercial: process.env.CADASTRO_FONE_COMERCIAL || "45465468",
  classe: process.env.CADASTRO_CLASSE || "564",
  cnpj: "",
  rg: process.env.CADASTRO_RG || "5654654",
  ie: "",
  orgaoExpRG: process.env.CADASTRO_ORGAO_EXP_RG || "SESPR",
  ufExpRG: process.env.CADASTRO_UF || "PR",
  profissao: "",
  escolaridade: process.env.CADASTRO_ESCOLARIDADE || "SUPERIOR",
  contaContabil: 0,
  contaGerencial: 0,
  contribuinte: process.env.CADASTRO_CONTRIBUINTE || "S",
  unidadeCadastro: process.env.CADASTRO_UNIDADE || "001",
  observacao: process.env.CADASTRO_OBSERVACAO || "Cadastro Clube Superama",
  vendedor: process.env.CADASTRO_VENDEDOR || "1234",
  ramoAtividade: process.env.CADASTRO_RAMO || "GERENTE",
  caracTrib: process.env.CADASTRO_CARAC_TRIB || "AAA",
  endereco: {
    uf: process.env.CADASTRO_UF || "PR",
    cep: process.env.CADASTRO_CEP || "85845001",
    cidade: Number(process.env.CADASTRO_CIDADE || 5),
    endereco: process.env.CADASTRO_ENDERECO || "Rua 2 Exemplo",
    bairro: "",
    numero: "",
    complemento: "",
  },
};

function resolverEstadoCivil(valor) {
  const v = String(valor || "").trim().toUpperCase();
  if (ESTADO_CIVIL_VALIDOS.includes(v)) return v;
  return process.env.CADASTRO_ESTADO_CIVIL || "SOLTEIRO";
}

function apenasDigitos(valor) {
  return String(valor || "").replace(/\D/g, "");
}

export function normalizarDataNascimento(valor) {
  const s = String(valor || "").trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

export function validarDataNascimento(valor) {
  const match = String(valor || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;
  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900) return false;
  return true;
}

function montarEndereco(override) {
  const base = { ...FIXOS.endereco };
  if (!override) return base;

  return {
    uf: (override.uf || base.uf).toUpperCase().slice(0, 2),
    cep: apenasDigitos(override.cep) || base.cep,
    cidade: Number(override.cidade) || base.cidade,
    endereco: override.endereco?.trim() || base.endereco,
    bairro: override.bairro?.trim() ?? base.bairro,
    numero: override.numero?.trim() ?? base.numero,
    complemento: override.complemento?.trim() ?? base.complemento,
  };
}

/**
 * Payload idêntico ao modelo validado na API /v2.0/clientes.
 * Substitui: nome, razaoSocial, cpf, fone, celular, dataNascimento, email, estadoCivil, sexo.
 */
function enderecoApiParaForm(res) {
  if (!res || typeof res !== "object") return null;
  return {
    uf: res.uf || undefined,
    cep: res.cep || undefined,
    cidade: res.cidade != null ? Number(res.cidade) : undefined,
    endereco: res.endereco || res.logradouro || undefined,
    bairro: res.bairro || undefined,
    numero: res.numero || res.num || undefined,
    complemento: res.complemento || undefined,
  };
}

/**
 * Mescla dados do formulário com o cadastro atual da API para PUT /v1.8/clientes/{codigo}.
 */
export function montarPayloadAtualizacao(dadosForm, clienteApi) {
  const base =
    clienteApi && typeof clienteApi === "object" ? clienteApi : {};
  const res = base.dadosResidenciais || base.enderecoResidencial || {};
  const com = base.dadosComerciais || base.enderecoComercial || {};

  const cpf = normalizarCpfCnpj(dadosForm.cpf || base.cnpjCpf || base.cpf);
  const celular =
    apenasDigitos(dadosForm.celular || dadosForm.telefone) ||
    apenasDigitos(base.foneCel || base.celular || res.foneCel || com.foneCel);
  const fone =
    apenasDigitos(dadosForm.fone) ||
    apenasDigitos(res.fone || com.fone) ||
    celular;

  const enderecoForm = dadosForm.endereco || enderecoApiParaForm(res) || {};

  return montarPayloadCadastro({
    cpf,
    nome: dadosForm.nome?.trim() || base.nome || base.razaoSocial,
    razaoSocial: dadosForm.razaoSocial?.trim() || base.razaoSocial || base.nome,
    email: dadosForm.email?.trim() || base.email,
    celular,
    fone,
    dataNascimento: normalizarDataNascimento(
      dadosForm.dataNascimento?.trim() ||
        base.dtNasc ||
        base.dataNascimento
    ),
    sexo: dadosForm.sexo || base.sexo,
    estadoCivil: dadosForm.estadoCivil || base.estadoCivil,
    endereco: enderecoForm,
  });
}

export function montarPayloadCadastro(dados) {
  const cpf = normalizarCpfCnpj(dados.cpf);
  const celular = apenasDigitos(dados.celular || dados.telefone);
  const fone = apenasDigitos(dados.fone) || celular || process.env.CADASTRO_FONE || "5154654";

  if (cpf.length !== 11) {
    throw new Error("CPF inválido");
  }
  if (!celular || celular.length < 10) {
    throw new Error("Informe um telefone/celular válido");
  }
  if (!validarDataNascimento(dados.dataNascimento)) {
    throw new Error("Informe a data de nascimento no formato DD/MM/AAAA");
  }

  const nome = dados.nome?.trim();
  if (!nome || nome.length < 2) {
    throw new Error("Informe o nome completo");
  }

  const endereco = montarEndereco(dados.endereco);

  return {
    nome,
    sexo: dados.sexo || FIXOS.sexo,
    tipo: FIXOS.tipo,
    tipoCliente: FIXOS.tipoCliente,
    fone,
    celular,
    foneComercial: FIXOS.foneComercial,
    classe: FIXOS.classe,
    enderecoResidencial: { ...endereco },
    enderecoComercial: { ...endereco },
    dataNascimento: dados.dataNascimento.trim(),
    cpf,
    cnpj: FIXOS.cnpj,
    rg: FIXOS.rg,
    ie: FIXOS.ie,
    orgaoExpRG: FIXOS.orgaoExpRG,
    ufExpRG: FIXOS.ufExpRG,
    estadoCivil: resolverEstadoCivil(dados.estadoCivil),
    profissao: FIXOS.profissao,
    escolaridade: FIXOS.escolaridade,
    email: dados.email?.trim() || process.env.CADASTRO_EMAIL_PADRAO || "",
    contaContabil: FIXOS.contaContabil,
    contaGerencial: FIXOS.contaGerencial,
    contribuinte: FIXOS.contribuinte,
    unidadeCadastro: FIXOS.unidadeCadastro,
    observacao: FIXOS.observacao,
    vendedor: FIXOS.vendedor,
    ramoAtividade: FIXOS.ramoAtividade,
    caracTrib: FIXOS.caracTrib,
    razaoSocial: dados.razaoSocial?.trim() || nome,
  };
}

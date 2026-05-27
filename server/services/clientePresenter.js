function pick(obj, keys) {
  for (const key of keys) {
    const val = obj?.[key];
    if (val != null && val !== "") return val;
  }
  return null;
}

function formatarDocumento(digits) {
  if (!digits) return "—";
  const s = String(digits).replace(/\D/g, "");
  if (s.length === 11) {
    return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (s.length === 14) {
    return s.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5"
    );
  }
  return s;
}

function montarEndereco(de) {
  if (!de || typeof de !== "object") return null;
  const partes = [
    pick(de, ["endereco", "logradouro", "rua"]),
    pick(de, ["numero", "num"]),
    pick(de, ["bairro"]),
    de.cidade != null && de.cidade !== "" ? `Cidade ${de.cidade}` : null,
    pick(de, ["uf", "estado"]),
    pick(de, ["cep"]),
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : null;
}

/** Normaliza estrutura retornada pela API (campos aninhados). */
export function normalizarClienteApi(cliente) {
  if (!cliente || typeof cliente !== "object") return {};

  const res = cliente.dadosResidenciais || {};
  const com = cliente.dadosComerciais || {};

  return {
    ...cliente,
    cpf: cliente.cnpjCpf || cliente.cpf,
    cnpjCpf: cliente.cnpjCpf,
    dtNasc: cliente.dtNasc,
    dataNascimento: cliente.dtNasc || cliente.dataNascimento,
    tipos: cliente.tipos,
    tipoCliente: cliente.tipos || cliente.tipoCliente,
    foneCel: cliente.foneCel || res.fone || com.foneCel,
    telefone: cliente.foneCel || res.fone || com.foneCel || com.fone,
    email: cliente.email,
    estadoCivil: cliente.estadoCivil,
    escolaridade: cliente.escolaridade,
    sexo: cliente.sexo,
    contribuinte: cliente.contribuinte,
    enderecoTexto:
      montarEndereco(res) || montarEndereco(com) || montarEndereco(cliente),
    dadosResidenciais: res,
    dadosComerciais: com,
  };
}

function estadoCivilParaForm(valor) {
  const v = String(valor || "").trim().toUpperCase();
  if (["CASADO", "SOLTEIRO", "DIVORCIADO", "VIUVO", "OUTROS"].includes(v)) {
    return v;
  }
  return "";
}

/** Campos editáveis pré-preenchidos para o formulário de atualização. */
export function dadosParaFormulario(cliente) {
  const base = normalizarClienteApi(
    cliente && typeof cliente === "object" ? cliente : {}
  );
  const res = base.dadosResidenciais || {};

  const endereco =
    res.uf || res.cep || res.endereco
      ? {
          uf: res.uf || "",
          cep: String(res.cep || "").replace(/\D/g, ""),
          cidade: res.cidade != null ? String(res.cidade) : "",
          endereco: res.endereco || "",
          bairro: res.bairro || "",
          numero: res.numero || "",
          complemento: res.complemento || "",
        }
      : null;

  return {
    nome: base.nome || base.razaoSocial || "",
    email: base.email || "",
    celular: String(base.foneCel || base.telefone || "").replace(/\D/g, ""),
    dataNascimento: (() => {
      const raw = base.dtNasc || base.dataNascimento || "";
      const s = String(raw).trim();
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
      return s;
    })(),
    sexo: base.sexo === "M" || base.sexo === "F" ? base.sexo : "",
    estadoCivil: estadoCivilParaForm(base.estadoCivil),
    endereco,
  };
}

export function apresentarCliente({ usuario, cliente, raw }) {
  const base = normalizarClienteApi(
    cliente && typeof cliente === "object" ? cliente : {}
  );

  const nome =
    pick(base, ["nome", "razaoSocial", "razao_social"]) || usuario.nome || "Cliente";

  const docRaw =
    base.cnpjCpf || base.cpf || usuario.cpf;

  const perfil = {
    nome,
    documento: formatarDocumento(docRaw),
    documentoRaw: String(docRaw || "").replace(/\D/g, "") || usuario.cpf,
    codigoCliente:
      usuario.cliente_codigo != null
        ? String(usuario.cliente_codigo)
        : pick(base, ["codigo", "codigo_cliente", "id"]),
    email: base.email,
    telefone: base.foneCel || base.telefone,
    endereco: base.enderecoTexto,
    dataNascimento: base.dtNasc || base.dataNascimento,
    situacao: pick(base, ["situacao", "status"]),
    categoria: "Clube Superama",
    sexo:
      base.sexo === "M"
        ? "Masculino"
        : base.sexo === "F"
          ? "Feminino"
          : null,
    estadoCivil:
      base.estadoCivil === "SOLTEIRO"
        ? "Solteiro(a)"
        : base.estadoCivil === "CASADO"
          ? "Casado(a)"
          : base.estadoCivil === "DIVORCIADO"
            ? "Divorciado(a)"
            : base.estadoCivil === "VIUVO"
              ? "Viúvo(a)"
              : base.estadoCivil === "OUTROS"
                ? "Outros"
                : base.estadoCivil,
    membroDesde: usuario.criado_em,
  };

  return {
    perfil,
    formulario: dadosParaFormulario(cliente),
    detalhes: [],
    clube: {
      nivel: "Clube Superama",
      pontos: "—",
      statusClube: "ativo",
    },
  };
}

export { formatarDocumento };

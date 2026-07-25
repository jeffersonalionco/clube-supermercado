export function dadosLojaComprovante() {
  return {
    razaoSocial: process.env.LOJA_RAZAO_SOCIAL || "Superama",
    nomeFantasia: process.env.LOJA_NOME_FANTASIA || "Clube Superama+",
    cnpj: process.env.LOJA_CNPJ || "00.289.167/0001-14",
    endereco: process.env.LOJA_ENDERECO || "",
    cidade: process.env.LOJA_CIDADE || "",
    uf: process.env.LOJA_UF || "PR",
    telefone: process.env.LOJA_TELEFONE || "",
  };
}

function arredondarMoeda(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

function centavosDeMoeda(valor) {
  return Math.round(arredondarMoeda(valor) * 100);
}

/** Parseia registro VIT* (item vendido) — valores em centésimos / milésimos. */
export function parseVitn(registro) {
  const partes = String(registro ?? "").split("|");
  const precoUnit = (Number(partes[2]) || 0) / 100;
  const quantidade = (Number(partes[3]) || 0) / 1000;
  const valorTotal = (Number(partes[4]) || 0) / 100;
  const codigoInterno = String(partes[10] ?? "").trim();

  return {
    codigoBarras: String(partes[0] ?? "").trim(),
    descricao: String(partes[1] ?? "").trim(),
    precoUnit,
    quantidade,
    valorTotal,
    codigoInterno,
    oferta: String(partes[8] ?? "").toUpperCase() === "S",
  };
}

/** Parseia registro DSTN (desconto aplicado no cupom). */
export function parseDstn(registro) {
  const partes = String(registro ?? "").split("|");
  return {
    valorDesconto: arredondarMoeda((Number(partes[0]) || 0) / 100),
    referenciaCentavos: Number(partes[1]) || 0,
  };
}

export function isTipoDesconto(tipo) {
  return String(tipo ?? "").toUpperCase() === "DSTN";
}

export function descontosDasLinhas(linhas) {
  return (linhas || [])
    .filter((linha) => isTipoDesconto(linha.tvd_tipo_reg))
    .map((linha) => parseDstn(linha.tvd_registro))
    .filter((desconto) => desconto.valorDesconto > 0);
}

/**
 * Associa DSTN aos itens (referência = total do item em centavos) ou ao cupom inteiro.
 */
export function aplicarDescontosDstn(produtos, descontos) {
  const lista = (produtos || []).map((produto) => {
    const valorBruto = arredondarMoeda(produto.valorTotal);
    return {
      ...produto,
      valorBruto,
      valorDesconto: 0,
      valorLiquido: valorBruto,
    };
  });

  const subtotalItens = arredondarMoeda(
    lista.reduce((acc, item) => acc + item.valorBruto, 0)
  );
  const subtotalCentavos = centavosDeMoeda(subtotalItens);
  const descontosCupom = [];

  for (const desconto of descontos || []) {
    const indiceItem = lista.findIndex(
      (item) =>
        item.valorDesconto <= 0 &&
        centavosDeMoeda(item.valorBruto) === desconto.referenciaCentavos
    );

    if (indiceItem >= 0) {
      const item = lista[indiceItem];
      item.valorDesconto = desconto.valorDesconto;
      item.valorLiquido = arredondarMoeda(item.valorBruto - desconto.valorDesconto);
      continue;
    }

    if (desconto.referenciaCentavos === subtotalCentavos) {
      descontosCupom.push(desconto);
      continue;
    }

    descontosCupom.push(desconto);
  }

  const totalDescontoItens = arredondarMoeda(
    lista.reduce((acc, item) => acc + item.valorDesconto, 0)
  );
  const totalDescontoCupom = arredondarMoeda(
    descontosCupom.reduce((acc, item) => acc + item.valorDesconto, 0)
  );
  const totalDesconto = arredondarMoeda(totalDescontoItens + totalDescontoCupom);
  const totalLiquido = arredondarMoeda(subtotalItens - totalDesconto);

  return {
    produtos: lista,
    subtotalItens,
    totalDesconto,
    totalDescontoItens,
    totalDescontoCupom,
    totalLiquido,
    descontosCupom,
  };
}

/** Parseia registro FIN* (finalizadora / pagamento). */
export function parseFinn(registro) {
  const partes = String(registro ?? "").split("|");
  return {
    valor: (Number(partes[2]) || 0) / 100,
    forma:
      [partes[5], partes[6]]
        .map((parte) => String(parte ?? "").trim())
        .find(Boolean) || null,
    cpf: String(partes[15] ?? "").replace(/\D/g, "") || null,
    codigoCliente: String(partes[39] ?? "").trim() || null,
    nomeCliente: String(partes[40] ?? "").trim() || null,
  };
}

export function isTipoItem(tipo) {
  return /^VIT/i.test(String(tipo ?? ""));
}

export function isTipoPagamento(tipo) {
  return /^FIN/i.test(String(tipo ?? ""));
}

export function isFormaConvenio(forma) {
  const texto = String(forma ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return texto.includes("convenio");
}

/** Lista pagamentos FIN* de linhas da tab_venda. */
export function pagamentosDasLinhas(linhas) {
  return (linhas || [])
    .filter((linha) => isTipoPagamento(linha.tvd_tipo_reg))
    .map((linha) => ({
      ...parseFinn(linha.tvd_registro),
      tipoReg: linha.tvd_tipo_reg,
    }));
}

export function cupomTemConvenioNasLinhas(linhas) {
  return pagamentosDasLinhas(linhas).some((pag) => isFormaConvenio(pag.forma));
}

/** Chave interna `pdv-cupom` ou cupom legado sem PDV. */
export function parseChaveCupom(chave) {
  const texto = String(chave ?? "").trim();
  const separador = texto.indexOf("-");
  if (separador > 0) {
    return {
      pdv: texto.slice(0, separador),
      cupom: texto.slice(separador + 1),
    };
  }
  return { pdv: null, cupom: texto };
}

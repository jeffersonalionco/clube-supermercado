let aviso = "";

export function publicarAvisoPermissao(texto) {
  aviso = texto || "";
}

export function avisoPermissaoAtual() {
  return aviso;
}

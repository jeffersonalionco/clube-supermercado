export {
  MODULOS,
  menuLiberado,
  primeiroMenu,
  subLiberado,
} from "../../../shared/permissoesAdmin.js";

export function acessoDaSessao(admin) {
  if (admin?.acessoTotal === false) {
    return {
      acessoTotal: false,
      ferramentas: Array.isArray(admin.ferramentas) ? admin.ferramentas : [],
    };
  }
  return { acessoTotal: true, ferramentas: null };
}

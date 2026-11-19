import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { CATEGORIAS_ENCARTE, FORMATOS_ENCARTE, LIMITE_FORMATOS_ENCARTE } from "../../../../shared/modelosEncarte.js";
import EncarteSelecaoFormatos from "./EncarteSelecaoFormatos.jsx";
import { PreviaEncarte } from "./EncarteFolha.jsx";

const AMOSTRA = [
  ["Café torrado e moído", 19.9, "clube"],
  ["Arroz tipo 1", 14.99, "loja"],
  ["Leite integral", 4.79, "normal"],
  ["Azeite de oliva", 29.9, "loja"],
  ["Macarrão espaguete", 3.49, "clube"],
  ["Biscoito amanteigado", 5.99, "normal"],
  ["Farinha de trigo", 4.99, "loja"],
  ["Feijão carioca", 6.99, "normal"],
].map(([descricao, preco, tipo], indice) => ({ codigo: indice, descricao, preco, tipo, unidadeMedida: "un" }));

const NOMES_FORMATOS = new Map(FORMATOS_ENCARTE.map(({ id, nome }) => [id, nome]));
const AMOSTRA_HORTIFRUTI = [
  ["Banana-prata", 4.99], ["Tomate", 5.99], ["Batata", 3.49],
  ["Maçã", 7.99], ["Cenoura", 3.99], ["Laranja-pera", 2.99],
].map(([descricao, preco], indice) => ({ codigo: indice, descricao, preco, tipo: "loja", unidadeMedida: "kg" }));
const AMOSTRA_LIMPEZA = [
  ["Sabão em pó 800 g", 9.99], ["Detergente líquido 500 ml", 1.99], ["Amaciante 2 L", 7.99],
  ["Água sanitária 1 L", 3.49], ["Desinfetante 2 L", 5.99], ["Limpador multiuso 500 ml", 3.99],
].map(([descricao, preco], indice) => ({ codigo: indice, descricao, preco, tipo: "loja", unidadeMedida: "un" }));

function normalizarBusca(valor) {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function MiniaturaModelo({ modelo }) {
  const amostra = ({ hortifruti: AMOSTRA_HORTIFRUTI, limpeza: AMOSTRA_LIMPEZA })[modelo.tema] ?? AMOSTRA;
  const itens = amostra.slice(0, modelo.colunas * modelo.linhas).map((item) => modelo.permitePrecoAnterior
    ? { ...item, precoAnterior: item.tipo === "normal" ? null : item.preco + 4 }
    : item);
  return (
    <div className={`encarte-modelo-vitrine encarte-modelo-vitrine--${modelo.id}`} aria-hidden="true">
      <div className="encarte-modelo-arte">
        <PreviaEncarte dados={{ modelo: modelo.id, titulo: modelo.nome, itens }}
          itens={itens} />
      </div>
    </div>
  );
}

function CartaoModelo({ modelo, nome, onAbrir }) {
  return (
    <button type="button" className="encarte-modelo"
      aria-label={`Criar ${modelo.nome} para ${NOMES_FORMATOS.get(modelo.canal)}`} onClick={onAbrir}>
      <MiniaturaModelo modelo={modelo} />
      <div className="encarte-modelo-info">
        <div>
          <strong>{nome}</strong>
          <span>{modelo.formato}</span>
          <small>{modelo.canal === "a4"
            ? `${modelo.larguraMm} × ${modelo.alturaMm} mm · ${modelo.colunas * modelo.linhas} etiquetas por folha`
            : `${modelo.largura * 2} × ${modelo.altura * 2} px`}</small>
        </div>
        <ArrowRight size={20} aria-hidden="true" />
      </div>
    </button>
  );
}

export default function EncarteGaleria({ escolher }) {
  const [categoriaAtiva, setCategoria] = useState("");
  const [canalAtivo, setCanal] = useState("");
  const [busca, setBusca] = useState("");
  const consulta = normalizarBusca(busca);

  const categoriasFiltradas = CATEGORIAS_ENCARTE
    .filter((categoria) => !categoriaAtiva || categoria.id === categoriaAtiva)
    .map((categoria) => ({
      ...categoria,
      grupos: categoria.grupos
        .filter((grupo) => normalizarBusca(`${grupo.nome} ${categoria.nome}`).includes(consulta))
        .map((grupo) => ({
          ...grupo,
          opcoes: grupo.versoes,
          versoes: grupo.versoes.filter((versao) => !canalAtivo || versao.canal === canalAtivo),
        }))
        .filter((grupo) => grupo.versoes.length),
    }))
    .filter((categoria) => categoria.grupos.length);

  return (
    <section className="encarte-galeria-secao" aria-label="Galeria de modelos">
      <div className="encarte-galeria-filtros">
        <label className="encarte-campo">
          Buscar modelo
          <span className="encarte-busca">
            <Search size={17} aria-hidden="true" />
            <input type="search" placeholder="Nome do modelo" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
          </span>
        </label>
        <label className="encarte-campo">
          Categoria
          <select value={categoriaAtiva} onChange={(evento) => setCategoria(evento.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_ENCARTE.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </label>
        <label className="encarte-campo">
          Formato
          <select value={canalAtivo} onChange={(evento) => setCanal(evento.target.value)}>
            <option value="">Todos os formatos</option>
            {FORMATOS_ENCARTE.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </label>
      </div>
      {categoriasFiltradas.length === 0 && <p role="status">Nenhum modelo encontrado para esses filtros.</p>}
      {categoriasFiltradas.map((categoria) => (
        <section key={categoria.id} className="encarte-galeria-secao" aria-labelledby={`encarte-categoria-${categoria.id}`}>
          <h2 id={`encarte-categoria-${categoria.id}`}>{categoria.nome}</h2>
          <div className="encarte-galeria">
            {categoria.grupos.map((grupo) => {
              const [primeira] = grupo.versoes;
              if (grupo.opcoes.length === 1) {
                return <CartaoModelo key={grupo.id} modelo={primeira} nome={grupo.nome}
                  onAbrir={() => escolher(primeira)} />;
              }

              const titulo = `encarte-grupo-${categoria.id}-${grupo.id}`;
              return (
                <section className="encarte-modelo-agrupado" key={grupo.id} aria-labelledby={titulo}>
                  <div className="encarte-grupo-cabecalho">
                    <h3 id={titulo}>{grupo.nome}</h3>
                    <EncarteSelecaoFormatos titulo="Criar em vários formatos" modelo={grupo.nome}
                      opcoes={grupo.opcoes} selecionados={grupo.opcoes.slice(0, LIMITE_FORMATOS_ENCARTE).map(({ id }) => id)}
                      onChange={(selecionados) => escolher(
                        grupo.opcoes.find(({ id }) => id === selecionados[0]), selecionados
                      )} />
                  </div>
                  <div className="encarte-galeria">
                    {grupo.versoes.map((versao) => (
                      <CartaoModelo key={versao.id} modelo={versao} nome={NOMES_FORMATOS.get(versao.canal)}
                        onAbrir={() => escolher(versao)} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      ))}
    </section>
  );
}

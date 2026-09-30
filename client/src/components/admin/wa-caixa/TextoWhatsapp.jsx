import { parseTextoWhatsapp } from "./formatarTextoWhatsapp.js";

function destacar(valor, busca) {
  const q = String(busca || "").trim();
  if (!q) return valor;
  const indice = valor.toLowerCase().indexOf(q.toLowerCase());
  if (indice < 0) return valor;
  return (
    <>
      {valor.slice(0, indice)}
      <mark>{valor.slice(indice, indice + q.length)}</mark>
      {valor.slice(indice + q.length)}
    </>
  );
}

function Nos({ nodes, busca, onTelefone, foneLoja }) {
  return nodes.map((node, indice) => {
    if (node.kind === "text") return <span key={indice}>{destacar(node.value, busca)}</span>;
    if (node.kind === "bold") {
      return (
        <strong key={indice}>
          <Nos nodes={node.children} busca={busca} onTelefone={onTelefone} foneLoja={foneLoja} />
        </strong>
      );
    }
    if (node.kind === "italic") {
      return (
        <em key={indice}>
          <Nos nodes={node.children} busca={busca} onTelefone={onTelefone} foneLoja={foneLoja} />
        </em>
      );
    }
    if (node.kind === "strike") {
      return (
        <s key={indice}>
          <Nos nodes={node.children} busca={busca} onTelefone={onTelefone} foneLoja={foneLoja} />
        </s>
      );
    }
    if (node.kind === "code") return <code key={indice}>{node.value}</code>;
    if (node.kind === "link") {
      return (
        <a key={indice} href={node.href} target="_blank" rel="noopener noreferrer">
          {node.value}
        </a>
      );
    }
    if (node.kind === "phone") {
      return (
        <button
          key={indice}
          type="button"
          className={`wa-caixa__fone${foneLoja ? " wa-caixa__fone--loja" : ""}`}
          onClick={() => onTelefone?.(node.telefone)}
        >
          {foneLoja ? "☎ " : ""}
          {node.value}
        </button>
      );
    }
    return null;
  });
}

export default function TextoWhatsapp({ texto, busca, onTelefone, foneLoja = false }) {
  const nodes = parseTextoWhatsapp(texto);
  if (!nodes.length) return null;
  return (
    <div className="wa-caixa__texto">
      <Nos nodes={nodes} busca={busca} onTelefone={onTelefone} foneLoja={foneLoja} />
    </div>
  );
}

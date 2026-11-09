import { MODULOS } from "../../admin/acessoAdmin.js";

export default function SeletorPermissoes({
  acessoTotal,
  ferramentas,
  onChange,
  idPrefix = "perm",
}) {
  function marcarTotal(marcado) {
    onChange({
      acessoTotal: marcado,
      ferramentas: marcado ? [] : ferramentas,
    });
  }

  function alternar(id) {
    const conjunto = new Set(ferramentas);
    if (conjunto.has(id)) conjunto.delete(id);
    else conjunto.add(id);
    onChange({ acessoTotal: false, ferramentas: [...conjunto] });
  }

  function alternarModulo(ids) {
    const todas = ids.every((id) => ferramentas.includes(id));
    const conjunto = new Set(ferramentas);
    ids.forEach((id) => {
      if (todas) conjunto.delete(id);
      else conjunto.add(id);
    });
    onChange({ acessoTotal: false, ferramentas: [...conjunto] });
  }

  const totalMarcadas = acessoTotal ? null : ferramentas.length;

  return (
    <div className="admin-acesso">
      <div className="admin-acesso__modos" role="radiogroup" aria-label="Tipo de acesso">
        <button
          type="button"
          role="radio"
          aria-checked={acessoTotal}
          className={`admin-acesso__modo ${acessoTotal ? "is-on" : ""}`}
          onClick={() => marcarTotal(true)}
        >
          <strong>Acesso completo</strong>
          <span>Vê e usa todas as ferramentas do painel.</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!acessoTotal}
          className={`admin-acesso__modo ${acessoTotal ? "" : "is-on"}`}
          onClick={() => marcarTotal(false)}
        >
          <strong>Acesso personalizado</strong>
          <span>Escolha os módulos e as ferramentas.</span>
        </button>
      </div>

      {acessoTotal ? (
        <p className="admin-acesso__nota">
          Esta pessoa entra com o painel inteiro, como os administradores que já existiam.
        </p>
      ) : (
        <>
          <p className="admin-acesso__nota">
            {totalMarcadas
              ? `${totalMarcadas} ferramenta${totalMarcadas === 1 ? "" : "s"} marcada${totalMarcadas === 1 ? "" : "s"}. O menu mostra um módulo quando ao menos uma ferramenta dele está marcada.`
              : "Nenhuma ferramenta marcada: a pessoa entra só no Manual."}
          </p>
          <div className="admin-acesso__grade">
            {MODULOS.map((modulo) => {
              const ids = modulo.ferramentas.map((item) => item.id);
              const marcadas = ids.filter((id) => ferramentas.includes(id)).length;
              const completo = marcadas === ids.length;
              return (
                <section
                  key={modulo.id}
                  className={`admin-acesso__card ${marcadas ? "admin-acesso__card--ativa" : ""}`}
                >
                  <header>
                    <strong>{modulo.label}</strong>
                    <button type="button" onClick={() => alternarModulo(ids)}>
                      {completo ? "Limpar" : "Marcar todas"}
                    </button>
                  </header>
                  <ul>
                    {modulo.ferramentas.map((ferramenta) => {
                      const marcado = ferramentas.includes(ferramenta.id);
                      return (
                        <li key={ferramenta.id}>
                          <label
                            className={marcado ? "is-on" : ""}
                            htmlFor={`${idPrefix}-${ferramenta.id}`}
                          >
                            <input
                              id={`${idPrefix}-${ferramenta.id}`}
                              type="checkbox"
                              checked={marcado}
                              onChange={() => alternar(ferramenta.id)}
                            />
                            <span>{ferramenta.label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <footer>
                    {marcadas} de {ids.length}
                  </footer>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

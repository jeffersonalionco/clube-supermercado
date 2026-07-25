import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  REAIS_POR_PONTO,
  VALOR_REFERENCIA_PONTO,
} from "../../utils/pontosReferencia.js";

const TABELA_RESULTADOS = [
  { gasto: "R$ 50", pontos: "1 ponto", valor: "R$ 0,50" },
  { gasto: "R$ 100", pontos: "2 pontos", valor: "R$ 1,00" },
  { gasto: "R$ 500", pontos: "10 pontos", valor: "R$ 5,00" },
  { gasto: "R$ 1.000", pontos: "20 pontos", valor: "R$ 10,00" },
  { gasto: "R$ 3.000", pontos: "60 pontos", valor: "R$ 30,00" },
];

export default function AdminAjudaPontosBrindes() {
  const [aberto, setAberto] = useState(false);
  const tituloId = useId();
  const botaoRef = useRef(null);
  const painelRef = useRef(null);

  const fechar = useCallback(() => {
    setAberto(false);
    botaoRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!aberto) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") fechar();
    }

    document.addEventListener("keydown", onKeyDown);
    painelRef.current?.focus();

    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = anterior;
    };
  }, [aberto, fechar]);

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        className="admin-ajuda-btn"
        onClick={() => setAberto(true)}
        aria-label="Como calcular pontos e valor dos brindes"
        title="Como calcular pontos e valor dos brindes"
      >
        <span className="admin-ajuda-btn__icon" aria-hidden="true">
          ?
        </span>
        <span className="admin-ajuda-btn__text">Ajuda</span>
      </button>

      {aberto && (
        <div
          className="admin-ajuda-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) fechar();
          }}
        >
          <div
            ref={painelRef}
            className="admin-ajuda-painel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            tabIndex={-1}
          >
            <header className="admin-ajuda-painel__head">
              <h3 id={tituloId}>Como calcular pontos e valor dos brindes</h3>
              <button
                type="button"
                className="admin-ajuda-painel__fechar"
                onClick={fechar}
                aria-label="Fechar ajuda"
              >
                ×
              </button>
            </header>

            <div className="admin-ajuda-painel__body">
              <section>
                <h4>Regras do programa (referência atual)</h4>
                <ul className="admin-ajuda-lista">
                  <li>
                    <strong>Pontuação:</strong> 1 ponto a cada R$ {REAIS_POR_PONTO} em compras
                    elegíveis
                  </li>
                  <li>
                    <strong>Valor de cada ponto:</strong> R$ 0,50 — equivalente a 1% de R${" "}
                    {REAIS_POR_PONTO}
                  </li>
                </ul>
              </section>

              <section>
                <h4>Cálculo (exemplo com R$ 100)</h4>
                <ol className="admin-ajuda-passos">
                  <li>
                    <strong>Pontos gerados</strong>
                    <p>
                      R$ 100 ÷ R$ {REAIS_POR_PONTO} = 2 pontos
                    </p>
                  </li>
                  <li>
                    <strong>Valor de referência em brindes</strong>
                    <p>
                      2 × R$ {VALOR_REFERENCIA_PONTO.toFixed(2).replace(".", ",")} = R$ 1,00
                    </p>
                  </li>
                  <li>
                    <strong>Valor unitário do ponto</strong>
                    <p>
                      R$ {VALOR_REFERENCIA_PONTO.toFixed(2).replace(".", ",")} por ponto (fixo)
                    </p>
                  </li>
                </ol>
              </section>

              <section>
                <h4>Resultado</h4>
                <div className="admin-ajuda-tabela-wrap">
                  <table className="admin-ajuda-tabela">
                    <thead>
                      <tr>
                        <th>Gasto</th>
                        <th>Pontos</th>
                        <th>Valor de referência em brindes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TABELA_RESULTADOS.map((linha) => (
                        <tr key={linha.gasto}>
                          <td>{linha.gasto}</td>
                          <td>{linha.pontos}</td>
                          <td>{linha.valor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <p className="admin-ajuda-nota">
                Por enquanto, use <strong>R$ 0,50</strong> como valor de referência de cada ponto.
                Em uma compra de <strong>R$ 100</strong>, o cliente acumula 2 pontos, com valor de
                referência total de <strong>R$ 1,00</strong> em benefícios (1% do valor da compra).
              </p>

              <p className="admin-ajuda-dica">
                <strong>Dica:</strong> ao cadastrar um brinde, divida o custo de referência pelo
                valor do ponto (R$ 0,50) para definir quantos pontos o cliente precisa para
                resgatar.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

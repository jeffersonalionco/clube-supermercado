import AdminLayout from "../../components/admin/AdminLayout.jsx";
import {
  REAIS_POR_PONTO,
  VALOR_REFERENCIA_PONTO,
} from "../../utils/pontosReferencia.js";
import { formatarMoeda } from "../../utils/moeda.js";

const MESES_VALIDADE_PONTOS = 12;

const SUMARIO = [
  { id: "visao", label: "Visão geral" },
  { id: "participacao", label: "Quem participa" },
  { id: "pontuacao", label: "Como pontua" },
  { id: "nao-pontua", label: "O que não pontua" },
  { id: "acumulo", label: "Acúmulo e saldo pendente" },
  { id: "validade", label: "Validade e expiração" },
  { id: "sincronizacao", label: "Sincronização com o caixa" },
  { id: "resgate", label: "Resgate de prêmios" },
  { id: "brindes", label: "Cadastro de brindes" },
  { id: "areas", label: "Áreas do painel" },
  { id: "atendimento", label: "Dicas de atendimento" },
];

const EXEMPLOS_PONTOS = [
  { gasto: 50, pontos: 1 },
  { gasto: 100, pontos: 2 },
  { gasto: 250, pontos: 5 },
  { gasto: 500, pontos: 10 },
  { gasto: 1000, pontos: 20 },
];

function formatarValorPonto() {
  return formatarMoeda(VALOR_REFERENCIA_PONTO);
}

function Secao({ id, titulo, children }) {
  return (
    <section id={id} className="admin-manual-secao">
      <h2>{titulo}</h2>
      {children}
    </section>
  );
}

export default function AdminManualPage({ tab, onTabChange, onLogout, admin }) {
  function handleSair() {
    onLogout();
  }

  return (
    <AdminLayout tab={tab} onTabChange={onTabChange} onLogout={handleSair} admin={admin}>
      <div className="admin-manual">
        <header className="admin-manual-hero">
          <p className="admin-section-label">Referência para a equipe</p>
          <h2 className="admin-manual-hero__title">Manual do programa de pontos</h2>
          <p className="admin-manual-hero__sub">
            Regras aplicadas automaticamente pela plataforma — pontuação, validade, resgates e
            exceções. Use este guia no dia a dia do caixa e do painel administrativo.
          </p>
          <div className="admin-manual-hero__chips">
            <span className="admin-manual-chip">
              1 pt a cada {formatarMoeda(REAIS_POR_PONTO)}
            </span>
            <span className="admin-manual-chip">
              Valor de referência: {formatarValorPonto()}/pt
            </span>
            <span className="admin-manual-chip">
              Validade: {MESES_VALIDADE_PONTOS} meses
            </span>
          </div>
        </header>

        <div className="admin-manual-layout">
          <nav className="admin-manual-nav" aria-label="Sumário do manual">
            <p className="admin-manual-nav__titulo">Neste manual</p>
            <ol>
              {SUMARIO.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.label}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="admin-manual-conteudo">
            <Secao id="visao" titulo="Visão geral">
              <p>
                O <strong>Clube Superama+</strong> premia compras identificadas com CPF no caixa
                (WR PDV). O cliente acumula pontos e troca por brindes cadastrados no painel. O
                sistema lê as vendas reais do PDV, aplica as regras de elegibilidade e mantém o
                saldo atualizado.
              </p>
              <div className="admin-manual-callout admin-manual-callout--info">
                <strong>Importante:</strong> o que o cliente vê no app (saldo, compras, histórico)
                reflete o que está no banco após a última sincronização com o caixa.
              </div>
            </Secao>

            <Secao id="participacao" titulo="Quem participa">
              <ul className="admin-manual-lista">
                <li>
                  <strong>CPF obrigatório</strong> — login e cadastro aceitam somente CPF (11
                  dígitos), não CNPJ.
                </li>
                <li>
                  <strong>Cadastro no clube</strong> — o cliente precisa estar no cadastro da loja
                  (API/ERP). Quem ainda não está pode se cadastrar pelo fluxo “entrar no clube”.
                </li>
                <li>
                  <strong>Conta na plataforma</strong> — após o cadastro no clube, o cliente cria
                  senha e aceita regulamento e privacidade no primeiro acesso.
                </li>
                <li>
                  <strong>CPF no cupom</strong> — a compra só entra no programa se o CPF foi
                  informado no caixa (registro FINN do WR PDV).
                </li>
              </ul>
            </Secao>

            <Secao id="pontuacao" titulo="Como os pontos são gerados">
              <p>
                A regra é: <strong>1 ponto a cada {formatarMoeda(REAIS_POR_PONTO)}</strong> em
                compras elegíveis. O cálculo usa o valor total do cupom e é feito de forma
                cronológica — várias compras menores se somam até completar R$ 50.
              </p>
              <div className="admin-manual-tabela-wrap">
                <table className="admin-manual-tabela">
                  <thead>
                    <tr>
                      <th>Compra elegível</th>
                      <th>Pontos gerados</th>
                      <th>Valor de referência em brindes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EXEMPLOS_PONTOS.map((ex) => (
                      <tr key={ex.gasto}>
                        <td>{formatarMoeda(ex.gasto)}</td>
                        <td>{ex.pontos}</td>
                        <td>
                          {formatarMoeda(ex.pontos * VALOR_REFERENCIA_PONTO)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="admin-manual-nota">
                O <strong>valor de referência de cada ponto</strong> para brindes é{" "}
                {formatarValorPonto()} — equivalente a 1% do gasto necessário para gerar 1 ponto
                (1% de {formatarMoeda(REAIS_POR_PONTO)}).
              </p>
            </Secao>

            <Secao id="nao-pontua" titulo="O que não pontua">
              <div className="admin-manual-cards">
                <article className="admin-manual-card admin-manual-card--alerta">
                  <h3>Convênio</h3>
                  <p>
                    Cupons pagos com convênio aparecem no histórico do cliente, mas{" "}
                    <strong>não geram pontos</strong>. O sistema marca esses cupons como
                    inelegíveis.
                  </p>
                </article>
                <article className="admin-manual-card admin-manual-card--alerta">
                  <h3>Cupom cancelado</h3>
                  <p>
                    Vendas canceladas no PDV não pontuam. Se o cupom já tinha gerado pontos, o
                    sistema <strong>estorna</strong> o impacto no saldo ao sincronizar.
                  </p>
                </article>
                <article className="admin-manual-card admin-manual-card--alerta">
                  <h3>Antes do cadastro na plataforma</h3>
                  <p>
                    Só contam compras a partir do <strong>dia em que o cliente criou a conta</strong>{" "}
                    no app (não confundir com data de cadastro antigo no ERP).
                  </p>
                </article>
                <article className="admin-manual-card admin-manual-card--alerta">
                  <h3>Sem CPF no cupom</h3>
                  <p>
                    Compras sem identificação de CPF no caixa não entram no programa e não aparecem
                    vinculadas ao membro.
                  </p>
                </article>
              </div>
              <p>
                Pagamentos em <strong>dinheiro, cartão e PIX</strong> pontuam normalmente, desde
                que o cupom seja elegível e identificado com CPF.
              </p>
            </Secao>

            <Secao id="acumulo" titulo="Acúmulo e saldo pendente">
              <p>
                O valor das compras elegíveis vai se acumulando. Quando a soma atinge{" "}
                {formatarMoeda(REAIS_POR_PONTO)}, o cliente ganha 1 ponto e o restante fica como{" "}
                <strong>saldo pendente</strong> para a próxima compra.
              </p>
              <div className="admin-manual-exemplo">
                <p>
                  <strong>Exemplo:</strong> o cliente gastou R$ 80 → ganha 1 ponto e ficam R$ 30
                  pendentes. Na próxima compra de R$ 30, completa mais R$ 50 e ganha +1 ponto.
                </p>
              </div>
              <p>
                No painel de baixa e na ficha do cliente, esse pendente pode aparecer como progresso
                em direção ao próximo ponto.
              </p>
            </Secao>

            <Secao id="validade" titulo="Validade e expiração dos pontos">
              <ul className="admin-manual-lista">
                <li>
                  Cada ponto vale por <strong>{MESES_VALIDADE_PONTOS} meses</strong>, contados a
                  partir da data da compra que o gerou.
                </li>
                <li>
                  Na baixa (resgate), o sistema usa ordem <strong>FIFO</strong> — consome primeiro
                  os pontos que vencem mais cedo.
                </li>
                <li>
                  Pontos expirados saem do saldo automaticamente e não podem ser resgatados.
                </li>
                <li>
                  Na aba <strong>Clientes</strong>, a lista “Pontos expirando” mostra quem tem
                  lote vencendo nos próximos 60 dias.
                </li>
              </ul>
            </Secao>

            <Secao id="sincronizacao" titulo="Sincronização com o caixa (WR PDV)">
              <p>
                As compras são lidas das tabelas de venda do <strong>WR PDV</strong> pelo CPF no
                cupom. A sincronização ocorre quando:
              </p>
              <ul className="admin-manual-lista">
                <li>O cliente acessa o app (home, compras, pontos).</li>
                <li>O administrador busca o cliente na <strong>Baixa de pontos</strong>.</li>
                <li>A ficha do cliente é aberta na aba <strong>Clientes</strong>.</li>
              </ul>
              <p>O sistema, em cada sincronização:</p>
              <ol className="admin-manual-passos">
                <li>Busca cupons novos desde o cadastro na plataforma.</li>
                <li>Insere compras elegíveis que ainda não foram processadas.</li>
                <li>Marca cancelamentos e convênios detectados no PDV.</li>
                <li>Recalcula lotes de pontos, saldo e valor pendente.</li>
              </ol>
              <div className="admin-manual-callout admin-manual-callout--warn">
                <strong>Atraso possível:</strong> se o cliente acabou de comprar, os pontos podem
                levar alguns minutos até a próxima sincronização. Peça para atualizar o app ou busque
                o CPF novamente no admin.
              </div>
            </Secao>

            <Secao id="resgate" titulo="Resgate de prêmios (baixa de pontos)">
              <p>
                O resgate é feito somente no <strong>painel administrativo</strong>, na aba{" "}
                <strong>Baixa de pontos</strong>. Siga os 4 passos da tela:
              </p>
              <ol className="admin-manual-passos admin-manual-passos--destaque">
                <li>
                  <strong>Buscar cliente</strong> — informe o CPF e aguarde carregar saldo e
                  catálogo de brindes ativos.
                </li>
                <li>
                  <strong>Escolher prêmio</strong> — selecione o(s) brinde(s) e quantidade. O
                  cliente precisa ter saldo suficiente; só aparecem brindes com estoque.
                </li>
                <li>
                  <strong>Confirmar e imprimir</strong> — gera o comprovante com código de resgate.
                  Os pontos são debitados neste momento.
                </li>
                <li>
                  <strong>Assinatura do cliente</strong> — após o cliente assinar o comprovante
                  físico, confirme a assinatura no sistema. O atendimento só está completo após
                  este passo.
                </li>
              </ol>
              <ul className="admin-manual-lista">
                <li>O estoque do brinde é reduzido automaticamente na confirmação.</li>
                <li>É possível reimprimir comprovantes anteriores pelo histórico do cliente.</li>
                <li>Resgates ficam registrados na auditoria e na ficha do cliente.</li>
              </ul>
            </Secao>

            <Secao id="brindes" titulo="Cadastro de brindes">
              <p>
                Na aba <strong>Brindes</strong>, cada prêmio precisa de nome, imagem, pontos
                necessários e estoque. Regras práticas:
              </p>
              <ul className="admin-manual-lista">
                <li>
                  <strong>Sugerir pontos:</strong> divida o custo de referência do prêmio por{" "}
                  {formatarValorPonto()}. Ex.: brinde de R$ 25 → 50 pontos.
                </li>
                <li>
                  Brindes <strong>inativos</strong> ou com <strong>estoque zero</strong> não
                  aparecem para resgate.
                </li>
                <li>
                  O brinde mais barato (menos pontos) define a lista “Perto do prêmio” na aba
                  Clientes.
                </li>
              </ul>
              <p className="admin-manual-nota">
                Use o botão <strong>Ajuda</strong> na tela de brindes para a tabela rápida de
                conversão gasto → pontos → valor de referência.
              </p>
            </Secao>

            <Secao id="areas" titulo="Áreas do painel administrativo">
              <div className="admin-manual-cards admin-manual-cards--areas">
                <article className="admin-manual-card">
                  <h3>Clientes</h3>
                  <p>
                    Ficha 360° com compras reais do WR PDV, saldo, resgates, listas inteligentes
                    (inativos, fora do clube, pontos expirando) e atalho para baixa.
                  </p>
                </article>
                <article className="admin-manual-card">
                  <h3>Baixa de pontos</h3>
                  <p>Consulta de saldo, catálogo e fluxo completo de resgate com comprovante.</p>
                </article>
                <article className="admin-manual-card">
                  <h3>Usuários</h3>
                  <p>Membros cadastrados na plataforma, redefinição de senha e dados de acesso.</p>
                </article>
                <article className="admin-manual-card">
                  <h3>Brindes</h3>
                  <p>Cadastro, estoque, pontuação e ativação dos prêmios do clube.</p>
                </article>
                <article className="admin-manual-card">
                  <h3>Regulamento</h3>
                  <p>Textos legais exibidos ao cliente (regulamento e privacidade).</p>
                </article>
              </div>
            </Secao>

            <Secao id="atendimento" titulo="Dicas rápidas de atendimento">
              <ul className="admin-manual-lista admin-manual-lista--dicas">
                <li>
                  <strong>“Não apareceu meu ponto”</strong> — confira se o CPF foi informado no
                  caixa, se não foi convênio/cancelamento e se a compra é posterior ao cadastro no
                  app. Atualize buscando o cliente no admin.
                </li>
                <li>
                  <strong>“Não consigo resgatar”</strong> — verifique saldo, validade (pontos
                  expirados) e estoque do brinde.
                </li>
                <li>
                  <strong>“Comprovante sem assinatura”</strong> — o resgate já debitou pontos; falta
                  apenas confirmar a assinatura no passo 4.
                </li>
                <li>
                  <strong>Cliente compra muito mas não é do clube</strong> — use a lista “Fora do
                  clube” na aba Clientes para orientar o cadastro.
                </li>
              </ul>
              <div className="admin-manual-callout admin-manual-callout--ok">
                Em caso de dúvida sobre regra comercial não coberta aqui, consulte o{" "}
                <strong>Regulamento</strong> cadastrado no painel — ele é o documento oficial
                apresentado ao cliente.
              </div>
            </Secao>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

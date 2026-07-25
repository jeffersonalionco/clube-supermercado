import { getPool } from "../db.js";

export const LEGAL_SLUGS = ["regulamento", "privacidade"];

const CONTEUDO_INICIAL = {
  regulamento: {
    titulo: "Regulamento do Clube Superama+",
    conteudo: `## Identificação

O **Clube Superama+** é um programa de relacionamento do **Superama Supermercado**, marca do **Kimp Comércio de Alimentos Ltda.**, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº **00.289.167/0001-14** (matriz), doravante denominado **Superama**.

Este regulamento possui **duas partes**, com vigência distinta:

- **Parte I** — Descontos exclusivos (em vigor)
- **Parte II** — Programa de pontos e prêmios (antecipação — ainda não em vigor)

---

## PARTE I — DESCONTOS EXCLUSIVOS

A Parte I regula o benefício atualmente disponível aos clientes cadastrados no Clube Superama+: **descontos exclusivos em produtos selecionados**.

---

## I.1. Objetivo

O Clube Superama+ é um programa **gratuito** de relacionamento criado pelo Superama com o objetivo de oferecer **descontos exclusivos**, ofertas especiais e benefícios comerciais aos clientes cadastrados.

A participação no Clube Superama+ **não caracteriza** concurso, sorteio, distribuição gratuita de prêmios ou qualquer modalidade sujeita à autorização prevista na legislação aplicável.

## I.2. Participação

**I.2.1.** A participação é gratuita.

**I.2.2.** Poderão participar pessoas físicas maiores de 18 anos, inscritas no CPF.

**I.2.3.** O cadastro poderá ser realizado:

- pelo site oficial do Clube Superama+;
- por aplicativo oficial, quando disponível;
- diretamente na loja, quando disponibilizado.

**I.2.4.** O cliente declara que todas as informações fornecidas são verdadeiras.

**I.2.5.** O cliente compromete-se a manter seus dados sempre atualizados.

## I.3. Como funciona

**I.3.1.** O Clube Superama+ concede descontos exclusivos em produtos previamente selecionados pelo Superama.

**I.3.2.** Para receber os descontos é **obrigatório informar o CPF cadastrado** antes da finalização da compra.

**I.3.3.** Após a emissão do cupom fiscal **não será possível** aplicar descontos retroativamente.

**I.3.4.** Os descontos serão concedidos automaticamente quando o produto fizer parte de uma oferta vigente do Clube Superama+.

## I.4. Dos descontos

**I.4.1.** Os descontos poderão variar conforme:

- produtos participantes;
- período promocional;
- estoque disponível;
- unidade participante.

**I.4.2.** Nem todos os produtos da loja participarão das campanhas.

**I.4.3.** Os preços promocionais poderão sofrer alterações sem aviso prévio.

**I.4.4.** O Superama poderá criar ofertas exclusivas para determinados grupos de clientes, conforme critérios internos.

**I.4.5.** Os descontos são pessoais e vinculados ao CPF cadastrado.

## I.5. Ofertas exclusivas

O Clube Superama+ poderá oferecer:

- descontos exclusivos;
- campanhas promocionais;
- ofertas especiais;
- vantagens para clientes cadastrados.

A participação em determinada oferta dependerá das regras específicas divulgadas durante cada campanha.

## I.6. Limitações

Os descontos não serão aplicados em situações como:

- compras realizadas sem identificação do CPF;
- vendas para CNPJ;
- produtos cuja legislação impeça descontos;
- serviços terceirizados;
- produtos expressamente excluídos das campanhas.

## I.7. Benefícios

Os benefícios do Clube Superama+ previstos nesta Parte I:

- são pessoais;
- são intransferíveis;
- não possuem valor monetário;
- não podem ser convertidos em dinheiro;
- não podem ser vendidos ou negociados.

## I.8. Cadastro e dados

O cliente autoriza o Superama a utilizar seus dados para:

- identificação nas compras;
- envio de ofertas;
- comunicação institucional;
- campanhas promocionais.

O tratamento dos dados observará a Lei Geral de Proteção de Dados (**LGPD**) e a Política de Privacidade vigente na plataforma.

O cliente poderá solicitar a exclusão de seu cadastro a qualquer momento.

## I.9. Fraudes

O Superama poderá suspender ou cancelar o cadastro de clientes que:

- utilizarem CPF de terceiros;
- praticarem fraude;
- tentarem obter vantagens indevidas;
- utilizarem o programa de forma incompatível com este regulamento.

## I.10. Alterações do regulamento

O Superama poderá alterar este regulamento, criar novas campanhas, modificar benefícios ou encerrar o Clube Superama+ a qualquer momento.

Sempre que possível, as alterações serão divulgadas através dos canais oficiais.

## I.11. Prazo de vigência da Parte I

A Parte I (descontos exclusivos) possui prazo de vigência indeterminado e encontra-se **em vigor**.

O programa poderá ser suspenso ou encerrado mediante comunicação aos clientes.

## I.12. Disposições gerais da Parte I

**I.12.1.** A participação no Clube Superama+ implica na aceitação integral deste regulamento.

**I.12.2.** Os descontos poderão possuir quantidade limitada, período determinado ou restrição de estoque.

**I.12.3.** O Superama não garante a disponibilidade permanente de qualquer oferta.

**I.12.4.** O cliente deverá acompanhar as ofertas pelos canais oficiais do Superama.

## I.13. Atendimento

Dúvidas poderão ser esclarecidas pelos canais oficiais de atendimento do Superama.

## I.14. Foro

Fica eleito o foro da comarca da sede do **Kimp Comércio de Alimentos Ltda.** (CNPJ **00.289.167/0001-14**) para dirimir eventuais questões decorrentes deste regulamento, ressalvados os direitos previstos no Código de Defesa do Consumidor.

---

## PARTE II — PROGRAMA DE PONTOS E PRÊMIOS (ANTECIPAÇÃO)

**Atenção:** a Parte II **ainda não está em vigor**.

As regras abaixo descrevem, de forma antecipada, como funcionará o **programa de pontos e resgate de prêmios** do Clube Superama+ quando o Superama comunicar oficialmente o início da vigência.

Enquanto a Parte II não estiver ativa:

- **não há** acúmulo de pontos;
- **não há** resgate de prêmios por pontos;
- **não se cria direito adquirido** com base nestas regras antecipadas;
- permanece plenamente válida a **Parte I** (descontos exclusivos).

A ativação da Parte II será comunicada pelos canais oficiais do Superama e/ou pela plataforma do clube.

---

## II.1. Do programa de pontos

Quando vigente, o programa de pontos integra o Clube Superama+ e destina-se a clientes cadastrados na plataforma digital do clube. A participação permanece gratuita e voluntária.

## II.2. Como participar do programa de pontos

**II.2.1.** Para participar, o cliente deve estar cadastrado na plataforma do Clube Superama+, com CPF, dados pessoais e de contato válidos.

**II.2.2.** O acesso à área do cliente é feito com CPF e senha pessoal.

**II.2.3.** Aplicam-se, no que couber, as regras de participação, cadastro, fraude e dados da Parte I.

## II.3. Acúmulo de pontos

**II.3.1.** A cada **R$ 50,00** (cinquenta reais) em compras elegíveis, o participante acumula **1 (um) ponto**.

**II.3.2.** O cálculo considera o **valor acumulado** das compras (saldo pendente), e não cada cupom isoladamente. Várias compras menores podem se somar até completar R$ 50,00.

**II.3.3.** **Somente compras realizadas a partir da data de cadastro na plataforma do clube** — e, quando aplicável, a partir da data de ativação oficial do programa de pontos — são contabilizadas para pontos.

**II.3.4.** Compras anteriores ao cadastro no clube **não** geram pontos retroativos.

**II.3.5.** O saldo de pontos é atualizado conforme as vendas são sincronizadas com o sistema da loja.

## II.4. Compras elegíveis e exclusões

**II.4.1.** Em regra, entram no cálculo compras pagas em meios elegíveis (como dinheiro, cartão ou PIX), com o CPF do participante informado no caixa.

**II.4.2.** Cupons em **convênio** podem aparecer no histórico de compras, mas **não pontuam**.

**II.4.3.** Cupons **cancelados** ou **estornados** na loja podem deixar de contar para pontos e, quando já tiverem gerado pontuação, poderão resultar em estorno ou ajuste do saldo, conforme os registros do sistema.

**II.4.4.** O Superama poderá definir outras exclusões de elegibilidade, com divulgação na plataforma quando aplicável.

## II.5. Validade e expiração dos pontos

**II.5.1.** Cada ponto terá validade de **12 (doze) meses**, contados a partir da data da compra que o gerou, salvo comunicação em contrário no momento da ativação do programa.

**II.5.2.** No resgate, o sistema consumirá preferencialmente os pontos que vencerem primeiro (ordem FIFO).

**II.5.3.** Pontos expirados saem do saldo automaticamente e não poderão ser resgatados.

## II.6. Resgate de prêmios

**II.6.1.** Os prêmios (brindes) disponíveis serão exibidos no catálogo da plataforma, com indicação da quantidade de pontos necessária e da disponibilidade de estoque.

**II.6.2.** O resgate será realizado **presencialmente na loja**, mediante apresentação do CPF e confirmação pelo atendimento autorizado.

**II.6.3.** Cada resgate debitará os pontos correspondentes ao prêmio e reduzirá o estoque em 1 (uma) unidade, quando aplicável.

**II.6.4.** Prêmios sujeitos a disponibilidade; a loja poderá alterar o catálogo, a pontuação necessária e o estoque a qualquer momento.

**II.6.5.** Pontos **não são conversíveis em dinheiro** e **não são transferíveis** entre participantes.

## II.7. Consulta e sincronização

**II.7.1.** O participante poderá consultar saldo, histórico e prêmios na plataforma do clube, após a ativação do programa.

**II.7.2.** Pode haver atraso entre a compra na loja e a atualização do saldo na plataforma, em razão da sincronização entre sistemas.

**II.7.3.** Diante de inconsistências, o participante deverá acionar os canais oficiais de atendimento do Superama.

## II.8. Suspensão, ajuste e cancelamento

**II.8.1.** Em caso de suspeita de fraude ou uso indevido, o cadastro ou o saldo de pontos poderá ser suspenso ou cancelado.

**II.8.2.** O Superama reserva-se o direito de ajustar regras de acúmulo, validade, prêmios e benefícios, com comunicação na plataforma quando aplicável.

**II.8.3.** A suspensão ou o encerramento do programa de pontos não afeta, por si só, a vigência da Parte I (descontos), salvo comunicação em contrário.

## II.9. Disposições finais da Parte II

**II.9.1.** A Parte II somente produz efeitos após a comunicação oficial de início de vigência pelo Superama.

**II.9.2.** Até lá, a Parte II tem natureza **informativa e antecipatória**, sem gerar obrigação de pontuar, resgatar ou manter qualquer benefício de pontos.

**II.9.3.** Dúvidas sobre a futura ativação do programa de pontos deverão ser tratadas no atendimento da loja ou pelos canais oficiais do Superama.

---

**Kimp Comércio de Alimentos Ltda.** — Superama Supermercado / Clube Superama+  
CNPJ: **00.289.167/0001-14**`,
  },
  privacidade: {
    titulo: "Política de Privacidade",
    conteudo: `## 1. Controlador e identificação

Esta Política de Privacidade aplica-se ao **Clube Superama+**, programa de relacionamento operado pelo **Superama Supermercado**, marca do **Kimp Comércio de Alimentos Ltda.**, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº **00.289.167/0001-14** (matriz), doravante denominada **Superama**, **nós** ou **Controlador**.

Ao cadastrar-se, acessar ou utilizar a plataforma digital do clube, você (**titular**, **participante** ou **você**) declara ter lido, compreendido e concordado com os termos desta Política, sem prejuízo dos direitos assegurados pela legislação brasileira, em especial pela **Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018)**, pelo **Marco Civil da Internet (Lei nº 12.965/2014)** e pelo **Código de Defesa do Consumidor (Lei nº 8.078/1990)**.

## 2. Escopo

Esta Política descreve como tratamos dados pessoais no contexto do Clube Superama+, incluindo o site/aplicação de área do cliente, autenticação, consulta de pontos, histórico de compras elegíveis, catálogo de prêmios e demais funcionalidades vinculadas ao programa.

Não se aplica a sites, aplicativos ou canais de terceiros que não sejam operados pelo Superama, ainda que acessados por links na plataforma.

## 3. Dados pessoais que podemos tratar

Conforme sua participação no programa e o uso da plataforma, podemos tratar:

- **Identificação:** CPF ou CNPJ, nome completo, data de nascimento, sexo, estado civil, RG e demais dados cadastrais informados ou obtidos de sistemas integrados da loja.
- **Contato:** e-mail, telefone, celular, endereço e CEP, quando disponíveis.
- **Acesso e segurança:** credenciais de login (senha armazenada exclusivamente em formato criptográfico — *hash* —, sem armazenamento em texto legível), registros de data/hora de aceite de documentos legais, sessões e logs técnicos de acesso.
- **Programa de relacionamento:** saldo de pontos, histórico de movimentações, resgates de prêmios, cupons fiscais vinculados ao seu documento, itens de compra, valores, status de cupons (incluindo cancelamentos e convênios) e demais informações necessárias à operação do clube.
- **Dados de compras na loja:** informações provenientes do sistema de gestão da loja (ERP/PDV), utilizadas para exibir compras, calcular pontos e permitir auditoria do programa.

Não solicitamos dados desnecessários à finalidade do clube. Campos opcionais, quando existirem, serão indicados no cadastro.

## 4. Origem dos dados

Os dados podem ser obtidos:

- **Diretamente de você**, no cadastro, atualização de perfil ou contato com a loja/plataforma.
- **De bases já existentes** no ecossistema Superama, quando você já é cliente cadastrado na loja, para viabilizar sua participação no clube.
- **De sistemas internos de vendas e cadastro** (ERP/PDV), para sincronizar compras, cupons e pontuação vinculados ao seu CPF/CNPJ.
- **De registros automáticos** gerados pelo uso da plataforma (logs, datas de aceite, histórico de resgates).

É sua responsabilidade fornecer informações verdadeiras, completas e atualizadas. O Superama não se responsabiliza por prejuízos decorrentes de dados incorretos, desatualizados ou omitidos pelo titular, sem prejuízo das medidas de correção e segurança previstas nesta Política e na lei.

## 5. Finalidades do tratamento

Utilizamos os dados pessoais para:

- Cadastrar, autenticar e gerenciar sua conta no Clube Superama+.
- Calcular, exibir e manter o saldo de pontos, histórico de compras elegíveis e resgates.
- Permitir a consulta de prêmios e viabilizar o resgate presencial na loja.
- Cumprir obrigações legais, regulatórias e fiscais aplicáveis.
- Atender solicitações, reclamações e exercício de direitos do titular.
- Prevenir fraudes, usos indevidos, inconsistências de pontuação e violações do regulamento do clube.
- Melhorar a segurança, a estabilidade e a experiência de uso da plataforma.
- Defender em juízo ou na esfera administrativa os interesses legítimos do Superama, inclusive em face de acusações infundadas, desde que respeitados os limites legais e o contraditório.

## 6. Bases legais (LGPD)

O tratamento poderá fundamentar-se, conforme o caso, nas hipóteses do **art. 7º da LGPD**, entre outras:

- **Execução de contrato** ou de procedimentos preliminares relacionados à sua participação no clube.
- **Cumprimento de obrigação legal ou regulatória**.
- **Exercício regular de direitos** em processo judicial, administrativo ou arbitral.
- **Legítimo interesse** do Controlador, como prevenção à fraude, segurança da plataforma e melhoria do serviço, mediante avaliação de impacto e respeito aos direitos do titular.
- **Consentimento**, quando solicitado de forma específica (por exemplo, no aceite desta Política e do Regulamento do Clube).

Quando o tratamento depender de consentimento, você poderá revogá-lo, nos termos do **art. 8º, § 5º, da LGPD**, ressalvadas as hipóteses em que o tratamento possa continuar com base em outra fundamentação legal.

## 7. Compartilhamento e operadores

Seus dados poderão ser compartilhados, estritamente na medida necessária, com:

- **Sistemas de gestão da loja (ERP/PDV)** e bases de vendas vinculadas à operação do Superama, para consulta cadastral, registro de compras e cálculo de pontos.
- **Prestadores de tecnologia** (hospedagem, infraestrutura, desenvolvimento e suporte), que atuam como **operadores** de dados, contratualmente obrigados à confidencialidade e ao tratamento conforme nossas instruções e a lei.
- **Autoridades públicas, órgãos de defesa do consumidor, Ministério Público, Poder Judiciário e Agência Nacional de Proteção de Dados (ANPD)**, quando houver requisição legal, ordem judicial ou obrigação regulatória.

**Não vendemos, alugamos nem comercializamos** seus dados pessoais.

Transferências internacionais de dados, se vierem a ocorrer, observarão os requisitos dos **arts. 33 a 36 da LGPD**.

## 8. Armazenamento, retenção e eliminação

Os dados serão mantidos:

- Pelo tempo necessário ao cumprimento das finalidades descritas nesta Política.
- Pelo prazo exigido por obrigações legais, fiscais, contábeis ou de defesa de direitos.
- Após o encerramento da participação no clube, pelo período necessário ao cumprimento de obrigações legais ou à resolução de disputas.

Quando não houver mais fundamento legal ou legítimo para a manutenção, os dados serão eliminados, anonimizados ou bloqueados, conforme aplicável e nos limites técnicos dos sistemas integrados.

## 9. Segurança da informação

Adotamos **medidas técnicas e organizacionais** compatíveis com a natureza dos dados e com as boas práticas de mercado, incluindo, conforme aplicável:

- Controle de acesso e segregação de permissões.
- Comunicação protegida entre sistemas.
- Armazenamento de senhas com criptografia (*hash*).
- Monitoramento e registros de operações relevantes.
- Políticas internas de uso de sistemas e confidencialidade com colaboradores e prestadores.

**Nenhum sistema é absolutamente inviolável.** O Superama compromete-se a envidar **esforços razoáveis e contínuos** para proteger os dados dos participantes, mas não garante segurança total contra eventos alheios ao seu controle razoável (como falhas generalizadas de internet, ataques sofisticados ou condutas negligentes do próprio titular, como compartilhamento de senha).

## 10. Incidentes de segurança

Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos titulares, adotaremos medidas de contenção, mitigação e, quando exigido, **comunicação à ANPD e aos titulares afetados**, nos termos do **art. 48 da LGPD** e da regulamentação aplicável.

## 11. Direitos do titular

Nos termos do **art. 18 da LGPD**, você pode solicitar, mediante requisição ao Controlador:

- Confirmação da existência de tratamento.
- Acesso aos dados.
- Correção de dados incompletos, inexatos ou desatualizados.
- Anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade.
- Portabilidade, quando aplicável.
- Informação sobre compartilhamentos e sobre a possibilidade de não consentir.
- Revogação do consentimento, quando essa for a base do tratamento.
- Revisão de decisões automatizadas que afetem seus interesses, quando couber.

Responderemos às solicitações dentro dos prazos legais, podendo solicitar informações adicionais para confirmar sua identidade e evitar fraudes.

## 12. Encarregado e canais de atendimento

Para exercer seus direitos, esclarecer dúvidas sobre privacidade ou reportar preocupações com o tratamento de dados, utilize os canais oficiais do Superama:

- **Na loja:** atendimento ao cliente nos horários de funcionamento.
- **Na plataforma:** área **Meu contato**, após login, ou demais canais eletrônicos oficialmente divulgados pelo Superama.

O encarregado pelo tratamento de dados pessoais (DPO), quando designado, terá seus dados de contato publicados nos canais oficiais do Superama.

## 13. Cookies e tecnologias similares

A plataforma pode utilizar **armazenamento local do navegador** (por exemplo, para manter sua sessão autenticada) e tecnologias estritamente necessárias ao funcionamento do serviço.

Não utilizamos, no escopo desta plataforma do clube, cookies de rastreamento publicitário de terceiros para perfil comportamental.

## 14. Crianças e adolescentes

O Clube Superama+ destina-se a participantes capazes de contratar ou com representação legal adequada. O cadastro de menores deve ser realizado com participação e responsabilidade do representante legal, nos termos da legislação aplicável.

## 15. Exatidão das informações, sincronização e limitações do sistema

As informações de pontos, compras e prêmios exibidas na plataforma dependem de **cadastros, integrações e sincronização** entre sistemas da loja e da plataforma digital. Podem ocorrer:

- **Atrasos** entre a compra na loja e a atualização do saldo na plataforma.
- **Divergências temporárias** decorrentes de cancelamentos, estornos, convênios, cupons em processamento ou falhas pontuais de conectividade.
- **Interrupções programadas ou emergenciais** para manutenção, atualização ou segurança.

Diante de qualquer inconsistência, o participante deve acionar os canais oficiais de atendimento. O Superama **empregará esforços razoáveis** para apurar, corrigir e restabelecer a fidelidade dos registros, em colaboração com o titular e com os sistemas envolvidos.

A plataforma é disponibilizada no estado em que se encontra (**as is**), dentro dos limites legais, sem garantia de disponibilidade ininterrupta, salvo disposição legal em contrário.

## 16. Condutas proibidas, fraude e medidas de proteção

É vedado ao participante:

- Utilizar dados, credenciais ou benefícios de terceiros sem autorização.
- Manipular, falsificar ou tentar fraudar o sistema de pontuação ou resgates.
- Imputar falsamente ao Superama condutas ilícitas, omissões dolosas ou violações de privacidade **sem fundamento**, com potencial dano à honra objetiva da empresa.

O Superama poderá **suspender, bloquear ou encerrar** cadastros em caso de suspeita fundada de fraude, violação do regulamento ou uso abusivo, preservados o contraditório e a apuração dos fatos na medida do possível.

Imputações falsas, caluniosas, difamatórias ou injuriosas contra a empresa ou seus representantes poderão ser **refutadas administrativamente** e, quando cabível, **submetidas às vias legais competentes**, inclusive com base nos **arts. 138, 139 e 140 do Código Penal** (calúnia, difamação e injúria) e nas normas civis de reparação de danos, sem prejuízo da cooperação com as autoridades.

## 17. Cooperação com autoridades e boa-fé

O Superama **colabora de boa-fé** com a ANPD, o Poder Judiciário, o Ministério Público, órgãos de defesa do consumidor e demais autoridades competentes, fornecendo informações e registros **na extensão exigida por lei**, ordem judicial ou requisição formal válida.

Comprometemo-nos a:

- Manter registros de tratamento na medida exigida pela legislação.
- Adotar medidas corretivas quando identificadas falhas sob nossa esfera de responsabilidade.
- Atuar com transparência e verdade nos procedimentos de apuração de incidentes e reclamações relacionadas a dados pessoais.

## 18. Responsabilidade e limites legais

Na máxima extensão permitida pela legislação brasileira:

- O Superama não responde por danos decorrentes de **informações incorretas fornecidas pelo titular**, **compartilhamento voluntário de senha**, **uso não autorizado da conta por terceiros** em razão de negligência do participante, ou por **falhas de serviços de terceiros** fora do controle razoável do Controlador.
- A responsabilidade por tratamento irregular observará o disposto nos **arts. 42 a 46 da LGPD**, incluindo a distinção entre Controlador e Operador.
- Questões consumeristas observarão o **Código de Defesa do Consumidor**, sem prejuízo das excludentes de responsabilidade legalmente previstas.

Nada nesta Política limita direitos irrenunciáveis do titular ou disposições imperativas da lei.

## 19. Alterações desta Política

Esta Política poderá ser atualizada a qualquer tempo para refletir mudanças legais, regulatórias, tecnológicas ou operacionais do Clube Superama+.

A **versão vigente** estará sempre disponível na plataforma, com indicação da data da última atualização. Alterações relevantes poderão exigir **novo aceite** para continuidade do uso de funcionalidades que dependam de consentimento.

## 20. Legislação aplicável e foro

Esta Política é regida pelas leis da **República Federativa do Brasil**, em especial a **LGPD (Lei nº 13.709/2018)**, o **Marco Civil da Internet (Lei nº 12.965/2014)**, o **CDC (Lei nº 8.078/1990)** e normas correlatas, incluindo regulamentações da **ANPD**.

Fica eleito o foro da comarca da sede da matriz do Controlador ou, quando aplicável e mais benéfico ao consumidor titular, o foro de seu domicílio, nos termos do **art. 101, I, do CDC**.

## 21. Contato

**Kimp Comércio de Alimentos Ltda.** (Superama Supermercado — Clube Superama+)
CNPJ: **00.289.167/0001-14**

Para dúvidas, solicitações de direitos do titular ou comunicações sobre privacidade e proteção de dados, utilize os canais oficiais do Superama na loja ou na área **Meu contato** da plataforma, após o login.

O Superama reafirma seu compromisso de **proteger os dados pessoais dos participantes**, atuar com **integridade e transparência** e **cooperar com a lei e com a Justiça** para a apuração da verdade dos fatos, sempre dentro dos limites legais e do respeito aos direitos de todos os envolvidos.`,
  },
};

function mapRow(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    titulo: row.titulo,
    conteudo: row.conteudo,
    atualizadoEm: row.atualizado_em,
    adminUsuario: row.admin_usuario,
  };
}

function mapRowPublico(row) {
  if (!row) return null;
  return {
    slug: row.slug,
    titulo: row.titulo,
    conteudo: row.conteudo,
    atualizadoEm: row.atualizado_em,
  };
}

const MARCADOR_PRIVACIDADE_VERSAO = "00.289.167/0001-14";
const MARCADOR_REGULAMENTO_DESCONTOS =
  "PARTE II — PROGRAMA DE PONTOS E PRÊMIOS (ANTECIPAÇÃO)";

export async function seedConteudoLegal() {
  const db = getPool();

  for (const slug of LEGAL_SLUGS) {
    const { rows } = await db.query(
      `SELECT slug FROM conteudo_legal WHERE slug = $1`,
      [slug]
    );
    if (rows.length) continue;

    const seed = CONTEUDO_INICIAL[slug];
    await db.query(
      `INSERT INTO conteudo_legal (slug, titulo, conteudo, admin_usuario)
       VALUES ($1, $2, $3, 'sistema')`,
      [slug, seed.titulo, seed.conteudo]
    );
    console.log(`Conteúdo legal inicial criado: ${slug}`);
  }

  await sincronizarPrivacidadePadrao(db);
  await sincronizarRegulamentoDescontos(db);
}

async function sincronizarPrivacidadePadrao(db) {
  const seed = CONTEUDO_INICIAL.privacidade;
  const { rows } = await db.query(
    `SELECT conteudo FROM conteudo_legal WHERE slug = 'privacidade'`
  );
  if (!rows.length) return;

  if (String(rows[0].conteudo || "").includes(MARCADOR_PRIVACIDADE_VERSAO)) {
    return;
  }

  await db.query(
    `UPDATE conteudo_legal
     SET titulo = $1,
         conteudo = $2,
         admin_usuario = 'sistema',
         atualizado_em = NOW()
     WHERE slug = 'privacidade'`,
    [seed.titulo, seed.conteudo]
  );
  console.log("Política de Privacidade atualizada para o template vigente.");
}

async function sincronizarRegulamentoDescontos(db) {
  const seed = CONTEUDO_INICIAL.regulamento;
  const { rows } = await db.query(
    `SELECT conteudo FROM conteudo_legal WHERE slug = 'regulamento'`
  );
  if (!rows.length) return;

  if (String(rows[0].conteudo || "").includes(MARCADOR_REGULAMENTO_DESCONTOS)) {
    return;
  }

  await db.query(
    `UPDATE conteudo_legal
     SET titulo = $1,
         conteudo = $2,
         admin_usuario = 'sistema',
         atualizado_em = NOW()
     WHERE slug = 'regulamento'`,
    [seed.titulo, seed.conteudo]
  );
  console.log("Regulamento atualizado para descontos do Clube Superama+.");
}

export async function listarConteudoLegal() {
  const { rows } = await getPool().query(
    `SELECT slug, titulo, conteudo, atualizado_em, admin_usuario
     FROM conteudo_legal
     WHERE slug = ANY($1::varchar[])
     ORDER BY CASE slug WHEN 'regulamento' THEN 1 WHEN 'privacidade' THEN 2 ELSE 3 END`,
    [LEGAL_SLUGS]
  );
  return rows.map(mapRow);
}

export async function obterConteudoLegal(slug) {
  if (!LEGAL_SLUGS.includes(slug)) {
    return { ok: false, error: "Documento não encontrado" };
  }

  const { rows } = await getPool().query(
    `SELECT slug, titulo, conteudo, atualizado_em, admin_usuario
     FROM conteudo_legal WHERE slug = $1`,
    [slug]
  );

  if (!rows[0]) {
    return { ok: false, error: "Documento não encontrado" };
  }

  return { ok: true, documento: mapRowPublico(rows[0]) };
}

export async function atualizarConteudoLegal(slug, { titulo, conteudo, adminUsuario }) {
  if (!LEGAL_SLUGS.includes(slug)) {
    return { ok: false, error: "Documento inválido" };
  }

  const tituloLimpo = String(titulo || "").trim();
  const conteudoLimpo = String(conteudo || "").trim();

  if (tituloLimpo.length < 3) {
    return { ok: false, error: "Informe um título válido" };
  }
  if (conteudoLimpo.length < 20) {
    return { ok: false, error: "O conteúdo está muito curto" };
  }

  const { rows } = await getPool().query(
    `UPDATE conteudo_legal
     SET titulo = $2,
         conteudo = $3,
         admin_usuario = $4,
         atualizado_em = NOW()
     WHERE slug = $1
     RETURNING slug, titulo, conteudo, atualizado_em, admin_usuario`,
    [slug, tituloLimpo, conteudoLimpo, adminUsuario || "admin"]
  );

  if (!rows[0]) {
    return { ok: false, error: "Documento não encontrado" };
  }

  return { ok: true, documento: mapRow(rows[0]) };
}

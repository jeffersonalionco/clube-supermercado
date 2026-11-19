# Clube Superama+ — versionamento

## Versão atual

- **v0.11.0** — encartes e etiquetas editáveis, campanhas em vários formatos, imagens automáticas, animações e melhorias na padaria e no WhatsApp.

## v0.11.0 — 19/11/2026

Snapshot do estado atual do projeto, incluindo as alterações de marketing, padaria, interface administrativa e WhatsApp. A versão dos pacotes e a versão exibida pelo aplicativo estão sincronizadas.

### Encartes no marketing

- Novo módulo com permissão administrativa própria, rascunhos, histórico, duplicação, finalização e controle de versão para evitar sobrescrever edições concorrentes.
- Galeria organizada por categoria, grupo de modelos e formatos. Criação de uma campanha em até quatro formatos, compartilhando produtos e configurações entre as versões.
- Formatos TV (1920 × 1080), Feed (1080 × 1350), Stories (1080 × 1920) e etiquetas para impressão em A4 (210 × 297 mm), conforme as versões disponíveis em cada modelo.
- Modelos gerais, Açougue Superama, Black Friday com seis produtos por página, Terça-feira do Hortifruti e Quinta da Limpeza, com artes e identidade visual próprias.
- Cards Black Friday com molduras douradas, destaque para imagem e preço, faixa de limite e adaptação aos formatos digitais.
- Editor com campos agrupados por produto, apenas um item expandido por vez e destaque visual para o produto em edição.
- Prévia em tela cheia, navegação por páginas e formatos e painéis próprios para selecionar formatos, configurar animações e acessar os arquivos finalizados.

### Produtos, preços e imagens

- Busca de produtos por descrição, código interno e código de barras do ERP, com consulta específica por código e preservação dos zeros iniciais do EAN.
- Inclusão de produtos com preço normal, oferta da loja ou Clube Superama+, reutilizando as regras de preço e o cache de sincronização já existentes no clube.
- Filtros de clube e oferta, acompanhamento da sincronização e botão para atualizar os preços pelo editor.
- Preços atual e anterior editáveis por produto, opção de exibir ou ocultar o preço anterior e preservação dos valores manuais durante a atualização dos dados do ERP. O preço anterior informado manualmente também pode ser igual ou inferior ao preço atual.
- Datas da campanha editáveis, limite opcional por produto e etiqueta de unidade personalizável no modelo Black Friday, como kg, un ou cx.
- Biblioteca de imagens vinculada ao código interno do ERP, envio e substituição de arquivos e imagem padrão quando o produto não possui foto.
- Consulta à API PreçoMelhor pelo código de barras somente ao adicionar um produto ao encarte ou selecioná-lo na biblioteca de imagens, quando ainda não existe imagem cadastrada. Imagens encontradas são armazenadas para reutilização; falhas permitem continuar com envio manual.

### Etiquetas de gôndola

- Folha A4 com oito etiquetas e modelo Black Friday com até duas etiquetas por página.
- Modelo único Clube e Oferta com até duas etiquetas por A4. A arte de cada etiqueta acompanha automaticamente o tipo do produto, permitindo misturar clube e oferta na mesma folha.
- Nome e preços editáveis, preço anterior opcional e apresentação em preto e branco para impressão.
- Etiquetas do Clube Superama+ incluem QR Code para cadastro em https://clube.mercadosuperama.com.br.
- Impressão pelo navegador, com opção de salvar como PDF e espera pelo carregamento das imagens antes de imprimir.

### Exportação, compartilhamento e animação

- Download em PNG e JPG, arquivos ZIP por formato ou com os formatos da campanha e links públicos para as imagens finalizadas.
- Animação opcional com configuração de entradas de produtos, efeitos de elementos, transições, duração e velocidade.
- Efeitos aleatórios reproduzíveis e opções 3D para produtos, prévia animada e exportação de vídeo MP4 com conversão pelo servidor.

### Padaria, WhatsApp e interface

- Histórico de pedidos na produção da padaria, com filtros por período, busca, status e paginação.
- Impressão de pedidos pelo navegador e opção de salvar em PDF nas telas de atendimento e histórico de produção.
- Ajustes de apresentação e responsividade nas telas da padaria e do painel administrativo.
- Menu automático do WhatsApp com imagem de cabeçalho Black Friday e suporte a cabeçalho de imagem em mensagens interativas com botões.

### Operação e validação

- As tabelas de encartes, imagens e publicações são criadas pelas migrações idempotentes na inicialização do servidor. As imagens cadastradas e publicações são armazenadas no PostgreSQL.
- A conversão de vídeo depende do FFmpeg configurado no servidor. A consulta de imagens depende da disponibilidade da API externa e mantém a alternativa de envio manual.
- Build do cliente validado em diretório temporário, com aviso de tamanho de alguns bundles. Para publicar o frontend desta versão, gerar o build e seguir o procedimento de implantação do ambiente.
- `node --test server/tests/encartes.test.js server/tests/permissoesAdmin.test.js`: 22 testes aprovados.
- `npm --prefix server test`: 48 testes aprovados e uma falha preexistente em `server/tests/padariaRegras.test.js:22`, relacionada à transição de `pronto` para `em_producao`; o teste e o serviço correspondente já estavam assim no commit anterior.

## Como voltar para esta versão

```bash
git fetch --tags
git checkout v0.11.0
cd client && npm run build
# copiar o build para server/public se for o fluxo de produção
# reiniciar o PM2 / servidor
```

Para continuar desenvolvendo a partir dela em uma branch:

```bash
git checkout -b codex/hotfix-v0.11.0 v0.11.0
```

## Histórico

- `v0.9.0` — baseline pré-lançamento (estado congelado antes do go-live)
- `v0.10.0` — catálogo Meta, Pixel, encomenda WhatsApp da padaria
- `v0.11.0` — encartes, etiquetas A4, campanhas em vários formatos, imagens automáticas, animações, histórico da padaria e ajustes no WhatsApp

## Próximas versões

- `v1.0.0` — go-live em produção
- `v1.0.x` — correções após o lançamento
- `v1.x.0` — melhorias maiores

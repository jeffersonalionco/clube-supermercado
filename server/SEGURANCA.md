# Segurança da Plataforma — Clube Superama+

**Documento interno** · Uso restrito à equipe técnica e gestão da Kimp Comércio de Alimentos Ltda.  
**Última revisão:** junho/2026  
**Escopo:** API (`server/`), frontend do clube (`client/`) e integrações (PostgreSQL, ERP, WR PDV).

---

## 1. Objetivo

Este documento descreve as medidas de segurança **implementadas no código** da plataforma digital do Clube Superama+, com foco na proteção de dados pessoais dos participantes, credenciais de acesso e integrações com sistemas internos da loja.

Não substitui a Política de Privacidade exibida ao cliente nem um plano formal de segurança da informação (ISO 27001, etc.), mas serve como referência operacional para TI, desenvolvimento e auditoria interna.

---

## 2. Visão geral da arquitetura

```
[Navegador do cliente]
        │
        ▼ HTTPS (recomendado em produção)
[Frontend React — client/]
        │  JWT no localStorage (Bearer)
        ▼
[API Express — server/ :3001]
        │
        ├── PostgreSQL (dados do clube: usuários, pontos, brindes, legal)
        ├── API ERP (cadastro/vendas — HTTP interno)
        └── WR PDV (PostgreSQL read-only — cupons/vendas)
```

| Camada | Responsabilidade |
|--------|------------------|
| Frontend | Interface, sessão no navegador, aceite legal |
| API | Autenticação, autorização, validação, rate limit |
| PostgreSQL | Persistência com queries parametrizadas |
| Integrações | Dados de cadastro e vendas da operação da loja |

---

## 3. Autenticação e sessões

### 3.1 Clientes do clube

| Medida | Detalhe | Arquivo(s) |
|--------|---------|------------|
| Hash de senha | **bcrypt** (10 rounds); senha nunca armazenada em texto claro | `services/usuarioService.js` |
| Política de senha | Novo cadastro/primeiro acesso: mínimo **8** caracteres; login de conta existente: mínimo **4** (compatibilidade) | `utils/senha.js`, `routes/auth.js` |
| Token JWT | Emitido no login; payload: `sub` (id) + `cpf` | `services/sessionToken.js` |
| Validade | Configurável via `SESSION_EXPIRES_IN` (padrão: 7 dias) | `.env` |
| Revalidação | Cada requisição autenticada confere JWT **e** busca usuário no banco; CPF do token deve coincidir com o registro | `middleware/requireAuth.js` |
| Resposta pública | `usuarioPublico()` não expõe `senha_hash` nem dados sensíveis internos | `services/usuarioService.js` |

### 3.2 Administradores

| Medida | Detalhe | Arquivo(s) |
|--------|---------|------------|
| JWT separado | Pode usar `ADMIN_SESSION_SECRET` distinto do `SESSION_SECRET` | `services/adminToken.js`, `config/security.js` |
| Role no token | Payload com `role: "admin"`; rejeitado se ausente | `services/adminToken.js`, `middleware/requireAdmin.js` |
| Senha admin | Preferência por **`ADMIN_SENHA_HASH`** (bcrypt); fallback legado `ADMIN_SENHA` em texto | `services/adminAuth.js` |
| Geração de hash | `npm run hash-admin-senha` no diretório `server/` | `scripts/hash-admin-senha.mjs` |
| Validade | `ADMIN_SESSION_EXPIRES_IN` (padrão: 8 horas) | `.env` |

### 3.3 Armazenamento no navegador (cliente)

- Token e dados básicos do usuário ficam em **`localStorage`** (`superama_session`).
- Admin usa chave separada (`superama_admin_session`).
- **Limitação conhecida:** em caso de XSS no mesmo domínio, o token pode ser lido por script malicioso. Mitigação parcial: escape de HTML em documentos legais (ver seção 8).

---

## 4. Autorização de rotas

### Rotas públicas (sem login)

| Rota | Proteção aplicada |
|------|-------------------|
| `POST /api/auth/login` | Rate limit + validação de entrada |
| `GET /api/auth/verificar-cpf/:cpf` | Rate limit dedicado; **não retorna dados cadastrais** |
| `POST /api/auth/cadastro-clube` | Rate limit + aceite legal obrigatório |
| `GET /api/legal/:slug` | Whitelist de slugs (`regulamento`, `privacidade`) |
| `GET /api/health` | Apenas `{ ok: true }` |
| `GET /uploads/*` | Arquivos estáticos (imagens de brindes) |

### Rotas do cliente (exigem JWT de cliente)

- Prefixo `/api/cliente/*` protegido por `requireAuth` no router inteiro.
- O **CPF usado nas consultas vem do token**, não de parâmetros enviados pelo cliente.
- Atualização de perfil **bloqueia alteração de CPF** (`routes/cliente.js`).

### Rotas administrativas

- `POST /api/admin/auth/login` — rate limit + credenciais admin.
- Demais rotas em `/api/admin/*`, `/api/admin/brindes/*`, `/api/admin/legal/*` — `requireAdmin` após login.

---

## 5. Proteção contra abuso e ataques automatizados

### 5.1 Rate limiting

Implementado com `express-rate-limit` (`middleware/rateLimit.js`):

| Alvo | Janela | Limite padrão | Variável de ambiente |
|------|--------|---------------|----------------------|
| Rotas `/api/auth/*` (login, cadastro) | 15 min | 40 req/IP | `RATE_LIMIT_AUTH_MAX` |
| `GET /api/auth/verificar-cpf/:cpf` | 15 min | 25 req/IP | `RATE_LIMIT_CPF_MAX` |
| `POST /api/admin/auth/login` | 15 min | 15 req/IP | `RATE_LIMIT_ADMIN_MAX` |

Resposta ao exceder: `"Muitas tentativas. Aguarde alguns minutos e tente novamente."`

### 5.2 Anti-enumeração de CPF

**Antes:** `verificar-cpf` devolvia o objeto `cliente` completo do ERP.  
**Agora:** resposta restrita a:

```json
{
  "existeNoSistema": true,
  "cadastradoNaPlataforma": false
}
```

Isso impede que terceiros consultem nome, e-mail, endereço etc. apenas testando CPFs.

### 5.3 Limite de payload

- Body JSON limitado a **128 KB** (`express.json({ limit: "128kb" })` em `index.js`).

### 5.4 Trust proxy

- `app.set("trust proxy", TRUST_PROXY_HOPS)` para rate limit correto atrás de nginx/reverse proxy.

---

## 6. Segurança HTTP e rede

| Medida | Detalhe | Arquivo |
|--------|---------|---------|
| Helmet | Headers de segurança (CSP desabilitado na API; CORP `cross-origin` para imagens) | `index.js` |
| CORS | Se `CORS_ORIGINS` estiver definido, só origens listadas são aceitas; caso contrário, modo permissivo (útil em rede local/dev) | `config/security.js` |
| Avisos na inicialização | Em `NODE_ENV=production`, o servidor alerta sobre secrets fracos, CORS aberto e senha admin em texto | `config/security.js` |

### Configuração recomendada em produção (`.env`)

```env
NODE_ENV=production
SESSION_SECRET=<chave aleatória longa, 32+ caracteres>
ADMIN_SESSION_SECRET=<outra chave distinta>
ADMIN_SENHA_HASH=<gerado com npm run hash-admin-senha>
CORS_ORIGINS=https://<domínio-oficial-do-clube>
TRUST_PROXY_HOPS=1
```

O arquivo `server/.env` **não deve ser versionado** (está no `.gitignore`). Credenciais de PostgreSQL, ERP, WR PDV e admin ficam apenas no servidor.

---

## 7. Banco de dados e SQL

| Medida | Detalhe |
|--------|---------|
| Queries parametrizadas | Uso de `$1`, `$2`, … em todo o PostgreSQL da aplicação |
| WR PDV | Filtros por CPF/cupom/data como parâmetros; nomes de tabela mensal gerados internamente (`tab_venda_MMYY`) |
| Isolamento por usuário | Rotas de cliente sempre amarradas ao CPF do JWT |

Não há concatenação de entrada do usuário em SQL nas rotas principais da aplicação.

---

## 8. Proteção de conteúdo e XSS

| Medida | Detalhe | Arquivo |
|--------|---------|---------|
| Escape HTML | Texto legal escapado antes de `dangerouslySetInnerHTML` | `client/src/utils/legalContent.js` |
| API legal pública | Não expõe `adminUsuario` (quem editou o documento) | `services/legalService.js` → `mapRowPublico()` |
| Edição legal | Somente admin autenticado (`/api/admin/legal`) | `routes/adminLegal.js` |

Regulamento e privacidade exibidos ao cliente passam por renderização com escape; tags `<script>` inseridas no painel admin não executam no navegador.

---

## 9. Tratamento de erros e vazamento de informação

| Medida | Detalhe | Arquivo |
|--------|---------|---------|
| Filtro de mensagens | Erros da API ERP/Java com stack trace são substituídos por mensagens genéricas | `utils/mensagemCliente.js` |
| Erros 500 | Handler global usa `mensagemParaCliente()` em vez de expor `err.message` cru | `index.js` |
| Padrões bloqueados | Inclui `ECONNREFUSED`, erros PostgreSQL, stack traces, pacotes Java internos | `utils/mensagemCliente.js` |

Logs completos continuam no **console do servidor** (acesso restrito à equipe de infra).

---

## 10. Upload de arquivos (brindes)

| Medida | Detalhe | Arquivo |
|--------|---------|---------|
| Autenticação | Upload apenas via rotas admin | `routes/adminBrindes.js` |
| Tamanho máximo | 5 MB | multer `limits` |
| Tipos permitidos | JPG, PNG, WEBP, GIF (MIME + extensão) | `fileFilter` |
| Nome do arquivo | `timestamp-UUID` (não usa nome original) | `diskStorage` |
| Servir arquivos | Público em `/uploads/brindes/` (necessário para `<img>` no catálogo) | `index.js` |

**Limitação:** quem conhece a URL pode acessar a imagem; não há autenticação na leitura estática.

---

## 11. Integrações externas

| Sistema | Uso | Observação de segurança |
|---------|-----|-------------------------|
| API ERP | Cadastro e consulta de clientes | Credenciais em `.env`; tráfego HTTP interno — recomenda-se rede segmentada |
| WR PDV (PostgreSQL) | Vendas e cupons | Usuário tipicamente read-only; credenciais em `.env` |
| PostgreSQL (app) | Dados do clube | Acesso apenas pelo backend |

Credenciais **nunca** devem ser commitadas no repositório. Usar senhas fortes e distintas para cada sistema.

---

## 12. Dados pessoais e conformidade (LGPD)

A plataforma trata dados no contexto do programa de relacionamento. Medidas técnicas alinhadas à LGPD:

- Consentimento registrado (`aceite_regulamento_em`, `aceite_privacidade_em` na tabela `usuario`).
- Política de Privacidade publicada e versionável (`conteudo_legal`).
- Minimização na API pública (`verificar-cpf` sem vazamento de cadastro).
- Direitos do titular descritos na política; atendimento via canais da loja / área Meu contato.

**Responsável pelo tratamento (controlador):** Kimp Comércio de Alimentos Ltda. — CNPJ 00.289.167/0001-14.

---

## 13. Checklist operacional (produção)

- [ ] `SESSION_SECRET` e `ADMIN_SESSION_SECRET` fortes e distintos
- [ ] `ADMIN_SENHA_HASH` configurado; `ADMIN_SENHA` em texto removido
- [ ] `CORS_ORIGINS` com domínio oficial do clube
- [ ] `NODE_ENV=production`
- [ ] HTTPS no proxy (nginx/Caddy) na borda
- [ ] `.env` com permissões restritas no servidor (`chmod 600`)
- [ ] PostgreSQL e WR PDV não expostos à internet pública
- [ ] Backups do banco `superama` com criptografia/acesso controlado
- [ ] Reinício do serviço após alterações de segurança no `.env`

---

## 14. Limitações conhecidas (não implementado)

Itens conscientemente fora do escopo atual ou que exigem evolução futura:

| Item | Risco residual | Mitigação sugerida |
|------|----------------|-------------------|
| JWT em `localStorage` | Roubo via XSS | Cookies `httpOnly` + CSRF token (refatoração) |
| Uploads públicos | URL conhecida = acesso à imagem | URLs assinadas ou proxy autenticado |
| Sem MFA | Conta comprometida com senha vazada | 2FA no admin e/ou clientes críticos |
| Sem revogação de JWT | Token roubado válido até expirar | Blacklist ou sessões no servidor |
| CORS aberto se `CORS_ORIGINS` vazio | Sites terceiros chamam API no browser | Sempre definir em produção |
| Tráfego ERP em HTTP | Sniffing na rede interna | TLS ou VPN entre servidores |

---

## 15. Referência rápida de arquivos

| Arquivo | Função de segurança |
|---------|---------------------|
| `config/security.js` | Secrets, CORS, avisos de configuração |
| `middleware/rateLimit.js` | Limites de requisição |
| `middleware/requireAuth.js` | Autenticação cliente |
| `middleware/requireAdmin.js` | Autenticação admin |
| `services/sessionToken.js` | JWT cliente |
| `services/adminToken.js` | JWT admin |
| `services/adminAuth.js` | Validação senha admin (bcrypt) |
| `services/usuarioService.js` | bcrypt senhas cliente |
| `utils/senha.js` | Regras de tamanho de senha |
| `utils/mensagemCliente.js` | Sanitização de erros |
| `routes/auth.js` | Login, verificar-cpf, cadastro |
| `routes/cliente.js` | Área autenticada do participante |
| `routes/admin.js` | Painel administrativo |
| `index.js` | Helmet, CORS, limites globais |
| `client/src/utils/legalContent.js` | Escape HTML documentos legais |
| `client/src/utils/session.js` | Armazenamento de sessão cliente |

---

## 16. Contato interno

Dúvidas sobre este documento ou incidentes de segurança devem ser tratados pela equipe de TI responsável pela plataforma do Clube Superama+, com registro do ocorrido e, se aplicável, comunicação à ANPD e aos titulares conforme a LGPD (art. 48).

---

*Documento gerado para uso interno. Não distribuir externamente sem revisão jurídica.*

# Superama — Login

Tela de login com **React** (Vite) e **Node.js** (Express), integrada à API de autenticação interna.

## Fluxo de autenticação

1. O servidor obtém um **token novo** em `POST /v1.1/auth` a cada requisição à API externa.
2. **Primeiro acesso:** consulta `GET /v1.6/clientes/cnpj_cpf/{CPF}` — se existir, grava a senha (hash) na tabela `usuario` do PostgreSQL (`superama`).
3. **Próximos acessos:** valida CPF + senha apenas no banco local.
4. O frontend envia **CPF/CNPJ** e **senha** para `POST /api/auth/login`.

## Pré-requisitos

- Node.js 18+
- PostgreSQL em `localhost` (usuário com permissão para criar o banco `superama`)
- Acesso à rede onde a API está (`http://10.1.1.198:9000`)

## Configuração

1. Instale as dependências:

```bash
npm run install:all
```

2. Copie e edite o `.env` do servidor:

```bash
copy server\.env.example server\.env
```

Edite `server\.env`:

```env
PORT=3001
API_BASE_URL=http://10.1.1.198:9000
API_USUARIO=seu_usuario_da_api
API_SENHA=sua_senha_da_api
AUTH_TOKEN_HEADER=token

PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=sua_senha_postgres
PG_DATABASE=superama
```

> **Header do token:** se a API usar outro nome (ex.: `Authorization`), altere `AUTH_TOKEN_HEADER`.

O servidor cria automaticamente o banco `superama` e a tabela `usuario` na primeira execução.

## Executar

```bash
npm run dev
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:3001  

### Acessar pelo celular (rede local)

O frontend e o backend escutam em **todas as interfaces** (`0.0.0.0`). Ao subir o Vite, aparece no terminal algo como:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

No celular (mesmo Wi‑Fi), abra o endereço **Network** — ex.: `http://192.168.1.10:5173`.

> Use sempre a porta **5173** no celular. As chamadas `/api` passam pelo proxy do Vite no PC; não é preciso abrir a 3001 no celular.

Se não conectar, libere as portas **5173** e **3001** no Firewall do Windows para rede privada.

## Estrutura

```
superama/
├── client/          # React (tela de login)
├── server/          # Node.js (proxy para a API)
└── package.json     # scripts dev em paralelo
```

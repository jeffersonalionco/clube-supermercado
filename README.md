# Superama — Clube do Cliente

App web do clube de clientes do supermercado. **React** (Vite) no frontend e **Node.js** (Express) + **PostgreSQL** no backend, integrado à API interna.

## Funcionalidades

- Login com CPF/CNPJ e senha
- Cadastro no clube
- Home, perfil, edição de dados e contato
- Histórico de compras

## Pré-requisitos

- Node.js 18+
- PostgreSQL em `localhost`
- Acesso à API externa (`http://10.1.1.198:9000`)

## Configuração

```bash
npm run install:all
cp server/.env.example server/.env
```

Edite `server/.env` com as credenciais da API e do PostgreSQL. O servidor cria o banco `superama` e a tabela `usuario` na primeira execução.

## Executar

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

No celular (mesma rede Wi‑Fi), use o endereço **Network** que o Vite exibe no terminal (porta 5173). As chamadas `/api` passam pelo proxy do Vite.

## Estrutura

```
clube-supermercado/
├── client/     # React
├── server/     # Express + PostgreSQL
└── package.json
```

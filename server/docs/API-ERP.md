# Integração API ERP (RP Info)

## Documentação oficial

- Swagger / documentação:  
  https://servicosflex.rpinfo.com.br:7443/v1.0/documentacao?location=documentacao#/

## Base usada pelo Clube Superama+

- Ambiente interno (produção/loja): `API_BASE_URL` no `server/.env`  
  Padrão no projeto: `http://10.1.1.198:9000`

Autenticação: `POST /v1.1/auth` (usuário/senha → token no header configurado em `AUTH_TOKEN_HEADER`, padrão `token`).

## Endpoints principais usados neste projeto

| Uso | Método | Endpoint |
|-----|--------|----------|
| Login API | POST | `/v1.1/auth` |
| Buscar cliente por CPF/CNPJ | GET | `/v1.6/clientes/cnpj_cpf/{documento}` |
| **Cadastro novo (clube)** | **POST** | **`/v2.0/clientes`** |
| Atualizar cliente | PUT | `/v1.8/clientes/{codigo}` |
| Produto por unidade | (ver `apiClient.js`) | produtos / preço 2 |

Implementação: `server/services/apiClient.js`  
Payload de cadastro: `server/services/cadastroCliente.js`  
Rota do clube: `POST /api/auth/cadastro-clube` → monta payload → `cadastrarClienteApi()`.

# Clube Superama+ — versionamento

## Versão atual

- **v0.9.0** — baseline pré-lançamento (estado congelado antes do go-live)

## Como voltar para esta versão

```bash
git fetch --tags
git checkout v0.9.0
cd client && npm run build
# reiniciar o PM2 / servidor
```

Para continuar desenvolvendo a partir dela em uma branch:

```bash
git checkout -b hotfix/from-v0.9.0 v0.9.0
```

## Próximas versões

- `v1.0.0` — go-live em produção
- `v1.0.x` — correções após o lançamento
- `v1.x.0` — melhorias maiores

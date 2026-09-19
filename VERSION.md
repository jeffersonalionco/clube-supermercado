# Clube Superama+ — versionamento

## Versão atual

- **v0.10.0** — snapshot atual: catálogo Meta + Pixel (ViewContent/AddToCart/Purchase), encomenda da padaria pelo WhatsApp, hub do perfil e marketing WhatsApp

## Como voltar para esta versão

```bash
git fetch --tags
git checkout v0.10.0
cd client && npm run build
# copiar o build para server/public se for o fluxo de produção
# reiniciar o PM2 / servidor
```

Para continuar desenvolvendo a partir dela em uma branch:

```bash
git checkout -b hotfix/from-v0.10.0 v0.10.0
```

## Histórico

- `v0.9.0` — baseline pré-lançamento (estado congelado antes do go-live)
- `v0.10.0` — catálogo Meta, Pixel, encomenda WhatsApp da padaria

## Próximas versões

- `v1.0.0` — go-live em produção
- `v1.0.x` — correções após o lançamento
- `v1.x.0` — melhorias maiores

# CI/CD — o Actions constrói, o VPS só puxa

**Desde 16/09/2026.** Antes, o Coolify rodava `docker build` **dentro do VPS que
serve produção**. Em 16/09, sob o teto de CPU da Hostinger, o `npm ci` deste
projeto passou 20 minutos baixando e morreu com `ECONNRESET` — com ~25% de um
núcleo, cada handshake TLS leva 1,4 s e a conexão cai. A tentativa deixou
produção inutilizável das 07:40 às 08:20 BRT.

Agora nenhum `docker build` roda no VPS.

```
push na develop ─► validate ─► build (runner) ─► GHCR ─► deploy: Coolify PUXA ─► prova
push na main    ─► validate ─► build (runner) ─► GHCR ─► [APROVAÇÃO] ─► deploy ─► prova
```

## As `VITE_*` agora vêm de GitHub Variables

Esta é a diferença que mais muda o dia a dia. Antes quem fornecia as variáveis de
build era o painel do Coolify: o CI construía com **outros** valores só para
testar e jogava fora. Por isso o hash do bundle do CI nunca batia com o do ar, e
`confirmar-bundle.sh` tinha um caminho de "⚠️ trocou, mas com outro hash".

Agora é o mesmo artefato, e **o hash tem de bater exatamente**.

| Variable | vale para |
|---|---|
| `VITE_API_URL_PROD` / `_HML` | fallback (o `API_BY_HOST` resolve em runtime) |
| `VITE_SUPABASE_URL_PROD` / `_HML` | `iprdyorx…` / `ytjpdvj…` |
| `VITE_SUPABASE_ANON_KEY_PROD` / `_HML` | chave `anon` — pública por natureza |
| `VITE_WHATSAPP_NUMBER`, `VITE_FEEDBACK_EMAIL`, `VITE_FEEDBACK_MIN_NAVIGATIONS` | comuns |

⚠️ **Uma imagem por ambiente.** O Vite grava as `VITE_*` **inline** no bundle:
não há como trocá-las depois sem reconstruir. `prod-<sha>` e `hml-<sha>` são
artefatos diferentes, e subir o de um ambiente no outro dá **401 em toda chamada
autenticada** (está no troubleshooting do `CLAUDE.md`).

⚠️ **Trocar chave de Supabase é trocar Variable, não mexer no Coolify.** O painel
do Coolify não influencia mais o build.

## A guarda contra tela branca

`src/shared/lib/supabase.ts` lança **no import** quando a URL ou a chave faltam —
o app não renderiza nada, a usuária vê tela branca, e o container sobe
"saudável". Por isso o `Dockerfile` falha de propósito se as variáveis chegarem
vazias, e ainda faz `grep` da URL dentro do bundle gerado. Falhar no build é
barato; descobrir isso em produção não é.

## Workflows

| arquivo | dispara em | gate |
|---|---|---|
| `deploy-homologation.yml` | push na `develop`, ou dispatch | não |
| `deploy-production.yml` | push na `main`, ou dispatch | **sim** — `environment: production`, revisor `joaoivson` |
| `limpar-ghcr.yml` | cron semanal | — mantém as 15 últimas versões |

## Type check — o comando da raiz não valida nada

`npx tsc --noEmit` na raiz **sai 0 mesmo com erro de tipo**: o `tsconfig.json`
tem `"files": []`. Só `-p tsconfig.app.json` olha o `src/`.

Há erros pré-existentes, então o critério é **"não aumentou"**, não "zero" — e a
baseline **difere por branch**: `develop` 25, `main` 26. Um cherry-pick que
esqueça isso reprova com "o número aumentou" num commit que não encostou em tipo
nenhum.

## Duas provas depois do deploy

1. `confirmar-bundle.sh` — o hash do bundle no ar tem de virar **exatamente** o
   da imagem publicada (lido de dentro dela, com `docker run … ls`)
2. `/version.json` tem de responder o SHA. O `nginx.conf` serve esse caminho com
   `no-store` — `.json` não está na lista que o Cloudflare cacheia por padrão,
   mas depender disso seria frágil

## Rollback — segundos, sem build

```bash
gh workflow run deploy-production.yml -f tag=prod-<sha-anterior>
```

O input `tag` **pula** o job `build`: reaponta a imagem já publicada e redeploya.

## Scripts

| script | o que faz |
|---|---|
| `deploy-imagem.sh` | trava `build_pack` → PATCH da tag → dispara → poll até `finished` → confere |
| `confirmar-bundle.sh <url> <antes> <esperado>` | o bundle no ar mudou, e é o esperado |
| ~~`aguardar-build.sh`~~, ~~`trigger-deploy.sh`~~ | mortos: serializavam builds no VPS. Nenhum workflow chama |

# Imagem do frontend — construída no GitHub Actions, NUNCA no VPS.
#
# Por que mudou (16/09/2026): o Coolify construía dentro do servidor que serve
# produção. Sob o teto de CPU que a Hostinger aplicou, o `npm ci` deste
# Dockerfile passou 20 minutos baixando e morreu com `ECONNRESET` — com ~25%
# de um núcleo, cada handshake TLS leva 1,4s e a conexão cai. A tentativa
# deixou produção inutilizável das 07:40 às 08:20 BRT. Agora o build é no
# runner e o VPS só puxa a imagem.
#
# ## As VITE_* entram AQUI, no build
#
# O Vite grava as variáveis INLINE no bundle — não há como trocá-las depois
# sem reconstruir. Por isso a imagem é uma POR AMBIENTE (`prod-<sha>` e
# `hml-<sha>`): produção e homologação apontam para projetos Supabase
# diferentes, e subir o bundle de um no outro dá 401 em toda chamada
# autenticada (já aconteceu, está no troubleshooting do CLAUDE.md).

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# ARGs DEPOIS do `npm ci`: as variáveis mudam por ambiente e a cada release, e
# declará-las antes invalidaria a camada de node_modules em todo build.
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
# O `docker build` avisa "SecretsUsedInArgOrEnv" na linha abaixo. É falso
# positivo: a chave `anon`/`publishable` do Supabase é feita para viver no
# navegador — ela já está no bundle público hoje. O que NÃO pode entrar aqui
# é a `service_role`/`secret`, que o frontend nunca usa.
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_WHATSAPP_NUMBER
ARG VITE_FEEDBACK_EMAIL
ARG VITE_FEEDBACK_MIN_NAVIGATIONS
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_WHATSAPP_NUMBER=$VITE_WHATSAPP_NUMBER \
    VITE_FEEDBACK_EMAIL=$VITE_FEEDBACK_EMAIL \
    VITE_FEEDBACK_MIN_NAVIGATIONS=$VITE_FEEDBACK_MIN_NAVIGATIONS

# Guarda contra o pior modo de falha desta imagem: `src/shared/lib/supabase.ts`
# lança no IMPORT quando a URL ou a chave faltam — o app não renderiza nada, a
# usuária vê tela branca, e o container sobe "saudável". Falhar no build é
# barato; descobrir isso em produção não é.
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" || { \
      echo "ERRO: VITE_SUPABASE_URL/ANON_KEY vazias — supabase.ts faria throw e a tela ficaria branca."; \
      exit 1; }

# E a prova de que a variável REALMENTE entrou no bundle (o Vite ignora, em
# silêncio, variável que não comece com VITE_ ou que chegue depois do build).
RUN npm run build && grep -q "$VITE_SUPABASE_URL" dist/assets/index-*.js

# Marcador de versão servido pelo nginx. O hash do bundle já prova que o
# conteúdo mudou; isto diz QUAL commit é, que é o que o CI compara.
ARG GIT_SHA=dev
RUN printf '{"version":"%s"}' "$GIT_SHA" > dist/version.json

FROM nginx:alpine

ARG GIT_SHA=dev
LABEL org.opencontainers.image.source=https://github.com/joaoivson/marketdash-frontend \
      org.opencontainers.image.revision=$GIT_SHA

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

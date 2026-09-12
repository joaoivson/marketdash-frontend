#!/usr/bin/env bash
#
# Confirma que o site passou a servir o bundle NOVO depois do deploy.
#
# Uso: confirmar-bundle.sh <url-do-site> <hash-antes> [<hash-esperado>]
#
# Por que existe. "CI verde" só dizia que o webhook do Coolify foi aceito. Três
# vezes registradas (a última em 04/09/2026) o passo de disparo falhou ou o
# swap do container não aconteceu, e o ambiente continuou servindo o bundle
# ANTIGO — em silêncio, com o Actions verde ou com um vermelho que parecia
# problema de build. Quem olhava o site via a versão velha sem nenhum aviso.
#
# O nome do arquivo do Vite é hash do conteúdo, então ele é a prova de que o
# código novo está no ar. Este script espera o nome MUDAR.
#
# Três desfechos, de propósito:
#   - servido == esperado  → ✅ confirmação exata: é o build deste commit.
#   - servido != antes     → ⚠️  trocou, mas o hash não bate com o do CI. Quase
#                             sempre é VITE_API_URL diferente entre o CI e o
#                             Coolify (a env entra INLINE no bundle e muda o
#                             hash). Deploy aconteceu; avisa e passa.
#   - servido == antes     → ❌ o bundle velho continua no ar. É a falha que
#                             este script existe para tornar barulhenta.

set -uo pipefail   # sem -e: falha de rede não pode derrubar o job sozinha.

site="${1:?informe a URL do site}"
antes="${2:-}"
esperado="${3:-}"

LIMITE_SEGUNDOS=720   # 12 min. Swap do container leva ~4.
INTERVALO=20

servido_agora() {
  curl --silent --max-time 25 "$site/" 2>/dev/null \
    | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1
}

echo "→ Confirmando que $site passou a servir o bundle novo"
echo "   antes do deploy: ${antes:-(desconhecido)}"
echo "   esperado (build do CI): ${esperado:-(não informado)}"

inicio=$(date +%s)
ultimo=""

while true; do
  decorrido=$(( $(date +%s) - inicio ))
  atual=$(servido_agora)

  if [ -n "$atual" ] && [ "$atual" != "$ultimo" ]; then
    echo "   [${decorrido}s] servindo: $atual"
    ultimo="$atual"
  fi

  if [ -n "$esperado" ] && [ "$atual" = "$esperado" ]; then
    echo "✅ Bundle deste commit está no ar: $atual"
    exit 0
  fi

  if [ -n "$antes" ] && [ -n "$atual" ] && [ "$atual" != "$antes" ]; then
    if [ -z "$esperado" ]; then
      echo "✅ Bundle mudou de $antes para $atual."
      exit 0
    fi
    echo "::warning title=Bundle trocou, mas com outro hash::No ar está \`$atual\`; o build do CI gerou \`$esperado\`. O deploy ACONTECEU (mudou de \`$antes\`). Causa provável: VITE_API_URL diferente entre o CI e o Coolify — a variável entra inline no bundle e muda o hash. Vale conferir se o site está apontando para a API certa."
    exit 0
  fi

  if [ "$decorrido" -ge "$LIMITE_SEGUNDOS" ]; then
    if [ -z "$atual" ]; then
      echo "::error title=Não foi possível ler o bundle servido::Em ${LIMITE_SEGUNDOS}s o HTML de $site nunca referenciou um \`/assets/index-*.js\`. O site pode estar fora do ar ou servindo outra coisa."
      exit 1
    fi
    echo "::error title=O site ainda serve o bundle ANTIGO::Depois de ${LIMITE_SEGUNDOS}s, $site continua em \`$atual\` — o mesmo de antes do deploy. O webhook foi aceito mas o código novo NÃO está no ar. Confira o deployment no Coolify; historicamente a correção é \`gh run rerun <id> --failed\`."
    exit 1
  fi

  sleep "$INTERVALO"
done

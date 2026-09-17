// Títulos curtos de mídia do Instagram para listas compactas.

/** "Comente " ALGODÃO " para…" → "ALGODÃO". O backend faz o mesmo em palavra_sugerida. */
export const palavraPedida = (legenda?: string | null) => {
  const achou = (legenda || "").match(/coment[ea]\s*["“”'‘’]\s*([^"“”'‘’]{1,40}?)\s*["“”'‘’]/i);
  return achou ? achou[1].trim() : null;
};

/**
 * Título curto de uma mídia: a palavra que a legenda pede ("ALGODÃO") ou a
 * primeira frase limpa. A legenda inteira ("✨Comente " MEIA " para receber o
 * link agora! E siga @...") estourava a linha e cortava no meio da tela.
 */
export const tituloDaMidia = (item: {
  palavra_sugerida?: string | null;
  caption_preview?: string | null;
  ad_title?: string | null;
}) => {
  const palavra = item.palavra_sugerida || palavraPedida(item.caption_preview);
  if (palavra) return palavra;
  const limpa = (item.caption_preview || item.ad_title || "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return limpa || "Sem legenda";
};


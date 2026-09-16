import { useEffect, useState } from "react";
import { Instagram } from "lucide-react";

import { cn } from "@/shared/lib/utils";

/**
 * Miniatura de um post do Instagram, com placeholder quando não há imagem.
 *
 * A URL vem do CDN da Meta e é **assinada e temporária** — passada a validade,
 * o `scontent-*.cdninstagram.com` devolve 403 para qualquer um. O backend já
 * evita mandar URL que sabe estar vencida, mas o post pode ter sido apagado ou
 * a assinatura cair antes disso, e aí a imagem quebra no meio da tela.
 *
 * Por isso o `onError` cai no MESMO placeholder do caso "sem imagem", em vez de
 * esconder o `<img>`: esconder deixava um quadrado vazio no lugar, que parece
 * defeito do nosso layout.
 */
export const MiniaturaInstagram = ({
  url,
  className,
  iconeClassName,
}: {
  url?: string | null;
  className?: string;
  iconeClassName?: string;
}) => {
  const [quebrou, setQuebrou] = useState(false);

  // Trocar de automação (ou renovar a URL) tem de dar nova chance à imagem —
  // sem isto o placeholder de um card grudaria no card seguinte.
  useEffect(() => setQuebrou(false), [url]);

  if (!url || quebrou) {
    return (
      <span
        className={cn("flex items-center justify-center rounded-lg bg-muted", className)}
        aria-hidden
      >
        <Instagram className={cn("text-muted-foreground", iconeClassName)} />
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={cn("rounded-lg object-cover", className)}
      onError={() => setQuebrou(true)}
    />
  );
};

export default MiniaturaInstagram;

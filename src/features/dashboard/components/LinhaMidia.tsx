import type { ReactNode } from "react";

import { MiniaturaInstagram } from "@/features/dashboard/components/MiniaturaInstagram";
import { cn } from "@/shared/lib/utils";

/** Uma linha de mídia (publicação ou anúncio) com uma ação à direita. */
export const LinhaMidia = ({
  thumbnail,
  titulo,
  tipo,
  meta,
  acao,
  className,
}: {
  thumbnail?: string | null;
  titulo: string;
  tipo: "publicacao" | "anuncio";
  meta?: string;
  acao?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex min-w-0 items-center gap-3 p-3", className)}>
    <MiniaturaInstagram url={thumbnail} className="h-12 w-12 flex-shrink-0 rounded-lg" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">{titulo}</p>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "flex-shrink-0 rounded px-1.5 py-px text-[10px] font-semibold",
            tipo === "anuncio" ? "bg-amber-500/15 text-amber-500" : "bg-muted text-muted-foreground",
          )}
        >
          {tipo === "anuncio" ? "Anúncio" : "Publicação"}
        </span>
        {meta && <span className="truncate">{meta}</span>}
      </p>
    </div>
    {acao && <div className="flex-shrink-0">{acao}</div>}
  </div>
);

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LinhaMidia } from "@/features/dashboard/components/LinhaMidia";
import { tituloDaMidia } from "@/shared/lib/instagram-midia";
import { cn } from "@/shared/lib/utils";
import type { InstagramMediaItem } from "@/shared/types/instagram";

const MIN_PARA_BUSCA = 6;

const comentarios = (n?: number | null) =>
  `${n ?? 0} ${n === 1 ? "comentário" : "comentários"}`;

/**
 * Escolha dos anúncios do mesmo produto. Os sugeridos (mesma palavra-chave)
 * vêm num grupo à parte, acima: é quase sempre o que a aluna procura.
 */
export const VincularAnunciosModal = ({
  aberto,
  onFechar,
  anuncios,
  sugeridos,
  vinculados,
  automacaoId,
  salvando,
  onSalvar,
}: {
  aberto: boolean;
  onFechar: () => void;
  anuncios: InstagramMediaItem[];
  sugeridos: Set<string>;
  vinculados: string[];
  automacaoId: number;
  salvando: boolean;
  onSalvar: (ids: string[]) => void;
}) => {
  const [marcados, setMarcados] = useState<Set<string>>(new Set(vinculados));
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (aberto) {
      setMarcados(new Set(vinculados));
      setBusca("");
    }
  }, [aberto, vinculados]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return anuncios;
    return anuncios.filter((a) =>
      `${a.caption_preview || ""} ${a.ad_title || ""}`.toLowerCase().includes(termo),
    );
  }, [anuncios, busca]);

  const grupos = [
    { titulo: "Mesma palavra-chave", itens: filtrados.filter((a) => sugeridos.has(a.id)) },
    { titulo: "Outros anúncios", itens: filtrados.filter((a) => !sugeridos.has(a.id)) },
  ].filter((g) => g.itens.length > 0);

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const mudou =
    marcados.size !== vinculados.length || vinculados.some((id) => !marcados.has(id));

  return (
    <ResponsiveModal
      open={aberto}
      onOpenChange={(v) => !v && !salvando && onFechar()}
      title="Vincular anúncios"
      description="Os comentários nos anúncios marcados recebem o mesmo direct desta automação."
      contentClassName="sm:max-w-lg"
    >
      <div className="space-y-4">
        {anuncios.length > MIN_PARA_BUSCA && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar anúncio"
              className="pl-9"
              aria-label="Buscar anúncio pela legenda"
            />
          </div>
        )}

        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {grupos.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum anúncio com “{busca}”.
            </p>
          )}
          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{grupo.titulo}</p>
              <ul className="overflow-hidden rounded-xl border border-border divide-y divide-border">
                {grupo.itens.map((a) => {
                  const emOutra =
                    a.automation_id_vinculada != null && a.automation_id_vinculada !== automacaoId;
                  return (
                    <li key={a.id}>
                      <label
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center pl-3 transition-colors duration-150 hover:bg-accent/50",
                          marcados.has(a.id) && "bg-primary/5",
                        )}
                      >
                        <Checkbox
                          checked={marcados.has(a.id)}
                          onCheckedChange={() => alternar(a.id)}
                          aria-label={`Vincular ${tituloDaMidia(a)}`}
                        />
                        <LinhaMidia
                          className="flex-1"
                          thumbnail={a.thumbnail_url}
                          titulo={tituloDaMidia(a)}
                          tipo="anuncio"
                          meta={`${comentarios(a.comentarios)}${emOutra ? " · já vinculado" : ""}`}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => onSalvar([...marcados])} disabled={!mudou || salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar ({marcados.size})
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
};

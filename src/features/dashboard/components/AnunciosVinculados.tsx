import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MiniaturaInstagram } from "@/features/dashboard/components/MiniaturaInstagram";
import { useToast } from "@/hooks/use-toast";
import { listInstagramAnuncios, setAutomationAnuncios } from "@/services/instagram.service";
import { cn } from "@/shared/lib/utils";
import type { InstagramAutomation, InstagramMediaItem } from "@/shared/types/instagram";

/** Mesma normalização do backend para comparar "ALGODÃO" com "algodao". */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Anúncios do mesmo produto que esta automação também responde.
 *
 * O anúncio é o mesmo vídeo impulsionado, com a mesma legenda e o mesmo link — a
 * aluna pensa no PRODUTO. Sem o vínculo, o card do produto contava só o post
 * orgânico (5 comentários) e o anúncio (29) ficava sem resposta.
 *
 * Sugere pela palavra que a legenda do anúncio pede ("Comente ALGODÃO") contra
 * as palavras da automação. Salva à parte do formulário: o vínculo vale na hora
 * e não depende de publicar de novo.
 */
export const AnunciosVinculados = ({
  automacaoId,
  palavras,
  vinculados,
  onSalvo,
}: {
  automacaoId: number;
  palavras: string[];
  vinculados: string[];
  onSalvo: (automacao: InstagramAutomation) => void;
}) => {
  const { toast } = useToast();
  const [anuncios, setAnuncios] = useState<InstagramMediaItem[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(vinculados));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listInstagramAnuncios()
      .then((p) => setAnuncios(p.items))
      .catch(() => setAnuncios([]));
  }, []);

  useEffect(() => setMarcados(new Set(vinculados)), [vinculados]);

  const chaves = useMemo(() => new Set(palavras.map(normalizar)), [palavras]);

  const ordenados = useMemo(() => {
    const sugerido = (a: InstagramMediaItem) =>
      !!a.palavra_sugerida && chaves.has(normalizar(a.palavra_sugerida));
    return [...(anuncios ?? [])].sort(
      (a, b) =>
        Number(vinculados.includes(b.id)) - Number(vinculados.includes(a.id)) ||
        Number(sugerido(b)) - Number(sugerido(a)) ||
        (b.comentarios ?? 0) - (a.comentarios ?? 0),
    );
  }, [anuncios, chaves, vinculados]);

  const mudou =
    marcados.size !== vinculados.length || vinculados.some((id) => !marcados.has(id));

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const salvar = async () => {
    setSalvando(true);
    try {
      const atualizada = await setAutomationAnuncios(automacaoId, [...marcados]);
      toast({
        title:
          atualizada.anuncios_vinculados.length === 1
            ? "1 anúncio vinculado"
            : `${atualizada.anuncios_vinculados.length} anúncios vinculados`,
        description: "Os próximos comentários neles já recebem o direct desta automação.",
      });
      onSalvo(atualizada);
    } catch (e) {
      toast({
        title: "Não foi possível vincular",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  if (anuncios === null) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando anúncios…
      </p>
    );
  }
  if (anuncios.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">Anúncios deste produto</p>
        <p className="text-xs text-muted-foreground">
          Marque os anúncios que devem responder com esta automação.
        </p>
      </div>

      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {ordenados.map((a) => {
          const sugerido = !!a.palavra_sugerida && chaves.has(normalizar(a.palavra_sugerida));
          const emOutra =
            a.automation_id_vinculada != null && a.automation_id_vinculada !== automacaoId;
          return (
            <li key={a.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50",
                  marcados.has(a.id) && "bg-primary/5",
                )}
              >
                <Checkbox checked={marcados.has(a.id)} onCheckedChange={() => alternar(a.id)} />
                <MiniaturaInstagram url={a.thumbnail_url} className="h-10 w-10 flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">
                    {a.caption_preview || a.ad_title || "Anúncio"}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {a.comentarios ?? 0} comentários
                    {sugerido && <span className="text-amber-500"> · mesma palavra-chave</span>}
                    {emOutra && " · hoje em outra automação"}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => void salvar()} disabled={!mudou || salvando}>
          {salvando && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Salvar anúncios
        </Button>
      </div>
    </div>
  );
};

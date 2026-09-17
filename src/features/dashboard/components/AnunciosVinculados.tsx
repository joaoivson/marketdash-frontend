import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LinhaMidia } from "@/features/dashboard/components/LinhaMidia";
import { tituloDaMidia } from "@/shared/lib/instagram-midia";
import { VincularAnunciosModal } from "@/features/dashboard/components/VincularAnunciosModal";
import { useToast } from "@/hooks/use-toast";
import { listInstagramAnuncios, setAutomationAnuncios } from "@/services/instagram.service";
import type { InstagramAutomation, InstagramMediaItem } from "@/shared/types/instagram";

/** Mesma normalização do backend para comparar "ALGODÃO" com "algodao". */
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

// Palavras que TODA automação tem: casar por elas sugeriria todos os anúncios.
const GENERICAS = new Set(["quero", "eu quero", "link", "manda", "preco", "valor", "eu"]);

/**
 * Anúncios do mesmo produto, como linhas da lista "Onde responde".
 *
 * O anúncio é o mesmo vídeo impulsionado, com a mesma legenda e o mesmo link — a
 * aluna pensa no PRODUTO. Sem o vínculo, o card contava só o post orgânico e o
 * anúncio ficava sem resposta. A escolha fica num modal: a lista aberta dentro
 * do formulário tinha 18 linhas e empurrava o resto da tela.
 */
export const AnunciosVinculados = ({
  automacaoId,
  mediaPrincipal,
  palavras,
  vinculados: todosVinculados,
  onSalvo,
}: {
  automacaoId: number;
  /** A mídia da própria automação: já coberta, nunca aparece como "vinculada". */
  mediaPrincipal?: string | null;
  palavras: string[];
  vinculados: string[];
  onSalvo: (automacao: InstagramAutomation) => void;
}) => {
  // Memoizado: o modal reinicia a seleção quando esta lista muda de identidade,
  // e um array novo a cada render apagaria o que a aluna acabou de marcar.
  const vinculados = useMemo(
    () => todosVinculados.filter((id) => id !== mediaPrincipal),
    [todosVinculados, mediaPrincipal],
  );
  const { toast } = useToast();
  const [anuncios, setAnuncios] = useState<InstagramMediaItem[] | null>(null);
  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    listInstagramAnuncios()
      // Automação criada NO anúncio: ele é a mídia principal, não um vínculo.
      .then((p) => setAnuncios(p.items.filter((a) => a.id !== mediaPrincipal)))
      .catch(() => setAnuncios([]));
  }, [mediaPrincipal]);

  // Sugere quando a palavra que a legenda pede, ou uma palavra específica da
  // automação ("boddy", "luminária"), aparece no anúncio.
  const sugeridos = useMemo(() => {
    const chaves = palavras.map(normalizar).filter((p) => p.length >= 4 && !GENERICAS.has(p));
    return new Set(
      (anuncios ?? [])
        .filter((a) => {
          const pedida = a.palavra_sugerida ? normalizar(a.palavra_sugerida) : "";
          const legenda = normalizar(`${a.caption_preview || ""} ${a.ad_title || ""}`);
          return (pedida && chaves.includes(pedida)) || chaves.some((c) => legenda.includes(c));
        })
        .map((a) => a.id),
    );
  }, [anuncios, palavras]);

  const salvar = async (ids: string[], mensagem?: string) => {
    setSalvando(true);
    try {
      const atualizada = await setAutomationAnuncios(automacaoId, ids);
      const n = atualizada.anuncios_vinculados.length;
      toast({
        title: mensagem ?? (n === 1 ? "1 anúncio vinculado" : `${n} anúncios vinculados`),
        description: n > 0 ? "Os próximos comentários neles já recebem este direct." : undefined,
      });
      onSalvo(atualizada);
      setModal(false);
    } catch (e) {
      toast({
        title: "Não foi possível salvar os anúncios",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  if (anuncios === null) {
    return (
      <div className="flex items-center gap-3 p-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    );
  }

  const porId = new Map(anuncios.map((a) => [a.id, a]));
  const pendentesSugeridos = [...sugeridos].filter((id) => !vinculados.includes(id)).length;

  return (
    <>
      {vinculados.map((id) => {
        const a = porId.get(id);
        return (
          <LinhaMidia
            key={id}
            thumbnail={a?.thumbnail_url}
            titulo={a ? tituloDaMidia(a) : "Anúncio"}
            tipo="anuncio"
            meta={a ? `${a.comentarios ?? 0} comentários` : undefined}
            acao={
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label="Desvincular anúncio"
                disabled={salvando}
                onClick={() =>
                  void salvar(
                    vinculados.filter((v) => v !== id),
                    "Anúncio desvinculado",
                  )
                }
              >
                <X className="h-4 w-4" />
              </Button>
            }
          />
        );
      })}

      {anuncios.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          Nenhum anúncio detectado ainda. Ele aparece aqui depois do primeiro comentário.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setModal(true)}
          className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary transition-colors duration-150 hover:bg-accent/50"
        >
          <Plus className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">Vincular anúncio</span>
          {pendentesSugeridos > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
              {pendentesSugeridos} {pendentesSugeridos === 1 ? "sugerido" : "sugeridos"}
            </span>
          )}
        </button>
      )}

      <VincularAnunciosModal
        aberto={modal}
        onFechar={() => setModal(false)}
        anuncios={anuncios}
        sugeridos={sugeridos}
        vinculados={vinculados}
        automacaoId={automacaoId}
        salvando={salvando}
        onSalvar={(ids) => void salvar(ids)}
      />
    </>
  );
};

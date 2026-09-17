import { useEffect, useMemo, useState } from "react";
import { Instagram, Loader2, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { LinhaMidia } from "@/features/dashboard/components/LinhaMidia";
import { palavraPedida, tituloDaMidia } from "@/shared/lib/instagram-midia";
import { useToast } from "@/hooks/use-toast";
import { listInstagramAnuncios, listInstagramMedia } from "@/services/instagram.service";
import { cn } from "@/shared/lib/utils";
import type { InstagramMediaItem } from "@/shared/types/instagram";

/** Quantos posts ficam à mostra sem abrir o modal. */
const VISIVEIS = 4;
/** Teto de páginas puxadas ao abrir o modal, para a busca ver a lista toda. */
const MAX_PAGINAS_EXTRAS = 12;

/** Busca na legenda e, no anúncio, no título que a Meta manda no webhook. */
const casaBusca = (i: InstagramMediaItem, termo: string) =>
  `${i.caption_preview || ""} ${i.ad_title || ""}`.toLowerCase().includes(termo);

const Thumb = ({
  item,
  ativo,
  onClick,
  altura,
}: {
  item: InstagramMediaItem;
  ativo: boolean;
  onClick: () => void;
  altura: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "group overflow-hidden rounded-xl border-2 text-left transition-colors",
      ativo ? "border-primary" : "border-transparent hover:border-border",
    )}
    aria-pressed={ativo}
  >
    <span className="relative block">
      {item.eh_anuncio && (
        <span className="absolute left-1.5 top-1.5 z-10 rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-black">
          Anúncio
        </span>
      )}
      {item.thumbnail_url ? (
        <img
          src={item.thumbnail_url}
          alt=""
          className={cn("w-full object-cover", altura)}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span className={cn("flex w-full items-center justify-center bg-muted", altura)}>
          <Instagram className="h-5 w-5 text-muted-foreground" />
        </span>
      )}
    </span>
    <span className="block space-y-0.5 px-2 py-1.5">
      <span className="block text-[10px] text-muted-foreground">
        {item.eh_anuncio
          ? `${item.comentarios ?? 0} ${item.comentarios === 1 ? "comentário" : "comentários"}`
          : item.timestamp
            ? new Date(item.timestamp).toLocaleDateString("pt-BR")
            : "—"}
        {item.media_product_type === "REELS" ? " · Reels" : ""}
      </span>
      <span className="block truncate text-[11px] text-foreground">
        {item.caption_preview || "(sem legenda)"}
      </span>
    </span>
  </button>
);

/**
 * Escolha da publicação onde a automação vai funcionar.
 *
 * Mostra UMA fileira com as publicações mais recentes — cobre o caso comum, que
 * é armar a automação no post que acabou de subir. A grade inteira (a conta de
 * teste tem 224 posts) empurrava os cards 2, 3 e 4 para fora da tela, e a aluna
 * nem descobria que existiam; por isso o resto vive num modal.
 *
 * A busca no modal não é enfeite: com centenas de thumbnails parecidos e legenda
 * truncada, achar "aquele da escova" rolando é inviável.
 *
 * As publicações vêm com cache de 15 min no backend; "Atualizar" força a Meta.
 */
export const SelecionarPublicacao = ({
  selecionado,
  resumo,
  onSelecionar,
}: {
  selecionado?: string | null;
  /**
   * Retrato da mídia já escolhida (vem salvo na automação). Com ele o componente
   * vira UMA linha com "Trocar": a fileira de 4 posts recentes não mostrava a
   * publicação escolhida quando ela estava além da primeira página.
   */
  resumo?: { thumbnail_url: string | null; caption_preview: string | null } | null;
  onSelecionar: (item: InstagramMediaItem) => void;
}) => {
  const { toast } = useToast();
  const [itens, setItens] = useState<InstagramMediaItem[]>([]);
  // Anúncio não está no feed: só aparece aqui depois do primeiro comentário.
  const [anuncios, setAnuncios] = useState<InstagramMediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [paginasExtras, setPaginasExtras] = useState(0);

  const carregar = async (proximoCursor?: string | null, forcar = false) => {
    const primeira = !proximoCursor;
    if (primeira) setCarregando(true);
    else setCarregandoMais(true);
    try {
      const pagina = await listInstagramMedia(proximoCursor, forcar);
      setItens((atual) => (primeira ? pagina.items : [...atual, ...pagina.items]));
      setCursor(pagina.next_cursor);
    } catch (e) {
      toast({
        title: "Erro ao carregar publicações",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
      setCarregandoMais(false);
    }
  };

  const carregarAnuncios = async () => {
    try {
      setAnuncios((await listInstagramAnuncios()).items);
    } catch {
      // Anúncio é complemento: sem ele a grade de publicações segue funcionando.
      setAnuncios([]);
    }
  };

  useEffect(() => {
    void carregar();
    void carregarAnuncios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Buscar só no que já foi paginado não serve: a conta de teste tem 224 posts e
  // o post procurado costuma estar lá no fim. Ao abrir o modal, puxa o resto das
  // páginas (o backend cacheia 15 min, então é barato). O teto evita laço infinito
  // se a Meta devolver cursor para sempre.
  useEffect(() => {
    if (!modalAberto || !cursor || carregandoMais) return;
    if (paginasExtras >= MAX_PAGINAS_EXTRAS) return;
    setPaginasExtras((n) => n + 1);
    void carregar(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalAberto, cursor, carregandoMais, paginasExtras]);

  // A escolhida sempre aparece na fileira, mesmo vindo do fim da lista pelo modal.
  const emDestaque = useMemo(() => {
    const primeiros = itens.slice(0, VISIVEIS);
    if (!selecionado || primeiros.some((i) => i.id === selecionado)) return primeiros;
    const escolhida = [...anuncios, ...itens].find((i) => i.id === selecionado);
    return escolhida ? [escolhida, ...primeiros.slice(0, VISIVEIS - 1)] : primeiros;
  }, [itens, anuncios, selecionado]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? itens.filter((i) => casaBusca(i, termo)) : itens;
  }, [itens, busca]);

  const anunciosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? anuncios.filter((i) => casaBusca(i, termo)) : anuncios;
  }, [anuncios, busca]);

  const modal = (
    <ResponsiveModal
      open={modalAberto}
      onOpenChange={setModalAberto}
      title="Escolher publicação"
      contentClassName="sm:max-w-2xl"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pela legenda"
            className="pl-9"
            aria-label="Buscar publicação pela legenda"
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          {anunciosFiltrados.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Anúncios que já receberam comentário
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {anunciosFiltrados.map((item) => (
                  <Thumb
                    key={item.id}
                    item={item}
                    ativo={selecionado === item.id}
                    onClick={() => {
                      onSelecionar(item);
                      setModalAberto(false);
                    }}
                    altura="h-[110px]"
                  />
                ))}
              </div>
              <p className="pt-2 text-xs font-medium text-muted-foreground">Publicações</p>
            </div>
          )}
          {filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma publicação com “{busca}” na legenda.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtrados.map((item) => (
                <Thumb
                  key={item.id}
                  item={item}
                  ativo={selecionado === item.id}
                  onClick={() => {
                    onSelecionar(item);
                    setModalAberto(false);
                  }}
                  altura="h-[110px]"
                />
              ))}
            </div>
          )}

          {cursor && paginasExtras >= MAX_PAGINAS_EXTRAS && (
            <div className="flex justify-center pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void carregar(cursor)}
                disabled={carregandoMais}
              >
                {carregandoMais && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </div>
    </ResponsiveModal>
  );

  if (selecionado && resumo) {
    const ehAnuncio = anuncios.some((a) => a.id === selecionado);
    return (
      <>
        <LinhaMidia
          thumbnail={resumo.thumbnail_url}
          titulo={tituloDaMidia({ caption_preview: resumo.caption_preview })}
          tipo={ehAnuncio ? "anuncio" : "publicacao"}
          // A legenda só vale como meta quando o título é a palavra; senão repete.
          meta={palavraPedida(resumo.caption_preview) ? resumo.caption_preview ?? undefined : undefined}
          acao={
            <Button variant="ghost" className="h-10" onClick={() => setModalAberto(true)}>
              Trocar
            </Button>
          }
        />
        {modal}
      </>
    );
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando suas publicações…
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma publicação encontrada nesta conta.</p>
        <Button variant="outline" size="sm" onClick={() => void carregar(null, true)}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {emDestaque.map((item) => (
          <Thumb
            key={item.id}
            item={item}
            ativo={selecionado === item.id}
            onClick={() => onSelecionar(item)}
            altura="h-[120px]"
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setModalAberto(true)}
          >
            Escolher outra publicação
          </Button>
          {anuncios.length > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-amber-500"
              onClick={() => setModalAberto(true)}
            >
              Anúncios ({anuncios.length})
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void carregar(null, true);
            void carregarAnuncios();
          }}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {modal}
    </div>
  );
};

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Check, Instagram, Loader2, Sparkles } from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  createAutomationsInBatch,
  listInstagramMedia,
} from "@/services/instagram.service";
import { cn } from "@/shared/lib/utils";
import type {
  AutomacaoLotePulada,
  InstagramMediaItem,
} from "@/shared/types/instagram";

/**
 * Cobrir várias publicações de uma vez.
 *
 * Por que esta tela existe: `escopo = post_especifico` cobre UM post. Medido em
 * 11/09/2026 numa conta real — 283 publicações, 278 pedindo "Comente X", 9 com
 * automação. Uma a uma, pela tela de edição, ela nunca alcança; e post antigo
 * continua recebendo comentário por meses.
 *
 * O desenho segue a estrutura do backend: um MODELO comum (texto da DM,
 * resposta pública, palavras genéricas) e, por post, só o que muda de verdade —
 * a palavra do produto e o link. A palavra já vem sugerida da legenda.
 */

/** Quanto o backend aceita por chamada (MAX_ITENS_LOTE). */
const MAX_POR_LOTE = 50;

/** Páginas puxadas de uma vez ao abrir — a conta que motivou tem 283 posts. */
const MAX_PAGINAS = 12;

const PALAVRAS_COMUNS_PADRAO = ["quero", "eu quero", "link", "manda"];

type LinhaPost = {
  media: InstagramMediaItem;
  palavra: string;
  link: string;
};

const PreviewPost = ({ media }: { media: InstagramMediaItem }) =>
  media.thumbnail_url ? (
    <img
      src={media.thumbnail_url}
      alt=""
      className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
      }}
    />
  ) : (
    <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
      <Instagram className="h-5 w-5 text-muted-foreground" />
    </span>
  );

/**
 * As ações aparecem DUAS vezes: no topo e no fim da lista.
 *
 * A primeira tentativa foi uma barra `sticky bottom-*`, e a validação na tela
 * derrubou: o sticky não engatava (a barra ficava no fim de uma página de ~28
 * mil px) e, mesmo se engatasse, `fixed bottom-0` cobriria o MobileBottomNav —
 * a navegação principal no celular. Duas linhas em fluxo normal não têm truque
 * nenhum para dar errado, e é o padrão que o resto do painel já usa.
 */
const BarraDeAcoes = ({
  prontas,
  salvando,
  onCriar,
  onCancelar,
}: {
  prontas: number;
  salvando: boolean;
  onCriar: () => void;
  onCancelar: () => void;
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <span className="text-sm text-muted-foreground">
      {prontas > 0 ? `${prontas} ${prontas === 1 ? "pronta" : "prontas"}` : "Cole ao menos um link"}
    </span>
    <div className="flex gap-2">
      <Button variant="ghost" onClick={onCancelar} className="flex-1 sm:flex-none">
        Cancelar
      </Button>
      <Button onClick={onCriar} disabled={!prontas || salvando} className="flex-1 sm:flex-none">
        {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar {prontas > 0 ? prontas : ""}
      </Button>
    </div>
  </div>
);

const AutomacoesEmLote = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [linhas, setLinhas] = useState<LinhaPost[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [puladas, setPuladas] = useState<AutomacaoLotePulada[]>([]);

  // O modelo, aplicado a todos.
  const [dmTexto, setDmTexto] = useState(
    "Oi! 💜 Aqui está o link que você pediu, olha lá:",
  );
  const [dmBotaoTexto, setDmBotaoTexto] = useState("Ver oferta");
  const [respostaPublicaAtiva, setRespostaPublicaAtiva] = useState(true);
  const [respostaPublica, setRespostaPublica] = useState("te mandei no direct 😍");
  const [usarPalavrasComuns, setUsarPalavrasComuns] = useState(true);
  const [ativarAgora, setAtivarAgora] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const todos: InstagramMediaItem[] = [];
      let cursor: string | null = null;
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
        const resposta = await listInstagramMedia(cursor);
        todos.push(...resposta.items);
        cursor = resposta.next_cursor;
        if (!cursor) break;
      }
      setTotalPosts(todos.length);
      // Só o que ainda não tem automação — a tela é sobre o buraco, não sobre
      // o acervo. Post já coberto aqui só daria trabalho de reler.
      setLinhas(
        todos
          .filter((m) => !m.tem_automacao)
          .map((m) => ({
            media: m,
            palavra: m.palavra_sugerida ?? "",
            link: "",
          })),
      );
    } catch (erro) {
      toast({
        title: "Não deu para carregar suas publicações",
        description: erro instanceof Error ? erro.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const atualizarLinha = (mediaId: string, campo: "palavra" | "link", valor: string) =>
    setLinhas((atuais) =>
      atuais.map((l) => (l.media.id === mediaId ? { ...l, [campo]: valor } : l)),
    );

  /**
   * Só entram no lote os posts com link preenchido. O link é o único campo que
   * não dá para inferir — e automação ativa sem link manda uma DM que não
   * resolve nada para a cliente.
   */
  const prontas = useMemo(() => linhas.filter((l) => l.link.trim()), [linhas]);

  const comSugestao = useMemo(
    () => linhas.filter((l) => l.media.palavra_sugerida).length,
    [linhas],
  );

  const enviar = async () => {
    if (!prontas.length) return;
    setSalvando(true);
    setPuladas([]);
    try {
      let criadas = 0;
      const naoEntraram: AutomacaoLotePulada[] = [];

      // Em blocos de MAX_POR_LOTE: é o teto do backend, e dá feedback no meio
      // do caminho em vez de deixar a tela parada por minutos.
      for (let i = 0; i < prontas.length; i += MAX_POR_LOTE) {
        const bloco = prontas.slice(i, i + MAX_POR_LOTE);
        const resultado = await createAutomationsInBatch({
          itens: bloco.map((l) => ({
            media_id: l.media.id,
            palavras: l.palavra.trim() ? [l.palavra.trim()] : [],
            dm_link: l.link.trim(),
            nome: l.palavra.trim() || null,
            media_thumbnail_url: l.media.thumbnail_url,
            media_caption_preview: l.media.caption_preview,
            media_permalink: l.media.permalink,
          })),
          dm_texto: dmTexto,
          dm_botao_texto: dmBotaoTexto.trim() || null,
          resposta_publica_ativa: respostaPublicaAtiva,
          resposta_publica_variacoes: respostaPublicaAtiva
            ? [respostaPublica].filter((v) => v.trim())
            : [],
          palavras_comuns: usarPalavrasComuns ? PALAVRAS_COMUNS_PADRAO : [],
          status: ativarAgora ? "ativa" : "rascunho",
        });
        criadas += resultado.criadas.length;
        naoEntraram.push(...resultado.puladas);
      }

      setPuladas(naoEntraram);
      toast({
        title: `${criadas} ${criadas === 1 ? "automação criada" : "automações criadas"}`,
        description: naoEntraram.length
          ? `${naoEntraram.length} ${naoEntraram.length === 1 ? "publicação ficou" : "publicações ficaram"} de fora — veja o motivo abaixo.`
          : "Seus posts já estão respondendo comentário.",
      });
      if (!naoEntraram.length) navigate("/dashboard/automacoes");
      else await carregar();
    } catch (erro) {
      toast({
        title: "Não deu para criar as automações",
        description: erro instanceof Error ? erro.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  const cobertos = totalPosts - linhas.length;

  return (
    <DashboardLayout title="Cobrir publicações">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-1">
          {!carregando && (
            <p className="text-sm text-muted-foreground">
              {cobertos} de {totalPosts}{" "}
              {totalPosts === 1 ? "publicação já responde" : "publicações já respondem"} comentário.
              {linhas.length > 0 && ` Faltam ${linhas.length}.`}
            </p>
          )}
          <BarraDeAcoes
            prontas={prontas.length}
            salvando={salvando}
            onCriar={enviar}
            onCancelar={() => navigate("/dashboard/automacoes")}
          />
        </header>

        {/* ---------------------------------------------------- o modelo --- */}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                1
              </span>
              <h2 className="font-medium">A mensagem, igual para todos</h2>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dm-texto">Texto do direct</Label>
              <Textarea
                id="dm-texto"
                value={dmTexto}
                onChange={(e) => setDmTexto(e.target.value)}
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dm-botao">Texto do botão</Label>
                <Input
                  id="dm-botao"
                  value={dmBotaoTexto}
                  onChange={(e) => setDmBotaoTexto(e.target.value)}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resp-publica">Resposta no comentário</Label>
                <Input
                  id="resp-publica"
                  value={respostaPublica}
                  onChange={(e) => setRespostaPublica(e.target.value)}
                  disabled={!respostaPublicaAtiva}
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-4">
              <label className="flex items-start gap-3">
                <Switch
                  checked={respostaPublicaAtiva}
                  onCheckedChange={setRespostaPublicaAtiva}
                />
                <span className="text-sm">Responder também no comentário</span>
              </label>

              <label className="flex items-start gap-3">
                <Switch checked={usarPalavrasComuns} onCheckedChange={setUsarPalavrasComuns} />
                <span className="text-sm">
                  Responder também a {PALAVRAS_COMUNS_PADRAO.map((p) => `"${p}"`).join(", ")}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Boa parte das pessoas comenta isso em vez da palavra do post.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <Switch checked={ativarAgora} onCheckedChange={setAtivarAgora} />
                <span className="text-sm">
                  Ativar agora
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Desligado, tudo fica como rascunho para você revisar antes.
                  </span>
                </span>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ as publicações --- */}
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                2
              </span>
              <h2 className="font-medium">O link de cada publicação</h2>
              {comSugestao > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  <Sparkles className="h-3 w-3" />
                  {comSugestao} com palavra já preenchida
                </span>
              )}
            </div>

            {carregando ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : linhas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todas as suas publicações já têm automação.
              </p>
            ) : (
              <ul className="divide-y">
                {linhas.map((linha) => (
                  <li key={linha.media.id} className="flex flex-col gap-3 py-4 sm:flex-row">
                    <PreviewPost media={linha.media} />

                    <div className="min-w-0 flex-1 space-y-3">
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {linha.media.caption_preview || "Sem legenda"}
                      </p>

                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <Input
                          value={linha.palavra}
                          onChange={(e) =>
                            atualizarLinha(linha.media.id, "palavra", e.target.value)
                          }
                          placeholder="Palavra"
                          aria-label={`Palavra da publicação ${linha.media.id}`}
                          className={cn(
                            linha.media.palavra_sugerida &&
                              linha.palavra === linha.media.palavra_sugerida &&
                              "border-primary/40",
                          )}
                        />
                        <Input
                          value={linha.link}
                          onChange={(e) => atualizarLinha(linha.media.id, "link", e.target.value)}
                          placeholder="Cole o link do produto"
                          aria-label={`Link da publicação ${linha.media.id}`}
                          inputMode="url"
                        />
                      </div>
                    </div>

                    {linha.link.trim() && (
                      <Check className="mt-1 h-4 w-4 flex-shrink-0 text-primary" aria-label="pronta" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* O que ficou de fora NUNCA fica escondido: é o post que segue sem
            responder comentário. */}
        {puladas.length > 0 && (
          <Card className="border-amber-500/40">
            <CardContent className="space-y-2 p-4 sm:p-6">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="h-4 w-4" />
                <h2 className="font-medium">
                  {puladas.length}{" "}
                  {puladas.length === 1 ? "publicação ficou" : "publicações ficaram"} de fora
                </h2>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {puladas.map((p) => (
                  <li key={p.media_id}>{p.motivo}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <BarraDeAcoes
          prontas={prontas.length}
          salvando={salvando}
          onCriar={enviar}
          onCancelar={() => navigate("/dashboard/automacoes")}
        />
      </div>
    </DashboardLayout>
  );
};

export default AutomacoesEmLote;

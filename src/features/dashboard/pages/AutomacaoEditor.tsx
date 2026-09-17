import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Info, Link2, Loader2, Send, X } from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmojiPicker } from "@/components/shared/EmojiPicker";
import { AutomacaoPreview } from "@/features/dashboard/components/AutomacaoPreview";
import { InserirLinkModal } from "@/features/dashboard/components/InserirLinkModal";
import { RetroativosModal } from "@/features/dashboard/components/RetroativosModal";
import { SelecionarPublicacao } from "@/features/dashboard/components/SelecionarPublicacao";
import { SelecionarStory } from "@/features/dashboard/components/SelecionarStory";
import { useToast } from "@/hooks/use-toast";
import {
  createAutomation,
  getAutomation,
  updateAutomation,
} from "@/services/instagram.service";
import { cn } from "@/shared/lib/utils";
import type {
  AutomacaoEscopo,
  AutomacaoStatus,
  AutomacaoTrigger,
  InstagramAutomationPayload,
  InstagramMediaItem,
} from "@/shared/types/instagram";
import { useInstagramConnectionStore } from "@/stores/instagramConnectionStore";

const MAX_VARIACOES = 5;
const MIN_VARIACOES_RECOMENDADO = 3;
const CHIPS_EXEMPLO = ["QUERO", "LINK", "EU QUERO", "PREÇO"];

type EstadoForm = {
  nome: string;
  escopo: AutomacaoEscopo;
  media_id: string | null;
  media_thumbnail_url: string | null;
  media_caption_preview: string | null;
  media_permalink: string | null;
  trigger_tipo: AutomacaoTrigger;
  palavras: string[];
  resposta_publica_ativa: boolean;
  variacoes: string[];
  dm_texto: string;
  dm_link: string;
  dm_botao_texto: string;
};

const INICIAL: EstadoForm = {
  nome: "",
  escopo: "post_especifico",
  media_id: null,
  media_thumbnail_url: null,
  media_caption_preview: null,
  media_permalink: null,
  trigger_tipo: "palavras",
  palavras: [],
  resposta_publica_ativa: true,
  variacoes: ["Te mandei no direct!", "Já foi pro seu direct", "Enviado! Corre lá no direct"],
  dm_texto: "",
  dm_link: "",
  dm_botao_texto: "Pegar o link",
};

/** Opção de rádio desenhada como cartão clicável (não há radio-group no design system). */
const Opcao = ({
  titulo,
  descricao,
  ativo,
  onClick,
}: {
  titulo: string;
  descricao: string;
  ativo: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    role="radio"
    aria-checked={ativo}
    className={cn(
      "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
      ativo ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
    )}
  >
    <span
      className={cn(
        "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2",
        ativo ? "border-primary" : "border-muted-foreground/40",
      )}
    >
      {ativo && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-medium text-foreground">{titulo}</span>
      <span className="block text-xs text-muted-foreground">{descricao}</span>
    </span>
  </button>
);

const CardNumerado = ({
  numero,
  titulo,
  apoio,
  children,
}: {
  numero: number;
  titulo: string;
  apoio: string;
  children: React.ReactNode;
}) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2.5 text-base">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {numero}
        </span>
        {titulo}
      </CardTitle>
      <p className="pl-[34px] text-xs text-muted-foreground">{apoio}</p>
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

const AutomacaoEditor = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams();
  const editando = id && id !== "nova";
  const { connection, fetch: carregarConexao } = useInstagramConnectionStore();

  const [form, setForm] = useState<EstadoForm>(INICIAL);
  const [chipAtual, setChipAtual] = useState("");
  const [carregando, setCarregando] = useState(!!editando);
  const [salvando, setSalvando] = useState(false);
  const [modalLink, setModalLink] = useState(false);
  // Status SALVO (o form não guarda): o retroativo usa a automação do banco,
  // não o que está sendo editado e ainda não foi salvo.
  const [salva, setSalva] = useState<{
    id: number;
    nome: string;
    status: AutomacaoStatus;
    escopo: AutomacaoEscopo;
  } | null>(null);
  const [modalRetroativos, setModalRetroativos] = useState(false);

  useEffect(() => {
    void carregarConexao();
  }, [carregarConexao]);

  useEffect(() => {
    if (!editando) return;
    getAutomation(Number(id))
      .then((a) => {
        setSalva({ id: a.id, nome: a.nome, status: a.status, escopo: a.escopo });
        setForm({
          nome: a.nome,
          escopo: a.escopo,
          media_id: a.media_id,
          media_thumbnail_url: a.media_thumbnail_url,
          media_caption_preview: a.media_caption_preview,
          media_permalink: a.media_permalink,
          trigger_tipo: a.trigger_tipo,
          palavras: a.palavras,
          resposta_publica_ativa: a.resposta_publica_ativa,
          variacoes: (a.resposta_publica_variacoes || []).slice(0, MAX_VARIACOES),
          dm_link: a.dm_link || "",
          dm_botao_texto: a.dm_botao_texto || "",
          dm_texto: a.dm_texto,
        });
      })
      .catch((e: Error) =>
        toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" }),
      )
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const variacoes = useMemo(
    () => form.variacoes.map((t) => t.trim()).filter(Boolean).slice(0, MAX_VARIACOES),
    [form.variacoes],
  );

  const alterarVariacao = (indice: number, valor: string) =>
    setForm((f) => ({ ...f, variacoes: f.variacoes.map((v, i) => (i === indice ? valor : v)) }));

  const removerVariacao = (indice: number) =>
    setForm((f) => ({ ...f, variacoes: f.variacoes.filter((_, i) => i !== indice) }));

  const adicionarVariacao = () =>
    setForm((f) =>
      f.variacoes.length >= MAX_VARIACOES ? f : { ...f, variacoes: [...f.variacoes, ""] },
    );

  const adicionarChip = (bruto: string) => {
    const palavra = bruto.trim();
    if (!palavra) return;
    setForm((f) =>
      f.palavras.some((p) => p.toLowerCase() === palavra.toLowerCase())
        ? f
        : { ...f, palavras: [...f.palavras, palavra] },
    );
    setChipAtual("");
  };

  const ehStory = form.escopo === "story_especifico" || form.escopo === "story_qualquer";
  const comMidia = form.escopo === "post_especifico" || form.escopo === "story_especifico";

  // Toggle Publicações × Stories do Card 1: troca o "mundo" preservando a
  // escolha específica/qualquer, e limpa a mídia — um media_id de post não
  // vale para story e vice-versa.
  const trocarTipoAlvo = (novo: "publicacoes" | "stories") => {
    if ((novo === "stories") === ehStory) return;
    setForm((f) => ({
      ...f,
      escopo:
        novo === "stories"
          ? f.escopo === "post_especifico"
            ? "story_especifico"
            : "story_qualquer"
          : f.escopo === "story_especifico"
            ? "post_especifico"
            : "qualquer",
      media_id: null,
      media_thumbnail_url: null,
      media_caption_preview: null,
      media_permalink: null,
    }));
  };

  const montarPayload = (status: "ativa" | "rascunho"): InstagramAutomationPayload => ({
    nome: form.nome.trim() || "Automação sem nome",
    escopo: form.escopo,
    media_id: comMidia ? form.media_id : null,
    media_thumbnail_url: comMidia ? form.media_thumbnail_url : null,
    media_caption_preview: comMidia ? form.media_caption_preview : null,
    media_permalink: comMidia ? form.media_permalink : null,
    trigger_tipo: form.trigger_tipo,
    palavras: form.trigger_tipo === "palavras" ? form.palavras : [],
    // Story não tem comentário público — o backend também força isso.
    resposta_publica_ativa: ehStory ? false : form.resposta_publica_ativa,
    resposta_publica_variacoes: !ehStory && form.resposta_publica_ativa ? variacoes : [],
    dm_texto: form.dm_texto,
    dm_link: form.dm_link.trim() || null,
    dm_botao_texto: form.dm_botao_texto.trim() || null,
    status,
  });

  const salvar = async (status: "ativa" | "rascunho") => {
    setSalvando(true);
    try {
      const payload = montarPayload(status);
      if (editando) {
        await updateAutomation(Number(id), payload);
      } else {
        await createAutomation(payload);
      }
      toast({
        title: status === "ativa" ? "Automação publicada" : "Rascunho salvo",
        description:
          status === "ativa"
            ? "A partir de agora, comentários com suas palavras recebem o direct."
            : "Você pode voltar e publicar quando quiser.",
      });
      navigate("/dashboard/automacoes");
    } catch (e) {
      toast({
        title: "Não foi possível salvar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <DashboardLayout title="Automação Instagram">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Automação Instagram">
      {/* Página inteira em duas colunas — não uma sidebar estreita com scroll infinito. */}
      <div className="mx-auto w-full max-w-[1100px] pb-40 md:pb-24">
        {salva && salva.escopo === "post_especifico" && salva.status !== "rascunho" && (
          <div className="mb-6 flex justify-end">
            <Button variant="outline" onClick={() => setModalRetroativos(true)}>
              <Send className="mr-2 h-4 w-4" /> Enviar para quem já comentou
            </Button>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[62fr_38fr]">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da automação</Label>
              <Input
                id="nome"
                className="h-11"
                placeholder="Ex.: Comente QUERO — cadeira gamer"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <CardNumerado
              numero={1}
              titulo="Onde"
              apoio="Escolha em quais publicações ou stories essa automação vai funcionar."
            >
              {/* Primeiro o MUNDO (feed/reels × story), depois específica/qualquer —
                  4 opções empilhadas escondiam as de story abaixo da dobra. */}
              <div
                className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
                role="tablist"
                aria-label="Tipo de conteúdo"
              >
                {[
                  { id: "publicacoes" as const, rotulo: "Publicações (feed/reels)" },
                  { id: "stories" as const, rotulo: "Stories" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={(t.id === "stories") === ehStory}
                    onClick={() => trocarTipoAlvo(t.id)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm transition-colors",
                      (t.id === "stories") === ehStory
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>

              <div className="space-y-2" role="radiogroup" aria-label="Onde">
                <Opcao
                  titulo={ehStory ? "Um story específico" : "Uma publicação específica"}
                  descricao={
                    ehStory
                      ? "Responde quem responder esse story no direct. Ele expira em 24h — a automação para junto."
                      : "A automação responde só nos comentários desse post."
                  }
                  ativo={comMidia}
                  onClick={() =>
                    setForm({
                      ...form,
                      escopo: ehStory ? "story_especifico" : "post_especifico",
                    })
                  }
                />
                <Opcao
                  titulo={ehStory ? "Qualquer story" : "Qualquer publicação"}
                  descricao={
                    ehStory
                      ? "Vale para todos os stories, inclusive os que você ainda vai postar."
                      : "Vale para todos os posts, inclusive os que você ainda vai publicar."
                  }
                  ativo={!comMidia}
                  onClick={() =>
                    setForm({ ...form, escopo: ehStory ? "story_qualquer" : "qualquer" })
                  }
                />
              </div>

              {/* Consequência real, não decoração: o CTA errado mata a automação
                  em silêncio. Comentário de story não existe na API da Meta
                  (verificado em 02/09/2026) — só a RESPOSTA (reply) chega. */}
              {ehStory && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    No texto do story, peça para <strong>responder</strong> o story
                    (ex.: “Responda com QUERO”). Comentário de story{" "}
                    <strong>não dispara</strong> a automação — a Meta não entrega
                    comentários de story para nenhum app.
                  </span>
                </p>
              )}

              {form.escopo === "story_especifico" && (
                <SelecionarStory
                  selecionado={form.media_id}
                  onSelecionar={(item) =>
                    setForm({
                      ...form,
                      media_id: item.id,
                      media_thumbnail_url: item.thumbnail_url ?? null,
                      media_caption_preview: item.caption_preview ?? null,
                      media_permalink: null,
                    })
                  }
                />
              )}

              {form.escopo === "post_especifico" && (
                <SelecionarPublicacao
                  selecionado={form.media_id}
                  onSelecionar={(item: InstagramMediaItem) =>
                    setForm({
                      ...form,
                      media_id: item.id,
                      media_thumbnail_url: item.thumbnail_url,
                      media_caption_preview: item.caption_preview,
                      media_permalink: item.permalink,
                    })
                  }
                />
              )}

            </CardNumerado>

            <CardNumerado
              numero={2}
              titulo="Quando"
              apoio={
                ehStory
                  ? "A automação dispara quando a resposta ao story contiver uma dessas palavras."
                  : "A automação dispara quando o comentário contiver uma dessas palavras."
              }
            >
              <div className="space-y-2" role="radiogroup" aria-label="Quando">
                <Opcao
                  titulo="Uma palavra ou expressão específica"
                  descricao="Só comentários que contenham a palavra recebem o direct."
                  ativo={form.trigger_tipo === "palavras"}
                  onClick={() => setForm({ ...form, trigger_tipo: "palavras" })}
                />
                <Opcao
                  titulo="Qualquer palavra"
                  descricao="Todo comentário dispara a automação."
                  ativo={form.trigger_tipo === "qualquer"}
                  onClick={() => setForm({ ...form, trigger_tipo: "qualquer" })}
                />
              </div>

              {form.trigger_tipo === "qualquer" ? (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  Todo comentário vai receber direct, inclusive elogios e perguntas.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {form.palavras.map((p) => (
                      <span
                        key={p}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary"
                      >
                        {p}
                        <button
                          type="button"
                          aria-label={`Remover ${p}`}
                          onClick={() =>
                            setForm({ ...form, palavras: form.palavras.filter((x) => x !== p) })
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <Input
                    className="h-11"
                    placeholder="Digite a palavra e aperte Enter"
                    value={chipAtual}
                    onChange={(e) => setChipAtual(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        adicionarChip(chipAtual);
                      }
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">Sugestões:</span>
                    {CHIPS_EXEMPLO.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => adicionarChip(c)}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    Ignora maiúsculas, acentos e emoji.
                  </p>
                </div>
              )}
            </CardNumerado>

            {!ehStory && (
            <CardNumerado
              numero={3}
              titulo="Responder no comentário"
              apoio="Aparece publicamente embaixo do comentário."
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.resposta_publica_ativa}
                  onCheckedChange={(v) => setForm({ ...form, resposta_publica_ativa: v })}
                  aria-label="Responder no comentário"
                />
                <span className="text-sm text-foreground">
                  {form.resposta_publica_ativa ? "Ligado" : "Desligado"}
                </span>
              </div>

              {form.resposta_publica_ativa && (
                <div className="space-y-2">
                  {/* Um campo por variação: com linhas num textarea, enter duplo criava
                      variação vazia e colar texto multilinha bagunçava tudo. */}
                  {form.variacoes.map((texto, indice) => (
                    <div key={indice} className="flex items-center gap-2">
                      <Input
                        value={texto}
                        placeholder={`Variação ${indice + 1}`}
                        onChange={(e) => alterarVariacao(indice, e.target.value)}
                        aria-label={`Variação ${indice + 1}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removerVariacao(indice)}
                        aria-label={`Remover variação ${indice + 1}`}
                        className="flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    {form.variacoes.length < MAX_VARIACOES && (
                      <Button variant="outline" size="sm" onClick={adicionarVariacao}>
                        + Adicionar variação
                      </Button>
                    )}
                    {/* Emoji entra na ÚLTIMA variação — é a que a aluna acabou
                        de escrever quando procura o seletor. */}
                    <EmojiPicker
                      rotulo="Inserir emoji na variação"
                      onEscolher={(emoji) =>
                        setForm((f) => {
                          if (f.variacoes.length === 0) return { ...f, variacoes: [emoji] };
                          const ultima = f.variacoes.length - 1;
                          return {
                            ...f,
                            variacoes: f.variacoes.map((v, i) =>
                              i === ultima ? `${v}${emoji}` : v,
                            ),
                          };
                        })
                      }
                    />
                  </div>
                  {variacoes.length > 0 && variacoes.length < MIN_VARIACOES_RECOMENDADO && (
                    <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      Com menos de {MIN_VARIACOES_RECOMENDADO} variações, o mesmo texto se repete
                      em todos os comentários — é isso que faz o Instagram tratar a conta como bot.
                    </p>
                  )}
                </div>
              )}
            </CardNumerado>
            )}

            <CardNumerado
              numero={ehStory ? 3 : 4}
              titulo="Mensagem no direct"
              apoio={
                ehStory
                  ? "A resposta que a pessoa recebe no direct ao responder seu story."
                  : "É a única mensagem que a pessoa vai receber."
              }
            >
              {/* Rodada 2: mensagem, link e botão em campos separados. O link
                  saiu de dentro do texto e vira um botão no direct — link cru no
                  meio da mensagem parece spam. */}
              <div className="space-y-1.5">
                <Label htmlFor="dm-mensagem">Mensagem</Label>
                <Textarea
                  id="dm-mensagem"
                  className="min-h-[110px]"
                  placeholder="Oiie, aqui está o que você pediu"
                  value={form.dm_texto}
                  onChange={(e) => setForm({ ...form, dm_texto: e.target.value })}
                  maxLength={950}
                />
                {/* Botão e contador na MESMA linha de base. */}
                <div className="flex items-center justify-between gap-2">
                  <EmojiPicker
                    rotulo="Inserir emoji na mensagem"
                    onEscolher={(emoji) =>
                      setForm((f) => ({ ...f, dm_texto: `${f.dm_texto}${emoji}` }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {form.dm_texto.length} caracteres
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dm-link">Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="dm-link"
                    placeholder="https://..."
                    value={form.dm_link}
                    onChange={(e) => setForm({ ...form, dm_link: e.target.value })}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0"
                    onClick={() => setModalLink(true)}
                  >
                    <Link2 className="mr-2 h-3.5 w-3.5" /> Inserir link
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dm-botao">Texto do botão</Label>
                <Input
                  id="dm-botao"
                  placeholder="Pegar o link"
                  value={form.dm_botao_texto}
                  onChange={(e) => setForm({ ...form, dm_botao_texto: e.target.value })}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  {form.dm_botao_texto.length}/20 caracteres
                </p>
              </div>
            </CardNumerado>
          </div>

          {/* Preview sticky */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <AutomacaoPreview
              thumbnailUrl={form.media_thumbnail_url}
              palavraExemplo={
                form.trigger_tipo === "qualquer" ? "que lindo!" : form.palavras[0] || "quero"
              }
              respostaPublica={!ehStory && form.resposta_publica_ativa ? variacoes[0] : null}
              dmTexto={form.dm_texto}
              dmLink={form.dm_link}
              dmBotaoTexto={form.dm_botao_texto}
              usuario={connection?.ig_username}
            />
          </div>
        </div>
      </div>

      {/* Barra fixa de ações. No celular ela sobe acima da bottom nav (z-40,
          58px) — em bottom-0 os botões ficavam escondidos atrás da navegação,
          e "Publicar automação" era inalcançável. Mesmo tratamento do
          RoteiroEditor. */}
      {/* No desktop a barra começa DEPOIS do sidebar (md:left-72): com
          inset-x-0 ela cobria o menu lateral. Com o sidebar recolhido sobra uma
          fresta à esquerda — preferível a tampar o menu. */}
      <div className="fixed left-0 right-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur md:bottom-0 md:left-72">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Voltar não salva nada — só devolve para a lista. Some no celular:
              lá o espaço é curto e a bottom nav já dá o caminho de volta. */}
          <Button
            variant="ghost"
            className="hidden sm:inline-flex"
            onClick={() => navigate("/dashboard/automacoes")}
            disabled={salvando}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => void salvar("rascunho")}
              disabled={salvando}
              className="w-full sm:w-auto"
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar rascunho
            </Button>
            <Button
              onClick={() => void salvar("ativa")}
              disabled={salvando}
              className="w-full sm:w-auto"
            >
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publicar automação
            </Button>
          </div>
        </div>
      </div>

      <RetroativosModal
        automacao={modalRetroativos ? salva : null}
        onFechar={() => setModalRetroativos(false)}
      />

      <InserirLinkModal
        aberto={modalLink}
        onFechar={() => setModalLink(false)}
        // O link agora tem campo próprio: escolher em Meus Links preenche o
        // campo, não emenda no fim da mensagem.
        onInserir={(url) => setForm((f) => ({ ...f, dm_link: url }))}
      />
    </DashboardLayout>
  );
};

export default AutomacaoEditor;

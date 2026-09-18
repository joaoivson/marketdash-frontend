import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  AtSign,
  Check,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Settings2,
  ShoppingBag,
  Square,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";

import { CheckboxQuadrado } from "@/components/shared/CheckboxQuadrado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { GrupoDaCampanha } from "@/services/campanhas_grupos.service";
import {
  ACOES_DO_GRUPO,
  BLOCOS_DE_MIDIA,
  UNIDADES,
  uploadDeMidia,
  type AcaoGrupo,
  type BlocoIn,
  type PassoIn,
  type TipoBloco,
  type TipoConteudo,
  type UnidadeOffset,
} from "@/services/roteiros.service";
import type { Template } from "@/services/templates.service";
import { cn } from "@/shared/lib/utils";

import { PreviaWhatsApp } from "./PreviaWhatsApp";

const ATALHOS_OFFSET = [10, 30, 60];

/** Hoje em Brasília, no formato do `<input type="date">`. */
export const hojeBR = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Amanhã em Brasília — passo novo não pode nascer já em vermelho. */
export const proximaDataBR = () => {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${hoje}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
};

const CONTEUDOS: { valor: TipoConteudo; rotulo: string; Icone: typeof FileText }[] = [
  { valor: "mensagem", rotulo: "Mensagem", Icone: FileText },
  { valor: "oferta", rotulo: "Oferta", Icone: ShoppingBag },
  { valor: "acao_grupo", rotulo: "Ação no grupo", Icone: Settings2 },
];

/** Botão de rádio compacto — não há radio-group no design system. */
const Radio = ({
  rotulo,
  ativo,
  onClick,
  disabled,
}: {
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={ativo}
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "min-h-[40px] rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
      ativo
        ? "border-primary bg-primary/5 text-foreground"
        : "border-border text-muted-foreground hover:bg-accent/40",
      disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
    )}
  >
    {rotulo}
  </button>
);

const Bloco = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {titulo}
    </p>
    {children}
  </div>
);

/** Como cada tipo de bloco se apresenta e o que o seletor de arquivo aceita. */
const TIPOS_DE_BLOCO = {
  texto: { rotulo: "Texto", Icone: FileText, accept: "" },
  imagem: { rotulo: "Imagem", Icone: ImageIcon, accept: "image/*" },
  video: { rotulo: "Vídeo", Icone: Film, accept: "video/*" },
  audio: { rotulo: "Áudio", Icone: Mic, accept: "audio/*" },
  arquivo: { rotulo: "Arquivo", Icone: Paperclip, accept: "" },
  oferta: { rotulo: "Oferta", Icone: ShoppingBag, accept: "" },
} as const;

/** Nome legível do arquivo a partir da URL — é tudo que guardamos dele. */
const nomeDoArquivo = (url: string | null | undefined): string => {
  if (!url) return "";
  try {
    const caminho = new URL(url).pathname;
    return decodeURIComponent(caminho.split("/").pop() || "arquivo");
  } catch {
    return url.split("/").pop() || "arquivo";
  }
};

/** Cartão de UM bloco de mensagem. */
const CartaoDeBloco = ({
  bloco,
  indice,
  total,
  onMudar,
  onMover,
  onRemover,
}: {
  bloco: BlocoIn;
  indice: number;
  total: number;
  onMudar: (patch: Partial<BlocoIn>) => void;
  onMover: (delta: -1 | 1) => void;
  onRemover: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const { toast } = useToast();

  const escolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      // `uploadDeMidia` checa o tamanho ANTES de subir: sem isso o arquivo
      // grande sobe inteiro para tomar 400 no fim, e a tela fica parada sem
      // explicar por quê.
      const { url } = await uploadDeMidia(
        bloco.tipo as "imagem" | "video" | "audio" | "arquivo", file,
      );
      onMudar({ conteudo: url });
    } catch (err) {
      toast({
        title: "Não foi possível enviar o arquivo",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex items-center gap-1">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
          {indice + 1}
        </span>
        <span className="mr-auto text-xs font-medium text-muted-foreground">
          {TIPOS_DE_BLOCO[bloco.tipo]?.rotulo ?? bloco.tipo}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={indice === 0}
          onClick={() => onMover(-1)}
          aria-label={`Mover bloco ${indice + 1} para cima`}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={indice === total - 1}
          onClick={() => onMover(1)}
          aria-label={`Mover bloco ${indice + 1} para baixo`}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemover}
          aria-label={`Remover bloco ${indice + 1}`}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {bloco.tipo === "texto" ? (
        <Textarea
          value={bloco.conteudo ?? ""}
          onChange={(e) => onMudar({ conteudo: e.target.value })}
          maxLength={4000}
          rows={4}
          placeholder="Mensagem para os grupos…"
          aria-label={`Texto do bloco ${indice + 1}`}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {bloco.conteudo && bloco.tipo === "imagem" && (
              <div className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                <img src={bloco.conteudo} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onMudar({ conteudo: null })}
                  aria-label="Remover imagem"
                  className="absolute inset-0 flex items-center justify-center bg-black/60 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
            {bloco.conteudo && bloco.tipo === "video" && (
              <video
                src={bloco.conteudo}
                controls
                className="h-16 w-28 flex-shrink-0 rounded-xl border border-border bg-black object-cover"
              />
            )}
            {/* Áudio ganha player de conferência: ela precisa OUVIR antes de
                mandar para 900 pessoas. */}
            {bloco.conteudo && bloco.tipo === "audio" && (
              <audio src={bloco.conteudo} controls className="h-9 min-w-0 flex-1" />
            )}
            {bloco.conteudo && bloco.tipo === "arquivo" && (
              <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {nomeDoArquivo(bloco.conteudo)}
                </span>
              </span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={TIPOS_DE_BLOCO[bloco.tipo]?.accept || undefined}
              className="hidden"
              onChange={(e) => void escolherArquivo(e)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
              className="flex-shrink-0"
            >
              {enviando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {bloco.conteudo ? "Trocar" : "Escolher"} {TIPOS_DE_BLOCO[bloco.tipo]?.rotulo.toLowerCase()}
            </Button>
          </div>
          {bloco.tipo === "audio" ? (
            /* Nota de voz não carrega texto — o WhatsApp não tem legenda de
               áudio. Quem quiser mandar um arquivo de áudio COM texto usa o
               bloco de arquivo. */
            <p className="text-xs text-muted-foreground">
              Chega no grupo como nota de voz, não como arquivo anexado.
            </p>
          ) : (
            <Textarea
              value={bloco.legenda ?? ""}
              onChange={(e) => onMudar({ legenda: e.target.value })}
              maxLength={4000}
              rows={2}
              placeholder="Legenda (opcional)"
              aria-label={`Legenda do bloco ${indice + 1}`}
            />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Editor de UM passo, em tela cheia.
 *
 * Tela cheia e não modal por dois motivos. O primeiro é espaço: o passo virou
 * container de blocos, e uma caixa centralizada de 512px não comporta quatro
 * imagens mais um texto mais a prévia. O segundo é que o modal simplesmente
 * não rolava — `DialogContent` é `fixed` sem teto de altura, e nos tipos com
 * mais campos o botão "Concluir" ficava fora da tela, inalcançável.
 *
 * Salvar é IMPLÍCITO: "Concluir" aplica o passo e o rodapé do roteiro tem só
 * "Agendar". Antes eram duas ações separadas com um aviso laranja no meio
 * ("Salve os passos para a prévia refletir o que vai ser agendado") — e o
 * caminho natural era clicar em Agendar antes de salvar.
 */
export const PassoEditor = ({
  passo,
  indice,
  total,
  nomeDoRoteiro,
  quando,
  primeiro,
  grupos,
  templates,
  prefixo,
  sufixo,
  onMudar,
  onConcluir,
}: {
  passo: PassoIn;
  indice: number;
  /** Quantos passos o roteiro tem — a barra diz "Passo X de Y". */
  total: number;
  nomeDoRoteiro: string;
  /**
   * Horário RESOLVIDO do passo, vindo do backend.
   *
   * Passo relativo não tem como calcular o próprio horário aqui — ele depende
   * da cadeia inteira. O carimbo da prévia usa este valor; sem ele mostraria a
   * hora atual, que é o que fazia "21:23" não dizer nada.
   */
  quando?: string | null;
  primeiro: boolean;
  grupos: GrupoDaCampanha[];
  templates: Template[];
  /** Assinatura da campanha — o motor costura no 1º e no último bloco. */
  prefixo?: string | null;
  sufixo?: string | null;
  onMudar: (patch: Partial<PassoIn>) => void;
  onConcluir: () => void;
}) => {
  const selecionados = useMemo(
    () => new Set(passo.grupos_alvo_ids ?? []),
    [passo.grupos_alvo_ids],
  );

  const alterarBloco = (i: number, patch: Partial<BlocoIn>) =>
    onMudar({ blocos: passo.blocos.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const moverBloco = (i: number, delta: -1 | 1) => {
    const destino = i + delta;
    if (destino < 0 || destino >= passo.blocos.length) return;
    const copia = [...passo.blocos];
    [copia[i], copia[destino]] = [copia[destino], copia[i]];
    onMudar({ blocos: copia });
  };

  const adicionarBloco = (tipo: TipoBloco) =>
    onMudar({
      blocos: [...passo.blocos, { tipo, conteudo: "", legenda: null, template_id: null }],
    });

  /**
   * O que a prévia mostra — oferta e ação também têm forma no WhatsApp.
   *
   * Prefixo e sufixo da campanha entram UMA vez cada, no primeiro e no último
   * bloco com texto, exatamente como o motor costura (`_preparar_saida`). Sem
   * isso a prévia mentia nas duas pontas — justamente onde a assinatura dela
   * aparece.
   */
  const blocosDaPrevia: BlocoIn[] = (() => {
    const base: BlocoIn[] =
      passo.tipo_conteudo === "mensagem"
        ? passo.blocos.map((b) => ({ ...b }))
        : passo.tipo_conteudo === "oferta"
          ? [
              {
                tipo: "texto",
                conteudo: [passo.texto?.trim(), passo.oferta_url?.trim()]
                  .filter(Boolean)
                  .join("\n\n"),
              },
            ]
          : [];
    if (base.length === 0) return base;
    const campo = (b: BlocoIn): "legenda" | "conteudo" =>
      b.tipo === "imagem" ? "legenda" : "conteudo";
    const costurar = (...partes: (string | null | undefined)[]) =>
      partes.map((x) => (x ?? "").trim()).filter(Boolean).join("\n\n");
    if (prefixo?.trim()) {
      const c = campo(base[0]);
      base[0] = { ...base[0], [c]: costurar(prefixo, base[0][c]) };
    }
    if (sufixo?.trim()) {
      const ultimo = base.length - 1;
      const c = campo(base[ultimo]);
      base[ultimo] = { ...base[ultimo], [c]: costurar(base[ultimo][c], sufixo) };
    }
    return base;
  })();

  const acaoAtual = ACOES_DO_GRUPO.find((a) => a.valor === passo.acao);

  /**
   * Data e hora no passado travam o Concluir, com a marca no próprio campo.
   *
   * Antes só o "Agendar" barrava, dois passos depois — ela descobria o erro
   * longe de onde o cometeu. O mínimo é o MINUTO SEGUINTE: aceitar o minuto
   * corrente é aceitar um horário que vence enquanto ela termina de digitar.
   */
  const erroDeData = (() => {
    if (passo.tipo_tempo !== "ancora") return null;
    if (!passo.data_fixa || !passo.hora_fixa) {
      return "Passo de hora fixa precisa de data e horário.";
    }
    const alvo = new Date(`${passo.data_fixa}T${passo.hora_fixa}`);
    if (Number.isNaN(alvo.getTime())) return "Data ou horário inválido.";
    const minimo = new Date();
    minimo.setSeconds(0, 0);
    minimo.setMinutes(minimo.getMinutes() + 1);
    return alvo < minimo ? "Escolha uma data e horário no futuro." : null;
  })();

  /**
   * "Marcar todos" só existe onde há texto.
   *
   * A menção viaja presa a um corpo de texto — o WhatsApp precisa de texto para
   * pendurar o `mentionedJid`. Sem nenhum bloco com texto (ou legenda), o
   * toggle fica desabilitado em vez de ficar ligado sem efeito, que é o que
   * acontecia: ela ligava, a mensagem chegava sem marcar ninguém, e nada no
   * sistema registrava o problema.
   *
   * Nota de voz não conta: não tem legenda.
   */
  const temTexto = passo.blocos.some(
    (b) => b.tipo !== "audio"
      && ((BLOCOS_DE_MIDIA.includes(b.tipo) ? b.legenda : b.conteudo) ?? "").trim() !== "",
  );
  const podeMarcarTodos = passo.tipo_conteudo === "mensagem" && temTexto;

  /** A lista de grupos, dentro do popover de "Escolher grupos". */
  const listaDeGrupos = (
    <div className="max-h-72 space-y-1 overflow-y-auto p-1">
      {grupos.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          Esta campanha ainda não tem grupos.
        </p>
      ) : (
        grupos.map((g) => (
          <label
            key={g.grupo_id}
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
          >
            {/* Quadrado, não redondo: o `rounded-sm` do tema vira círculo numa
                caixa de 16px e ela lê "escolha uma". */}
            <CheckboxQuadrado
              checked={selecionados.has(g.grupo_id)}
              onCheckedChange={() => {
                const proximo = new Set(selecionados);
                if (proximo.has(g.grupo_id)) proximo.delete(g.grupo_id);
                else proximo.add(g.grupo_id);
                onMudar({ grupos_alvo: "selecao", grupos_alvo_ids: [...proximo] });
              }}
              aria-label={`Selecionar ${g.nome ?? "grupo"}`}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {g.nome ?? "(grupo sem nome)"}
            </span>
            <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
              {g.participantes}
            </span>
          </label>
        ))
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/*
        Barra superior fixa: Voltar · nome do roteiro · Passo X de Y · Concluir.

        O editor não tinha Voltar em lugar nenhum — só um X no canto, que
        também SALVAVA. E o Concluir ficava no rodapé, flutuando sobre o
        conteúdo. Os dois agora ficam na mesma barra, que não rola.

        Voltar e Concluir fazem a mesma coisa de propósito: salvar é implícito
        no módulo inteiro, e um "descartar" só aqui divergiria do resto.
      */}
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onConcluir}
          disabled={erroDeData !== null}
          className="flex-shrink-0"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Voltar</span>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            {nomeDoRoteiro}
          </p>
          <p className="text-xs leading-tight tabular-nums text-muted-foreground">
            Passo {indice + 1} de {total}
            {primeiro && " · Início"}
          </p>
        </div>
        <Button
          size="sm"
          onClick={onConcluir}
          disabled={erroDeData !== null}
          className="flex-shrink-0"
        >
          <Check className="mr-2 h-4 w-4" /> Concluir
        </Button>
      </header>

      {/*
        ── Faixa de configuração ──

        QUANDO + O QUÊ + PARA QUEM + Marcar todos numa faixa HORIZONTAL, logo
        abaixo da barra, sem rolagem. Antes esses campos empilhavam
        verticalmente ocupando largura de bloco de conteúdo, e por isso a tela
        rolava com espaço sobrando de lado.

        Com a faixa fixa, a rolagem passa a existir só quando ela realmente
        acrescenta mensagem.
      */}
      <div className="flex-shrink-0 border-b border-border bg-muted/30">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-end gap-x-4 gap-y-3 px-3 py-2.5 sm:px-4">
          {/* QUANDO */}
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Quando
              </Label>
              <Select
                value={passo.tipo_tempo}
                onValueChange={(v) =>
                  v === "ancora"
                    ? onMudar({
                        tipo_tempo: "ancora",
                        hora_fixa: passo.hora_fixa || "08:00",
                        // Semear a DATA junto: o modo relativo zera `data_fixa`,
                        // e voltar para "Hora fixa" deixava o passo sem data —
                        // salvar falhava por um campo que ela não viu sumir.
                        data_fixa: passo.data_fixa || proximaDataBR(),
                        offset_valor: null,
                        offset_unidade: null,
                      })
                    : onMudar({
                        tipo_tempo: "relativo",
                        offset_valor: passo.offset_valor ?? 10,
                        offset_unidade: passo.offset_unidade ?? "minutos",
                        hora_fixa: null,
                        data_fixa: null,
                      })
                }
              >
                <SelectTrigger className="h-9 w-[152px]" aria-label="Quando">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ancora">Hora fixa</SelectItem>
                  {/* O passo 1 marca o início do roteiro: não há "anterior". */}
                  <SelectItem value="relativo" disabled={primeiro}>
                    Depois do anterior
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {passo.tipo_tempo === "ancora" ? (
              <>
                <Input
                  type="date"
                  min={hojeBR()}
                  aria-label="Data do passo"
                  aria-invalid={erroDeData !== null}
                  className={cn("h-9 w-[150px]", erroDeData && "border-destructive")}
                  value={passo.data_fixa ?? ""}
                  onChange={(e) => onMudar({ data_fixa: e.target.value || null })}
                />
                <Input
                  type="time"
                  aria-label="Horário do passo"
                  aria-invalid={erroDeData !== null}
                  className={cn("h-9 w-[110px]", erroDeData && "border-destructive")}
                  value={passo.hora_fixa ?? ""}
                  onChange={(e) => onMudar({ hora_fixa: e.target.value || null })}
                />
              </>
            ) : (
              <>
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  className="h-9 w-20"
                  value={passo.offset_valor ?? 0}
                  onChange={(e) =>
                    onMudar({
                      offset_valor: Math.max(0, Math.min(100000, Number(e.target.value) || 0)),
                    })
                  }
                  aria-label="Quanto tempo depois do passo anterior"
                />
                <Select
                  value={passo.offset_unidade ?? "minutos"}
                  onValueChange={(v) => onMudar({ offset_unidade: v as UnidadeOffset })}
                >
                  <SelectTrigger className="h-9 w-[118px]" aria-label="Unidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map((u) => (
                      <SelectItem key={u.valor} value={u.valor}>
                        {u.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-1">
                  {ATALHOS_OFFSET.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onMudar({ offset_valor: m, offset_unidade: "minutos" })}
                      className="h-9 rounded-full border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                    >
                      +{m}min
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* O QUÊ */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              O quê
            </Label>
            <Select
              value={passo.tipo_conteudo}
              onValueChange={(v) =>
                onMudar({
                  tipo_conteudo: v as TipoConteudo,
                  // Ação é EXCLUSIVA: uma por passo, sem blocos.
                  blocos:
                    v === "mensagem"
                      ? passo.blocos.length
                        ? passo.blocos
                        : [{ tipo: "texto", conteudo: "" }]
                      : [],
                  acao: v === "acao_grupo" ? (passo.acao ?? "renomear_grupo") : null,
                })
              }
            >
              <SelectTrigger className="h-9 w-[148px]" aria-label="O quê">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTEUDOS.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* PARA QUEM */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Para quem
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={passo.grupos_alvo}
                onValueChange={(v) =>
                  onMudar(
                    v === "todos"
                      ? { grupos_alvo: "todos", grupos_alvo_ids: null }
                      : { grupos_alvo: "selecao" },
                  )
                }
              >
                <SelectTrigger className="h-9 w-[150px]" aria-label="Para quem">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os grupos</SelectItem>
                  <SelectItem value="selecao">Escolher grupos</SelectItem>
                </SelectContent>
              </Select>
              {passo.grupos_alvo === "selecao" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <Users className="mr-2 h-4 w-4" />
                      {selecionados.size === 0
                        ? "Escolher"
                        : `${selecionados.size} de ${grupos.length}`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="start">
                    {listaDeGrupos}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>

          {/* MARCAR TODOS */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-9 items-center gap-2 self-end">
                  <AtSign
                    className={cn(
                      "h-4 w-4",
                      podeMarcarTodos ? "text-muted-foreground" : "text-muted-foreground/40",
                    )}
                  />
                  <Label
                    htmlFor="passo-marcar-todos"
                    className={cn(
                      "text-sm",
                      !podeMarcarTodos && "text-muted-foreground/50",
                    )}
                  >
                    Marcar todos
                  </Label>
                  <Switch
                    id="passo-marcar-todos"
                    disabled={!podeMarcarTodos}
                    checked={podeMarcarTodos && passo.marcar_todos === "sempre"}
                    onCheckedChange={(v) =>
                      onMudar({ marcar_todos: v ? "sempre" : "nunca" })
                    }
                  />
                </div>
              </TooltipTrigger>
              {!podeMarcarTodos && (
                <TooltipContent>
                  Precisa de um bloco com texto ou legenda — a menção viaja
                  presa a um corpo de texto.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {erroDeData && (
            <p className="w-full text-xs text-destructive" role="alert">
              {erroDeData}
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1100px] gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ── Blocos de mensagem ── */}
          <div className="order-last min-w-0 space-y-6 lg:order-none">
            {/* Só os blocos de mensagem daqui para baixo: QUANDO, O QUÊ
                e PARA QUEM subiram para a faixa fixa. */}
            <div className="space-y-4">

              {passo.tipo_conteudo === "mensagem" && (
                <div className="space-y-3">
                  {passo.blocos.map((b, i) => (
                    <CartaoDeBloco
                      key={i}
                      bloco={b}
                      indice={i}
                      total={passo.blocos.length}
                      onMudar={(patch) => alterarBloco(i, patch)}
                      onMover={(d) => moverBloco(i, d)}
                      onRemover={() =>
                        onMudar({ blocos: passo.blocos.filter((_, j) => j !== i) })
                      }
                    />
                  ))}
                  {/*
                    Primeira versão fechada: texto · imagem · vídeo · áudio ·
                    arquivo. Enquete, figurinha, GIF e contato ficam para
                    depois — enquete não é mídia, é outro tipo de mensagem na
                    API, com campos próprios: quando entrar, é bloco novo, não
                    variação de texto.
                  */}
                  <div className="flex flex-wrap gap-2">
                    {(["texto", "imagem", "video", "audio", "arquivo"] as const).map(
                      (tipo) => {
                        const { rotulo, Icone } = TIPOS_DE_BLOCO[tipo];
                        return (
                          <Button
                            key={tipo}
                            variant="outline"
                            size="sm"
                            onClick={() => adicionarBloco(tipo)}
                          >
                            <Icone className="mr-2 h-4 w-4" /> {rotulo}
                          </Button>
                        );
                      },
                    )}
                  </div>
                  {passo.blocos.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Saem em sequência, com alguns segundos entre um e outro.
                    </p>
                  )}
                </div>
              )}

              {passo.tipo_conteudo === "oferta" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="passo-oferta">Link da oferta</Label>
                    <Input
                      id="passo-oferta"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={passo.oferta_url ?? ""}
                      onChange={(e) => onMudar({ oferta_url: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Template (opcional)</Label>
                    <Select
                      value={passo.template_id ? String(passo.template_id) : "nenhum"}
                      onValueChange={(v) =>
                        onMudar({ template_id: v === "nenhum" ? null : Number(v) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Sem template</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="passo-texto-oferta">Texto (opcional)</Label>
                    <Textarea
                      id="passo-texto-oferta"
                      value={passo.texto ?? ""}
                      onChange={(e) => onMudar({ texto: e.target.value })}
                      maxLength={4000}
                      rows={4}
                      placeholder="Use {link} para posicionar o link da oferta."
                    />
                  </div>
                </div>
              )}

              {passo.tipo_conteudo === "acao_grupo" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Ação</Label>
                    <Select
                      value={passo.acao ?? "renomear_grupo"}
                      onValueChange={(v) =>
                        onMudar({ acao: v as AcaoGrupo, acao_parametro: null })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACOES_DO_GRUPO.map((a) => (
                          <SelectItem key={a.valor} value={a.valor}>
                            {a.rotulo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <ParametroDaAcao
                    acao={passo.acao ?? "renomear_grupo"}
                    valor={passo.acao_parametro ?? ""}
                    onMudar={(v) => onMudar({ acao_parametro: v || null })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {acaoAtual?.rotulo} só funciona nos grupos em que um dos seus
                    números é admin.
                  </p>
                </div>
              )}
            </div>

          </div>

          {/*
            ── Prévia ──
            `order-first` no celular: em coluna única a prévia cairia depois de
            "Para quem" e do "Marcar todos", ou seja, fora da tela justamente
            enquanto ela digita os blocos. Fica no topo e GRUDA lá — é o que
            "atualizando enquanto digita" quer dizer num aparelho sem coluna da
            direita. Teto menor no celular para não comer meia tela.
          */}
          <div className="order-first min-w-0 self-start lg:order-none lg:sticky lg:top-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prévia
            </p>
            {passo.tipo_conteudo === "acao_grupo" ? (
              <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {acaoAtual?.rotulo}
                </span>
                {passo.acao_parametro ? (
                  <>
                    {" → "}
                    <span className="break-words text-foreground">
                      {passo.acao_parametro}
                    </span>
                  </>
                ) : null}
                <p className="mt-2 text-xs">Nada é enviado no grupo.</p>
              </div>
            ) : (
              <PreviaWhatsApp
                blocos={blocosDaPrevia}
                nomeDoGrupo={grupos[0]?.nome ?? undefined}
                quando={quando}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

const ParametroDaAcao = ({
  acao,
  valor,
  onMudar,
}: {
  acao: AcaoGrupo;
  valor: string;
  onMudar: (v: string) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const { toast } = useToast();

  if (acao === "renomear_grupo") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor="acao-nome">Novo nome do grupo</Label>
        <Input
          id="acao-nome"
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          maxLength={100}
        />
      </div>
    );
  }

  if (acao === "alterar_descricao") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor="acao-descricao">Nova descrição do grupo</Label>
        <Textarea
          id="acao-descricao"
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          maxLength={2000}
          rows={4}
        />
      </div>
    );
  }

  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const { url } = await uploadDeMidia("imagem", file);
      onMudar(url);
    } catch (err) {
      toast({
        title: "Não foi possível enviar a imagem",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
      if (e.target) e.target.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>Nova imagem do grupo</Label>
      <div className="flex items-center gap-3">
        {valor && (
          <img
            src={valor}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-xl border border-border object-cover"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void escolher(e)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={enviando}
          onClick={() => inputRef.current?.click()}
        >
          {enviando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {valor ? "Trocar imagem" : "Escolher imagem"}
        </Button>
      </div>
    </div>
  );
};

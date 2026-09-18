import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Copy,
  FileText,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingBag,
  Timer,
  X,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { CheckboxQuadrado } from "@/components/shared/CheckboxQuadrado";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { obterCampanha, type GrupoDaCampanha } from "@/services/campanhas_grupos.service";
import {
  ACOES_DO_GRUPO,
  ErroDeRoteiro,
  UNIDADES,
  agendarRoteiro,
  ajustarDatas,
  definirPassos,
  duplicarRoteiro,
  obterRoteiro,
  previewRoteiro,
  reenviarPasso,
  type PassoIn,
  type PassoOut,
  type PreviewRoteiro,
  type RoteiroDetalhe,
  type StatusDoPasso,
} from "@/services/roteiros.service";
import { listarTemplates, type Template } from "@/services/templates.service";
import { cn } from "@/shared/lib/utils";

import { AjusteDeDatas } from "../components/roteiro/AjusteDeDatas";
import { PassoEditor, proximaDataBR } from "../components/roteiro/PassoEditor";

/** Chave estável por passo — o índice muda ao reordenar e o React perderia o foco. */
let sequencia = 0;
const novaChave = () => `passo-${++sequencia}`;

type PassoLocal = PassoIn & {
  chave: string;
  /** Só existe depois de ter rodado; vem do backend, nunca é inventado aqui. */
  status?: StatusDoPasso | null;
  travado?: boolean;
  no_passado?: boolean;
  quando?: string | null;
};

const ICONES = {
  mensagem: FileText,
  oferta: ShoppingBag,
  acao_grupo: Settings2,
} as const;

const novoPasso = (primeiro: boolean): PassoLocal => ({
  chave: novaChave(),
  id: null,
  ordem: 0,
  tipo_tempo: primeiro ? "ancora" : "relativo",
  hora_fixa: primeiro ? "08:00" : null,
  data_fixa: primeiro ? proximaDataBR() : null,
  offset_valor: primeiro ? null : 10,
  offset_unidade: primeiro ? null : "minutos",
  tipo_conteudo: "mensagem",
  blocos: [{ tipo: "texto", conteudo: "" }],
  texto: null,
  midia_url: null,
  oferta_url: null,
  template_id: null,
  acao: null,
  acao_parametro: null,
  grupos_alvo: "todos",
  grupos_alvo_ids: null,
  marcar_todos: "nunca",
});

const formatarOffset = (valor: number | null | undefined, unidade?: string | null) => {
  const curto = UNIDADES.find((u) => u.valor === (unidade ?? "minutos"))?.curto ?? "min";
  return `+${valor ?? 0} ${curto}`;
};

const formatarDuracao = (segundos: number) =>
  segundos < 60 ? "menos de 1 min" : `~${Math.ceil(segundos / 60)} min`;

/** O backend devolve o horário já em Brasília — formatar no fuso do navegador
 *  mostraria outra hora para quem acessa de fora. */
const formatarMomentoBR = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Quando o passo acontece.
 *
 * Passo relativo mostra o offset E o horário resolvido. Só `+5 min` faz ela
 * ancorar um passo num passo de ONTEM sem ver que caiu no passado — e a coluna
 * da direita, que resolvia isso, some quando o roteiro já está agendado.
 */
const quandoDoPasso = (p: PassoLocal) => {
  const resolvido = p.quando ? formatarMomentoBR(p.quando) : null;
  if (p.tipo_tempo === "relativo") {
    const off = formatarOffset(p.offset_valor, p.offset_unidade);
    return resolvido ? `${resolvido} · ${off}` : off;
  }
  if (resolvido) return resolvido;
  const hora = p.hora_fixa || "--:--";
  if (!p.data_fixa) return `${hora} · sem data`;
  const [, mes, dia] = p.data_fixa.split("-");
  return `${dia}/${mes}, ${hora}`;
};

const resumoDoPasso = (p: PassoLocal, templates: Template[]) => {
  if (p.tipo_conteudo === "acao_grupo") {
    const acao = ACOES_DO_GRUPO.find((a) => a.valor === p.acao)?.rotulo ?? "Ação removida";
    return p.acao_parametro ? `${acao}: ${p.acao_parametro}` : acao;
  }
  if (p.tipo_conteudo === "oferta") {
    const t = templates.find((x) => x.id === p.template_id);
    const link = p.oferta_url?.trim() || "Sem link";
    return t ? `${link} · ${t.nome}` : link;
  }
  const primeiro = p.blocos[0];
  if (!primeiro) return "Sem mensagem";
  const corpo =
    primeiro.tipo === "imagem"
      ? primeiro.legenda?.trim() || "Imagem"
      : primeiro.conteudo?.trim() || "Sem texto";
  return p.blocos.length > 1 ? `${corpo} · +${p.blocos.length - 1}` : corpo;
};

const paraLocal = (r: RoteiroDetalhe): PassoLocal[] =>
  r.passos.map((p: PassoOut) => ({
    ...p,
    chave: novaChave(),
    blocos: p.blocos.map(({ tipo, conteudo, legenda, template_id }) => ({
      tipo,
      conteudo,
      legenda,
      template_id,
    })),
  }));

const paraEnvio = (passos: PassoLocal[]): PassoIn[] =>
  passos.map((p, i) => ({
    id: p.id ?? null,
    ordem: i + 1,
    tipo_tempo: p.tipo_tempo,
    hora_fixa: p.hora_fixa,
    data_fixa: p.data_fixa,
    offset_valor: p.offset_valor,
    offset_unidade: p.offset_unidade,
    tipo_conteudo: p.tipo_conteudo,
    blocos: p.blocos,
    texto: p.texto,
    midia_url: p.midia_url,
    oferta_url: p.oferta_url,
    template_id: p.template_id,
    acao: p.acao,
    acao_parametro: p.acao_parametro,
    grupos_alvo: p.grupos_alvo,
    grupos_alvo_ids: p.grupos_alvo_ids,
    marcar_todos: p.marcar_todos,
  }));

/**
 * O `hover:bg-*` de cada cor NÃO é decoração: o `Badge` do shadcn traz
 * `hover:bg-primary/80` na variante default, e sem um `hover:bg-*` aqui o
 * tailwind-merge não tem o que substituir — passar o mouse pintava o chip de
 * AZUL por cima da cor do estado, em todos os três.
 */
const CORES_DO_STATUS = {
  concluido:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20",
  concluido_com_falhas:
    "border-orange-500/25 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20",
  falhou:
    "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20",
} as const;

const ROTULO_DO_STATUS = {
  concluido: "Concluído",
  concluido_com_falhas: "Concluído com falhas",
  falhou: "Falhou",
} as const;

/** Título do painel de execução — o mesmo vocabulário do chip da listagem. */
const TITULO_DA_EXECUCAO = (
  e: { status: string; enviados: number; erros: number; pulados: number },
  encerrado: boolean,
): string => {
  if (!encerrado) return e.status === "enviando" ? "Enviando" : "Agendado";
  if (e.status === "falhou" || e.enviados === 0) return "Falhou";
  return e.erros + e.pulados > 0 ? "Concluído com falhas" : "Concluído";
};

const RoteiroEditor = () => {
  const { campanhaId: campanhaParam, roteiroId: roteiroParam } = useParams();
  const campanhaId = Number(campanhaParam);
  const roteiroId = Number(roteiroParam);
  const navigate = useNavigate();
  const [parametros, setParametros] = useSearchParams();
  const { toast } = useToast();

  const [roteiro, setRoteiro] = useState<RoteiroDetalhe | null>(null);
  const [passos, setPassos] = useState<PassoLocal[]>([]);
  const [grupos, setGrupos] = useState<GrupoDaCampanha[]>([]);
  //  Prefixo/sufixo da campanha: a prévia precisa mostrar o que SAI.
  const [assinatura, setAssinatura] = useState<{ prefixo: string | null; sufixo: string | null }>(
    { prefixo: null, sufixo: null },
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [editando, setEditando] = useState<number | null>(null);
  //  `?datas=1` vem de "Duplicar": a cópia nasce com as datas do lançamento
  //  passado, e o ajuste em bloco é o passo seguinte obrigatório.
  const [ajustandoDatas, setAjustandoDatas] = useState(
    () => parametros.get("datas") === "1",
  );
  const [expandido, setExpandido] = useState<number | null>(null);
  const [reenviando, setReenviando] = useState<number | null>(null);
  const [gruposParaReenvio, setGruposParaReenvio] = useState<Set<number>>(new Set());

  const [preview, setPreview] = useState<PreviewRoteiro | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [avisosParaConfirmar, setAvisosParaConfirmar] = useState<string[] | null>(null);
  const [duplicando, setDuplicando] = useState(false);

  const voltar = `/dashboard/grupos/${campanhaId}?tab=roteiros`;
  const execucao = roteiro?.execucao_ativa ?? null;
  //  O reenvio acontece justamente DEPOIS que a execução terminou — é quando
  //  ela vê o que falhou. `execucao_ativa` já é null aí; a última é a que
  //  carrega as linhas com falha (o backend reabre a execução no reenvio).
  const execucaoDoStatus = roteiro?.execucao_ativa ?? roteiro?.ultima_execucao ?? null;
  /**
   * O roteiro já rodou: a tela abre em LEITURA.
   *
   * Roteiro concluído NÃO é rascunho quebrado. Ele terminou — não há data para
   * ajustar nem agendamento a fazer. Sem isto, os três passos apareciam com
   * chip verde "Concluído" dentro de linhas pintadas de vermelho, sob o aviso
   * "Os passos 1, 2, 3 já passaram. Ajuste as datas para agendar." A mesma
   * linha dizia que deu certo e que deu errado.
   */
  const encerrado = roteiro?.encerrado ?? false;
  //  Destaque de data vencida só onde faz sentido: roteiro em rascunho ou
  //  recém-duplicado. Num roteiro encerrado TODA data está no passado — é o
  //  que "já rodou" significa.
  const noPassado = new Set(encerrado ? [] : (roteiro?.passos_no_passado ?? []));

  const aplicar = useCallback((r: RoteiroDetalhe) => {
    setRoteiro(r);
    setPassos(paraLocal(r));
  }, []);

  const carregar = useCallback(async () => {
    if (!Number.isInteger(roteiroId) || roteiroId <= 0) {
      setErro("Roteiro não encontrado.");
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const [r, campanha] = await Promise.all([
        obterRoteiro(roteiroId),
        Number.isInteger(campanhaId) && campanhaId > 0
          ? obterCampanha(campanhaId)
          : Promise.resolve(null),
      ]);
      aplicar(r);
      setGrupos(campanha ? [...campanha.grupos].sort((a, b) => a.posicao - b.posicao) : []);
      setAssinatura({ prefixo: campanha?.prefixo ?? null, sufixo: campanha?.sufixo ?? null });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [roteiroId, campanhaId, aplicar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Templates alimentam o seletor do passo de oferta — falha aqui não derruba a tela.
  useEffect(() => {
    listarTemplates()
      .then((lista) => setTemplates(lista.filter((t) => t.ativo)))
      .catch(() => setTemplates([]));
  }, []);

  const totalPassos = passos.length;
  useEffect(() => {
    if (totalPassos === 0) {
      setPreview(null);
      return;
    }
    let cancelado = false;
    previewRoteiro(roteiroId)
      .then((p) => !cancelado && setPreview(p))
      .catch(() => !cancelado && setPreview(null));
    return () => {
      cancelado = true;
    };
  }, [roteiroId, totalPassos, roteiro]);

  /**
   * Persiste a lista atual. **Salvar é implícito**: acontece ao concluir o
   * passo, ao mover e ao remover. Antes eram duas ações separadas com um aviso
   * laranja no meio ("Salve os passos para a prévia refletir o que vai ser
   * agendado") — e o caminho natural era clicar em Agendar antes de salvar.
   */
  const persistir = useCallback(
    async (lista: PassoLocal[]) => {
      setSalvando(true);
      try {
        aplicar(await definirPassos(roteiroId, paraEnvio(lista)));
        return true;
      } catch (e) {
        if (e instanceof ErroDeRoteiro) {
          toast({
            title:
              e.codigo === "passo_ja_enviado"
                ? "Esse passo já saiu"
                : "Ajuste as datas",
            description: e.message,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Não foi possível salvar",
            description: (e as Error).message,
            variant: "destructive",
          });
        }
        await carregar();   // a tela volta ao que o banco tem, não ao meio-termo
        return false;
      } finally {
        setSalvando(false);
      }
    },
    [roteiroId, aplicar, toast, carregar],
  );

  const mover = async (indice: number, delta: -1 | 1) => {
    const destino = indice + delta;
    if (destino < 0 || destino >= passos.length) return;
    const copia = [...passos];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    setPassos(copia);
    await persistir(copia);
  };

  const remover = async (indice: number) => {
    const copia = passos.filter((_, i) => i !== indice);
    setPassos(copia);
    await persistir(copia);
  };

  const adicionar = () => {
    setPassos((atual) => [...atual, novoPasso(atual.length === 0)]);
    setEditando(passos.length);
  };

  const concluirPasso = async () => {
    if (editando == null) return;
    // Fecha SÓ depois de o PUT passar. Fechando antes, o `carregar()` do
    // caminho de erro devolvia a lista do banco e o passo novo (id null)
    // desaparecia com tudo que ela tinha digitado — sem nada na tela ligando
    // uma coisa à outra.
    if (await persistir(passos)) setEditando(null);
  };

  const executarAgendamento = async (ignorarAvisos: boolean) => {
    setAgendando(true);
    try {
      const resultado = await agendarRoteiro(roteiroId, ignorarAvisos);
      if (resultado.agendada === false) {
        setAvisosParaConfirmar(resultado.avisos);
        return;
      }
      setAvisosParaConfirmar(null);
      toast({
        title: "Roteiro agendado",
        description: `${resultado.execucao.total} mensagens na fila.`,
      });
      navigate(voltar);
    } catch (e) {
      if (e instanceof ErroDeRoteiro && e.codigo === "passos_no_passado") {
        toast({
          title: "Ajuste as datas antes de agendar",
          description: e.message,
          variant: "destructive",
        });
        await carregar();
        setAjustandoDatas(true);
      } else {
        toast({
          title: "Não foi possível agendar",
          description: (e as Error).message,
          variant: "destructive",
        });
        await carregar();
      }
    } finally {
      setAgendando(false);
    }
  };

  const reenviar = async (passoId: number) => {
    if (!execucaoDoStatus || gruposParaReenvio.size === 0) return;
    setReenviando(passoId);
    try {
      await reenviarPasso(execucaoDoStatus.id, passoId, [...gruposParaReenvio]);
      toast({ title: "Reenvio na fila" });
      setGruposParaReenvio(new Set());
      setExpandido(null);
      await carregar();
    } catch (e) {
      toast({
        title: "Não foi possível reenviar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setReenviando(null);
    }
  };

  const passoEmEdicao = editando != null ? passos[editando] : undefined;
  // Sem useMemo: `noPassado` já é derivado de `roteiro` a cada render, então
  // memoizar aqui só criaria uma lista de dependências que mente.
  const podeAgendar =
    !execucao && !encerrado && passos.length > 0 && noPassado.size === 0;
  //  Roteiro encerrado não tem execução ATIVA, mas o painel direito precisa
  //  mostrar o que aconteceu — senão ele cairia no ramo da prévia e ofereceria
  //  agendar um roteiro que já rodou.
  const resumoDaExecucao = execucao ?? (encerrado ? roteiro?.ultima_execucao ?? null : null);

  const duplicarEAbrir = async () => {
    if (!roteiro) return;
    setDuplicando(true);
    try {
      const copia = await duplicarRoteiro(roteiro.id);
      // Vai direto para a cópia: os passos de data fixa nascem marcados e o
      // Agendar fica travado até ela corrigir, no contexto da sequência.
      navigate(`/dashboard/grupos/${campanhaId}/roteiros/${copia.id}`);
    } catch (e) {
      toast({
        title: "Não foi possível duplicar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setDuplicando(false);
    }
  };

  if (carregando) {
    return (
      <DashboardLayout title="Roteiro">
        <div className="grid gap-6 lg:grid-cols-[62fr_38fr]">
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (erro || !roteiro) {
    return (
      <DashboardLayout title="Roteiro">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {erro ?? "Não foi possível carregar o roteiro."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => void carregar()}>
                Tentar novamente
              </Button>
              <Button asChild variant="ghost">
                <Link to={voltar}>Voltar para a campanha</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={roteiro.nome}>
      <div className="mx-auto w-full max-w-[1100px] pb-28">
        <div className="grid gap-6 lg:grid-cols-[62fr_38fr]">
          {/* min-w-0 nas duas colunas: a trilha `auto` do grid adota o
              min-content do conteúdo e, sem isso, estoura a tela no celular. */}
          <div className="min-w-0 space-y-3">
            {passos.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <Clock className="h-6 w-6 text-primary" />
                  </span>
                  <p className="text-sm font-medium text-foreground">Nenhum passo ainda</p>
                  {/* O texto antigo ("o primeiro passo tem data e hora
                      próprias") dava a entender que só o primeiro tem data, e
                      não é verdade: qualquer passo pode ter data fixa. */}
                  <p className="max-w-sm text-sm text-muted-foreground">
                    O passo 1 marca o início do roteiro, com data e hora própria.
                    Os seguintes podem sair depois dele ou em data própria.
                  </p>
                  <Button onClick={adicionar}>
                    <Plus className="mr-2 h-4 w-4" /> Adicionar passo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border">
                  {passos.map((p, i) => {
                    const Icone = ICONES[p.tipo_conteudo] ?? FileText;
                    const IconeTempo = p.tipo_tempo === "ancora" ? Clock : Timer;
                    const atrasado = noPassado.has(i + 1);
                    const aberto = expandido === p.id;
                    return (
                      <div
                        key={p.chave}
                        className={cn(
                          i > 0 && "border-t border-border",
                          // Vermelho é EXCLUSIVO de falha (o chip de status
                          // abaixo). Data vencida é aviso, não erro: âmbar.
                          atrasado && "bg-amber-500/5",
                          // Passo bloqueado é estado NEUTRO: linha apagada com
                          // cadeado. Antes ele só ganhava o ícone e herdava a
                          // cor da linha.
                          p.travado && "opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3">
                          <button
                            type="button"
                            onClick={() => !p.travado && setEditando(i)}
                            disabled={p.travado}
                            className={cn(
                              "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors",
                              p.travado ? "cursor-default" : "hover:bg-accent/40",
                            )}
                            aria-label={`Editar passo ${i + 1}`}
                          >
                            <span
                              className={cn(
                                "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                                atrasado
                                  ? "bg-amber-500/20 text-amber-500"
                                  : "bg-primary/15 text-primary",
                              )}
                            >
                              {i + 1}
                            </span>
                            {/* min-w-0 em CADA nível: sem ele o `truncate`
                                vira largura mínima e estoura no celular. */}
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span
                                className={cn(
                                  "flex min-w-0 items-center gap-1.5 text-xs",
                                  atrasado ? "text-amber-500" : "text-muted-foreground",
                                )}
                              >
                                <IconeTempo className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="truncate">{quandoDoPasso(p)}</span>
                                {p.travado && <Lock className="h-3 w-3 flex-shrink-0" />}
                              </span>
                              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                                <Icone className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">
                                  {resumoDoPasso(p, templates)}
                                </span>
                              </span>
                            </span>
                          </button>

                          {p.status && (
                            <button
                              type="button"
                              onClick={() => setExpandido(aberto ? null : p.id ?? null)}
                              disabled={p.status.falhas.length === 0}
                              // `rounded-full` + focus-visible próprios: um
                              // <button> nu herda o contorno padrão do
                              // Chromium, que num chip pequeno vira um halo
                              // azul quadrado por cima da cor do status.
                              className="flex-shrink-0 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              aria-label={`Status do passo ${i + 1}`}
                            >
                              <Badge
                                className={cn(
                                  "gap-1 whitespace-nowrap",
                                  CORES_DO_STATUS[p.status.status],
                                )}
                              >
                                {ROTULO_DO_STATUS[p.status.status]}
                                {p.status.falhas.length > 0 && (
                                  <ChevronDown
                                    className={cn(
                                      "h-3 w-3 transition-transform",
                                      aberto && "rotate-180",
                                    )}
                                  />
                                )}
                              </Badge>
                            </button>
                          )}

                          {!p.travado && (
                            <span className="flex flex-shrink-0 items-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={i === 0 || salvando}
                                onClick={() => void mover(i, -1)}
                                aria-label={`Mover passo ${i + 1} para cima`}
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={i === passos.length - 1 || salvando}
                                onClick={() => void mover(i, 1)}
                                aria-label={`Mover passo ${i + 1} para baixo`}
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={salvando}
                                onClick={() => void remover(i)}
                                aria-label={`Remover passo ${i + 1}`}
                              >
                                <X className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </span>
                          )}
                        </div>

                        {aberto && p.status && p.status.falhas.length > 0 && (
                          <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-3">
                            {p.status.falhas.map((f) => (
                              <label
                                key={f.grupo_id}
                                className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg px-1 transition-colors hover:bg-accent/40"
                              >
                                <CheckboxQuadrado
                                  checked={gruposParaReenvio.has(f.grupo_id)}
                                  onCheckedChange={() => {
                                    const proximo = new Set(gruposParaReenvio);
                                    if (proximo.has(f.grupo_id)) proximo.delete(f.grupo_id);
                                    else proximo.add(f.grupo_id);
                                    setGruposParaReenvio(proximo);
                                  }}
                                  aria-label={`Selecionar ${f.nome} para reenvio`}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                  {f.nome}
                                </span>
                                <span className="flex-shrink-0 text-xs text-muted-foreground">
                                  {f.motivo}
                                </span>
                              </label>
                            ))}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                gruposParaReenvio.size === 0 || reenviando === p.id
                              }
                              onClick={() => void reenviar(p.id!)}
                            >
                              {reenviando === p.id ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RotateCcw className="mr-2 h-3.5 w-3.5" />
                              )}
                              Reenviar aos selecionados
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {roteiro.avisos.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      {roteiro.avisos.length === 1
                        ? "1 aviso"
                        : `${roteiro.avisos.length} avisos`}
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-amber-500">
                      {roteiro.avisos.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Roteiro que já rodou abre em LEITURA: nada de adicionar
                    passo nem ajustar data — não há data a ajustar. */}
                {!encerrado && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={adicionar} disabled={salvando}>
                      <Plus className="mr-2 h-4 w-4" /> Adicionar passo
                    </Button>
                    {passos.some((p) => p.tipo_tempo === "ancora") && (
                      <Button variant="outline" onClick={() => setAjustandoDatas(true)}>
                        <CalendarClock className="mr-2 h-4 w-4" /> Ajustar datas
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Prévia + agendamento ── */}
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardContent className="space-y-4 p-4">
                {resumoDaExecucao ? (
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {encerrado && (resumoDaExecucao.erros + resumoDaExecucao.pulados) > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      ) : (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                      {TITULO_DA_EXECUCAO(resumoDaExecucao, encerrado)}
                    </p>
                    <div className="space-y-1.5 text-sm">
                      {/*
                        "Agendadas" e "Na fila" são coisas diferentes, e somá-las
                        fazia o card dizer "Na fila 3" com o roteiro marcado para
                        21:40 e o relógio em 21:15. A diferença importa no
                        diagnóstico: "na fila há 20 minutos" é problema,
                        "agendada para daqui a 25" é o roteiro funcionando.

                        Linhas zeradas somem: num roteiro concluído "Agendadas 0"
                        e "Na fila 0" são ruído.
                      */}
                      {([
                        ["Enviadas", resumoDaExecucao.enviados],
                        ["Agendadas", resumoDaExecucao.agendadas],
                        ["Na fila", resumoDaExecucao.na_fila],
                        ["Falhas", resumoDaExecucao.erros + resumoDaExecucao.pulados],
                      ] as [string, number][])
                        .filter(([rotulo, valor]) =>
                          valor > 0 || rotulo === "Enviadas" || rotulo === "Falhas")
                        .map(([rotulo, valor]) => (
                        <div key={rotulo} className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{rotulo}</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {valor}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {encerrado
                        ? "Este roteiro já rodou. Para mandar de novo, duplique."
                        : "Passos que ainda não saíram podem ser editados — o resto do roteiro reagenda sozinho."}
                    </p>
                  </div>
                ) : passos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Adicione ao menos um passo para ver a prévia.
                  </p>
                ) : noPassado.size > 0 ? (
                  /* Âmbar, não vermelho: data vencida num rascunho é aviso, não
                     falha. Vermelho ficou reservado para o que deu errado. */
                  <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {noPassado.size === 1
                      ? `O passo ${[...noPassado][0]} já passou.`
                      : `Os passos ${[...noPassado].join(", ")} já passaram.`}{" "}
                    Ajuste as datas para agendar.
                  </p>
                ) : preview ? (
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-lg border border-border">
                      {preview.passos.map((linha, i) => (
                        <div
                          key={linha.ordem}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm",
                            i > 0 && "border-t border-border",
                          )}
                        >
                          <span className="w-5 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {linha.ordem}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {formatarMomentoBR(linha.quando)}
                          </span>
                          <span className="flex-shrink-0 text-right tabular-nums text-muted-foreground">
                            {linha.grupos} {linha.grupos === 1 ? "grupo" : "grupos"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Mensagens</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {preview.total_mensagens}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Duração estimada</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatarDuracao(preview.duracao_estimada_s)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Barra fixa. `md:pl-72` acompanha a sidebar; no celular ela sobe acima
          do bottom nav (z-40, 58px) — no bottom-0 o botão ficava escondido. */}
      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur md:bottom-0 md:pl-72">
        <div className="mx-auto flex max-w-[1100px] items-center gap-2 p-3">
          {salvando && (
            <span className="mr-auto hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
            </span>
          )}
          <Button asChild variant="outline" className="flex-1 sm:ml-auto sm:flex-none">
            <Link to={voltar}>Voltar</Link>
          </Button>
          {/* Roteiro encerrado não oferece Agendar: já rodou, e agendar de novo
              não é a próxima ação. A próxima ação é DUPLICAR — o registro da
              execução anterior fica intacto. */}
          {encerrado ? (
            <Button
              className="flex-1 sm:flex-none"
              disabled={duplicando}
              onClick={() => void duplicarEAbrir()}
            >
              {duplicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Copy className="mr-2 h-4 w-4" /> Duplicar
            </Button>
          ) : (
            <Button
              className="flex-1 sm:flex-none"
              disabled={!podeAgendar || agendando || salvando}
              onClick={() => void executarAgendamento(false)}
            >
              {agendando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {execucao ? "Já agendado" : "Agendar"}
            </Button>
          )}
        </div>
      </div>

      {passoEmEdicao && editando != null && (
        <PassoEditor
          passo={passoEmEdicao}
          indice={editando}
          primeiro={editando === 0}
          grupos={grupos}
          templates={templates}
          prefixo={assinatura.prefixo}
          sufixo={assinatura.sufixo}
          onMudar={(patch) =>
            setPassos((atual) =>
              atual.map((p, i) => (i === editando ? { ...p, ...patch } : p)),
            )
          }
          onConcluir={() => void concluirPasso()}
        />
      )}

      {ajustandoDatas && (
        <AjusteDeDatas
          passos={roteiro.passos}
          salvando={salvando}
          onFechar={() => {
            setAjustandoDatas(false);
            if (parametros.has("datas")) {
              parametros.delete("datas");
              setParametros(parametros, { replace: true });
            }
          }}
          onSalvar={async (datas) => {
            setSalvando(true);
            try {
              aplicar(await ajustarDatas(roteiroId, datas));
              setAjustandoDatas(false);
              if (parametros.has("datas")) {
                parametros.delete("datas");
                setParametros(parametros, { replace: true });
              }
              toast({ title: "Datas atualizadas" });
            } catch (e) {
              toast({
                title: "Não foi possível ajustar as datas",
                description: (e as Error).message,
                variant: "destructive",
              });
            } finally {
              setSalvando(false);
            }
          }}
        />
      )}

      <AlertDialog
        open={avisosParaConfirmar != null}
        onOpenChange={(aberto) => !aberto && setAvisosParaConfirmar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Agendar mesmo assim?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc space-y-1 pl-5 text-left">
                {(avisosParaConfirmar ?? []).map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={agendando}>Voltar e ajustar</AlertDialogCancel>
            <AlertDialogAction
              disabled={agendando}
              onClick={(e) => {
                e.preventDefault();
                void executarAgendamento(true);
              }}
            >
              {agendando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agendar assim mesmo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default RoteiroEditor;

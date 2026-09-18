import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowDown, ArrowUp, Download, Loader2, Lock, MoreVertical, Plus,
  Trash2,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { AnunciosDaCampanha } from "@/features/dashboard/components/AnunciosDaCampanha";
import { ConfiguracoesDaCampanha } from "@/features/dashboard/components/ConfiguracoesDaCampanha";
import { ExportarLeadsModal } from "@/features/dashboard/components/ExportarLeadsModal";
import { NumerosDaCampanha } from "@/features/dashboard/components/NumerosDaCampanha";
import { StatusDaCampanhaToggle } from "@/features/dashboard/components/StatusDaCampanhaToggle";
import { VisaoGeralDaCampanha } from "@/features/dashboard/components/VisaoGeralDaCampanha";
import { AtividadeDaCampanha } from "@/features/dashboard/components/AtividadeDaCampanha";
import { LinkDeEntradaDaCampanha } from "@/features/dashboard/components/LinkDeEntradaDaCampanha";
import { ResultadosDaCampanha } from "@/features/dashboard/components/ResultadosDaCampanha";
import { MonitoramentoDaCampanha } from "@/features/dashboard/components/MonitoramentoDaCampanha";
import { RoteirosDaCampanha } from "@/features/dashboard/components/RoteirosDaCampanha";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckboxQuadrado } from "@/components/shared/CheckboxQuadrado";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { StatusCampanhaBadge } from "@/features/dashboard/pages/CampanhasGrupos";
import {
  definirGruposDaCampanha,
  obterCampanha,
  type CampanhaGrupos,
  type CampanhaGruposDetalhe,
} from "@/services/campanhas_grupos.service";
import { cn } from "@/shared/lib/utils";
import { mensagemAmigavel } from "@/services/http-error";
import { useWhatsappConexoesStore } from "@/stores/whatsappConexoesStore";
import { rotuloDoGrupo } from "@/shared/lib/grupo";

/**
 * Linha da aba Grupos, mantida localmente até o "Salvar ordem".
 *
 * `cheio` e `aberto` são DOIS eixos, não um. `aberto` é a decisão da afiliada;
 * `cheio` vem da ocupação e ela pode sobrescrever. O grupo entra na rotação
 * quando está aberto E não cheio. Antes disso os dois estavam confundidos num
 * toggle só, e o grupo com 946/900 aparecia "Aberto" para sempre.
 */
type VinculoLocal = {
  grupo_id: number;
  aberto: boolean;
  /** Estado efetivo, como o backend resolveu (override ou ocupação). */
  cheio: boolean;
  /** `null` = automático. É o que o PUT persiste. */
  cheio_override: boolean | null;
  /** Teto efetivo, já calculado no backend com a regra da rotação. */
  teto: number;
  nome: string;
  participantes: number;
  capacidade: number;
  instancia_ids: number[];
};

const paraVinculos = (detalhe: CampanhaGruposDetalhe): VinculoLocal[] =>
  [...detalhe.grupos]
    .sort((a, b) => a.posicao - b.posicao)
    .map((g) => ({
      grupo_id: g.grupo_id,
      aberto: g.aberto,
      cheio: g.cheio,
      cheio_override: g.cheio_override,
      teto: g.teto,
      nome: g.nome ?? "(grupo sem nome)",
      participantes: g.participantes,
      capacidade: g.capacidade,
      instancia_ids: g.instancia_ids ?? [],
    }));

/**
 * Assinatura de ordem + aberto + cheio — é o que o PUT persiste, então é o que
 * define "sujo". Campo novo esquecido aqui vira alteração que não acende o
 * botão e some sem aviso.
 */
const assinatura = (vinculos: VinculoLocal[]) =>
  vinculos
    .map((v) => `${v.grupo_id}:${v.aberto ? 1 : 0}:${v.cheio_override ?? "a"}`)
    .join(",");

/**
 * A regra automática de lotação, num lugar só.
 *
 * O backend manda `cheio` e `teto` prontos (mesma regra da rotação); isto aqui
 * existe só para o estado LOCAL — a linha que ainda não foi salva e o rótulo
 * "Automático" do Select, que precisa dizer o que o automático diz hoje.
 */
const estaCheioPelaOcupacao = (v: { participantes: number; teto: number }) =>
  v.teto > 0 && v.participantes >= v.teto;

/** Acima disto a ocupação vira alerta — antes o laranja seguia `cheio`, e um
 *  grupo com 767/900 (85%) já aparecia alaranjado sem estar enchendo. */
const LIMIAR_ATENCAO = 0.9;

/** O Select mostra a INTENÇÃO: `null` é "Automático", não o valor efetivo. */
const valorDoCheio = (v: { cheio_override: boolean | null }) =>
  v.cheio_override === null ? "auto" : v.cheio_override ? "sim" : "nao";

const ocupacaoClass = (v: { participantes: number; teto: number; cheio: boolean }) => {
  if (v.cheio) return "font-semibold text-amber-500";
  if (v.teto > 0 && v.participantes / v.teto >= LIMIAR_ATENCAO) return "text-amber-500";
  return "text-foreground";
};

/** Filtro da aba Grupos — a lista pode ficar longa numa campanha madura. */
type FiltroGrupos = "todos" | "cheios" | "nao-cheios";
const FILTROS_GRUPOS: { valor: FiltroGrupos; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "cheios", rotulo: "Cheios" },
  { valor: "nao-cheios", rotulo: "Não cheios" },
];

/** Abas válidas em ?tab= — voltar do editor de roteiro cai direto na aba certa. */
const ABAS = [
  "visao-geral",
  "numeros",
  "grupos",
  "roteiros",
  "link",
  "anuncios",
  "resultados",
  "configuracoes",
  "atividade",
  "monitoramento",
] as const;

const CampanhaGrupoDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const campanhaId = Number(id);
  const [searchParams, setSearchParams] = useSearchParams();
  const abaDaUrl = searchParams.get("tab");
  const abaAtiva = ABAS.includes(abaDaUrl as (typeof ABAS)[number])
    ? (abaDaUrl as string)
    : "visao-geral";

  // Abas controladas pela URL: com `defaultValue` a aba só era lida na montagem,
  // então trocar `?tab=` (link de outra tela, ação de estado vazio) não mudava
  // nada na tela. `replace` para não encher o histórico com cada clique de aba.
  const trocarAba = useCallback(
    (aba: string) => {
      const proximo = new URLSearchParams(searchParams);
      proximo.set("tab", aba);
      setSearchParams(proximo, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const { toast } = useToast();
  const {
    grupos: gruposSincronizados,
    instancias,
    fetch: fetchConexoes,
  } = useWhatsappConexoesStore();

  const [detalhe, setDetalhe] = useState<CampanhaGruposDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [modalExport, setModalExport] = useState(false);
  const [filtroGrupos, setFiltroGrupos] = useState<FiltroGrupos>("todos");
  /** Linhas marcadas para a ação em lote. NÃO entra na assinatura: seleção não
   *  é dado persistido. */
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  /** Grupo pendente de confirmação de remoção (spec §3.2). */
  const [removendo, setRemovendo] = useState<VinculoLocal | null>(null);

  const [vinculos, setVinculos] = useState<VinculoLocal[]>([]);
  const [baseline, setBaseline] = useState("");
  const [salvandoGrupos, setSalvandoGrupos] = useState(false);

  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const aplicarGrupos = useCallback((d: CampanhaGruposDetalhe) => {
    const lista = paraVinculos(d);
    setVinculos(lista);
    setBaseline(assinatura(lista));
  }, []);

  const carregar = useCallback(async () => {
    if (!Number.isInteger(campanhaId) || campanhaId <= 0) {
      setErro("Campanha não encontrada.");
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const d = await obterCampanha(campanhaId);
      setDetalhe(d);
      aplicarGrupos(d);
    } catch (e) {
      // `mensagemAmigavel` e não `.message`: com o backend reiniciando, o
      // proxy devolve HTML e a tela exibiria o HTML cru como estado de erro.
      setErro(mensagemAmigavel(e, "Não foi possível carregar a campanha."));
    } finally {
      setCarregando(false);
    }
  }, [campanhaId, aplicarGrupos]);

  useEffect(() => {
    void carregar();
    void fetchConexoes();
  }, [carregar, fetchConexoes]);

  // Sete abas não cabem em 390px. Sem isto, quem chega por `?tab=resultados`
  // cai numa lista rolada até o começo e não vê qual aba está ativa.
  const abasRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (carregando) return;
    abasRef.current
      ?.querySelector('[data-state="active"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [carregando, abaAtiva]);

  // ── Configurações ─────────────────────────────────────────────────────────
  const aoSalvarConfig = (atualizada: CampanhaGrupos) => {
    setDetalhe((atual) => (atual ? { ...atual, ...atualizada } : atual));
  };

  // ── Grupos ────────────────────────────────────────────────────────────────
  const gruposDirty = assinatura(vinculos) !== baseline;

  const mover = (indice: number, delta: -1 | 1) => {
    setVinculos((atual) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  };

  /**
   * Quem a rotação normal ainda pode escolher: aberto E não cheio.
   *
   * São os DOIS eixos juntos — `aberto` é a decisão dela, `cheio` é o teto. A
   * rotação exige os dois, então olhar só um daria "ainda tem grupo" com a
   * campanha já sem destino.
   */
  const disponiveisApos = (lista: VinculoLocal[]) =>
    lista.filter((v) => v.aberto && !v.cheio).length;

  /**
   * A ação que esvazia a rotação AVISA — e deixa continuar.
   *
   * Bloquear seria pior: fechar o último grupo é uma decisão legítima (parar
   * de receber), e o produto não pode impedi-la. Mas a consequência não é
   * óbvia da tela: desde 05/09 o link não mostra mais "vagas esgotadas", ele
   * manda para o primeiro da ordem — que já está no limite. Sem o aviso, ela
   * fecharia tudo achando que parou a entrada, e continuaria recebendo gente.
   *
   * Guarda a ação pendente inteira: o texto é o mesmo nos dois caminhos
   * (marcar cheio, fechar), e duplicar o diálogo por origem só multiplicaria
   * o lugar onde a frase envelhece.
   */
  const [avisoRotacao, setAvisoRotacao] = useState<(() => void) | null>(null);

  const comAvisoSeEsvaziar = (proxima: VinculoLocal[], aplicar: () => void) => {
    if (disponiveisApos(vinculos) > 0 && disponiveisApos(proxima) === 0) {
      setAvisoRotacao(() => aplicar);
      return;
    }
    aplicar();
  };

  const alternarAberto = (grupoId: number) => {
    const aplicar = () =>
      setVinculos((atual) =>
        atual.map((v) => (v.grupo_id === grupoId ? { ...v, aberto: !v.aberto } : v)),
      );
    const proxima = vinculos.map((v) =>
      v.grupo_id === grupoId ? { ...v, aberto: !v.aberto } : v,
    );
    comAvisoSeEsvaziar(proxima, aplicar);
  };

  /**
   * Define "cheio": `true`, `false` ou `null` (volta ao automático).
   *
   * **Grava SEMPRE o valor escolhido.** A versão anterior limpava o override
   * quando ele coincidia com o automático, e isso produzia o pior defeito
   * possível: marcar "Sim" num grupo que já estava cheio pela ocupação gravava
   * `null` — ou seja, NADA era persistido. A tela mostrava "Sim", a assinatura
   * não mudava, "Salvar ordem" nem acendia, e no sync seguinte a contagem caía
   * e o grupo voltava para "Não" sozinho.
   *
   * Uma vez marcado à mão, o valor é dela até ela mesma mudar — e o caminho de
   * volta ao automático é a terceira opção do Select, explícita.
   */
  const definirCheio = (grupoIds: Set<number> | number, valor: boolean | null) => {
    const alvos = typeof grupoIds === "number" ? new Set([grupoIds]) : grupoIds;
    const aplicarEm = (lista: VinculoLocal[]) =>
      lista.map((v) =>
        alvos.has(v.grupo_id)
          ? {
              ...v,
              cheio_override: valor,
              // O efetivo acompanha: `null` volta a seguir a ocupação.
              cheio: valor === null ? estaCheioPelaOcupacao(v) : valor,
            }
          : v,
      );
    comAvisoSeEsvaziar(aplicarEm(vinculos), () => setVinculos(aplicarEm));
  };

  const alternarMarcado = (grupoId: number) => {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(grupoId)) proximo.delete(grupoId);
      else proximo.add(grupoId);
      return proximo;
    });
  };

  /**
   * Só tira da lista local — o "Salvar ordem" é que persiste.
   *
   * O grupo continua ativo em Configurações › WhatsApp › Números e nas outras
   * campanhas: um grupo pode estar em várias, e sair de uma nunca afeta as
   * demais (spec §3.2).
   */
  const removerVinculo = (grupoId: number) => {
    setVinculos((atual) => atual.filter((v) => v.grupo_id !== grupoId));
    setMarcados((atual) => {
      const proximo = new Set(atual);
      proximo.delete(grupoId);
      return proximo;
    });
    setRemovendo(null);
  };

  const salvarGrupos = async () => {
    setSalvandoGrupos(true);
    try {
      const atualizado = await definirGruposDaCampanha(
        campanhaId,
        // A lista COMPLETA e na ordem do array — nunca a filtrada: o PUT
        // substitui o conjunto inteiro, e mandar a lista filtrada apagaria da
        // campanha todos os grupos escondidos pelo filtro.
        vinculos.map((v, i) => ({
          grupo_id: v.grupo_id,
          posicao: i,
          aberto: v.aberto,
          cheio_override: v.cheio_override,
        })),
      );
      setDetalhe((atual) =>
        atual ? { ...atual, grupos: atualizado.grupos, total_grupos: atualizado.total_grupos } : atualizado,
      );
      aplicarGrupos(atualizado);
      toast({ title: "Grupos salvos" });
    } catch (e) {
      toast({
        title: "Não foi possível salvar os grupos",
        description: mensagemAmigavel(e, "Tente novamente."),
        variant: "destructive",
      });
    } finally {
      setSalvandoGrupos(false);
    }
  };

  /** Números que esta campanha usa. Vazio = ainda não configurou a aba Números. */
  const numerosDaCampanha = useMemo(
    () => new Set(detalhe?.instancia_ids ?? []),
    [detalhe],
  );

  // §6.3: a campanha só oferece grupos ATIVADOS pela usuária. Grupos já
  // vinculados continuam visíveis na lista da campanha — só saem da oferta.
  //
  // §2.3: e só grupos dos NÚMEROS da campanha. Sem isso a lista oferecia grupos
  // de qualquer número conectado, e um grupo do número A numa campanha que
  // dispara pelo B faz o envio falhar em silêncio.
  const gruposDisponiveis = useMemo(() => {
    const vinculados = new Set(vinculos.map((v) => v.grupo_id));
    return gruposSincronizados.filter(
      (g) =>
        g.ativado &&
        !vinculados.has(g.id) &&
        (numerosDaCampanha.size === 0 ||
          (g.instancia_ids ?? []).some((id) => numerosDaCampanha.has(id))),
    );
  }, [gruposSincronizados, vinculos, numerosDaCampanha]);

  /**
   * A lista exibida, carregando o índice REAL de cada linha.
   *
   * O índice importa: é ele que vira `posicao` no PUT e o que as setas movem.
   * Filtrar sem preservá-lo faria "mover para cima" trocar a linha com um
   * vizinho que a afiliada não está vendo.
   */
  const visiveis = useMemo(
    () =>
      vinculos
        .map((v, i) => ({ v, i }))
        .filter(({ v }) =>
          filtroGrupos === "todos"
            ? true
            : filtroGrupos === "cheios"
              ? v.cheio
              : !v.cheio,
        ),
    [vinculos, filtroGrupos],
  );

  /**
   * Nenhum número da campanha consegue enviar agora.
   *
   * Escopado pela CAMPANHA, não pela conta: uma conta com 3 chips, 2
   * conectados, mas a campanha usando só o desconectado, precisa ver o aviso.
   * E inclui `envio_pausado` porque o motor pula o chip pausado mesmo
   * conectado — um banner que olhe só `status` mente.
   *
   * Os grupos NÃO somem por causa disso, de propósito: sumindo, ela perderia
   * ordem de preenchimento, seleção e toggles, e teria que remontar tudo ao
   * reconectar. O grupo continua recebendo entrada pelo link; o que parou foi
   * o envio de mensagem.
   */
  const enviosPausados = useMemo(() => {
    if (numerosDaCampanha.size === 0) return false;
    return !instancias.some(
      (i) => numerosDaCampanha.has(i.id) && i.status === "conectada" && !i.envio_pausado,
    );
  }, [instancias, numerosDaCampanha]);

  const temGrupoAtivado = useMemo(
    () => gruposSincronizados.some((g) => g.ativado),
    [gruposSincronizados],
  );

  const gruposFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return gruposDisponiveis;
    return gruposDisponiveis.filter((g) => rotuloDoGrupo(g.nome, g.id).toLowerCase().includes(q));
  }, [gruposDisponiveis, busca]);

  const alternarSelecionado = (grupoId: number) => {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(grupoId)) proximo.delete(grupoId);
      else proximo.add(grupoId);
      return proximo;
    });
  };

  const adicionarSelecionados = () => {
    const novos = gruposDisponiveis
      .filter((g) => selecionados.has(g.id))
      .map((g) => {
        // Teto do grupo novo: o backend só o devolve depois do salvar, então a
        // linha usa a MESMA regra dele (o menor entre capacidade e limite da
        // campanha) até a próxima carga.
        const teto = detalhe?.limite_participantes
          ? Math.min(g.capacidade, detalhe.limite_participantes)
          : g.capacidade;
        return {
          grupo_id: g.id,
          aberto: true,
          cheio: estaCheioPelaOcupacao({ participantes: g.participantes, teto }),
          cheio_override: null,
          teto,
          nome: rotuloDoGrupo(g.nome, g.id),
          participantes: g.participantes,
          capacidade: g.capacidade,
          instancia_ids: g.instancia_ids ?? [],
        };
      });
    setVinculos((atual) => [...atual, ...novos]);
    setModalAdicionar(false);
    setBusca("");
    setSelecionados(new Set());
  };

  // ── Estados de página ─────────────────────────────────────────────────────
  if (carregando) {
    return (
      <DashboardLayout title="Campanha">
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (erro || !detalhe) {
    return (
      <DashboardLayout title="Campanha">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {erro ?? "Não foi possível carregar a campanha."}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => void carregar()}>
                Tentar novamente
              </Button>
              <Button asChild variant="ghost">
                <Link to="/dashboard/grupos">Voltar para Campanhas</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={detalhe.nome}
      // O chip de status era enfeite: o controle real estava enterrado numa
      // aba. Virou toggle aqui, que é onde a decisão acontece.
      action={<StatusDaCampanhaToggle campanha={detalhe} onSalvo={aoSalvarConfig} />}
    >
      {enviosPausados && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-amber-600 dark:text-amber-400">
            Nenhum número conectado — os envios estão pausados. Os grupos continuam
            recebendo gente pelo link de entrada.{" "}
            <Link to="/dashboard/configuracoes?tab=whatsapp" className="underline">
              Reconectar número
            </Link>
          </p>
        </div>
      )}

      <Tabs value={abaAtiva} onValueChange={trocarAba} className="space-y-5">
        {/* O scroll das abas fica no container, nunca na página. */}
        <div ref={abasRef} className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
            <TabsTrigger value="numeros">Números</TabsTrigger>
            <TabsTrigger value="grupos">
              Grupos
              <span className="ml-1.5 tabular-nums text-muted-foreground">{vinculos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="roteiros">Roteiros</TabsTrigger>
            <TabsTrigger value="link">Link de entrada</TabsTrigger>
            <TabsTrigger value="anuncios">Anúncios</TabsTrigger>
            <TabsTrigger value="resultados">Resultados</TabsTrigger>
            <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
            <TabsTrigger value="atividade">Atividade</TabsTrigger>
            <TabsTrigger value="monitoramento">Monitoramento</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="visao-geral">
          <VisaoGeralDaCampanha campanhaId={campanhaId} />
        </TabsContent>

        <TabsContent value="numeros">
          {/*
            Recarregar só quando a aba Grupos NÃO tem rascunho: `carregar()`
            reescreve `vinculos` a partir do banco, e a afiliada que reordenou
            (badge "Alterações não salvas" aceso) perdia a ordem sem aviso ao
            salvar os números. Com rascunho aberto, a lista de grupos continua
            como está — o escopo novo passa a valer no próximo carregamento.
          */}
          <NumerosDaCampanha
            campanhaId={campanhaId}
            onSalvo={() => {
              if (!gruposDirty) void carregar();
            }}
          />
        </TabsContent>

        <TabsContent value="grupos" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setModalAdicionar(true)}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar grupos
              </Button>
              <Button
                variant="outline"
                onClick={() => setModalExport(true)}
                disabled={vinculos.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> Exportar leads
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {gruposDirty && (
                <span className="text-xs text-amber-500">Alterações não salvas</span>
              )}
              <Button
                onClick={() => void salvarGrupos()}
                disabled={!gruposDirty || salvandoGrupos}
              >
                {salvandoGrupos && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar ordem
              </Button>
            </div>
          </div>

          {vinculos.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {FILTROS_GRUPOS.map((f) => (
                  <Button
                    key={f.valor}
                    size="sm"
                    variant={filtroGrupos === f.valor ? "default" : "outline"}
                    onClick={() => setFiltroGrupos(f.valor)}
                  >
                    {f.rotulo}
                  </Button>
                ))}
              </div>
              {/* Ação em lote só altera o rascunho — a persistência continua
                  sendo o mesmo "Salvar ordem". Duas semânticas de salvamento na
                  mesma tela é o pior desfecho: ela perde a noção do que já foi
                  gravado. */}
              {marcados.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {marcados.size} selecionado{marcados.size > 1 ? "s" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      definirCheio(marcados, true);
                      setMarcados(new Set());
                    }}
                  >
                    Marcar como cheio
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      definirCheio(marcados, false);
                      setMarcados(new Set());
                    }}
                  >
                    Marcar como não cheio
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      definirCheio(marcados, null);
                      setMarcados(new Set());
                    }}
                  >
                    Voltar ao automático
                  </Button>
                </div>
              )}
            </div>
          )}

          {vinculos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                {numerosDaCampanha.size === 0 ? (
                  <>
                    {/* Lista vazia sem motivo é lida como bug. Diz o que falta. */}
                    <p className="max-w-md text-sm text-muted-foreground">
                      Escolha primeiro por quais números esta campanha envia — os grupos
                      disponíveis vêm deles.
                    </p>
                    <Button variant="outline" onClick={() => trocarAba("numeros")}>
                      Ir para Números
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Nenhum grupo na campanha ainda.
                    </p>
                    <Button variant="outline" onClick={() => setModalAdicionar(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Adicionar grupos
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Desktop: linhas tabulares */}
              <div className="hidden overflow-hidden rounded-xl border border-border md:block">
                <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="w-5" aria-hidden />
                  <span className="w-6" aria-hidden />
                  <span className="min-w-0 flex-1">Grupo</span>
                  <span className="w-28 text-right">Ocupação</span>
                  <span className="w-24 text-center">Cheio</span>
                  <span className="w-11 text-center">Aberto</span>
                  <span className="w-[120px]" aria-hidden />
                </div>
                {visiveis.map(({ v, i }, ordem) => (
                  <div
                    key={v.grupo_id}
                    className={cn("flex items-center gap-3 px-4 py-2", ordem > 0 && "border-t border-border")}
                  >
                    <span className="flex w-5 flex-shrink-0 justify-center">
                      <CheckboxQuadrado
                        checked={marcados.has(v.grupo_id)}
                        onCheckedChange={() => alternarMarcado(v.grupo_id)}
                        aria-label={`Selecionar ${v.nome}`}
                      />
                    </span>
                    <span className="w-6 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {v.nome}
                    </span>
                    <span
                      className={cn(
                        "w-28 flex-shrink-0 text-right text-sm tabular-nums",
                        ocupacaoClass(v),
                      )}
                    >
                      {v.participantes}/{v.teto}
                    </span>
                    {/*
                      A coluna mostra o VALOR (Sim/Não), não o modo.

                      "Automático" é o nome do mecanismo, não a resposta da
                      pergunta que a coluna faz — ela olhava e não sabia se o
                      grupo estava cheio. Agora o gatilho exibe o estado
                      resolvido, com cadeado quando a escolha foi dela (e aí o
                      sync não sobrescreve).

                      As OPÇÕES continuam mostrando a intenção, com
                      "Automático" como caminho de volta: sem ele cada marcação
                      manual viraria permanente e "Reabertura automática"
                      passaria a mentir.
                    */}
                    <span className="flex w-32 flex-shrink-0 justify-center">
                      <Select
                        value={valorDoCheio(v)}
                        disabled={salvandoGrupos}
                        onValueChange={(valor) =>
                          definirCheio(v.grupo_id, valor === "auto" ? null : valor === "sim")
                        }
                      >
                        <SelectTrigger
                          className="h-8 w-full"
                          aria-label={`Grupo ${v.nome} cheio`}
                        >
                          <SelectValue>
                            <span className="flex items-center gap-1.5">
                              {v.cheio ? "Sim" : "Não"}
                              {v.cheio_override !== null && (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            Automático{estaCheioPelaOcupacao(v) ? " (cheio)" : ""}
                          </SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </span>
                    <span className="flex w-11 flex-shrink-0 justify-center">
                      <Switch
                        checked={v.aberto}
                        disabled={salvandoGrupos}
                        onCheckedChange={() => alternarAberto(v.grupo_id)}
                        aria-label={`Grupo ${v.nome} aberto`}
                      />
                    </span>
                    <span className="flex w-[120px] flex-shrink-0 items-center justify-end">
                      {/* Reordenar com filtro ligado moveria a linha para uma
                          posição que ela não vê. As setas trabalham no índice
                          REAL e ficam desligadas fora do "Todos". */}
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={i === 0 || salvandoGrupos || filtroGrupos !== "todos"}
                        onClick={() => mover(i, -1)}
                        aria-label={`Mover ${v.nome} para cima`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={
                          i === vinculos.length - 1 || salvandoGrupos ||
                          filtroGrupos !== "todos"
                        }
                        onClick={() => mover(i, 1)}
                        aria-label={`Mover ${v.nome} para baixo`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={salvandoGrupos}
                            aria-label={`Ações do grupo ${v.nome}`}
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setRemovendo(v)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover da campanha
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  </div>
                ))}
              </div>

              {/* Mobile: cards empilhados, alvos de toque de 40px */}
              <div className="space-y-3 md:hidden">
                {visiveis.map(({ v, i }) => (
                  <div key={v.grupo_id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <CheckboxQuadrado
                          className="mt-1 flex-shrink-0"
                          checked={marcados.has(v.grupo_id)}
                          onCheckedChange={() => alternarMarcado(v.grupo_id)}
                          aria-label={`Selecionar ${v.nome}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                              {i + 1}.
                            </span>
                            <span className="truncate">{v.nome}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            <span className={cn("tabular-nums", ocupacaoClass(v))}>
                              {v.participantes}/{v.teto}
                            </span>{" "}
                            participantes
                          </p>
                        </div>
                      </div>
                      <Select
                        value={valorDoCheio(v)}
                        disabled={salvandoGrupos}
                        onValueChange={(valor) =>
                          definirCheio(v.grupo_id, valor === "auto" ? null : valor === "sim")
                        }
                      >
                        <SelectTrigger
                          className="h-9 w-[132px] flex-shrink-0"
                          aria-label={`Grupo ${v.nome} cheio`}
                        >
                          {/* Mesmos rótulos do desktop: a coluna responde a
                              mesma pergunta nos dois tamanhos. */}
                          <SelectValue>
                            <span className="flex items-center gap-1.5">
                              {v.cheio ? "Sim" : "Não"}
                              {v.cheio_override !== null && (
                                <Lock className="h-3 w-3 text-muted-foreground" />
                              )}
                            </span>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">
                            Automático{estaCheioPelaOcupacao(v) ? " (cheio)" : ""}
                          </SelectItem>
                          <SelectItem value="sim">Sim</SelectItem>
                          <SelectItem value="nao">Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <Switch
                          checked={v.aberto}
                          disabled={salvandoGrupos}
                          onCheckedChange={() => alternarAberto(v.grupo_id)}
                          aria-label={`Grupo ${v.nome} aberto`}
                        />
                        {v.aberto ? "Aberto" : "Fechado"}
                      </label>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={i === 0 || salvandoGrupos || filtroGrupos !== "todos"}
                          onClick={() => mover(i, -1)}
                          aria-label={`Mover ${v.nome} para cima`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={
                            i === vinculos.length - 1 || salvandoGrupos ||
                            filtroGrupos !== "todos"
                          }
                          onClick={() => mover(i, 1)}
                          aria-label={`Mover ${v.nome} para baixo`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={salvandoGrupos}
                              aria-label={`Ações do grupo ${v.nome}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRemovendo(v)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remover da campanha
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="roteiros">
          <RoteirosDaCampanha
            campanhaId={campanhaId}
            gruposAbertos={vinculos.filter((v) => v.aberto).map((v) => v.grupo_id)}
          />
        </TabsContent>

        <TabsContent value="link" forceMount className="data-[state=inactive]:hidden">
          <LinkDeEntradaDaCampanha campanhaId={campanhaId} />
        </TabsContent>

        <TabsContent value="configuracoes">
          {/* `key` para o formulário ressincronizar ao trocar de campanha: como
              aba, o componente fica montado e não tem mais o `open` que fazia
              esse papel. */}
          <ConfiguracoesDaCampanha
            key={detalhe.id}
            campanha={detalhe}
            onSalvo={aoSalvarConfig}
          />
        </TabsContent>

        <TabsContent value="atividade">
          {/* Nomes dos grupos vêm daqui: evita uma segunda request só para
              montar os chips de filtro.

              `detalhe.grupos` (SALVO), não `vinculos` (rascunho da aba) — a
              mesma regra do ExportarLeadsModal abaixo, e eu tinha escrito o
              inverso aqui. O chip de um grupo adicionado e ainda não salvo
              manda um `grupo_id` que o backend não reconhece: 404, e a aba
              inteira troca a lista pelo card de erro, com o "Tentar novamente"
              repetindo a mesma request. A saída seria clicar em "Todos os
              grupos" — que ninguém adivinha. */}
          <AtividadeDaCampanha
            campanhaId={campanhaId}
            grupos={detalhe.grupos.map((g) => ({
              id: g.grupo_id,
              nome: g.nome ?? `Grupo ${g.grupo_id}`,
            }))}
          />
        </TabsContent>

        <TabsContent value="anuncios">
          <AnunciosDaCampanha campanhaId={campanhaId} />
        </TabsContent>

        <TabsContent value="monitoramento">
          <MonitoramentoDaCampanha campanhaId={campanhaId} />
        </TabsContent>

        <TabsContent value="resultados">
          <ResultadosDaCampanha campanhaId={campanhaId} onIrParaAba={trocarAba} />
        </TabsContent>
      </Tabs>

      <ResponsiveModal
        open={modalAdicionar}
        onOpenChange={(o) => {
          setModalAdicionar(o);
          if (!o) {
            setBusca("");
            setSelecionados(new Set());
          }
        }}
        title="Adicionar grupos"
      >
        <div className="space-y-3 pb-2">
          {gruposDisponiveis.length === 0 ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {gruposSincronizados.length === 0
                  ? "Nenhum grupo sincronizado ainda. Conecte um número e sincronize seus grupos."
                  : numerosDaCampanha.size === 0
                    ? "Escolha na aba Números por quais números esta campanha envia."
                    : temGrupoAtivado
                      ? "Todos os grupos ativados destes números já estão na campanha."
                      : "Nenhum grupo ativado ainda. Ative os grupos que vão entrar nas campanhas."}
              </p>
              {gruposSincronizados.length === 0 ? (
                <Button asChild variant="outline">
                  <Link to="/dashboard/configuracoes?tab=numeros">Conectar número</Link>
                </Button>
              ) : (
                !temGrupoAtivado && (
                  <Button asChild variant="outline">
                    <Link to="/dashboard/configuracoes?tab=numeros">Ativar grupos</Link>
                  </Button>
                )
              )}
            </div>
          ) : (
            <>
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar grupo…"
              />
              <div className="max-h-[45vh] space-y-1 overflow-y-auto">
                {gruposFiltrados.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Nenhum grupo com esse nome.
                  </p>
                ) : (
                  gruposFiltrados.map((g) => (
                    <label
                      key={g.id}
                      className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40"
                    >
                      <CheckboxQuadrado
                        checked={selecionados.has(g.id)}
                        onCheckedChange={() => alternarSelecionado(g.id)}
                        aria-label={`Selecionar ${rotuloDoGrupo(g.nome, g.id)}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {rotuloDoGrupo(g.nome, g.id)}
                      </span>
                      <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                        {g.participantes}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <Button
                className="w-full"
                disabled={selecionados.size === 0}
                onClick={adicionarSelecionados}
              >
                {selecionados.size > 0 ? `Adicionar (${selecionados.size})` : "Adicionar"}
              </Button>
            </>
          )}
        </div>
      </ResponsiveModal>

      <ExportarLeadsModal
        open={modalExport}
        onOpenChange={setModalExport}
        campanhaId={campanhaId}
        /*
          `detalhe.grupos` (o que está SALVO), não `vinculos` (o rascunho da
          aba). Grupo adicionado e ainda não salvo não existe para o backend:
          mandá-lo no filtro do CSV devolvia 422 dizendo que ele "não pertence
          a esta campanha" — verdade do ponto de vista do banco, incompreensível
          do ponto de vista de quem acabou de vê-lo na lista.
        */
        grupos={detalhe.grupos.map((g) => ({
          grupo_id: g.grupo_id,
          nome: g.nome ?? `Grupo ${g.grupo_id}`,
          sincronizado_em: g.participantes_sincronizados_em,
        }))}
      />

      {/* §3.2: remover passa por confirmação. O `×` removia direto da lista. */}
      <AlertDialog
        open={!!avisoRotacao}
        onOpenChange={(o) => !o && setAvisoRotacao(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nenhum grupo sobra na rotação</AlertDialogTitle>
            <AlertDialogDescription>
              Quem clicar no link de entrada vai para o primeiro grupo da ordem,
              que já está no limite. O anúncio continua veiculando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                avisoRotacao?.();
                setAvisoRotacao(null);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removendo} onOpenChange={(o) => !o && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo?.nome} sai desta campanha. O grupo continua ativo e nas outras
              campanhas em que estiver.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removendo && removerVinculo(removendo.grupo_id)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardLayout>
  );
};

export default CampanhaGrupoDetalhe;

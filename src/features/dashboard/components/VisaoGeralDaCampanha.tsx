import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Check, Copy, Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/shared/lib/utils";
import { mensagemAmigavel } from "@/services/http-error";
import {
  obterLinkDaCampanha,
  obterVisaoGeral,
  type CampanhaLink,
  type DiasDaVisaoGeral,
  type VisaoGeralDaCampanha as Dados,
} from "@/services/campanhas_grupos.service";

const ERRO_CARGA = "Não foi possível carregar a visão geral. Tente novamente.";

const PERIODOS: { dias: DiasDaVisaoGeral; label: string }[] = [
  { dias: 7, label: "7 dias" },
  { dias: 14, label: "14 dias" },
  { dias: 30, label: "30 dias" },
];

const ENTRADA_COR = "hsl(173, 80%, 40%)";
const SAIDA_COR = "hsl(0, 72%, 55%)";

// Tolerante a chave ausente: não existe ErrorBoundary no projeto, e um throw
// aqui levaria a página inteira.
const num = (v?: number | null) => (v ?? 0).toLocaleString("pt-BR");
/** `null` = a métrica não existe (sem denominador). "—" é a verdade; 0% não é. */
const pct = (v?: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

/** "1 falha" / "2 falhas" — singular errado na tela dela é ruído. */
const plural = (n: number, um: string, varios: string) =>
  `${num(n)} ${n === 1 ? um : varios}`;

/** Dia "2026-09-01" → "01/09", sem passar por Date (que jogaria para UTC). */
const diaCurto = (iso: string) => {
  const [, mes, dia] = iso.split("-");
  return mes && dia ? `${dia}/${mes}` : iso;
};

const Kpi = ({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-3">
    <p className="text-xs text-muted-foreground">{rotulo}</p>
    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{valor}</p>
    {nota && <p className="mt-0.5 text-[11px] text-muted-foreground">{nota}</p>}
  </div>
);

/**
 * Aba "Visão geral": painel de LEITURA (spec §1.2).
 *
 * Antes era o formulário de edição da campanha — a primeira tela que a afiliada
 * abria não dizia nada sobre a campanha. A edição foi para o botão
 * Configurações; aqui ficam link, ritmo e estado dos grupos.
 *
 * Sem métrica financeira: comissão, lucro e ROAS são de Resultados (§1.3b).
 */
export const VisaoGeralDaCampanha = ({ campanhaId }: { campanhaId: number }) => {
  const { toast } = useToast();
  const [dados, setDados] = useState<Dados | null>(null);
  const [link, setLink] = useState<CampanhaLink | null>(null);
  const [dias, setDias] = useState<DiasDaVisaoGeral>(7);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [copiado, setCopiado] = useState(false);

  // Guarda contra resposta obsoleta (mesma das abas irmãs): trocar o período
  // rápido não pode deixar a resposta antiga sobrescrever a nova.
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    // O link NÃO entra no Promise.all: ele é um card do topo, e uma falha dele
    // (502 durante deploy) derrubava a aba inteira para um "Tentar novamente",
    // escondendo os KPIs e o gráfico que já haviam chegado. Aqui ele falha
    // sozinho — o campo fica vazio e o resto da tela continua de pé.
    obterVisaoGeral(campanhaId, dias)
      .then((visao) => {
        if (!ativo) return;
        setDados(visao);
        setErro(null);
      })
      .catch((e) => ativo && setErro(mensagemAmigavel(e, ERRO_CARGA)))
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [campanhaId, dias, tentativa]);

  // Efeito próprio: o link não muda com o período, e refazer esse GET a cada
  // clique em 7/14/30 era uma request por clique sem nenhum dado novo.
  useEffect(() => {
    let ativo = true;
    obterLinkDaCampanha(campanhaId)
      .then((l) => ativo && setLink(l))
      .catch(() => {
        /* o campo fica vazio e o botão copiar desabilitado; o painel fica de pé */
      });
    return () => {
      ativo = false;
    };
  }, [campanhaId, tentativa]);

  const copiar = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Clipboard bloqueado (contexto inseguro, permissão negada): o link está
      // visível no campo, então a saída é selecionar e copiar à mão.
      toast({
        title: "Não foi possível copiar",
        description: "Copie o link manualmente.",
        variant: "destructive",
      });
    }
  }, [link, toast]);

  const chartConfig = useMemo(
    () =>
      ({
        entradas: { label: "Entradas", color: ENTRADA_COR },
        saidas: { label: "Saídas", color: SAIDA_COR },
      }) satisfies ChartConfig,
    [],
  );

  const serie = useMemo(
    () =>
      (dados?.serie ?? []).map((p) => ({
        ...p,
        // "05/09 · hoje" no eixo: o último ponto é um dia EM CURSO, e sem a
        // marca ele é lido como queda ao lado de dias inteiros. A janela
        // passou a incluir hoje porque terminá-la em ontem fazia campanha
        // recém-criada aparecer inteira em zero com movimento acontecendo.
        rotulo: p.parcial ? `${diaCurto(p.data)} · hoje` : diaCurto(p.data),
      })),
    [dados],
  );

  // Uma coluna por dia precisa de largura mínima, senão 30 dias viram um borrão
  // no celular. O scroll fica no container do gráfico, nunca na página.
  const larguraMinima = Math.max(320, serie.length * 34);

  if (carregando && !dados) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">{erro}</p>
          <Button variant="outline" onClick={() => setTentativa((n) => n + 1)}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!dados) return null;

  const g = dados.grupos;

  return (
    <div className="space-y-5">
      {/* Link de entrada: a ação mais frequente da campanha (spec §1.3a). */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">Link de entrada</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={link?.url ?? ""} className="font-mono text-xs" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void copiar()}
              disabled={!link}
              aria-label="Copiar link de entrada"
              className="flex-shrink-0"
            >
              {copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs operacionais (spec §1.3b) — sem comissão, lucro ou ROAS. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Cliques no link" valor={num(dados.cliques)} />
        <Kpi rotulo="Entradas" valor={num(dados.entradas)} />
        <Kpi
          rotulo="Taxa de entrada"
          valor={pct(dados.taxa_entrada)}
          nota={dados.taxa_entrada == null ? "sem cliques no período" : "entradas pelo link ÷ cliques"}
        />
        <Kpi rotulo="Saídas" valor={num(dados.saidas)} />
        <Kpi
          rotulo="Evasão"
          valor={pct(dados.evasao)}
          nota={dados.evasao == null ? "sem entradas no período" : undefined}
        />
        <Kpi rotulo="Participantes" valor={num(dados.participantes)} />
      </div>

      {/*
        ── Envios ──

        LINHA, não card: um número solto de mensagens enviadas ao lado de
        Cliques e Evasão misturaria aquisição com operação, e ela não saberia se
        é muito ou pouco. Aqui a pergunta é outra — "alguma coisa deixou de
        sair?" — e por isso a falha é o que ganha destaque.

        Cobre o ponto cego do modelo sem retry: número desconectado uma tarde
        inteira faz todos os passos daquele período falharem em sequência, e sem
        isto ela só descobriria abrindo roteiro por roteiro.
      */}
      {dados.envios && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-foreground">
            <Send className="h-3.5 w-3.5 text-muted-foreground" /> Envios
          </span>
          <span className="text-muted-foreground">
            {plural(dados.envios.roteiros_agendados, "roteiro agendado", "roteiros agendados")}
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground">
            {plural(dados.envios.mensagens_enviadas, "mensagem enviada", "mensagens enviadas")}
            {" "}nos últimos {dados.periodo.dias} dias
          </span>
          {dados.envios.falhas > 0 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              {dados.envios.roteiro_com_falha_id ? (
                <Link
                  to={`/dashboard/grupos/${campanhaId}/roteiros/${dados.envios.roteiro_com_falha_id}`}
                  className="font-semibold text-destructive underline-offset-2 hover:underline"
                >
                  {plural(dados.envios.falhas, "falha", "falhas")}
                </Link>
              ) : (
                <span className="font-semibold text-destructive">
                  {plural(dados.envios.falhas, "falha", "falhas")}
                </span>
              )}
            </>
          )}
        </p>
      )}

      {/* Ritmo: o grupo está crescendo ou sangrando? (spec §1.3c) */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Entradas × saídas</h3>
              <p className="text-xs text-muted-foreground">
                {dados.periodo.inicio.split("-").reverse().join("/")} a{" "}
                {dados.periodo.fim.split("-").reverse().join("/")}
                {serie.some((p) => p.parcial) && " · hoje ainda em curso"}
              </p>
            </div>
            <div className="flex gap-1">
              {PERIODOS.map((p) => (
                <Button
                  key={p.dias}
                  size="sm"
                  variant={dias === p.dias ? "default" : "outline"}
                  onClick={() => setDias(p.dias)}
                  disabled={carregando}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="-mx-2 overflow-x-auto px-2">
            <ChartContainer
              config={chartConfig}
              className="h-64 w-full"
              style={{ minWidth: larguraMinima }}
            >
              <AreaChart data={serie} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  allowDecimals={false}
                  width={32}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="entradas"
                  stroke={ENTRADA_COR}
                  fill={ENTRADA_COR}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="saidas"
                  stroke={SAIDA_COR}
                  fill={SAIDA_COR}
                  fillOpacity={0.12}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {/* Estado dos grupos: com abertura automática, ela precisa ver se ainda
          há grupo para receber entrada antes de esgotar (spec §1.3d). */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Grupos</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi rotulo="Total" valor={num(g.total)} />
            <Kpi rotulo="Abertos" valor={num(g.abertos)} />
            <Kpi rotulo="Cheios" valor={num(g.cheios)} />
            <Kpi
              rotulo="Disponíveis"
              valor={num(g.disponiveis)}
              nota={g.disponiveis === 0 && g.total > 0 ? "nenhum recebe entrada" : undefined}
            />
          </div>
          {g.total > 0 && g.disponiveis === 0 && (
            <p className={cn("mt-3 text-xs text-amber-500")}>
              Nenhum grupo pode receber entrada agora — quem clicar no link vê "vagas
              esgotadas".
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

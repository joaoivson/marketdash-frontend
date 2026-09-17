import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  centsToBRL,
  fetchAdminDashboard,
  formatPlanLabel,
  translateFrequency,
  type AdminDashboard,
} from "@/services/admin-panel.service";
import { useAdminPanelStore } from "@/stores/adminPanelStore";
import { FiltroPeriodoAdmin } from "@/features/admin/components/FiltroPeriodoAdmin";
import {
  linkDoCardParaClientes,
  periodoParaApi,
  rotuloDoPeriodo,
  type ModoPeriodo,
} from "@/features/admin/components/periodo-admin";
import { AdminChartTooltip, CHART_COLORS } from "@/features/admin/components/AdminChartTooltip";
import {
  AXIS_PROPS,
  BAR_CURSOR,
  LINE_CURSOR,
  VALUE_LABEL_PROPS,
  CHART_MARGIN,
} from "@/features/admin/components/chart-defaults";

/** Remove pontos-zero do INÍCIO da série (histórico ainda não começou) — mantém
 * zeros no meio/fim, que são dado real (ex.: mês sem faturamento de verdade). */
function trimLeadingEmpty<T extends { net: number; gross: number }>(series: T[]): T[] {
  const firstReal = series.findIndex((p) => p.net !== 0 || p.gross !== 0);
  if (firstReal <= 0) return series;
  return series.slice(firstReal);
}

/** Mesmo corte para Novas × canceladas (Rodada 9, item 3): meses sem nenhum
 * movimento no início da série saem — como o DRE já faz na lista de meses. */
function trimLeadingNoMovement<T extends { novas: number; canceladas: number }>(series: T[]): T[] {
  const firstReal = series.findIndex((p) => p.novas !== 0 || p.canceladas !== 0);
  if (firstReal <= 0) return series;
  return series.slice(firstReal);
}

function MetricCard({
  title,
  value,
  sub,
  badge,
  para,
}: {
  title: string;
  value: string;
  sub?: string;
  badge?: string;
  /** Destino do drill-down. Com ele o card vira link para a lista de clientes
   *  que compõem o número — sem ele, continua um card comum. */
  para?: string;
}) {
  const conteudo = (
    <Card className={para ? "transition-colors hover:border-primary/50 hover:bg-accent/30" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {badge && (
          <Badge variant="secondary" className="text-[10px] uppercase">
            {badge}
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        {para && (
          <p className="mt-1.5 text-[11px] font-medium text-primary">ver quem compõe →</p>
        )}
      </CardContent>
    </Card>
  );

  // Link de verdade (não onClick): abre em nova aba com ctrl/cmd, aparece na
  // barra de status e funciona com teclado — o admin confere número, e conferir
  // costuma ser comparar duas abas.
  return para ? (
    <Link to={para} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

export default function AdminDashboardPage() {
  const { year, month } = useAdminPanelStore();
  const [modo, setModo] = useState<ModoPeriodo>({ tipo: "mes" });
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // `periodo` entra como string na dependência: o objeto é recriado a cada
  // render e um `useEffect` que dependesse dele buscaria em loop infinito.
  const periodo = periodoParaApi(modo);
  const chavePeriodo = JSON.stringify(periodo ?? null);

  useEffect(() => {
    setLoading(true);
    fetchAdminDashboard(year, month, periodo)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, chavePeriodo]);

  // O filtro fica FORA do early-return de loading: sumir com ele a cada troca de
  // período faria a tela pular e o clique seguinte cair no vazio.
  const filtro = <FiltroPeriodoAdmin modo={modo} onChange={setModo} />;

  if (loading) {
    return (
      <div className="space-y-6">
        {filtro}
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        {filtro}
        <p className="text-destructive">{error || "Sem dados"}</p>
      </div>
    );
  }

  // Badge dos cards que dependem do período. Os de "hoje" (MRR, ativos, ARPU,
  // LTV) NÃO recebem: são foto do instante, e somar MRR ao longo de meses não
  // significa nada — a distinção precisa estar visível na tela.
  const badgePeriodo = rotuloDoPeriodo(modo);


  const mrrRaw = trimLeadingEmpty(data.series?.mrr || []);
  const mrrSeries = mrrRaw.map((r) => ({ month: r.month, líquido: (r.net || 0) / 100 }));
  const mrrTrimmed = mrrSeries.length < (data.series?.mrr || []).length;

  const revRaw = trimLeadingEmpty(data.series?.revenue || []);
  const revSeries = revRaw.map((r) => ({ month: r.month, líquido: (r.net || 0) / 100 }));
  const revTrimmed = revSeries.length < (data.series?.revenue || []).length;

  const planFreqMaxCount = Math.max(1, ...(data.plan_frequency || []).map((r) => r.count));
  const planFreq = (data.plan_frequency || []).map((r) => ({
    name: `${formatPlanLabel(r.plan)} · ${translateFrequency(r.frequency)}`,
    count: r.count,
    sharePct: Math.round((r.revenue_share || 0) * 100),
    barPct: Math.round((r.count / planFreqMaxCount) * 100),
  }));

  return (
    <div className="space-y-6">
      {filtro}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="MRR"
          badge="hoje"
          para={linkDoCardParaClientes("mrr", periodo, year, month)}
          value={centsToBRL(data.mrr_net_cents)}
          sub={`líquido · bruto ${centsToBRL(data.mrr_gross_cents)}`}
        />
        <MetricCard
          title="Faturamento"
          badge={badgePeriodo}
          para={linkDoCardParaClientes("faturamento", periodo, year, month)}
          value={centsToBRL(data.revenue_net_cents)}
          sub={[
            `líquido · bruto ${centsToBRL(data.revenue_gross_cents)}`,
            data.refund_net_cents
              ? `− ${centsToBRL(data.refund_net_cents)} estornado`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <MetricCard title="Assinantes ativos" badge="hoje" value={String(data.active_count)} />
        <MetricCard
          title="Novas assinaturas"
          badge={badgePeriodo}
          value={String(data.new_subscriptions)}
        />
        <MetricCard
          title="Churn"
          badge={badgePeriodo}
          para={linkDoCardParaClientes("churn", periodo, year, month)}
          value={`${data.churn_count} canceladas · ${((data.churn_rate || 0) * 100).toFixed(1)}%`}
        />
        <MetricCard
          title="Taxa de renovação"
          badge={badgePeriodo}
          value={
            data.renewal_rate == null ? "—" : `${((data.renewal_rate || 0) * 100).toFixed(1)}%`
          }
        />
        <MetricCard title="ARPU" badge="hoje" value={centsToBRL(data.arpu_cents)} />
        <MetricCard
          title="LTV estimado"
          badge="hoje"
          value={data.ltv_cents == null ? "—" : centsToBRL(data.ltv_cents)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MRR — últimos 12 meses</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mrrSeries} margin={CHART_MARGIN}>
                <XAxis dataKey="month" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip
                  cursor={LINE_CURSOR}
                  content={<AdminChartTooltip valueFormatter={(v) => centsToBRL(Math.round(v * 100))} />}
                />
                <Line type="monotone" dataKey="líquido" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 3 }}>
                  <LabelList dataKey="líquido" {...VALUE_LABEL_PROPS} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
          {mrrTrimmed && (
            <p className="px-6 pb-4 text-xs text-muted-foreground">
              A série preenche conforme o histórico acumula.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Faturamento líquido — 12 meses</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revSeries} margin={CHART_MARGIN}>
                <XAxis dataKey="month" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} />
                <Tooltip
                  cursor={BAR_CURSOR}
                  content={<AdminChartTooltip valueFormatter={(v) => centsToBRL(Math.round(v * 100))} />}
                />
                <Bar dataKey="líquido" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="líquido" {...VALUE_LABEL_PROPS} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
          {revTrimmed && (
            <p className="px-6 pb-4 text-xs text-muted-foreground">
              A série preenche conforme o histórico acumula.
            </p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novas × canceladas por mês</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trimLeadingNoMovement(data.series?.new_vs_canceled || [])} margin={CHART_MARGIN}>
                <XAxis dataKey="month" {...AXIS_PROPS} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip cursor={BAR_CURSOR} content={<AdminChartTooltip />} />
                <Bar dataKey="novas" name="Novas" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="novas" {...VALUE_LABEL_PROPS} />
                </Bar>
                <Bar dataKey="canceladas" name="Canceladas" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="canceladas" {...VALUE_LABEL_PROPS} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plano × periodicidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {planFreq.map((r) => (
              <div key={r.name} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 truncate">{r.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${r.barPct}%`, background: CHART_COLORS.blue }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{r.count}</span>
                <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{r.sharePct}%</span>
              </div>
            ))}
            {planFreq.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem assinantes ativos ainda</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

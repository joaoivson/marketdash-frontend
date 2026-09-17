import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpDown, Download, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { capitalizeName, nextChargeLabel } from "@/features/admin/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  centsToBRL,
  fetchAdminClients,
  formatPlanLabel,
  semaphoreLabel,
  translateClientStatus,
  translateFrequency,
  type AdminClient,
} from "@/services/admin-panel.service";
import { fetchWithAuth, getApiUrl } from "@/core/config/api.config";
import { paginar, Paginacao } from "@/features/admin/components/AdminTableFooter";

function SemaphoreDot({ color }: { color: string }) {
  const cls =
    color === "green"
      ? "bg-emerald-500"
      : color === "yellow"
        ? "bg-amber-400"
        : "bg-red-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} title={semaphoreLabel(color)} />;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "atrasado") {
    return (
      <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-600">
        {translateClientStatus(status)}
      </Badge>
    );
  }
  if (status === "ativo") {
    return (
      <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600">
        {translateClientStatus(status)}
      </Badge>
    );
  }
  if (status === "cancelado_com_acesso") {
    return (
      <Badge className="border-sky-500/30 bg-sky-500/15 text-sky-600">
        {translateClientStatus(status)}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      {translateClientStatus(status)}
    </Badge>
  );
}

/** Padrão da lista: quem importa hoje. "Inativo" só quando o filtro for trocado. */
const STATUS_PADRAO = "ativo,atrasado,cancelado_com_acesso";

/** De qual card do dashboard este recorte veio. */
const ROTULO_ORIGEM: Record<string, string> = {
  mrr: "Compõem o MRR",
  faturamento: "Pagaram no período",
  churn: "Cancelaram no período",
};

const paraBR = (iso: string) => iso.split("-").reverse().join("/");

const ALERT_FILTER_LABELS: Record<string, string> = {
  expiring_7d: "Vencendo em 7 dias",
  payment_failed: "Pagamento falhou",
  never_connected: "Nunca conectou",
  no_login_10d: "Sem acesso há 10d+",
};

type SortKey = "name" | "next_payment" | "total_paid_net_cents" | "last_login_at";

const SORT_VALUE: Record<SortKey, (c: AdminClient) => string | number> = {
  name: (c) => (c.name || "").toLowerCase(),
  // Sem próxima cobrança vai pro fim em ordem ascendente (não é urgência).
  // Mesmo campo por status que a célula exibe (nextChargeLabel): cancelado_com_acesso
  // usa access_until, os demais usam next_payment — nunca mistura os dois.
  next_payment: (c) =>
    c.status === "cancelado_com_acesso"
      ? c.access_until || "9999-12-31"
      : c.next_payment || "9999-12-31",
  total_paid_net_cents: (c) => c.total_paid_net_cents || 0,
  last_login_at: (c) => c.last_login_at || "",
};

function SortableHead({
  label,
  sortKey,
  active,
  asc,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const ativo = active === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${ativo ? "text-primary" : "text-muted-foreground/50"}`}
          aria-label={ativo ? (asc ? "crescente" : "decrescente") : undefined}
        />
      </button>
    </TableHead>
  );
}

export default function AdminClientsPage() {
  const [params, setParams] = useSearchParams();
  // Drill-down: veio de um card do dashboard (MRR, Faturamento ou Churn).
  const origem = params.get("origem") || "";
  const inicio = params.get("inicio") || "";
  const fim = params.get("fim") || "";

  const [q, setQ] = useState(params.get("q") || "");
  // No drill-down o status começa em "todos": o card de Churn é feito de
  // clientes CANCELADOS, que o padrão da lista esconde — a tela mostraria
  // "nenhum cliente" para um card com número.
  const [status, setStatus] = useState(
    params.get("status") || (origem ? "" : STATUS_PADRAO),
  );
  // Ordem inicial de urgência: quem vence primeiro no topo.
  const [sortKey, setSortKey] = useState<SortKey>("next_payment");
  const [sortAsc, setSortAsc] = useState(true);
  const [plan, setPlan] = useState(params.get("plan") || "");
  const [rows, setRows] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const filters = useMemo(
    () => ({
      q: q || undefined,
      status: status || undefined,
      plan: plan || undefined,
      expiring_7d: params.get("expiring_7d") === "1",
      payment_failed: params.get("payment_failed") === "1",
      never_connected: params.get("never_connected") === "1",
      no_login_10d: params.get("no_login_10d") === "1",
      origem: origem || undefined,
      inicio: inicio || undefined,
      fim: fim || undefined,
    }),
    [q, status, plan, params, origem, inicio, fim],
  );

  useEffect(() => {
    setLoading(true);
    setPagina(1);
    fetchAdminClients(filters)
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [filters]);

  const ehFaturamento = origem === "faturamento";
  // A soma existe para CONFERIR: ela tem de bater com o card que foi clicado.
  // Sem isso o drill-down mostra uma lista e deixa a pergunta "isso dá o total?"
  // sem resposta — que é exatamente a pergunta que motivou a tela.
  const somaDoPeriodo = ehFaturamento
    ? rows.reduce((t, r) => t + (r.valor_no_periodo_cents || 0), 0)
    : null;

  const sortedRows = useMemo(() => {
    const get = SORT_VALUE[sortKey];
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      const cmp = va < vb ? -1 : 1;
      return sortAsc ? cmp : -cmp;
    });
  }, [rows, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    setPagina(1);
    if (key === sortKey) {
      setSortAsc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortAsc(true);
  };

  const linhasPagina = useMemo(
    () => paginar(sortedRows, pagina),
    [sortedRows, pagina],
  );

  const exportCsv = async () => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v === undefined || v === "" || v === false) return;
      qs.set(k, String(v));
    });
    const res = await fetchWithAuth(getApiUrl(`/api/v1/admin/clients/export.csv?${qs}`));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admin_clients.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar nome, e-mail ou CPF"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_PADRAO}>Ativos (padrão)</SelectItem>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
            <SelectItem value="cancelado_com_acesso">Cancelado c/ acesso</SelectItem>
          </SelectContent>
        </Select>
        <Select value={plan || "all"} onValueChange={(v) => setPlan(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos planos</SelectItem>
            <SelectItem value="essencial">Essencial</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="max">Max</SelectItem>
          </SelectContent>
        </Select>
        {origem && (
          <Badge className="gap-1.5 py-1.5 pl-2.5 pr-1.5">
            {ROTULO_ORIGEM[origem] || origem}
            {inicio && fim && ` · ${paraBR(inicio)} a ${paraBR(fim)}`}
            <button
              type="button"
              aria-label="Remover o recorte do card e ver todos os clientes"
              className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
              onClick={() => {
                const next = new URLSearchParams(params);
                ["origem", "inicio", "fim"].forEach((k) => next.delete(k));
                setParams(next);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {(["expiring_7d", "payment_failed", "never_connected", "no_login_10d"] as const)
          .filter((k) => filters[k])
          .map((k) => (
            <Badge key={k} variant="secondary" className="gap-1.5 py-1.5 pl-2.5 pr-1.5">
              {ALERT_FILTER_LABELS[k]}
              <button
                type="button"
                aria-label={`Remover filtro ${ALERT_FILTER_LABELS[k]}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete(k);
                  setParams(next);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        {origem && (
          <span className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "cliente" : "clientes"}
            {somaDoPeriodo != null && (
              <>
                {" · soma "}
                <strong className="tabular-nums text-foreground">
                  {centsToBRL(somaDoPeriodo)}
                </strong>
              </>
            )}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
          <Download className="mr-1.5 h-4 w-4" />
          CSV
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <div className="overflow-x-auto lg:overflow-visible">
          <div className="min-w-[960px] lg:min-w-0">
            <Table className="w-full table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <SortableHead
                    className="w-[15%] whitespace-nowrap"
                    label="Nome"
                    sortKey="name"
                    active={sortKey}
                    asc={sortAsc}
                    onSort={toggleSort}
                  />
                  <TableHead className="w-[16%]">E-mail</TableHead>
                  <TableHead className="w-[8%]">Plano</TableHead>
                  <TableHead className="w-[10%]">Periodicidade</TableHead>
                  <TableHead className="w-[12%]">Status</TableHead>
                  <SortableHead
                    className="w-[12%]"
                    label="Próx. cobrança"
                    sortKey="next_payment"
                    active={sortKey}
                    asc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    className="w-[9%]"
                    label={ehFaturamento ? "Pago no período" : "Total pago"}
                    sortKey="total_paid_net_cents"
                    active={sortKey}
                    asc={sortAsc}
                    onSort={toggleSort}
                  />
                  <SortableHead
                    className="w-[8%]"
                    label="Último acesso"
                    sortKey="last_login_at"
                    active={sortKey}
                    asc={sortAsc}
                    onSort={toggleSort}
                  />
                  <TableHead className="w-[7%]">Integrações</TableHead>
                  <TableHead className="w-[3%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
              {linhasPagina.map((r, i) => (
                <TableRow key={`${r.user_id ?? r.email}-${i}`}>
                  <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap">
                    {r.user_id ? (
                      <Link className="font-medium hover:underline" to={`/admin/clientes/${r.user_id}`}>
                        {capitalizeName(r.name) || "—"}
                      </Link>
                    ) : (
                      capitalizeName(r.name) || "—"
                    )}
                  </TableCell>
                  <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-sm">{r.email}</TableCell>
                  <TableCell>{formatPlanLabel(r.plan)}</TableCell>
                  <TableCell>{translateFrequency(r.frequency)}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                    {nextChargeLabel(
                      r.status,
                      r.status === "cancelado_com_acesso" ? r.access_until : r.next_payment,
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {centsToBRL(
                      ehFaturamento && r.valor_no_periodo_cents != null
                        ? r.valor_no_periodo_cents
                        : r.total_paid_net_cents,
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.last_login_at
                      ? new Date(r.last_login_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.integrations?.shopee ? "✓Shopee " : ""}
                    {r.integrations?.facebook ? "✓Meta" : ""}
                    {!r.integrations?.shopee && !r.integrations?.facebook ? "—" : ""}
                  </TableCell>
                  <TableCell>
                    <SemaphoreDot color={r.semaphore} />
                  </TableCell>
                </TableRow>
              ))}
              {linhasPagina.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
            <Paginacao
              pagina={pagina}
              total={sortedRows.length}
              onChange={setPagina}
              formato="intervalo"
            />
        </div>
        </div>
      )}
    </div>
  );
}

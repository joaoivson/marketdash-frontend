import { fetchWithAuth, getApiUrl } from "@/core/config/api.config";

const base = () => getApiUrl("/api/v1/admin");

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type AdminDashboard = {
  year: number;
  month: number;
  /** Eco do que o backend realmente usou — a tela mostra isto, não o que pediu. */
  periodo?: { livre: boolean; inicio?: string; fim?: string };
  mrr_net_cents: number;
  mrr_gross_cents: number;
  revenue_net_cents: number;
  revenue_gross_cents: number;
  refund_net_cents: number;
  active_count: number;
  active_by_plan: Record<string, number>;
  new_subscriptions: number;
  churn_count: number;
  churn_rate: number;
  renewal_rate: number | null;
  arpu_cents: number;
  ltv_cents: number | null;
  alerts: {
    expiring_7d: number;
    payment_failed: number;
    never_connected: number;
    no_login_10d: number;
  };
  series: {
    mrr: { month: string; net: number; gross: number }[];
    revenue: { month: string; net: number; gross: number }[];
    new_vs_canceled: { month: string; novas: number; canceladas: number }[];
  };
  plan_frequency: {
    plan: string;
    frequency: string;
    count: number;
    revenue_net_cents: number;
    revenue_share: number;
  }[];
};

export type AdminClient = {
  user_id: number | null;
  name: string;
  email: string;
  cpf: string;
  phone?: string | null;
  plan: string;
  frequency?: string | null;
  status: string;
  started_at?: string | null;
  next_payment?: string | null;
  access_until?: string | null;
  total_paid_net_cents: number;
  card_rejection_reason?: string | null;
  last_login_at?: string | null;
  integrations: { shopee: boolean; facebook: boolean };
  semaphore: string;
};

export type ExpenseItem = {
  id: number;
  date: string;
  category: string;
  supplier?: string | null;
  description?: string | null;
  amount_cents: number;
  recurring: boolean;
  notes?: string | null;
};

export type DreResponse = {
  year: number;
  month: number;
  gross_cents: number;
  refund_gross_cents: number;
  gross_after_refund_cents: number;
  fees_cents: number;
  revenue_net_cents: number;
  expenses_by_category: { category: string; amount_cents: number }[];
  expenses_total_cents: number;
  result_cents: number;
  margin: number | null;
  has_expenses: boolean;
  series: { month: string; revenue_net_cents: number; expenses_total_cents: number; result_cents: number }[];
  burn_avg_3m_cents: number | null;
  mom: { delta_cents: number; delta_pct: number | null } | null;
};

export const centsToBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Mensal",
  mensal: "Mensal",
  quarterly: "Trimestral",
  trimestral: "Trimestral",
  quarter: "Trimestral",
  yearly: "Anual",
  annual: "Anual",
  // a Kiwify manda "annually" em parte das assinaturas anuais (Rodada 9)
  annually: "Anual",
  anual: "Anual",
  year: "Anual",
};

export const translateFrequency = (frequency: string | null | undefined): string => {
  if (!frequency) return "—";
  return FREQUENCY_LABELS[frequency.toLowerCase()] || frequency;
};

export const formatPlanLabel = (plan: string | null | undefined): string => {
  if (!plan) return "—";
  const map: Record<string, string> = {
    essencial: "Essencial",
    essential: "Essencial",
    pro: "Pro",
    max: "Max",
  };
  return map[plan.toLowerCase()] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
};

const SEMAPHORE_LABELS: Record<string, string> = {
  green: "Ativa e usando",
  yellow: "Sinais parciais",
  red: "Em risco — sem uso recente",
};

export const semaphoreLabel = (color: string | null | undefined): string =>
  SEMAPHORE_LABELS[(color || "").toLowerCase()] || "Status desconhecido";

const REJECTION_REASON_LABELS: Record<string, string> = {
  refused_bank: "Recusa: banco emissor",
};

export const translateRejectionReason = (reason: string | null | undefined): string => {
  if (!reason) return "—";
  return REJECTION_REASON_LABELS[reason.toLowerCase()] || reason;
};

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  atrasado: "Atrasado",
  inativo: "Inativo",
  cancelado_com_acesso: "Cancelado c/ acesso",
};

export const translateClientStatus = (status: string | null | undefined): string => {
  if (!status) return "—";
  return STATUS_LABELS[status.toLowerCase()] || status;
};

/** Período livre do painel: `inicio`/`fim` vazios significam "desde sempre" e
 *  "até hoje". `undefined` mantém o modo mensal de year/month. */
export type PeriodoAdmin = { inicio?: string; fim?: string };

export async function fetchAdminDashboard(
  year: number,
  month: number,
  periodo?: PeriodoAdmin,
) {
  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  if (periodo) {
    // `periodo=livre` é EXPLÍCITO: "todo o período" manda inicio e fim vazios,
    // e sem o marcador o backend não teria como distinguir isso do modo mensal.
    qs.set("periodo", "livre");
    if (periodo.inicio) qs.set("inicio", periodo.inicio);
    if (periodo.fim) qs.set("fim", periodo.fim);
  }
  return json<AdminDashboard>(await fetchWithAuth(`${base()}/dashboard?${qs}`));
}

export async function fetchAdminClients(params: Record<string, string | boolean | undefined> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === "" || v === false) return;
    qs.set(k, String(v));
  });
  return json<AdminClient[]>(await fetchWithAuth(`${base()}/clients?${qs}`));
}

export async function fetchAdminClient(userId: number) {
  return json<any>(await fetchWithAuth(`${base()}/clients/${userId}`));
}

export async function addAdminNote(userId: number, body: string) {
  return json(await fetchWithAuth(`${base()}/clients/${userId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body }),
  }));
}

export async function fetchExpenses(year: number, month: number) {
  return json<{ items: ExpenseItem[]; total_cents: number; by_category: { category: string; amount_cents: number }[] }>(
    await fetchWithAuth(`${base()}/expenses?year=${year}&month=${month}`),
  );
}

export async function createExpense(payload: Omit<ExpenseItem, "id">) {
  return json(await fetchWithAuth(`${base()}/expenses`, { method: "POST", body: JSON.stringify(payload) }));
}

export async function updateExpense(id: number, payload: Omit<ExpenseItem, "id">) {
  return json(await fetchWithAuth(`${base()}/expenses/${id}`, { method: "PUT", body: JSON.stringify(payload) }));
}

export async function deleteExpense(id: number) {
  return json(await fetchWithAuth(`${base()}/expenses/${id}`, { method: "DELETE" }));
}

export async function repeatExpenses(year: number, month: number) {
  return json<{ created: number }>(
    await fetchWithAuth(`${base()}/expenses/repeat-previous-month?year=${year}&month=${month}`, { method: "POST" }),
  );
}

export async function fetchDre(year: number, month: number) {
  return json<DreResponse>(await fetchWithAuth(`${base()}/dre?year=${year}&month=${month}`));
}

export async function fetchUsage() {
  return json<any>(await fetchWithAuth(`${base()}/usage`));
}

export type SyncRun = {
  id: number;
  source: string;
  trigger: string;
  user_id: number | null;
  days_back: number | null;
  empty_attempt: number;
  status: "running" | "success" | "failed" | "skipped_lock";
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  records_fetched: number | null;
  records_upserted: number | null;
  is_suspected_partial: boolean;
  is_stale_running: boolean;
  error_message: string | null;
  details: Record<string, unknown> | null;
  erro_codigo: string | null;
  erro_motivo: string | null;
  usuario: SyncRunUser | null;
};

export type SyncRunUser = { user_id: number; nome: string; email: string | null };

export type SyncErrorReason = {
  motivo: string;
  codigo: string | null;
  total: number;
  usuarios: number;
  proporcao: number;
};

export async function fetchSyncErrorReasons(hours = 24, source?: string) {
  const qs = new URLSearchParams({ hours: String(hours) });
  if (source) qs.set("source", source);
  return json<SyncErrorReason[]>(
    await fetchWithAuth(`${base()}/sync-runs/error-reasons?${qs}`),
  );
}

export type UsagePeriodo = "hoje" | "7d" | "30d" | "90d";

export type PlatformUsage = {
  periodo: UsagePeriodo;
  cards: {
    acessos: number;
    usuarias_ativas: number;
    base_ativa: number;
    taxa_uso: number | null;
    sem_acesso_10d: number;
    dias_sem_acesso: number;
  };
  usuarias_por_dia: { date: string; usuarias: number; acessos: number }[];
  atividade: {
    user_id: number;
    nome: string;
    email: string | null;
    plan: string | null;
    acessos: number;
    dias_ativos: number;
    links_em_uso: number;
    links_criados: number;
    paginas_em_uso: number;
    paginas_criadas: number;
    ultimo_acesso: string | null;
  }[];
  telas: { tela: string; acessos: number; proporcao: number }[];
};

export async function fetchPlatformUsage(periodo: UsagePeriodo = "7d") {
  return json<PlatformUsage>(
    await fetchWithAuth(`${base()}/platform-usage?periodo=${periodo}`),
  );
}

export type SyncHealth = {
  source: string;
  trigger: string;
  since: string;
  total_ativos: number;
  sucesso: number;
  falha: number;
  sem_execucao: number[];
};

export async function fetchSyncRuns(
  params: { source?: string; trigger?: string; status?: string; filter_user_id?: number; limit?: number } = {},
) {
  // Nota: o param de filtro é "filter_user_id" (não "user_id") — fetchWithAuth já
  // anexa "user_id=user_<id>" em toda request; um filtro aqui chamado "user_id"
  // colidiria com isso e o backend rejeitaria (422, "user_N" não é inteiro).
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === "") return;
    qs.set(k, String(v));
  });
  return json<SyncRun[]>(await fetchWithAuth(`${base()}/sync-runs?${qs}`));
}

export async function fetchSyncHealth(source: string, trigger: string) {
  return json<SyncHealth>(
    await fetchWithAuth(`${base()}/sync-runs/health?source=${source}&trigger=${trigger}`),
  );
}

export type SyncSourceSummary = {
  source: string;
  last_sync_at: string | null;
  last_status: string | null;
  calls_24h: number;
  errors_24h: number;
};

export type SyncDailyPoint = { date: string; calls: number; errors: number };

export type SyncUsageSummary = {
  shopee: SyncSourceSummary;
  facebook: SyncSourceSummary;
  daily: { shopee: SyncDailyPoint[]; facebook: SyncDailyPoint[] };
};

export async function fetchSyncUsageSummary(days = 30) {
  return json<SyncUsageSummary>(await fetchWithAuth(`${base()}/sync-runs/usage-summary?days=${days}`));
}

export async function postPageView(path: string) {
  try {
    await fetchWithAuth(`${base()}/page-views`, { method: "POST", body: JSON.stringify({ path }) });
  } catch {
    /* ignore */
  }
}

export async function postDailyAccess() {
  try {
    await fetchWithAuth(`${base()}/access`, { method: "POST" });
  } catch {
    /* ignore */
  }
}

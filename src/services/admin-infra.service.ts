import { fetchWithAuth, getApiUrl } from "@/core/config/api.config";
import { erroDaResposta } from "@/services/http-error";

/**
 * Status da infraestrutura — espelho de `app/schemas/infra.py`.
 *
 * Quase todo campo é opcional, e isso é o contrato: o backend responde 200
 * com os blocos que conseguiu montar e o erro no lugar do que falhou. Um
 * painel de status que devolve erro quando a infra está ruim é inútil
 * exatamente na hora em que seria usado.
 */

export type Ambiente = "producao" | "homologacao" | "compartilhado" | "desconhecido" | "local";

export type Servidor = {
  nome: string | null;
  ip: string | null;
  alcancavel: boolean | null;
  utilizavel: boolean | null;
  eh_host_coolify: boolean | null;
  proxy_tipo: string | null;
  proxy_status: string | null;
  traefik_versao: string | null;
  /** Parado = a métrica que a UI do Coolify mostra está congelada. */
  sentinel_em: string | null;
  /** Cinco builds simultâneos foram o gatilho do apagão de 11/09/2026. */
  builds_simultaneos: number | null;
  fila_de_deploy_limite: number | null;
  alerta_disco_pct: number | null;
  disco_cheio_avisado: boolean | null;
};

export type Recurso = {
  uuid: string | null;
  rotulo: string;
  ambiente: Ambiente;
  papel: string;
  tipo: string;
  nome_coolify: string | null;
  status: string | null;
  /** `running`, `exited`, `restarting`… */
  estado: string;
  /** `healthy`, `unhealthy` ou `unknown` (worker sem healthcheck — normal). */
  saude: string | null;
  /** `null` = sem teto de CPU. */
  limite_cpu: string | null;
  limite_memoria: string | null;
  reinicios: number | null;
  reiniciado_em: string | null;
  online_em: string | null;
  branch: string | null;
  commit: string | null;
  fqdn: string | null;
  healthcheck_ligado: boolean | null;
  atualizado_em: string | null;
  /**
   * Onde a nossa medição discorda do Coolify — nos dois sentidos: verde do
   * Coolify com a URL pública fora (11/09) e vermelho do Coolify com o
   * serviço respondendo (as duas instâncias de Redis, 15/09). `null` é o
   * normal.
   */
  contradicao: string | null;
};

export type Deploy = { aplicacao: string | null; status: string | null; commit: string | null };

export type BlocoCoolify = {
  configurado: boolean;
  erro: string | null;
  instrucao: string | null;
  url: string;
  versao: string | null;
  servidor: Servidor | null;
  recursos: Recurso[];
  fila_de_deploy: Deploy[];
};

export type SerieMetrica = {
  atual: number;
  pico: number;
  media: number;
  /** `%` para CPU, `bytes` para RAM/disco, `seconds` para uptime. */
  unidade: string | null;
  pontos: number;
  medido_em: string;
};

export type AcaoVps = { nome: string | null; estado: string | null; em: string | null };

/**
 * `ct_set_limits` nas últimas 24h — a "CPU limitation" da Hostinger.
 * Auto-sustentável: com o teto reduzido a carga normal satura a fração
 * liberada e a máquina não volta sozinha. Prolongou o apagão de 11/09 por ~20h.
 */
export type LimitacaoCpu = {
  ocorrencias_24h: number;
  ultima_em: string;
  explicacao: string;
};

export type BlocoHostinger = {
  configurado: boolean;
  erro: string | null;
  instrucao: string | null;
  vps: {
    id?: number | string | null;
    hostname?: string | null;
    estado?: string | null;
    plano?: string | null;
    vcpus?: number | null;
    ip?: string | null;
    memoria_mb?: number | null;
    disco_mb?: number | null;
    criada_em?: string | null;
  } | null;
  metricas:
    | ({
        janela_horas?: number;
        formato_inesperado?: boolean;
      } & Partial<Record<"cpu_usage" | "ram_usage" | "disk_space" | "uptime", SerieMetrica>>)
    | null;
  acoes: AcaoVps[];
  limitacao_de_cpu: LimitacaoCpu | null;
};

export type Ponta = {
  rotulo: string;
  ambiente: Ambiente;
  url: string;
  tipo: "api" | "frontend" | string;
  http: number | null;
  /** NÃO é `http === 200`: é a nossa resposta reconhecida no corpo. */
  ok: boolean;
  detalhe: string | null;
  latencia_ms: number | null;
  /** O que o `/health` diz de dentro da app. Só nas pontas de API. */
  saude_interna: Record<string, string> | null;
};

export type BlocoFilas = {
  configurado: boolean;
  erro: string | null;
  /** O Redis é compartilhado: é preciso saber qual ambiente respondeu. */
  ambiente_desta_api: Ambiente;
  ping_ms: number | null;
  filas: { nome: string; tamanho: number }[];
};

/**
 * A CPU do host lida de DENTRO do container (`/proc/stat`, que o Docker não
 * isola). `steal_pct` é o campo que importa: em 15/09 a Hostinger mostrava
 * "CPU 100%" e a leitura óbvia estava errada — 85% era steal, com a aplicação
 * usando 6%. Máquina faminta, não ocupada.
 */
export type Maquina = {
  usado_pct: number;
  steal_pct: number;
  iowait_pct: number;
  ocioso_pct: number;
  carga: number[];
  vcpus: number;
  carga_por_vcpu: number | null;
  estrangulada: boolean;
  explicacao_steal: string | null;
};

export type StatusInfra = {
  gerado_em: string;
  somente_leitura: boolean;
  /** `null` fora do Linux (dev em macOS). */
  maquina: Maquina | null;
  coolify: BlocoCoolify;
  hostinger: BlocoHostinger;
  pontas: Ponta[];
  filas: BlocoFilas;
};

export async function buscarStatusInfra(): Promise<StatusInfra> {
  const resp = await fetchWithAuth(getApiUrl("/api/v1/admin/infra"));
  if (!resp.ok) throw await erroDaResposta(resp, "Não foi possível ler o status da infra.");
  return resp.json();
}

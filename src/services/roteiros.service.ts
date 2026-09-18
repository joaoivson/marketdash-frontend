import { fetchWithAuth, getApiUrl } from "@/core/config/api.config";
import { erroDaResposta } from "@/services/http-error";

// getApiUrl resolve o host por ambiente — URL relativa só funciona no dev com proxy.
const baseRoteiros = () => getApiUrl("/api/v1/roteiros");
const baseWhatsapp = () => getApiUrl("/api/v1/whatsapp");

export type StatusExecucao =
  | "agendada"
  | "enviando"
  | "pausada"
  | "concluida"
  | "cancelada"
  | "falhou";

export type ExecucaoEnvio = {
  id: number;
  roteiro_id: number;
  data_ancora: string;
  status: StatusExecucao;
  total: number;
  enviados: number;
  erros: number;
  pulados: number;
  proxima_execucao_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  duracao_estimada_s: number;
  avisos: string[];
};

export type EnvioRapidoPayload = {
  texto?: string;
  midia_url?: string;
  oferta_url?: string;
  grupo_ids: number[];
  campanha_id?: number;
  /** ISO datetime para agendar; omitir = dispara agora. */
  agendar_para?: string;
};

/** Janela de um dia da semana — chaves "0"=segunda … "6"=domingo. */
export type JanelaDia = {
  ativo: boolean;
  /** "HH:MM" (o backend pode devolver "HH:MM:SS"). */
  inicio: string;
  fim: string;
  pausa_inicio?: string | null;
  pausa_fim?: string | null;
};

export type ConfigEnvio = {
  ativo: boolean;
  /** Pode vir vazio = padrão 08:00–22:00 todos os dias. */
  dias: Record<string, JanelaDia>;
};

const json = async <T>(res: Response, fallback: string): Promise<T> => {
  if (!res.ok) throw await erroDaResposta(res, fallback);
  return res.json() as Promise<T>;
};

export async function envioRapido(payload: EnvioRapidoPayload): Promise<ExecucaoEnvio> {
  const res = await fetchWithAuth(`${baseRoteiros()}/envio-rapido`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json(res, "Não foi possível iniciar o envio.");
}

export async function progresso(execucaoId: number): Promise<ExecucaoEnvio> {
  const res = await fetchWithAuth(`${baseRoteiros()}/execucoes/${execucaoId}/progresso`);
  return json(res, "Não foi possível consultar o progresso do envio.");
}

export async function pausar(execucaoId: number): Promise<ExecucaoEnvio> {
  const res = await fetchWithAuth(`${baseRoteiros()}/execucoes/${execucaoId}/pausar`, {
    method: "POST",
  });
  return json(res, "Não foi possível pausar o envio.");
}

export async function retomar(execucaoId: number): Promise<ExecucaoEnvio> {
  const res = await fetchWithAuth(`${baseRoteiros()}/execucoes/${execucaoId}/retomar`, {
    method: "POST",
  });
  return json(res, "Não foi possível retomar o envio.");
}

export async function cancelar(execucaoId: number): Promise<ExecucaoEnvio> {
  const res = await fetchWithAuth(`${baseRoteiros()}/execucoes/${execucaoId}/cancelar`, {
    method: "POST",
  });
  return json(res, "Não foi possível cancelar o envio.");
}

export async function obterConfigEnvio(): Promise<ConfigEnvio> {
  const res = await fetchWithAuth(`${baseWhatsapp()}/config-envio`);
  return json(res, "Não foi possível carregar a janela de envio.");
}

export async function salvarConfigEnvio(config: ConfigEnvio): Promise<ConfigEnvio> {
  const res = await fetchWithAuth(`${baseWhatsapp()}/config-envio`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return json(res, "Não foi possível salvar a janela de envio.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Roteiros: editor de passos, prévia, agendamento e status por passo.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoTempo = "ancora" | "relativo";
/** O passo é container de MENSAGEM (N blocos), uma OFERTA, ou uma AÇÃO. */
export type TipoConteudo = "mensagem" | "oferta" | "acao_grupo";
export type TipoBloco = "texto" | "imagem" | "audio" | "video" | "arquivo" | "oferta";
/** Os que a tela deixa adicionar — `oferta` segue reservado. */
export const BLOCOS_DA_TELA = ["texto", "imagem", "video", "audio", "arquivo"] as const;
/** Blocos cujo `conteudo` é a URL de um arquivo, não texto. */
export const BLOCOS_DE_MIDIA: readonly TipoBloco[] = ["imagem", "video", "audio", "arquivo"];
export type AcaoGrupo = "renomear_grupo" | "alterar_descricao" | "alterar_imagem";
export type UnidadeOffset = "segundos" | "minutos" | "horas";
export type GruposAlvo = "todos" | "selecao";
export type MarcarTodos = "nunca" | "sempre";
export type StatusRoteiro = "rascunho" | "pronto";
export type StatusPasso = "concluido" | "concluido_com_falhas" | "falhou";

export const ACOES_DO_GRUPO: { valor: AcaoGrupo; rotulo: string }[] = [
  { valor: "renomear_grupo", rotulo: "Renomear o grupo" },
  { valor: "alterar_descricao", rotulo: "Alterar a descrição" },
  { valor: "alterar_imagem", rotulo: "Alterar a imagem" },
];

export const UNIDADES: { valor: UnidadeOffset; rotulo: string; curto: string }[] = [
  { valor: "segundos", rotulo: "segundos", curto: "s" },
  { valor: "minutos", rotulo: "minutos", curto: "min" },
  { valor: "horas", rotulo: "horas", curto: "h" },
];

export type BlocoIn = {
  tipo: TipoBloco;
  /** Texto do bloco, ou URL da mídia. */
  conteudo?: string | null;
  /** Legenda que acompanha a mídia. */
  legenda?: string | null;
  template_id?: number | null;
};

export type BlocoOut = BlocoIn & { id: number; ordem: number };

/**
 * Passo como o backend aceita no PUT — a tela manda a lista COMPLETA na ordem.
 *
 * **O `id` é o que mantém a fila viva.** Sem ele o backend não tem como saber
 * que aquele passo é o mesmo de antes: salvar virava apagar e recriar, e o
 * CASCADE de `roteiro_mensagens.passo_id` levava junto tudo que ainda não
 * tinha saído. Passo novo vai sem `id`.
 */
export type PassoIn = {
  id?: number | null;
  ordem: number;
  tipo_tempo: TipoTempo;
  /** "HH:MM" — obrigatório quando `tipo_tempo` é "ancora". */
  hora_fixa?: string | null;
  /** "YYYY-MM-DD" — obrigatório quando `tipo_tempo` é "ancora". */
  data_fixa?: string | null;
  offset_valor?: number | null;
  offset_unidade?: UnidadeOffset | null;
  tipo_conteudo: TipoConteudo;
  blocos: BlocoIn[];
  texto?: string | null;
  midia_url?: string | null;
  oferta_url?: string | null;
  template_id?: number | null;
  acao?: AcaoGrupo | null;
  acao_parametro?: string | null;
  grupos_alvo: GruposAlvo;
  grupos_alvo_ids?: number[] | null;
  marcar_todos: MarcarTodos;
};

export type GrupoComFalha = { grupo_id: number; nome: string; motivo: string | null };

export type StatusDoPasso = {
  status: StatusPasso;
  enviados: number;
  pendentes: number;
  falhas: GrupoComFalha[];
};

export type PassoOut = Omit<PassoIn, "blocos"> & {
  id: number;
  blocos: BlocoOut[];
  acao_descontinuada: boolean;
  /** Horário resolvido (ISO com fuso de Brasília). */
  quando: string | null;
  no_passado: boolean;
  /** Já saiu ou está saindo: não dá para editar, mover nem excluir. */
  travado: boolean;
  status: StatusDoPasso | null;
};

export type ExecucaoResumo = {
  id: number;
  status: StatusExecucao;
  total: number;
  enviados: number;
  erros: number;
  pulados: number;
  /**
   * As duas metades de `pendente`, separadas pelo backend.
   *
   * O banco tem UM status para duas situações muito diferentes, e somá-las
   * fazia o card dizer "Na fila 3" com o roteiro agendado para daqui a 25
   * minutos. A diferença importa no diagnóstico: "na fila há 20 minutos" é
   * problema, "agendada para daqui a 25" é o roteiro funcionando.
   */
  agendadas: number;
  na_fila: number;
  proxima_execucao_em: string | null;
  concluido_em: string | null;
};

export type Roteiro = {
  id: number;
  nome: string;
  campanha_id: number | null;
  status: StatusRoteiro;
  origem: string;
  total_passos: number;
  criado_em: string;
  /** Enquanto existir, o chip não é "Rascunho" e não dá para agendar de novo. */
  execucao_ativa: ExecucaoResumo | null;
  ultima_execucao: ExecucaoResumo | null;
};

export type RoteiroDetalhe = Roteiro & {
  passos: PassoOut[];
  avisos: string[];
  passos_no_passado: number[];
  /**
   * O roteiro já rodou: a tela abre em LEITURA e some com o destaque de data
   * vencida. Roteiro concluído não é rascunho quebrado — não há data a ajustar
   * nem agendamento a fazer.
   */
  encerrado: boolean;
};

export type PreviewPasso = {
  passo_id: number;
  ordem: number;
  tipo_conteudo: TipoConteudo;
  /** ISO com fuso de Brasília. */
  quando: string;
  grupos: number;
  blocos: number;
  no_passado: boolean;
};

export type PreviewRoteiro = {
  passos: PreviewPasso[];
  total_mensagens: number;
  duracao_estimada_s: number;
  avisos: string[];
  passos_no_passado: number[];
};

/** Agendou, ou parou nos avisos e espera confirmação da usuária. */
export type ResultadoAgendamento =
  | { agendada: true; execucao: ExecucaoEnvio }
  | { agendada: false; avisos: string[] };

/** Tetos de upload por tipo, em MB — espelho de `UPLOAD_MB_*` do backend.
 *
 * Existe do lado do cliente para a checagem acontecer ANTES do upload: sem
 * ela, o arquivo grande sobe inteiro para tomar 400 no fim, e a tela fica
 * parada sem explicar por quê.
 *
 * ⚠️ Espelho manual: mudou aqui, muda em `app/core/config.py` no mesmo commit.
 */
export const LIMITE_MB: Record<string, number> = {
  imagem: 5,
  audio: 16,
  video: 16,
  arquivo: 25,
};

/** Sobe um arquivo de bloco e devolve a URL pública que o WAHA vai baixar. */
export const uploadDeMidia = async (
  tipo: "imagem" | "video" | "audio" | "arquivo",
  file: File,
): Promise<{ url: string }> => {
  const teto = LIMITE_MB[tipo];
  if (file.size > teto * 1024 * 1024) {
    throw new Error(`Arquivo muito grande. O limite para ${tipo} é ${teto} MB.`);
  }
  const corpo = new FormData();
  corpo.append("file", file);
  const res = await fetchWithAuth(
    getApiUrl(`/api/v1/uploads/midia?tipo=${tipo}`),
    { method: "POST", body: corpo },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Não foi possível enviar o arquivo.");
  }
  return res.json();
};

/**
 * Erro que a tela precisa DESTRINCHAR, não só exibir: "algum passo está no
 * passado" num roteiro de 22 não diz onde clicar.
 */
export class ErroDeRoteiro extends Error {
  constructor(
    message: string,
    readonly codigo:
      | "passos_no_passado"
      | "passo_ja_enviado"
      | "execucao_ja_ativa"
      | "roteiro_encerrado"
      | null,
    readonly passos: number[] = [],
  ) {
    super(message);
    this.name = "ErroDeRoteiro";
  }
}

const lancarErroDeRoteiro = async (res: Response, fallback: string): Promise<never> => {
  try {
    const corpo = await res.clone().json();
    const d = corpo?.detail;
    if (d && typeof d === "object" && typeof d.erro === "string") {
      throw new ErroDeRoteiro(d.mensagem || fallback, d.erro, d.passos ?? []);
    }
  } catch (e) {
    if (e instanceof ErroDeRoteiro) throw e;
    /* não era o corpo estruturado — cai no erro comum */
  }
  throw await erroDaResposta(res, fallback);
};

/** O backend serializa `time` como "HH:MM:SS" — a tela trabalha com "HH:MM". */
const normalizarPasso = (p: PassoOut): PassoOut => ({
  ...p,
  hora_fixa: p.hora_fixa ? p.hora_fixa.slice(0, 5) : p.hora_fixa,
  blocos: p.blocos ?? [],
});

const normalizarDetalhe = (r: RoteiroDetalhe): RoteiroDetalhe => ({
  ...r,
  passos: (r.passos ?? []).map(normalizarPasso),
  avisos: r.avisos ?? [],
  passos_no_passado: r.passos_no_passado ?? [],
});

export async function listarRoteiros(campanhaId?: number): Promise<Roteiro[]> {
  const url = campanhaId != null ? `${baseRoteiros()}?campanha_id=${campanhaId}` : baseRoteiros();
  const res = await fetchWithAuth(url);
  return json(res, "Não foi possível carregar os roteiros.");
}

export async function criarRoteiro(payload: {
  nome: string;
  campanha_id?: number;
  passos?: PassoIn[];
}): Promise<RoteiroDetalhe> {
  const res = await fetchWithAuth(baseRoteiros(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passos: [], ...payload }),
  });
  if (!res.ok) await lancarErroDeRoteiro(res, "Não foi possível criar o roteiro.");
  return normalizarDetalhe((await res.json()) as RoteiroDetalhe);
}

export async function obterRoteiro(id: number): Promise<RoteiroDetalhe> {
  const res = await fetchWithAuth(`${baseRoteiros()}/${id}`);
  return normalizarDetalhe(await json<RoteiroDetalhe>(res, "Não foi possível carregar o roteiro."));
}

/** Substitui os passos do roteiro (lista completa, na ordem final, COM os ids). */
export async function definirPassos(id: number, passos: PassoIn[]): Promise<RoteiroDetalhe> {
  const res = await fetchWithAuth(`${baseRoteiros()}/${id}/passos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(passos),
  });
  if (!res.ok) await lancarErroDeRoteiro(res, "Não foi possível salvar os passos.");
  return normalizarDetalhe((await res.json()) as RoteiroDetalhe);
}

/** Troca as datas de vários passos de hora fixa de uma vez (pós-duplicar). */
export async function ajustarDatas(
  id: number,
  datas: { passo_id: number; data_fixa: string; hora_fixa?: string | null }[],
): Promise<RoteiroDetalhe> {
  const res = await fetchWithAuth(`${baseRoteiros()}/${id}/datas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datas }),
  });
  if (!res.ok) await lancarErroDeRoteiro(res, "Não foi possível ajustar as datas.");
  return normalizarDetalhe((await res.json()) as RoteiroDetalhe);
}

export async function duplicarRoteiro(id: number): Promise<Roteiro> {
  const res = await fetchWithAuth(`${baseRoteiros()}/${id}/duplicar`, { method: "POST" });
  return json(res, "Não foi possível duplicar o roteiro.");
}

export async function previewRoteiro(id: number): Promise<PreviewRoteiro> {
  const res = await fetchWithAuth(`${baseRoteiros()}/${id}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) await lancarErroDeRoteiro(res, "Não foi possível gerar a prévia do roteiro.");
  return (await res.json()) as PreviewRoteiro;
}

export async function agendarRoteiro(
  id: number,
  ignorarAvisos = false,
): Promise<ResultadoAgendamento> {
  const res = await fetchWithAuth(`${baseRoteiros()}/${id}/agendar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ignorar_avisos: ignorarAvisos }),
  });
  if (!res.ok) {
    // 422 com `detail.avisos` não é erro: é o backend pedindo confirmação.
    if (res.status === 422) {
      try {
        const corpo = await res.clone().json();
        const avisos = corpo?.detail?.avisos;
        if (Array.isArray(avisos)) return { agendada: false, avisos: avisos as string[] };
      } catch {
        /* não era JSON — cai no erro comum */
      }
    }
    await lancarErroDeRoteiro(res, "Não foi possível agendar o roteiro.");
  }
  return { agendada: true, execucao: (await res.json()) as ExecucaoEnvio };
}

/**
 * Reenvia um passo aos grupos escolhidos. Sempre MANUAL: retry automático
 * mandaria a mesma mensagem duas vezes no grupo.
 */
export async function reenviarPasso(
  execucaoId: number,
  passoId: number,
  grupoIds: number[],
): Promise<ExecucaoEnvio> {
  const res = await fetchWithAuth(`${baseRoteiros()}/execucoes/${execucaoId}/reenviar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passo_id: passoId, grupo_ids: grupoIds }),
  });
  if (!res.ok) await lancarErroDeRoteiro(res, "Não foi possível reenviar.");
  return (await res.json()) as ExecucaoEnvio;
}

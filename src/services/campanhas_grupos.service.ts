import { fetchWithAuth, getApiUrl } from "@/core/config/api.config";
import { erroDaResposta } from "@/services/http-error";

// getApiUrl resolve o host por ambiente — URL relativa só funciona no dev com proxy.
const base = () => getApiUrl("/api/v1/campanhas-grupos");

export type StatusCampanha = "ativa" | "pausada" | "arquivada";
export type EstrategiaEntrada = "sequencial" | "aleatoria";
export type ModoImagem = "link_preview" | "imagem_normal";

export type CampanhaGrupos = {
  id: number;
  nome: string;
  descricao: string | null;
  status: StatusCampanha;
  estrategia_entrada: EstrategiaEntrada;
  abertura_automatica: boolean;
  reabertura_automatica: boolean;
  prefixo: string | null;
  sufixo: string | null;
  modo_imagem: ModoImagem;
  /** Teto por campanha. `null` = sem limite próprio (vale a capacidade do grupo). */
  limite_participantes: number | null;
  total_grupos: number;
  criado_em: string;
};

export type GrupoDaCampanha = {
  grupo_id: number;
  posicao: number;
  /** Decisão da usuária: participa da rotação de entrada? */
  aberto: boolean;
  /**
   * Estado EFETIVO de lotação, calculado no backend com a MESMA regra que
   * decide a rotação. Nunca recalcule aqui: uma segunda cópia da regra é como
   * a tela passou a dizer "Aberto" para um grupo que o roteador já ignorava.
   */
  cheio: boolean;
  /** `null` = sem override, o valor de `cheio` veio da ocupação. */
  cheio_override: boolean | null;
  /** Teto efetivo (o menor entre capacidade e limite da campanha). */
  teto: number;
  nome: string | null;
  participantes: number;
  /** Capacidade do WhatsApp. A ocupação exibida usa o MENOR entre ela e o limite da campanha. */
  capacidade: number;
  permite_envio: boolean;
  ativo: boolean;
  sub_id: string | null;
  /** Por quais números este grupo é alcançável — a aba Grupos escopa por isso. */
  instancia_ids: number[];
  /**
   * Quando a LISTA de participantes deste grupo foi confirmada pela última vez.
   *
   * O contador (`participantes`) anda a cada evento do webhook; a lista só anda
   * no sync — e é dela que sai a exportação. Sem esta data, a tela diz 773 e o
   * CSV traz 679 sem ninguém entender por quê. `null` = nunca sincronizada.
   */
  participantes_sincronizados_em: string | null;
};

export type CampanhaGruposDetalhe = CampanhaGrupos & {
  grupos: GrupoDaCampanha[];
  /** Números que a campanha usa. Vazio = ainda não configurou a aba Números. */
  instancia_ids: number[];
};

/** Campos editáveis via PATCH — qualquer subconjunto. */
export type CampanhaGruposPatch = Partial<{
  nome: string;
  descricao: string | null;
  status: StatusCampanha;
  estrategia_entrada: EstrategiaEntrada;
  abertura_automatica: boolean;
  reabertura_automatica: boolean;
  prefixo: string | null;
  sufixo: string | null;
  modo_imagem: ModoImagem;
  limite_participantes: number | null;
}>;

/** Item do PUT de grupos — a tela manda a lista COMPLETA na ordem final. */
export type VinculoGrupo = {
  grupo_id: number;
  posicao: number;
  aberto: boolean;
  /** `null` volta ao automático (a ocupação decide). */
  cheio_override: boolean | null;
};

const json = async <T>(res: Response, fallback: string): Promise<T> => {
  if (!res.ok) throw await erroDaResposta(res, fallback);
  return res.json() as Promise<T>;
};

export async function listarCampanhas(): Promise<CampanhaGrupos[]> {
  const res = await fetchWithAuth(base());
  return json(res, "Não foi possível carregar as campanhas.");
}

/** Só o nome: Descrição saiu da criação (spec §1.1) — o nome já identifica a campanha. */
export async function criarCampanha(nome: string): Promise<CampanhaGrupos> {
  const res = await fetchWithAuth(base(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome }),
  });
  return json(res, "Não foi possível criar a campanha.");
}

/**
 * Cópia da campanha SEM os grupos — é como a próxima nasce já configurada.
 *
 * Vínculo de anúncio e Sub ID não são copiados: os dois são invariantes de
 * dinheiro (o esquema tem UNIQUE global em `campanha_anuncios.campaign_id`), e
 * duplicá-los contaria o mesmo gasto em duas campanhas.
 */
export async function duplicarCampanha(id: number): Promise<CampanhaGrupos> {
  const res = await fetchWithAuth(`${base()}/${id}/duplicar`, { method: "POST" });
  return json(res, "Não foi possível duplicar a campanha.");
}

/**
 * Encerra a campanha. Soft-delete: o `/g/{slug}` dela passa a responder
 * "campanha encerrada" com 200 — o anúncio já veiculando continua mandando
 * tráfego, e um 404 faria o Meta tratar o destino como quebrado.
 */
export async function excluirCampanha(id: number): Promise<void> {
  const res = await fetchWithAuth(`${base()}/${id}`, { method: "DELETE" });
  if (!res.ok) throw await erroDaResposta(res, "Não foi possível excluir a campanha.");
}

// ── Sub IDs da campanha (080) ────────────────────────────────────────────────

/** Uma opção da lista de "Vincular Sub ID" da campanha de grupos. */
export type SubIdVinculavel = {
  sub_id: string;
  pedidos: number;
  comissao_liquida: number;
  vinculado: boolean;
  /**
   * Preenchido quando o Sub ID NÃO pode ser vinculado, com o motivo pronto
   * ("já entra pelo grupo X", "vinculado ao anúncio Y"). A opção continua na
   * lista de propósito: escondê-la faz a afiliada procurar o Sub ID que ela
   * sabe que existe e concluir que a tela está quebrada.
   */
  bloqueado_por: string | null;
};

export async function listarSubIdsDaCampanha(
  id: number,
  periodo?: { inicio: string; fim: string },
): Promise<SubIdVinculavel[]> {
  const query = periodo ? `?${new URLSearchParams(periodo)}` : "";
  const res = await fetchWithAuth(`${base()}/${id}/sub-ids${query}`);
  const corpo = await json<{ sub_ids: SubIdVinculavel[] }>(
    res,
    "Não foi possível carregar os Sub IDs.",
  );
  return corpo.sub_ids ?? [];
}

/** Substitui o conjunto inteiro — mesmo contrato do PUT de anúncios. */
export async function definirSubIdsDaCampanha(
  id: number,
  subIds: string[],
  periodo?: { inicio: string; fim: string },
): Promise<SubIdVinculavel[]> {
  const query = periodo ? `?${new URLSearchParams(periodo)}` : "";
  const res = await fetchWithAuth(`${base()}/${id}/sub-ids${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subIds),
  });
  const corpo = await json<{ sub_ids: SubIdVinculavel[] }>(
    res,
    "Não foi possível salvar os Sub IDs.",
  );
  return corpo.sub_ids ?? [];
}

export async function obterCampanha(id: number): Promise<CampanhaGruposDetalhe> {
  const res = await fetchWithAuth(`${base()}/${id}`);
  return json(res, "Não foi possível carregar a campanha.");
}

export async function atualizarCampanha(
  id: number,
  patch: CampanhaGruposPatch,
): Promise<CampanhaGrupos> {
  const res = await fetchWithAuth(`${base()}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return json(res, "Não foi possível salvar a campanha.");
}

/** Substitui o conjunto de grupos da campanha (lista completa, na ordem final). */
export async function definirGruposDaCampanha(
  id: number,
  vinculos: VinculoGrupo[],
): Promise<CampanhaGruposDetalhe> {
  const res = await fetchWithAuth(`${base()}/${id}/grupos`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vinculos),
  });
  return json(res, "Não foi possível salvar os grupos da campanha.");
}

// ── Link de entrada (F6) ─────────────────────────────────────────────────────

/** Eventos que o pixel do Facebook dispara na página do link. */
export type PixelEventos = {
  pageview: boolean;
  lead: boolean;
};

export type CampanhaLink = {
  id: number;
  slug: string;
  /** URL pública — é o que a afiliada divulga. */
  url: string;
  /** Mesma rota em modo teste: entra na campanha sem contar nas métricas. */
  url_teste: string;
  titulo_previa: string | null;
  descricao_previa: string | null;
  banner_previa_url: string | null;
  pixel_facebook_id: string | null;
  pixel_eventos: PixelEventos;
  ativo: boolean;
};

/**
 * Campos editáveis do link — qualquer subconjunto.
 *
 * Sem `pixel_eventos`: PageView e Lead disparam SEMPRE desde 04/09. Quem
 * configurou um pixel quer os dois, e desligar o Lead quebra o CPL — a métrica
 * principal de campanha de grupo — sem nenhum aviso. O backend ignora o campo.
 */
export type CampanhaLinkPatch = Partial<{
  titulo_previa: string | null;
  descricao_previa: string | null;
  banner_previa_url: string | null;
  pixel_facebook_id: string | null;
  ativo: boolean;
}>;

export type TipoEventoGrupo = "entrada" | "saida";
export type OrigemEventoGrupo = "link" | "organica" | "desconhecida";

/** Entrada ou saída de um grupo da campanha — sem nenhum dado pessoal. */
export type EventoDeGrupo = {
  /** PK do evento. É metade do cursor de paginação e a key estável da lista. */
  id: number;
  tipo: TipoEventoGrupo;
  /**
   * De onde a pessoa veio ao ENTRAR.
   *
   * `null` em SAÍDA, sempre: saída não tem origem. Antes vinha
   * `"desconhecida"` e a tela escrevia "Saída · origem desconhecida", que se
   * lê como "o sistema perdeu informação" — informação que nunca existiu.
   */
  origem: OrigemEventoGrupo | null;
  grupo_id: number;
  grupo: string | null;
  /** ISO 8601. Vem nulo quando o banco ainda não carimbou a data. */
  quando: string | null;
};

export type PaginaDeAtividade = {
  eventos: EventoDeGrupo[];
  /** `null` quando acabou. Formato opaco — não interprete no cliente. */
  proximo_cursor: string | null;
  /** Data do evento mais antigo dos grupos da campanha, ISO. */
  registrando_desde: string | null;
};

/** O link é criado na primeira visita — a tela não precisa "gerar" nada. */
export async function obterLinkDaCampanha(id: number): Promise<CampanhaLink> {
  const res = await fetchWithAuth(`${base()}/${id}/link`);
  return json(res, "Não foi possível carregar o link de entrada.");
}

export async function atualizarLinkDaCampanha(
  id: number,
  patch: CampanhaLinkPatch,
): Promise<CampanhaLink> {
  const res = await fetchWithAuth(`${base()}/${id}/link`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return json(res, "Não foi possível salvar o link de entrada.");
}

/**
 * Uma PÁGINA do feed, do mais recente para o mais antigo.
 *
 * Paginação por cursor, não por página: `criado_em` empata em lote (uma
 * entrada de 30 pessoas grava 30 eventos no mesmo instante) e OFFSET sobre
 * ordem ambígua repete e pula linhas.
 */
export async function listarAtividade(
  id: number,
  opts: {
    limite?: number;
    cursor?: string | null;
    tipo?: TipoEventoGrupo | null;
    grupoId?: number | null;
  } = {},
): Promise<PaginaDeAtividade> {
  const query = new URLSearchParams({ limite: String(opts.limite ?? 50) });
  if (opts.cursor) query.set("cursor", opts.cursor);
  if (opts.tipo) query.set("tipo", opts.tipo);
  if (opts.grupoId) query.set("grupo_id", String(opts.grupoId));
  const res = await fetchWithAuth(`${base()}/${id}/atividade?${query}`);
  const corpo = await json<PaginaDeAtividade>(
    res,
    "Não foi possível carregar a atividade.",
  );
  return {
    eventos: corpo.eventos ?? [],
    proximo_cursor: corpo.proximo_cursor ?? null,
    registrando_desde: corpo.registrando_desde ?? null,
  };
}

// ── Anúncios vinculados e resultados (F7) ────────────────────────────────────

/** Campanha de anúncio do Meta, com a flag do multi-select desta campanha. */
export type AnuncioVinculavel = {
  id: number;
  /** Nullable no backend (`Campaign.name`) — ler sem fallback derruba a tela. */
  nome: string | null;
  status: string | null;
  sub_id: string | null;
  /** Gasto no período consultado — é o que distingue campanhas de nome idêntico. */
  gasto: number;
  /**
   * Veiculação REAL, não `effective_status`: campanha com orçamento vitalício
   * esgotado fica ACTIVE para sempre na Meta sem entregar nada.
   */
  veiculando: boolean;
  vinculada: boolean;
  /**
   * Nome da OUTRA campanha de grupos que já reivindica este anúncio (`null` se
   * livre). Vem no próprio payload — a tela não precisa de uma segunda request
   * a `/vinculos-de-anuncio` para descobrir a mesma coisa.
   */
  vinculada_em_outra: { id: number; nome: string } | null;
};

/** Uma linha por grupo da campanha, no período consultado. */
export type LinhaResultado = {
  grupo_id: number;
  grupo: string | null;
  sub_id: string | null;
  participantes: number;
  entradas: number;
  saidas: number;
  ficaram: number;
  /** `null` quando não há ninguém exposto (nem participante, nem saída). */
  evasao_pct: number | null;
  mensagens: number;
  cliques: number;
  pedidos: number;
  /** Real: vem do Sub ID do grupo (`wg…`), rastreada. */
  comissao_liquida: number;
};

/**
 * Rodapé de totais — e o ÚNICO nível em que gasto, lucro e ROAS existem.
 *
 * A linha por grupo perdeu os três em 04/09: eles dependiam de ratear o gasto
 * da campanha entre os grupos, e não há informação para essa divisão. O rateio
 * dividia IGUALMENTE sempre que ninguém entrava no período — foi assim que
 * R$1.223,05 virou R$611,52 em dois grupos de tamanhos diferentes.
 */
export type TotaisResultado = Omit<
  LinhaResultado,
  "grupo_id" | "grupo" | "sub_id" | "evasao_pct"
> & {
  /** Evasão do conjunto — não a média das evasões por grupo. */
  evasao_pct: number | null;
  /**
   * Quantos Sub IDs rastreiam venda para esta campanha.
   *
   * `0` = não há medição. Comissão zero aí NÃO é prejuízo — é ninguém
   * olhando — e a tela mostra "—" em vez de "R$ 0,00" e "0.00x".
   */
  sub_ids_vinculados: number;
  /** Investimento INTEIRO da campanha, uma vez — não a soma de um rateio. */
  gasto_atribuido: number;
  lucro: number;
  /** `null` sem investimento: 0.00x diria que cada real gasto voltou zero. */
  roas: number | null;
  lucro_por_pessoa: number | null;
};

/**
 * Bloco de investimento do topo.
 *
 * `null` ≠ `0`: sem pixel configurado o backend manda `null` em leads/cpl, e
 * sem entrada no período manda `null` nos custos. A tela mostra "—" com a nota
 * do motivo — exibir 0 diria "ninguém virou lead", que é outra coisa.
 */
export type AnunciosDoResultado = {
  campanhas_vinculadas: number;
  investimento: number;
  investimento_com_imposto: number;
  leads: number | null;
  cpl: number | null;
  custo_por_entrada: number | null;
  custo_por_permanencia: number | null;
};

export type ResultadosDaCampanha = {
  periodo: { inicio: string; fim: string };
  linhas: LinhaResultado[];
  totais: TotaisResultado;
  anuncios: AnunciosDoResultado;
};

/** campaign_id do Meta → campanha de grupos que o reivindica (selo da tela de Anúncios). */
export type VinculoDeAnuncio = { id: number; nome: string };

/** Todas as campanhas de anúncio da usuária + quais estão nesta campanha. */
export async function listarAnunciosDaCampanha(
  id: number,
  periodo?: { inicio: string; fim: string },
): Promise<AnuncioVinculavel[]> {
  const query = periodo ? `?${new URLSearchParams(periodo)}` : "";
  const res = await fetchWithAuth(`${base()}/${id}/anuncios${query}`);
  const corpo = await json<{ anuncios: AnuncioVinculavel[] }>(
    res,
    "Não foi possível carregar os anúncios.",
  );
  return corpo.anuncios ?? [];
}

/** Substitui o conjunto de anúncios vinculados (lista completa de ids selecionados). */
export async function definirAnunciosDaCampanha(
  id: number,
  ids: number[],
  periodo?: { inicio: string; fim: string },
): Promise<AnuncioVinculavel[]> {
  const query = periodo ? `?${new URLSearchParams(periodo)}` : "";
  const res = await fetchWithAuth(`${base()}/${id}/anuncios${query}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids),
  });
  const corpo = await json<{ anuncios: AnuncioVinculavel[] }>(
    res,
    "Não foi possível salvar os anúncios vinculados.",
  );
  return corpo.anuncios ?? [];
}

export async function obterResultados(
  id: number,
  periodo: { inicio: string; fim: string },
): Promise<ResultadosDaCampanha> {
  const query = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim });
  const res = await fetchWithAuth(`${base()}/${id}/resultados?${query}`);
  return json(res, "Não foi possível carregar os resultados.");
}

/** Nome do arquivo no Content-Disposition — o header some quando o CORS não o expõe. */
const nomeDoAnexo = (header: string | null): string | null => {
  if (!header) return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simples = header.match(/filename="?([^";]+)"?/i);
  return simples ? simples[1].trim() : null;
};

/**
 * Busca o CSV de entradas do PERÍODO selecionado. Precisa passar pelo `fetchWithAuth`
 * (o endpoint exige Authorization) — `<a download>` direto devolveria 401.
 *
 * Devolve o dado; quem dispara o download é a tela. Service não mexe em DOM.
 */
/**
 * CSV de quem está NOS GRUPOS AGORA — sem filtro de período.
 *
 * Mudou de conceito em 04/09: antes exportava as entradas dos últimos 30 dias,
 * e por isso um grupo com 946 pessoas acumuladas em meses exportava 8 linhas.
 * A lista de participantes é um retrato, não uma janela.
 */
export async function exportarLeads(
  id: number,
  grupoIds?: number[],
): Promise<{ blob: Blob; nome: string }> {
  const query = new URLSearchParams();
  // Ausente = todos os grupos da campanha. Lista vazia seria "nenhum grupo",
  // que o backend recusa — a tela nunca deve chegar aqui sem seleção.
  if (grupoIds?.length) query.set("grupos", grupoIds.join(","));
  const sufixo = query.toString() ? `?${query}` : "";
  const res = await fetchWithAuth(`${base()}/${id}/leads/export${sufixo}`);
  if (!res.ok) throw await erroDaResposta(res, "Não foi possível exportar os leads.");

  return {
    blob: await res.blob(),
    nome: nomeDoAnexo(res.headers.get("Content-Disposition")) ?? "participantes.csv",
  };
}

/** Mapa campaign_id (Meta) → campanha de grupos. Uma request para toda a lista. */
export async function listarVinculosDeAnuncio(): Promise<Record<string, VinculoDeAnuncio>> {
  const res = await fetchWithAuth(`${base()}/vinculos-de-anuncio`);
  const corpo = await json<{ vinculos: Record<string, VinculoDeAnuncio> }>(
    res,
    "Não foi possível carregar os vínculos de anúncio.",
  );
  return corpo.vinculos ?? {};
}

// ── Resumo consolidado do Dashboard (F7) ─────────────────────────────────────

export type ResumoPorCampanha = {
  campanha_id: number;
  nome: string;
  grupos: number;
  participantes: number;
  entradas: number;
  comissao_liquida: number;
  lucro: number;
  /** `null` quando não há participante: a métrica não existe. 0,00 diria
   *  "cada pessoa rende zero", que é outra afirmação. */
  lucro_por_pessoa: number | null;
};

/**
 * Totais somados de todas as campanhas ativas — o bloco secundário do Dashboard.
 *
 * `leads` e `custo_por_entrada` vêm `null` quando não há pixel / não há entrada no
 * período: a tela mostra "—", nunca 0.
 */
export type ResumoDeGrupos = {
  periodo: { inicio: string; fim: string };
  /** Total REAL de campanhas ativas — não o número somado (ver `campanhas_omitidas`). */
  campanhas_ativas: number;
  /** Quantas ficaram de fora do corte do backend. > 0 = os totais não são de tudo. */
  campanhas_omitidas: number;
  totais: TotaisResultado;
  investimento: number;
  investimento_com_imposto: number;
  leads: number | null;
  custo_por_entrada: number | null;
  por_campanha: ResumoPorCampanha[];
};

/**
 * Sem período, o backend assume os últimos 30 dias — é o que acontece quando a
 * usuária limpa o filtro do Dashboard.
 */
export async function obterResumoDeGrupos(periodo?: {
  inicio?: string;
  fim?: string;
}): Promise<ResumoDeGrupos> {
  const query = new URLSearchParams();
  if (periodo?.inicio) query.set("inicio", periodo.inicio);
  if (periodo?.fim) query.set("fim", periodo.fim);
  const sufixo = query.toString() ? `?${query}` : "";
  const res = await fetchWithAuth(`${base()}/resumo${sufixo}`);
  return json(res, "Não foi possível carregar o resumo das campanhas de grupos.");
}

// ── Números da campanha (spec §2) ────────────────────────────────────────────

export type NumeroDaCampanha = {
  id: number;
  nome_exibicao: string | null;
  /** Já mascarado pelo backend (•••• 1234). */
  numero: string | null;
  status: string;
  selecionado: boolean;
  /** Quantos grupos desta campanha chegam por este número — trava a remoção. */
  grupos_na_campanha: number;
};

export async function listarNumerosDaCampanha(id: number): Promise<NumeroDaCampanha[]> {
  const res = await fetchWithAuth(`${base()}/${id}/numeros`);
  const corpo = await json<{ numeros: NumeroDaCampanha[] }>(
    res,
    "Não foi possível carregar os números.",
  );
  return corpo.numeros ?? [];
}

/**
 * Substitui o conjunto de números da campanha.
 *
 * Desmarcar número que ainda tem grupos devolve 409 com a lista dos grupos que
 * travam — a tela mostra a mensagem do backend, que já diz o que fazer.
 */
export async function definirNumerosDaCampanha(
  id: number,
  ids: number[],
): Promise<NumeroDaCampanha[]> {
  const res = await fetchWithAuth(`${base()}/${id}/numeros`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ids),
  });
  const corpo = await json<{ numeros: NumeroDaCampanha[] }>(
    res,
    "Não foi possível salvar os números.",
  );
  return corpo.numeros ?? [];
}

// ── Visão geral (spec §1.3) ──────────────────────────────────────────────────

export type PontoDaSerie = {
  /** AAAA-MM-DD, dia civil em Brasília. */
  data: string;
  entradas: number;
  saidas: number;
  /**
   * O dia corrente, que ainda não fechou.
   *
   * A janela terminava em ONTEM justamente para não ter um ponto pela metade
   * na ponta. O preço era pior: campanha que começou hoje aparecia inteira em
   * zero enquanto o movimento acontecia. Agora hoje entra, marcado — a tela
   * desenha esse ponto diferente para não ser lido como queda.
   */
  parcial: boolean;
};

export type EstadoDosGrupos = {
  total: number;
  abertos: number;
  cheios: number;
  /** Aberto E com vaga: os que podem receber entrada agora. */
  disponiveis: number;
};

/**
 * KPIs operacionais + ritmo. Sem comissão, lucro ou ROAS — isso é Resultados.
 *
 * `taxa_entrada` e `evasao` vêm `null` quando o denominador não existe; a tela
 * mostra "—", nunca 0 (que afirmaria "ninguém converteu").
 */
export type VisaoGeralDaCampanha = {
  periodo: { inicio: string; fim: string; dias: number };
  cliques: number;
  entradas: number;
  /** Só as que vieram do link — é o numerador da taxa de entrada. */
  entradas_do_link: number;
  taxa_entrada: number | null;
  saidas: number;
  evasao: number | null;
  participantes: number;
  grupos: EstadoDosGrupos;
  serie: PontoDaSerie[];
  envios: EnviosDaCampanha;
};

/**
 * Uma LINHA, não um card.
 *
 * Cobre o ponto cego do modelo sem retry: número desconectado uma tarde
 * inteira faz todos os passos daquele período falharem em sequência, e sem
 * isso ela só descobriria abrindo roteiro por roteiro.
 */
export type EnviosDaCampanha = {
  /** Estado do AGORA — "tem coisa marcada para sair?". */
  roteiros_agendados: number;
  mensagens_enviadas: number;
  falhas: number;
  /** Roteiro da falha mais recente; a linha é clicável e leva até ele. */
  roteiro_com_falha_id: number | null;
};

export type DiasDaVisaoGeral = 7 | 14 | 30;

export async function obterVisaoGeral(
  id: number,
  dias: DiasDaVisaoGeral = 7,
): Promise<VisaoGeralDaCampanha> {
  const res = await fetchWithAuth(`${base()}/${id}/visao-geral?dias=${dias}`);
  return json(res, "Não foi possível carregar a visão geral.");
}

import { fetchWithAuth, getApiUrl } from "@/core/config/api.config";
import { erroDaResposta } from "@/services/http-error";
import type {
  AutomacaoLotePayload,
  AutomacaoLoteResultado,
  AutomacaoStatus,
  InstagramAutomation,
  InstagramAutomationPayload,
  InstagramConnection,
  InstagramMediaPage,
  RetroativoEnvio,
  RetroativoPrevia,
} from "@/shared/types/instagram";

const BASE = "/api/v1/instagram";

// ---------------------------------------------------------------- conexão --

export const getInstagramConnection = async (): Promise<InstagramConnection | null> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/connection`));
  if (res.status === 404 || res.status === 204) return null;
  if (!res.ok) throw await erroDaResposta(res, "Erro ao buscar a conexão do Instagram");
  return (await res.json()) as InstagramConnection | null;
};

export const getInstagramAuthUrl = async (redirectUri: string): Promise<string> => {
  const res = await fetchWithAuth(
    getApiUrl(`${BASE}/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`),
  );
  if (!res.ok) throw await erroDaResposta(res, "Erro ao gerar o link de login do Instagram");
  return (await res.json()).url as string;
};

export const completeInstagramOAuth = async (
  code: string,
  redirectUri: string,
): Promise<InstagramConnection> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/oauth/callback`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao conectar com o Instagram");
  return (await res.json()) as InstagramConnection;
};

/** Refaz a inscrição da conta no webhook de comentários. */
export const subscribeInstagramWebhook = async (): Promise<InstagramConnection> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/connection/subscribe`), { method: "POST" });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao ativar o recebimento de comentários");
  return (await res.json()) as InstagramConnection;
};

export const disconnectInstagram = async (): Promise<void> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/connection`), { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw await erroDaResposta(res, "Erro ao desconectar");
};

// ------------------------------------------------------------ publicações --

export const listInstagramMedia = async (
  cursor?: string | null,
  refresh = false,
): Promise<InstagramMediaPage> => {
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  if (refresh) qs.set("refresh", "true");
  const sufixo = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetchWithAuth(getApiUrl(`${BASE}/media${sufixo}`));
  if (!res.ok) throw await erroDaResposta(res, "Erro ao carregar suas publicações");
  return (await res.json()) as InstagramMediaPage;
};

export const listInstagramStories = async (): Promise<InstagramMediaPage> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/stories`));
  if (!res.ok) throw await erroDaResposta(res, "Erro ao carregar seus stories");
  return (await res.json()) as InstagramMediaPage;
};

// -------------------------------------------------------------- automações --

export const listAutomations = async (): Promise<InstagramAutomation[]> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations`));
  if (!res.ok) throw await erroDaResposta(res, "Erro ao carregar as automações");
  return (await res.json()) as InstagramAutomation[];
};

export const createAutomationsInBatch = async (
  payload: AutomacaoLotePayload,
): Promise<AutomacaoLoteResultado> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/lote`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao criar as automações");
  return (await res.json()) as AutomacaoLoteResultado;
};

export const getAutomation = async (id: number): Promise<InstagramAutomation> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}`));
  if (!res.ok) throw await erroDaResposta(res, "Erro ao carregar a automação");
  return (await res.json()) as InstagramAutomation;
};

export const createAutomation = async (
  payload: InstagramAutomationPayload,
): Promise<InstagramAutomation> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao criar a automação");
  return (await res.json()) as InstagramAutomation;
};

export const updateAutomation = async (
  id: number,
  payload: InstagramAutomationPayload,
): Promise<InstagramAutomation> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao salvar a automação");
  return (await res.json()) as InstagramAutomation;
};

export const setAutomationStatus = async (
  id: number,
  status: AutomacaoStatus,
): Promise<InstagramAutomation> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}/status`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao alterar o status");
  return (await res.json()) as InstagramAutomation;
};

export const duplicateAutomation = async (id: number): Promise<InstagramAutomation> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}/duplicate`), {
    method: "POST",
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao duplicar a automação");
  return (await res.json()) as InstagramAutomation;
};

export const deleteAutomation = async (id: number): Promise<void> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}`), { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw await erroDaResposta(res, "Erro ao excluir");
};

// ------------------------------------------------------------ retroativos --

/** Lê os comentários do post e diz quantos ainda podem receber o direct. Não envia. */
export const getRetroativosPrevia = async (id: number): Promise<RetroativoPrevia> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}/retroativos`));
  if (!res.ok) throw await erroDaResposta(res, "Erro ao ler os comentários da publicação");
  return (await res.json()) as RetroativoPrevia;
};

/** Enfileira os directs dos elegíveis — o backend recalcula a lista na hora. */
export const enviarRetroativos = async (id: number): Promise<RetroativoEnvio> => {
  const res = await fetchWithAuth(getApiUrl(`${BASE}/automations/${id}/retroativos`), {
    method: "POST",
  });
  if (!res.ok) throw await erroDaResposta(res, "Erro ao enviar os directs");
  return (await res.json()) as RetroativoEnvio;
};

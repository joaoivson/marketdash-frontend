/** Tipos da automação de Instagram (comentário → direct). */

export type InstagramConnectionStatus = "ativo" | "expirado" | "revogado";

export interface InstagramConnection {
  id: number;
  ig_user_id: string;
  ig_username: string | null;
  ig_avatar_url: string | null;
  status: InstagramConnectionStatus;
  connected_at: string | null;
  token_expires_at: string | null;
  /**
   * A CONTA está inscrita no webhook de comentários?
   * Assinar o campo `comments` no painel da Meta vale só para o app — cada conta
   * precisa de uma chamada própria. Com isto `false`, nada dispara e a Meta não
   * reporta erro nenhum: por isso a tela precisa avisar.
   */
  webhook_subscrito: boolean;
  webhook_erro: string | null;
  /** BUSINESS | MEDIA_CREATOR — só Criador consegue tornar o perfil privado. */
  account_type: string | null;
  /**
   * `false` = conectou sem `instagram_business_manage_comments`. O direct sai,
   * mas a resposta pública no comentário não — e nada avisa.
   */
  pode_responder_comentario: boolean;
}

export interface InstagramMediaItem {
  id: string;
  caption_preview: string | null;
  media_type: string | null;
  /** AD | FEED | STORY | REELS */
  media_product_type: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  timestamp: string | null;
  /** Já existe automação ATIVA cobrindo este post. */
  tem_automacao: boolean;
  /**
   * A palavra que a própria legenda manda comentar ("Comente ALGODÃO para...").
   * null quando a legenda não deixa afirmar — o backend recusa de propósito em
   * vez de chutar, porque palavra errada = link errado para a cliente.
   */
  palavra_sugerida: string | null;
  /**
   * Mídia de ANÚNCIO descoberta pelo primeiro comentário (não existe no feed nem
   * em /media). A tela mostra com a tag "Anúncio".
   */
  eh_anuncio?: boolean;
  ad_title?: string | null;
  comentarios?: number | null;
  ultimo_comentario_em?: string | null;
}

export interface InstagramMediaPage {
  items: InstagramMediaItem[];
  /** Cursor de "Carregar mais". null = acabou. */
  next_cursor: string | null;
  from_cache: boolean;
}

export type AutomacaoEscopo =
  | "post_especifico"
  | "qualquer"
  // Story: reply do story (que chega como DM) dispara a automação.
  | "story_especifico"
  | "story_qualquer";
export type AutomacaoTrigger = "palavras" | "qualquer";
export type AutomacaoStatus = "ativa" | "pausada" | "rascunho";

export interface InstagramAutomation {
  id: number;
  user_id: number;
  connection_id: number;
  nome: string;
  escopo: AutomacaoEscopo;
  media_id: string | null;
  media_thumbnail_url: string | null;
  media_caption_preview: string | null;
  media_permalink: string | null;
  trigger_tipo: AutomacaoTrigger;
  /** Texto como a aluna digitou (o backend guarda a versão normalizada à parte). */
  palavras: string[];
  resposta_publica_ativa: boolean;
  resposta_publica_variacoes: string[];
  dm_texto: string;
  /** Link do botão do direct. NULL = automação antiga, que vai como texto puro. */
  dm_link: string | null;
  /** Título do botão (limite 20 no backend e na Meta). */
  dm_botao_texto: string | null;
  status: AutomacaoStatus;
  created_at: string | null;
  updated_at: string | null;
  comentarios_capturados: number;
  directs_enviados: number;
}

/** Corpo de criação/edição — o backend calcula o resto. */
export type InstagramAutomationPayload = Pick<
  InstagramAutomation,
  | "nome"
  | "escopo"
  | "media_id"
  | "media_thumbnail_url"
  | "media_caption_preview"
  | "media_permalink"
  | "trigger_tipo"
  | "palavras"
  | "resposta_publica_ativa"
  | "resposta_publica_variacoes"
  | "dm_texto"
  | "dm_link"
  | "dm_botao_texto"
  | "status"
>;

// --------------------------------------------------------- criação em lote --

export interface AutomacaoLoteItem {
  media_id: string;
  palavras: string[];
  dm_link: string | null;
  nome?: string | null;
  media_thumbnail_url?: string | null;
  media_caption_preview?: string | null;
  media_permalink?: string | null;
}

/**
 * O modelo vale para todos os itens; só a palavra e o link mudam por post.
 * É essa separação que torna viável cobrir centenas de publicações.
 */
export interface AutomacaoLotePayload {
  itens: AutomacaoLoteItem[];
  dm_texto: string;
  dm_botao_texto: string | null;
  resposta_publica_ativa: boolean;
  resposta_publica_variacoes: string[];
  /** Somadas à palavra de cada post — atendem quem comenta "quero". */
  palavras_comuns: string[];
  status: AutomacaoStatus;
}

export interface AutomacaoLotePulada {
  media_id: string;
  motivo: string;
}

export interface AutomacaoLoteResultado {
  criadas: InstagramAutomation[];
  /** Nunca omitir na tela: é o post que continua sem responder comentário. */
  puladas: AutomacaoLotePulada[];
}

/**
 * Prévia do envio retroativo. Os grupos são exclusivos e somam
 * `total_comentarios` — cada comentário sabe por que ficou de fora.
 */
export interface RetroativoPrevia {
  automation_id: number;
  total_comentarios: number;
  elegiveis: number;
  /** Dos elegíveis, quantos são das últimas 24h. */
  elegiveis_ultimas_24h: number;
  ja_respondidos: number;
  ja_processados: number;
  sem_palavra: number;
  pessoa_ja_recebeu: number;
  /** Mais de 7 dias: a Meta não aceita mais o direct por comentário. */
  fora_da_janela: number;
  da_propria_conta: number;
  truncado: boolean;
  /** Quando o elegível mais antigo deixa de poder receber (ISO). */
  primeiro_expira_em: string | null;
}

export interface RetroativoEnvio {
  enfileirados: number;
  /** Entraram no contador sem envio: passaram de 7 dias ou a pessoa já tinha recebido. */
  registrados_expirados: number;
  registrados_duplicados: number;
  previa: RetroativoPrevia;
}

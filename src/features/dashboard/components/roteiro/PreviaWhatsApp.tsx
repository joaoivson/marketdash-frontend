import {
  FileText, Film, Image as ImageIcon, Mic, Paperclip,
} from "lucide-react";

import { BLOCOS_DE_MIDIA, type BlocoIn } from "@/services/roteiros.service";
import { cn } from "@/shared/lib/utils";

/**
 * Prévia do passo como bolha de WhatsApp.
 *
 * As cores são literais de propósito — é a única exceção à regra de usar as
 * variáveis do tema. A tela está IMITANDO outro produto: a bolha só cumpre o
 * papel de prévia se for reconhecível como WhatsApp, e uma bolha `bg-primary`
 * não é. Os dois valores são os da conversa real (claro `#d9fdd3`, escuro
 * `#005c4b`) e o par escuro é aplicado por `dark:`, então o tema continua
 * mandando em qual dos dois aparece.
 */
const BOLHA =
  "bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]";

/**
 * O carimbo da bolha: data + hora quando o passo atravessa o dia, só hora
 * quando cai hoje.
 *
 * Mostrava a hora ATUAL, não a do passo. Num roteiro com passos em dias
 * diferentes, "21:23" sozinho não diz nada — e pior, mentia: o carimbo dizia
 * uma coisa e o passo saía em outra.
 */
const carimbo = (quando?: string | null): string => {
  const alvo = quando ? new Date(quando) : new Date();
  if (Number.isNaN(alvo.getTime())) return "";
  const emBR = (opcoes: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...opcoes })
      .format(alvo);
  const hora = emBR({ hour: "2-digit", minute: "2-digit" });
  const diaDoPasso = emBR({ day: "2-digit", month: "2-digit" });
  const diaDeHoje = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
  }).format(new Date());
  return diaDoPasso === diaDeHoje ? hora : `${diaDoPasso} ${hora}`;
};

/** Como cada mídia aparece na bolha quando ainda não há arquivo escolhido. */
const PLACEHOLDER = {
  imagem: { Icone: ImageIcon, rotulo: "Imagem" },
  video: { Icone: Film, rotulo: "Vídeo" },
  audio: { Icone: Mic, rotulo: "Nota de voz" },
  arquivo: { Icone: Paperclip, rotulo: "Arquivo" },
} as const;

const Bolha = ({ bloco, quando }: { bloco: BlocoIn; quando?: string | null }) => {
  const midia = BLOCOS_DE_MIDIA.includes(bloco.tipo);
  const imagem = bloco.tipo === "imagem";
  // Nota de voz não carrega texto no WhatsApp — a legenda não existe lá.
  const legenda = bloco.tipo === "audio" ? null : midia ? bloco.legenda : bloco.conteudo;
  const ph = PLACEHOLDER[bloco.tipo as keyof typeof PLACEHOLDER];
  return (
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] min-w-0 space-y-1.5 rounded-xl rounded-tr-sm px-2.5 py-1.5 shadow-sm",
          BOLHA,
        )}
      >
        {imagem && bloco.conteudo && (
          <img
            src={bloco.conteudo}
            alt=""
            className="max-h-52 w-full rounded-lg object-cover"
          />
        )}
        {bloco.tipo === "video" && bloco.conteudo && (
          <video src={bloco.conteudo} controls className="max-h-52 w-full rounded-lg" />
        )}
        {bloco.tipo === "audio" && bloco.conteudo && (
          <audio src={bloco.conteudo} controls className="h-9 w-full" />
        )}
        {bloco.tipo === "arquivo" && bloco.conteudo && (
          <span className="flex items-center gap-2 rounded-lg bg-black/10 px-2.5 py-2 text-xs">
            <FileText className="h-4 w-4 flex-shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 truncate">
              {decodeURIComponent(bloco.conteudo.split("/").pop() || "arquivo")}
            </span>
          </span>
        )}
        {midia && !bloco.conteudo && ph && (
          <div className="flex h-24 w-40 flex-col items-center justify-center gap-1 rounded-lg bg-black/10">
            <ph.Icone className="h-6 w-6 opacity-50" />
            <span className="text-[10px] opacity-60">{ph.rotulo}</span>
          </div>
        )}
        {legenda?.trim() ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-snug">
            {legenda}
          </p>
        ) : (
          !midia && (
            <p className="text-sm italic leading-snug opacity-60">Sem texto</p>
          )
        )}
        <p className="text-right text-[10px] leading-none opacity-60 tabular-nums">
          {carimbo(quando)}
        </p>
      </div>
    </div>
  );
};

/**
 * Fundo de conversa. Também literal, e pelo mesmo motivo da bolha: o contraste
 * entre bolha e fundo é o que faz a prévia parecer o WhatsApp.
 */
export const PreviaWhatsApp = ({
  blocos,
  nomeDoGrupo,
  quando,
  vazio = "Adicione uma mensagem para ver a prévia.",
}: {
  blocos: BlocoIn[];
  nomeDoGrupo?: string;
  /** Horário RESOLVIDO do passo (ISO). Sem ele o carimbo cai na hora atual. */
  quando?: string | null;
  vazio?: string;
}) => (
  <div className="overflow-hidden rounded-xl border border-border">
    <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
      <span className="h-6 w-6 flex-shrink-0 rounded-full bg-primary/20" />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
        {nomeDoGrupo || "Seu grupo"}
      </span>
    </div>
    <div className="max-h-[28vh] space-y-1.5 overflow-y-auto bg-[#efeae2] p-3 dark:bg-[#0b141a] lg:max-h-[52vh]">
      {blocos.length === 0 ? (
        <p className="py-6 text-center text-xs text-[#667781] dark:text-[#8696a0]">
          {vazio}
        </p>
      ) : (
        blocos.map((b, i) => <Bolha key={i} bloco={b} quando={quando} />)
      )}
    </div>
  </div>
);

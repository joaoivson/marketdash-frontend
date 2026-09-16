import { useState } from "react";
import { Heart, MessageCircle, Send } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MiniaturaInstagram } from "@/features/dashboard/components/MiniaturaInstagram";
import { cn } from "@/shared/lib/utils";

/** Quebra o texto em pedaços, transformando URLs em link renderizado. */
const comLinks = (texto: string) =>
  texto.split(/(https?:\/\/[^\s]+)/g).map((pedaco, i) =>
    /^https?:\/\//.test(pedaco) ? (
      <span key={i} className="text-[#3897f0] underline decoration-[#3897f0]/40">
        {pedaco}
      </span>
    ) : (
      <span key={i}>{pedaco}</span>
    ),
  );

const Celular = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto w-full max-w-[300px] overflow-hidden rounded-[28px] border-[6px] border-zinc-800 bg-zinc-950 shadow-xl">
    <div className="flex h-6 items-center justify-center bg-zinc-800">
      <span className="h-1 w-16 rounded-full bg-zinc-700" />
    </div>
    <div className="min-h-[340px] p-3">{children}</div>
  </div>
);

export const AutomacaoPreview = ({
  thumbnailUrl,
  palavraExemplo,
  respostaPublica,
  dmTexto,
  dmLink,
  dmBotaoTexto,
  usuario,
}: {
  thumbnailUrl?: string | null;
  palavraExemplo: string;
  respostaPublica?: string | null;
  dmTexto: string;
  /** Link do botão. Sem ele o direct sai como texto puro, igual antes. */
  dmLink?: string | null;
  dmBotaoTexto?: string | null;
  usuario?: string | null;
}) => {
  const [aba, setAba] = useState("comentario");

  return (
    <div className="space-y-3">
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="w-full">
          <TabsTrigger value="comentario" className="flex-1">
            Comentário
          </TabsTrigger>
          <TabsTrigger value="direct" className="flex-1">
            Direct
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Celular>
        {aba === "comentario" ? (
          <div className="space-y-3">
            <MiniaturaInstagram
              url={thumbnailUrl}
              className="h-36 w-full bg-zinc-900"
              iconeClassName="h-7 w-7 text-zinc-700"
            />
            <div className="flex items-center gap-3 text-zinc-500">
              <Heart className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
              <Send className="h-4 w-4" />
            </div>

            <div className="space-y-2 text-[11px] leading-snug">
              <div className="flex gap-2">
                <span className="h-6 w-6 flex-shrink-0 rounded-full bg-zinc-800" />
                <p className="min-w-0">
                  <span className="font-semibold text-zinc-200">maria.silva</span>{" "}
                  <span className="text-zinc-300">{palavraExemplo || "quero"}</span>
                </p>
              </div>
              {respostaPublica ? (
                <div className="ml-8 flex gap-2">
                  <span className="h-5 w-5 flex-shrink-0 rounded-full bg-pink-500/30" />
                  <p className="min-w-0">
                    <span className="font-semibold text-zinc-200">
                      {usuario ? `${usuario}` : "sua conta"}
                    </span>{" "}
                    <span className="text-zinc-300">{respostaPublica}</span>
                  </p>
                </div>
              ) : (
                <p className="ml-8 text-[10px] italic text-zinc-600">
                  Resposta pública desligada — nada aparece embaixo do comentário.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <span className="h-7 w-7 rounded-full bg-zinc-800" />
              <span className="text-xs font-semibold text-zinc-200">maria.silva</span>
            </div>
            <div
              className={cn(
                "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#3797f0] px-3 py-2",
                "text-[11px] leading-snug text-white",
              )}
            >
              {dmTexto ? (
                <span className="whitespace-pre-wrap break-words">{comLinks(dmTexto)}</span>
              ) : (
                <span className="italic opacity-70">Escreva a mensagem do direct…</span>
              )}

              {/* Template `button` da Meta: o link vira botão embaixo do texto,
                  dentro da mesma bolha. Só aparece com link E título — é a mesma
                  condição que o backend usa para montar o template. */}
              {dmLink && dmBotaoTexto ? (
                <span className="mt-2 block border-t border-white/25 pt-1.5 text-center text-[11px] font-semibold">
                  {dmBotaoTexto}
                </span>
              ) : null}
            </div>
            <p className="pt-1 text-center text-[10px] text-zinc-600">
              Se a pessoa não te segue, isso cai na pasta Solicitações.
            </p>
          </div>
        )}
      </Celular>
    </div>
  );
};

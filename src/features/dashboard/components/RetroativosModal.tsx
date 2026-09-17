import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";

import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { enviarRetroativos, getRetroativosPrevia } from "@/services/instagram.service";
import type { InstagramAutomation, RetroativoPrevia } from "@/shared/types/instagram";

const formatarPrazo = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Direct para quem comentou na publicação e não recebeu.
 *
 * A prévia vem antes do envio de propósito: a aluna vê por que cada grupo ficou
 * de fora — em especial os de mais de 7 dias, que a Meta não deixa mais
 * responder por direct. Sem isso, "enviei 12 de 50" pareceria defeito.
 */
export const RetroativosModal = ({
  automacao,
  onFechar,
}: {
  /** `null` = modal fechado. */
  automacao: InstagramAutomation | null;
  onFechar: () => void;
}) => {
  const { toast } = useToast();
  const [previa, setPrevia] = useState<RetroativoPrevia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!automacao) return;
    let cancelado = false;
    setPrevia(null);
    setErro(null);
    getRetroativosPrevia(automacao.id)
      .then((p) => !cancelado && setPrevia(p))
      .catch((e: Error) => !cancelado && setErro(e.message));
    return () => {
      cancelado = true;
    };
  }, [automacao]);

  const enviar = async () => {
    if (!automacao) return;
    setEnviando(true);
    try {
      const { enfileirados } = await enviarRetroativos(automacao.id);
      toast({
        title:
          enfileirados === 1 ? "1 direct na fila" : `${enfileirados} directs na fila`,
        description: "Eles saem aos poucos, alguns segundos entre um e outro.",
      });
      onFechar();
    } catch (e) {
      toast({
        title: "Não foi possível enviar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  const ativa = automacao?.status === "ativa";
  const linhas: [string, number][] = previa
    ? ([
        ["Já receberam o direct", previa.ja_respondidos],
        ["A mesma pessoa já recebeu", previa.pessoa_ja_recebeu],
        ["Sem a palavra-chave", previa.sem_palavra],
        ["Mais de 7 dias — a Meta não permite mais", previa.fora_da_janela],
        ["Já analisados antes", previa.ja_processados],
        ["Do seu próprio perfil", previa.da_propria_conta],
      ] as [string, number][]).filter(([, n]) => n > 0)
    : [];

  return (
    <ResponsiveModal
      open={!!automacao}
      onOpenChange={(v) => !v && !enviando && onFechar()}
      title="Enviar para quem já comentou"
      description={automacao?.nome}
    >
      <div className="space-y-5">
        {erro ? (
          <p className="text-sm text-destructive">{erro}</p>
        ) : !previa ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo os comentários da publicação…
          </p>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-3xl font-semibold tabular-nums text-foreground">
                {previa.elegiveis}
              </p>
              <p className="text-sm text-muted-foreground">
                de {previa.total_comentarios}{" "}
                {previa.total_comentarios === 1 ? "comentário pode" : "comentários podem"} receber o
                direct agora
              </p>
              {previa.primeiro_expira_em && (
                <p className="mt-2 text-xs text-amber-500">
                  O mais antigo deixa de poder receber em{" "}
                  {formatarPrazo(previa.primeiro_expira_em)}
                </p>
              )}
            </div>

            {linhas.length > 0 && (
              <ul className="divide-y divide-border text-sm">
                {linhas.map(([rotulo, n]) => (
                  <li key={rotulo} className="flex items-center justify-between gap-4 py-2">
                    <span className="text-muted-foreground">{rotulo}</span>
                    <span className="tabular-nums text-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            )}

            {previa.truncado && (
              <p className="text-xs text-muted-foreground">
                A publicação tem mais comentários do que analisamos de uma vez.
              </p>
            )}

            {!ativa && previa.elegiveis > 0 && (
              <p className="text-xs text-amber-500">Ative a automação para enviar.</p>
            )}
          </>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onFechar} disabled={enviando}>
            Fechar
          </Button>
          <Button
            onClick={() => void enviar()}
            disabled={!previa || previa.elegiveis === 0 || !ativa || enviando}
          >
            {enviando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {previa && previa.elegiveis > 0
              ? `Enviar ${previa.elegiveis} ${previa.elegiveis === 1 ? "direct" : "directs"}`
              : "Enviar"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
};

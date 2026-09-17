import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy,
  Instagram,
  Layers,
  Loader2,
  MessageCircle,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { MiniaturaInstagram } from "@/features/dashboard/components/MiniaturaInstagram";
import { RetroativosModal } from "@/features/dashboard/components/RetroativosModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  deleteAutomation,
  duplicateAutomation,
  listAutomations,
  setAutomationStatus,
} from "@/services/instagram.service";
import { cn } from "@/shared/lib/utils";
import type { InstagramAutomation } from "@/shared/types/instagram";
import { useInstagramConnectionStore } from "@/stores/instagramConnectionStore";

// O escopo `proximo` saiu na Rodada 1 de ajustes. O uso já cai no próprio valor
// quando a chave não existe, então automação legada (não há nenhuma) mostraria
// "proximo" cru em vez de rótulo vazio.
const ROTULO_ESCOPO: Record<string, string> = {
  post_especifico: "Uma publicação",
  qualquer: "Qualquer publicação",
  story_especifico: "Um story",
  story_qualquer: "Qualquer story",
};

const AutomacaoCard = ({
  automacao,
  onToggle,
  onDuplicar,
  onExcluir,
  onRetroativos,
  ocupado,
  recebendoComentarios,
}: {
  automacao: InstagramAutomation;
  onToggle: (ativa: boolean) => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onRetroativos: () => void;
  ocupado: boolean;
  /** A conta está inscrita no webhook? Se não, ativar seria mentira. */
  recebendoComentarios: boolean;
}) => {
  const ativa = automacao.status === "ativa";
  const rascunho = automacao.status === "rascunho";
  const palavras = automacao.trigger_tipo === "qualquer" ? ["qualquer palavra"] : automacao.palavras;
  // Retroativo lê os comentários de UM post — "qualquer publicação" e story não
  // têm um post para ler.
  const aceitaRetroativo = automacao.escopo === "post_especifico" && !rascunho;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <MiniaturaInstagram
          url={automacao.media_thumbnail_url}
          className="h-16 w-16 flex-shrink-0"
          iconeClassName="h-6 w-6"
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/dashboard/automacoes/${automacao.id}`}
              className="truncate text-sm font-semibold text-foreground hover:underline"
            >
              {automacao.nome}
            </Link>
            {rascunho && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                Rascunho
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {ROTULO_ESCOPO[automacao.escopo] ?? automacao.escopo}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {palavras.slice(0, 6).map((p) => (
              <span
                key={p}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
              >
                {p}
              </span>
            ))}
            {palavras.length > 6 && (
              <span className="text-[11px] text-muted-foreground">
                +{palavras.length - 6}
              </span>
            )}
          </div>

          <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            {/* Conta só quem casou com a automação — sem a palavra, nem entra. Com
                "capturados" a aluna lia como o total do post e achava que faltava. */}
            <span>
              {automacao.comentarios_capturados}{" "}
              {automacao.trigger_tipo === "qualquer"
                ? "comentários capturados"
                : "comentários com a palavra-chave"}
            </span>
            <span>{automacao.directs_enviados} directs enviados</span>
          </p>
        </div>

        <div className="flex items-center gap-2 sm:flex-shrink-0">
          {/* Toggle direto, sem confirmação — é reversível. Ligar fica travado
              quando a conta não está recebendo comentários: automação "ativa" que
              não dispara é pior que automação pausada. Desligar sempre pode. */}
          <Switch
            checked={ativa}
            disabled={ocupado || (!ativa && !recebendoComentarios)}
            onCheckedChange={onToggle}
            aria-label={ativa ? "Pausar automação" : "Ativar automação"}
          />
          {/* Vale também para automação JÁ ATIVA: sem webhook ela não dispara,
              e dizer "Ativa" faz a aluna acreditar que está rodando. Achado na
              Rodada 1 de ajustes — a trava existia, mas o selo só aparecia em
              automação pausada. */}
          {!recebendoComentarios ? (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">
              Aguardando conexão
            </span>
          ) : (
            <span className={cn("text-xs", ativa ? "text-emerald-500" : "text-muted-foreground")}>
              {ativa ? "Ativa" : "Pausada"}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Mais ações" disabled={ocupado}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/dashboard/automacoes/${automacao.id}`}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Link>
              </DropdownMenuItem>
              {aceitaRetroativo && (
                <DropdownMenuItem onClick={onRetroativos}>
                  <Send className="mr-2 h-4 w-4" /> Enviar para quem já comentou
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDuplicar}>
                <Copy className="mr-2 h-4 w-4" /> Duplicar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExcluir} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
};

const Automacoes = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { connection, fetch: carregarConexao } = useInstagramConnectionStore();

  const [automacoes, setAutomacoes] = useState<InstagramAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [paraExcluir, setParaExcluir] = useState<InstagramAutomation | null>(null);
  const [retroativos, setRetroativos] = useState<InstagramAutomation | null>(null);

  const carregar = async () => {
    try {
      setAutomacoes(await listAutomations());
    } catch (e) {
      toast({
        title: "Erro ao carregar automações",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarConexao();
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alternar = async (automacao: InstagramAutomation, ativa: boolean) => {
    const anterior = automacoes;
    const novoStatus = ativa ? "ativa" : "pausada";
    setAutomacoes((atual) =>
      atual.map((a) => (a.id === automacao.id ? { ...a, status: novoStatus } : a)),
    );
    setOcupado(true);
    try {
      const atualizada = await setAutomationStatus(automacao.id, novoStatus);
      setAutomacoes((atual) => atual.map((a) => (a.id === atualizada.id ? atualizada : a)));
    } catch (e) {
      setAutomacoes(anterior); // rollback
      toast({
        title: ativa ? "Não foi possível ativar" : "Não foi possível pausar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setOcupado(false);
    }
  };

  const duplicar = async (automacao: InstagramAutomation) => {
    setOcupado(true);
    try {
      const copia = await duplicateAutomation(automacao.id);
      setAutomacoes((atual) => [copia, ...atual]);
      toast({
        title: "Automação duplicada",
        description: "A cópia entrou pausada — revise e ative quando quiser.",
      });
    } catch (e) {
      toast({
        title: "Erro ao duplicar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setOcupado(false);
    }
  };

  const excluir = async () => {
    if (!paraExcluir) return;
    setOcupado(true);
    try {
      await deleteAutomation(paraExcluir.id);
      setAutomacoes((atual) => atual.filter((a) => a.id !== paraExcluir.id));
      toast({ title: "Automação excluída" });
    } catch (e) {
      toast({
        title: "Erro ao excluir",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setOcupado(false);
      setParaExcluir(null);
    }
  };

  const semConexao = !connection || connection.status !== "ativo";
  // Conectado não basta: a conta precisa estar inscrita no webhook, senão o
  // Instagram nunca nos avisa dos comentários e a automação fica muda.
  const recebendoComentarios = !semConexao && !!connection?.webhook_subscrito;

  return (
    <DashboardLayout title="Automação Instagram">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* Uma automação cobre UM post, e conta de promoção publica todo dia.
              Sem este caminho, cobrir o acervo é inviável na mão. */}
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard/automacoes/em-lote")}
            disabled={semConexao}
          >
            <Layers className="mr-2 h-4 w-4" /> Cobrir publicações
          </Button>
          <Button
            onClick={() => navigate("/dashboard/automacoes/nova")}
            disabled={semConexao}
            className="shadow-[0_0_20px_rgba(49,140,233,0.35)]"
          >
            <Plus className="mr-2 h-4 w-4" /> Nova Automação
          </Button>
        </div>

        {!semConexao && !recebendoComentarios && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                <strong className="text-amber-400">
                  Ainda não estamos recebendo os comentários deste perfil.
                </strong>{" "}
                Nenhuma automação vai disparar até isso ser resolvido — por isso o botão
                de ativar está travado.
              </p>
              <Button asChild variant="outline">
                <Link to="/dashboard/configuracoes?tab=instagram">Resolver</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {semConexao && (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
              <Instagram className="h-5 w-5 flex-shrink-0 text-pink-500" />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {connection
                  ? "Sua conexão com o Instagram não está ativa — as automações ficam pausadas até você reconectar."
                  : "Conecte seu Instagram para criar automações de comentário → direct."}
              </p>
              <Button asChild variant={connection ? "default" : "default"}>
                <Link to="/dashboard/configuracoes?tab=instagram">
                  {connection ? "Reconectar" : "Conectar Instagram"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : automacoes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-500/10">
                <MessageCircle className="h-6 w-6 text-pink-500" />
              </span>
              <p className="text-sm font-medium text-foreground">Nenhuma automação ainda</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Crie uma automação para responder no comentário e mandar o link no direct
                automaticamente.
              </p>
              <Button onClick={() => navigate("/dashboard/automacoes/nova")} disabled={semConexao}>
                <Plus className="mr-2 h-4 w-4" /> Nova Automação
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {automacoes.map((a) => (
              <AutomacaoCard
                key={a.id}
                automacao={a}
                ocupado={ocupado}
                recebendoComentarios={recebendoComentarios}
                onToggle={(ativa) => void alternar(a, ativa)}
                onDuplicar={() => void duplicar(a)}
                onExcluir={() => setParaExcluir(a)}
                onRetroativos={() => setRetroativos(a)}
              />
            ))}
          </div>
        )}

        {ocupado && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
          </p>
        )}
      </div>

      <RetroativosModal automacao={retroativos} onFechar={() => setRetroativos(null)} />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => !aberto && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{paraExcluir?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A automação e o histórico de envios dela serão removidos. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void excluir()}
              disabled={ocupado}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default Automacoes;

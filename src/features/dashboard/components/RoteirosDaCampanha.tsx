import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock, Copy, ListOrdered, Loader2, Pencil, Plus, Send, XCircle,
} from "lucide-react";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ResponsiveModal } from "@/components/shared/ResponsiveModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvioRapidoModal } from "@/components/whatsapp/EnvioRapidoModal";
import { useToast } from "@/hooks/use-toast";
import {
  cancelar as cancelarExecucao,
  criarRoteiro,
  duplicarRoteiro,
  listarRoteiros,
  type Roteiro,
  type StatusExecucao,
} from "@/services/roteiros.service";
import { cn } from "@/shared/lib/utils";

const rotuloPassos = (n: number) => (n === 1 ? "1 passo" : `${n} passos`);

/**
 * O chip reflete a EXECUÇÃO, não o campo `status` do roteiro.
 *
 * Antes ele dizia "Rascunho" mesmo depois de agendar e de a mensagem sair — e o
 * botão "Agendar" continuava na linha. Em 06/09 o mesmo roteiro foi agendado
 * três vezes em 16 segundos; se as mensagens não tivessem sido apagadas por
 * outro bug no mesmo minuto, cada grupo teria recebido tudo em triplicado.
 */
//  O `hover:bg-*` de cada linha é obrigatório: o `Badge` do shadcn traz
//  `hover:bg-primary/80` na variante default, e sem um `hover:bg-*` aqui o
//  tailwind-merge não tem o que substituir — o chip vira azul no hover.
const CHIP_DA_EXECUCAO: Record<StatusExecucao, { rotulo: string; classe: string }> = {
  agendada: {
    rotulo: "Agendado",
    classe: "border-sky-500/25 bg-sky-500/10 text-sky-500 hover:bg-sky-500/10",
  },
  enviando: {
    rotulo: "Enviando",
    classe: "border-primary/25 bg-primary/10 text-primary hover:bg-primary/10",
  },
  pausada: {
    rotulo: "Pausado",
    classe: "border-amber-500/25 bg-amber-500/10 text-amber-500 hover:bg-amber-500/10",
  },
  concluida: {
    rotulo: "Concluído",
    classe: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10",
  },
  cancelada: {
    rotulo: "Cancelado",
    classe: "border-border bg-muted text-muted-foreground hover:bg-muted",
  },
  falhou: {
    rotulo: "Falhou",
    classe: "border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/10",
  },
};

/**
 * O estado do roteiro, derivado UMA vez — o chip e as ações precisam concordar.
 *
 * Antes cada um derivava por conta: o chip dizia "Concluído" e a linha ainda
 * oferecia "Agendar" em azul primário. Já rodou — agendar de novo não é a
 * próxima ação, e o botão mais pesado da linha estava oferecendo a coisa errada.
 */
type EstadoDoRoteiro =
  | "rascunho" | "agendado" | "enviando" | "pausado"
  | "concluido" | "concluido_com_falhas" | "falhou" | "cancelado";

const estadoDoRoteiro = (r: Roteiro): EstadoDoRoteiro => {
  const execucao = r.execucao_ativa ?? r.ultima_execucao;
  if (!execucao) return "rascunho";
  switch (execucao.status) {
    case "agendada": return "agendado";
    case "enviando": return "enviando";
    case "pausada": return "pausado";
    case "falhou": return "falhou";
    // Cancelar devolve o roteiro para rascunho — ela pode agendar de novo.
    case "cancelada": return "rascunho";
    case "concluida":
      return execucao.erros + execucao.pulados > 0
        ? "concluido_com_falhas" : "concluido";
  }
};

/** Estados em que o roteiro já rodou: só Duplicar. Refazer é duplicar. */
const ENCERRADOS: EstadoDoRoteiro[] = ["concluido", "concluido_com_falhas", "falhou"];

const CHIP_DO_ESTADO: Record<EstadoDoRoteiro, { rotulo: string; classe: string }> = {
  rascunho: { rotulo: "Rascunho", classe: "border-border bg-muted text-muted-foreground hover:bg-muted" },
  agendado: CHIP_DA_EXECUCAO.agendada,
  enviando: CHIP_DA_EXECUCAO.enviando,
  pausado: CHIP_DA_EXECUCAO.pausada,
  concluido: CHIP_DA_EXECUCAO.concluida,
  concluido_com_falhas: {
    rotulo: "Concluído com falhas",
    classe: "border-orange-500/25 bg-orange-500/10 text-orange-500 hover:bg-orange-500/10",
  },
  falhou: CHIP_DA_EXECUCAO.falhou,
  cancelado: CHIP_DA_EXECUCAO.cancelada,
};

const StatusRoteiroBadge = ({ estado }: { estado: EstadoDoRoteiro }) => {
  const chip = CHIP_DO_ESTADO[estado];
  return <Badge className={cn(chip.classe)}>{chip.rotulo}</Badge>;
};

/** Aba "Roteiros" da campanha: sequência de passos que a campanha dispara. */
export const RoteirosDaCampanha = ({
  campanhaId,
  gruposAbertos = [],
}: {
  campanhaId: number;
  /** Pré-seleção do envio rápido: os grupos abertos da campanha. */
  gruposAbertos?: number[];
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [paraCancelar, setParaCancelar] = useState<Roteiro | null>(null);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalEnvio, setModalEnvio] = useState(false);
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setRoteiros(await listarRoteiros(campanhaId));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [campanhaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrirEditor = (roteiroId: number, ajustarDatas = false) =>
    navigate(
      `/dashboard/grupos/${campanhaId}/roteiros/${roteiroId}` +
        (ajustarDatas ? "?datas=1" : ""),
    );

  const confirmarCriacao = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) return;
    setCriando(true);
    try {
      const criado = await criarRoteiro({ nome: nomeLimpo, campanha_id: campanhaId });
      setModalNovo(false);
      setNome("");
      abrirEditor(criado.id);
    } catch (e) {
      toast({
        title: "Não foi possível criar o roteiro",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setCriando(false);
    }
  };

  const duplicar = async (roteiro: Roteiro) => {
    setOcupado(true);
    try {
      const copia = await duplicarRoteiro(roteiro.id);
      setRoteiros((atual) => [copia, ...atual]);
      toast({
        title: "Roteiro duplicado",
        description: "Ajuste as datas antes de agendar.",
      });
      // Vai direto para o ROTEIRO, não para o modal de datas.
      //
      // Abrir "Ajustar datas" por cima de uma tela em branco mostrava uma linha
      // solta no meio do nada — num roteiro com um passo âncora e o resto
      // relativo, o modal tinha exatamente uma linha para exibir. No roteiro
      // ela ajusta no contexto, vendo a sequência inteira; "Ajustar datas"
      // continua no rodapé como atalho para quem tem 22 passos.
      abrirEditor(copia.id);
    } catch (e) {
      toast({
        title: "Não foi possível duplicar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setOcupado(false);
    }
  };

  const confirmarCancelamento = async () => {
    if (!paraCancelar) return;
    const execucao = paraCancelar.execucao_ativa;
    if (!execucao) return;
    setOcupado(true);
    try {
      await cancelarExecucao(execucao.id);
      setParaCancelar(null);
      await carregar();
      toast({
        title: "Agendamento cancelado",
        description: "O roteiro voltou para rascunho.",
      });
    } catch (e) {
      toast({
        title: "Não foi possível cancelar",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4">
      {/*
        A barra aparece SEMPRE — inclusive sem nenhum roteiro. "Enviar oferta"
        veio da aba Grupos (§3.1) e é justamente o caminho de quem ainda não
        montou roteiro nenhum: escondê-lo no estado vazio tiraria a ação do
        lugar onde ela mais serve. "Novo roteiro" continua no estado vazio
        também, no card explicativo.
      */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setModalEnvio(true)}>
          <Send className="mr-2 h-4 w-4" /> Enviar oferta
        </Button>
        <Button onClick={() => setModalNovo(true)} disabled={carregando}>
          <Plus className="mr-2 h-4 w-4" /> Novo roteiro
        </Button>
      </div>

      {carregando ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : erro ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{erro}</p>
            <Button variant="outline" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : roteiros.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <ListOrdered className="h-6 w-6 text-primary" />
            </span>
            <p className="text-sm font-medium text-foreground">Nenhum roteiro ainda</p>
            <ol className="max-w-xs list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground">
              <li>Crie o roteiro e dê um nome.</li>
              <li>Monte os passos: hora, conteúdo e grupos.</li>
              <li>Escolha a data e agende.</li>
            </ol>
            <Button onClick={() => setModalNovo(true)}>
              <Plus className="mr-2 h-4 w-4" /> Novo roteiro
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {roteiros.map((r) => {
          const estado = estadoDoRoteiro(r);
          const encerrado = ENCERRADOS.includes(estado);
          // Agendado e pausado podem ser cancelados; enviando também (para o
          // que falta). Encerrado, não: já rodou.
          const cancelavel = ["agendado", "pausado", "enviando"].includes(estado)
            && r.execucao_ativa != null;
          return (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <ListOrdered className="h-5 w-5 text-primary" />
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => abrirEditor(r.id)}
                      className="min-w-0 max-w-full truncate text-sm font-semibold text-foreground hover:underline"
                    >
                      {r.nome}
                    </button>
                    <StatusRoteiroBadge estado={estado} />
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">{rotuloPassos(r.total_passos)}</span>
                    <span className="tabular-nums">
                      {new Date(r.criado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </p>
                </div>

                {/*
                  Cada estado oferece SÓ a ação que faz sentido nele:

                    Rascunho              Editar · Duplicar · Agendar
                    Agendado / Pausado    Editar · Duplicar · Cancelar
                    Enviando              Duplicar · Cancelar envio
                    Concluído / Falhou    Duplicar

                  Concluído e falhou não têm Editar: editar um roteiro que já
                  rodou faz a tela deixar de refletir o que foi realmente
                  enviado — ela muda o texto do passo 2 e passa a ver uma
                  mensagem que nunca saiu naquela execução. Abrir continua
                  funcionando, em leitura (o nome é clicável). Refazer é
                  duplicar: o registro da execução anterior fica intacto.
                */}
                <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                  {!encerrado && estado !== "enviando" && (
                    <Button variant="outline" size="sm" onClick={() => abrirEditor(r.id)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => void duplicar(r)}
                  >
                    <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
                  </Button>
                  {estado === "rascunho" && (
                    <Button size="sm" onClick={() => abrirEditor(r.id)}>
                      <CalendarClock className="mr-2 h-3.5 w-3.5" /> Agendar
                    </Button>
                  )}
                  {cancelavel && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={ocupado}
                      onClick={() => setParaCancelar(r)}
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <XCircle className="mr-2 h-3.5 w-3.5" />
                      {estado === "enviando" ? "Cancelar envio" : "Cancelar agendamento"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}

      {ocupado && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…
        </p>
      )}

      <ResponsiveModal
        open={modalNovo}
        onOpenChange={(o) => {
          setModalNovo(o);
          if (!o) setNome("");
        }}
        title="Novo roteiro"
      >
        <div className="space-y-4 pb-2">
          <div className="space-y-2">
            <Label htmlFor="nome-roteiro">Nome</Label>
            <Input
              id="nome-roteiro"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Terça de ofertas"
              maxLength={120}
              autoFocus
            />
          </div>
          <Button
            className="w-full"
            onClick={() => void confirmarCriacao()}
            disabled={criando || !nome.trim()}
          >
            {criando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar roteiro
          </Button>
        </div>
      </ResponsiveModal>

      {/*
        Confirmação porque é irreversível: cancelar TIRA da fila o que ainda
        não saiu. O que já chegou nos grupos fica — é o registro do que
        aconteceu, e apagá-lo faria a tela deixar de refletir a realidade.
      */}
      <AlertDialog
        open={paraCancelar !== null}
        onOpenChange={(aberto) => !aberto && setParaCancelar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens que ainda não saíram são removidas da fila e o
              roteiro volta para rascunho. O que já foi enviado continua no
              histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmarCancelamento()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EnvioRapidoModal
        open={modalEnvio}
        onOpenChange={setModalEnvio}
        campanhaId={campanhaId}
        gruposPreSelecionados={gruposAbertos}
      />
    </div>
  );
};

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buscarStatusInfra,
  type Ambiente,
  type Ponta,
  type Recurso,
  type StatusInfra,
} from "@/services/admin-infra.service";

/**
 * Painel de infraestrutura — Coolify, containers, VPS, pontas públicas e filas.
 *
 * A ordem dos blocos na tela é deliberada e inverte a intuição: **as pontas
 * públicas vêm primeiro**, antes do Coolify. Em 11/09/2026 o Coolify mostrava
 * `running:healthy` enquanto a API estava inalcançável há horas (o healthcheck
 * é por dentro do container e não vê rota de Traefik quebrada). Quem olhasse
 * primeiro o verde do Coolify concluiria que estava tudo bem — e foi mais ou
 * menos isso que aconteceu.
 *
 * Nada aqui aperta botão: o painel é só leitura. Restart e deploy continuam no
 * Coolify, com a autenticação do Coolify.
 */

const RECARGA_MS = 60_000;

const AMBIENTE_LABEL: Record<Ambiente, string> = {
  producao: "Produção",
  homologacao: "Homologação",
  compartilhado: "Compartilhado",
  desconhecido: "Não mapeado",
  local: "Local",
};

const AMBIENTE_CLASSE: Record<Ambiente, string> = {
  producao: "border-transparent bg-blue-500/15 text-blue-600",
  homologacao: "border-transparent bg-muted text-muted-foreground",
  compartilhado: "border-transparent bg-violet-500/15 text-violet-600",
  desconhecido: "border-transparent bg-amber-500/15 text-amber-600",
  local: "border-transparent bg-muted text-muted-foreground",
};

const hora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

function Selo({ ambiente }: { ambiente: Ambiente }) {
  return <Badge className={AMBIENTE_CLASSE[ambiente]}>{AMBIENTE_LABEL[ambiente]}</Badge>;
}

/** Linha rótulo/valor dos blocos de chave-valor. */
function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm">{valor ?? "—"}</p>
    </div>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="min-w-0">{texto}</p>
    </div>
  );
}

/**
 * Saúde de um container.
 *
 * `running:unknown` é **verde-claro, não amarelo**: é o estado normal de todo
 * worker Celery (container de pé, sem healthcheck configurado). Pintar isso de
 * alerta deixaria metade do painel amarelo todo dia — e painel que está sempre
 * amarelo é painel que ninguém mais lê.
 */
function StatusRecurso({ r }: { r: Recurso }) {
  if (r.estado !== "running") {
    return (
      <Badge className="border-transparent bg-destructive/15 text-destructive">
        {r.status ?? "desconhecido"}
      </Badge>
    );
  }
  if (r.saude === "healthy") {
    return <Badge className="border-transparent bg-emerald-500/15 text-emerald-600">No ar</Badge>;
  }
  if (r.saude === "unhealthy") {
    return (
      <Badge className="border-transparent bg-destructive/15 text-destructive">Sem saúde</Badge>
    );
  }
  return (
    <Badge className="border-transparent bg-emerald-500/10 text-emerald-700/80">
      No ar (sem healthcheck)
    </Badge>
  );
}

/**
 * A divergência entre o Coolify e a medição, dita em voz alta.
 *
 * É o motivo de o painel existir: em 11/09 o Coolify mostrou `running:healthy`
 * por horas com a API inalcançável. Repetir o verde dele sem confrontar com o
 * GET na URL pública teria atrasado o diagnóstico.
 */
function Contradicao({ texto }: { texto: string }) {
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{texto}</span>
    </p>
  );
}

function CartaoPonta({ p }: { p: Ponta }) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-lg border p-3 ${
        p.ok ? "border-border" : "border-destructive/40 bg-destructive/5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {p.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-destructive" />
          )}
          <span className="truncate text-sm font-medium">{p.rotulo}</span>
        </div>
        <Selo ambiente={p.ambiente} />
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{p.url}</p>
      <div className="mt-1 flex items-center gap-2 text-xs tabular-nums">
        <span className={p.ok ? "text-muted-foreground" : "text-destructive"}>
          {p.http ?? "sem resposta"}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{p.latencia_ms ?? "—"} ms</span>
      </div>
      <p className={`mt-1 text-xs ${p.ok ? "text-muted-foreground" : "text-destructive"}`}>
        {p.detalhe}
      </p>
      {/* App no ar com o Redis caído aceita o upload da afiliada e nunca
          processa (26/08). Só o /health mostra isso. */}
      {p.saude_interna && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Object.entries(p.saude_interna).map(([nome, estado]) => (
            <Badge
              key={nome}
              variant="outline"
              className={`text-[10px] font-normal ${
                estado === "connected" ? "" : "border-destructive/50 text-destructive"
              }`}
            >
              {nome}: {estado}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Uma linha de container no celular, onde a tabela não caberia. */
function CartaoRecurso({ r }: { r: Recurso }) {
  return (
    // `min-w-0` no cartão, não só nos filhos: item de grid tem
    // `min-width: auto`, então o nome cru do Coolify
    // (`cerely-qs8480sgosccoc8go8wsg84s`) é uma palavra sem ponto de quebra e
    // esticava o cartão para 456px num viewport de 390 — o `truncate` de
    // dentro não tinha largura de referência para truncar. A página inteira
    // rolava na horizontal por causa disso.
    <div className="min-w-0 overflow-hidden rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.rotulo}</p>
          <p className="truncate text-xs text-muted-foreground">{r.nome_coolify ?? r.uuid}</p>
        </div>
        <Selo ambiente={r.ambiente} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusRecurso r={r} />
        {r.limite_cpu && (
          <span className="text-xs text-muted-foreground">
            teto {r.limite_cpu} vCPU · {r.limite_memoria}
          </span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Campo label="Branch" valor={r.branch ?? "—"} />
        <Campo label="Reinícios" valor={r.reinicios ?? "—"} />
      </div>
      {r.contradicao && <Contradicao texto={r.contradicao} />}
    </div>
  );
}

export default function AdminInfra() {
  const [dados, setDados] = useState<StatusInfra | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef(false);

  const carregar = useCallback(async () => {
    // A resposta faz ~6 chamadas externas; duas em voo ao mesmo tempo só
    // dobram a carga no Coolify sem adiantar nada na tela.
    if (emVoo.current) return;
    emVoo.current = true;
    setCarregando(true);
    try {
      setDados(await buscarStatusInfra());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o status da infra.");
    } finally {
      emVoo.current = false;
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), RECARGA_MS);
    return () => clearInterval(t);
  }, [carregar]);

  const coolify = dados?.coolify;
  const servidor = coolify?.servidor;
  const hostinger = dados?.hostinger;
  const filas = dados?.filas;
  const pontasRuins = (dados?.pontas ?? []).filter((p) => !p.ok);
  const divergentes = (coolify?.recursos ?? []).filter((r) => r.contradicao);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Infraestrutura</h1>
          <p className="text-xs text-muted-foreground">
            Somente leitura — restart e deploy seguem no Coolify.
            {dados && ` Lido às ${hora(dados.gerado_em)}.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={carregando}>
          {carregando ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {erro && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      {/* Skeleton com a forma do conteúdo final (4 pontas + 2 blocos): a
          primeira carga faz ~6 chamadas externas e leva ~1s, e spinner solto
          nesse tempo não diz o que está vindo. */}
      {!dados && carregando && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      )}

      {dados && (
        <>
          {/* PRIMEIRO bloco de propósito — ver o comentário do topo. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Pontas públicas
                {pontasRuins.length > 0 && (
                  <Badge className="ml-2 border-transparent bg-destructive/15 text-destructive">
                    {pontasRuins.length} com problema
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                GET na URL que a usuária acessa. É o único bloco que pega container de pé com rota
                do Traefik quebrada — o modo de falha de 11/09. Verde aqui exige a nossa resposta
                no corpo, não só HTTP 200.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {dados.pontas.map((p) => (
                <CartaoPonta key={p.url} p={p} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Servidor (VPS)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Produção e homologação dividem este mesmo host — separar os dois foi adiado por
                custo.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {coolify?.erro && <Aviso texto={`Coolify não respondeu: ${coolify.erro}`} />}
              {coolify && !coolify.configurado && coolify.instrucao && (
                <Aviso texto={coolify.instrucao} />
              )}
              {servidor && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Campo label="Host" valor={servidor.nome} />
                  <Campo label="IP" valor={servidor.ip} />
                  <Campo
                    label="Proxy"
                    valor={
                      servidor.proxy_status === "running" ? (
                        <span className="text-emerald-600">
                          {servidor.proxy_tipo} {servidor.traefik_versao} no ar
                        </span>
                      ) : (
                        <span className="text-destructive">
                          {servidor.proxy_tipo ?? "proxy"} {servidor.proxy_status ?? "?"}
                        </span>
                      )
                    }
                  />
                  <Campo
                    label="Alcançável"
                    valor={servidor.alcancavel ? "sim" : servidor.alcancavel === false ? "NÃO" : "—"}
                  />
                  <Campo label="Coolify" valor={coolify?.versao} />
                  <Campo label="Builds simultâneos" valor={servidor.builds_simultaneos} />
                  <Campo label="Métricas (Sentinel)" valor={hora(servidor.sentinel_em)} />
                  <Campo
                    label="Aviso de disco"
                    valor={
                      servidor.disco_cheio_avisado ? (
                        <span className="text-destructive">disco cheio avisado</span>
                      ) : (
                        `alerta em ${servidor.alerta_disco_pct ?? "—"}%`
                      )
                    }
                  />
                </div>
              )}

              {/* CPU/RAM do host só existe pela API da Hostinger: a API do
                  Coolify não tem endpoint de métricas (404), e o Sentinel
                  alimenta apenas a UI dele. */}
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Hostinger
                </p>
                {hostinger?.erro && <Aviso texto={`API da Hostinger: ${hostinger.erro}`} />}
                {hostinger && !hostinger.configurado && hostinger.instrucao && (
                  <Aviso texto={hostinger.instrucao} />
                )}
                {hostinger?.vps && (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Campo label="Hostname" valor={hostinger.vps.hostname} />
                    <Campo label="Estado" valor={hostinger.vps.estado} />
                    <Campo label="vCPU" valor={hostinger.vps.vcpus} />
                    <Campo label="Plano" valor={hostinger.vps.plano} />
                    {hostinger.metricas?.cpu_usage && (
                      <Campo
                        label="CPU (agora / pico 1h)"
                        valor={`${hostinger.metricas.cpu_usage.atual} / ${hostinger.metricas.cpu_usage.pico}${
                          hostinger.metricas.cpu_usage.unidade === "percent" ? "%" : ""
                        }`}
                      />
                    )}
                    {hostinger.metricas?.ram_usage && (
                      <Campo
                        label="RAM (agora / pico 1h)"
                        valor={`${hostinger.metricas.ram_usage.atual} / ${hostinger.metricas.ram_usage.pico}`}
                      />
                    )}
                    {hostinger.metricas?.disk_space && (
                      <Campo label="Disco" valor={hostinger.metricas.disk_space.atual} />
                    )}
                    {hostinger.metricas?.formato_inesperado && (
                      <Campo label="Métricas" valor="formato não reconhecido" />
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Containers
                {coolify?.recursos.length ? (
                  <Badge variant="outline" className="ml-2 font-normal tabular-nums">
                    {coolify.recursos.length}
                  </Badge>
                ) : null}
                {divergentes.length > 0 && (
                  <Badge className="ml-2 border-transparent bg-amber-500/15 text-amber-600">
                    {divergentes.length} divergindo da medição
                  </Badge>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Teto de CPU em branco significa sem limite. Os tetos de homologação existem para
                que um worker de hml não possa mais roubar a CPU de produção.
              </p>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Ambiente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Teto CPU / mem</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Reinícios</TableHead>
                      <TableHead>Atualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(coolify?.recursos ?? []).map((r) => (
                      <TableRow key={r.uuid ?? r.rotulo}>
                        <TableCell className="max-w-[320px]">
                          <p className="truncate font-medium">{r.rotulo}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.fqdn ?? r.nome_coolify}
                          </p>
                          {r.contradicao && <Contradicao texto={r.contradicao} />}
                        </TableCell>
                        <TableCell>
                          <Selo ambiente={r.ambiente} />
                        </TableCell>
                        <TableCell>
                          <StatusRecurso r={r} />
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {r.limite_cpu ? `${r.limite_cpu} / ${r.limite_memoria}` : "sem teto"}
                        </TableCell>
                        <TableCell className="text-sm">{r.branch ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {r.reinicios ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {hora(r.atualizado_em)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-3 md:hidden">
                {(coolify?.recursos ?? []).map((r) => (
                  <CartaoRecurso key={r.uuid ?? r.rotulo} r={r} />
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Deploy agora</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Cinco builds ao mesmo tempo foram o gatilho do apagão de 11/09. O CI serializa
                  por fora; esta lista mostra o que o Coolify está construindo neste instante.
                </p>
              </CardHeader>
              <CardContent>
                {coolify?.fila_de_deploy.length ? (
                  <ul className="space-y-2">
                    {coolify.fila_de_deploy.map((d, i) => (
                      <li key={`${d.aplicacao}-${i}`} className="flex items-center gap-2 text-sm">
                        <Badge className="border-transparent bg-blue-500/15 text-blue-600">
                          {d.status}
                        </Badge>
                        <span className="truncate">{d.aplicacao}</span>
                        {d.commit && (
                          <span className="font-mono text-xs text-muted-foreground">
                            {d.commit}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum deploy em andamento.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filas do Celery</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Lidas do Redis. Os dois ambientes dividem a mesma instância, e é por isso que o
                  nome da fila carrega a ref do banco. Número grande e parado é task aceita que
                  nunca vai executar.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {filas?.erro && <Aviso texto={`Redis: ${filas.erro}`} />}
                {filas && !filas.configurado && <Aviso texto="REDIS_URL não configurada." />}
                {filas?.ping_ms !== null && filas?.ping_ms !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    ping {filas.ping_ms} ms · esta API é{" "}
                    {AMBIENTE_LABEL[filas.ambiente_desta_api] ?? filas.ambiente_desta_api}
                  </p>
                )}
                {filas?.filas.length ? (
                  <ul className="space-y-1">
                    {filas.filas.map((f) => (
                      <li key={f.nome} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-mono text-xs">{f.nome}</span>
                        <span
                          className={`tabular-nums ${
                            f.tamanho > 0 ? "font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {f.tamanho}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !filas?.erro && (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma fila com item — o estado normal.
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

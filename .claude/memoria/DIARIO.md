# Diário — MarketDash Frontend

> **Append-only. Entrada nova no topo.** Nunca reescreva entrada antiga — se
> estava errada, escreva uma nova dizendo que estava errada e por quê.
>
> Formato: `## AAAA-MM-DD — título curto` · o que mudou · **por quê** · o que
> ficou pendente. O "por quê" é a parte que o `git log` não dá.
>
> Mudança visível ao usuário também entra no `CHANGELOG.md` da raiz. Aqui vai
> o raciocínio; lá, o fato.

---

## 2026-09-15b — O painel estreou mostrando um problema real

**O que mudou.** Bloco da Hostinger na tela: CPU, memória, disco e uptime do
VPS (agora, pico e média de 12 h), as últimas ações da Hostinger em chips, e um
alerta vermelho quando existe `ct_set_limits` nas últimas 24 h.

**Por quê o alerta é vermelho e não mais um campo.** A limitação de CPU da
Hostinger **não se desfaz sozinha**: alguém precisa remover no painel deles. Um
número a mais numa grade de oito campos não faz ninguém agir; uma faixa
vermelha com a explicação, faz.

**Formatação é parte do dado.** A API devolve `4855083008` e `283459` —
mostrar o número cru seria tecnicamente correto e inútil. Vira `4.5 GB` e
`3d 6h`, e CPU ≥ 80% fica em vermelho com o pico ao lado, porque é o pico que
conta a história (de ~9% para 100% em uma hora).

**A estreia valeu.** Na primeira carga com dado real o painel mostrou CPU a
93%, pico 100% e duas limitações aplicadas pela Hostinger hoje — exatamente o
tipo de coisa que antes só aparecia quando uma aluna reclamava do login.

---

## 2026-09-15 — Admin › Infraestrutura, e o `min-w-0` que faltava no cartão

**O que mudou.** Aba nova no `AdminLayout` e página
`features/admin/pages/AdminInfra.tsx` consumindo `GET /admin/infra`. Cinco
blocos; tabela no desktop, cartões no celular. Recarrega sozinha a cada 60 s,
com guarda contra duas chamadas em voo (a resposta faz ~6 chamadas externas).

**Por quê a ordem dos blocos é essa.** "Pontas públicas" vem **antes** do
Coolify, contra a intuição. Em 11/09 o Coolify mostrou `running:healthy` com a
API inalcançável há horas; quem olhasse o verde dele primeiro concluiria que
estava tudo bem. O primeiro bloco da tela tem de ser o `GET` na URL que a
aluna acessa.

**O defeito que só a tela mostrou.** O cartão de container esticava a página
para **456 px** num viewport de 390 — rolagem horizontal na página inteira,
que é justamente o que `mobile-first.md` proíbe. A causa não é o `truncate`
faltando (ele estava lá): **item de grid tem `min-width: auto`**, e o nome cru
do Coolify (`cerely-qs8480sgosccoc8go8wsg84s`) é uma palavra sem ponto de
quebra, então o cartão crescia e o `truncate` de dentro não tinha largura de
referência. `min-w-0` no **cartão** (não só nos filhos) resolveu: 390 px.

**Verde e vermelho calibrados.** `running:unknown` é o estado normal de todo
worker Celery (container de pé, sem healthcheck) e sai como verde-claro "No ar
(sem healthcheck)". Pintar de amarelo deixaria 5 das 10 linhas amarelas todo
dia — e painel sempre amarelo é painel que ninguém lê.

**Validação.** Playwright nos dois tamanhos, conferindo linha a linha: as 10
linhas da tabela contra os 10 recursos da API (rótulo, status e teto de CPU),
as 4 pontas com latência, e a fila do Celery contra o `LLEN` do Redis. A
divergência (que hoje não está acontecendo) foi exercitada adulterando a
resposta real no caminho, para ver o aviso âmbar e o selo de contagem no DOM.

**Pendente.** Nada do lado do frontend. O bloco da Hostinger só preenche
quando o backend tiver `HOSTINGER_API_TOKEN`; até lá a tela mostra a
instrução.

---

## 2026-09-08 — O tradutor do navegador matava o React; Meus Links vira lista

**O que mudou.** `index.html` passa a declarar `lang="pt-BR"` + `translate="no"`
+ `class="notranslate"` + `meta name="google" content="notranslate"`, e ganha um
guard inline no `head`, antes do bundle, que torna `removeChild`/`insertBefore`
tolerantes a nó já movido. `main.tsx` reforça as declarações em runtime.
`CustomLinks.tsx` troca o grid de cards por lista com busca, ordenação, chips de
filtro, contador, estado vazio e paginação de 25.

**Por quê (tradução).** O sintoma que chegou foi "tela preta e volta pro login",
que parece bug de sessão. Não é: o `lang="en"` fazia o Chrome oferecer tradução;
o tradutor substitui os nós de texto por elementos `font`; o React ainda aponta
para os nós antigos e chama `removeChild` num nó que já não é filho daquele pai.
`NotFoundError`. **Sem ErrorBoundary no projeto, o throw leva a árvore inteira** —
por isso some até a sidebar, e por isso parece "deslogou".

As três camadas não são redundância: `notranslate` só vale para o tradutor
nativo do Chrome. Extensão de tradução, webview do Instagram/Facebook e o
"traduzir" do Android ignoram a declaração e mexem no DOM do mesmo jeito — só o
guard cobre esses. É o caso mais provável no público real, que chega por link de
Instagram.

**A prova.** Fiz o experimento de controle, porque "não quebrou" sozinho não
distingue fix de sorte: com o guard ativo, substituir 137 nós de texto por
`font` e forçar re-render deixa a tela intacta (8 linhas → 8, zero erro); com o
guard desfeito (métodos nativos restaurados de um iframe), a mesma simulação
produz quatro `NotFoundError` e `#root` vazio. A tela preta reproduzida em
laboratório.

**Armadilha nova, e cara.** Comentário no `index.html` **não pode** conter nome
de tag entre `<` e `>`. O Vite injeta os scripts procurando a abertura de `head`
por texto: minha primeira versão do comentário explicava o bug citando `<head>`,
e os scripts do dev server foram parar **dentro** do comentário — HMR morto, em
silêncio, e o build de produção passando normal. Só apareceu porque fui olhar o
HTML servido pelo dev server. Está anotado no topo do próprio arquivo.

**Por quê (lista).** O MAX liberou links ilimitados; card não escala. O ganho é
medido, não estimado: linha de 61 px contra ~200 px do card.

**O erro que a validação visual pegou.** Eu tinha posto o switch de layout em
`sm:` (640 px). No tablet a viewport passa de 640, mas a **sidebar aberta come
~300 px** — sobram ~500 px de container, as colunas fixas não cabem e o bloco de
identidade era espremido a quase zero, com o nome vazando por cima dos números.
`tsc` e `eslint` verdes; só o screenshot mostrou. Lição repetida: **o breakpoint
tem que corresponder ao container, não à viewport** — em página com sidebar,
`lg:` é o primeiro ponto seguro para layout de colunas.

**Validação com backend real (mesmo dia, depois).** O Docker **nunca esteve
fora** — o `docker` não está no PATH do shell do agente, `command not found`
volta 127 e eu li isso como "engine parada". O `marketdash_app` estava saudável
na :8000 havia 2 dias. Com o Vite subido em `:5174` usando as envs de hml por
fora (receita do `reference_admin_login_playwright`), o login real passou e a
tela renderizou com dado do banco: 200 em `/links` e `/links/1/insight`,
paginação, busca, chips e o modal de insight OK nos 3 tamanhos.

E a simulação do tradutor, agora no app real logado, fechou o caso: **com** o
guard, `#root` com 3 filhos e 327 caracteres de texto, zero erro; **sem** o
guard, `#root` com **0 filhos e 0 caracteres** — a sidebar desaparece junto e o
screenshot é uma tela preta lisa. É literalmente o print da Anne.

**Pendente.** (1) Ações em massa (checkbox por linha) ficaram fora — a linha já
tem o lugar reservado, com comentário. (2) A conta de hml só tem **1 link**: o
comportamento com muitas linhas está coberto pela passada mockada de 30 itens em
7 larguras, não por dado real. (3) O projeto continua sem ErrorBoundary — o
guard trata *esta* causa, não a classe do problema.

---

## 2026-09-05b — Medição de grupos: um bug meu de ontem, com cara de bug do sync

Frontend do terceiro documento delta. Backend: `97f7f5d`.

### O relato apontava para o sync; a culpa era de um `if` desta tela

Luiz marcou dois grupos como "Cheio = Sim" e, depois de uma sincronização, eles
voltaram para "Não". Diagnóstico natural: o sync sobrescreve o override.

Não sobrescreve — ele nunca tocou em `cheio_override`. **Quem apagava era o
clique.** `definirCheio` limpava o override quando o valor escolhido coincidia
com o automático (uma decisão que eu mesmo tomei ontem, para o campo não ficar
pegajoso). Marcar "Sim" num grupo **já cheio pela ocupação** gravava `null`: a
assinatura não mudava, "Salvar ordem" nem acendia, nenhum PUT saía. Depois o
sync baixava a contagem e o grupo aparecia "Não".

Da tela é indistinguível de "o sync apagou" — e é por isso que o relato veio
assim. A correção não é desfazer a de ontem (o problema dela era real: grupo que
esvazia e nunca volta à rotação), é o **terceiro estado explícito**:
Automático / Sim / Não. Nada mais limpa o override sozinho, e "Automático" é a
porta de volta. O Select passa a mostrar a **intenção**; o resultado continua na
coluna Ocupação, que é onde ele sempre esteve.

Junto: ocupação em laranja só a partir de 90%. Antes a cor seguia `cheio`, então
767/900 já aparecia alaranjado — alerta em situação normal.

### Dois nomes para a mesma coisa, e ela ia acreditar no menor

"Leads 1.348 · CPL R$0,97" ao lado de "Entradas 53 · Custo por entrada R$24,64",
sem nada dizendo que não eram a mesma métrica. O pixel dispara no carregamento
da página do `/g/`, **antes** do redirect: é clique qualificado, não entrada.
Renomeados para "Cliques no link" e "Custo por clique".

Mesmo tipo de problema em "Custo por permanência R$32,64": vinha de 1.305,73 ÷
40, e o 40 não aparecia em lugar nenhum. Entrou a coluna **Ficaram** e o
denominador na nota dos dois cards de custo.

### O critério de "sem medição" que eu errei primeiro

Comecei por "o grupo tem `sub_id`?" — e todo grupo tem, ele nasce na ativação.
Com esse critério a tela mostrava R$0,00 onde devia mostrar "—". Só conta como
medição vínculo manual de Sub ID ou sub_id de grupo que **trouxe pedido de
verdade**.

### Atividade

Reescrita. Paginação de 50 com "Carregar mais" — rolagem infinita não serve
porque ela vai querer chegar num dia específico. Filtros de tipo e grupo **no
servidor**: sobre uma página de 50, filtrar no cliente daria "3 saídas" numa
campanha com 300.

"Saída · origem desconhecida" saiu: origem é de onde a pessoa veio ao entrar, e
o texto fazia parecer que perdemos informação que nunca existiu. E o topo diz a
data real em vez de "a partir de agora".

Um detalhe de layout que custou tempo: os chips de grupo se sobrepunham com nome
comprido mesmo com `truncate`. O `Button` do shadcn é flex — `truncate` nele não
corta o filho. Vai num `<span>` interno.

### Status: efeito antes de destaque

O documento pedia para promover o status a toggle no cabeçalho. Fiz o backend
primeiro: `pausada` era um select que não desligava nada. Promover a interruptor
de destaque um controle sem efeito seria pior que o select escondido. Duas
posições, não três — "arquivada" é destino, não estado de operação, e não pode
ficar a um clique de distância no cabeçalho.

### Pendências

- Migration 081 pendente em produção (junto com 074–080)
- O telefone na exportação depende de número conectado + sync em hml
- `CheckboxQuadrado` segue aplicado só ao módulo de grupos — 9 outros usos de
  Checkbox continuam redondos

---

## 2026-09-05 — O link errado na tela não era da tela

O que mudou aqui: uma linha de escopo no modal de Sub ID. O resto do dia foi
backend, mas o sintoma chegou pela tela e vale registrar de que lado ele estava.

**"A página do grupo continua não funcionando".** O print veio com 404 no
celular, e a tela de homologação mostrando o link de entrada como
`https://marketdash.com.br/g/8496c6c7` — domínio de **produção**. Nada disso é
do frontend: a URL vem montada do backend (`GET /campanhas-grupos/{id}/link`), e
lá o `FRONTEND_URL` estava apontando para produção em homologação.

Fica o hábito: link que a tela só **exibe** não se depura na tela. O primeiro
olhar é no valor que chegou da API, não no componente que o renderiza.

**A busca de Sub ID passou a ser de 30 dias**, e o modal diz isso agora. A
mudança é de desempenho (a query varria o histórico inteiro a cada abertura),
mas ela muda um número que a afiliada lê — sem o rótulo, ela vê a comissão do
sub_id cair e conclui que perdeu venda. Número que muda de escopo sem avisar
vira chamado.

---

## 2026-09-04b — Cinco "bugs" da tela que eram outra coisa

O que mudou: Configurações vira aba, Cheio×Aberto na aba Grupos, modal de
vincular Sub ID à campanha, Link de entrada em três blocos, e a tela de Anúncios
com variante para campanha vinculada a grupo. Acompanha a migration 080.

**Metade do documento não era bug — e valeu descobrir antes de mexer.** Cinco
itens reportados a partir de um teste real da tela não se confirmaram no código:

- **"Contador de grupos errado"** — as duas fontes do backend concordam. O "0
  grupos" vinha do `campanhasGruposStore`: `if (loaded && !force) return`, com o
  store sendo módulo-global do Zustand. `loaded` ficava `true` por toda a sessão
  do SPA, e a página de detalhe nunca escrevia de volta nele. É o mesmo defeito
  já catalogado em "cache stale entre devices", e a correção é a mesma — SWR,
  como o `adSpendsStore`.
- **"Modal com radio"** — já era `<Checkbox>` multi-select. O círculo é
  aritmética de token: `rounded-sm` resolve para `calc(var(--radius) - 4px)`, e
  com `--radius: 0.75rem` isso dá 8px numa caixa de **16px** — raio igual a
  metade do lado. O controle sempre funcionou; a borda é que mentia. E mente em
  todos os 15 usos de Checkbox do app, não só ali.
- **"Prévia é card verde flutuante"** — já era bolha de WhatsApp, com o papel de
  parede certo e o `rounded-br-sm` do rabinho. O que a fazia parecer um card era
  o contêiner: um `Card` do shadcn sozinho numa coluna sticky de 320px. Mover
  para dentro do bloco de Prévia resolveu; o desenho não mudou (só ganhou hora e
  os dois checks, que é o que faz o olho ler "mensagem").
- **"Bloqueio de remoção de número não implementado"** — implementado no backend
  desde a 079, com teste. O que faltava era o `catch` do `salvar()` reverter a
  seleção: depois do 409 a tela ficava com o checkbox desmarcado, "Alterações não
  salvas" aceso e "1 grupo nesta campanha" logo abaixo. Um estado que não existe
  em lugar nenhum, e que se lê exatamente como "o bloqueio não funcionou".
- **"`/g/{slug}` dá 404"** — funciona em homologação. Produção não tem o módulo,
  e o que ela devolve é HTTP **200** servindo o `index.html`: o nginx cai no SPA
  fallback e quem renderiza a tela de 404 é o catch-all do React. Importa para
  quem for verificar: `curl -I` mostra 200 e engana.

Duas dessas "correções" teriam introduzido regressão — reescrever o modal de
adicionar grupos mexeria no `Set` de seleção e nas duas regras de escopo já
resolvidas ali (§6.3 e §2.3), sem benefício nenhum.

**Por que a regra de "cheio" vem pronta do backend.** A tela tinha `tetoDoGrupo`,
uma cópia em JavaScript de `LEAST(capacidade, COALESCE(limite, capacidade))`. Ela
até estava certa, mas era a terceira cópia da mesma regra — e o defeito reportado
("linha amarela, grupo continua aberto") é exatamente o sintoma de a tela e o
roteador divergirem. `cheio` e `teto` passaram a vir calculados; o front não
recalcula lotação.

**O filtro não pode tocar o payload do PUT.** A aba Grupos ganhou
Todos/Cheios/Não cheios, e o `PUT /grupos` **substitui o conjunto inteiro**:
mandar a lista filtrada apagaria da campanha todos os grupos escondidos pelo
filtro. A lista visível carrega o índice real (`{v, i}`) e as setas de reordenar
ficam desabilitadas fora do "Todos" — mover uma linha para uma posição que ela
não está vendo é pior que não poder mover.

**Ação em lote é rascunho, não gravação.** Se ela gravasse na hora e as setas
continuassem sendo rascunho, a afiliada perderia a noção do que já foi salvo.
Tudo continua atrás do mesmo "Salvar ordem" — e `cheio_override` entrou na
`assinatura()`, senão a mudança não acende o botão e some sem aviso.

**Os toggles do pixel tinham que sair dos DOIS lados.** Só apagar da tela deixaria
linha antiga com `pixel_eventos.lead = false` continuando a apagar o evento em
silêncio — o oposto do pedido. O backend passou a ignorar a coluna.

**Um byte NUL literal** dentro de `assinatura()` (`].join("\0")`) fazia o `grep`
tratar `LinkDeEntradaDaCampanha.tsx` como binário e suprimir a saída sem erro
nenhum: quem investigasse o componente por grep o veria vazio. Trocado por
`\u0001`.

Pendente: o `CheckboxQuadrado` foi aplicado só ao módulo de grupos — os outros
usos de Checkbox do app continuam redondos.

---

## 2026-09-04 — O trigger do Coolify falhou de novo (3ª vez registrada)

O `deploy-homologation` do frontend buildou (`Test build` e `Check build
artifacts` verdes) e morreu em **`Trigger Coolify deployment`** com
`curl: (28) Connection timed out` — três tentativas de 60s seguidas, do runner
do GitHub para `31.97.22.173:8000`.

**O modo de falha é silencioso do jeito ruim:** o build passa, o artefato existe,
e hml continua servindo o bundle ANTIGO. Quem só olha "o CI ficou vermelho?"
pode concluir que foi problema de build e mexer no código — não foi.

**Correção:** `gh run rerun <id> --failed` resolveu na primeira. Não precisa de
token do Coolify nem de commit vazio; a intermitência é de rede runner→VPS e
passa sozinha (a memória do Coolify já registrava "2-4 reruns em 03/08").

**E o CI verde continua não provando deploy.** Depois do rerun, a confirmação é
por marcador do código novo servido pela URL real — no backend, um endpoint que
só existe agora no `/openapi.json`; no frontend, uma string do bundle. O status
do job só diz que o webhook foi aceito.

---

## 2026-09-04 — Campanha de grupos: Visão geral vira painel, e nasce a aba Números

O que mudou: `VisaoGeralDaCampanha`, `NumerosDaCampanha`,
`ConfiguracoesDaCampanha` e `ExportarLeadsModal` (novos); aba Grupos com
ocupação e menu de três pontinhos; aba Anúncios com chips de status, período,
gasto e paginação; ordem das abas trocada; Descrição fora da UI.

**Por que a Visão geral mudou de natureza.** Era a primeira tela da campanha e
não dizia nada sobre a campanha: um formulário com nome, descrição e toggles. A
afiliada não via o link que ela divulga, nem quantas pessoas entraram, nem se
ainda há grupo com vaga. A edição foi para um botão Configurações; a aba virou
leitura: link copiável, KPIs, ritmo (entradas × saídas) e estado dos grupos.

**`null` ≠ `0` também aqui.** Taxa de entrada sem clique e evasão sem entrada
mostram "—" com a nota do motivo. "0%" afirmaria "ninguém converteu", que é
outra coisa — mesma regra que `leads`/`cpl` já seguiam em Resultados.

**A taxa de entrada usa `entradas_do_link`, não `entradas`.** Misturar a entrada
orgânica no numerador dá taxa acima de 100% em campanha divulgada também fora do
link, e aí ela não confia mais em nenhum número da tela.

**`PresetKind` ganhou `"30d"`.** O gráfico precisa de 7/14/30 e o helper só tinha
7/14/mês. Fazer a conta na mão no componente reintroduziria o bug de fuso: entre
21h e 0h BRT o dia UTC já virou.

**Paginação saiu de `features/admin`.** `paginar`/`totalDePaginas`/`<Paginacao>`
foram para `components/shared/Paginacao.tsx` (com seletor 25/50/100); o
`AdminTableFooter` reexporta. Importar de `features/admin` dentro de
`features/dashboard` cruzaria fronteira de feature.

**Armadilha do `tsc`:** `npx tsc --noEmit` na raiz **não valida nada** —
`tsconfig.json` tem `"files": []`. O comando que checa de verdade é
`tsc -p tsconfig.app.json --noEmit` (25 erros pré-existentes são a baseline).

**Armadilha do ambiente local:** o `.env` do frontend aponta para o Supabase de
**produção** e o backend do docker valida contra **homologação** — todo request
tomava 401 no login local. Para validar via Playwright é preciso alinhar os dois
(e restaurar o `.env` depois).

---

## 2026-09-04 — A correção do dashboard em produção, medida lá

Nada de código: registro do resultado. O `8e4092f` entrou em `main` por
cherry-pick (sem merge da develop — ver o `CLAUDE.md` da raiz, "Branches e
deploy"), e a medição em produção, na conta com 67.139 linhas:

| | antes | depois |
|---|---|---|
| request de vendas | ~30 MB, sem filtro de data | **1,84 MB** com `start_date`/`end_date` |
| KPIs na tela | "coisa de minuto" (relato) | **3,7 s** |
| cache do período | nunca gravava (cota estourada) | **1.782 KB gravados** |

O cache gravando é o que muda a **segunda** visita — pinta na hora e revalida
atrás. Era a intenção do desenho original do `adSpendsStore` e nunca funcionou
nas contas grandes, porque o payload não cabia.

Conferido contra o banco: R$ 8.840,60 de comissão e 3.306 pedidos em 28/08–
03/09, igual ao SQL com as regras do KPI (fora UNPAID e cancelados).

Pendente: o merge futuro da develop reconflita em `datasetStore.ts`,
`clicksStore.ts`, `Dashboard.tsx`, `Reports.tsx` e
`ShopeeIntegrationSettings.tsx` — manter o lado da develop.

## 2026-09-04 — O dashboard baixava a base inteira para mostrar 7 dias

O que mudou: `datasetStore` passou a mandar `start_date`/`end_date` para a API
(antes chamava `fetchDatasetRows({})`, sem período nenhum); cache do
`datasetStore` e do `clicksStore` agora é **por período**, não uma chave por
usuário; teto de linhas para gravar no localStorage; `onClear` do Dashboard e
do Relatórios rebusca; `ShopeeIntegrationSettings` invalida em vez de rebuscar
tudo.

**A medida, não a impressão** (conta do Luiz, produção): 67.631 linhas de
vendas = **~30 MB de JSON** por carregamento, para exibir as **3.882** dos
últimos 7 dias. No banco, a mesma consulta com o filtro de data cai de
**2.018 ms para 14 ms** — o índice `(user_id, date)` já existia, ninguém o
usava. Em homologação (52.372 linhas) a request sem período leva **8,7 s**
contra **2,3 s** de uma janela de 19 dias.

**O cache que ele pediu já existia — e falhava calado justamente em quem
precisava.** `dataset-cache:user_N` era gravado com `localStorage.setItem` de
um JSON de 30 MB: acima da cota de 5–10 MB por origem o `setItem` lança, o
`catch` engolia, e o cache **nunca** persistia para as contas grandes. Toda
carga era uma carga fria. Por isso a correção não é "cachear mais": é **pedir
menos**. O teto de 8.000 linhas existe para não repetir isso — acima dele nem
tenta (o `JSON.stringify` de 30 MB ainda travaria a thread antes de falhar).

**Cache por período resolve um bug junto.** A chave era só do usuário, então
trocar de "7 dias" para "mês atual" devolvia a fatia anterior enquanto a
revalidação não terminava — a tela mostrava um período dizendo outro.

**`onClear` precisou rebuscar.** "Limpar filtros" significa histórico inteiro;
como agora é a API que corta por data, sem rebuscar a tela diria "sem filtro"
exibindo só a fatia carregada. É a única ação que voltou a puxar tudo — e é o
que ela pede.

Validado com Playwright contra hml (`relacionamento@`, 52.372 linhas): 01/08–
19/08 rende **R$ 13.457,00 de comissão e 4.916 pedidos**, idêntico ao SQL
descontando UNPAID e cancelados; "limpar" volta a R$ 100.702,85 / 43.614; 390px
sem overflow.

Pendente: **Relatórios e Impostos continuam pedindo tudo** — o primeiro por
default de produto ("Todo período", 9,9 s em hml), o segundo porque monta a
lista de meses a partir do histórico. O fim da linha é agregar no backend (os
KPIs são calculados no cliente hoje), não baixar linha.

## 2026-09-04 — Configurações, rodada 2: Parâmetros ganha tela, o gate vira flag e a isca de autofill

O que mudou: quinta seção **Operação › Parâmetros** (o `EnvioSection` saiu de
dentro do WhatsApp); WhatsApp e `NumeroDetalhe` perderam as `Tabs` de uma aba
só; `TabelaDeGrupos` paginada com filtro Ativos/Todos; `ConectarNumeroModal`
com QR **ou** código de pareamento; `RequireModulo` + `moduloLiberado()` no
lugar de `isProductionHost()`; `SecaoCard` reapertado e adotado pelo card de
Marketplaces.

**Por que Parâmetros saiu do WhatsApp.** Janela de envio não é configuração de
canal — ela limita a operação inteira, inclusive campanha que ainda nem existe.
Como aba de WhatsApp, ficava invisível justamente para quem entra pelo módulo
de Campanhas e nunca abre a tela do chip. E a aba que sobrou ("Números",
sozinha) era moldura sem quadro; sai também, aqui e na página do número.

**Por que o gate deixou de ser hostname.** `isProductionHost()` é build-time:
liberar o módulo para uma conta de teste em produção pedia rebuild + redeploy,
e a spec pedia beta sem redeploy. A decisão foi para o backend, por conta, e a
env `MODULOS_BETA` virou a alavanca de produção. Duas consequências que valem
lembrar: o gate **fecha por padrão** (contexto carregando, backend antigo,
chave ausente → invisível — o default oposto abriria o módulo para a base
inteira por um typo no JSON), e as rotas do módulo **existem sempre**, porque
`{cond && <Route/>}` fazia link direto cair em 404 por uma fração de segundo
antes de a rota passar a existir. O preço aceito é o menu piscar uma vez por
carregamento de página.

**A isca de autofill.** A rodada de 03/09 achou que `autocomplete="off"` +
ids neutros resolviam o Chrome preenchendo o App ID da Shopee com o e-mail de
login. Não resolveram: o Chrome **ignora** `autocomplete="off"` quando decide
que o formulário é de login, e preenche o primeiro par usuário/senha que acha.
Só cedeu com nomes que não casam com heurística nenhuma
(`ref_publica`/`ref_secreta`) **mais** um par `username`/`password` invisível
abrindo o formulário para absorver o preenchimento.

**Desambiguar grupo homônimo é pelo JID, não pela data.** `criado_em` é a data
do primeiro sync — igual para grupos que entram juntos, que é exatamente o caso
(dois `#130 SALESDASH + VENDE-C`). E o fragmento só entra na linha **onde o
nome se repete**: em 493 grupos, sempre seria ruído.

**Densidade medida, não estimada.** O critério ("os 7 dias cabem sem scroll")
falhava por 57px em 1280×720. Foram quatro cortes somados — `py-1` na linha do
dia, `space-y-1` entre elas, `mb-2.5` no header do card e padding único
`p-3.5` (o `md:p-4` fazia mobile e desktop terem densidades diferentes). Fecha
em 720/720 e 768/768.

**O badge de sync atrasada achou a causa no mesmo dia.** Ele mostrou
"Sincronização parada há 14 dias" e o número não fechava: no banco, 19 contas
tinham `last_sync_at` cravado em 05/08 — os 24 jobs `shopee-sync-*` do pg_cron
estavam `active = false` desde então, **29 dias**. As duas contas com data
recente (entre elas a de teste) tinham rodado sync **manual**, e era isso que a
tela media. Produção foi religada em 04/09.

A lição é de leitura de tela, não de código: **`last_sync_at` da conta que você
usa para testar mede o seu próprio clique em "Sincronizar agora", não a
automação.** O badge continua valendo — ele foi o que fez alguém olhar — mas
quem responde "o cron vive?" é `sync_runs.trigger`.

---

## 2026-09-03 — Configurações: 4 seções, grupos com toggle e o upgrade de período que não abria

O que mudou: `Configuracoes.tsx` reescrito (4 seções, sem "Dispositivos" nem
"Canais"; WhatsApp virou integração com abas Números/Envio); `SecaoCard` como
régua única de densidade; grid de números + página nova
`/dashboard/configuracoes/numeros/:id`; `TabelaDeGrupos` com toggle Ativo;
modal de seleção de contas do Facebook com carga lazy; Instagram enxuto com
modal de passos; contador de uso na Assinatura; `PlanosPage` comparando plano +
periodicidade. Saíram `BlacklistSection`, `WhatsappResumoSettings`,
`GruposDoDispositivo` e `whatsapp.service.ts`.

**Isto reverte parte da entrada de 2026-08-31 ("um card por número, com os
grupos dentro") — e a razão é volume, não gosto.** Aquele desenho resolvia o
problema certo (cruzar duas listas com o dedo para saber o que um chip fazia),
mas assumia uma quantidade de grupos que não é a real: ao conectar o WhatsApp
pessoal, o sync traz *tudo* — 492 grupos no teste, dos quais talvez 6 são de
trabalho. Lista inline dentro do card, nesse volume, é inutilizável. O card
compacto passa a responder só "este chip está de pé?" e o detalhe do número
responde "o que ele faz". As duas armadilhas daquela entrada continuam
valendo e foram preservadas: o bucket **"Grupos sem dispositivo ativo"** (órfão
de soft-delete não pode sumir da tela) e o vínculo N:N. O que morreu foi o
marcador **"também em: X"** — junto com a coluna "Envio", ambas sempre vazias
para a usuária e sem significado que ela pudesse usar.

**Densidade em um arquivo, não em sete.** O pedido era "fonte e padding grandes
demais", e a armadilha óbvia era ajustar tela a tela e desalinhar as abas entre
si. Por isso `SecaoCard`: a régua é uma só, e o critério de aceite (os 7 dias
da semana cabendo em 1366×768 com o footer fixo) foi medido por screenshot, não
por impressão.

**O bug que mais custava dinheiro era de uma linha.** `isCurrent: id ===
currentPlan` ignorava a periodicidade: quem estava no Max Mensal via o card Max
desabilitado nas abas Trimestral e Anual e simplesmente não tinha como fazer
upgrade de período. Aconteceu com aluna real. Agora casa plano + período, e o
mesmo plano em outro período fica habilitado como "Mudar para trimestral".

**Duas coisas que a validação por screenshot pegou e o `tsc` não:** o rótulo do
dia cortado ("Don" em vez de "Dom" — o Switch comia o `w-16`), e a navegação
lateral travando em "Facebook Ads" para sempre depois do OAuth. Essa segunda é
sutil: o componente do Facebook limpa a URL com `history.replaceState`, que
**não avisa o React Router** — o `?code` continuava nos `searchParams` em
memória e tinha precedência sobre o `?tab`. Agora `tab` explícito vence.

Pendências: contas do Facebook selecionadas antes desta rodada não têm nome
gravado no backend e aparecem pelo id até a afiliada re-salvar a seleção no
modal. A página do número renderiza os 493 grupos de uma vez (~29k px de
altura) — funciona e tem busca, mas paginação/virtualização é o próximo passo
natural se o volume incomodar.

---

## 2026-09-02 — Rodada 9 (item 3): gráfico Novas × canceladas + labels de periodicidade

O que mudou: `trimLeadingNoMovement` corta os meses sem movimento do início
da série do gráfico Novas × canceladas (AdminDashboard.tsx) — clone
estrutural do `trimLeadingEmpty` que o MRR/Faturamento já usavam; o BarChart
ganhou `margin={CHART_MARGIN}`, que era o ÚNICO dos gráficos do admin sem
ele — por isso o label "31"/"32" da maior barra cortava no topo.
`translateFrequency` (admin-panel.service.ts) aprendeu "annually"/"quarter".

Por quê assim: a folga do label não foi resolvida com domain/YAxis custom
porque o codebase já tem a solução canônica (CHART_MARGIN, criado na Rodada 7
exatamente para label cortado) — faltava aplicar aqui. O corte de meses ficou
no frontend, e não no backend, porque é o mesmo padrão dos cards vizinhos e
não muda a API para outros consumidores. O "annually" cru vem do banco (o
recorder guarda o rótulo da Kiwify só lowercased); o backend normaliza o
cálculo, mas a coluna Periodicidade da tabela de clientes renderiza o valor
cru — sem a entrada nova o rótulo apareceria em inglês (caso real: João
Victor e Alice, as duas anuais "annually" de produção).

Pendente: nada. Validação visual feita com interceptação de rotas no
Playwright (supabase.co estava inalcançável da máquina — ver memória global).

---

## 2026-08-31 — Dispositivos: um card por número, com os grupos dentro

`NumerosSection.tsx` (555 linhas) misturava casca, lista de números, tabela de
grupos e quatro modais. Virou orquestrador; nasceram `DispositivoCard`,
`GruposDoDispositivo` e `GerenciarDispositivoModal`.

**A mudança de fundo não é visual.** Antes: uma lista de números e, embaixo,
uma tabela com os grupos de *todos* eles juntos, com uma coluna "Dispositivo"
que só dizia o nome. Para responder "o que este chip aqui está fazendo?", a
afiliada cruzava as duas listas com o dedo. Agora cada número carrega os
próprios grupos dentro de um bloco expansível.

**Três armadilhas que o layout tinha que resolver:**

1. **O mesmo grupo aparece em dois blocos** quando dois chips estão nele. Isso
   é o desenho (vínculo N:N, o motor faz failover entre eles), não bug — mas
   sem o marcador **"também em: X"** parece bug. Sinalizado só quando
   `instancia_ids.length > 1`.
2. **Grupo órfão sumiria da tela.** Remover número é soft-delete e o vínculo
   histórico fica no banco. Daí o bucket "Grupos sem dispositivo ativo" no
   fim — sem ele, remover um chip apagaria grupos da tela sem explicação.
3. **Os dois vazios pedem ações diferentes** (a lição de 26/08 registrada no
   DIARIO do backend): *conectado e sem grupos* → "use Sincronizar"; *não
   conectado* → "conecte este número". Mandar conectar quem já está conectado
   foi o que fez parecer que a conexão não tinha sido reconhecida.

**Pausado ≠ desconectado.** O badge de status continua "Conectado" e a pausa é
um segundo badge âmbar + card apagado. São eixos independentes no backend
(ver DIARIO de lá, mesma data) e a tela não pode fundi-los.

**O toggle é otimista.** `definirPausa` atualiza o array local, chama, e
reverte em erro. Sem isso o switch fica preso até o round-trip e a afiliada
clica de novo achando que não pegou. `criar`/`remover`/`sincronizar` seguem só
re-fetchando — lento demais só para um switch.

**Achado na validação visual (390px).** O cabeçalho usava `truncate` e o badge
"Envio pausado" disputava a linha: o status virava **"Conect…"** — o dado mais
importante do card cortado por causa do secundário. Virou `flex-wrap` +
`whitespace-nowrap`. Só apareceu no screenshot; `tsc` e lint passavam verdes.

**Gotcha de ambiente para a próxima validação.** O app do docker-compose local
aponta `WAHA_URL` para o WAHA de **homologação** (hostname interno do Coolify,
inalcançável da máquina) — criar número local devolve 502 `motivo="rede"`,
mesmo com o container `waha` do perfil `whatsapp` de pé. Os ramos que exigem
número novo (QR, card desconectado) foram validados com `page.route`
interceptando `/instancias` e `/grupos`: app real, CSS real, zero escrita no
banco compartilhado.

---

## 2026-08-27 — Rodada mobile/tablet: auditoria por screenshot e correção geral

Relato de que o app estava "totalmente quebrado" no celular e no tablet.
Auditoria visual das 25 rotas (aluna + admin) em 390×844, 820×1180 e 1440×900,
com `mobile-audit.mjs` medindo overflow e erros de console. **Elementos
passando da borda: mobile 51 → 14, tablet 32 → 0, desktop 0 → 0.** Os 14 que
sobram são a nav rolável do admin (a aba fora da vista é o próprio scroll) e
dois blobs decorativos clipados na Captura.

**A causa-raiz que amplificava todo o resto** estava no shell: o container do
conteúdo em `DashboardLayout` não tinha `min-w-0`. Filho de flex não encolhe
abaixo do conteúdo, então os `overflow-x-auto` internos nunca ativavam e o
`overflow-hidden` do próprio shell cortava a tabela **em silêncio** — sem
scroll, sem aviso. Foi por isso que a sonda de overflow do documento vinha
"0px" com a tela visivelmente cortada; a sonda passou a medir
`max(html, body).scrollWidth`.

O que mais quebrava, por tela:

- **Ofertas** abria em duas colunas no celular com um card desenhado para a
  linha inteira: sobravam ~29px e nome, preço e comissão saíam cortados. Entre
  640 e 1023px eram três colunas de 153px e o botão de abrir na loja vazava —
  virou 1 coluna no celular e 2 no tablet.
- **Editor de automação**: barra de ações em `bottom-0 z-20` contra a bottom
  nav em `z-40` — "Publicar automação" era literalmente inalcançável no
  celular. O `RoteiroEditor` já tinha resolvido isso e serviu de modelo.
- **Painel admin** não tinha estratégia mobile nenhuma: a tabela de uso da
  plataforma era cortada em 329px, os filtros de largura fixa somavam mais que
  a tela e os rótulos longos do DRE empurravam os valores para fora.
- **Envio rápido de oferta**: colunas de grid sem `min-w-0` faziam o conteúdo
  ter 749px dentro de um drawer de 390px. **Só apareceu na validação
  interativa** — o script que fotografa rotas paradas não abre modal.
- **Meus Links** não passava `title` ao layout (h1 vazio no header) e repetia o
  padding do `main`, perdendo 56px dos 390px.

**Por quê assim.** O shell veio primeiro de propósito: mudar a base depois
obrigaria a revalidar tudo de novo. O menu lateral mobile foi **removido**, não
consertado — ele não tinha gatilho nenhum (o header recebia
`onMobileMenuToggle` e nunca renderizou o hambúrguer), e a navegação mobile
do produto é a bottom nav.

**Pendente:**

- `SubscriptionPlanModal` continua com `Dialog` cru (`max-w-4xl`, gate de
  assinatura) — a margem lateral da base já resolve o pior; migrar para
  `ResponsiveModal` fica para uma rodada com mais folga de teste.
- `CategoryBarChart` e `ChannelPieChart` cortam rótulo no celular, mas só a
  `/demo` os usa (fora do escopo desta rodada). O padrão a copiar é o
  `overflow-x-auto -mx-2 px-2` do `EvolutionBarChart`.
- `AdSpends.tsx` (41KB) segue órfão, sem rota — não foi auditado.
- Um `ProxyPoolTab.tsx` untracked (feature de proxy pool, com service e store
  próprios) entrou por engano num `git add` de diretório e foi retirado do
  commit. **Continua untracked** e fora desta rodada.

## 2026-08-25 — Grupos F2: menu compartilhado, Anúncios×Campanhas, lista+detalhe

O débito da F0 foi quitado: `shared/config/dashboard-menu.ts` é a fonte única
dos itens de menu (sidebar consome a lista inteira; bottom nav deriva as 4 tabs
por `menuKey` e joga o resto no "Mais"). O gate de produção virou `hmlOnly` na
config + `menuVisivel()` — item novo hml-only não toca mais em 4 lugares. A
config ganhou `shortLabel` fora do combinado ("Início"/"Links"): o bottom nav
tinha rótulos próprios e encurtá-los na config quebraria a sidebar.

O rename é só de rótulo: "Campanhas" (tráfego pago) virou **"Anúncios"** (mesmo
path/menuKey `campanhas`, textos internos ficam pra F7); o novo item
**"Campanhas"** é o módulo de grupos (`/dashboard/grupos`, menuKey
`campanhas_grupos`, MAX-only, hml-only). Lista + detalhe (Visão geral/Grupos)
no molde de Automacoes/NumerosSection. A aba Grupos acumula ordem/aberto/remoção
localmente e um "Salvar ordem" único faz o PUT com a lista completa — o "sujo"
é a assinatura `grupo_id:aberto` na ordem, espelho exato do que o PUT persiste.
Posição enviada é o índice 0-based (backend só ordena, não interpreta o valor).

Validação visual: hml sem grupos sincronizados no relacionamento@ — os fluxos
de linha (reordenar/fechar/remover) foram validados com `page.route` mockando
`/whatsapp/grupos` (sem sujar o banco); campanha real "Campanha de validação
F2" criada via UI em hml para o resto. Gotcha do Playwright: `storage_state`
do Supabase morre na 2ª sessão (rotação de refresh token) — logar de novo.

---

## 2026-08-25 — Grupos F1: seção Números (WAHA) em Configurações

Seção nova no grupo WHATSAPP (hml-only) com o fluxo conectar→QR→sincronizar.
Decisões locais: polling do QR em 5s (pareamento é interativo; os 20s do admin
são para tela parada), "Sincronizar grupos" só aparece com instância
conectada (evita o 409 previsível), e o limite do plano vem de
`context.limites_whatsapp_numeros` com fallback no catálogo espelhado —
`PlanContext` tipado não foi alterado (cast local), pendência aceitável até a
F2 mexer no plan.service. Validação E2E contra WAHA real local.

---

## 2026-08-25 — Grupos WhatsApp F0: menu compacto, Configurações em sub-nav, gating no mobile

Fase 0 do módulo de grupos (plano em `~/.claude/plans/claudinho-sobre-a-implementa-o-robust-reef.md`).
Três raciocínios que o diff não conta:

**Seção de Configurações deriva da URL, não de useState.** A primeira versão
usava estado local seedado do `?tab=` só no mount — funcionava até alguém
navegar para `?tab=...` com o componente já montado (nada remonta, nada muda),
e o Back físico do Android saía da página em vez de voltar à lista no mobile.
Derivar de `useSearchParams` resolveu os dois de graça: push no mobile (Back
volta à lista), replace no desktop (Back sai da página, como as Tabs antigas).

**Cadeado só com `context != null`.** O planStore cai para "essencial" antes
do fetch E depois de falha — mostrar cadeado nesses estados trava assinante
pagante no modal de upgrade. Como TODA rota paga tem `RequirePlan`, o cadeado
do menu é cosmético; liberar o clique na janela de load é seguro. Vale para os
dois navs.

**`useIsMobile` agora é síncrono no primeiro render.** `useState(undefined)`
fazia todo primeiro render ser "desktop"; com a Configurações renderizando
árvores diferentes por viewport, isso virou flash + efeitos de rede duplicados
(retorno OAuth do Facebook montava 2×). Corrigido no hook compartilhado —
beneficia ResponsiveModal e afins também.

**Pendente/anotado para F2**: sidebar e MobileBottomNav duplicam a lista de
itens + gate de produção (4 lugares com `isProductionHost()` para automacoes);
quando a F2 mexer no menu, extrair config compartilhada
(`shared/config/dashboard-menu.ts`) e considerar `feature-flags.json`.

---

## 2026-08-21 — Instagram Rodada 2: Card 4 em três campos, botão e emoji

O direct passou a sair como **template `button`** da Meta. Na tela isso virou
três campos no Card 4: Mensagem (só texto), Link (o "Inserir link" saiu de baixo
da mensagem e agora preenche ESTE campo, em vez de emendar a URL no fim do
texto) e Texto do botão (limite 20, com contador).

O preview do Direct renderiza o botão **sob a mesma condição do backend** — só
com link E título. Se a tela mostrasse o botão só por ter link, prometeria algo
que o envio não manda.

**Emoji sem biblioteca.** Seletor no Card 3 (entra na última variação, que é a
que a aluna acabou de escrever) e no Card 4. Uma lib de emoji custa centenas de
KB no bundle de uma tela que a aluna abre pelo celular, e o conjunto que aparece
numa mensagem de afiliado é pequeno e previsível — lista curta escolhida a dedo
em `components/shared/EmojiPicker.tsx`.

Alinhamento pedido pelo Luiz: seletor de emoji e contador de caracteres na mesma
linha de base (medido no browser: 0px entre os centros).

**Achado de infra:** o disparo de deploy do frontend era
`curl ... || echo "Deployment triggered"`, com o passo seguinte imprimindo
sucesso incondicional — o MESMO defeito que deixou o worker Celery com código de
semanas atrás, corrigido no backend em 03/08 e nunca aqui, nos dois workflows.
Agora usa o `trigger-deploy.sh` do backend, que confere o HTTP e falha alto.

## 2026-08-20 — Instagram Rodada 1 + menu numa linha

Ajustes depois da validação do Luiz em hml. Nenhum era bug de backend.

- **Card 1**: "Próxima publicação" removida (escopo `proximo` saiu também do
  backend). A grade renderizava a conta inteira — 224 posts na conta de teste —
  e empurrava os cards 2, 3 e 4 para fora da tela: a aluna nem descobria que
  existiam. Virou uma fileira de 4 + modal com **busca por legenda**, que carrega
  as páginas restantes ao abrir (filtrar só o que já paginou não acharia o post
  procurado, que costuma estar no fim).
- **Card 3**: um campo por variação. Uma variação por linha num textarea era
  frágil — enter duplo criava variação vazia, colar texto multilinha bagunçava.
- **Configurações**: a palavra "Integração" repetida em três abas estourava a
  régua e virava scroll horizontal; saiu. O caminho do passo 2 apontava para um
  menu que **não existe** nas versões atuais do app — corrigido para o verificado
  no iOS. É o passo que mais gera chamado.
- **Achado nosso**: automação **já ativa** não ganhava o selo "Aguardando
  conexão" quando o webhook caía — continuava dizendo "Ativa" sem disparar nada.

Antes disso, no mesmo dia: "Automação Instagram" quebrava em duas linhas no menu
(o rótulo pedia 168px e o item tinha 144px; sidebar foi para `w-72`), e o modal
de upgrade dizia "plano Pro" para um item que é **exclusivo do Max** — quem
seguisse o modal fazia o upgrade errado.

---

## 2026-08-19 — Memória do time criada neste repo

Criada a estrutura `.claude/` (agents, commands, memoria, rules, skills,
settings) espelhando o padrão já em uso no monorepo vizinho.

**Por quê.** O contexto do frontend vinha vivendo em três lugares que não se
falam: `CLAUDE.md` (convenção), `CHANGELOG.md` da raiz (o que mudou) e a
memória pessoal do assistente (o porquê). O terceiro não é compartilhável e
não sobrevive à troca de máquina ou de pessoa — decisão cara como "o corte de
período é em BRT, não UTC" ficava fora do repo.

`CONTEXTO.md`, `DECISOES.md` e este diário foram semeados por inspeção do
código, do `CHANGELOG.md` e do `git log` de `develop` — **não** por relato.
Onde a seção divergir do código, o código vence.

**Divergências encontradas ao semear** (viraram pendência em `DECISOES.md`):

- `CLAUDE.md` diz que o proxy do Vite aponta para **8081**; o
  `vite.config.ts` aponta para **8000**, que é a porta que o
  `docker-compose.yml` do backend expõe. Quem segue o doc não conecta.
- Dois `vite.config.ts.timestamp-*.mjs` versionados na raiz (artefato
  temporário do Vite).
- O botão "Atualizar" do header continua na tela sem fazer nada desde a
  migração dos stores para stale-while-revalidate.

**Pendente:** nenhuma tela foi revalidada por screenshot nesta passagem — o
`CONTEXTO.md` descreve o código, não o que está renderizando em produção.

---

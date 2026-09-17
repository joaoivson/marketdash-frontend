import { todayKeyBR } from "@/shared/lib/date";
import type { PeriodoAdmin } from "@/services/admin-panel.service";

/**
 * Modos do filtro de período do painel admin.
 *
 * Mora fora do `.tsx` porque o Fast Refresh do Vite só funciona em arquivo que
 * exporta APENAS componentes — misturar helpers ali desliga o hot reload
 * justamente no componente que mais se itera.
 *
 * `{ tipo: "mes" }` é o modo antigo (um mês civil, pelo MonthYearPicker).
 * Qualquer outro é período livre.
 */
export type ModoPeriodo =
  | { tipo: "mes" }
  | { tipo: "meses"; quantidade: number; rotulo: string }
  | { tipo: "ano" }
  | { tipo: "total" }
  | { tipo: "personalizado"; inicio: string; fim: string };

/** Primeiro dia do mês N meses atrás, em dia civil BRT.
 *
 * Usa `todayKeyBR()` e não `new Date()`: entre 21h e meia-noite o dia UTC já
 * virou, e o filtro "últimos 3 meses" começaria um mês adiante do que a tela
 * promete. */
const primeiroDiaMesesAtras = (n: number): string => {
  const [ano, mes] = todayKeyBR().split("-").map(Number);
  // Date com mês 0-11 normaliza a virada de ano sozinho (mês -1 vira dezembro).
  const d = new Date(Date.UTC(ano, mes - 1 - (n - 1), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

export const periodoParaApi = (modo: ModoPeriodo): PeriodoAdmin | undefined => {
  switch (modo.tipo) {
    case "mes":
      return undefined; // modo mensal: quem manda é year/month
    case "meses":
      return { inicio: primeiroDiaMesesAtras(modo.quantidade), fim: todayKeyBR() };
    case "ano":
      return { inicio: `${todayKeyBR().slice(0, 4)}-01-01`, fim: todayKeyBR() };
    case "total":
      // Os dois vazios de propósito — é o backend que sabe onde o histórico começa.
      return {};
    case "personalizado":
      return { inicio: modo.inicio, fim: modo.fim };
  }
};

const paraBR = (iso: string) => iso.split("-").reverse().join("/");

export const rotuloDoPeriodo = (modo: ModoPeriodo): string => {
  switch (modo.tipo) {
    case "mes":
      return "mês selecionado";
    case "meses":
      return modo.rotulo.toLowerCase();
    case "ano":
      return todayKeyBR().slice(0, 4);
    case "total":
      return "todo o período";
    case "personalizado":
      return `${paraBR(modo.inicio)} a ${paraBR(modo.fim)}`;
  }
};

export const CHIPS_PERIODO: { modo: ModoPeriodo; texto: string }[] = [
  { modo: { tipo: "mes" }, texto: "Mês" },
  { modo: { tipo: "meses", quantidade: 3, rotulo: "Últimos 3 meses" }, texto: "3 meses" },
  { modo: { tipo: "meses", quantidade: 6, rotulo: "Últimos 6 meses" }, texto: "6 meses" },
  { modo: { tipo: "meses", quantidade: 12, rotulo: "Últimos 12 meses" }, texto: "12 meses" },
  { modo: { tipo: "ano" }, texto: "Este ano" },
  { modo: { tipo: "total" }, texto: "Todo o período" },
];


/** Caminho da lista de clientes do admin.
 *
 * É **`clientes`**, em português. O projeto mistura os dois idiomas: as rotas de
 * TELA são em português (`/admin/clientes`, `/admin/despesas`) e as de API em
 * inglês (`/api/v1/admin/clients`). Escrever `/admin/clients` dá 404 — foi
 * exatamente o que aconteceu com o drill-down em 17/09/2026, em produção.
 */
export const ROTA_CLIENTES_ADMIN = "/admin/clientes";

/** Link do drill-down de um card do dashboard para a lista de clientes.
 *
 * O período viaja junto: clicar num total de 12 meses e cair numa lista do mês
 * corrente daria números que não fecham com o card.
 */
export const linkDoCardParaClientes = (
  origem: "mrr" | "faturamento" | "churn",
  periodo: PeriodoAdmin | undefined,
  year: number,
  month: number,
): string => {
  const qs = new URLSearchParams({ origem });
  if (periodo?.inicio) qs.set("inicio", periodo.inicio);
  if (periodo?.fim) qs.set("fim", periodo.fim);
  if (!periodo) {
    // Modo mensal: manda as bordas do mês escolhido, para a lista não depender
    // de adivinhar year/month.
    const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, "0");
    qs.set("inicio", `${year}-${mm}-01`);
    qs.set("fim", `${year}-${mm}-${ultimo}`);
  }
  return `${ROTA_CLIENTES_ADMIN}?${qs}`;
};

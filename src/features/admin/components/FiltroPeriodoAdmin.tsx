import { useState } from "react";
import { CalendarRange, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthYearPicker } from "@/features/admin/components/MonthYearPicker";
import { cn } from "@/shared/lib/utils";
import { todayKeyBR } from "@/shared/lib/date";
import {
  CHIPS_PERIODO,
  rotuloDoPeriodo,
  type ModoPeriodo,
} from "@/features/admin/components/periodo-admin";

/**
 * Filtro de período do painel admin.
 *
 * O painel só sabia somar UM mês civil. Aqui entram os acumulados — inclusive
 * "Todo o período", que é o caso que motivou a tela: ver o faturamento de todos
 * os meses juntos. Os tipos e helpers moram em `periodo-admin.ts`, para o Fast
 * Refresh continuar valendo aqui.
 */
export function FiltroPeriodoAdmin({
  modo,
  onChange,
}: {
  modo: ModoPeriodo;
  onChange: (m: ModoPeriodo) => void;
}) {
  const [abrirCustom, setAbrirCustom] = useState(modo.tipo === "personalizado");
  const [de, setDe] = useState(modo.tipo === "personalizado" ? modo.inicio : "");
  const [ate, setAte] = useState(modo.tipo === "personalizado" ? modo.fim : todayKeyBR());

  const aplicarCustom = () => {
    if (!de || !ate || de > ate) return;
    onChange({ tipo: "personalizado", inicio: de, fim: ate });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS_PERIODO.map((c) => {
          const ativo = c.modo.tipo === modo.tipo &&
            (c.modo.tipo !== "meses" || (modo.tipo === "meses" && c.modo.quantidade === modo.quantidade));
          return (
            <button
              key={c.texto}
              type="button"
              onClick={() => {
                setAbrirCustom(false);
                onChange(c.modo);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                ativo
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/40",
              )}
            >
              {c.texto}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setAbrirCustom((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            modo.tipo === "personalizado"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent/40",
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
          {modo.tipo === "personalizado" ? rotuloDoPeriodo(modo) : "Escolher datas"}
        </button>

        {/* O seletor de mês só aparece quando ele é quem manda — deixá-lo visível
            no modo acumulado sugere que ainda influencia o número, e não influencia. */}
        {modo.tipo === "mes" && <MonthYearPicker />}
      </div>

      {abrirCustom && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
          <label className="text-xs text-muted-foreground">
            De
            <Input
              type="date"
              value={de}
              max={ate || undefined}
              onChange={(e) => setDe(e.target.value)}
              className="mt-1 h-9 w-[150px]"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Até
            <Input
              type="date"
              value={ate}
              min={de || undefined}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 h-9 w-[150px]"
            />
          </label>
          <Button size="sm" onClick={aplicarCustom} disabled={!de || !ate || de > ate}>
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAbrirCustom(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

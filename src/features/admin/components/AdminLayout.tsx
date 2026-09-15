import { Link, Outlet, useLocation } from "react-router-dom";
import { BrandLogo, BrandSymbol } from "@/components/brand/BrandLogo";
import { MonthYearPicker } from "@/features/admin/components/MonthYearPicker";
import { cn } from "@/shared/lib/utils";

const TABS = [
  { to: "/admin", label: "Dashboard", exact: true },
  { to: "/admin/clientes", label: "Clientes" },
  { to: "/admin/sincronizacoes", label: "Uso e Sistema" },
  { to: "/admin/infraestrutura", label: "Infraestrutura" },
  { to: "/admin/despesas", label: "Despesas" },
  { to: "/admin/dre", label: "DRE" },
] as const;

export function AdminLayout() {
  const { pathname } = useLocation();
  const onPeriodScreen =
    pathname === "/admin" || pathname === "/admin/despesas" || pathname === "/admin/dre";
  // Clientes precisa da largura cheia pra caber as colunas sem scroll horizontal
  // em telas grandes — as outras telas do admin ficam melhor com o max-width.
  const isClientsScreen = pathname.startsWith("/admin/clientes");

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 border-r border-border bg-card/40 md:flex md:flex-col">
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center gap-3">
            <BrandSymbol className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <p
                className="text-base font-bold leading-tight tracking-tight"
                style={{
                  fontFamily: '"Space Grotesk", system-ui, sans-serif',
                  fontWeight: 700,
                }}
              >
                MarketDash
              </p>
              <p
                className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
              >
                Painel interno
              </p>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {TABS.map((tab) => {
            const active = tab.exact
              ? pathname === tab.to
              : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "rounded-md border-l-2 border-transparent px-3 py-2 text-sm transition-colors",
                  active
                    ? "font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                style={
                  active
                    ? {
                        background: "rgba(49,140,233,.12)",
                        borderColor: "rgba(49,140,233,.38)",
                        color: "#7CB8F2",
                      }
                    : undefined
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar ao app
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-border bg-card/40 px-4 py-3 md:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <BrandLogo className="h-6 w-auto" />
              <h1 className="text-sm font-semibold">Admin</h1>
            </div>
            <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
              Voltar ao app
            </Link>
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const active = tab.exact
                ? pathname === tab.to
                : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className={cn("mx-auto px-4 py-6", !isClientsScreen && "max-w-6xl")}>
          {onPeriodScreen && (
            <div className="mb-4">
              <MonthYearPicker />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

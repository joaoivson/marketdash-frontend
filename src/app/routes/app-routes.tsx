/**
 * Application Routes
 * Configuração centralizada de rotas
 */

import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense } from "react";
import { tokenStorage } from "@/shared/lib/storage";
import { useSubscriptionCheck } from "@/shared/hooks/useSubscriptionCheck";
import { Loader2, Lock, ArrowRight } from "lucide-react";
import { SubscriptionPlanModal } from "@/features/subscription/components/SubscriptionPlanModal";
import { Button } from "@/components/ui/button";

// Imports diretos para evitar falha de carregamento de chunks dinâmicos
import Index from "@/features/landing/pages/Index";
import Demo from "@/features/landing/pages/Demo";
import Login from "@/features/auth/pages/Login";
import Dashboard from "@/features/dashboard/pages/Dashboard";
import UploadCSV from "@/features/dashboard/pages/UploadCSV";
import Reports from "@/features/dashboard/pages/Reports";
import Modules from "@/features/dashboard/pages/Modules";
import Settings from "@/features/dashboard/pages/Settings";
import CapturaSite from "@/features/dashboard/pages/CapturaSite";
import CustomLinks from "@/features/dashboard/pages/CustomLinks";
import CaptureViewer from "@/features/landing/pages/CaptureViewer";
import LinkRedirect from "@/features/landing/pages/LinkRedirect";
import PrivacyPolicy from "@/features/landing/pages/PrivacyPolicy";
import TermsOfService from "@/features/landing/pages/TermsOfService";
import ExclusaoDeDados from "@/features/landing/pages/ExclusaoDeDados";
import SubscriptionPage from "@/features/subscription/pages/SubscriptionPage";
import SubscriptionSuccess from "@/features/subscription/pages/SubscriptionSuccess";
import SubscriptionError from "@/features/subscription/pages/SubscriptionError";
import SubscriptionCallback from "@/features/subscription/pages/SubscriptionCallback";
import SetPasswordPage from "@/features/auth/pages/SetPasswordPage";
import ForgotPasswordPage from "@/features/auth/pages/ForgotPasswordPage";
import NotFound from "@/shared/pages/NotFound";
import IntegrationsPage from "@/features/dashboard/pages/Integrations";
import ImpostosMeta from "@/features/dashboard/pages/ImpostosMeta";
import Campanhas from "@/features/dashboard/pages/Campanhas";
import Automacoes from "@/features/dashboard/pages/Automacoes";
import AutomacaoEditor from "@/features/dashboard/pages/AutomacaoEditor";
import AutomacoesEmLote from "@/features/dashboard/pages/AutomacoesEmLote";
import AutomacoesCallback from "@/features/dashboard/pages/AutomacoesCallback";
import Configuracoes from "@/features/dashboard/pages/Configuracoes";
import IndiquePage from "@/features/dashboard/pages/IndiquePage";
import AfiliadosPage from "@/features/dashboard/pages/Afiliados";
import AfiliadosPendentesPage from "@/features/admin/pages/AfiliadosPendentes";
import AdminDashboardPage from "@/features/admin/pages/AdminDashboard";
import AdminClientsPage from "@/features/admin/pages/AdminClients";
import AdminClientDetailPage from "@/features/admin/pages/AdminClientDetail";
import AdminExpensesPage from "@/features/admin/pages/AdminExpenses";
import AdminDrePage from "@/features/admin/pages/AdminDre";
import AdminSyncStatusPage from "@/features/admin/pages/AdminSyncStatus";
import AdminInfraPage from "@/features/admin/pages/AdminInfra";
import { AdminLayout } from "@/features/admin/components/AdminLayout";
import PlanosPage from "@/features/dashboard/pages/PlanosPage";
import { RequirePlan } from "@/app/routes/RequirePlan";
import { RequireAdmin } from "@/app/routes/RequireAdmin";


/** `/admin/clients` → `/admin/clientes`, preservando a query string.
 *
 * As rotas de TELA deste projeto são em português e as de API em inglês
 * (`/api/v1/admin/clients`). Quem escreve um link olhando a API escreve o
 * caminho inglês e toma 404 — aconteceu com o drill-down dos cards do dashboard
 * em 17/09/2026, em produção. Redirecionar conserta também as URLs já salvas.
 */
function RedirecionaParaClientes() {
  const { search } = useLocation();
  return <Navigate to={`/admin/clientes${search}`} replace />;
}

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="text-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
      <p className="mt-4 text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

const ProtectedRoute = ({ element }: { element: JSX.Element }) => {
  const token = tokenStorage.get();
  // Usar skipCheck para rotas do dashboard após primeira validação
  // Isso evita verificações repetidas ao navegar entre páginas do dashboard
  const { status, loading, showPlanModal, setShowPlanModal } = useSubscriptionCheck({
    redirectOnInactive: true,
    skipCheck: false, // Primeira vez sempre verifica
    showModalOnInactive: true, // Mostrar modal ao invés de redirecionar
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
          <p className="mt-4 text-muted-foreground">Verificando assinatura...</p>
        </div>
      </div>
    );
  }

  // Se assinatura inativa, mostrar modal ao invés de redirecionar
  if (status && !status.is_active) {
    // Garantir que o modal seja exibido quando a assinatura estiver inativa
    // O redirect só acontece quando o usuário escolher um plano no modal (através do handleContinue)
    const shouldShowModal = showPlanModal === undefined ? true : showPlanModal;

    return (
      <>
        <SubscriptionPlanModal
          open={shouldShowModal}
          onOpenChange={(open) => {
            setShowPlanModal(open);
            // Se o usuário fechar o modal, não fazer redirect automático
            // O dashboard continua bloqueado até que a assinatura seja ativada
            // O redirect só acontece quando o usuário escolhe um plano e clica em "Continuar"
          }}
        />
        {/* Overlay bloqueado com opção de assinar */}
        <div className="relative">
          {/* Elemento bloqueado */}
          <div className="opacity-50 pointer-events-none">
            {element}
          </div>

          {/* Banner de assinatura sobreposto */}
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
            <div className="bg-card border border-border rounded-lg shadow-lg p-8 max-w-md mx-4 text-center space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Lock className="w-12 h-12 text-primary" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Assinatura Necessária</h2>
                <p className="text-muted-foreground">
                  Para acessar o dashboard, você precisa de uma assinatura ativa.
                  Escolha um plano e comece a usar todas as funcionalidades.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => setShowPlanModal(true)}
                  className="w-full sm:w-auto"
                >
                  Ver Planos
                </Button>
                <Button
                  variant="hero"
                  onClick={() => setShowPlanModal(true)}
                  className="w-full sm:w-auto"
                >
                  Assinar Agora
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return element;
};

export const AppRoutes = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Index />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        {/* Destino da "Data deletion request URL" da Meta. Precisa ser público:
            quem chega aqui acabou de remover o app e não está autenticado. */}
        <Route path="/exclusao-de-dados" element={<ExclusaoDeDados />} />

        {/* Auth Routes */}
        <Route path="/auth/set-password" element={<SetPasswordPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />

        {/* Subscription Routes */}
        <Route path="/assinatura" element={<SubscriptionPage />} />
        <Route path="/assinatura/callback" element={<SubscriptionCallback />} />
        <Route path="/assinatura/sucesso" element={<SubscriptionSuccess />} />
        <Route path="/assinatura/erro" element={<SubscriptionError />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute element={<Dashboard />} />} />
        <Route
          path="/dashboard/captura"
          element={<ProtectedRoute element={<RequirePlan menuKey="captura" element={<CapturaSite />} />} />}
        />
        {/* "Upload Comissão" (/dashboard/upload) removido: comissão vem 100% da API Shopee. */}
        <Route path="/dashboard/upload-cliques" element={<ProtectedRoute element={<UploadCSV />} />} />
        <Route path="/dashboard/reports" element={<ProtectedRoute element={<Reports />} />} />
        <Route path="/dashboard/modules" element={<ProtectedRoute element={<Modules />} />} />
        <Route path="/dashboard/settings" element={<ProtectedRoute element={<Settings />} />} />
        {/* "Custos de Anúncios" (/dashboard/investimentos) removido: gasto vem 100% da API Meta. */}
        <Route path="/dashboard/campanhas" element={<ProtectedRoute element={<Campanhas />} />} />
        {/* Callback do OAuth do Instagram — rota própria pra não colidir com o ?code do
            Facebook, que é lido na tela de Configurações. Fica ANTES de /:id para o
            "callback" não ser lido como id de automação, e FORA do RequirePlan: a
            conexão precisa concluir mesmo se o plano mudar no meio do caminho. */}
        {/* Instagram liberado em produção em 01/09/2026: App Review da Meta
            aprovado (3 permissões) e migrations 052-056 aplicadas lá. */}
        <Route
          path="/dashboard/automacoes/callback"
          element={<ProtectedRoute element={<AutomacoesCallback />} />}
        />
        <Route
          path="/dashboard/automacoes"
          element={<ProtectedRoute element={<RequirePlan menuKey="automacoes" element={<Automacoes />} />} />}
        />
        <Route
          path="/dashboard/automacoes/nova"
          element={<ProtectedRoute element={<RequirePlan menuKey="automacoes" element={<AutomacaoEditor />} />} />}
        />
        {/* ANTES da rota `:id` — "em-lote" seria capturado como id e a tela
            abriria o editor pedindo uma automação que não existe. */}
        <Route
          path="/dashboard/automacoes/em-lote"
          element={<ProtectedRoute element={<RequirePlan menuKey="automacoes" element={<AutomacoesEmLote />} />} />}
        />
        <Route
          path="/dashboard/automacoes/:id"
          element={<ProtectedRoute element={<RequirePlan menuKey="automacoes" element={<AutomacaoEditor />} />} />}
        />
        <Route path="/dashboard/configuracoes" element={<ProtectedRoute element={<Configuracoes />} />} />
        <Route path="/dashboard/planos" element={<ProtectedRoute element={<PlanosPage />} />} />
        <Route path="/dashboard/indique" element={<ProtectedRoute element={<IndiquePage />} />} />
        <Route
          path="/dashboard/links"
          element={<ProtectedRoute element={<RequirePlan menuKey="meus_links" element={<CustomLinks />} />} />}
        />
        <Route path="/dashboard/integracoes" element={<ProtectedRoute element={<IntegrationsPage />} />} />
        <Route path="/dashboard/impostos" element={<ProtectedRoute element={<ImpostosMeta />} />} />
        <Route path="/dashboard/afiliados" element={<ProtectedRoute element={<AfiliadosPage />} />} />
        <Route path="/dashboard/admin/afiliados" element={<ProtectedRoute element={<AfiliadosPendentesPage />} />} />

        {/* Admin interno — sem link no sidebar; RequireAdmin → 404 se não-admin */}
        <Route
          path="/admin"
          element={<RequireAdmin element={<AdminLayout />} />}
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="clientes" element={<AdminClientsPage />} />
          {/* As rotas de TELA deste projeto são em português e as de API em
              inglês (`/api/v1/admin/clients`). Quem escreve um link olhando a
              API escreve `/admin/clients` e toma 404 — aconteceu com o
              drill-down dos cards em 17/09/2026, em produção. O redirecionamento
              preserva a query string, então URL já salva ou compartilhada
              continua funcionando. */}
          <Route path="clients" element={<RedirecionaParaClientes />} />
          <Route path="clientes/:userId" element={<AdminClientDetailPage />} />
          <Route path="uso" element={<Navigate to="/admin/sincronizacoes?tab=uso" replace />} />
          <Route path="sincronizacoes" element={<AdminSyncStatusPage />} />
          <Route path="infraestrutura" element={<AdminInfraPage />} />
          <Route path="despesas" element={<AdminExpensesPage />} />
          <Route path="dre" element={<AdminDrePage />} />
        </Route>

        {/* Capture Public Route */}
        <Route path="/c/:slug" element={<CaptureViewer />} />

        {/* Link Redirect Public Route */}
        <Route path="/l/:slug" element={<LinkRedirect />} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};


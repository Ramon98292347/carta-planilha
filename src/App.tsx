import { Suspense, lazy } from "react";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { hasAppSession } from "./lib/appSession";

const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Obreiro = lazy(() => import("./pages/Obreiro"));
const Divulgacao = lazy(() => import("./pages/Divulgacao"));

const queryClient = new QueryClient();

function RequireSession({ children }: { children: React.ReactNode }) {
  if (!hasAppSession()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
              Carregando...
            </div>
          }
        >
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/obreiro"
              element={
                <RequireSession>
                  <Obreiro />
                </RequireSession>
              }
            />
            <Route
              path="/"
              element={
                <RequireSession>
                  <Index />
                </RequireSession>
              }
            />
            <Route
              path="/divulgacao"
              element={
                <RequireSession>
                  <Divulgacao />
                </RequireSession>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

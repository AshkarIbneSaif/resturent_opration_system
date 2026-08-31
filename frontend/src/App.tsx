import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuthStore } from "./store/authStore";
import { RequireRole } from "./components/RouteGuards";
import LoginPage from "./pages/LoginPage";
import WaiterTablesPage from "./pages/waiter/WaiterTablesPage";
import WaiterMenuPage from "./pages/waiter/WaiterMenuPage";
import WaiterOrdersPage from "./pages/waiter/WaiterOrdersPage";
import KitchenDisplayPage from "./pages/kitchen/KitchenDisplayPage";
import CashierPage from "./pages/cashier/CashierPage";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import OwnerDashboard from "./pages/owner/OwnerDashboard";
import TakeoutPage from "./pages/takeout/TakeoutPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5000 } },
});

function RootRedirect() {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  const home: Record<string, string> = {
    OWNER: "/owner",
    MANAGER: "/manager",
    WAITER: "/waiter/tables",
    KITCHEN: "/kitchen",
    CASHIER: "/cashier",
    TAKEOUT: "/takeout",
  };
  return <Navigate to={home[session.roleName] ?? "/login"} replace />;
}

export default function App() {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    restoreSession().finally(() => setRestored(true));
  }, [restoreSession]);

  if (!restored) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RootRedirect />} />

          <Route element={<RequireRole roles={["WAITER"]} />}>
            <Route path="/waiter/tables" element={<WaiterTablesPage />} />
            <Route path="/waiter/tables/:tableId/menu" element={<WaiterMenuPage />} />
            <Route path="/waiter/orders" element={<WaiterOrdersPage />} />
            <Route path="/waiter" element={<Navigate to="/waiter/tables" replace />} />
          </Route>

          <Route element={<RequireRole roles={["OWNER"]} />}>
            <Route path="/owner" element={<OwnerDashboard />} />
          </Route>
          <Route element={<RequireRole roles={["MANAGER"]} />}>
            <Route path="/manager" element={<ManagerDashboard />} />
          </Route>
          <Route element={<RequireRole roles={["KITCHEN"]} />}>
            <Route path="/kitchen" element={<KitchenDisplayPage />} />
          </Route>
          <Route element={<RequireRole roles={["CASHIER"]} />}>
            <Route path="/cashier" element={<CashierPage />} />
          </Route>
          <Route element={<RequireRole roles={["TAKEOUT"]} />}>
            <Route path="/takeout" element={<TakeoutPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

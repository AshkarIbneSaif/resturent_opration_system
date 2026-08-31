import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../store/authStore";
import { ordersApi } from "../../api/ros";
import { useRealtimeSync } from "../../lib/useRealtimeSync";

export function WaiterShell({ title, children }: { title: string; children: ReactNode }) {
  useRealtimeSync();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const { data: activeOrders } = useQuery({
    queryKey: ["orders", "active"],
    queryFn: ordersApi.active,
    refetchInterval: 15000, // fallback poll in case a socket event is missed
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/waiter/tables" className="font-display text-lg tracking-tight text-paper">
            ROS
          </Link>
          <span className="text-slate-600 text-sm hidden sm:inline">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/waiter/orders"
            className="tap-target flex items-center gap-2 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
          >
            <span>My Orders</span>
            {!!activeOrders?.length && (
              <span className="bg-ember text-slate-950 text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center">
                {activeOrders.length}
              </span>
            )}
          </Link>
          <span className="text-sm text-slate-600 hidden sm:inline">{session?.user.displayName}</span>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="tap-target px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

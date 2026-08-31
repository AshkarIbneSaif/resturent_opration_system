import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export function RequireAuth() {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireRole({ roles }: { roles: string[] }) {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  if (!roles.includes(session.roleName)) return <Navigate to="/" replace />;
  return <Outlet />;
}

import { create } from "zustand";
import { api, setAuthToken, ApiClientError } from "../api/client";

export interface Session {
  token: string;
  user: { id: string; username: string; displayName: string; branchId: string };
  roleName: string;
  permissions: string[];
}

interface AuthState {
  session: Session | null;
  status: "idle" | "loading" | "authenticated" | "error";
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  restoreSession: () => Promise<void>;
}

const STORAGE_KEY = "ros_session";

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  status: "idle",
  error: null,

  login: async (username, password) => {
    set({ status: "loading", error: null });
    try {
      const result = await api.post<{
        token: string;
        user: Session["user"] & { roleName: string };
        permissions: string[];
      }>("/auth/login", { username, password });

      const session: Session = {
        token: result.token,
        user: { id: result.user.id, username: result.user.username, displayName: result.user.displayName, branchId: result.user.branchId },
        roleName: result.user.roleName,
        permissions: result.permissions,
      };
      setAuthToken(session.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      set({ session, status: "authenticated" });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not reach the server.";
      set({ status: "error", error: message });
      throw err;
    }
  },

  logout: () => {
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    set({ session: null, status: "idle" });
  },

  hasPermission: (permission) => {
    const session = get().session;
    return !!session?.permissions.includes(permission);
  },

  restoreSession: async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const session: Session = JSON.parse(raw);
      setAuthToken(session.token);
      // Verify the token is still valid server-side (it may have been
      // revoked by a disabled-user check even before expiry).
      await api.get("/auth/me");
      set({ session, status: "authenticated" });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken(null);
    }
  },
}));

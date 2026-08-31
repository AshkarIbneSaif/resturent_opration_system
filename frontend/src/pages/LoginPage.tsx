import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { ROLE_HOME_ROUTE } from "../lib/permissions";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(username, password);
      const session = useAuthStore.getState().session;
      if (session) navigate(ROLE_HOME_ROUTE[session.roleName] ?? "/");
    } catch {
      // error already captured in store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-block bg-ember text-slate-950 font-mono font-semibold text-xs tracking-widest px-3 py-1 rounded-sm mb-4">
            ORDER #10452
          </div>
          <h1 className="font-display text-3xl text-paper tracking-tight">ROS</h1>
          <p className="text-slate-600 text-sm mt-1">Restaurant Operations System</p>
        </div>

        <form onSubmit={handleSubmit} className="docket docket-neutral p-6 space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm text-slate-600 mb-1.5">
              Username
            </label>
            <input
              id="username"
              autoFocus
              autoCapitalize="off"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-4 text-paper text-lg focus-visible:border-ember"
              placeholder="e.g. owner"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-slate-600 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-4 text-paper text-lg focus-visible:border-ember"
            />
          </div>

          {error && (
            <p role="alert" className="text-brick text-sm bg-brick/10 border border-brick/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !username || !password}
            className="w-full tap-target bg-ember hover:bg-ember-dark disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-md transition-colors"
          >
            {status === "loading" ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

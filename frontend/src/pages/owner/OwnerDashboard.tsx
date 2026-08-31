import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatMoney } from "../../api/ros";
import { ownerApi } from "../../api/owner";
import { backupApi, downloadExport, fileToBase64 } from "../../api/backup";
import { useAuthStore } from "../../store/authStore";

type Tab = "overview" | "staff" | "settings" | "audit" | "data";

function Shell({ tab, setTab, children }: { tab: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-lg text-paper">Owner</h1>
          <nav className="flex gap-1">
            {(["overview", "staff", "settings", "audit", "data"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`tap-target px-3 rounded-md text-sm font-medium capitalize ${
                  tab === t ? "bg-ember text-slate-950" : "bg-slate-800 text-slate-600"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-600">{session?.user.displayName}</span>
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
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}

function Overview() {
  const { data: sales } = useQuery({ queryKey: ["reports", "sales"], queryFn: ownerApi.salesReport });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="docket docket-ready p-4">
        <div className="text-slate-600 text-sm">Total Revenue</div>
        <div className="font-display text-2xl text-paper mt-1">{sales ? formatMoney(sales.totalRevenueMinor) : "…"}</div>
      </div>
      <div className="docket docket-pending p-4">
        <div className="text-slate-600 text-sm">Paid Orders</div>
        <div className="font-display text-2xl text-paper mt-1">{sales?.paidOrderCount ?? "…"}</div>
      </div>
      <div className="docket docket-neutral p-4">
        <div className="text-slate-600 text-sm">Bills Generated</div>
        <div className="font-display text-2xl text-paper mt-1">{sales?.transactionCount ?? "…"}</div>
      </div>
      {sales && (
        <div className="docket docket-neutral p-4 sm:col-span-3">
          <div className="text-slate-600 text-sm mb-2">Payment method breakdown</div>
          <div className="flex gap-6 font-mono text-sm">
            {Object.entries(sales.paymentMethodBreakdown).map(([method, amountMinor]) => (
              <div key={method}>
                <span className="text-slate-600">{method}</span>{" "}
                <span className="text-ember">{formatMoney(amountMinor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StaffManagement() {
  const queryClient = useQueryClient();
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: ownerApi.listUsers });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleName, setRoleName] = useState("WAITER");
  const [password, setPassword] = useState("");

  const createMutation = useMutation({
    mutationFn: () => ownerApi.createUser({ username, displayName, roleName, password }),
    onSuccess: () => {
      setUsername("");
      setDisplayName("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? ownerApi.disableUser(id) : ownerApi.enableUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <div className="docket docket-neutral p-4">
        <h2 className="font-display text-lg text-paper mb-3">Staff</h2>
        <div className="space-y-2">
          {users?.map((u) => (
            <div key={u.id} className="flex items-center justify-between bg-slate-900/60 rounded-md p-3">
              <div>
                <div className="text-paper font-medium">{u.displayName}</div>
                <div className="text-slate-600 text-xs">@{u.username}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={u.isActive ? "text-sage text-sm" : "text-brick text-sm"}>
                  {u.isActive ? "Active" : "Disabled"}
                </span>
                <button
                  onClick={() => toggleMutation.mutate({ id: u.id, active: u.isActive })}
                  className="tap-target px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
                >
                  {u.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="docket docket-neutral p-4">
        <h2 className="font-display text-lg text-paper mb-3">Add Staff</h2>
        <div className="grid grid-cols-2 gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            className="tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
          />
          <select
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            className="tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
          >
            {["MANAGER", "WAITER", "KITCHEN", "CASHIER", "TAKEOUT"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Temporary password"
            className="tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
          />
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!username || !displayName || !password || createMutation.isPending}
          className="mt-3 tap-target px-4 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
        >
          Create Account
        </button>
        {createMutation.isError && <p className="text-brick text-sm mt-2">{(createMutation.error as any)?.message}</p>}
      </div>
    </div>
  );
}

function RestaurantSettings() {
  const queryClient = useQueryClient();
  const { data: restaurant } = useQuery({ queryKey: ["restaurant"], queryFn: ownerApi.getRestaurant });
  const [name, setName] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const updateMutation = useMutation({
    mutationFn: () => ownerApi.updateRestaurant({ name: name || undefined }, confirmation),
    onSuccess: () => {
      setConfirmation("");
      queryClient.invalidateQueries({ queryKey: ["restaurant"] });
    },
  });

  return (
    <div className="docket docket-urgent p-4">
      <h2 className="font-display text-lg text-paper mb-1">Restaurant Identity</h2>
      <p className="text-slate-600 text-sm mb-4">Critical action — requires confirmation passphrase.</p>
      <div className="space-y-2">
        <div>
          <label className="text-sm text-slate-600">Current name</label>
          <p className="text-paper font-medium">{restaurant?.name}</p>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New restaurant name"
          className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
        />
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Critical action passphrase"
          className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
        />
        <button
          onClick={() => updateMutation.mutate()}
          disabled={!name || !confirmation || updateMutation.isPending}
          className="tap-target px-4 bg-brick hover:bg-brick-dark disabled:opacity-40 text-paper font-semibold rounded-md"
        >
          Update Identity
        </button>
        {updateMutation.isError && <p className="text-brick text-sm">{(updateMutation.error as any)?.message}</p>}
        {updateMutation.isSuccess && <p className="text-sage text-sm">Updated.</p>}
      </div>
    </div>
  );
}

function AuditLog() {
  const { data: logs } = useQuery({ queryKey: ["audit"], queryFn: ownerApi.listAuditLogs });
  return (
    <div className="docket docket-neutral p-4">
      <h2 className="font-display text-lg text-paper mb-3">Audit Log</h2>
      <div className="space-y-1 max-h-[70vh] overflow-y-auto font-mono text-xs">
        {logs?.map((entry) => (
          <div key={entry.id} className="flex justify-between border-b border-slate-800 py-1.5">
            <span className="text-ember">{entry.action}</span>
            <span className="text-slate-600">{entry.entityType}</span>
            <span className="text-slate-600">{new Date(entry.createdAt * 1000).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataBackup() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedInfo, setExportedInfo] = useState<{ filename: string; sizeBytes: number } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [step, setStep] = useState<"pick" | "confirm">("pick");
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);

  const exportMutation = useMutation({
    mutationFn: backupApi.export,
    onSuccess: (result) => {
      downloadExport(result);
      setExportedInfo({ filename: result.filename, sizeBytes: result.sizeBytes });
      setExportError(null);
    },
    onError: (err: any) => setExportError(err?.message ?? "Export failed."),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a backup file first.");
      const data = await fileToBase64(file);
      return backupApi.import(data, confirmation);
    },
    onSuccess: (result) => {
      setImportSummary(result.tables);
      // The restore may have replaced the currently logged-in account
      // entirely (or its password, permissions, or branch) — the safest
      // thing to do is force a fresh login rather than assume this
      // session is still meaningfully valid.
      setTimeout(() => {
        logout();
        navigate("/login");
      }, 3000);
    },
  });

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <div className="docket docket-neutral p-4">
        <h2 className="font-display text-lg text-paper mb-1">Export Backup</h2>
        <p className="text-slate-600 text-sm mb-4">
          Downloads the entire database — every order, bill, user, and menu item — as a single file you can store
          somewhere safe.
        </p>
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="tap-target px-4 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
        >
          {exportMutation.isPending ? "Preparing…" : "Download Backup"}
        </button>
        {exportError && <p className="text-brick text-sm mt-2">{exportError}</p>}
        {exportedInfo && (
          <p className="text-sage text-sm mt-2">
            Downloaded {exportedInfo.filename} ({formatBytes(exportedInfo.sizeBytes)}).
          </p>
        )}
      </div>

      <div className="docket docket-urgent p-4">
        <h2 className="font-display text-lg text-paper mb-1">Restore Backup</h2>
        <p className="text-slate-600 text-sm mb-4">
          Critical action — replaces <span className="text-brick font-semibold">everything</span> currently in the
          database with the contents of the file you upload, including staff accounts and passwords. This cannot be
          undone from here. Requires the critical action passphrase.
        </p>

        {importSummary ? (
          <div className="space-y-2">
            <p className="text-sage text-sm">Restore complete. Row counts in the restored database:</p>
            <div className="grid grid-cols-2 gap-1 font-mono text-xs text-slate-600">
              {Object.entries(importSummary).map(([table, count]) => (
                <div key={table} className="flex justify-between bg-slate-900/60 rounded px-2 py-1">
                  <span>{table}</span>
                  <span className="text-paper">{count}</span>
                </div>
              ))}
            </div>
            <p className="text-slate-600 text-sm">Signing you out so you can log back in against the restored data…</p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="file"
              accept=".sqlite,.db,application/octet-stream"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStep("pick");
              }}
              className="tap-target w-full bg-slate-900 border border-slate-700 rounded-md px-3 text-paper file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-slate-800 file:text-paper"
            />

            {step === "pick" && (
              <button
                onClick={() => setStep("confirm")}
                disabled={!file}
                className="tap-target px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-paper font-semibold rounded-md"
              >
                Continue
              </button>
            )}

            {step === "confirm" && file && (
              <div className="space-y-2 border-t border-slate-800 pt-3 mt-2">
                <p className="text-brick text-sm font-medium">
                  You are about to overwrite the live database with "{file.name}". Everyone currently using the
                  system, including you, may be signed out. Are you sure?
                </p>
                <input
                  type="password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Critical action passphrase"
                  className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => importMutation.mutate()}
                    disabled={!confirmation || importMutation.isPending}
                    className="tap-target px-4 bg-brick hover:bg-brick-dark disabled:opacity-40 text-paper font-semibold rounded-md"
                  >
                    {importMutation.isPending ? "Restoring…" : "Yes, restore this backup"}
                  </button>
                  <button
                    onClick={() => {
                      setStep("pick");
                      setFile(null);
                      setConfirmation("");
                    }}
                    className="tap-target px-4 bg-slate-800 hover:bg-slate-700 text-paper rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {importMutation.isError && (
              <p className="text-brick text-sm">{(importMutation.error as any)?.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OwnerDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <Shell tab={tab} setTab={setTab}>
      {tab === "overview" && <Overview />}
      {tab === "staff" && <StaffManagement />}
      {tab === "settings" && <RestaurantSettings />}
      {tab === "audit" && <AuditLog />}
      {tab === "data" && <DataBackup />}
    </Shell>
  );
}

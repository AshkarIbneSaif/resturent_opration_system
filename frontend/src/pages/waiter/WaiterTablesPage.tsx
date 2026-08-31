import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { tablesApi } from "../../api/ros";
import type { RestaurantTable } from "../../api/ros";
import { WaiterShell } from "./WaiterShell";

const STATUS_STYLES: Record<RestaurantTable["status"], { docket: string; label: string }> = {
  AVAILABLE: { docket: "docket-ready", label: "Available" },
  OCCUPIED: { docket: "docket-pending", label: "Occupied" },
  RESERVED: { docket: "docket-neutral", label: "Reserved" },
  BILL_REQUESTED: { docket: "docket-urgent", label: "Bill requested" },
  OUT_OF_SERVICE: { docket: "docket-neutral", label: "Out of service" },
};

export default function WaiterTablesPage() {
  const navigate = useNavigate();
  const { data: tables, isLoading } = useQuery({ queryKey: ["tables"], queryFn: tablesApi.list });

  return (
    <WaiterShell title="Tables">
      {isLoading && <p className="text-slate-600 p-4">Loading tables…</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
        {tables
          ?.filter((t) => t.isActive)
          .map((table) => {
            const style = STATUS_STYLES[table.status];
            const selectable = table.status === "AVAILABLE" || table.status === "OCCUPIED";
            return (
              <button
                key={table.id}
                disabled={!selectable}
                onClick={() => navigate(`/waiter/tables/${table.id}/menu`)}
                className={`docket ${style.docket} p-4 text-left tap-target disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform`}
              >
                <div className="font-display text-2xl text-paper">{table.tableNumber}</div>
                <div className="text-xs text-slate-600 mt-1">Seats {table.capacity}</div>
                <div className="text-sm mt-2 font-medium">{style.label}</div>
              </button>
            );
          })}
      </div>
      {tables?.length === 0 && !isLoading && (
        <p className="text-slate-600 p-4">No tables configured yet — ask a manager to add tables.</p>
      )}
    </WaiterShell>
  );
}

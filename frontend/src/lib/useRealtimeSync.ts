import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/authStore";
import { API_BASE_URL } from "../api/client";

/**
 * Subscribes to the central event bus (spec #40) and invalidates the
 * relevant react-query caches so every connected screen — waiter, kitchen,
 * cashier — reflects order/table/menu changes within seconds, without
 * polling.
 */
export function useRealtimeSync() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!session) return;

    const socket = io(API_BASE_URL, { auth: { token: session.token } });
    socketRef.current = socket;

    const orderEvents = [
      "order.created",
      "order.confirmed",
      "order.sent_to_kitchen",
      "order.preparing",
      "order.ready",
      "order.served",
      "order.bill_requested",
      "order.billed",
      "order.paid",
      "order.completed",
      "order.cancelled",
      "order.voided",
      "order.item_status_changed",
    ];
    const handleOrderEvent = () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    };
    for (const evt of orderEvents) socket.on(evt, handleOrderEvent);

    socket.on("menu.item_unavailable", () => queryClient.invalidateQueries({ queryKey: ["menu"] }));
    socket.on("menu.item_available", () => queryClient.invalidateQueries({ queryKey: ["menu"] }));
    socket.on("table.status_changed", () => queryClient.invalidateQueries({ queryKey: ["tables"] }));
    socket.on("payment.created", () => queryClient.invalidateQueries({ queryKey: ["orders"] }));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session, queryClient]);
}

import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env";
import { createApp } from "./app";
import { attachSocketServer } from "./realtime/events";
import { verifySessionToken } from "./domain/identity/token";
import { initDb } from "./infra/db/client";

async function main() {
  await initDb();

  const app = createApp();
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  // Real-time connections authenticate with the same JWT issued at login
  // (spec #17: kitchen/waiter interfaces communicate through the central
  // application, never directly with each other).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const payload = verifySessionToken(token);
      (socket.data as Record<string, unknown>).session = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    const session = socket.data.session as { branchId: string; roleName: string };
    socket.join(`branch:${session.branchId}`);
    socket.join(`role:${session.roleName}`);
  });

  attachSocketServer(io);

  httpServer.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`ROS backend listening on http://${env.SERVER_HOST}:${env.SERVER_PORT} [${env.APP_ENV}]`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", err);
  process.exit(1);
});

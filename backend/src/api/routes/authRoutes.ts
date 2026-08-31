import { Router } from "express";
import { z } from "zod";
import { login, AuthError } from "../../domain/identity/authService";
import { authenticate } from "../middleware/auth";
import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { users, roles } from "../../infra/db/schema";
import { getPermissionsForRole } from "../../domain/identity/authService";

export const authRoutes = Router();

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRoutes.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten() } });
  }
  try {
    const result = await login(parsed.data.username, parsed.data.password, req.ip);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      // Deliberately generic message for NOT_FOUND/BAD_PASSWORD so login
      // does not leak which usernames exist; INACTIVE is explicit per FR-003.
      const message = err.code === "INACTIVE" ? err.message : "Invalid username or password.";
      return res.status(401).json({ error: { code: err.code, message } });
    }
    throw err;
  }
});

// Logout is client-side token discard for a stateless JWT MVP. Documented
// assumption (OPEN_QUESTIONS.md doesn't cover session revocation): a
// server-side token blacklist/rotation can be added later without changing
// this route's contract.
authRoutes.post("/logout", authenticate, (req, res) => {
  res.status(200).json({ ok: true });
});

authRoutes.get("/me", authenticate, (req, res) => {
  const session = req.session!;
  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  const role = db.select().from(roles).where(eq(roles.id, session.roleId)).get();
  if (!user || !role) return res.status(404).json({ error: { code: "NOT_FOUND" } });
  res.status(200).json({
    user: { id: user.id, username: user.username, displayName: user.displayName, branchId: user.branchId },
    role: role.name,
    permissions: getPermissionsForRole(role.id),
  });
});

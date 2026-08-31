import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export interface SessionTokenPayload {
  userId: string;
  branchId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, env.AUTH_SECRET, { expiresIn: `${env.AUTH_TOKEN_TTL_HOURS}h` });
}

export function verifySessionToken(token: string): SessionTokenPayload {
  return jwt.verify(token, env.AUTH_SECRET) as SessionTokenPayload;
}

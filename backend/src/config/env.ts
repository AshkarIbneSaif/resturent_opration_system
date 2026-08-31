import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVER_HOST: z.string().default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().default(4000),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().default(12),
  CRITICAL_ACTION_PASSPHRASE: z.string().min(4),
  CURRENCY_CODE: z.string().default("BDT"),
  CURRENCY_SYMBOL: z.string().default("৳"),
  DECIMAL_PLACES: z.coerce.number().default(2),
  RESTAURANT_TIMEZONE: z.string().default("Asia/Dhaka"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration — check .env against .env.example");
}

export const env = parsed.data;

// UI must never expose currency switching (FR-090..092) — this object is the
// single, deployment-fixed source used by formatters and receipt rendering.
export const currency = Object.freeze({
  code: env.CURRENCY_CODE,
  symbol: env.CURRENCY_SYMBOL,
  decimalPlaces: env.DECIMAL_PLACES,
});

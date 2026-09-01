# ROS Backend — Production Deployment

The backend is a long-running Express + Socket.IO server. It should be deployed as a persistent Node service, not as a Vercel static/frontend project.

## Recommended production layout

- Frontend: Vercel
- Backend: Railway Node service
- Database: current sql.js SQLite database on a Railway persistent volume
- Realtime: Socket.IO on the same Railway backend service

Railway supports Express services, generated public domains, health checks, and persistent volumes. For a larger multi-instance production deployment, migrate the database layer from sql.js/SQLite to PostgreSQL before enabling horizontal scaling.

## Railway service configuration

Set the Railway service root directory to:

```text
/backend
```

The repository already contains `backend/railway.json` with:

- build: `npm ci && npm run build`
- pre-deploy migration: `npm run migrate`
- start: `npm start`
- health check: `/health`
- automatic restart on failure

## Persistent volume

Add a Railway Volume to the backend service and mount it at:

```text
/data
```

The database must live on this volume. Do not use `/tmp` or an ephemeral application directory for production data.

## Production environment variables

Set these in Railway Variables:

```text
DATABASE_URL=file:/data/ros.db
APP_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=${{PORT}}
AUTH_SECRET=<random-secret-at-least-32-bytes>
AUTH_TOKEN_TTL_HOURS=12
CRITICAL_ACTION_PASSPHRASE=<strong-random-passphrase>
CURRENCY_CODE=BDT
CURRENCY_SYMBOL=৳
DECIMAL_PLACES=2
RESTAURANT_TIMEZONE=Asia/Dhaka
```

Do not commit production secrets to Git.

## First deployment

After the service is deployed and the volume is mounted, the Railway pre-deploy command runs the migrations automatically.

Then run the owner bootstrap once from the Railway service shell:

```bash
npm run bootstrap
```

If you want a known initial owner password, set it only for that bootstrap execution:

```bash
OWNER_BOOTSTRAP_PASSWORD="<strong-password>" npm run bootstrap
```

Remove/unset the bootstrap password variable after the owner account has been created.

## Verify

Open:

```text
https://<railway-domain>/health
```

Expected response:

```json
{"ok":true}
```

Then configure the Vercel frontend variable:

```text
VITE_API_BASE_URL=https://<railway-domain>
```

Redeploy the frontend after changing the variable.

## Important production limitation

The current database implementation is sql.js backed by a SQLite file. It is safe for a single persistent backend instance when the database file is on a persistent volume. It is not appropriate for multiple horizontally-scaled backend instances because each process keeps its own in-memory database.

For future scale-out, replace the sql.js database client/schema adapter with PostgreSQL and use PostgreSQL as the shared source of truth.

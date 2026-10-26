# Neon Free + the existing Vercel project

**Keep the Vercel project already connected to this GitHub repository.** Do not create a second site or move to Render. A push/merge to `main` should trigger its existing production deployment, provided `main` is still the configured Production Branch.

This repository now includes the Vite frontend and three same-origin Vercel Node.js functions. No separate backend URL, desktop installation, VPN, or local server is needed by visitors.

> Repository changes do not provision a Neon account or configure Vercel secrets. Until you complete the dashboard steps below and redeploy, the site explicitly remains a **browser-only demo**. A successful Vercel build alone does not prove the database is connected.

## 1. Create or connect Neon Free

1. Open [Neon](https://console.neon.tech/) in your own account and create a project on the **Free** plan, or use an existing Free project. Choose an available region close to your users.
2. In **Connect**, copy the PostgreSQL connection string. Prefer the pooled endpoint (the hostname contains `-pooler`) and keep `sslmode=require` and any supplied `channel_binding=require` parameter.
3. Alternatively, use the Neon integration in your **existing** Vercel project's Storage/Marketplace area. Verify the selected plan is Free and the connection is attached to this project, not a new frontend.
4. Keep credentials private. Do not put the connection string in an issue, chat, source file, `vercel.json`, or a `VITE_*` variable.

The server uses `@neondatabase/serverless` over HTTPS; it does not open a permanent TCP connection or keep Neon awake. On first use it idempotently creates the runtime tables and indexes defined in [`neon.sql`](neon.sql). The Neon database-owner role can do this; a restricted role may need an owner to run the schema initializer first. The older [`schema.sql`](schema.sql) is a **Supabase-specific future reference**, not the schema used by this deployment; do not run it on Neon.

### If you are moving from Supabase or another existing database

The application is already wired to Neon; `DATABASE_URL` must point at the Neon PostgreSQL endpoint, not a Supabase URL. The active app stores a versioned workspace snapshot in `orbit_workspace` plus login limits in `orbit_login_limits`. It does **not** automatically translate the legacy relational tables in `schema.sql`. For a fresh Neon project, use `npm run db:init` (it creates the schema and seeds only if empty). To move existing app data, export a JSON backup from the app and use `npm run db:restore` against Neon. If your source has only raw Supabase relational rows and no Orbit backup, those rows need an explicit data transformation to the current `StoreState` format; do not run the Supabase SQL file on Neon or assume a direct SQL copy is safe.

## 2. Configure the existing Vercel project

Open **Project → Settings → Environment Variables** and add these as sensitive, **server-only** variables:

| Variable | Value | Needed |
| --- | --- | --- |
| `DATABASE_URL` | Neon PostgreSQL connection string with `sslmode=require` | Yes |
| `WORKSPACE_PASSWORD` | Unique random password, at least 16 characters; share privately with trusted pilot users | Yes |
| `SESSION_SECRET` | Independent random secret, at least 32 characters; never share with users | Yes |
| `PUBLIC_ORIGIN` | Optional exact HTTPS origin, no trailing slash | Usually omit |

Generate each secret separately in a terminal on your own machine:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Run it twice: use one result for the workspace password and the other for the session secret. Do not reuse the database password.

- Set production credentials for **Production**. A merge to `main` uses that environment.
- For Preview/Development, use a **separate Neon database or branch** and separate secrets. Do not expose production data to arbitrary PR previews. Never add secrets to fork builds.
- If the Neon integration creates a prefixed variable instead of `DATABASE_URL`, map its connection-string value to `DATABASE_URL` in Vercel's dashboard.
- Leave `PUBLIC_ORIGIN` unset unless you need to pin a custom domain. By default, each Vercel deployment accepts only its own origin, including preview URLs. Pinning the production origin will intentionally reject writes from other aliases/previews.
- Keep Framework Preset **Vite**, build `npm run build`, output `dist`, Node.js **22.x**, and Production Branch **main**. These build defaults are also in `vercel.json` and `package.json`.
- After adding/changing variables, **redeploy**. Existing deployments do not acquire new environment values automatically.

There are no frontend database credentials. Browser requests use relative `/api/config`, `/api/session`, and `/api/workspace` URLs, so the same build works on your existing public Vercel domain and custom domains.

### Optional: initialise the database before the first page load

The first authenticated visit seeds the pilot dataset, so the very first page view pays for schema creation plus a multi-megabyte write. To move that work ahead of any user access (recommended for a fresh Neon database), run the one-shot initialiser from a machine with the same server variables:

```bash
cp .env.example .env     # DATABASE_URL, WORKSPACE_PASSWORD, SESSION_SECRET
npm run db:init -- --dry-run   # verify Neon + ensure schema; does not seed workspace data
npm run db:init                # seed revision 1 only if the workspace is empty
```

`db:init -- --dry-run` may create any missing schema tables while checking the connection, but it does not seed workspace data. The normal `db:init` is idempotent and safe to repeat or run while the site is live: an existing workspace is never replaced, and if a first visit wins the race the CLI reports the winner's revision instead of overwriting it. The seeded payload is validated against the API schema and the 3 MB limit *before* anything is written, and failures print no credentials or workspace data. Do not run the seed command against a database you intend to restore from a backup — use `npm run db:restore` for that.

## 3. Verify from two devices

1. Open the existing production URL in a new/private window. You should see **One workspace. Any device.**, not the dashboard or the browser-only demo banner.
2. Enter the workspace password. If you did not run `npm run db:init`, the first successful visit seeds the shared pilot dataset exactly once; concurrent first visits cannot reset one another's workspace. Either way the seed happens only once and every later load or refresh is a plain read.
3. Confirm the blue status panel says **Shared workspace · Saved to Neon**.
4. Create a test activity and wait for **Saved to Neon** before closing the tab.
5. Open the same URL on another computer/phone, sign in, and confirm the activity exists. In an already open tab, click **Refresh**. Clean tabs also reload shared data on refocus after at least a minute; there is no continuous background polling.
6. Switch personas on one device. The other device's selected persona should not change.
7. If two devices edit the same saved revision, the first save wins; the other shows a conflict and retains its unsaved edits. **Export backup**, then **Discard & load latest**, and reapply the intended changes. It will not silently overwrite the other person's work.

Anyone on the internet can reach the HTTPS URL on a modern browser. Only people given the workspace password can access the shared data. If Vercel Deployment Protection is enabled, the owner must configure it appropriately for the intended audience; a Vercel login wall is separate from the app's password gate. Do not turn the application password off to make the site public.

## 4. Local development

Requires Node 22.x:

```bash
npm ci
cp .env.example .env
# Edit .env locally if testing a separate Neon development database.
npm run dev
# Website + API on http://localhost:5173 (bound to 0.0.0.0 for hosted previews).
npm run check
```

With no database variables, local development and the deployed site are clearly labelled browser-only demos. If a database URL is present but authentication variables are missing/invalid, the API returns a setup error instead of silently changing storage modes. `npm run preview` and GitHub Pages serve **only** the static browser demo; use `npm run dev` or Vercel to exercise the API.

## 5. Free-tier limits and suitability

- Choose **Neon Free**, not a paid plan, and monitor the current compute, storage, and transfer allowances in the dashboard. Scale-to-zero and cold starts are normal. There are no paid resources or keep-alive cron jobs declared by this repository.
- **Vercel Hobby has eligibility restrictions, including personal/non-commercial use.** An internal business/enterprise portal may require an eligible paid Vercel plan; do not assume it is free just because it builds. Keep your existing deployment, but check your plan and terms before using this for business. Render Free can be evaluated separately if Vercel Hobby is unsuitable; this change does not deploy to Render.
- Both services have quotas; there is no guarantee of unlimited free usage, an always-awake database, or a free production SLA. See [Neon pricing](https://neon.com/pricing), [Vercel Hobby](https://vercel.com/docs/plans/hobby), and [Vercel limits](https://vercel.com/docs/limits) for current terms rather than relying on fixed quota numbers in this repository.
- This is a **single shared pilot workspace**, stored as a versioned JSONB snapshot. Requests are capped at **3 MB**, below Vercel's function request-body limit. The starter dataset is roughly 1.3 MB. Each save writes the full snapshot, so bandwidth and contention grow with usage. Move to record-level tables/API operations before increasing the dataset or concurrent users substantially.
- Password holders have **full read/write access to every record**. Persona switching and browser visibility filters are not server-side authorization. Do not store sensitive employee, payroll, or customer data until individual authentication and server-enforced permissions are implemented.
- Sessions are HttpOnly, SameSite=Strict, Secure in production, expire after 12 hours, and are invalidated by rotating either authentication secret and redeploying. Password attempts are limited in PostgreSQL across function instances (20 attempts per address per 15 minutes); this is not enterprise identity management.
- Outlook/Google OAuth, external calendar writes, scheduled escalation emails, immutable audit logging, and SSO remain unimplemented. Existing calendar connector screens are simulations; `.ics` exports work.

## 6. Backups and recovery

Use **Master setup → Export backup**, or **Export backup** in the shared status panel during a save problem. Save the JSON somewhere private, not in Git. The browser does **not** cache shared company data in localStorage; only this device's persona ID is stored there. Unsaved changes remain in the tab's memory, so export them before closing, signing out, or discarding a conflict. Previously saved local demo data is not automatically uploaded to Neon.

To restore a full exported JSON backup as the database owner:

1. Ask pilot users to stop editing; export the current state first.
2. Put the intended target database and secrets in your local ignored `.env` file.
3. Run:

```bash
npm run db:restore -- /absolute/path/to/orbit-backup-YYYY-MM-DD.json --confirm
```

The script validates the backup, removes the local persona setting, and saves it using the latest database revision. If another save races with the restore, it refuses to overwrite it. It prints no credentials or workspace contents. This is an owner operation, not a UI privilege granted to individual employees. Validate the restored data on a second device.

For important data, also arrange provider/database backups and test a restore. An exported snapshot is not point-in-time recovery, and its audit entries are not tamper-proof.

## 7. Troubleshooting

| Symptom | Action |
| --- | --- |
| Amber **Browser-only demo** banner | Check `DATABASE_URL` is set for the correct Vercel environment, then redeploy. Static-only hosts cannot provide the shared API. |
| **Workspace setup is incomplete** | Check the URL is Neon PostgreSQL with `sslmode=require`, password is ≥16 characters and session secret ≥32. Redeploy after fixes. |
| **Database temporarily unavailable** | A sleeping Neon instance may wake on the first request. The app retries up to five times with backoff, then pauses instead of refreshing forever; use **Refresh now** for a deliberate retry. If Neon keeps failing, verify the Vercel `DATABASE_URL` points to the right Neon project/branch, check Neon status/quotas, and redeploy after changing environment variables. Unsaved edits remain in the tab. |
| **Neon schema or permission error** | The API reports this as non-retryable. Run `npm run db:init -- --dry-run`, then `npm run db:init` locally using the target Neon `DATABASE_URL` and a database-owner role. The initializer is idempotent and never replaces an existing workspace. Alternatively apply [`neon.sql`](neon.sql) in Neon SQL Editor. Do not run the Supabase-specific `schema.sql`. |
| **Neon credential or endpoint error** | Check the server-only `DATABASE_URL` value, role password, Neon project and branch. Confirm the hostname ends in `.neon.tech`, includes `sslmode=require`, and redeploy Vercel. Do not keep refreshing while the URL/credentials are wrong. |
| **Cross-origin requests** error | Remove or correct `PUBLIC_ORIGIN`; use one consistent domain rather than mixing preview and production URLs. |
| **Session expired** | Export unsaved edits, then sign out and sign back in. A secret rotation invalidates all old sessions. |
| **Newer changes on another device** | Export a backup, load latest, then reapply changes. There is intentionally no force-overwrite button. |
| Snapshot rejected / too large | Do not keep retrying blindly. Export a backup, fix invalid master records, or move to record-level storage. |
| Build succeeds but app asks for a Vercel account | Review Vercel Deployment Protection settings for the intended audience. |

Do not paste connection strings, cookies, passwords, or `.env` files into support messages.

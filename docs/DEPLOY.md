# Deploying Bayana

Step-by-step setup for **staging** and **production** (SPEC section 16). Local development is in `docs/RUN_LOCAL.md`; backups and restores are in `docs/RESTORE.md`.

| Environment | Web (Vercel)        | API (Render)            | Database                  | Payments                   |
|-------------|---------------------|-------------------------|---------------------------|----------------------------|
| Local       | localhost:3000      | localhost:4000          | Docker Postgres 16        | disabled or test           |
| Staging     | staging.bayana.in   | api.staging.bayana.in   | Neon project `bayana-staging` | test                   |
| Production  | bayana.in           | api.bayana.in           | Neon project `bayana-prod`    | disabled, then live only after section 9 |

Staging deploys from the branch **`hosting-ready`** for now (render.yaml `branch:`, and the Vercel staging domain). Switch both to `main` once hosting-ready is merged.

Ground rules:
- Values live only in the host dashboards and your password manager. This repo holds names only (`render.yaml`, `.env.example` files).
- Never set `PAYMENT_MODE=live` or `LIVE_PAYMENTS_ACK` until every cost gate in section 9 is done and a restore drill has passed.
- Do staging first and pass all 12 checks in section 8 before touching production.
- Each environment gets its **own** `SESSION_SECRET`, `OTP_PEPPER` and `TICK_SECRET`. Generate each one with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 1. Rehearse locally first (already proven in Phase 11)

Before any account work, prove that the production image runs on your machine. Run these from the repository root in PowerShell, with Docker Desktop running.

```powershell
docker build -f apps/api/Dockerfile -t bayana-api:local .
```

Then create a rehearsal env file **outside the repo and outside OneDrive**, for example `C:\dev\secrets\rehearsal.env`:

```
NODE_ENV=production
APP_ENV=staging
TRUST_PROXY=1
WEB_ORIGINS=http://app.localtest.me:3200
SESSION_COOKIE_DOMAIN=.localtest.me
DATABASE_URL=postgres://bayana:bayana@host.docker.internal:5433/bayana_rehearsal
DATABASE_URL_DIRECT=postgres://bayana:bayana@host.docker.internal:5433/bayana_rehearsal
PAYMENT_MODE=disabled
EMAIL_TRANSPORT=smtp
SMTP_URL=smtp://host.docker.internal:1025
EMAIL_FROM=Bayana <hello@bayana.local>
SESSION_SECRET=<random>
OTP_PEPPER=<random>
TICK_SECRET=<random>
```

Production config refuses database names ending in `_dev` or `_test`, which is why a separate `bayana_rehearsal` database is used.

```powershell
docker exec bayana-postgres-1 psql -U bayana -d postgres -c "CREATE DATABASE bayana_rehearsal"   # once
docker run --rm --env-file C:\dev\secrets\rehearsal.env bayana-api:local node dist/src/migrate.js
docker run -d --name bayana-api-rehearsal --env-file C:\dev\secrets\rehearsal.env -p 4100:4000 bayana-api:local
curl.exe -s http://localhost:4100/health        # {"ok":true}
curl.exe -s http://localhost:4100/ready         # {"ok":true}  (proves the database works)
```

### Cookie rehearsal (SPEC 16.7 check 3, local)

This proves that the production cookie settings work across sub-domains. Staging uses `staging.bayana.in` and `api.staging.bayana.in` (cookie domain `.staging.bayana.in`); locally the same shape is `app.localtest.me` and `api.localtest.me` (cookie domain `.localtest.me`).

```powershell
pnpm.cmd --filter @bayana/web test:cookies
```

The script:
- runs a real Chromium (full build, new headless mode);
- maps `*.localtest.me` to 127.0.0.1 inside the browser, so no hosts file or internet is needed;
- treats both origins as secure, so the `Secure` cookie behaves as it does on HTTPS.

It signs up through the container (the code comes from Mailpit and is then deleted) and checks each of the following:
- the cookie is `Domain=.localtest.me; HttpOnly; Secure; SameSite=Lax`;
- the web host receives the cookie on navigation;
- the web server forwards it with `apps/web/lib/server-api.ts`, and the API answers `/v1/auth/me` as that user;
- the session survives a reload;
- another site never gets the cookie;
- logout kills the session.

To rehearse with the real Next.js app instead, add these lines to `C:\Windows\System32\drivers\etc\hosts` (an administrator edit):

```
127.0.0.1 app.localtest.me
127.0.0.1 api.localtest.me
```

Then:
1. Build the web app with `NEXT_PUBLIC_API_URL=http://api.localtest.me:4100` and `NEXT_PUBLIC_SITE_URL=http://app.localtest.me:3200`.
2. Run `next start -p 3200`.
3. Browse at `http://app.localtest.me:3200`. Chrome only stores a `Secure` cookie over plain http when started with `--unsafely-treat-insecure-origin-as-secure=http://app.localtest.me:3200,http://api.localtest.me:4100 --user-data-dir=<temp folder>`.

Clean up with `docker rm -f bayana-api-rehearsal`.

---

## 2. Neon (database)

1. Create a project in an **Asia region** (Singapore, `ap-southeast-1`) running PostgreSQL 16. Use one project for staging and a separate one for production.
2. In the Neon dashboard, copy both connection strings:
   - **Pooled** (the host contains `-pooler`). This is the API's `DATABASE_URL`.
   - **Direct** (no `-pooler`). This is `DATABASE_URL_DIRECT`, used by migrations, backups and the check below.
   - Both must end in **`?sslmode=require`**, as Neon shows them. Without it, `pg` connects without TLS and Neon refuses the connection.
   - The API's pool (`apps/api/src/database.ts`) is sized for this: at most 10 connections, idle ones closed after 10 s, and up to 15 s to connect, because a suspended Neon compute takes a few seconds to wake. A connection Neon drops while idle is logged (`database.idle_client_error`) and replaced; it never crashes the API. `/ready` retries its read-only check once after a dropped connection.
3. Prove compatibility. The check runs `CREATE EXTENSION btree_gist`, tests an exclusion constraint like the double-booking guard, and tests `pg_advisory_xact_lock` and `SET LOCAL`. Everything is rolled back, so it is safe to repeat.
   ```powershell
   $env:NEON_CHECK_URL = "<direct connection string>"
   pnpm.cmd db:check-neon
   Remove-Item Env:NEON_CHECK_URL
   ```
   All four lines must say `PASS`. `server_version_num` must be 16xxxx; if Neon gives 17, set `PG_MAJOR: "17"` in `.github/workflows/backup.yml`.
4. PgBouncer rules (enforced by `apps/api/test/unit/pgbouncer-safety.test.ts`): the runtime may use only `pg_advisory_xact_lock`, `SET LOCAL` and `set_config(..., true)`, and never `LISTEN`/`NOTIFY`. `migrate.ts` alone takes a session lock, and it always uses the direct URL.
5. Optional hardening, carried over from the old `docs/DEPLOYMENT.md`: give the runtime its own role that cannot `UPDATE` or `DELETE` `ledger_entries`, and keep the owner role for migrations only. Rehearse this on staging first, because a missing grant shows up as a runtime 500.

## 3. Migrations (from your laptop, never from the API process)

Migrations run from the same image Render will run, against the **direct** URL. `migrate.js` reads only `NODE_ENV` and the database URL (`apps/api/src/db-config.ts`), so the env file needs just two lines. The name check still refuses `_dev` and `_test` databases under `NODE_ENV=production`.

1. Put these in `C:\dev\secrets\staging-migrate.env`, outside the repo and OneDrive:
   ```
   NODE_ENV=production
   DATABASE_URL_DIRECT=<Neon staging direct connection string, with ?sslmode=require>
   ```
2. Run:
   ```powershell
   docker build -f apps/api/Dockerfile -t bayana-api:local .
   docker run --rm --env-file C:\dev\secrets\staging-migrate.env bayana-api:local node dist/src/migrate.js --status   # read-only: lists pending
   docker run --rm --env-file C:\dev\secrets\staging-migrate.env bayana-api:local node dist/src/migrate.js            # applies them
   ```
3. Expect `Applied N migrations.` On later runs, expect `Checksums of applied migrations verified.`
4. Delete the env file afterwards, or keep it encrypted.

For production, take a backup first (see `docs/RESTORE.md`) whenever the pending list contains anything that drops or renames.

## 4. Render (API)

1. Push the branch containing `render.yaml` (`hosting-ready`) to GitHub.
2. In Render, go to **New > Blueprint**, pick the repo and the branch `hosting-ready`, and apply `render.yaml`. It creates `bayana-api-staging`:
   - deploys from `hosting-ready` (`branch:` in render.yaml; change it to `main` after the merge);
   - Docker runtime, free plan, Singapore;
   - health check `/health`;
   - `NODE_ENV=production` and `TRUST_PROXY=1` already set.
3. Render prompts for every `sync: false` variable. Enter the staging column from section 7.
4. Wait for the deploy, then check:
   ```powershell
   curl.exe -s https://bayana-api-staging.onrender.com/health
   curl.exe -s https://bayana-api-staging.onrender.com/ready
   ```
   Both should return `{"ok":true}`.
5. **Custom domain.** In the service's Settings > Custom Domains, add `api.staging.bayana.in`. Add the CNAME it shows in Cloudflare (section 6) as **DNS only (grey cloud)**, and wait for the certificate (Render issues it).
6. `TRUST_PROXY=1` is correct while Cloudflare is grey-clouded (only Render's proxy is in front). If you later turn the orange cloud on, set `TRUST_PROXY=2`.
7. Verify by signing in once, then running `SELECT host(ip) FROM sessions ORDER BY created_at DESC LIMIT 1;` in the Neon SQL editor. It must show your real public IP, not a Render address.

For production, copy the service in the Blueprint as `bayana-api-prod`, with `branch: main`, the production values and the domain `api.bayana.in`. Before the first live rupee, switch it to a paid always-on instance (section 9).

The free plan sleeps after 15 minutes idle and takes about a minute to wake. The web app's `/waking` page covers this (SPEC 16.6).

## 5. Vercel (web)

1. **Add New > Project**, then import the GitHub repo.
2. Set **Root Directory** to `apps/web`. Framework: Next.js. Leave **Include files outside the root directory** on; the app needs `packages/shared`.
3. Set these overrides:
   - **Install Command:** `pnpm install --frozen-lockfile`
   - **Build Command:** `pnpm --filter "@bayana/web..." build`. This builds `@bayana/shared` first; plain `next build` fails because `@bayana/shared` ships `dist/`.
   - **Node.js Version:** 22.x
4. Add the environment variables from section 7 (web rows):
   - Under **Preview**, use the staging values.
   - Under **Production**, use the production values.
   - `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing one.
5. Domains:
   - Staging: `staging.bayana.in`, assigned to the Git branch `hosting-ready` (Settings > Domains > Git Branch), with the staging values under **Preview**.
   - Production: `bayana.in`, plus `www.bayana.in` set to **Redirect to bayana.in (308)**.
   - **Vercel preview URLs (`*.vercel.app`) cannot talk to the API.** The API accepts writes only from an exact origin in `WEB_ORIGINS` and refuses any request the browser marks cross-site (`apps/api/src/origin-check.ts`). CORS is exact-match too (`apps/api/src/app.ts`), and the session cookie is scoped to the bayana.in domains. A preview deployment renders, but sign-in, booking and every API read fail. Adding a preview URL to `WEB_ORIGINS` does not help, because `*.vercel.app` is a different site. Test on the stable domains only: `staging.bayana.in` and `bayana.in`.
6. Vercel **Hobby** is non-commercial. It is fine for staging and personal testing, but production that earns money must move to Pro or another host first (section 9).

## 6. DNS (Cloudflare) — merge, don't replace

Zoho Mail already receives mail for `@bayana.in`. **Before changing anything:**
1. Export the zone (DNS > Records > Export).
2. Screenshot the existing MX, TXT and `_domainkey` records.

Keep every Zoho record exactly as it is.

| Type | Name | Content | Proxy | Purpose |
|------|------|---------|-------|---------|
| A | `@` | the IP Vercel shows for the apex (currently `76.76.21.21`) | DNS only | bayana.in → Vercel |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only | www → Vercel (redirects to apex) |
| CNAME | `staging` | `cname.vercel-dns.com` | DNS only | staging web |
| CNAME | `api` | `bayana-api-prod.onrender.com` (exact value from Render) | DNS only | production API |
| CNAME | `api.staging` | `bayana-api-staging.onrender.com` (exact value from Render) | DNS only | staging API (`api.staging.bayana.in`) |
| MX | `@` | **existing Zoho MX** (for India: `mx.zoho.in` 10, `mx2.zoho.in` 20, `mx3.zoho.in` 50) | — | keep unchanged |
| TXT | `@` | **one** SPF record: `v=spf1 include:zoho.in include:spf.brevo.com ~all` | — | merged SPF, see below |
| TXT | `zmail._domainkey` (your Zoho selector) | **existing Zoho DKIM** | — | keep unchanged |
| CNAME or TXT | `brevo1._domainkey`, `brevo2._domainkey` | exactly what Brevo's **Senders, Domains > bayana.in > Authenticate** page shows | DNS only | Brevo DKIM |
| TXT | `@` | `brevo-code:<value from Brevo>` | — | Brevo domain ownership |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@bayana.in; adkim=r; aspf=r; pct=100` | — | one DMARC record for both senders |

Rules:
- **Exactly one SPF record.** If a `v=spf1 include:zoho.in ~all` TXT exists, *edit* it to add `include:spf.brevo.com`. Never add a second `v=spf1` record; two SPF records fail SPF for everyone. Use the include Brevo's page shows if it differs, and keep the whole record under 10 DNS lookups.
- DKIM selectors differ (Zoho `zmail`, Brevo `brevo1`/`brevo2`), so both coexist.
- **Exactly one DMARC record.** If `_dmarc` already exists, keep its `rua` and edit it in place. Start with `p=none`. After two weeks of clean reports from both Zoho and Brevo mail, move to `p=quarantine`.
- If the zone has CAA records, they must allow `letsencrypt.org` and `pki.goog` for Vercel and Render certificates.
- The API and web records stay grey-clouded (DNS only) so certificates issue and `TRUST_PROXY=1` stays correct. Grey is also required for `api.staging.bayana.in`: it is two levels deep, and Cloudflare's free Universal SSL covers only one (`*.bayana.in`). An orange-clouded `api.staging` would need an Advanced Certificate.
- Verify:
  - Brevo's domain page shows all checks green.
  - Send one booking email to the address mail-tester.com gives you, and confirm SPF, DKIM and DMARC all pass (staging check 11).
  - Send one email from Zoho to Gmail and confirm "Show original" still shows SPF, DKIM and DMARC as PASS.

Brevo SMTP for the API is `SMTP_URL=smtp://<login>:<smtp-key>@smtp-relay.brevo.com:587`. URL-encode the login, because its `@` becomes `%40`. `EMAIL_FROM` must use the authenticated domain, for example `Bayana <bookings@bayana.in>`, with replies going to the Zoho mailbox.

## 7. Environment variable matrix

API variables are validated at startup (`apps/api/src/config-schema.ts`) and the API exits with names-only messages if anything is wrong. Web variables are validated by `apps/web/env-schema.ts` at build time.

### API (Render dashboard; locally `apps/api/.env`)

| Variable | Local | Staging | Production | Secret |
|----------|-------|---------|------------|--------|
| `NODE_ENV` | development | production (in render.yaml) | production (in render.yaml) | no |
| `APP_ENV` | local | staging | production | no |
| `PORT` | 4000 | set by Render | set by Render | no |
| `TRUST_PROXY` | 0 | 1 (in render.yaml) | 1 (in render.yaml) | no |
| `WEB_ORIGINS` | http://localhost:3000 | https://staging.bayana.in | https://bayana.in (add `,https://www.bayana.in` only if www is ever served instead of redirected) | no |
| `SESSION_COOKIE_DOMAIN` | empty (host-only) | .staging.bayana.in | .bayana.in | no |
| `SESSION_COOKIE_NAME` | empty (= bayana_session) | bayana_staging_session (in render.yaml) | bayana_session | no |
| `DATABASE_URL` | Docker `bayana_dev` | Neon staging **pooled** | Neon prod **pooled** | yes |
| `DATABASE_URL_DIRECT` | empty | Neon staging **direct** | Neon prod **direct** | yes |
| `DATABASE_URL_TEST` | Docker `bayana_test` | not set | not set | no |
| `SESSION_SECRET` | generated | new random | new random | yes |
| `OTP_PEPPER` | generated | new random | new random | yes |
| `TICK_SECRET` | generated | new random (= GitHub secret) | new random (= GitHub secret) | yes |
| `OPS_EMAIL` | optional | your inbox | your inbox | no |
| `EMAIL_TRANSPORT` | smtp (Mailpit) | smtp | smtp | no |
| `SMTP_URL` | smtp://localhost:1025 | Brevo SMTP URL | Brevo SMTP URL | yes |
| `EMAIL_FROM` | Bayana <hello@bayana.local> | Bayana Staging <bookings@bayana.in> | Bayana <bookings@bayana.in> | no |
| `PAYMENT_MODE` | disabled or test | test | disabled (live only after section 9) | no |
| `RAZORPAY_KEY_ID` | rzp_test_… | rzp_test_… | empty while disabled | no |
| `RAZORPAY_KEY_SECRET` | test secret | test secret | empty while disabled | yes |
| `RAZORPAY_WEBHOOK_SECRET` | from test webhook | from staging test webhook | empty while disabled | yes |
| `LIVE_PAYMENTS_ACK` | empty | **never set** | **never set** until section 9 | no |
| `HOLD_MINUTES`, `REQUEST_HOLD_HOURS`, `MIN_ADVANCE_PAISE` | defaults (15, 48, 10000) | defaults | defaults | no |
| `GOOGLE_CLIENT_ID` | from the local OAuth client (docs/GOOGLE_SETUP.md); empty turns Google off | staging OAuth client id | production OAuth client id | no |
| `GOOGLE_CLIENT_SECRET` | local client secret | staging client secret | production client secret | yes |
| `GOOGLE_REDIRECT_URI` | http://localhost:4000/v1/auth/google/callback | https://api.staging.bayana.in/v1/auth/google/callback | https://api.bayana.in/v1/auth/google/callback | no |

**Google sign-in per environment.** All three Google variables are needed together (`GOOGLE_CLIENT_ID` alone fails startup), and Google stays off while `GOOGLE_CLIENT_ID` is empty. Use one OAuth client per environment in Google Cloud (APIs & Services > Credentials, type "Web application"). Give each exactly one **Authorized redirect URI**, the value in the table, character for character. The path is the API's `/v1/auth/google/callback`, on the API host, not the web host. No JavaScript origins are needed: the flow is server-side (authorization code with PKCE). After Google returns, the API sends the browser to the **first** entry of `WEB_ORIGINS`, so the site origin must come first there. The consent screen must be **published** (or each tester added as a test user) before anyone outside the test list can sign in; see docs/GOOGLE_SETUP.md.

### Web (Vercel: Preview = staging, Production = production; locally `apps/web/.env.local`)

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `NEXT_PUBLIC_API_URL` | http://localhost:4000 | https://api.staging.bayana.in | https://api.bayana.in |
| `NEXT_PUBLIC_SITE_URL` | http://localhost:3000 | https://staging.bayana.in | https://bayana.in |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | empty or rzp_test_… | rzp_test_… | empty (the web build refuses live ids) |
| `SESSION_COOKIE_NAME` (server-only, not `NEXT_PUBLIC_`) | empty (= bayana_session) | bayana_staging_session | bayana_session |

`SESSION_COOKIE_NAME` must be identical on the API and the web app of one environment. The web server uses it to forward the visitor's session to the API (`apps/web/lib/server-api.ts`).

Every `NEXT_PUBLIC_*` value is public. Never put a secret there.

### GitHub Actions (Settings > Secrets and variables > Actions)

| Name | Kind | Used by | Value |
|------|------|---------|-------|
| `API_URL` | secret | tick.yml, nightly.yml | `https://api.staging.bayana.in` (no trailing slash) |
| `TICK_SECRET` | secret | tick.yml, nightly.yml | same as the API's `TICK_SECRET` |
| `JOBS_ENABLED` | variable | tick.yml, nightly.yml | `true` to switch the schedulers on |
| `BACKUP_DATABASE_URL`, `BACKUP_AGE_RECIPIENT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | secrets | backup.yml | see `docs/RESTORE.md` |
| `BACKUPS_ENABLED` | variable | backup.yml | `true` only when you decide to start backups |

**Cookie domains: why staging lives under `staging.bayana.in`.** The session cookie (`SESSION_COOKIE_NAME`: `bayana_session` in production, `bayana_staging_session` on staging) must reach both the web host and the API host, so it is set with a `Domain`:
- **Staging:** `Domain=.staging.bayana.in`. It is sent only to `staging.bayana.in` and `api.staging.bayana.in`, never to `bayana.in` or `api.bayana.in`, so a staging login can no longer reach production. With the old names (`api-staging.bayana.in`, cookie on `.bayana.in`), both environments would have shared one cookie scope.
- **Production:** `Domain=.bayana.in`. It covers `bayana.in` and `api.bayana.in`, and, because `staging.bayana.in` is a subdomain of `bayana.in`, the staging hosts as well.

The domain alone is therefore **one-way**: a browser signed in to production still sends its `.bayana.in` cookie to the staging hosts. **`SESSION_COOKIE_NAME`** closes the other direction. Staging names its cookie `bayana_staging_session`, and the staging API and web server read only that name, so the production `bayana_session` that arrives there is ignored. Tests prove it: `apps/api/test/integration/cookie-name.test.ts` (a valid token under the other name gets 401) and `apps/web/lib/session-forward.test.mjs` (only this environment's cookie is forwarded). The Google sign-in state cookie follows the same rule (`bayana_google` / `bayana_staging_google`). The production cookie's value still travels to the staging hosts, because browsers send it, but nothing there reads it, and logs redact cookies.

## 8. Staging go-live checklist (SPEC 16.7)

Run each check and record PASS or FAIL with the date.

| # | Check | How | Pass when |
|---|-------|-----|-----------|
| 1 | Health | `curl.exe -s https://api.staging.bayana.in/health` and `/ready` | both `{"ok":true}` |
| 2 | Accounts | signup, logout, password login, OTP login for one email | all four work |
| 2b | Google sign-in | "Continue with Google" on staging.bayana.in/login with a test user; then the same email by code; then Settings > Sign-in methods | lands on the dashboard (new vendors on /onboarding); the code login reaches the **same** account; one `users` row for the email |
| 3 | Cookies | sign in on staging.bayana.in, reload the dashboard | session survives reload and server fetch; cookie `bayana_staging_session` shows `Domain=.staging.bayana.in; Secure; HttpOnly; SameSite=Lax` in DevTools; no `bayana_session` cookie appears on bayana.in |
| 4 | Booking + test payment | book, pay with a Razorpay test card | HELD → PENDING → CONFIRMED, emails arrive, ledger correct |
| 5 | Race | double-click and two browsers on one slot | exactly one booking |
| 6 | Closed tab | close the tab right after paying | webhook confirms the booking |
| 7 | Late payment | let the hold expire, then pay | re-claim or refund path works |
| 8 | Cold start | wait 20 minutes idle, then open a page | `/waking` shows, then recovers |
| 9 | Webhook replay | suspend the Render service, pay, resume it so Razorpay's retries deliver the events (some more than once); then run `SELECT event_id, count(*) FROM webhook_events GROUP BY 1 HAVING count(*) > 1` and check the booking's ledger | no duplicate rows; one capture in the ledger |
| 10 | Scheduler | GitHub Actions > Jobs tick | ran in the last 30 minutes; admin health green |
| 11 | Email auth | mail-tester.com | SPF, DKIM, DMARC pass |
| 12 | No secrets | GitHub secret scanning, browser bundle search for `rzp_` secrets and `SESSION_SECRET`, Render log review | clean |

Razorpay test webhook: in the Razorpay **Test** dashboard, go to Webhooks and set the URL `https://api.staging.bayana.in/webhooks/razorpay`. This path has no `/v1` prefix (`apps/api/src/app.ts`); SPEC 16.5 shows an older one. Subscribe to `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and `refund.failed` (the same list as `docs/PAYMENTS_LOCAL.md`), and put the secret into `RAZORPAY_WEBHOOK_SECRET` on Render.

## 9. Cost gates before the first live rupee (SPEC 16.8)

`PAYMENT_MODE` stays `test` (staging) or `disabled` (production) until **every** row is done and a restore drill (`docs/RESTORE.md`) has passed.

| Gate | Why | Action | Approx cost | Done |
|------|-----|--------|-------------|------|
| Commercial hosting terms | Vercel Hobby is non-commercial | Vercel Pro, or host the web app elsewhere commercially | about 20 USD/month | ☐ |
| Always-on API | the free API sleeps and restarts; payments and webhooks need reliability | Render paid instance (Starter) for `bayana-api-prod` | about 7 USD/month and up | ☐ |
| Database safety | free Neon has short history and a small size limit | paid Neon plan with point-in-time restore, plus `backup.yml` enabled and a restore proven | plan-dependent | ☐ |
| Email volume | Brevo free caps at 300 a day | Brevo Starter | about 9 USD/month | ☐ |
| Payments live | KYC, settlement account, Route decision | Razorpay live activation | per-transaction fees | ☐ |
| Legal pages | policies must be accurate | lawyer reviews terms, privacy and refunds | one-time | ☐ |
| Monitoring | someone must know when it breaks | Sentry alerts plus an uptime check to phone or email | free to low | ☐ |

When to leave the free tiers is covered in SPEC 16.9: at the first paying vendor, more than about 20 active vendors or 200 bookings a month, or cold starts hurting conversion.

## 10. Production order

1. Make sure the cost-gate rows you need for the launch type are done.
2. Create the Neon prod project and pass `pnpm.cmd db:check-neon`.
3. Run migrations (section 3) with the prod env file.
4. Deploy the Render prod service (`branch: main`, `SESSION_COOKIE_DOMAIN=.bayana.in`, `WEB_ORIGINS=https://bayana.in`), attach the domain `api.bayana.in`, and check `/health` and `/ready`.
5. Create the production Google OAuth client with the redirect URI `https://api.bayana.in/v1/auth/google/callback`, publish the consent screen, and set the three `GOOGLE_*` variables on the prod service. You can leave them empty to launch with email codes only.
6. Set the Vercel production env, deploy, and attach `bayana.in` and `www`.
7. Add the GitHub secrets for the prod API (or a second set of workflows), and set `JOBS_ENABLED=true`.
8. Enable backups (`docs/RESTORE.md`) and run one manual backup and one restore drill.
9. Run checks 1–3 (and 2b if Google is on), 8, 10 and 12 of section 8 against production.

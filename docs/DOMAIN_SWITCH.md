# Domain switch: staging hostnames to bayana.in

The **existing** deployment moves to the real domain. There is no second environment: the same Render service
(`bayana-api-staging`, branch `hosting-ready`), the same Vercel project (`bayana-staging`) and the same Neon database serve
`https://bayana.in` (web) and `https://api.bayana.in` (API) afterwards. Do not rename the Render service in `render.yaml`:
a new name creates a second service.

Nothing here prints or stores a secret. Secret variables keep their current values; only the rows below change.

## 1. What the code needs (already in branch `domain-switch`)

- Every public URL comes from configuration: emailed links and the Google return use the first `WEB_ORIGINS` entry; the web
  app uses `NEXT_PUBLIC_SITE_URL` (vendor links `${SITE_URL}/<slug>`, canonical URLs, Open Graph base, sitemap) and
  `NEXT_PUBLIC_API_URL` (API calls, CSP `connect-src` and `form-action`).
- `www.bayana.in` answers with a permanent (308) redirect to `https://bayana.in`, path and query kept (`apps/web/lib/site.ts`).
- Indexing (robots.txt and the sitemap it names, page metadata, `X-Robots-Tag`) is allowed only with `APP_ENV=production` **and**
  `LEGAL_REVIEWED=true`. Leave `LEGAL_REVIEWED` empty until a lawyer has reviewed the legal pages.
- With `APP_ENV=production` the API refuses to start on: an http or localhost origin or Google redirect URI; a `_dev`/`_test`
  database; a `SESSION_COOKIE_DOMAIN` that is missing or does not cover the web and API hosts; a missing or placeholder
  `SESSION_SECRET`, `OTP_PEPPER` or `TICK_SECRET`; `PAYMENT_MODE=live`. The web build refuses http or localhost origins.
- **Web `APP_ENV` must stay `staging`** until `apps/web/lib/business-details.ts` has no `[PLACEHOLDER]` values: with
  `APP_ENV=production` the web build fails on purpose. Search engines stay out either way until `LEGAL_REVIEWED=true`.

## 2. Environment values (names and non-secret values only)

### Render, service `bayana-api-staging` (Environment)

| Variable | Before | After |
|---|---|---|
| `APP_ENV` | staging | production |
| `WEB_ORIGINS` | https://staging.bayana.in | https://bayana.in |
| `SESSION_COOKIE_DOMAIN` | .staging.bayana.in | .bayana.in |
| `SESSION_COOKIE_NAME` | bayana_staging_session | empty (= bayana_session; Google cookie bayana_google) |
| `GOOGLE_REDIRECT_URI` | https://api.staging.bayana.in/v1/auth/google/callback | https://api.bayana.in/v1/auth/google/callback |
| `EMAIL_FROM` | Bayana Staging <bookings@bayana.in> | Bayana <bookings@bayana.in> |
| `PAYMENT_MODE` | as now (disabled or test) | unchanged; never live |
| everything else (`DATABASE_URL*`, `SESSION_SECRET`, `OTP_PEPPER`, `TICK_SECRET`, `BREVO_API_KEY`, Google id and secret, Razorpay test keys) | unchanged | unchanged |

`render.yaml` no longer pins `SESSION_COOKIE_NAME`; set it (empty) in the dashboard. If Render shows a Blueprint sync,
apply it: it changes no values.

### Vercel, project `bayana-staging` (Settings > Environment Variables, the scope the `hosting-ready` deployments use)

| Variable | Before | After |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | https://staging.bayana.in | https://bayana.in |
| `NEXT_PUBLIC_API_URL` | https://api.staging.bayana.in | https://api.bayana.in |
| `SESSION_COOKIE_NAME` | bayana_staging_session | empty (= bayana_session) |
| `APP_ENV` | staging | staging (production only after business-details.ts is filled) |
| `LEGAL_REVIEWED` | empty | empty (your decision after the lawyer review) |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | unchanged | unchanged |

`NEXT_PUBLIC_*` values are baked in at build time: **redeploy** after changing them (Deployments > latest > Redeploy, without
the build cache).

### GitHub (Settings > Secrets and variables > Actions)

| Name | Before | After |
|---|---|---|
| `API_URL` (secret) | https://api.staging.bayana.in | https://api.bayana.in |

### Razorpay (test mode, only if a webhook exists)

Webhook URL: `https://api.staging.bayana.in/webhooks/razorpay` -> `https://api.bayana.in/webhooks/razorpay` (same secret).

## 3. DNS (Cloudflare)

1. Vercel > project > Settings > Domains: add `bayana.in` and `www.bayana.in` (assign both to the Git branch `hosting-ready`,
   like `staging.bayana.in` today). Set `www.bayana.in` to **Redirect to bayana.in (308)**; the app redirects too.
2. Render > `bayana-api-staging` > Settings > Custom Domains: add `api.bayana.in`.
3. In Cloudflare, add **exactly** the records Vercel and Render show (copy the targets; do not guess them). Every record
   **DNS only (grey cloud)**: proxied records break the certificates and `TRUST_PROXY=1`.
4. **Do not touch the Zoho mail records** (`MX`, the Zoho `TXT` verification, `zmail._domainkey`). An apex `A`/`CNAME` for
   the web never replaces `MX` records; check that only the records you add are new.
5. Wait until Vercel and Render both show the certificate as issued.
6. Keep `staging.bayana.in` and `api.staging.bayana.in` for now (they serve the same deployment); remove them a week later.
   Note: once the API runs with `WEB_ORIGINS=https://bayana.in`, the staging web hostname can no longer sign in or book.

## 4. Google Cloud (APIs & Services)

1. Credentials > the OAuth client in use > **Authorized redirect URIs**: add `https://api.bayana.in/v1/auth/google/callback`.
   Keep the staging one until the switch is verified, then remove it.
2. OAuth consent screen (Branding): **Authorized domains** include `bayana.in`; App home page `https://bayana.in`; Privacy
   policy `https://bayana.in/privacy`; Terms of service `https://bayana.in/terms`; support email on `bayana.in`.
3. Audience: **Publish app** (Testing -> In production) so any Google account can sign in. Only the basic scopes
   (openid, email, profile) are used, so no verification review is needed beyond the branding check.

## 5. Brevo (sending from bayana.in)

1. Senders, domains & dedicated IPs > Domains > **Authenticate** `bayana.in`. Brevo shows a verification `TXT`
   (`brevo-code:...`) and DKIM records: add them exactly as shown, DNS only.
2. **SPF: one record only.** Merge Brevo into the existing Zoho SPF, for example `v=spf1 include:zoho.in include:spf.brevo.com ~all`
   (keep the Zoho include you have today, `zoho.in` or `zoho.com`). Two SPF records make both fail.
3. **DMARC:** one `_dmarc.bayana.in` TXT. If none exists, start with `v=DMARC1; p=none; rua=mailto:<your inbox on bayana.in>`;
   if Zoho already set one, keep it and do not add a second.
4. Wait for Brevo to show the domain as authenticated, then send yourself a sign-in code and check the headers say
   `dkim=pass` and `spf=pass`.

## 6. Order of operations

1. Merge `domain-switch` into `hosting-ready` and push (your decision); wait for both deploys of the new code to be green on
   the staging hostnames, with the old values.
2. DNS and certificates (section 3), Google redirect URI and branding (4), Brevo authentication (5). Nothing changes for
   users yet.
3. Change the Render values (section 2) and let it redeploy. Then change the Vercel values and redeploy the web.
   Users are signed out once (the cookie name and domain change).
4. Update the GitHub `API_URL` secret and, if used, the Razorpay webhook URL.
5. Run the smoke test (section 7).

**Rollback:** put the "Before" values back in Render and Vercel, redeploy both (Vercel without the build cache), and set
`API_URL` back. DNS and the extra Google redirect URI can stay; they do no harm. No database change is involved.

## 7. Smoke test (12 checks)

1. `curl.exe -s https://api.bayana.in/health` and `/ready` both return `{"ok":true}` (allow a minute after idle).
2. `curl.exe -sI https://www.bayana.in/pricing` shows `308` and `location: https://bayana.in/pricing`.
3. `curl.exe -sI https://bayana.in/` shows `x-robots-tag: noindex, nofollow`; `https://bayana.in/robots.txt` says `Disallow: /`.
4. `https://bayana.in` loads with a valid certificate; the footer legal pages show the draft banner.
5. Sign in with Google: you land on `https://bayana.in/dashboard`.
6. Browser dev tools: cookie `bayana_session` with Domain `.bayana.in`, HttpOnly, Secure, SameSite=Lax.
7. Dashboard "Your public page" shows `bayana.in/<slug>`; Copy link gives `https://bayana.in/<slug>`.
8. Open that link signed out: the public page loads and its canonical URL is `https://bayana.in/<slug>`.
9. Book a time with a customer email: the code email arrives from `bookings@bayana.in` with `dkim=pass`.
10. The booking email's link opens `https://bayana.in/b/<id>`.
11. Dashboard calendar feed URL starts with `https://api.bayana.in/`.
12. After 15+ idle minutes, the first page still loads (via `/waking` if the API was asleep).

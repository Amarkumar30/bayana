# Set up "Continue with Google"

Google sign-in is optional. While `GOOGLE_CLIENT_ID` is empty, the feature is off: the login page shows only the email code and password options, and the API answers `/v1/auth/google/start` with a clean "not available". Nothing else changes.

One OAuth client serves two kinds of people:
- **Vendors** (`/login`, `/signup`): sign in, or create a business account and go to onboarding. This is the default (`intent=vendor`).
- **Customers** (the "Confirm your email" step of a booking on a vendor page): Google confirms the email instead of a six-digit code, and the customer returns to the same booking with their choice kept (`intent=customer`). A customer never becomes a vendor this way and gets no password. The same email always means the same Bayana account, from either side.

You need a Google account, and about 10 minutes.

## 1. Create a Google Cloud project

1. Open https://console.cloud.google.com and sign in.
2. At the top, open the project picker and choose **New project**.
3. Name it `Bayana`, then **Create**. Make sure the new project is selected in the picker.

## 2. Set up the consent screen

This is what people see when Google asks "Sign in to Bayana?".

1. Go to **APIs & Services → OAuth consent screen**. Newer consoles call it **Google Auth Platform → Branding**.
2. Choose **External** (anyone with a Google account), then **Create**.
3. Fill in:
   - **App name:** `Bayana`.
   - **User support email:** your address.
   - **Developer contact email:** your address.
   - **App domain and links:** leave empty for local testing. For bayana.in: home page `https://bayana.in`, privacy policy `https://bayana.in/privacy`, terms of service `https://bayana.in/terms`.
   - **Authorised domains:** `bayana.in` (covers `api.bayana.in` too).
4. **Scopes:** add only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These three are "non-sensitive", so Google does not need to review the app.
5. **Test users:** while the app is in "Testing", only the Google accounts you list here can sign in. Add your own address.
6. Before real vendors use it, press **Publish app**, which moves it to "In production". With only these scopes, Google does not need to verify the app.

## 3. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type:** Web application. **Name:** for example `Bayana local` and `Bayana` (one client per deployment, or one client with both redirect URIs).
3. **Authorised JavaScript origins:** leave empty. The browser never talks to Google directly; the API does.
4. **Authorised redirect URIs:** add the API callback, exactly:
   - Local: `http://localhost:4000/v1/auth/google/callback`
   - bayana.in: `https://api.bayana.in/v1/auth/google/callback`
   Vendors and customers use this same callback: the intent travels in the signed one-time cookie, not in the URL.
5. Press **Create**. Google shows a **Client ID** (it ends in `.apps.googleusercontent.com`) and a **Client secret**.

## 4. Put the values in the API's environment

Locally, edit `apps/api/.env`. This file is git-ignored; never commit it, and never paste the secret into chat or an issue.

```
GOOGLE_CLIENT_ID=<the client id>
GOOGLE_CLIENT_SECRET=<the client secret>
GOOGLE_REDIRECT_URI=http://localhost:4000/v1/auth/google/callback
```

Then:

```powershell
pnpm.cmd run doctor   # checks the three are present and well-formed, without printing them
pnpm.cmd dev
```

On a deployed API (Render), set the same three variables in the service's environment. Use that environment's own client and redirect URI.

| Variable | Local (`apps/api/.env`) | bayana.in (Render) |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `<local client id>.apps.googleusercontent.com` | `<client id>.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | `<local client secret>` | `<client secret>` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4000/v1/auth/google/callback` | `https://api.bayana.in/v1/auth/google/callback` |
| `WEB_ORIGINS` (where Google returns people) | `http://localhost:3000` | `https://bayana.in` |
| Web `NEXT_PUBLIC_API_URL` (Vercel) | `http://localhost:4000` | `https://api.bayana.in` |

## Google Cloud checklist for bayana.in

1. Credentials > the OAuth client > Authorised redirect URIs contains exactly `https://api.bayana.in/v1/auth/google/callback`.
2. Branding: Authorised domains contains `bayana.in`; home `https://bayana.in`, privacy `https://bayana.in/privacy`, terms `https://bayana.in/terms`; support email on your domain.
3. Data access (scopes): only `openid`, `userinfo.email`, `userinfo.profile`.
4. Audience: **Publish app**, so the status is **In production** (in Testing only listed test users can sign in).
5. `curl.exe -s https://api.bayana.in/v1/auth/providers` says `{"google":true}`.

Rules the API enforces:
- If `GOOGLE_CLIENT_ID` is set, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` must be set too, or the API refuses to start and names the missing one.
- The redirect URI must end in `/v1/auth/google/callback`.
- It must match the one registered in Google exactly. If it doesn't, Google shows `redirect_uri_mismatch`.

## 5. Try it

Vendor:
1. Open http://localhost:3000/login and press **Continue with Google**.
2. Choose your test account and accept.
3. What happens next depends on the account:
   - **A new address** gets a vendor account (no password) and lands on `/onboarding`.
   - **An address that already has a Bayana account** (for example from email-code signup) is linked to it. You won't get a second account.
4. In **Dashboard → Settings → Sign-in methods** you can connect or disconnect Google, and add, change or remove a password. Email code is always available.

Customer (use a second Google account):
1. Open a published vendor page, choose a service and a time, enter your name (and phone if asked), and continue.
2. On **Confirm your email**, press **Continue with Google** and choose the account.
3. You come back to the same booking with "Email confirmed": press **Hold this time**. No code is emailed.
4. The booking is in that Google account's email. That account is a customer account; it has no dashboard.

## When something goes wrong

| What you see | Why | Fix |
|---|---|---|
| No Google button | `/v1/auth/providers` says `{"google":false}`: `GOOGLE_CLIENT_ID` is empty, or the API was not restarted | Set the three variables and restart the API |
| Button shows with "We couldn't check Google sign-in just now" | The browser could not reach `/v1/auth/providers`: the API was asleep or restarting, or the request was blocked by CORS | Press **Check again**. If it stays, open the site on the exact origin in `WEB_ORIGINS` (`https://bayana.in`, not `www.bayana.in`; set www to redirect to the apex in Vercel), and check `NEXT_PUBLIC_API_URL` is `https://api.bayana.in` (then redeploy the web) |
| Button missing on the live site only (before this fix) | The page was on `www.bayana.in` while the API allows only `https://bayana.in`, so CORS blocked the check and the old code hid the button | Fix the Vercel domains (apex primary, www redirects to it) |
| Google says `redirect_uri_mismatch` | The URI in Google differs from `GOOGLE_REDIRECT_URI` | Make them identical, including `http` vs `https` and the port |
| Google says "access blocked: app not verified", or the account can't be chosen | The app is in Testing and this account isn't a test user | Add the account under Test users, or publish the app |
| Back on /login: "Google sign-in was cancelled" | You pressed Cancel on Google's screen | Try again |
| Back on /login: "took too long or was already used" | More than 10 minutes passed, or the page was reloaded or replayed | Start again from the login page |
| Back on /login: "Google hasn't verified that email address" | The Google account's email is unverified | Use an email code instead |
| A customer back on the booking: "belongs to a business account" | That email is a vendor's Bayana account; bookings need a customer email | Book with another Google account or an email code |
| A customer back on the booking: "could not be restored" | The return address was changed or incomplete | Choose the service and time again |

## What Bayana keeps

- Only Google's stable account id (`sub`) and the email at the time of linking (table `auth_identities`).
- No Google access, refresh or ID tokens are stored.
- Name and picture are never used for anything security-related.
- Sign-in creates a normal Bayana session, the same as an email code does. For a customer it is exactly the session the booking email code would have created.
- While a customer is at Google, their name, phone and notes stay in that browser tab (sessionStorage) only; the chosen service and time travel in the validated return address.

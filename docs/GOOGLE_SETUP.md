# Set up "Continue with Google"

Google sign-in is optional. While `GOOGLE_CLIENT_ID` is empty, the feature is off: the login page shows only the email code and password options, and the API answers `/v1/auth/google/start` with a clean "not available". Nothing else changes.

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
   - **App domain and links:** leave empty for local testing. Before production, add `https://bayana.in`, the privacy page `https://bayana.in/privacy` and the terms page `https://bayana.in/terms`.
4. **Scopes:** add only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These three are "non-sensitive", so Google does not need to review the app.
5. **Test users:** while the app is in "Testing", only the Google accounts you list here can sign in. Add your own address.
6. Before real vendors use it, press **Publish app**, which moves it to "In production". With only these scopes, Google does not need to verify the app.

## 3. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type:** Web application. **Name:** `Bayana local` (make one client per environment).
3. **Authorised JavaScript origins:** leave empty. The browser never talks to Google directly; the API does.
4. **Authorised redirect URIs:** add the API callback, exactly:
   - Local: `http://localhost:4000/v1/auth/google/callback`
   - Staging, later (its own client): `https://api-staging.bayana.in/v1/auth/google/callback`
   - Production, later (its own client): `https://api.bayana.in/v1/auth/google/callback`
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

Rules the API enforces:
- If `GOOGLE_CLIENT_ID` is set, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` must be set too, or the API refuses to start and names the missing one.
- The redirect URI must end in `/v1/auth/google/callback`.
- It must match the one registered in Google exactly. If it doesn't, Google shows `redirect_uri_mismatch`.

## 5. Try it

1. Open http://localhost:3000/login and press **Continue with Google**.
2. Choose your test account and accept.
3. What happens next depends on the account:
   - **A new address** gets a vendor account (no password) and lands on `/onboarding`.
   - **An address that already has a Bayana account** (for example from email-code signup) is linked to it. You won't get a second account.
4. In **Dashboard → Settings → Sign-in methods** you can connect or disconnect Google, and add, change or remove a password. Email code is always available.

## When something goes wrong

| What you see | Why | Fix |
|---|---|---|
| No Google button | `GOOGLE_CLIENT_ID` is empty, or the API was not restarted | Set the three variables and restart `pnpm.cmd dev` |
| Google says `redirect_uri_mismatch` | The URI in Google differs from `GOOGLE_REDIRECT_URI` | Make them identical, including `http` vs `https` and the port |
| Google says "access blocked: app not verified", or the account can't be chosen | The app is in Testing and this account isn't a test user | Add the account under Test users, or publish the app |
| Back on /login: "Google sign-in was cancelled" | You pressed Cancel on Google's screen | Try again |
| Back on /login: "took too long or was already used" | More than 10 minutes passed, or the page was reloaded or replayed | Start again from the login page |
| Back on /login: "Google hasn't verified that email address" | The Google account's email is unverified | Use an email code instead |

## What Bayana keeps

- Only Google's stable account id (`sub`) and the email at the time of linking (table `auth_identities`).
- No Google access, refresh or ID tokens are stored.
- Name and picture are never used for anything security-related.
- Sign-in creates a normal Bayana session, the same as an email code does.

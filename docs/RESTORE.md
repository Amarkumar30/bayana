# Backups and restore

SPEC 17.3: free Neon keeps little history, so we take our own nightly logical backups and prove that they restore. A backup that has never been restored is not a backup.

**Status: backups are written but DISABLED.** `.github/workflows/backup.yml` does nothing until you uncomment its schedule **and** set the repository variable `BACKUPS_ENABLED=true`.

## How a backup is made

`.github/workflows/backup.yml`, nightly at 03:00 IST once enabled:
1. Runs `pg_dump --format=custom --no-owner --no-privileges` against the **direct** Neon URL. It refuses a `-pooler` URL.
2. Checks that `pg_restore --list` can read the archive; an unreadable dump fails the run.
3. Encrypts it with [age](https://age-encryption.org) to your **public** key. GitHub never holds anything that can decrypt it.
4. Uploads `bayana-<UTC time>.dump.age` and a `.sha256` file to Cloudflare R2: always to `daily/`, and on Sundays to `weekly/` as well.
5. Deletes the local copies on the runner, even if a step failed.

## One-time setup (when you decide to start backups)

1. **Key pair.** Install age (`winget install FiloSottile.age`, then reopen PowerShell) and run:
   ```powershell
   age-keygen -o bayana-backup-key.txt
   ```
   - The line `# public key: age1...` is the **recipient**.
   - The whole file is the **private key**. Store it in your password manager plus one offline copy, then delete it from disk.
   - Without it no backup can be read, and nobody can recover it for you.
2. **Read-only database role.** This is optional but recommended. In the Neon SQL editor:
   ```sql
   CREATE ROLE bayana_backup LOGIN PASSWORD '<random>';
   GRANT pg_read_all_data TO bayana_backup;
   ```
   Build the direct URL with this role.
3. **R2 bucket.** In Cloudflare R2:
   - Create the bucket `bayana-backups`, private, with no public access.
   - Under Settings > Object lifecycle rules, add: prefix `daily/` deletes after 7 days; prefix `weekly/` deletes after 29 days. That keeps 7 daily and 4 weekly copies.
   - Create an R2 API token with **Object Read & Write** on this bucket only.
4. **GitHub secrets** (Settings > Secrets and variables > Actions):

   | Secret | Value |
   |--------|-------|
   | `BACKUP_DATABASE_URL` | Neon **direct** URL (the `bayana_backup` role if created) |
   | `BACKUP_AGE_RECIPIENT` | the `age1...` public key |
   | `R2_ACCOUNT_ID` | Cloudflare account id |
   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from the R2 token |
   | `R2_BUCKET` | `bayana-backups` |

5. Set the variable `BACKUPS_ENABLED=true`. Run the workflow once by hand (Actions > Database backup > Run workflow) and confirm the object appears in R2.
6. Uncomment the `schedule:` block in `backup.yml` and merge it.
7. Do a restore drill (below) the same week.

The workflow installs `pg_dump` for `PG_MAJOR` (16). If `pnpm.cmd db:check-neon` reports a 17xxxx server, change `PG_MAJOR` to `"17"`.

## Restore drill (before M3, then every quarter)

Restore into an **empty** database: a new local Docker database, or a new Neon branch or project. Never restore over a live one; the script refuses a database that has any table.

1. Download the latest `daily/*.dump.age` and its `.sha256` from R2, then check it:
   ```powershell
   (Get-FileHash .\bayana-<time>.dump.age -Algorithm SHA256).Hash.ToLower()   # must equal the hash in the .sha256 file
   ```
2. Create an empty target. Locally:
   ```powershell
   docker exec bayana-postgres-1 psql -U bayana -d postgres -c "CREATE DATABASE bayana_restore_drill_<yyyymmdd>"
   ```
   On Neon, create a new branch from an empty state, or a new database in the dashboard.
3. Put the private key in a file only for the drill, run the restore, then remove the key file:
   ```powershell
   $env:RESTORE_TARGET_URL = "postgres://bayana:bayana@localhost:5433/bayana_restore_drill_<yyyymmdd>"
   pnpm.cmd db:restore -- --file .\bayana-<time>.dump.age --identity .\bayana-backup-key.txt --confirm-target bayana_restore_drill_<yyyymmdd>
   Remove-Item Env:RESTORE_TARGET_URL; Remove-Item .\bayana-backup-key.txt
   ```
4. Read the output. It shows:
   - whether the archive is readable;
   - the latest migration (it must match production);
   - row counts;
   - the nightly consistency checks.

   `holds_past_expiry` can be non-zero in a restored copy because no tick has run on it. Every other check must be 0.
5. Optionally point a local API at the restored database (`NODE_ENV=production`; see `docs/DEPLOY.md` section 1) and open a vendor page.
6. Record the result in the drill log below. Delete the drill database when you no longer need it.

How `scripts/restore.mjs` behaves:
- It runs `pg_restore` and `psql` in a throwaway `postgres:16-alpine` container, so only Docker Desktop is needed.
- It decrypts into a private temp folder that is removed on every exit, and never prints the URL.
- It refuses unless `--confirm-target` names the URL's database and that database is empty.
- It restores with `--single-transaction --exit-on-error`, so a failed restore leaves nothing behind.

## Secrets inventory

Keep a separate list in your password manager with each secret's **name and where its value lives** (Render, Vercel, GitHub, Neon, Brevo, Razorpay, R2, the age key). The list must contain no values. Restoring a database is useless if you cannot rebuild its environment.

## Drill log

| Date | Backup file | Target | Latest migration | Consistency (non-zero items) | Result | By |
|------|-------------|--------|------------------|------------------------------|--------|----|
| 2026-10-24 | local `pg_dump` of `bayana_rehearsal` (unencrypted; age round trip checked separately) | local `bayana_restore_drill` | 017_dashboard_admin.sql | none | PASS (Phase 11 rehearsal, not production data) | Claude Code |

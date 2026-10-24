# Phase 3 domain alignment

| Legacy name | Universal name | Affected schema/code |
|---|---|---|
| `photographers` | `vendors` | profile ownership and public profile queries |
| `photographer_id` | `vendor_id` | availability, slots, bookings, services and their constraints/indexes |
| `PHOTOGRAPHER` | `VENDOR` | user and OTP role values, sessions and authorization |
| `categories text[]` | `categories` + `vendor_categories` | profile categories, publication validation, seed data |
| `/v1/photographers` | `/v1/vendors` | public, creation, update and publish callers |

Affected routes: public profile, vendor creation/update/publish, dashboard, services, availability, booking lookup, and client booking list. Affected types: `SessionUser`, test user roles, service ownership helpers, shared slug validation. Affected tests: helper integration, new slug validation, and migration/redirect integration coverage. Affected docs: README, PROJECT_STATUS, ARCHITECTURE, LOGIC, AUDIT, and PROGRESS.

`vendor_slug_history` maps former slugs to their vendor. A public lookup must resolve it to the vendor's current slug and redirect at the web route. No legacy API-route aliases are retained.

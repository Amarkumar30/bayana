# Deployment checklist

1. Provision PostgreSQL 16 with automated backups. Use a distinct app role with no `UPDATE`/`DELETE` privilege on `ledger_entries` after migrations.
2. Deploy `apps/api` to an always-on service; set all required secrets and restrict CORS to the web origin.
3. Deploy `apps/web` to Vercel or a Node host. Set `API_ORIGIN` for server rendering and `NEXT_PUBLIC_API_ORIGIN` for browser requests.
4. Run the migration once using a direct database connection, seed only non-production demo data, and verify `/health`.
5. Before live payments: implement Razorpay webhook verification, set the exact HTTPS webhook URL, test retries, configure monitoring and complete KYC/Route approval.

Never point staging or production to the mock payment endpoint.

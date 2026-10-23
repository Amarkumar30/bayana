# Business logic contract

- Client input never contains a price or advance amount.
- A booking hold lasts `HOLD_MINUTES` (15 by default).
- An active date means `HELD`, `CONFIRMED`, or `COMPLETED`; PostgreSQL enforces one active booking per photographer/date.
- Booking price and advance are snapshots at hold creation. Percentage calculations use integer, half-up paise rounding.
- `transition()` owns state changes and creates an event record in the same transaction.
- Ledger rows are immutable. Positive `CHARGE` creates the booking obligation; negative `PAYMENT` reduces it. Balance is derived from entries.
- A browser success callback must never confirm a payment. Only a verified provider webhook may do so in production.

See `PROJECT_STATUS.md` for what remains before a pilot.

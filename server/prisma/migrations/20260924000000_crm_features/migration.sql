-- Alter vendors table
ALTER TABLE "vendors" ADD COLUMN "phone" TEXT, ADD COLUMN "logo_url" TEXT;

-- Create Enums
CREATE TYPE "ClientStatus" AS ENUM ('new', 'contacted', 'proposal_sent', 'booked', 'completed');
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'sent', 'accepted', 'declined');
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled');

-- Create clients table
CREATE TABLE "clients" (
  "id" TEXT PRIMARY KEY,
  "vendor_id" TEXT NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "event_date" DATE,
  "event_type" TEXT,
  "notes" TEXT,
  "status" "ClientStatus" NOT NULL DEFAULT 'new',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create proposals table
CREATE TABLE "proposals" (
  "id" TEXT PRIMARY KEY,
  "vendor_id" TEXT NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "client_id" TEXT NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT,
  "title" TEXT NOT NULL,
  "line_items" JSONB NOT NULL,
  "subtotal_paise" NUMERIC(12,0) NOT NULL,
  "gst_percent" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "total_paise" NUMERIC(12,0) NOT NULL,
  "notes" TEXT,
  "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
  "public_token" TEXT NOT NULL UNIQUE,
  "accepted_at" TIMESTAMP(3),
  "sent_at" TIMESTAMP(3),
  "valid_until" DATE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Alter contracts table for CRM support
ALTER TABLE "contracts" ALTER COLUMN "booking_id" DROP NOT NULL;
ALTER TABLE "contracts" ALTER COLUMN "accepted_at" DROP NOT NULL;
ALTER TABLE "contracts" ADD COLUMN "vendor_id" TEXT REFERENCES "vendors"("id") ON DELETE RESTRICT;
ALTER TABLE "contracts" ADD COLUMN "client_id" TEXT REFERENCES "clients"("id") ON DELETE RESTRICT;
ALTER TABLE "contracts" ADD COLUMN "public_token" TEXT;
ALTER TABLE "contracts" ADD COLUMN "signed_by_name" TEXT;

-- Update existing contracts with public_token and vendor_id if any exist
UPDATE "contracts" SET "public_token" = md5(random()::text || id) WHERE "public_token" IS NULL;
UPDATE "contracts" c SET "vendor_id" = b."vendor_id" FROM "bookings" b WHERE c."booking_id" = b."id" AND c."vendor_id" IS NULL;
ALTER TABLE "contracts" ALTER COLUMN "public_token" SET NOT NULL;
ALTER TABLE "contracts" ALTER COLUMN "vendor_id" SET NOT NULL;
CREATE UNIQUE INDEX "contracts_public_token_key" ON "contracts"("public_token");

-- Create invoices table
CREATE TABLE "invoices" (
  "id" TEXT PRIMARY KEY,
  "vendor_id" TEXT NOT NULL REFERENCES "vendors"("id") ON DELETE RESTRICT,
  "client_id" TEXT NOT NULL REFERENCES "clients"("id") ON DELETE RESTRICT,
  "invoice_number" TEXT NOT NULL,
  "line_items" JSONB NOT NULL,
  "subtotal_paise" NUMERIC(12,0) NOT NULL,
  "gst_percent" NUMERIC(5,2) NOT NULL DEFAULT 18,
  "gst_amount_paise" NUMERIC(12,0) NOT NULL,
  "total_paise" NUMERIC(12,0) NOT NULL,
  "paid_paise" NUMERIC(12,0) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "due_date" DATE,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
  "public_token" TEXT NOT NULL UNIQUE,
  "sent_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "razorpay_order_id" TEXT UNIQUE,
  "razorpay_payment_id" TEXT UNIQUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("vendor_id", "invoice_number")
);

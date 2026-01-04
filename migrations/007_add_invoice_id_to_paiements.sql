-- Migration 007: add invoice_id column to paiements
ALTER TABLE paiements
  ADD COLUMN IF NOT EXISTS invoice_id INT NULL DEFAULT NULL;

-- Optional: add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_paiements_invoice_id ON paiements(invoice_id);

-- If you want a foreign key and invoices table exists, uncomment the following:
-- ALTER TABLE paiements ADD CONSTRAINT fk_paiements_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

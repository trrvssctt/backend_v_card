-- Migration 008: add motif_remboursement column to paiements
ALTER TABLE paiements
  ADD COLUMN IF NOT EXISTS motif_remboursement VARCHAR(1024) DEFAULT NULL;

-- Optional: index for quick lookups
CREATE INDEX IF NOT EXISTS idx_paiements_motif_remboursement ON paiements(motif_remboursement(255));

-- If you want a foreign key to invoices, ensure invoices table exists and uncomment:
-- ALTER TABLE paiements ADD CONSTRAINT fk_paiements_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

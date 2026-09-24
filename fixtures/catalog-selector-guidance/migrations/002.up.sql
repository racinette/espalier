-- migration: 002 up
BEGIN;
ALTER TABLE product_labels ADD COLUMN short_label TEXT;
COMMIT;

-- migration: 002 down
BEGIN;
ALTER TABLE product_labels DROP COLUMN short_label;
COMMIT;

-- migration: 001 down
BEGIN;
DROP TABLE product_labels;
COMMIT;

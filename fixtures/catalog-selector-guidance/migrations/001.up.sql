-- migration: 001 up
BEGIN;
CREATE TABLE product_labels (product_id INTEGER, locale TEXT, label TEXT);
COMMIT;

-- Digital products are no longer offered. The seeded category can't be deleted
-- (published versions are frozen and old orders may point at them), so it is
-- switched off: it disappears from the order form and the catalogue, and the
-- change log records why.
INSERT INTO audit_log (action, entity_type, entity_id, summary, data)
SELECT 'category.update', 'category', id::text, 'Turned off Digital product: digital products are no longer offered', '{"isActive": false, "by": "migration 0006"}'::jsonb
FROM categories
WHERE key = 'digital' AND is_active;
--> statement-breakpoint
UPDATE categories SET is_active = false, updated_at = now() WHERE key = 'digital';

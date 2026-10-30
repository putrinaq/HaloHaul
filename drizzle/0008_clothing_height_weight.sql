ALTER TABLE "measurement_definitions" ALTER COLUMN "unit" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "measurement_definitions" ALTER COLUMN "group" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "measurement_definitions" ADD CONSTRAINT "measurement_definitions_unit" CHECK (unit IN ('cm', 'mm', 'kg'));--> statement-breakpoint
ALTER TABLE "measurement_definitions" ADD CONSTRAINT "measurement_definitions_group" CHECK ("group" IN ('body', 'upper_body', 'lower_body', 'feet', 'hands', 'other'));--> statement-breakpoint
DROP TYPE "public"."measurement_group";--> statement-breakpoint
DROP TYPE "public"."measurement_unit";--> statement-breakpoint
-- Height and weight: the sizes Chinese sellers' charts use most (身高/体重).
-- Every clothing category now asks for both, first. Published versions are
-- frozen, so each gets a new published version; orders already placed keep
-- the version they were made with.
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES
  ('height_cm', 'Height', 'cm', 100, 230, 0.5, 'Standing straight, without shoes.', 'body', 10),
  ('weight_kg', 'Weight', 'kg', 25, 200, 0.1, 'Your body weight. Sellers'' size charts use it with your height.', 'body', 20)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
-- The definition with height and weight at the start of its first section,
-- skipping any it already has (as a measurement or a field of that key).
CREATE FUNCTION pg_temp.with_body_measurements(def jsonb) RETURNS jsonb LANGUAGE sql AS $$
  WITH missing AS (
    SELECT coalesce(jsonb_agg(f ORDER BY ord), '[]'::jsonb) AS fields
    FROM (VALUES
      (1, '{"kind": "measurement", "measurementKey": "height_cm", "required": true}'::jsonb),
      (2, '{"kind": "measurement", "measurementKey": "weight_kg", "required": true}'::jsonb)
    ) AS body(ord, f)
    WHERE NOT jsonb_path_exists(
      def,
      '$.sections[*].fields[*] ? (@.measurementKey == $k || @.key == $k)',
      jsonb_build_object('k', f->>'measurementKey')
    )
  )
  SELECT CASE
    WHEN missing.fields = '[]'::jsonb THEN def
    WHEN jsonb_array_length(def->'sections') = 0
      THEN jsonb_set(def, '{sections}', jsonb_build_array(jsonb_build_object('title', 'Your measurements', 'fields', missing.fields)))
    ELSE jsonb_set(def, '{sections,0,fields}', missing.fields || (def #> '{sections,0,fields}'))
  END
  FROM missing
$$;
--> statement-breakpoint
DO $$
DECLARE
  c record;
  next_def jsonb;
  next_version integer;
  new_id uuid;
BEGIN
  FOR c IN
    SELECT cat.id, cat.name, v.id AS published_id, v.definition
    FROM categories cat
    JOIN category_versions v ON v.id = cat.current_published_version_id
    WHERE cat.key IN ('clothing_top', 'clothing_bottom', 'dress')
    ORDER BY cat.sort_order
  LOOP
    next_def := pg_temp.with_body_measurements(c.definition);
    -- Already asks for both (an admin added them): nothing to publish.
    CONTINUE WHEN next_def = c.definition;
    SELECT max(version) + 1 INTO next_version FROM category_versions WHERE category_id = c.id;
    -- An unpublished draft keeps its own edits, gets the fields too, and stays the newest version.
    UPDATE category_versions
      SET version = next_version + 1, definition = pg_temp.with_body_measurements(definition)
      WHERE category_id = c.id AND status = 'draft';
    UPDATE category_versions SET status = 'archived' WHERE id = c.published_id;
    INSERT INTO category_versions (category_id, version, status, definition, published_at)
      VALUES (c.id, next_version, 'published', next_def, now())
      RETURNING id INTO new_id;
    UPDATE categories SET current_published_version_id = new_id, updated_at = now() WHERE id = c.id;
    INSERT INTO audit_log (action, entity_type, entity_id, summary, data)
      VALUES (
        'category.publish', 'category', c.id::text,
        format('Published version %s of “%s”: now asks for height and weight', next_version, c.name),
        jsonb_build_object('version', next_version, 'added', jsonb_build_array('height_cm', 'weight_kg'), 'by', 'migration 0008')
      );
  END LOOP;
END $$;

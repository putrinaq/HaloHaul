-- Dress no longer asks for a preferred dress length. Published versions are
-- frozen, so Dress gets a new published version without the field; orders
-- already placed keep theirs (and their answer). An unpublished draft loses
-- the field too, so publishing it later doesn't bring it back.
CREATE FUNCTION pg_temp.without_dress_length(def jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_set(def, '{sections}', coalesce((
    SELECT jsonb_agg(
      jsonb_set(s, '{fields}', coalesce((
        SELECT jsonb_agg(f ORDER BY i) FROM jsonb_array_elements(s->'fields') WITH ORDINALITY AS fs(f, i)
        WHERE coalesce(f->>'key', f->>'measurementKey') <> 'length_cm'
      ), '[]'::jsonb))
      ORDER BY si
    )
    FROM jsonb_array_elements(def->'sections') WITH ORDINALITY AS ss(s, si)
  ), '[]'::jsonb))
$$;
--> statement-breakpoint
DO $$
DECLARE
  c record;
  next_def jsonb;
  next_version integer;
  new_id uuid;
BEGIN
  SELECT cat.id, cat.name, v.id AS published_id, v.definition INTO c
  FROM categories cat JOIN category_versions v ON v.id = cat.current_published_version_id
  WHERE cat.key = 'dress';
  IF NOT FOUND THEN RETURN; END IF;
  next_def := pg_temp.without_dress_length(c.definition);
  -- Already gone (an admin removed it): nothing to publish.
  IF next_def = c.definition THEN RETURN; END IF;
  SELECT max(version) + 1 INTO next_version FROM category_versions WHERE category_id = c.id;
  UPDATE category_versions
    SET version = next_version + 1, definition = pg_temp.without_dress_length(definition)
    WHERE category_id = c.id AND status = 'draft';
  UPDATE category_versions SET status = 'archived' WHERE id = c.published_id;
  INSERT INTO category_versions (category_id, version, status, definition, published_at)
    VALUES (c.id, next_version, 'published', next_def, now())
    RETURNING id INTO new_id;
  UPDATE categories SET current_published_version_id = new_id, updated_at = now() WHERE id = c.id;
  INSERT INTO audit_log (action, entity_type, entity_id, summary, data)
    VALUES (
      'category.publish', 'category', c.id::text,
      format('Published version %s of “%s”: no longer asks for dress length', next_version, c.name),
      jsonb_build_object('version', next_version, 'removed', jsonb_build_array('length_cm'), 'by', 'migration 0009')
    );
END $$;

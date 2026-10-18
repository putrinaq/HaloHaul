-- Data migration: the old code registry becomes database categories.
-- Generated from src/db/seed/catalog.ts; definitions passed the meta-schema.

-- The audit log is append-only, like the ledger and status history.
CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
-- A published (or archived) version is frozen: old orders validate against
-- exactly what they were submitted under. Only its status may change.
CREATE OR REPLACE FUNCTION freeze_category_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'category version % is % and cannot be deleted', OLD.id, OLD.status USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (NEW.definition IS DISTINCT FROM OLD.definition OR NEW.version <> OLD.version OR NEW.category_id <> OLD.category_id) THEN
    RAISE EXCEPTION 'category version % is % and cannot be edited', OLD.id, OLD.status USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'archived category version % cannot be republished', OLD.id USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER category_versions_freeze
  BEFORE UPDATE OR DELETE ON category_versions
  FOR EACH ROW EXECUTE FUNCTION freeze_category_version();
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('chest_cm', 'Chest', 'cm', 50, 200, 0.5, 'Measure around the fullest part of your chest.', 'upper_body', 10);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('shoulder_cm', 'Shoulder width', 'cm', 25, 80, 0.5, NULL, 'upper_body', 20);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('arm_length_cm', 'Arm length', 'cm', 30, 100, 0.5, 'Shoulder point to wrist.', 'upper_body', 30);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('body_length_cm', 'Body length', 'cm', 40, 120, 0.5, 'Top of shoulder to hem.', 'upper_body', 40);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('underbust_cm', 'Underbust', 'cm', 50, 150, 0.5, NULL, 'upper_body', 50);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('overbust_cm', 'Overbust', 'cm', 60, 180, 0.5, NULL, 'upper_body', 60);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('waist_cm', 'Waist', 'cm', 40, 200, 0.5, NULL, 'lower_body', 10);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('hip_cm', 'Hip', 'cm', 50, 200, 0.5, NULL, 'lower_body', 20);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('inseam_cm', 'Inseam', 'cm', 30, 110, 0.5, 'Crotch to ankle along the inside leg.', 'lower_body', 30);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('foot_length_cm', 'Foot length', 'cm', 10, 35, 0.1, 'Heel to longest toe, standing.', 'feet', 10);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('ring_inner_circumference_mm', 'Ring inner circumference', 'mm', 35, 80, 0.5, 'Wrap a paper strip around your finger and measure it.', 'hands', 10);
--> statement-breakpoint
INSERT INTO measurement_definitions (key, label, unit, min, max, step, help_text, "group", sort_order)
VALUES ('pd_mm', 'Pupillary distance', 'mm', 40, 80, 0.5, 'The distance between the centres of your pupils. It''s on most prescriptions.', 'other', 10);
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('clothing_top', 'Clothing — top', 'Shirt', 10, 'physical', 350, 300, 250, 50, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your measurements","fields":[{"kind":"measurement","measurementKey":"chest_cm","required":true},{"kind":"measurement","measurementKey":"shoulder_cm","required":true},{"kind":"measurement","measurementKey":"arm_length_cm","required":true},{"kind":"measurement","measurementKey":"body_length_cm","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'clothing_top';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('clothing_bottom', 'Clothing — bottom', 'Ruler', 20, 'physical', 550, 350, 250, 60, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your measurements","fields":[{"kind":"measurement","measurementKey":"waist_cm","required":true},{"kind":"measurement","measurementKey":"hip_cm","required":true},{"kind":"measurement","measurementKey":"inseam_cm","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'clothing_bottom';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('dress', 'Dress', 'Sparkle', 30, 'physical', 450, 350, 250, 60, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your measurements","fields":[{"kind":"measurement","measurementKey":"chest_cm","required":true},{"kind":"measurement","measurementKey":"waist_cm","required":true},{"kind":"measurement","measurementKey":"hip_cm","required":true},{"kind":"number","key":"length_cm","label":"Dress length","unit":"cm","min":50,"max":180,"step":0.5,"required":true,"helpText":"Preferred length, shoulder to hem."}]}]}'::jsonb, now() FROM categories WHERE key = 'dress';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('bra', 'Bra', 'Heart', 40, 'physical', 150, 250, 180, 60, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your measurements","fields":[{"kind":"measurement","measurementKey":"underbust_cm","required":true},{"kind":"measurement","measurementKey":"overbust_cm","mustExceed":"underbust_cm","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'bra';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('shoes', 'Shoes', 'Footprints', 50, 'physical', 1200, 350, 250, 130, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your size","fields":[{"kind":"text","key":"size","label":"Size","maxLength":10,"placeholder":"e.g. 38 or 8.5","required":true},{"kind":"select","key":"size_system","label":"Size system","options":["UK","US","EU","CN"],"required":true},{"kind":"measurement","measurementKey":"foot_length_cm","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'shoes';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('ring', 'Ring', 'Gem', 60, 'physical', 40, 80, 80, 50, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your size","fields":[{"kind":"measurement","measurementKey":"ring_inner_circumference_mm","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'ring';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('glasses_prescription', 'Prescription glasses', 'Glasses', 70, 'physical', 150, 160, 70, 50, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your prescription","fields":[{"kind":"number","key":"sph_left","label":"SPH left","unit":"D","min":-20,"max":20,"step":0.25,"required":true},{"kind":"number","key":"sph_right","label":"SPH right","unit":"D","min":-20,"max":20,"step":0.25,"required":true},{"kind":"number","key":"cyl_left","label":"CYL left","unit":"D","min":-10,"max":10,"step":0.25,"required":true},{"kind":"number","key":"cyl_right","label":"CYL right","unit":"D","min":-10,"max":10,"step":0.25,"required":true},{"kind":"number","key":"axis_left","label":"Axis left","unit":"°","min":0,"max":180,"step":1,"required":false,"requiredIf":{"field":"cyl_left","op":"neq","value":0},"helpText":"Only needed if CYL is not 0."},{"kind":"number","key":"axis_right","label":"Axis right","unit":"°","min":0,"max":180,"step":1,"required":false,"requiredIf":{"field":"cyl_right","op":"neq","value":0},"helpText":"Only needed if CYL is not 0."},{"kind":"measurement","measurementKey":"pd_mm","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'glasses_prescription';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('contact_lens', 'Contact lenses', 'Eye', 80, 'physical', 80, 100, 80, 40, ARRAY['air_sensitive', 'sea']::shipping_mode[], 'Lens solution is a liquid, so contact lenses ship on the sensitive air line or by sea.');
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Your prescription","fields":[{"kind":"number","key":"sph_left","label":"SPH left","unit":"D","min":-20,"max":20,"step":0.25,"required":true},{"kind":"number","key":"sph_right","label":"SPH right","unit":"D","min":-20,"max":20,"step":0.25,"required":true},{"kind":"number","key":"base_curve","label":"Base curve","unit":"mm","min":7,"max":10,"step":0.1,"required":false}]}],"option":{"label":"Colour","required":true}}'::jsonb, now() FROM categories WHERE key = 'contact_lens';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('cosmetics', 'Cosmetics', 'Palette', 90, 'physical', 200, 120, 100, 40, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[],"option":{"label":"Shade","required":true}}'::jsonb, now() FROM categories WHERE key = 'cosmetics';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('electronics', 'Electronics', 'Smartphone', 100, 'physical', 800, 250, 200, 100, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"The item","fields":[{"kind":"text","key":"model","label":"Model","maxLength":120,"required":true},{"kind":"textarea","key":"spec_notes","label":"Specs","maxLength":1000,"required":true,"helpText":"Storage, colour, version, anything that matters."},{"kind":"text","key":"voltage_plug_note","label":"Voltage / plug","maxLength":200,"required":true,"helpText":"Malaysia uses 240V and UK-style (type G) plugs."}]}]}'::jsonb, now() FROM categories WHERE key = 'electronics';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('digital', 'Digital product', 'Download', 110, 'digital', 0, 0, 0, 0, ARRAY['none']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Delivery","fields":[{"kind":"text","key":"region","label":"Region / server","maxLength":80,"required":true},{"kind":"text","key":"delivery_email","label":"Delivery email","maxLength":254,"format":"email","required":true}]}]}'::jsonb, now() FROM categories WHERE key = 'digital';
--> statement-breakpoint
INSERT INTO categories (key, name, icon, sort_order, fulfilment, default_weight_g, default_length_mm, default_width_mm, default_height_mm, allowed_shipping_modes, restricted_note)
VALUES ('other', 'Something else', 'Package', 120, 'physical', 500, 300, 200, 100, ARRAY['air', 'air_sensitive', 'sea', 'pdd_direct']::shipping_mode[], NULL);
--> statement-breakpoint
INSERT INTO category_versions (category_id, version, status, definition, published_at)
SELECT id, 1, 'published', '{"sections":[{"title":"Tell us more","fields":[{"kind":"textarea","key":"description","label":"Description","maxLength":2000,"required":true,"helpText":"Tell us what you need and anything we should check with the seller."}]}]}'::jsonb, now() FROM categories WHERE key = 'other';
--> statement-breakpoint
UPDATE categories c SET current_published_version_id = v.id
FROM category_versions v WHERE v.category_id = c.id AND v.status = 'published';
--> statement-breakpoint
-- Field keys renamed in v1: rewrite existing orders' details to match.
--> statement-breakpoint
UPDATE orders SET details = (details - 'inner_circumference_mm') || jsonb_build_object('ring_inner_circumference_mm', details -> 'inner_circumference_mm')
WHERE category = 'ring' AND details ? 'inner_circumference_mm';
--> statement-breakpoint
-- Every order points at the exact version it was made with.
UPDATE orders o SET category_version_id = v.id
FROM category_versions v JOIN categories c ON c.id = v.category_id
WHERE c.key = o.category AND v.version = o.category_schema_version;
--> statement-breakpoint
-- Saved measurements move from per-category objects to one value per measurement
-- (when two categories disagree, the one earlier in the category order wins;
-- jsonb doesn't keep key order, so the priority is explicit). Non-measurement values
-- such as shoe size or prescription powers are not kept.
UPDATE customer_profiles p SET saved_measurements = coalesce((
  SELECT jsonb_object_agg(k, v) FROM (
    SELECT DISTINCT ON (k) k, v FROM (
      SELECT CASE e.key WHEN 'inner_circumference_mm' THEN 'ring_inner_circumference_mm' ELSE e.key END AS k, e.value AS v,
             coalesce(array_position(ARRAY['clothing_top', 'clothing_bottom', 'dress', 'bra', 'shoes', 'ring', 'glasses_prescription', 'contact_lens', 'cosmetics', 'electronics', 'digital', 'other']::text[], c.cat), 999) AS ord
      FROM jsonb_each(CASE WHEN jsonb_typeof(p.saved_measurements) = 'object' THEN p.saved_measurements ELSE '{}'::jsonb END)
             AS c(cat, val)
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(c.val) = 'object' THEN c.val ELSE '{}'::jsonb END) AS e
      WHERE jsonb_typeof(e.value) = 'number'
    ) flat
    WHERE k IN ('chest_cm', 'shoulder_cm', 'arm_length_cm', 'body_length_cm', 'underbust_cm', 'overbust_cm', 'waist_cm', 'hip_cm', 'inseam_cm', 'foot_length_cm', 'ring_inner_circumference_mm', 'pd_mm')
    ORDER BY k, ord
  ) picked
), '{}'::jsonb);

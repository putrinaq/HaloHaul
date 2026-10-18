CREATE TYPE "public"."category_fulfilment" AS ENUM('physical', 'digital');--> statement-breakpoint
CREATE TYPE "public"."category_version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."measurement_group" AS ENUM('upper_body', 'lower_body', 'feet', 'hands', 'other');--> statement-breakpoint
CREATE TYPE "public"."measurement_unit" AS ENUM('cm', 'mm');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('upfront_fee', 'order', 'balance');--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'payment';--> statement-breakpoint
ALTER TYPE "public"."ledger_entry_type" ADD VALUE 'payout';--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'admin_recorded';--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"summary" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'Package' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"fulfilment" "category_fulfilment" DEFAULT 'physical' NOT NULL,
	"default_weight_g" integer DEFAULT 0 NOT NULL,
	"default_length_mm" integer DEFAULT 0 NOT NULL,
	"default_width_mm" integer DEFAULT 0 NOT NULL,
	"default_height_mm" integer DEFAULT 0 NOT NULL,
	"allowed_shipping_modes" "shipping_mode"[] DEFAULT '{}' NOT NULL,
	"restricted_note" text,
	"current_published_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_key_unique" UNIQUE("key"),
	CONSTRAINT "categories_key" CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "categories_parcel_nonneg" CHECK (default_weight_g >= 0 AND default_length_mm >= 0 AND default_width_mm >= 0 AND default_height_mm >= 0)
);
--> statement-breakpoint
CREATE TABLE "category_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "category_version_status" DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "category_versions_version_positive" CHECK (version >= 1)
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"myr_per_cny" numeric(12, 6) NOT NULL,
	"note" text,
	"set_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_definitions" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"unit" "measurement_unit" NOT NULL,
	"min" double precision NOT NULL,
	"max" double precision NOT NULL,
	"step" double precision NOT NULL,
	"help_text" text,
	"help_image_key" text,
	"group" "measurement_group" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_definitions_key" CHECK (key ~ '^[a-z][a-z0-9_]{0,39}$'),
	CONSTRAINT "measurement_definitions_range" CHECK (min < max AND step > 0)
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "below_min_alert_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "weighed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD COLUMN "anonymised_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "category_version_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fee_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "options_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "warehouse_arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "qc_photo_keys" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "qc_notes" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purpose" "payment_purpose" DEFAULT 'order' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "sourcing_options" ADD COLUMN "is_recommended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sourcing_options" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_current_published_version_id_category_versions_id_fk" FOREIGN KEY ("current_published_version_id") REFERENCES "public"."category_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_versions" ADD CONSTRAINT "category_versions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_versions" ADD CONSTRAINT "category_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_type_entity_id_created_at_index" ON "audit_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_index" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "categories_is_active_sort_order_index" ON "categories" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "category_versions_category_id_version_index" ON "category_versions" USING btree ("category_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "category_versions_one_draft" ON "category_versions" USING btree ("category_id") WHERE status = 'draft';--> statement-breakpoint
CREATE UNIQUE INDEX "category_versions_one_published" ON "category_versions" USING btree ("category_id") WHERE status = 'published';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_category_version_id_category_versions_id_fk" FOREIGN KEY ("category_version_id") REFERENCES "public"."category_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
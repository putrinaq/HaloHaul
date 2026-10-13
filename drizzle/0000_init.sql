CREATE TYPE "public"."batch_shipping_mode" AS ENUM('air', 'air_sensitive', 'sea');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('open', 'locked', 'consolidated', 'shipped', 'arrived', 'distributed');--> statement-breakpoint
CREATE TYPE "public"."condition_preference" AS ENUM('new_only', 'secondhand_ok', 'either');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_method" AS ENUM('campus_pickup', 'lalamove');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('service_fee', 'item_payment', 'shipping_estimate', 'shipping_adjustment', 'refund', 'delivery_fee', 'consultation_fee', 'reverse_search_fee');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('submitted', 'needs_info', 'sourcing', 'quote_sent', 'awaiting_payment', 'paid', 'order_submitted', 'at_warehouse', 'qc_review', 'ready_to_consolidate', 'consolidated', 'shipped', 'arrived_my', 'ready_for_pickup', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."path_type" AS ENUM('url', 'reverse_search', 'consultation', 'digital');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('duitnow_manual', 'fiuu');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('taobao', 'pdd', 'weidian', '1688', 'xianyu', 'meituan', 'jd', 'dewu', 'rednote', 'douyin', 'other');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('sent', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."shipping_mode" AS ENUM('air', 'air_sensitive', 'sea', 'pdd_direct', 'none');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"mode" "batch_shipping_mode" NOT NULL,
	"cutoff_at" timestamp with time zone NOT NULL,
	"min_orders" integer DEFAULT 1 NOT NULL,
	"status" "batch_status" DEFAULT 'open' NOT NULL,
	"forwarder" text,
	"pickup_starts_at" timestamp with time zone,
	"pickup_ends_at" timestamp with time zone,
	"actual_weight_g" integer,
	"actual_cost_fen" integer,
	"actual_cost_fx_rate" numeric(12, 6),
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_code_unique" UNIQUE("code"),
	CONSTRAINT "batches_min_orders_positive" CHECK (min_orders >= 1),
	CONSTRAINT "batches_cost_has_rate" CHECK (actual_cost_fen IS NULL OR actual_cost_fx_rate IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"campus" text,
	"saved_measurements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer,
	"customer_id" text NOT NULL,
	"type" "ledger_entry_type" NOT NULL,
	"amount_sen" integer NOT NULL,
	"source_amount_fen" integer,
	"fx_rate" numeric(12, 6),
	"reference" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_nonzero" CHECK (amount_sen <> 0),
	CONSTRAINT "ledger_fen_has_rate" CHECK (source_amount_fen IS NULL OR fx_rate IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"customer_id" text NOT NULL,
	"path_type" "path_type" NOT NULL,
	"platform" "platform" NOT NULL,
	"product_url" text,
	"reference_photo_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text NOT NULL,
	"category_schema_version" integer NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"variant_text" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"condition_preference" "condition_preference",
	"shipping_mode" "shipping_mode" NOT NULL,
	"fulfilment" "fulfilment_method" DEFAULT 'campus_pickup' NOT NULL,
	"domestic_free_shipping" boolean DEFAULT false NOT NULL,
	"shipping_choice_snapshot" jsonb,
	"status" "order_status" DEFAULT 'submitted' NOT NULL,
	"batch_id" uuid,
	"est_weight_g" integer,
	"est_length_mm" integer,
	"est_width_mm" integer,
	"est_height_mm" integer,
	"est_seller_confirmed" boolean DEFAULT false NOT NULL,
	"final_weight_g" integer,
	"final_length_mm" integer,
	"final_width_mm" integer,
	"final_height_mm" integer,
	"tracking_number" text,
	"tracking_note" text,
	"restricted_flag" boolean DEFAULT false NOT NULL,
	"restricted_reason" text,
	"restricted_cleared_at" timestamp with time zone,
	"restricted_cleared_by" text,
	"shipping_balance_due" boolean DEFAULT false NOT NULL,
	"shipping_refund_due" boolean DEFAULT false NOT NULL,
	"remarks" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_quantity_positive" CHECK (quantity >= 1),
	CONSTRAINT "orders_link_or_condition" CHECK (product_url IS NOT NULL OR condition_preference IS NOT NULL OR path_type = 'digital'),
	CONSTRAINT "orders_no_batch_for_direct" CHECK (batch_id IS NULL OR shipping_mode IN ('air','air_sensitive','sea'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_sen" integer NOT NULL,
	"proof_photo_key" text,
	"provider_tran_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"raw_payload" jsonb,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_providerTranId_unique" UNIQUE("provider_tran_id"),
	CONSTRAINT "payments_amount_positive" CHECK (amount_sen > 0),
	CONSTRAINT "payments_manual_has_proof" CHECK (method <> 'duitnow_manual' OR proof_photo_key IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"sourcing_option_id" uuid,
	"item_price_fen" integer NOT NULL,
	"fx_rate" numeric(12, 6) NOT NULL,
	"item_price_sen" integer NOT NULL,
	"service_fee_sen" integer NOT NULL,
	"shipping_estimate_min_sen" integer NOT NULL,
	"shipping_estimate_max_sen" integer NOT NULL,
	"delivery_fee_sen" integer DEFAULT 0 NOT NULL,
	"fee_credit_sen" integer DEFAULT 0 NOT NULL,
	"total_min_sen" integer NOT NULL,
	"total_max_sen" integer NOT NULL,
	"status" "quote_status" DEFAULT 'sent' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_shipping_range" CHECK (shipping_estimate_min_sen <= shipping_estimate_max_sen),
	CONSTRAINT "quotes_total_range" CHECK (total_min_sen <= total_max_sen),
	CONSTRAINT "quotes_amounts_nonneg" CHECK (item_price_fen >= 0 AND item_price_sen >= 0 AND service_fee_sen >= 0 AND shipping_estimate_min_sen >= 0 AND delivery_fee_sen >= 0 AND fee_credit_sen >= 0 AND total_min_sen >= 0)
);
--> statement-breakpoint
CREATE TABLE "restricted_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword" text NOT NULL,
	"applies_to_modes" "shipping_mode"[] DEFAULT '{}' NOT NULL,
	"forwarder" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK (id = 1)
);
--> statement-breakpoint
CREATE TABLE "showcase_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"variant" text,
	"platform" "platform" NOT NULL,
	"shipping_mode" "shipping_mode" NOT NULL,
	"product_url" text,
	"category" text,
	"retail_price_sen" integer NOT NULL,
	"halohaul_price_sen" integer NOT NULL,
	"photo_key" text,
	"source_order_id" integer,
	"retail_checked_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourcing_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"price_fen" integer NOT NULL,
	"seller_note" text,
	"photo_key" text,
	"est_weight_g" integer,
	"est_length_mm" integer,
	"est_width_mm" integer,
	"est_height_mm" integer,
	"is_selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sourcing_options_price_nonneg" CHECK (price_fen >= 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_restricted_cleared_by_users_id_fk" FOREIGN KEY ("restricted_cleared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sourcing_option_id_sourcing_options_id_fk" FOREIGN KEY ("sourcing_option_id") REFERENCES "public"."sourcing_options"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_products" ADD CONSTRAINT "showcase_products_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sourcing_options" ADD CONSTRAINT "sourcing_options_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_index" ON "two_factors" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factors_user_id_index" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_index" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "batches_status_cutoff_at_index" ON "batches" USING btree ("status","cutoff_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_order_id_created_at_index" ON "ledger_entries" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_customer_id_created_at_index" ON "ledger_entries" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_order_id_created_at_index" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_id_created_at_index" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_index" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_batch_id_index" ON "orders" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_index" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_created_at_index" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "quotes_order_id_created_at_index" ON "quotes" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_one_open_per_order" ON "quotes" USING btree ("order_id") WHERE status = 'sent';--> statement-breakpoint
CREATE INDEX "showcase_products_is_published_sort_order_index" ON "showcase_products" USING btree ("is_published","sort_order");--> statement-breakpoint
CREATE INDEX "sourcing_options_order_id_index" ON "sourcing_options" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sourcing_options_one_selected" ON "sourcing_options" USING btree ("order_id") WHERE is_selected;
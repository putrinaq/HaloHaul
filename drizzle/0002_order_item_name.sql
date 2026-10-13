-- Backfill existing rows with '' so the NOT NULL add succeeds, then drop the default.
ALTER TABLE "orders" ADD COLUMN "item_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "item_name" DROP DEFAULT;

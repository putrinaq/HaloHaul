ALTER TABLE "orders" ALTER COLUMN "category_version_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "category_schema_version";
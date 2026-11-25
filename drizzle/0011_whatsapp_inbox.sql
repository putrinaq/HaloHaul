CREATE TABLE "whatsapp_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text,
	"user_ref" text,
	"username" text,
	"profile_name" text,
	"unread" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_chats_phone_unique" UNIQUE("phone"),
	CONSTRAINT "whatsapp_chats_userRef_unique" UNIQUE("user_ref"),
	CONSTRAINT "whatsapp_chats_who" CHECK (phone IS NOT NULL OR user_ref IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"wa_id" text,
	"direction" text NOT NULL,
	"kind" text NOT NULL,
	"body" text,
	"status" text NOT NULL,
	"error" text,
	"media_id" text,
	"media_mime" text,
	"media_name" text,
	"media_key" text,
	"sent_by" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_messages_waId_unique" UNIQUE("wa_id"),
	CONSTRAINT "whatsapp_messages_direction" CHECK (direction IN ('in', 'out')),
	CONSTRAINT "whatsapp_messages_status" CHECK (status IN ('received', 'sending', 'sent', 'delivered', 'read', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_chat_id_whatsapp_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."whatsapp_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_chats_last_message_at_index" ON "whatsapp_chats" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "whatsapp_chats_updated_at_index" ON "whatsapp_chats" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_chat_id_sent_at_index" ON "whatsapp_messages" USING btree ("chat_id","sent_at");
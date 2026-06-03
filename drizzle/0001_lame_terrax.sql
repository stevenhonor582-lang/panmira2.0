CREATE TABLE "activity_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"bot_name" varchar(255) NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"user_id" varchar(255),
	"prompt" text,
	"response_preview" text,
	"cost_usd" real,
	"duration_ms" real,
	"error_message" text,
	"model" varchar(100),
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_mappings" (
	"memory_doc_id" varchar(255) PRIMARY KEY NOT NULL,
	"memory_path" text NOT NULL,
	"feishu_node_token" varchar(255) NOT NULL,
	"feishu_doc_id" varchar(255) NOT NULL,
	"content_hash" varchar(255) DEFAULT '' NOT NULL,
	"synced_at" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_mappings" (
	"memory_folder_id" varchar(255) PRIMARY KEY NOT NULL,
	"memory_path" text NOT NULL,
	"feishu_node_token" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"group_id" varchar(255) NOT NULL,
	"bot_name" varchar(255) NOT NULL,
	"joined_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"folder_id" varchar(255) DEFAULT 'root' NOT NULL,
	"path" varchar(1000) NOT NULL,
	"content" text DEFAULT '',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_by" varchar(255) DEFAULT '',
	"created_at" varchar(100),
	"updated_at" varchar(100),
	CONSTRAINT "documents_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(500) NOT NULL,
	"parent_id" varchar(255),
	"path" varchar(1000) NOT NULL,
	"visibility" varchar(50) DEFAULT 'shared' NOT NULL,
	"created_at" varchar(100),
	"updated_at" varchar(100),
	CONSTRAINT "folders_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "session_links" (
	"session_id" varchar(255) NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"linked_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"text" text NOT NULL,
	"platform" varchar(50) NOT NULL,
	"cost_usd" real,
	"duration_ms" real,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"bot_name" varchar(255) NOT NULL,
	"claude_session_id" varchar(255),
	"working_directory" text NOT NULL,
	"title" varchar(500) DEFAULT '' NOT NULL,
	"platform" varchar(50) NOT NULL,
	"chat_id" varchar(255) NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author" varchar(255) DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_invocable" boolean DEFAULT true NOT NULL,
	"context" text,
	"allowed_tools" text,
	"skill_md" text NOT NULL,
	"references_tar" "bytea",
	"published_at" varchar(100) NOT NULL,
	"updated_at" varchar(100) NOT NULL,
	CONSTRAINT "skills_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sync_config" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"roles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"budget_daily_usd" real DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "teams_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "session_links" ADD CONSTRAINT "session_links_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_timestamp" ON "activity_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_activity_bot_name" ON "activity_events" USING btree ("bot_name","timestamp");--> statement-breakpoint
CREATE INDEX "idx_doc_mappings_path" ON "document_mappings" USING btree ("memory_path");--> statement-breakpoint
CREATE INDEX "idx_folder_mappings_path" ON "folder_mappings" USING btree ("memory_path");--> statement-breakpoint
CREATE INDEX "idx_session_links_chat_id" ON "session_links" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_session_messages_session_id" ON "session_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_bot_name" ON "sessions" USING btree ("bot_name");--> statement-breakpoint
CREATE INDEX "idx_sessions_chat_id" ON "sessions" USING btree ("chat_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_chat_id_unique" ON "sessions" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_updated_at" ON "sessions" USING btree ("updated_at");
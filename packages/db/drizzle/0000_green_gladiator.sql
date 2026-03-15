CREATE TABLE "daily_bars" (
	"time" timestamp with time zone NOT NULL,
	"symbol" text NOT NULL,
	"open" real NOT NULL,
	"high" real NOT NULL,
	"low" real NOT NULL,
	"close" real NOT NULL,
	"volume" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stocks" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_bars" ADD CONSTRAINT "daily_bars_symbol_stocks_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."stocks"("symbol") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_bars_symbol" ON "daily_bars" USING btree ("symbol");
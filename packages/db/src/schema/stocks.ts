import { bigint, index, pgTable, real, text, timestamp } from 'drizzle-orm/pg-core';

export const stocks = pgTable('stocks', {
	symbol: text('symbol').primaryKey(),
	name: text('name').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;

export const dailyBars = pgTable(
	'daily_bars',
	{
		time: timestamp('time', { withTimezone: true }).notNull(),
		symbol: text('symbol')
			.notNull()
			.references(() => stocks.symbol),
		open: real('open').notNull(),
		high: real('high').notNull(),
		low: real('low').notNull(),
		close: real('close').notNull(),
		volume: bigint('volume', { mode: 'number' }).notNull(),
	},
	(table) => [index('idx_daily_bars_symbol').on(table.symbol)],
);

export type DailyBar = typeof dailyBars.$inferSelect;
export type NewDailyBar = typeof dailyBars.$inferInsert;

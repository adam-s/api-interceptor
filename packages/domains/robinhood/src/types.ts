/**
 * Robinhood API Types
 *
 * Zod schemas and TypeScript types for Robinhood API integration.
 * Based on ROBINHOOD_API_ARCHITECTURE.md endpoint documentation.
 *
 * @module browser/robinhood/types
 */

import { z } from 'zod';

// =============================================================================
// Authentication & Headers
// =============================================================================

/** Required headers for all Robinhood API requests */
export const RobinhoodHeadersSchema = z.object({
	Authorization: z.string().startsWith('Bearer '),
	'X-Hyper-Ex': z.string(),
	'X-Robinhood-API-Version': z.string(),
	'X-TimeZone-Id': z.string(),
});
export type RobinhoodHeaders = z.infer<typeof RobinhoodHeadersSchema>;

/** Headers we need to capture from intercepted requests */
export const REQUIRED_HEADER_NAMES = [
	'Authorization',
	'X-Hyper-Ex',
	'X-Robinhood-API-Version',
	'X-TimeZone-Id',
] as const;

// =============================================================================
// Authentication State
// =============================================================================

/** Discriminated union for authentication state */
export type AuthState =
	| { status: 'disconnected' }
	| { status: 'connecting' }
	| { status: 'needs-login'; sessionId: string }
	| { status: 'connected'; headers: RobinhoodHeaders; accountNumber: string }
	| { status: 'error'; message: string };

// =============================================================================
// Instruments & Market Data
// =============================================================================

/** Active instrument from /instruments/ endpoint */
export const ActiveInstrumentSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	tradable_chain_id: z.string().uuid().nullable(),
	simple_name: z.string().nullable(),
	tradeable: z.boolean(),
	fractional_tradability: z.string(),
	url: z.string().url(),
});
export type ActiveInstrument = z.infer<typeof ActiveInstrumentSchema>;

export const ActiveInstrumentsResponseSchema = z.object({
	results: z.array(ActiveInstrumentSchema),
});
export type ActiveInstrumentsResponse = z.infer<typeof ActiveInstrumentsResponseSchema>;

/** Market data quote from /marketdata/quotes/ endpoint */
export const MarketQuoteSchema = z.object({
	ask_price: z.string(),
	ask_size: z.number(),
	bid_price: z.string(),
	bid_size: z.number(),
	last_trade_price: z.string(),
	last_extended_hours_trade_price: z.string().nullable(),
	previous_close: z.string(),
	adjusted_previous_close: z.string(),
	previous_close_date: z.string(),
	symbol: z.string(),
	trading_halted: z.boolean(),
	has_traded: z.boolean(),
	last_trade_price_source: z.string(),
	updated_at: z.string(),
	instrument: z.string().url(),
	instrument_id: z.string().uuid(),
});
export type MarketQuote = z.infer<typeof MarketQuoteSchema>;

export const MarketQuotesResponseSchema = z.object({
	results: z.array(MarketQuoteSchema),
});
export type MarketQuotesResponse = z.infer<typeof MarketQuotesResponseSchema>;

/** Pricebook snapshot from /marketdata/pricebook/snapshots/{id}/ */
export const PricebookEntrySchema = z.object({
	price: z.object({ amount: z.string(), currency_code: z.string() }),
	quantity: z.number(),
});

export const PricebookSnapshotSchema = z.object({
	asks: z.array(PricebookEntrySchema),
	bids: z.array(PricebookEntrySchema),
	instrument_id: z.string().uuid(),
	updated_at: z.string(),
});
export type PricebookSnapshot = z.infer<typeof PricebookSnapshotSchema>;

/** Collateral response from /options/orders/collateral/ */
export const OptionsCollateralResponseSchema = z.object({
	account_number: z.string().optional(),
	cash: z.object({
		amount: z.string(),
		direction: z.enum(['debit', 'credit']),
		infinite: z.boolean().optional(),
	}),
	equities: z.array(z.unknown()).optional(),
});
export type OptionsCollateralResponse = z.infer<typeof OptionsCollateralResponseSchema>;

/** Options buying power from bonfire /accounts/{acct}/options_buying_power */
export const OptionsBuyingPowerResponseSchema = z.object({
	account_number: z.string(),
	buying_power: z.object({
		amount: z.string(),
		currency_code: z.string(),
	}),
	order_to_replace_id: z.string().nullable().optional(),
	cash_available_from_instant_deposits: z.string().optional(),
});
export type OptionsBuyingPowerResponse = z.infer<typeof OptionsBuyingPowerResponseSchema>;

/** Option settings from /options/option_settings/{acct}/ */
export const OptionSettingsResponseSchema = z.object({
	account_number: z.string().optional(),
	default_price: z.string(),
	trading_on_expiration_enabled: z.boolean(),
	trading_on_expiration_state: z.string(),
	short_shares_on_option_events_enabled: z.boolean(),
	short_shares_settings_effective_since: z.string().nullable().optional(),
});
export type OptionSettingsResponse = z.infer<typeof OptionSettingsResponseSchema>;

/** Strategy template leg from bonfire strategy_chain_template */
export const StrategyTemplateLegSchema = z.object({
	index: z.number(),
	side: z.enum(['buy', 'sell']),
	option_type: z.enum(['call', 'put']),
	position_effect: z.enum(['open', 'close']),
	exp_date_filter: z.string(),
	ratio_quantity: z.number(),
	strike_sort_order: z.string().optional(),
});

/** Strategy chain template from bonfire /options/strategy_chain_template/v1/ */
export const StrategyChainTemplateResponseSchema = z
	.object({
		allowed_levels: z.array(z.string()),
		strategy: z.string(),
		intended_direction: z.string(),
		strategy_display_name: z.string(),
		subtitle: z.string().optional(),
		chain_header: z.string().optional(),
		edu_contentful_id: z.string().optional(),
		strategy_template: z.object({
			template_type: z.string(),
			first_leg: StrategyTemplateLegSchema.optional(),
			second_leg: StrategyTemplateLegSchema.optional(),
			third_leg: StrategyTemplateLegSchema.optional(),
			fourth_leg: StrategyTemplateLegSchema.optional(),
			strike_condition: z.string().optional(),
		}),
		sentiment: z.string(),
	})
	.passthrough();
export type StrategyChainTemplateResponse = z.infer<typeof StrategyChainTemplateResponseSchema>;

// =============================================================================
// Options Chain
// =============================================================================

/** Options chain from /options/chains/ endpoint */
export const OptionsChainSchema = z.object({
	id: z.string().uuid(),
	symbol: z.string(),
	expiration_dates: z.array(z.string()), // YYYY-MM-DD format
	trade_value_multiplier: z.string(),
	can_open_position: z.boolean(),
	underlying_instruments: z.array(
		z.object({
			id: z.string().uuid(),
			instrument: z.string().url(),
			quantity: z.number(),
		}),
	),
	min_ticks: z.object({
		above_tick: z.string(),
		below_tick: z.string(),
		cutoff_price: z.string(),
	}),
});
export type OptionsChain = z.infer<typeof OptionsChainSchema>;

export const OptionsChainsResponseSchema = z.object({
	results: z.array(OptionsChainSchema),
});
export type OptionsChainsResponse = z.infer<typeof OptionsChainsResponseSchema>;

/** Options instrument from /options/instruments/ endpoint */
export const OptionsInstrumentSchema = z.object({
	id: z.string().uuid(),
	chain_id: z.string().uuid(),
	chain_symbol: z.string(),
	strike_price: z.string(),
	expiration_date: z.string(),
	type: z.enum(['call', 'put']),
	state: z.enum(['active', 'inactive']),
	tradability: z.enum(['tradable', 'position_closing_only', 'untradable']),
	url: z.string().url(),
	sellout_datetime: z.string().nullable(),
	long_strategy_code: z.string(),
	short_strategy_code: z.string(),
});
export type OptionsInstrument = z.infer<typeof OptionsInstrumentSchema>;

export const OptionsInstrumentsResponseSchema = z.object({
	results: z.array(OptionsInstrumentSchema),
	next: z.string().url().nullable(),
	previous: z.string().url().nullable(),
});
export type OptionsInstrumentsResponse = z.infer<typeof OptionsInstrumentsResponseSchema>;

/** Options market data from /marketdata/options/ endpoint */
export const OptionsMarketDataSchema = z.object({
	instrument_id: z.string().uuid(),
	ask_price: z.string().nullable(),
	ask_size: z.number(),
	bid_price: z.string().nullable(),
	bid_size: z.number(),
	mark_price: z.string(),
	last_trade_price: z.string().nullable(),
	last_trade_size: z.number().nullable(),
	break_even_price: z.string(),
	// Greeks
	delta: z.string().nullable(),
	gamma: z.string().nullable(),
	theta: z.string().nullable(),
	vega: z.string().nullable(),
	rho: z.string().nullable(),
	implied_volatility: z.string().nullable(),
	// Volume & Interest
	open_interest: z.number(),
	volume: z.number(),
	// Probability
	chance_of_profit_long: z.string().nullable(),
	chance_of_profit_short: z.string().nullable(),
	// Fill prices
	high_fill_rate_buy_price: z.string().nullable(),
	high_fill_rate_sell_price: z.string().nullable(),
	low_fill_rate_buy_price: z.string().nullable(),
	low_fill_rate_sell_price: z.string().nullable(),
});
export type OptionsMarketData = z.infer<typeof OptionsMarketDataSchema>;

export const OptionsMarketDataResponseSchema = z.object({
	results: z.array(OptionsMarketDataSchema),
});
export type OptionsMarketDataResponse = z.infer<typeof OptionsMarketDataResponseSchema>;

// =============================================================================
// Positions
// =============================================================================

/** Aggregated options position from /options/aggregate_positions/ */
export const OptionsPositionLegSchema = z
	.object({
		id: z.string().uuid(),
		option: z.string(),
		option_id: z.string().uuid(),
		expiration_date: z.string(),
		strike_price: z.string(),
		option_type: z.enum(['call', 'put']),
		position_type: z.enum(['long', 'short']),
		quantity: z.string(),
	})
	.passthrough();

export const OptionsAggregatedPositionSchema = z
	.object({
		id: z.string().uuid(),
		chain: z.string(),
		symbol: z.string(),
		strategy: z.string(),
		average_open_price: z.string(),
		quantity: z.string(),
		direction: z.enum(['credit', 'debit']),
		intraday_average_open_price: z.string().nullable().optional(),
		intraday_quantity: z.string().optional(),
		legs: z.array(OptionsPositionLegSchema),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.passthrough();
export type OptionsAggregatedPosition = z.infer<typeof OptionsAggregatedPositionSchema>;

export const OptionsAggregatedPositionsResponseSchema = z.object({
	results: z.array(OptionsAggregatedPositionSchema),
	next: z.string().url().nullable(),
	previous: z.string().url().nullable(),
});
export type OptionsAggregatedPositionsResponse = z.infer<
	typeof OptionsAggregatedPositionsResponseSchema
>;

// =============================================================================
// Orders
// =============================================================================

/** Order state enum */
export const OrderStateSchema = z.enum([
	'queued',
	'new',
	'confirmed',
	'unconfirmed',
	'partially_filled',
	'filled',
	'pending_cancelled',
	'cancelled',
	'rejected',
	'failed',
]);
export type OrderState = z.infer<typeof OrderStateSchema>;

/** Options order leg */
export const OptionsOrderLegSchema = z
	.object({
		id: z.string().uuid(),
		option: z.string(),
		position_effect: z.enum(['open', 'close']),
		ratio_quantity: z.number(),
		side: z.enum(['buy', 'sell']),
		executions: z.array(
			z
				.object({
					id: z.string().uuid(),
					price: z.string(),
					quantity: z.string(),
					settlement_date: z.string(),
					timestamp: z.string(),
				})
				.passthrough(),
		),
	})
	.passthrough();

/** Options order from /options/orders/ - using passthrough for extra fields */
export const OptionsOrderSchema = z
	.object({
		id: z.string().uuid(),
		direction: z.enum(['credit', 'debit']),
		price: z.string().nullable(),
		quantity: z.string(),
		time_in_force: z.enum(['gfd', 'gtc', 'ioc', 'opg']),
		type: z.enum(['limit', 'market']),
		state: OrderStateSchema,
		legs: z.array(OptionsOrderLegSchema),
		chain_id: z.string().uuid(),
		chain_symbol: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
		// Optional fields that may or may not be present
		account: z.string().optional(),
		premium: z.string().nullable().optional(),
		pending_quantity: z.string().optional(),
		canceled_quantity: z.string().optional(),
		processed_quantity: z.string().optional(),
		trigger: z.enum(['immediate', 'stop']).optional(),
		opening_strategy: z.string().nullable().optional(),
		closing_strategy: z.string().nullable().optional(),
	})
	.passthrough();
export type OptionsOrder = z.infer<typeof OptionsOrderSchema>;

export const OptionsOrdersResponseSchema = z.object({
	results: z.array(OptionsOrderSchema),
	next: z.string().url().nullable(),
	previous: z.string().url().nullable(),
});
export type OptionsOrdersResponse = z.infer<typeof OptionsOrdersResponseSchema>;

// =============================================================================
// Accounts
// =============================================================================

/** Account from /accounts/ endpoint */
export const AccountSchema = z.object({
	account_number: z.string(),
	buying_power: z.string(),
	cash: z.string(),
	cash_available_for_withdrawal: z.string(),
	cash_held_for_orders: z.string(),
	deactivated: z.boolean(),
	deposit_halted: z.boolean(),
	option_level: z.string().nullable(),
	type: z.string(),
	url: z.string().url(),
	user: z.string(), // Can be URL or user ID depending on API version
	withdrawal_halted: z.boolean(),
	cash_balances: z
		.object({
			buying_power: z.string(),
			cash_held_for_options_collateral: z.string(),
			cash_available_for_withdrawal: z.string(),
		})
		.nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

export const AccountsResponseSchema = z.object({
	results: z.array(AccountSchema),
});
export type AccountsResponse = z.infer<typeof AccountsResponseSchema>;

// =============================================================================
// Order Creation Payloads
// =============================================================================

/** Payload for reviewing an options order */
export const OptionsOrderReviewPayloadSchema = z.object({
	account: z.string().url(),
	direction: z.enum(['debit', 'credit']),
	price: z.string(),
	quantity: z.string(),
	time_in_force: z.literal('gfd'),
	trigger: z.literal('immediate'),
	type: z.literal('limit'),
	legs: z.array(
		z.object({
			option: z.string().url(),
			option_id: z.string().uuid(),
			position_effect: z.enum(['open', 'close']),
			side: z.enum(['buy', 'sell']),
			ratio_quantity: z.number(),
			leg_metadata: z.object({
				option_quote: z.object({
					ask_price: z.string(),
					bid_price: z.string(),
				}),
			}),
		}),
	),
	metadata: z.object({
		brokerage_account_type: z.string(),
		options_buying_power: z.string(),
	}),
});
export type OptionsOrderReviewPayload = z.infer<typeof OptionsOrderReviewPayloadSchema>;

/** Payload for creating an options order */
export const OptionsOrderCreatePayloadSchema = z.object({
	account: z.string().url(),
	direction: z.enum(['credit', 'debit']),
	price: z.string(),
	quantity: z.string(),
	time_in_force: z.literal('gfd'),
	trigger: z.literal('immediate'),
	type: z.literal('limit'),
	legs: z.array(
		z.object({
			option: z.string().url(),
			position_effect: z.enum(['open', 'close']),
			ratio_quantity: z.number(),
			side: z.enum(['buy', 'sell']),
		}),
	),
});
export type OptionsOrderCreatePayload = z.infer<typeof OptionsOrderCreatePayloadSchema>;

// =============================================================================
// API Constants
// =============================================================================

/** Robinhood API base URLs */
export const API_URLS = {
	PRIMARY: 'https://api.robinhood.com',
	BONFIRE: 'https://bonfire.robinhood.com',
} as const;

/** URL patterns to intercept for capturing auth headers */
export const INTERCEPT_PATTERNS = [
	'https://api.robinhood.com/marketdata/**',
	'https://api.robinhood.com/options/**',
	'https://api.robinhood.com/instruments/**',
	'https://api.robinhood.com/positions/**',
	'https://api.robinhood.com/orders/**',
	'https://api.robinhood.com/accounts/**',
	'https://bonfire.robinhood.com/**',
] as const;

// =============================================================================
// Stock Instruments
// =============================================================================

/** Stock instrument from /instruments/ endpoint */
export const StockInstrumentSchema = z.object({
	id: z.string().uuid(),
	url: z.string().url(),
	symbol: z.string(),
	simple_name: z.string().nullable(),
	name: z.string(),
	type: z.string(), // 'stock', 'etp', etc.
	tradeable: z.boolean(),
	tradability: z.string(),
	fractional_tradability: z.string(),
	extended_hours_fractional_tradability: z.boolean(),
	market: z.string().url(),
	state: z.string(),
	country: z.string(),
	day_trade_ratio: z.string(),
	maintenance_ratio: z.string(),
	margin_initial_ratio: z.string(),
	list_date: z.string().nullable(),
	tradable_chain_id: z.string().uuid().nullable(),
	default_preset_percent_limit: z.string(),
	all_day_tradability: z.string(),
});
export type StockInstrument = z.infer<typeof StockInstrumentSchema>;

export const StockInstrumentsResponseSchema = z.object({
	results: z.array(StockInstrumentSchema),
	next: z.string().url().nullable(),
	previous: z.string().url().nullable(),
});
export type StockInstrumentsResponse = z.infer<typeof StockInstrumentsResponseSchema>;

// =============================================================================
// Stock Quotes
// =============================================================================

/** Stock quote from /marketdata/quotes/ endpoint */
export const StockQuoteSchema = z.object({
	ask_price: z.string(),
	ask_size: z.number(),
	bid_price: z.string(),
	bid_size: z.number(),
	last_trade_price: z.string(),
	last_extended_hours_trade_price: z.string().nullable(),
	previous_close: z.string(),
	adjusted_previous_close: z.string(),
	previous_close_date: z.string(),
	symbol: z.string(),
	trading_halted: z.boolean(),
	has_traded: z.boolean(),
	updated_at: z.string(),
	instrument: z.string().url(),
	instrument_id: z.string().uuid(),
});
export type StockQuote = z.infer<typeof StockQuoteSchema>;

export const StockQuotesResponseSchema = z.object({
	results: z.array(StockQuoteSchema),
});
export type StockQuotesResponse = z.infer<typeof StockQuotesResponseSchema>;

// =============================================================================
// Stock Positions
// =============================================================================

/** Stock position from /positions/ endpoint */
export const StockPositionSchema = z
	.object({
		url: z.string().url(),
		instrument: z.string().url(),
		instrument_id: z.string().uuid(),
		account: z.string().url(),
		account_number: z.string(),
		average_buy_price: z.string(),
		pending_average_buy_price: z.string(),
		quantity: z.string(),
		intraday_average_buy_price: z.string(),
		intraday_quantity: z.string(),
		shares_available_for_exercise: z.string(),
		shares_held_for_buys: z.string(),
		shares_held_for_sells: z.string(),
		shares_held_for_stock_grants: z.string(),
		shares_held_for_options_collateral: z.string(),
		shares_held_for_options_events: z.string(),
		shares_pending_from_options_events: z.string(),
		created_at: z.string(),
		updated_at: z.string(),
	})
	.passthrough();
export type StockPosition = z.infer<typeof StockPositionSchema>;

export const StockPositionsResponseSchema = z
	.object({
		results: z.array(StockPositionSchema),
		next: z.string().url().nullable(),
		previous: z.string().url().nullable().optional(),
	})
	.passthrough();
export type StockPositionsResponse = z.infer<typeof StockPositionsResponseSchema>;

// =============================================================================
// Stock Orders
// =============================================================================

/** Stock order from /orders/ endpoint */
export const StockOrderSchema = z
	.object({
		id: z.string().uuid(),
		ref_id: z.string().uuid().nullable().optional(),
		url: z.string().url(),
		account: z.string().url(),
		instrument: z.string().url(),
		instrument_id: z.string().uuid(),
		symbol: z.string().optional(), // Not always present - needs instrument lookup
		side: z.enum(['buy', 'sell']),
		type: z.enum(['market', 'limit']),
		time_in_force: z.enum(['gfd', 'gtc', 'ioc', 'opg']),
		trigger: z.enum(['immediate', 'stop']),
		state: OrderStateSchema,
		price: z.string().nullable(),
		quantity: z.string(),
		average_price: z.string().nullable(),
		cumulative_quantity: z.string(),
		fees: z.string(),
		position_effect: z.enum(['open', 'close']).nullable().optional(),
		market_hours: z.enum(['regular_hours', 'extended_hours', 'all_day_hours']),
		dollar_based_amount: z
			.object({
				amount: z.string(),
				currency_code: z.string(),
			})
			.nullable()
			.optional(),
		created_at: z.string(),
		updated_at: z.string(),
		last_transaction_at: z.string().nullable(),
		executions: z.array(
			z
				.object({
					id: z.string().uuid(),
					price: z.string(),
					quantity: z.string(),
					settlement_date: z.string(),
					timestamp: z.string(),
				})
				.passthrough(),
		),
		cancel: z.string().url().nullable(),
	})
	.passthrough();
export type StockOrder = z.infer<typeof StockOrderSchema>;

export const StockOrdersResponseSchema = z
	.object({
		results: z.array(StockOrderSchema),
		next: z.string().url().nullable(),
		previous: z.string().url().nullable().optional(),
	})
	.passthrough();
export type StockOrdersResponse = z.infer<typeof StockOrdersResponseSchema>;

// =============================================================================
// Stock Order Creation Payloads
// =============================================================================

/** Dollar-based amount for fractional orders */
export const DollarBasedAmountSchema = z.object({
	amount: z.string(),
	currency_code: z.literal('USD'),
});
export type DollarBasedAmount = z.infer<typeof DollarBasedAmountSchema>;

/** Payload for stock order check (pre-validation) */
export const StockOrderCheckPayloadSchema = z.object({
	order_body: z.object({
		account: z.string().url(),
		ask_price: z.string(),
		bid_ask_timestamp: z.string(),
		bid_price: z.string(),
		instrument: z.string().url(),
		market_hours: z.enum(['regular_hours', 'extended_hours']),
		order_form_version: z.literal(6),
		position_effect: z.enum(['open', 'close']),
		ref_id: z.string().uuid(),
		side: z.enum(['buy', 'sell']),
		symbol: z.string(),
		time_in_force: z.literal('gfd'),
		trigger: z.literal('immediate'),
		type: z.enum(['limit', 'market']),
		preset_percent_limit: z.string().optional(),
		price: z.string().optional(),
		dollar_based_amount: DollarBasedAmountSchema.optional(),
		quantity: z.string(),
		check_overrides: z.array(z.unknown()),
	}),
});
export type StockOrderCheckPayload = z.infer<typeof StockOrderCheckPayloadSchema>;

/** Response from stock order check */
export const StockOrderCheckResponseSchema = z.object({
	alert: z
		.object({
			alert_type: z.string(),
			title: z.string(),
			subtitle_markdown: z.string(),
			action_buttons: z.array(
				z.object({
					title: z.string(),
					type: z.string(),
					action: z.object({
						action_type: z.string(),
						action_data: z.unknown(),
					}),
					logging_identifier: z.string(),
				}),
			),
		})
		.nullable(),
	action_data: z.unknown().nullable(),
});
export type StockOrderCheckResponse = z.infer<typeof StockOrderCheckResponseSchema>;

/** Payload for placing a fractional buy order */
export const StockBuyOrderPayloadSchema = z.object({
	account: z.string().url(),
	ask_price: z.string(),
	bid_ask_timestamp: z.string(),
	bid_price: z.string(),
	instrument: z.string().url(),
	market_hours: z.enum(['regular_hours', 'extended_hours']),
	order_form_version: z.literal(6),
	position_effect: z.literal('open'),
	ref_id: z.string().uuid(),
	side: z.literal('buy'),
	symbol: z.string(),
	time_in_force: z.literal('gfd'),
	trigger: z.literal('immediate'),
	type: z.enum(['limit', 'market']),
	preset_percent_limit: z.string().optional(),
	price: z.string().optional(),
	dollar_based_amount: DollarBasedAmountSchema,
	quantity: z.string(),
});
export type StockBuyOrderPayload = z.infer<typeof StockBuyOrderPayloadSchema>;

/** Payload for placing a fractional sell order */
export const StockSellOrderPayloadSchema = z.object({
	account: z.string().url(),
	ask_price: z.string(),
	bid_ask_timestamp: z.string(),
	bid_price: z.string(),
	estimated_fees: z.array(z.unknown()),
	estimated_total_fee: z.string(),
	instrument: z.string().url(),
	market_hours: z.enum(['regular_hours', 'extended_hours']),
	order_form_version: z.literal(6),
	position_effect: z.literal('close'),
	ref_id: z.string().uuid(),
	side: z.literal('sell'),
	symbol: z.string(),
	time_in_force: z.literal('gfd'),
	trigger: z.literal('immediate'),
	type: z.literal('limit'),
	preset_percent_limit: z.string(),
	price: z.string(),
	quantity: z.string(),
});
export type StockSellOrderPayload = z.infer<typeof StockSellOrderPayloadSchema>;

/** Payload for checking sell order fees */
export const StockFeesCheckPayloadSchema = z.object({
	instrument_id: z.string().uuid(),
	is_otc: z.boolean(),
	price: z.string(),
	quantity: z.string(),
	side: z.literal('sell'),
});
export type StockFeesCheckPayload = z.infer<typeof StockFeesCheckPayloadSchema>;

/** Response from fees check */
export const StockFeesCheckResponseSchema = z.object({
	instrument_id: z.string().uuid(),
	quantity: z.string(),
	price: z.string(),
	side: z.string(),
	fees: z.array(z.unknown()),
	total_fee: z.string(),
	sales_taxes: z.array(z.unknown()),
});
export type StockFeesCheckResponse = z.infer<typeof StockFeesCheckResponseSchema>;

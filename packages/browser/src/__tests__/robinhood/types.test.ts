import { describe, expect, it } from 'vitest';
import {
	ActiveInstrumentSchema,
	MarketQuoteSchema,
	OptionsChainsResponseSchema,
	REQUIRED_HEADER_NAMES,
	RobinhoodHeadersSchema,
	StockInstrumentSchema,
	StockOrderCheckPayloadSchema,
	StockQuoteSchema,
} from '../../robinhood/types';

describe('RobinhoodHeaders Schema', () => {
	describe('valid headers', () => {
		it('accepts valid headers with all required fields', () => {
			const validHeaders = {
				Authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9',
				'X-Hyper-Ex': 'some-hyper-ex-value',
				'X-Robinhood-API-Version': '1.315.0',
				'X-TimeZone-Id': 'America/New_York',
			};

			const result = RobinhoodHeadersSchema.safeParse(validHeaders);
			expect(result.success).toBe(true);
		});

		it('accepts various Bearer token formats', () => {
			const tokens = [
				'Bearer abc123',
				'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
				'Bearer very-long-token-with-special-chars-123_456',
			];

			for (const token of tokens) {
				const result = RobinhoodHeadersSchema.safeParse({
					Authorization: token,
					'X-Hyper-Ex': 'test',
					'X-Robinhood-API-Version': '1.0.0',
					'X-TimeZone-Id': 'UTC',
				});
				expect(result.success).toBe(true);
			}
		});
	});

	describe('invalid headers', () => {
		it('rejects Authorization without Bearer prefix', () => {
			const invalidHeaders = {
				Authorization: 'InvalidToken123',
				'X-Hyper-Ex': 'test',
				'X-Robinhood-API-Version': '1.0.0',
				'X-TimeZone-Id': 'UTC',
			};

			const result = RobinhoodHeadersSchema.safeParse(invalidHeaders);
			expect(result.success).toBe(false);
		});

		it('rejects empty Authorization', () => {
			const invalidHeaders = {
				Authorization: '',
				'X-Hyper-Ex': 'test',
				'X-Robinhood-API-Version': '1.0.0',
				'X-TimeZone-Id': 'UTC',
			};

			const result = RobinhoodHeadersSchema.safeParse(invalidHeaders);
			expect(result.success).toBe(false);
		});

		it('rejects missing required fields', () => {
			const missingFields = [
				{ 'X-Hyper-Ex': 'test', 'X-Robinhood-API-Version': '1.0.0', 'X-TimeZone-Id': 'UTC' },
				{
					Authorization: 'Bearer token',
					'X-Robinhood-API-Version': '1.0.0',
					'X-TimeZone-Id': 'UTC',
				},
				{ Authorization: 'Bearer token', 'X-Hyper-Ex': 'test', 'X-TimeZone-Id': 'UTC' },
				{ Authorization: 'Bearer token', 'X-Hyper-Ex': 'test', 'X-Robinhood-API-Version': '1.0.0' },
			];

			for (const headers of missingFields) {
				const result = RobinhoodHeadersSchema.safeParse(headers);
				expect(result.success).toBe(false);
			}
		});
	});
});

describe('REQUIRED_HEADER_NAMES', () => {
	it('contains all four required headers', () => {
		expect(REQUIRED_HEADER_NAMES).toHaveLength(4);
		expect(REQUIRED_HEADER_NAMES).toContain('Authorization');
		expect(REQUIRED_HEADER_NAMES).toContain('X-Hyper-Ex');
		expect(REQUIRED_HEADER_NAMES).toContain('X-Robinhood-API-Version');
		expect(REQUIRED_HEADER_NAMES).toContain('X-TimeZone-Id');
	});
});

describe('ActiveInstrumentSchema', () => {
	it('validates a valid instrument', () => {
		const instrument = {
			id: 'e39ed23a-7bd1-4587-b060-71988d9ef483',
			symbol: 'SPY',
			tradable_chain_id: 'c277b118-58d9-4060-8dc5-a3b5898955cb',
			simple_name: 'SPDR S&P 500 ETF Trust',
			tradeable: true,
			fractional_tradability: 'position_closing_only',
			url: 'https://api.robinhood.com/instruments/e39ed23a-7bd1-4587-b060-71988d9ef483/',
		};

		const result = ActiveInstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
	});

	it('accepts null tradable_chain_id', () => {
		const instrument = {
			id: 'e39ed23a-7bd1-4587-b060-71988d9ef483',
			symbol: 'SPY',
			tradable_chain_id: null,
			simple_name: 'SPDR S&P 500 ETF Trust',
			tradeable: true,
			fractional_tradability: 'position_closing_only',
			url: 'https://api.robinhood.com/instruments/e39ed23a-7bd1-4587-b060-71988d9ef483/',
		};

		const result = ActiveInstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
	});
});

describe('MarketQuoteSchema', () => {
	it('validates a valid quote', () => {
		const quote = {
			ask_price: '592.45',
			ask_size: 100,
			bid_price: '592.40',
			bid_size: 200,
			last_trade_price: '592.42',
			last_extended_hours_trade_price: '592.50',
			previous_close: '590.00',
			adjusted_previous_close: '590.00',
			previous_close_date: '2025-12-20',
			symbol: 'SPY',
			trading_halted: false,
			has_traded: true,
			last_trade_price_source: 'consolidated',
			updated_at: '2025-12-22T16:00:00Z',
			instrument: 'https://api.robinhood.com/instruments/e39ed23a-7bd1-4587-b060-71988d9ef483/',
			instrument_id: 'e39ed23a-7bd1-4587-b060-71988d9ef483',
		};

		const result = MarketQuoteSchema.safeParse(quote);
		expect(result.success).toBe(true);
	});

	it('accepts null last_extended_hours_trade_price', () => {
		const quote = {
			ask_price: '592.45',
			ask_size: 100,
			bid_price: '592.40',
			bid_size: 200,
			last_trade_price: '592.42',
			last_extended_hours_trade_price: null,
			previous_close: '590.00',
			adjusted_previous_close: '590.00',
			previous_close_date: '2025-12-20',
			symbol: 'SPY',
			trading_halted: false,
			has_traded: true,
			last_trade_price_source: 'consolidated',
			updated_at: '2025-12-22T16:00:00Z',
			instrument: 'https://api.robinhood.com/instruments/e39ed23a-7bd1-4587-b060-71988d9ef483/',
			instrument_id: 'e39ed23a-7bd1-4587-b060-71988d9ef483',
		};

		const result = MarketQuoteSchema.safeParse(quote);
		expect(result.success).toBe(true);
	});
});

describe('OptionsChainsResponseSchema', () => {
	it('validates a valid options chain response', () => {
		const response = {
			results: [
				{
					id: 'c277b118-58d9-4060-8dc5-a3b5898955cb',
					symbol: 'SPY',
					can_open_position: true,
					expiration_dates: ['2025-12-22', '2025-12-23', '2025-12-24'],
					underlying_instruments: [
						{
							id: 'e39ed23a-7bd1-4587-b060-71988d9ef483',
							instrument: 'https://api.robinhood.com/instruments/e39ed23a/',
							quantity: 100,
						},
					],
					trade_value_multiplier: '100.0000',
					min_ticks: { above_tick: '0.01', below_tick: '0.01', cutoff_price: '3.00' },
				},
			],
		};

		const result = OptionsChainsResponseSchema.safeParse(response);
		expect(result.success).toBe(true);
	});

	it('validates empty results array', () => {
		const response = { results: [] };
		const result = OptionsChainsResponseSchema.safeParse(response);
		expect(result.success).toBe(true);
	});
});

describe('StockInstrumentSchema', () => {
	it('validates a valid stock instrument with extended hours fractional tradability', () => {
		const instrument = {
			id: '1790dd4f-a7ff-409e-90de-cad5efafde10',
			url: 'https://api.robinhood.com/instruments/1790dd4f-a7ff-409e-90de-cad5efafde10/',
			symbol: 'QQQ',
			simple_name: 'Invesco QQQ',
			name: 'Invesco QQQ Trust, Series 1',
			type: 'etp',
			tradeable: true,
			tradability: 'tradable',
			fractional_tradability: 'tradable',
			extended_hours_fractional_tradability: true,
			market: 'https://api.robinhood.com/markets/XNAS/',
			state: 'active',
			country: 'US',
			day_trade_ratio: '0.2500',
			maintenance_ratio: '0.2500',
			margin_initial_ratio: '0.5000',
			list_date: '1999-03-10',
			tradable_chain_id: 'a95fe906-11f0-4699-bfc2-520dd706e98d',
			default_preset_percent_limit: '0.02',
			all_day_tradability: 'tradable',
		};

		const result = StockInstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.extended_hours_fractional_tradability).toBe(true);
			expect(result.data.type).toBe('etp');
		}
	});

	it('validates a stock without extended hours fractional tradability', () => {
		const instrument = {
			id: '4e5b6341-7157-453d-975d-6e73937ea281',
			url: 'https://api.robinhood.com/instruments/4e5b6341-7157-453d-975d-6e73937ea281/',
			symbol: 'CDE',
			simple_name: 'Coeur Mining',
			name: 'Coeur Mining, Inc.',
			type: 'stock',
			tradeable: true,
			tradability: 'tradable',
			fractional_tradability: 'tradable',
			extended_hours_fractional_tradability: false,
			market: 'https://api.robinhood.com/markets/XNYS/',
			state: 'active',
			country: 'US',
			day_trade_ratio: '0.2500',
			maintenance_ratio: '0.2500',
			margin_initial_ratio: '0.5000',
			list_date: '2013-05-10',
			tradable_chain_id: null,
			default_preset_percent_limit: '0.05',
			all_day_tradability: 'untradable',
		};

		const result = StockInstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.extended_hours_fractional_tradability).toBe(false);
			expect(result.data.type).toBe('stock');
		}
	});

	it('accepts null for optional fields', () => {
		const instrument = {
			id: '1790dd4f-a7ff-409e-90de-cad5efafde10',
			url: 'https://api.robinhood.com/instruments/1790dd4f/',
			symbol: 'TEST',
			simple_name: null,
			name: 'Test Stock',
			type: 'stock',
			tradeable: true,
			tradability: 'tradable',
			fractional_tradability: 'tradable',
			extended_hours_fractional_tradability: false,
			market: 'https://api.robinhood.com/markets/XNYS/',
			state: 'active',
			country: 'US',
			day_trade_ratio: '0.25',
			maintenance_ratio: '0.25',
			margin_initial_ratio: '0.50',
			list_date: null,
			tradable_chain_id: null,
			default_preset_percent_limit: '0.05',
			all_day_tradability: 'untradable',
		};

		const result = StockInstrumentSchema.safeParse(instrument);
		expect(result.success).toBe(true);
	});
});

describe('StockQuoteSchema', () => {
	it('validates a valid stock quote', () => {
		const quote = {
			ask_price: '618.90',
			ask_size: 180,
			bid_price: '618.84',
			bid_size: 100,
			last_trade_price: '619.18',
			last_extended_hours_trade_price: '618.90',
			previous_close: '619.21',
			adjusted_previous_close: '619.21',
			previous_close_date: '2025-12-22',
			symbol: 'QQQ',
			trading_halted: false,
			has_traded: true,
			updated_at: '2025-12-23T13:29:25Z',
			instrument: 'https://api.robinhood.com/instruments/1790dd4f/',
			instrument_id: '1790dd4f-a7ff-409e-90de-cad5efafde10',
		};

		const result = StockQuoteSchema.safeParse(quote);
		expect(result.success).toBe(true);
	});

	it('accepts null last_extended_hours_trade_price', () => {
		const quote = {
			ask_price: '100.00',
			ask_size: 100,
			bid_price: '99.95',
			bid_size: 100,
			last_trade_price: '100.00',
			last_extended_hours_trade_price: null,
			previous_close: '99.00',
			adjusted_previous_close: '99.00',
			previous_close_date: '2025-12-22',
			symbol: 'TEST',
			trading_halted: false,
			has_traded: true,
			updated_at: '2025-12-23T12:00:00Z',
			instrument: 'https://api.robinhood.com/instruments/test/',
			instrument_id: '550e8400-e29b-41d4-a716-446655440000',
		};

		const result = StockQuoteSchema.safeParse(quote);
		expect(result.success).toBe(true);
	});
});

describe('StockOrderCheckPayloadSchema', () => {
	it('validates a valid buy order check payload', () => {
		const payload = {
			order_body: {
				account: 'https://api.robinhood.com/accounts/5SJ06999/',
				ask_price: '618.90',
				bid_ask_timestamp: '2025-12-23T13:30:00Z',
				bid_price: '618.84',
				instrument: 'https://api.robinhood.com/instruments/1790dd4f/',
				market_hours: 'extended_hours' as const,
				order_form_version: 6 as const,
				position_effect: 'open' as const,
				ref_id: '550e8400-e29b-41d4-a716-446655440000',
				side: 'buy' as const,
				symbol: 'QQQ',
				time_in_force: 'gfd' as const,
				trigger: 'immediate' as const,
				type: 'limit' as const,
				preset_percent_limit: '0.02',
				price: '631.28',
				dollar_based_amount: {
					amount: '5.00',
					currency_code: 'USD' as const,
				},
				quantity: '0.007922',
				check_overrides: [],
			},
		};

		const result = StockOrderCheckPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it('validates a sell order check payload without dollar_based_amount', () => {
		const payload = {
			order_body: {
				account: 'https://api.robinhood.com/accounts/5SJ06999/',
				ask_price: '618.90',
				bid_ask_timestamp: '2025-12-23T13:30:00Z',
				bid_price: '618.84',
				instrument: 'https://api.robinhood.com/instruments/1790dd4f/',
				market_hours: 'regular_hours' as const,
				order_form_version: 6 as const,
				position_effect: 'close' as const,
				ref_id: '550e8400-e29b-41d4-a716-446655440000',
				side: 'sell' as const,
				symbol: 'QQQ',
				time_in_force: 'gfd' as const,
				trigger: 'immediate' as const,
				type: 'limit' as const,
				preset_percent_limit: '0.02',
				price: '606.26',
				quantity: '0.1',
				check_overrides: [],
			},
		};

		const result = StockOrderCheckPayloadSchema.safeParse(payload);
		expect(result.success).toBe(true);
	});

	it('rejects invalid market_hours value', () => {
		const payload = {
			order_body: {
				account: 'https://api.robinhood.com/accounts/5SJ06999/',
				ask_price: '618.90',
				bid_ask_timestamp: '2025-12-23T13:30:00Z',
				bid_price: '618.84',
				instrument: 'https://api.robinhood.com/instruments/1790dd4f/',
				market_hours: 'after_hours', // invalid
				order_form_version: 6 as const,
				position_effect: 'open' as const,
				ref_id: '550e8400-e29b-41d4-a716-446655440000',
				side: 'buy' as const,
				symbol: 'QQQ',
				time_in_force: 'gfd' as const,
				trigger: 'immediate' as const,
				type: 'limit' as const,
				preset_percent_limit: '0.02',
				price: '631.28',
				quantity: '0.1',
				check_overrides: [],
			},
		};

		const result = StockOrderCheckPayloadSchema.safeParse(payload);
		expect(result.success).toBe(false);
	});
});

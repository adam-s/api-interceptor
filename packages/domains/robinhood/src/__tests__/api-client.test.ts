import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RobinhoodApiClient } from '../api-client';
import type { RobinhoodHeaders } from '../types';

// Mock global fetch using vi.fn with proper typing
const mockFetch = vi.fn() as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
	globalThis.fetch = mockFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('RobinhoodApiClient', () => {
	let client: RobinhoodApiClient;

	const mockHeaders: RobinhoodHeaders = {
		Authorization: 'Bearer test-token-12345',
		'X-Hyper-Ex': 'test-hyper-ex-value',
		'X-Robinhood-API-Version': '1.315.0',
		'X-TimeZone-Id': 'America/New_York',
	};

	beforeEach(() => {
		client = new RobinhoodApiClient(mockHeaders);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('verify', () => {
		it('returns valid result when accounts API succeeds', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						results: [
							{
								account_number: '5SJ06999',
								type: 'cash',
								buying_power: '1000.00',
								portfolio_cash: '500.00',
							},
						],
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						first_name: 'Adam',
						last_name: 'Sohn',
					}),
				});

			const result = await client.verify();

			expect(result.valid).toBe(true);
			expect(result.accountNumber).toBe('5SJ06999');
			expect(result.accountType).toBe('cash');
			expect(result.buyingPower).toBe('1000.00');
			expect(result.firstName).toBe('Adam');
			expect(result.lastName).toBe('Sohn');
		});

		it('returns invalid when accounts API returns non-200', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => 'Unauthorized',
			});

			const result = await client.verify();

			expect(result.valid).toBe(false);
			expect(result.error).toContain('401');
		});

		it('returns invalid when no accounts found', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ results: [] }),
			});

			const result = await client.verify();

			expect(result.valid).toBe(false);
			expect(result.error).toBe('No accounts found');
		});

		it('handles network errors gracefully', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await client.verify();

			expect(result.valid).toBe(false);
			expect(result.error).toBe('Network error');
		});

		it('still returns valid if user profile fetch fails', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						results: [
							{
								account_number: '5SJ06999',
								type: 'cash',
								buying_power: '1000.00',
								portfolio_cash: '500.00',
							},
						],
					}),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
				});

			const result = await client.verify();

			expect(result.valid).toBe(true);
			expect(result.accountNumber).toBe('5SJ06999');
			expect(result.firstName).toBeUndefined();
			expect(result.lastName).toBeUndefined();
		});
	});

	describe('getBuyingPower', () => {
		it('returns buying power from first account', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [{ buying_power: '8.05' }],
				}),
			});

			const result = await client.getBuyingPower();

			expect(result).toBe('8.05');
		});

		it('returns null when API fails', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
			});

			const result = await client.getBuyingPower();

			expect(result).toBeNull();
		});

		it('returns null on network error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await client.getBuyingPower();

			expect(result).toBeNull();
		});
	});

	describe('getAccounts', () => {
		it('returns accounts array', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
							url: 'https://api.robinhood.com/accounts/5SJ06999/',
							account_number: '5SJ06999',
							type: 'cash',
							buying_power: '1000.00',
							cash: '500.00',
							cash_held_for_orders: '0.00',
							cash_available_for_withdrawal: '500.00',
							deactivated: false,
							deposit_halted: false,
							withdrawal_halted: false,
							option_level: '3',
							user: 'https://api.robinhood.com/user/',
							cash_balances: {
								buying_power: '1000.00',
								cash_held_for_options_collateral: '0.00',
								cash_available_for_withdrawal: '500.00',
							},
						},
					],
				}),
			});

			const accounts = await client.getAccounts();

			expect(accounts).toHaveLength(1);
			expect(accounts[0].account_number).toBe('5SJ06999');
		});

		it('throws on API error', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
			});

			await expect(client.getAccounts()).rejects.toThrow('Failed to fetch accounts: 403');
		});
	});

	describe('getPrimaryAccount', () => {
		it('returns first account', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
							url: 'https://api.robinhood.com/accounts/5SJ06999/',
							account_number: '5SJ06999',
							type: 'cash',
							buying_power: '1000.00',
							cash: '500.00',
							cash_held_for_orders: '0.00',
							cash_available_for_withdrawal: '500.00',
							deactivated: false,
							deposit_halted: false,
							withdrawal_halted: false,
							option_level: '3',
							user: 'https://api.robinhood.com/user/',
							cash_balances: {
								buying_power: '1000.00',
								cash_held_for_options_collateral: '0.00',
								cash_available_for_withdrawal: '500.00',
							},
						},
					],
				}),
			});

			const account = await client.getPrimaryAccount();

			expect(account?.account_number).toBe('5SJ06999');
		});

		it('returns null when no accounts', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ results: [] }),
			});

			const account = await client.getPrimaryAccount();

			expect(account).toBeNull();
		});
	});

	describe('getOptionsPositions', () => {
		it('returns options positions', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
							id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
							chain:
								'https://api.robinhood.com/options/chains/c277b118-58d9-4060-8dc5-a3b5898955cb/',
							symbol: 'SPY',
							strategy: 'long_call',
							average_open_price: '5.00',
							quantity: '1.00000',
							direction: 'credit',
							legs: [],
							created_at: '2025-01-01T00:00:00Z',
							updated_at: '2025-01-01T00:00:00Z',
						},
					],
					next: null,
					previous: null,
				}),
			});

			const positions = await client.getOptionsPositions('5SJ06999');

			expect(positions).toHaveLength(1);
			expect(positions[0].symbol).toBe('SPY');
		});

		it('handles pagination', async () => {
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						results: [
							{
								id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
								chain: 'https://api.robinhood.com/options/chains/c277b118/',
								symbol: 'SPY',
								strategy: 'long_call',
								average_open_price: '5.00',
								quantity: '1.00000',
								direction: 'credit',
								legs: [],
								created_at: '2025-01-01T00:00:00Z',
								updated_at: '2025-01-01T00:00:00Z',
							},
						],
						next: 'https://api.robinhood.com/options/aggregate_positions/?cursor=abc',
						previous: null,
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						results: [
							{
								id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
								chain: 'https://api.robinhood.com/options/chains/d388c229/',
								symbol: 'QQQ',
								strategy: 'long_put',
								average_open_price: '3.00',
								quantity: '2.00000',
								direction: 'debit',
								legs: [],
								created_at: '2025-01-01T00:00:00Z',
								updated_at: '2025-01-01T00:00:00Z',
							},
						],
						next: null,
						previous: 'https://api.robinhood.com/options/aggregate_positions/',
					}),
				});

			const positions = await client.getOptionsPositions('5SJ06999');

			expect(positions).toHaveLength(2);
			expect(positions[0].symbol).toBe('SPY');
			expect(positions[1].symbol).toBe('QQQ');
		});
	});

	describe('header building', () => {
		it('includes all required headers in requests', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ results: [] }),
			});

			await client.getAccounts();

			expect(mockFetch).toHaveBeenCalledWith(
				'https://api.robinhood.com/accounts/',
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: 'Bearer test-token-12345',
						'X-Hyper-Ex': 'test-hyper-ex-value',
						'X-Robinhood-API-Version': '1.315.0',
						'X-TimeZone-Id': 'America/New_York',
						Accept: 'application/json',
						'Content-Type': 'application/json',
					}),
				}),
			);
		});
	});

	describe('getStockInstrument', () => {
		it('returns stock instrument by symbol', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
							id: '1790dd4f-a7ff-409e-90de-cad5efafde10',
							url: 'https://api.robinhood.com/instruments/1790dd4f/',
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
							day_trade_ratio: '0.25',
							maintenance_ratio: '0.25',
							margin_initial_ratio: '0.50',
							list_date: '1999-03-10',
							tradable_chain_id: 'a95fe906-11f0-4699-bfc2-520dd706e98d',
							default_preset_percent_limit: '0.02',
							all_day_tradability: 'tradable',
						},
					],
					next: null,
					previous: null,
				}),
			});

			const instrument = await client.getStockInstrument('QQQ');

			expect(instrument).not.toBeNull();
			expect(instrument?.symbol).toBe('QQQ');
			expect(instrument?.extended_hours_fractional_tradability).toBe(true);
			expect(instrument?.type).toBe('etp');
		});

		it('returns null when no instrument found', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ results: [], next: null, previous: null }),
			});

			const instrument = await client.getStockInstrument('INVALID');

			expect(instrument).toBeNull();
		});
	});

	describe('getStockQuote', () => {
		it('returns stock quote by symbol', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
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
						},
					],
				}),
			});

			const quote = await client.getStockQuote('QQQ');

			expect(quote).not.toBeNull();
			expect(quote?.symbol).toBe('QQQ');
			expect(quote?.bid_price).toBe('618.84');
			expect(quote?.ask_price).toBe('618.90');
		});
	});

	describe('getStockPositions', () => {
		it('returns nonzero stock positions by default', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					results: [
						{
							url: 'https://api.robinhood.com/positions/5SJ06999/1790dd4f/',
							instrument: 'https://api.robinhood.com/instruments/1790dd4f/',
							instrument_id: '1790dd4f-a7ff-409e-90de-cad5efafde10',
							account: 'https://api.robinhood.com/accounts/5SJ06999/',
							account_number: '5SJ06999',
							average_buy_price: '600.00',
							pending_average_buy_price: '600.00',
							quantity: '0.5',
							intraday_average_buy_price: '600.00',
							intraday_quantity: '0.0',
							shares_available_for_exercise: '0.5',
							shares_held_for_buys: '0.0',
							shares_held_for_sells: '0.0',
							shares_held_for_stock_grants: '0.0',
							shares_held_for_options_collateral: '0.0',
							shares_held_for_options_events: '0.0',
							shares_pending_from_options_events: '0.0',
							created_at: '2025-01-01T00:00:00Z',
							updated_at: '2025-01-01T00:00:00Z',
						},
					],
					next: null,
					previous: null,
				}),
			});

			const positions = await client.getStockPositions({ nonzero: true });

			expect(positions).toHaveLength(1);
			expect(positions[0].quantity).toBe('0.5');
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('nonzero=true'),
				expect.anything(),
			);
		});
	});

	describe('checkStockOrder', () => {
		it('returns check response with no alert for valid order', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					alert: null,
				}),
			});

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
					quantity: '0.1',
					check_overrides: [],
				},
			};

			const response = await client.checkStockOrder(payload);

			expect(response.alert).toBeNull();
			expect(mockFetch).toHaveBeenCalledWith(
				'https://bonfire.robinhood.com/equity_trading/orders/checks/?endpoint_version=2022-03-03',
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify(payload),
				}),
			);
		});

		it('returns check response with alert for invalid order', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					alert: {
						alert_type: 'equity_untradable_extended_hours_frac_instrument',
						title: "This stock can't be traded as a fractional share right now",
						subtitle_markdown:
							'During pre-market and after-hours, only some stocks can be traded as fractional shares.',
						action_buttons: [],
					},
				}),
			});

			const payload = {
				order_body: {
					account: 'https://api.robinhood.com/accounts/5SJ06999/',
					ask_price: '19.43',
					bid_ask_timestamp: '2025-12-23T13:30:00Z',
					bid_price: '19.15',
					instrument: 'https://api.robinhood.com/instruments/cde/',
					market_hours: 'extended_hours' as const,
					order_form_version: 6 as const,
					position_effect: 'open' as const,
					ref_id: '550e8400-e29b-41d4-a716-446655440000',
					side: 'buy' as const,
					symbol: 'CDE',
					time_in_force: 'gfd' as const,
					trigger: 'immediate' as const,
					type: 'limit' as const,
					preset_percent_limit: '0.02',
					price: '19.82',
					quantity: '0.25',
					check_overrides: [],
				},
			};

			const response = await client.checkStockOrder(payload);

			expect(response.alert).not.toBeNull();
			expect(response.alert?.alert_type).toBe('equity_untradable_extended_hours_frac_instrument');
		});
	});
});

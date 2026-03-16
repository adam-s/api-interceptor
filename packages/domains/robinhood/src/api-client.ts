/**
 * Robinhood API Client
 *
 * Makes authenticated API calls using captured headers.
 * Provides methods for account info, positions, options chains, and market data.
 *
 * @module browser/robinhood/api-client
 */

import {
	type Account,
	AccountsResponseSchema,
	type OptionSettingsResponse,
	OptionSettingsResponseSchema,
	type OptionsAggregatedPosition,
	OptionsAggregatedPositionsResponseSchema,
	type OptionsBuyingPowerResponse,
	OptionsBuyingPowerResponseSchema,
	type OptionsChain,
	OptionsChainsResponseSchema,
	type OptionsCollateralResponse,
	OptionsCollateralResponseSchema,
	type OptionsInstrument,
	OptionsInstrumentsResponseSchema,
	type OptionsMarketData,
	OptionsMarketDataResponseSchema,
	type OptionsOrder,
	OptionsOrdersResponseSchema,
	type PricebookSnapshot,
	PricebookSnapshotSchema,
	type RobinhoodHeaders,
	type StockBuyOrderPayload,
	type StockFeesCheckResponse,
	StockFeesCheckResponseSchema,
	type StockInstrument,
	StockInstrumentsResponseSchema,
	type StockOrder,
	type StockOrderCheckPayload,
	type StockOrderCheckResponse,
	StockOrderCheckResponseSchema,
	StockOrdersResponseSchema,
	type StockPosition,
	StockPositionsResponseSchema,
	type StockQuote,
	StockQuotesResponseSchema,
	type StockSellOrderPayload,
	type StrategyChainTemplateResponse,
	StrategyChainTemplateResponseSchema,
} from './types';

const ROBINHOOD_API_BASE = 'https://api.robinhood.com';
const ROBINHOOD_BONFIRE_BASE = 'https://bonfire.robinhood.com';

/** Account response from /accounts/ endpoint */
interface AccountInfo {
	url: string;
	account_number: string;
	type: string;
	portfolio_cash: string;
	buying_power: string;
	cash: string;
	cash_available_for_withdrawal: string;
	user: string;
}

interface AccountsResponse {
	results: AccountInfo[];
}

/** User profile response */
interface UserResponse {
	id: string;
	username: string;
	first_name: string;
	last_name: string;
	email: string;
}

/** Verification result */
export interface VerificationResult {
	valid: boolean;
	accountNumber?: string;
	accountType?: string;
	buyingPower?: string;
	portfolioCash?: string;
	firstName?: string;
	lastName?: string;
	error?: string;
	[key: string]: unknown; // Allow additional domain-specific fields
}

/**
 * Robinhood API client for making authenticated requests.
 */
export class RobinhoodApiClient {
	private headers: RobinhoodHeaders;

	constructor(headers: RobinhoodHeaders) {
		this.headers = headers;
	}

	/**
	 * Build fetch headers object from RobinhoodHeaders.
	 */
	private buildHeaders(): Record<string, string> {
		return {
			Authorization: this.headers.Authorization,
			'X-Hyper-Ex': this.headers['X-Hyper-Ex'],
			'X-Robinhood-API-Version': this.headers['X-Robinhood-API-Version'],
			'X-TimeZone-Id': this.headers['X-TimeZone-Id'],
			Accept: 'application/json',
			'Content-Type': 'application/json',
		};
	}

	/**
	 * Verify credentials by making real API calls.
	 * This proves the headers work without guessing.
	 */
	async verify(): Promise<VerificationResult> {
		try {
			// First, try to get accounts - this is the most reliable test
			const accountsResponse = await fetch(`${ROBINHOOD_API_BASE}/accounts/`, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!accountsResponse.ok) {
				const errorText = await accountsResponse.text();
				return {
					valid: false,
					error: `API returned ${accountsResponse.status}: ${errorText.slice(0, 200)}`,
				};
			}

			const accounts: AccountsResponse = await accountsResponse.json();

			if (accounts.results.length === 0) {
				return {
					valid: false,
					error: 'No accounts found',
				};
			}

			const primaryAccount = accounts.results[0];

			// Try to get user profile for name
			let firstName: string | undefined;
			let lastName: string | undefined;

			try {
				const userResponse = await fetch(`${ROBINHOOD_API_BASE}/user/`, {
					method: 'GET',
					headers: this.buildHeaders(),
				});

				if (userResponse.ok) {
					const user: UserResponse = await userResponse.json();
					firstName = user.first_name;
					lastName = user.last_name;
				}
			} catch {
				// User profile is optional
			}

			return {
				valid: true,
				accountNumber: primaryAccount.account_number,
				accountType: primaryAccount.type,
				buyingPower: primaryAccount.buying_power,
				portfolioCash: primaryAccount.portfolio_cash,
				firstName,
				lastName,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				valid: false,
				error: message,
			};
		}
	}

	/**
	 * Get current buying power.
	 */
	async getBuyingPower(): Promise<string | null> {
		try {
			const response = await fetch(`${ROBINHOOD_API_BASE}/accounts/`, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) return null;

			const data: AccountsResponse = await response.json();
			return data.results[0]?.buying_power ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * Get portfolio value.
	 */
	async getPortfolioValue(): Promise<string | null> {
		try {
			const response = await fetch(`${ROBINHOOD_API_BASE}/accounts/`, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) return null;

			const data = AccountsResponseSchema.parse(await response.json());
			return data.results[0]?.cash ?? null;
		} catch {
			return null;
		}
	}

	// ============================================================================
	// Account Methods
	// ============================================================================

	/**
	 * Get all accounts.
	 */
	async getAccounts(): Promise<Account[]> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/accounts/`, {
			method: 'GET',
			headers: this.buildHeaders(),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch accounts: ${response.status}`);
		}

		const data = AccountsResponseSchema.parse(await response.json());
		return data.results;
	}

	/**
	 * Get primary account.
	 */
	async getPrimaryAccount(): Promise<Account | null> {
		const accounts = await this.getAccounts();
		return accounts[0] ?? null;
	}

	// ============================================================================
	// Options Positions
	// ============================================================================

	/**
	 * Get aggregated options positions.
	 */
	async getOptionsPositions(
		accountNumber: string,
		options: { nonzero?: boolean } = {},
	): Promise<OptionsAggregatedPosition[]> {
		const { nonzero = true } = options;
		const results: OptionsAggregatedPosition[] = [];
		let cursor: string | null = null;

		do {
			const url = cursor
				? cursor
				: `${ROBINHOOD_API_BASE}/options/aggregate_positions/?account_numbers=${accountNumber}&nonzero=${nonzero}`;

			const response = await fetch(url, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch positions: ${response.status}`);
			}

			const data = OptionsAggregatedPositionsResponseSchema.parse(await response.json());
			results.push(...data.results);
			cursor = data.next;
		} while (cursor);

		return results;
	}

	// ============================================================================
	// Options Orders
	// ============================================================================

	/**
	 * Get options orders.
	 */
	async getOptionsOrders(
		accountNumber: string,
		options: { states?: string } = {},
	): Promise<OptionsOrder[]> {
		const { states } = options;
		const results: OptionsOrder[] = [];
		let cursor: string | null = null;

		do {
			let url = cursor
				? cursor
				: `${ROBINHOOD_API_BASE}/options/orders/?account_numbers=${accountNumber}`;

			if (!cursor && states) {
				url += `&states=${states}`;
			}

			const response = await fetch(url, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch orders: ${response.status}`);
			}

			const data = OptionsOrdersResponseSchema.parse(await response.json());
			results.push(...data.results);
			cursor = data.next;
		} while (cursor);

		return results;
	}

	// ============================================================================
	// Options Chains
	// ============================================================================

	/**
	 * Get options chain for a symbol.
	 */
	async getOptionsChain(symbol: string): Promise<OptionsChain | null> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/options/chains/?equity_symbol=${symbol}`, {
			method: 'GET',
			headers: this.buildHeaders(),
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch options chain: ${response.status}`);
		}

		const data = OptionsChainsResponseSchema.parse(await response.json());
		return data.results[0] ?? null;
	}

	/**
	 * Get options instruments for a chain and expiration.
	 */
	async getOptionsInstruments(
		chainId: string,
		expirationDate: string,
		type: 'call' | 'put',
	): Promise<OptionsInstrument[]> {
		const results: OptionsInstrument[] = [];
		let cursor: string | null = null;

		do {
			const url = cursor
				? cursor
				: `${ROBINHOOD_API_BASE}/options/instruments/?chain_id=${chainId}&expiration_dates=${expirationDate}&type=${type}&state=active`;

			const response = await fetch(url, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch instruments: ${response.status}`);
			}

			const data = OptionsInstrumentsResponseSchema.parse(await response.json());
			results.push(...data.results);
			cursor = data.next;
		} while (cursor);

		return results;
	}

	// ============================================================================
	// Options Market Data
	// ============================================================================

	/**
	 * Get market data for options instruments.
	 * Note: API limit is 40 IDs per request, this handles batching automatically.
	 */
	async getOptionsMarketData(instrumentIds: string[]): Promise<OptionsMarketData[]> {
		if (instrumentIds.length === 0) return [];

		// Batch into chunks of 40 (API limit)
		const chunks: string[][] = [];
		for (let i = 0; i < instrumentIds.length; i += 40) {
			chunks.push(instrumentIds.slice(i, i + 40));
		}

		const results: OptionsMarketData[] = [];

		for (const chunk of chunks) {
			const response = await fetch(
				`${ROBINHOOD_API_BASE}/marketdata/options/?ids=${chunk.join(',')}`,
				{
					method: 'GET',
					headers: this.buildHeaders(),
				},
			);

			if (!response.ok) {
				throw new Error(`Failed to fetch market data: ${response.status}`);
			}

			const data = OptionsMarketDataResponseSchema.parse(await response.json());
			results.push(...data.results);
		}

		return results;
	}

	// ============================================================================
	// Stock Instruments
	// ============================================================================

	/**
	 * Get stock instrument by symbol.
	 */
	async getStockInstrument(symbol: string): Promise<StockInstrument | null> {
		const response = await fetch(
			`${ROBINHOOD_API_BASE}/instruments/?symbol=${symbol.toUpperCase()}`,
			{
				method: 'GET',
				headers: this.buildHeaders(),
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch instrument: ${response.status}`);
		}

		const data = StockInstrumentsResponseSchema.parse(await response.json());
		return data.results[0] ?? null;
	}

	/**
	 * Get stock instrument by ID.
	 */
	async getStockInstrumentById(instrumentId: string): Promise<StockInstrument | null> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/instruments/${instrumentId}/`, {
			method: 'GET',
			headers: this.buildHeaders(),
		});

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to fetch instrument: ${response.status}`);
		}

		const data = await response.json();
		// Single instrument response, wrap in results array for parsing
		return StockInstrumentsResponseSchema.parse({ results: [data], next: null, previous: null })
			.results[0];
	}

	// ============================================================================
	// Stock Quotes
	// ============================================================================

	/**
	 * Get stock quote by symbol.
	 */
	async getStockQuote(symbol: string): Promise<StockQuote | null> {
		const response = await fetch(
			`${ROBINHOOD_API_BASE}/marketdata/quotes/?symbols=${symbol.toUpperCase()}&bounds=24_5`,
			{
				method: 'GET',
				headers: this.buildHeaders(),
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch quote: ${response.status}`);
		}

		const data = StockQuotesResponseSchema.parse(await response.json());
		return data.results[0] ?? null;
	}

	/**
	 * Get stock quotes by instrument IDs.
	 */
	async getStockQuotesByIds(instrumentIds: string[]): Promise<StockQuote[]> {
		if (instrumentIds.length === 0) return [];

		const response = await fetch(
			`${ROBINHOOD_API_BASE}/marketdata/quotes/?bounds=24_5&ids=${instrumentIds.join(',')}`,
			{
				method: 'GET',
				headers: this.buildHeaders(),
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch quotes: ${response.status}`);
		}

		const data = StockQuotesResponseSchema.parse(await response.json());
		return data.results;
	}

	// ============================================================================
	// Stock Positions
	// ============================================================================

	/**
	 * Get stock positions.
	 */
	async getStockPositions(options: { nonzero?: boolean } = {}): Promise<StockPosition[]> {
		const { nonzero = true } = options;
		const results: StockPosition[] = [];
		let cursor: string | null = null;

		do {
			const url = cursor ? cursor : `${ROBINHOOD_API_BASE}/positions/?nonzero=${nonzero}`;

			const response = await fetch(url, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch positions: ${response.status}`);
			}

			const data = StockPositionsResponseSchema.parse(await response.json());
			results.push(...data.results);
			cursor = data.next;
		} while (cursor);

		return results;
	}

	// ============================================================================
	// Stock Orders
	// ============================================================================

	/** Cache for instrument ID -> symbol lookups */
	private instrumentSymbolCache = new Map<string, string>();

	/**
	 * Get stock orders with symbol enrichment.
	 * Robinhood's /orders/ endpoint doesn't return symbol directly,
	 * so we look up instruments and cache the results.
	 */
	async getStockOrders(
		accountNumber: string,
		options: { instrumentId?: string } = {},
	): Promise<StockOrder[]> {
		const { instrumentId } = options;
		const results: StockOrder[] = [];
		let cursor: string | null = null;

		do {
			let url = cursor ? cursor : `${ROBINHOOD_API_BASE}/orders/?account_numbers=${accountNumber}`;

			if (!cursor && instrumentId) {
				url += `&instrument=${ROBINHOOD_API_BASE}/instruments/${instrumentId}/`;
			}

			const response = await fetch(url, {
				method: 'GET',
				headers: this.buildHeaders(),
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch orders: ${response.status}`);
			}

			const data = StockOrdersResponseSchema.parse(await response.json());
			results.push(...data.results);
			cursor = data.next;
		} while (cursor);

		// Enrich orders with symbols from instrument lookups
		await this.enrichOrdersWithSymbols(results);

		return results;
	}

	/**
	 * Enrich orders with symbol data from instrument lookups.
	 * Uses cache to avoid redundant API calls.
	 */
	private async enrichOrdersWithSymbols(orders: StockOrder[]): Promise<void> {
		// Collect unique instrument IDs that need lookup
		const instrumentIdsToFetch = new Set<string>();
		for (const order of orders) {
			if (!order.symbol && order.instrument_id) {
				if (!this.instrumentSymbolCache.has(order.instrument_id)) {
					instrumentIdsToFetch.add(order.instrument_id);
				}
			}
		}

		// Fetch instruments in parallel (batch of 10 at a time to avoid rate limits)
		const idsArray = Array.from(instrumentIdsToFetch);
		for (let i = 0; i < idsArray.length; i += 10) {
			const batch = idsArray.slice(i, i + 10);
			await Promise.all(
				batch.map(async (instrumentId) => {
					try {
						const instrument = await this.getStockInstrumentById(instrumentId);
						if (instrument?.symbol) {
							this.instrumentSymbolCache.set(instrumentId, instrument.symbol);
						}
					} catch {
						// Ignore lookup failures - symbol will remain undefined
					}
				}),
			);
		}

		// Apply cached symbols to orders
		for (const order of orders) {
			if (!order.symbol && order.instrument_id) {
				const symbol = this.instrumentSymbolCache.get(order.instrument_id);
				if (symbol) {
					(order as { symbol?: string }).symbol = symbol;
				}
			}
		}
	}

	/**
	 * Get a single stock order by ID.
	 */
	async getStockOrder(orderId: string): Promise<StockOrder | null> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/orders/${orderId}/`, {
			method: 'GET',
			headers: this.buildHeaders(),
		});

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to fetch order: ${response.status}`);
		}

		const data = await response.json();
		// Wrap for consistent parsing
		return StockOrdersResponseSchema.parse({ results: [data], next: null, previous: null })
			.results[0];
	}

	/**
	 * Check stock order before placing (validates tradability, extended hours, etc.)
	 */
	async checkStockOrder(payload: StockOrderCheckPayload): Promise<StockOrderCheckResponse> {
		const response = await fetch(
			'https://bonfire.robinhood.com/equity_trading/orders/checks/?endpoint_version=2022-03-03',
			{
				method: 'POST',
				headers: this.buildHeaders(),
				body: JSON.stringify(payload),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Order check failed: ${response.status} - ${errorText}`);
		}

		return StockOrderCheckResponseSchema.parse(await response.json());
	}

	/**
	 * Check fees for a sell order.
	 */
	async checkStockFees(
		instrumentId: string,
		price: string,
		quantity: string,
	): Promise<StockFeesCheckResponse> {
		const url = new URL(`${ROBINHOOD_API_BASE}/orders/fees/`);
		url.searchParams.set('instrument_id', instrumentId);
		url.searchParams.set('is_otc', 'false');
		url.searchParams.set('price', price);
		url.searchParams.set('quantity', quantity);
		url.searchParams.set('side', 'sell');

		const response = await fetch(url.toString(), {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify({
				instrument_id: instrumentId,
				is_otc: false,
				price,
				quantity,
				side: 'sell',
			}),
		});

		if (!response.ok) {
			throw new Error(`Fees check failed: ${response.status}`);
		}

		return StockFeesCheckResponseSchema.parse(await response.json());
	}

	/**
	 * Place a fractional stock buy order.
	 */
	async placeStockBuyOrder(payload: StockBuyOrderPayload): Promise<StockOrder> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/orders/`, {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to place buy order: ${response.status} - ${errorText}`);
		}

		const data = await response.json();
		return StockOrdersResponseSchema.parse({ results: [data], next: null, previous: null })
			.results[0];
	}

	/**
	 * Place a fractional stock sell order.
	 */
	async placeStockSellOrder(payload: StockSellOrderPayload): Promise<StockOrder> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/orders/`, {
			method: 'POST',
			headers: this.buildHeaders(),
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Failed to place sell order: ${response.status} - ${errorText}`);
		}

		const data = await response.json();
		return StockOrdersResponseSchema.parse({ results: [data], next: null, previous: null })
			.results[0];
	}

	/**
	 * Cancel a stock order.
	 */
	async cancelStockOrder(orderId: string): Promise<void> {
		const response = await fetch(`${ROBINHOOD_API_BASE}/orders/${orderId}/cancel/`, {
			method: 'POST',
			headers: this.buildHeaders(),
		});

		if (!response.ok) {
			throw new Error(`Failed to cancel order: ${response.status}`);
		}
	}

	// ============================================================================
	// Pricebook / Market Data
	// ============================================================================

	/**
	 * Get Level 2 pricebook snapshot for an instrument.
	 */
	async getPricebookSnapshot(instrumentId: string): Promise<PricebookSnapshot | null> {
		const response = await fetch(
			`${ROBINHOOD_API_BASE}/marketdata/pricebook/snapshots/${instrumentId}/`,
			{ method: 'GET', headers: this.buildHeaders() },
		);

		if (!response.ok) {
			if (response.status === 404) return null;
			throw new Error(`Failed to fetch pricebook: ${response.status}`);
		}

		return PricebookSnapshotSchema.parse(await response.json());
	}

	// ============================================================================
	// Options Pre-Validation
	// ============================================================================

	/**
	 * Check collateral requirements for an options order.
	 */
	async getOptionsOrderCollateral(orderPayload: unknown): Promise<OptionsCollateralResponse> {
		const url = new URL(`${ROBINHOOD_API_BASE}/options/orders/collateral/`);
		url.searchParams.set('order', JSON.stringify(orderPayload));

		const response = await fetch(url.toString(), {
			method: 'GET',
			headers: this.buildHeaders(),
		});

		if (!response.ok) {
			throw new Error(`Collateral check failed: ${response.status}`);
		}

		return OptionsCollateralResponseSchema.parse(await response.json());
	}

	/**
	 * Get options-specific buying power for an account.
	 */
	async getOptionsBuyingPower(accountNumber: string): Promise<OptionsBuyingPowerResponse> {
		const response = await fetch(
			`${ROBINHOOD_BONFIRE_BASE}/accounts/${accountNumber}/options_buying_power`,
			{ method: 'GET', headers: this.buildHeaders() },
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch options buying power: ${response.status}`);
		}

		return OptionsBuyingPowerResponseSchema.parse(await response.json());
	}

	/**
	 * Get option settings for an account.
	 */
	async getOptionSettings(accountNumber: string): Promise<OptionSettingsResponse> {
		const response = await fetch(
			`${ROBINHOOD_API_BASE}/options/option_settings/${accountNumber}/`,
			{ method: 'GET', headers: this.buildHeaders() },
		);

		if (!response.ok) {
			throw new Error(`Failed to fetch option settings: ${response.status}`);
		}

		return OptionSettingsResponseSchema.parse(await response.json());
	}

	// ============================================================================
	// Strategy Templates
	// ============================================================================

	/**
	 * Get strategy chain template (leg structure, direction, sentiment).
	 * Returns null for unsupported strategies (400/404).
	 */
	async getStrategyTemplate(strategy: string): Promise<StrategyChainTemplateResponse | null> {
		const response = await fetch(
			`${ROBINHOOD_BONFIRE_BASE}/options/strategy_chain_template/v1/?strategy=${encodeURIComponent(strategy)}`,
			{ method: 'GET', headers: this.buildHeaders() },
		);

		if (!response.ok) {
			if (response.status === 400 || response.status === 404) return null;
			throw new Error(`Failed to fetch strategy template: ${response.status}`);
		}

		return StrategyChainTemplateResponseSchema.parse(await response.json());
	}
}

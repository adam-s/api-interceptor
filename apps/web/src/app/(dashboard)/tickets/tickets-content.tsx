'use client';

import { useCallback, useState } from 'react';

const API_BASE = 'http://localhost:3001';

interface DomainResult {
	domain: string;
	data: unknown;
	error?: string;
	loading: boolean;
}

export default function TicketsContent() {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<DomainResult[]>([]);
	const [searching, setSearching] = useState(false);

	const handleSearch = useCallback(async () => {
		if (!query.trim()) return;
		setSearching(true);

		// Fetch from both domains in parallel
		const domains = [
			{
				name: 'stubhub',
				fetch: () =>
					fetch(`${API_BASE}/api/stubhub/events/search`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ query: query.trim() }),
					}),
			},
			{
				name: 'ticketmaster',
				fetch: () => fetch(`${API_BASE}/api/ticketmaster/trending/searches`),
			},
		];

		const results = await Promise.allSettled(
			domains.map(async (d) => {
				try {
					const res = await d.fetch();
					if (!res.ok) {
						const errBody = await res.json().catch(() => ({ error: res.statusText }));
						return {
							domain: d.name,
							data: null,
							error: errBody.error || `HTTP ${res.status}`,
							loading: false,
						};
					}
					const data = await res.json();
					return { domain: d.name, data, error: undefined, loading: false };
				} catch (err) {
					return {
						domain: d.name,
						data: null,
						error: err instanceof Error ? err.message : String(err),
						loading: false,
					};
				}
			}),
		);

		setResults(
			results.map((r) =>
				r.status === 'fulfilled'
					? r.value
					: { domain: '?', data: null, error: 'Failed', loading: false },
			),
		);
		setSearching(false);
	}, [query]);

	return (
		<div className="flex flex-1 flex-col gap-6 p-6">
			<div>
				<h1 className="text-2xl font-bold">Ticket Price Comparison</h1>
				<p className="text-sm text-muted-foreground">
					Search for events across StubHub and Ticketmaster
				</p>
			</div>

			{/* Search */}
			<div className="flex gap-2">
				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
					placeholder="Search for an artist or event (e.g., Bad Bunny)..."
					className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<button
					type="button"
					onClick={handleSearch}
					disabled={searching || !query.trim()}
					className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					{searching ? 'Searching...' : 'Search'}
				</button>
			</div>

			{/* Results Grid */}
			{results.length > 0 && (
				<div className="grid gap-6 md:grid-cols-2">
					{results.map((result) => (
						<div key={result.domain} className="rounded-lg border border-border bg-card p-4">
							<h2 className="mb-3 text-lg font-semibold capitalize">{result.domain}</h2>

							{result.error && (
								<div className="rounded bg-destructive/10 p-3 text-sm text-destructive">
									{result.error}
									{result.error.includes('Browser not connected') && (
										<p className="mt-1 text-xs text-muted-foreground">
											Connect a browser session first:{' '}
											<code className="rounded bg-muted px-1">
												/browser?profile={result.domain}&capture={result.domain}.com
											</code>
										</p>
									)}
								</div>
							)}

							{result.data && (
								<pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
									{JSON.stringify(result.data, null, 2)}
								</pre>
							)}

							{!result.error && !result.data && (
								<p className="text-sm text-muted-foreground">No results</p>
							)}
						</div>
					))}
				</div>
			)}

			{/* Instructions when no results */}
			{results.length === 0 && !searching && (
				<div className="rounded-lg border border-dashed border-border p-8 text-center">
					<p className="text-muted-foreground">Type an artist or event name and press Search.</p>
					<p className="mt-2 text-xs text-muted-foreground">
						Results come from proxy APIs that route through authenticated browser sessions. Make
						sure browsers are connected to each domain first.
					</p>
				</div>
			)}
		</div>
	);
}

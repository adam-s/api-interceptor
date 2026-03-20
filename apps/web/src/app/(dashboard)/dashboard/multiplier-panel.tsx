'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Stats {
	mean: number;
	median: number;
	stdev: number;
	min: number;
	max: number;
	count: number;
}

interface State {
	multiplier: number;
	count: number;
	running: boolean;
	connections: number;
	updatedAt: string;
	history: number[];
}

function StatCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="text-center">
			<p className="text-xs font-medium text-blue-400">{label}</p>
			<p className="text-sm font-bold tabular-nums">{value}</p>
		</div>
	);
}

export default function MultiplierPanel() {
	const [state, setState] = useState<State | null>(null);
	const [stats, setStats] = useState<Stats | null>(null);
	const [connected, setConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const lastJsonRef = useRef('');
	const computingRef = useRef(false);

	useEffect(() => {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
		wsRef.current = ws;

		ws.addEventListener('open', () => setConnected(true));
		ws.addEventListener('close', () => setConnected(false));
		ws.addEventListener('error', () => setConnected(false));

		ws.addEventListener('message', (e: MessageEvent) => {
			let msg: { type: string; data?: unknown; requestId?: string };
			try {
				msg = JSON.parse(e.data as string);
			} catch {
				return;
			}

			if (msg.type === 'state') {
				const json = JSON.stringify(msg.data);
				if (json === lastJsonRef.current) return;
				lastJsonRef.current = json;
				setState(msg.data as State);
			} else if (msg.type === 'compute:result') {
				const data = msg.data as Stats;
				if (data.mean !== undefined) setStats(data);
				computingRef.current = false;
			} else if (msg.type === 'compute:error') {
				computingRef.current = false;
			}
		});

		return () => {
			ws.close();
			wsRef.current = null;
			setConnected(false);
		};
	}, []);

	// Auto-compute stats via Python bridge when history grows
	useEffect(() => {
		if (!state || state.history.length < 2 || computingRef.current) return;
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

		computingRef.current = true;
		wsRef.current.send(
			JSON.stringify({
				type: 'compute',
				requestId: crypto.randomUUID(),
				numbers: state.history,
			}),
		);
	}, [state?.history.length, state]);

	const sendAction = useCallback((action: string, value?: number) => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
		const msg = value !== undefined ? { type: action, value } : { type: action };
		wsRef.current.send(JSON.stringify(msg));
	}, []);

	const handleReset = useCallback(() => {
		setStats(null);
		sendAction('reset');
	}, [sendAction]);

	if (!state) {
		return (
			<div className="rounded-lg border border-border p-8 shadow-sm">
				<p className="text-muted-foreground">Connecting...</p>
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-lg border border-border p-8 shadow-sm">
			{/* Count display */}
			<div className="text-center">
				<p className="text-sm font-medium text-muted-foreground">Count</p>
				<p className="text-5xl font-bold tabular-nums">{state.count}</p>
			</div>

			{/* Multiplier controls */}
			<div className="flex items-center justify-center gap-4">
				<button
					type="button"
					onClick={() => sendAction('decrement')}
					className="rounded-lg border border-border px-4 py-2 text-lg font-bold hover:bg-muted active:bg-muted/80"
				>
					−
				</button>
				<div className="text-center">
					<p className="text-sm font-medium text-muted-foreground">Multiplier</p>
					<p className="text-2xl font-bold tabular-nums">
						{state.multiplier > 0 ? '+' : ''}
						{state.multiplier}
					</p>
				</div>
				<button
					type="button"
					onClick={() => sendAction('increment')}
					className="rounded-lg border border-border px-4 py-2 text-lg font-bold hover:bg-muted active:bg-muted/80"
				>
					+
				</button>
			</div>

			{/* Pause / Play + Reset */}
			<div className="flex justify-center gap-3">
				<button
					type="button"
					onClick={() => sendAction(state.running ? 'pause' : 'play')}
					className="rounded-lg border border-border px-6 py-2 font-medium hover:bg-muted active:bg-muted/80"
				>
					{state.running ? 'Pause' : 'Play'}
				</button>
				<button
					type="button"
					onClick={handleReset}
					className="rounded-lg border border-border px-6 py-2 font-medium text-muted-foreground hover:bg-muted active:bg-muted/80"
				>
					Reset
				</button>
			</div>

			{/* Python-computed stats — always visible */}
			<div className="rounded-lg border border-blue-500/20 bg-blue-950/30 p-4">
				<p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-blue-500">
					Python Analysis{stats ? ` (last ${stats.count} ticks)` : ''}
				</p>
				<div className="grid grid-cols-3 gap-3">
					<StatCell label="Mean" value={stats ? stats.mean.toFixed(1) : '--'} />
					<StatCell label="Median" value={stats ? stats.median.toFixed(1) : '--'} />
					<StatCell label="Stdev" value={stats ? stats.stdev.toFixed(1) : '--'} />
					<StatCell label="Min" value={stats ? String(stats.min) : '--'} />
					<StatCell label="Max" value={stats ? String(stats.max) : '--'} />
					<StatCell label="Samples" value={stats ? String(stats.count) : '--'} />
				</div>
			</div>

			{/* Status bar */}
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>
					{connected ? 'Connected' : 'Disconnected'} · {state.connections}{' '}
					{state.connections === 1 ? 'client' : 'clients'}
				</span>
				<span>{state.running ? 'Running' : 'Paused'}</span>
			</div>
		</div>
	);
}

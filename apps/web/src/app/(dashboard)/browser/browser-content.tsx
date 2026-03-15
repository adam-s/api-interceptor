'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Omnibar } from '@/components/browser/omnibar';
import {
	RemoteBrowserViewer,
	type RemoteBrowserViewerHandle,
} from '@/components/browser/remote-viewer';
import { Button } from '@/components/ui/button';

type ConnectionStatus = 'connecting' | 'connected' | 'ready' | 'disconnected' | 'error';

/** Robinhood verification data from the interceptor */
interface RobinhoodInfo {
	accountNumber?: string;
	firstName?: string;
	lastName?: string;
	buyingPower?: string;
	error?: string;
}

export default function BrowserContent() {
	const [status, setStatus] = useState<ConnectionStatus>('disconnected');
	const [url, setUrl] = useState('');
	const [frameCount, setFrameCount] = useState(0);
	const [robinhoodInfo, setRobinhoodInfo] = useState<RobinhoodInfo | null>(null);
	const [warmingUp, setWarmingUp] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const viewerRef = useRef<RemoteBrowserViewerHandle | null>(null);

	// Build WebSocket URL with robinhood-trading profile
	const wsUrl = useMemo(() => {
		const params = new URLSearchParams();
		params.set('profile', 'robinhood-trading');
		return `ws://localhost:3001/browser/stream?${params.toString()}`;
	}, []);

	const handleWsRef = useCallback((ws: WebSocket | null) => {
		wsRef.current = ws;
	}, []);

	const handleUrlChange = useCallback((newUrl: string) => {
		if (newUrl.startsWith('data:') || newUrl === 'about:blank') return;
		setUrl(newUrl);
	}, []);

	const sendMessage = useCallback((message: object) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(message));
		}
	}, []);

	// Navigation handlers
	const handleNavigate = useCallback(
		(targetUrl: string) => {
			setUrl(targetUrl);
			sendMessage({ type: 'navigate', url: targetUrl });
		},
		[sendMessage],
	);

	const handleBack = useCallback(() => sendMessage({ type: 'back' }), [sendMessage]);
	const handleForward = useCallback(() => sendMessage({ type: 'forward' }), [sendMessage]);
	const handleReload = useCallback(() => sendMessage({ type: 'reload' }), [sendMessage]);
	const handleHome = useCallback(() => {
		setUrl('');
		sendMessage({ type: 'navigate', url: 'about:blank' });
	}, [sendMessage]);

	// Warmup — visit a few sites to build browsing history
	const handleWarmup = useCallback(() => {
		setWarmingUp(true);
		sendMessage({ type: 'warmup', sites: 3, delay: 2000 });
	}, [sendMessage]);

	// Connect/disconnect
	const handleConnect = useCallback(() => {
		setRobinhoodInfo(null);
		viewerRef.current?.connect();
	}, []);

	const handleDisconnect = useCallback(() => {
		viewerRef.current?.disconnect();
	}, []);

	const handleConnectRef = useCallback((handle: RemoteBrowserViewerHandle) => {
		viewerRef.current = handle;
	}, []);

	// Handle messages from the browser stream
	const handleMessage = useCallback((message: { type: string; [key: string]: unknown }) => {
		if (message.type === 'robinhood_verified') {
			setRobinhoodInfo({
				accountNumber: message.accountNumber as string,
				firstName: message.firstName as string,
				lastName: message.lastName as string,
				buyingPower: message.buyingPower as string,
			});
		} else if (message.type === 'robinhood_verification_failed') {
			setRobinhoodInfo({
				error: message.error as string,
			});
		} else if (message.type === 'robinhood_login_page_detected') {
			setRobinhoodInfo(null);
		} else if (message.type === 'warmup_complete') {
			setWarmingUp(false);
		}
	}, []);

	const isReady = status === 'ready';
	const isConnected = status === 'connected' || status === 'ready';

	return (
		<div className="flex flex-1 flex-col">
			{/* Top bar: connection controls + Robinhood status */}
			<div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
				<Button
					onClick={isConnected ? handleDisconnect : handleConnect}
					variant={isConnected ? 'destructive' : 'default'}
					size="sm"
				>
					{isConnected ? 'Disconnect' : 'Connect'}
				</Button>

				{isReady && (
					<Button onClick={handleWarmup} variant="outline" size="sm" disabled={warmingUp}>
						{warmingUp ? 'Warming up...' : 'Warmup'}
					</Button>
				)}

				<span className="text-xs text-muted-foreground">
					{status === 'disconnected' && 'Not connected'}
					{status === 'connecting' && 'Connecting...'}
					{status === 'connected' && 'Starting browser...'}
					{status === 'ready' &&
						(warmingUp ? 'Building browsing history...' : `Browser ready (${frameCount} frames)`)}
					{status === 'error' && 'Connection error'}
				</span>

				{/* Robinhood status */}
				{robinhoodInfo && !robinhoodInfo.error && (
					<span className="ml-auto rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
						Robinhood: {robinhoodInfo.firstName} {robinhoodInfo.lastName} — $
						{Number(robinhoodInfo.buyingPower || 0).toLocaleString('en-US', {
							minimumFractionDigits: 2,
						})}
					</span>
				)}
				{robinhoodInfo?.error && (
					<span className="ml-auto rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
						Auth failed: {robinhoodInfo.error}
					</span>
				)}
			</div>

			{/* Omnibar */}
			<Omnibar
				url={url}
				onUrlChange={setUrl}
				onNavigate={handleNavigate}
				onBack={handleBack}
				onForward={handleForward}
				onReload={handleReload}
				onHome={handleHome}
				disabled={!isReady}
				status={status}
			/>

			{/* Browser canvas — fills remaining space */}
			<div className="flex-1 overflow-hidden bg-muted">
				<RemoteBrowserViewer
					key={wsUrl}
					wsUrl={wsUrl}
					width={1024}
					height={576}
					onStatusChange={setStatus}
					onWsRef={handleWsRef}
					onFrameCount={setFrameCount}
					onUrl={handleUrlChange}
					onMessage={handleMessage}
					autoConnect={false}
					onConnectRef={handleConnectRef}
					className="flex h-full items-center justify-center p-4"
				/>
			</div>
		</div>
	);
}

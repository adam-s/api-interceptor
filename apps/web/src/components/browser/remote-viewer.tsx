'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ViewportInfo {
	width: number;
	height: number;
}

/** Connection control methods exposed to parent */
export interface RemoteBrowserViewerHandle {
	connect: () => void;
	disconnect: () => void;
}

interface RemoteBrowserViewerProps {
	/** WebSocket URL for the browser stream */
	wsUrl: string;
	/** Width of the canvas (default: 1024, will be overridden by server viewport) */
	width?: number;
	/** Height of the canvas (default: 576, will be overridden by server viewport) */
	height?: number;
	/** Called when connection status changes */
	onStatusChange?: (
		status: 'connecting' | 'connected' | 'ready' | 'disconnected' | 'error',
	) => void;
	/** Called with WebSocket reference for external control */
	onWsRef?: (ws: WebSocket | null) => void;
	/** Called with frame count updates */
	onFrameCount?: (count: number) => void;
	/** Called when browser URL changes */
	onUrl?: (url: string) => void;
	/** Called when a JSON message is received from the server */
	onMessage?: (message: { type: string; [key: string]: unknown }) => void;
	/** Additional CSS class for the container */
	className?: string;
	/** Whether to auto-connect on mount (default: false) */
	autoConnect?: boolean;
	/** Called with connect/disconnect methods for external control */
	onConnectRef?: (handle: RemoteBrowserViewerHandle) => void;
}

/**
 * Creates a linear scale function (like d3.scaleLinear)
 * Maps a value from [domainMin, domainMax] to [rangeMin, rangeMax]
 */
function createScale(
	domainMin: number,
	domainMax: number,
	rangeMin: number,
	rangeMax: number,
): (value: number) => number {
	return (value: number) => {
		const normalized = (value - domainMin) / (domainMax - domainMin);
		return rangeMin + normalized * (rangeMax - rangeMin);
	};
}

/**
 * Remote browser viewer component.
 * Renders streamed JPEG frames on a canvas and captures user input.
 */
export function RemoteBrowserViewer({
	wsUrl,
	width = 1024,
	height = 576,
	onStatusChange,
	onWsRef,
	onFrameCount,
	onUrl,
	onMessage,
	className,
	autoConnect,
	onConnectRef,
}: RemoteBrowserViewerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const [frameCount, setFrameCount] = useState(0);
	const [viewport, setViewport] = useState<ViewportInfo>({ width, height });
	const [isReady, setIsReady] = useState(false);

	// Throttle mousemove events (send max 30/sec)
	const lastMouseMoveRef = useRef<number>(0);
	const MOUSE_THROTTLE_MS = 33;

	// Frame dropping: always render latest, skip stale frames
	const pendingFrameRef = useRef<ArrayBuffer | null>(null);
	const isRenderingRef = useRef(false);

	// Render a JPEG frame to the canvas (with frame dropping)
	const renderFrame = useCallback((data: ArrayBuffer) => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		pendingFrameRef.current = data;

		if (isRenderingRef.current) return;

		isRenderingRef.current = true;
		const frameToRender = pendingFrameRef.current;
		pendingFrameRef.current = null;

		const blob = new Blob([frameToRender], { type: 'image/jpeg' });
		const url = URL.createObjectURL(blob);
		const img = new Image();

		img.onload = () => {
			ctx.drawImage(img, 0, 0);
			URL.revokeObjectURL(url);
			isRenderingRef.current = false;

			if (pendingFrameRef.current) {
				renderFrame(pendingFrameRef.current);
			}
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			isRenderingRef.current = false;

			if (pendingFrameRef.current) {
				renderFrame(pendingFrameRef.current);
			}
		};

		img.src = url;
	}, []);

	// Connect to WebSocket
	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN) return;

		onStatusChange?.('connecting');
		setIsReady(false);
		const ws = new WebSocket(wsUrl);
		ws.binaryType = 'arraybuffer';
		wsRef.current = ws;
		onWsRef?.(ws);

		ws.onopen = () => {
			onStatusChange?.('connected');
		};

		ws.onmessage = (event) => {
			if (event.data instanceof ArrayBuffer) {
				renderFrame(event.data);
				setFrameCount((c) => c + 1);
			} else if (typeof event.data === 'string') {
				try {
					const message = JSON.parse(event.data);
					onMessage?.(message);

					if (message.type === 'ready') {
						setViewport({
							width: message.viewport.width,
							height: message.viewport.height,
						});
						setIsReady(true);
						onStatusChange?.('ready');
					} else if (message.type === 'viewport') {
						setViewport({
							width: message.width,
							height: message.height,
						});
					} else if (message.type === 'url') {
						onUrl?.(message.url);
					} else if (message.type === 'clipboard') {
						if (message.text) {
							navigator.clipboard.writeText(message.text as string).catch(() => {});
						}
					} else if (message.type === 'crash') {
						setIsReady(false);
						onStatusChange?.('error');
					}
				} catch {
					// Ignore parse errors
				}
			}
		};

		ws.onclose = (event) => {
			setIsReady(false);
			onStatusChange?.(event.code === 1000 ? 'disconnected' : 'error');
			// Only null the ref if this WS is still the current one — avoids
			// race condition where strict mode remount creates a new WS before
			// the old one's onclose fires, which would null the new ref.
			if (wsRef.current === ws) {
				wsRef.current = null;
				onWsRef?.(null);
			}
		};

		ws.onerror = () => {
			onStatusChange?.('error');
		};
	}, [wsUrl, onStatusChange, onWsRef, onUrl, onMessage, renderFrame]);

	// Disconnect from WebSocket
	const disconnect = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
			onWsRef?.(null);
		}
	}, [onWsRef]);

	// Send control message (only when ready)
	const sendMessage = useCallback(
		(message: object) => {
			if (wsRef.current?.readyState === WebSocket.OPEN && isReady) {
				wsRef.current.send(JSON.stringify(message));
			}
		},
		[isReady],
	);

	// Convert screen coordinates to viewport coordinates
	const screenToViewport = useCallback(
		(clientX: number, clientY: number): { x: number; y: number } | null => {
			const canvas = canvasRef.current;
			if (!canvas) return null;

			const rect = canvas.getBoundingClientRect();
			const scaleX = createScale(0, rect.width, 0, viewport.width);
			const scaleY = createScale(0, rect.height, 0, viewport.height);

			const canvasX = clientX - rect.left;
			const canvasY = clientY - rect.top;

			return {
				x: Math.round(scaleX(canvasX)),
				y: Math.round(scaleY(canvasY)),
			};
		},
		[viewport],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const now = Date.now();
			if (now - lastMouseMoveRef.current < MOUSE_THROTTLE_MS) return;
			lastMouseMoveRef.current = now;

			const coords = screenToViewport(e.clientX, e.clientY);
			if (coords) {
				sendMessage({ type: 'mousemove', x: coords.x, y: coords.y });
			}
		},
		[screenToViewport, sendMessage],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const coords = screenToViewport(e.clientX, e.clientY);
			if (coords) {
				const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
				sendMessage({ type: 'mousedown', x: coords.x, y: coords.y, button });
			}
		},
		[screenToViewport, sendMessage],
	);

	const handleMouseUp = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const coords = screenToViewport(e.clientX, e.clientY);
			if (coords) {
				const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
				sendMessage({ type: 'mouseup', x: coords.x, y: coords.y, button });
			}
		},
		[screenToViewport, sendMessage],
	);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const coords = screenToViewport(e.clientX, e.clientY);
			if (coords) {
				sendMessage({
					type: 'dblclick',
					x: coords.x,
					y: coords.y,
				});
			}
		},
		[screenToViewport, sendMessage],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			e.preventDefault();
			const coords = screenToViewport(e.clientX, e.clientY);
			if (coords) {
				sendMessage({
					type: 'click',
					x: coords.x,
					y: coords.y,
					button: 'right',
				});
			}
		},
		[screenToViewport, sendMessage],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLCanvasElement>) => {
			e.preventDefault();

			// Handle Cmd/Ctrl+V paste
			if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
				navigator.clipboard
					.readText()
					.then((text) => {
						if (text) {
							sendMessage({ type: 'paste', text });
						}
					})
					.catch(() => {});
				return;
			}

			// Handle Cmd/Ctrl+C copy
			if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
				sendMessage({ type: 'copy' });
				return;
			}

			// Special keys
			if (e.key.length > 1) {
				sendMessage({ type: 'key', key: e.key });
			} else {
				sendMessage({ type: 'type', text: e.key });
			}
		},
		[sendMessage],
	);

	// Scroll handler — uses native WheelEvent with passive: false
	const handleWheel = useCallback(
		(e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const coords = screenToViewport(e.clientX, e.clientY);
			if (coords) {
				sendMessage({
					type: 'scroll',
					x: coords.x,
					y: coords.y,
					deltaX: Math.round(e.deltaX),
					deltaY: Math.round(e.deltaY),
				});
			}
		},
		[screenToViewport, sendMessage],
	);

	// Attach wheel listener with passive: false
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		canvas.addEventListener('wheel', handleWheel, { passive: false });
		return () => {
			canvas.removeEventListener('wheel', handleWheel);
		};
	}, [handleWheel]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

	// Notify parent of frame count changes
	useEffect(() => {
		onFrameCount?.(frameCount);
	}, [frameCount, onFrameCount]);

	// Expose connect/disconnect methods to parent
	useEffect(() => {
		onConnectRef?.({ connect, disconnect });
	}, [connect, disconnect, onConnectRef]);

	// Auto-connect on mount if requested
	useEffect(() => {
		if (autoConnect) {
			connect();
		}
	}, [autoConnect, connect]);

	return (
		<div className={className || 'flex flex-col gap-4'}>
			<canvas
				ref={canvasRef}
				width={viewport.width}
				height={viewport.height}
				onMouseDown={handleMouseDown}
				onMouseUp={handleMouseUp}
				onDoubleClick={handleDoubleClick}
				onContextMenu={handleContextMenu}
				onMouseMove={handleMouseMove}
				onKeyDown={handleKeyDown}
				tabIndex={0}
				className="cursor-crosshair rounded border border-border focus:outline-none focus:ring-2 focus:ring-ring"
				style={{ maxWidth: '100%', height: 'auto' }}
			/>
		</div>
	);
}

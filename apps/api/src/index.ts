import { createServer } from "http";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { validateConfig } from "@interceptor/shared";
import { formatStartupBanner } from "./format";
import {
	addClient,
	removeClient,
	setMultiplier,
	setRunning,
	resetState,
	getState,
	_getClients,
	type WsClient,
} from "./state";
import { getBridge } from "./bridge";

const config = validateConfig({
	name: "interceptor-api",
	version: "0.0.1",
	environment: process.env.NODE_ENV ?? "development",
});

// Create Hono app for REST routes
const app = new Hono();
app.use("/*", cors());
app.get("/health", (c) => c.json({ status: "ok" }));

// Create Node.js HTTP server
const server = createServer(app.fetch as any);

// Create WebSocket server
const wss = new WebSocketServer({ noServer: true });

// WebSocket client adapter for state management
class WSClientAdapter {
	closed = false;
	constructor(private ws: any) {}

	send(data: string | Buffer): void {
		if (this.closed) return;
		try {
			this.ws.send(data);
		} catch {
			this.closed = true;
		}
	}

	close(code?: number): void {
		if (this.closed) return;
		this.closed = true;
		try {
			this.ws.close(code);
		} catch {
			/* ignored */
		}
	}
}

// Handle WebSocket upgrade requests
server.on("upgrade", async (req: IncomingMessage, socket: Socket, head: Buffer) => {
	const url = req.url || "";
	const pathname = new URL(`http://localhost${url}`).pathname;

	try {
		wss.handleUpgrade(req, socket, head, (ws) => {
			if (pathname === "/ws") {
				// Dashboard state management WebSocket
				const adapter: any = new WSClientAdapter(ws);
				const client = addClient(adapter);

				ws.on("message", async (data: Buffer) => {
					try {
						const msg = JSON.parse(data.toString());

						if (msg.type === "compute") {
							// Handle compute messages (Python bridge)
							try {
								const bridge = await getBridge();
								const result = await bridge.call("compute", {
									numbers: msg.numbers,
								});
								adapter.send(
									JSON.stringify({
										type: "compute:result",
										requestId: msg.requestId,
										data: result,
									}),
								);
							} catch (err) {
								adapter.send(
									JSON.stringify({
										type: "compute:error",
										requestId: msg.requestId,
										error: err instanceof Error ? err.message : String(err),
									}),
								);
							}
						} else {
							// State management messages
							const state = getState();
							switch (msg.type) {
								case "increment":
									setMultiplier(state.multiplier + 1);
									break;
								case "decrement":
									setMultiplier(state.multiplier - 1);
									break;
								case "set":
									if (typeof msg.value === "number") {
										setMultiplier(msg.value);
									}
									break;
								case "pause":
									setRunning(false);
									break;
								case "play":
									setRunning(true);
									break;
								case "reset":
									resetState();
									break;
							}
						}
					} catch (err) {
						console.error("WS message error:", err);
					}
				});

				ws.on("close", () => {
					removeClient(client);
				});
			} else if (pathname.startsWith("/browser/stream")) {
				// Browser streaming WebSocket
				// TODO: Implement browser streaming handler
				ws.send(
					JSON.stringify({
						type: "error",
						message: "Browser streaming not yet implemented for Node.js",
					}),
				);
				ws.close(1011, "Not implemented");
			} else {
				socket.destroy();
			}
		});
	} catch (err) {
		console.error("WebSocket upgrade error:", err);
		socket.destroy();
	}
});

console.log(formatStartupBanner(config));

const port = parseInt(process.env.PORT ?? "3001", 10);
server.listen(port, () => {
	console.log(`Server listening on http://localhost:${port}`);
});

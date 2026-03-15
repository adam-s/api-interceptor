import { Hono } from "hono";
import { cors } from "hono/cors";
import { createBunWebSocket } from "hono/bun";
import { validateConfig } from "@interceptor/shared";
import { formatStartupBanner } from "./format";
import { createWsApp } from "./ws";
import { createBrowserApp } from "./browser";

const config = validateConfig({
	name: "interceptor-api",
	version: "0.0.1",
	environment: process.env.NODE_ENV ?? "development",
});

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use("/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

// Multiplier WebSocket
const wsApp = createWsApp(upgradeWebSocket);
app.route("/", wsApp);

// Browser streaming WebSocket
const browserApp = createBrowserApp(upgradeWebSocket);
app.route("/browser", browserApp);

console.log(formatStartupBanner(config));

export default {
	port: 3001,
	fetch: app.fetch,
	websocket,
};

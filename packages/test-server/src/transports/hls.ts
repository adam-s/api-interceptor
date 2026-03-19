/**
 * HLS media stream transport — token → master playlist → variant → segments.
 */

import { Hono } from 'hono';
import { generateMasterPlaylist, generateVariantPlaylist, type StreamChannel } from '../data/media';

export interface HLSConfig {
	channels: StreamChannel[];
	/** Secret for signing tokens */
	tokenSecret: string;
}

interface AccessToken {
	channelName: string;
	expires: number;
}

export function createHLSRoutes(basePath: string, config: HLSConfig): Hono {
	const app = new Hono();

	// Step 1: Get access token for a channel
	app.get(`${basePath}/stream/token`, (c) => {
		const channel = c.req.query('channel') ?? config.channels[0]?.name ?? 'unknown';
		const ch = config.channels.find((ch) => ch.name === channel);
		if (!ch) return c.json({ error: 'Channel not found' }, 404);

		const token: AccessToken = { channelName: channel, expires: Date.now() + 3600000 };
		const tokenStr = Buffer.from(JSON.stringify(token)).toString('base64');
		const signature = Buffer.from(`${config.tokenSecret}:${tokenStr}`)
			.toString('base64')
			.slice(0, 40);

		return c.json({ signature, token: JSON.stringify(token) });
	});

	// Step 2: Master playlist (requires sig + token)
	app.get(`${basePath}/stream/master.m3u8`, (c) => {
		const sig = c.req.query('sig');
		const token = c.req.query('token');
		if (!sig || !token) {
			return c.text('Unauthorized: sig and token required', 403);
		}

		// Validate token
		try {
			const parsed: AccessToken = JSON.parse(token);
			if (parsed.expires < Date.now()) return c.text('Token expired', 403);
		} catch {
			return c.text('Invalid token', 403);
		}

		const baseUrl = new URL(c.req.url).origin + basePath;
		c.header('Content-Type', 'application/vnd.apple.mpegurl');
		return c.text(generateMasterPlaylist(baseUrl));
	});

	// Step 3: Variant playlists
	app.get(`${basePath}/stream/:quality.m3u8`, (c) => {
		const quality = c.req.param('quality') ?? 'unknown';
		const baseUrl = new URL(c.req.url).origin + basePath;
		c.header('Content-Type', 'application/vnd.apple.mpegurl');
		return c.text(generateVariantPlaylist(baseUrl, quality));
	});

	// Step 4: Segments (fake — return minimal valid TS data)
	app.get(`${basePath}/stream/segments/:file`, (c) => {
		// Return a minimal MPEG-TS packet (188 bytes, sync byte 0x47)
		const ts = Buffer.alloc(188, 0);
		ts[0] = 0x47; // sync byte
		c.header('Content-Type', 'video/mp2t');
		return c.body(ts);
	});

	return app;
}

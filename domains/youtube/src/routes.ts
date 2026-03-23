/**
 * YouTube Routes
 *
 * All routes use the InnerTube API (POST to youtubei/v1/*) which is public —
 * no cookies, no browser session needed. Just an API key + client context.
 *
 * For downloads, yt-dlp runs via the Python bridge since YouTube restricts
 * streaming URLs on the WEB client without auth.
 *
 * Routes:
 *  1. GET /search?q=          — Search channels and videos
 *  2. GET /suggest?q=         — Autocomplete suggestions (JSONP)
 *  3. GET /channel/:id        — Channel info + video list with pagination
 *  4. GET /video/:id          — Video details (title, description, thumbnails, duration)
 *  5. GET /video/:id/related  — Related videos
 *  6. POST /download/:id      — Start download via yt-dlp (Python bridge)
 *  7. GET /downloads          — List downloaded videos
 *  8. GET /downloads/:id      — Stream downloaded video file
 */

import type { DomainRoute } from '@interceptor/browser/handler/domain-loader';
import { DEBUG, rateLimitedFetch } from '@interceptor/shared';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_BASE = 'https://www.youtube.com/youtubei/v1';
const CLIENT_CONTEXT = {
	client: { clientName: 'WEB', clientVersion: '2.20240101.00.00' },
};
const DOWNLOADS_DIR = join(process.cwd(), 'data', 'downloads', 'youtube');

/** Helper: call InnerTube API */
async function innertube(endpoint: string, body: Record<string, unknown>) {
	const res = await rateLimitedFetch(`${INNERTUBE_BASE}/${endpoint}?key=${API_KEY}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ context: CLIENT_CONTEXT, ...body }),
	});
	if (!res.ok) {
		throw new Error(`InnerTube ${endpoint} returned ${res.status}`);
	}
	return res.json();
}

/** Extract video data from a videoRenderer */
function parseVideoRenderer(v: Record<string, unknown>): Record<string, unknown> | null {
	if (!v.videoId) return null;
	const title = (v.title as { runs?: { text: string }[] })?.runs?.[0]?.text ?? '';
	const channel =
		(v.ownerText as { runs?: { text: string }[] })?.runs?.[0]?.text ??
		(v.shortBylineText as { runs?: { text: string }[] })?.runs?.[0]?.text ??
		'';
	const channelId = (
		(v.ownerText as { runs?: { navigationEndpoint?: { browseEndpoint?: { browseId: string } } }[] })?.runs?.[0]
			?.navigationEndpoint?.browseEndpoint?.browseId ??
		(v.shortBylineText as { runs?: { navigationEndpoint?: { browseEndpoint?: { browseId: string } } }[] })?.runs?.[0]
			?.navigationEndpoint?.browseEndpoint?.browseId ??
		''
	);
	return {
		videoId: v.videoId,
		title,
		channel,
		channelId,
		duration: (v.lengthText as { simpleText?: string })?.simpleText ?? '',
		views: (v.viewCountText as { simpleText?: string })?.simpleText ?? '',
		publishedTime: (v.publishedTimeText as { simpleText?: string })?.simpleText ?? '',
		thumbnail: (v.thumbnail as { thumbnails?: { url: string }[] })?.thumbnails?.slice(-1)[0]?.url ?? '',
	};
}

/** Extract channel data from a channelRenderer */
function parseChannelRenderer(c: Record<string, unknown>): Record<string, unknown> | null {
	if (!c.channelId) return null;
	return {
		channelId: c.channelId,
		title: (c.title as { simpleText?: string })?.simpleText ?? '',
		description: (c.descriptionSnippet as { runs?: { text: string }[] })?.runs?.map((r) => r.text).join('') ?? '',
		subscribers: (c.videoCountText as { simpleText?: string })?.simpleText ?? (c.subscriberCountText as { simpleText?: string })?.simpleText ?? '',
		thumbnail: (c.thumbnail as { thumbnails?: { url: string }[] })?.thumbnails?.slice(-1)[0]?.url ?? '',
		videoCount: (c.videoCountText as { simpleText?: string })?.simpleText ?? '',
	};
}

export const routes: DomainRoute[] = [
	// ─── Route 1: Search ─────────────────────────────────────────────
	{
		method: 'GET',
		path: '/search',
		description: 'Search YouTube for channels and videos.',
		browserRequired: false,
		handler: async (c) => {
			const url = new URL(c.req.url);
			const q = url.searchParams.get('q') ?? '';
			const type = url.searchParams.get('type') ?? ''; // 'channel', 'video', or empty for all
			const continuation = url.searchParams.get('continuation');
			if (!q && !continuation) return c.json({ error: 'Missing ?q= parameter' }, 400);

			DEBUG('youtube', `search: q=${q} type=${type}`);

			const body: Record<string, unknown> = continuation
				? { continuation }
				: { query: q };

			// Filter by type if specified
			if (type === 'channel' && !continuation) {
				body.params = 'EgIQAg%3D%3D'; // channels only
			} else if (type === 'video' && !continuation) {
				body.params = 'EgIQAQ%3D%3D'; // videos only
			}

			const data = await innertube('search', body) as Record<string, unknown>;

			// Parse results
			const sections = continuation
				? (data as { onResponseReceivedCommands?: { appendContinuationItemsAction?: { continuationItems?: unknown[] } }[] })
						?.onResponseReceivedCommands?.[0]?.appendContinuationItemsAction?.continuationItems ?? []
				: (data as { contents?: { twoColumnSearchResultsRenderer?: { primaryContents?: { sectionListRenderer?: { contents?: unknown[] } } } } })
						?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents ?? [];

			const results: Record<string, unknown>[] = [];
			let nextContinuation: string | null = null;

			for (const section of sections) {
				const items = (section as { itemSectionRenderer?: { contents?: Record<string, unknown>[] } })?.itemSectionRenderer?.contents ?? [];
				for (const item of items) {
					if (item.videoRenderer) {
						const v = parseVideoRenderer(item.videoRenderer as Record<string, unknown>);
						if (v) results.push({ type: 'video', ...v });
					} else if (item.channelRenderer) {
						const ch = parseChannelRenderer(item.channelRenderer as Record<string, unknown>);
						if (ch) results.push({ type: 'channel', ...ch });
					}
				}
				// Check for continuation
				const cont = (section as { continuationItemRenderer?: { continuationEndpoint?: { continuationCommand?: { token?: string } } } })
					?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
				if (cont) nextContinuation = cont;
			}

			return c.json({ results, continuation: nextContinuation });
		},
	},

	// ─── Route 2: Suggest (autocomplete) ─────────────────────────────
	{
		method: 'GET',
		path: '/suggest',
		description: 'YouTube search autocomplete suggestions.',
		browserRequired: false,
		handler: async (c) => {
			const url = new URL(c.req.url);
			const q = url.searchParams.get('q') ?? '';
			if (!q) return c.json({ error: 'Missing ?q= parameter' }, 400);

			const res = await rateLimitedFetch(
				`https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&q=${encodeURIComponent(q)}`,
			);
			const raw = await res.text();
			// Strip JSONP callback: window.google.ac.h( ... )
			const match = raw.match(/\((\[.*\])\)/s);
			if (!match) return c.json({ suggestions: [] });

			const parsed = JSON.parse(match[1]);
			const suggestions = (parsed[1] as [string][]).map((s) => s[0]);
			return c.json({ suggestions });
		},
	},

	// ─── Route 3: Channel with videos ────────────────────────────────
	{
		method: 'GET',
		path: '/channel/:channelId',
		description: 'Channel info and video list with pagination.',
		browserRequired: false,
		handler: async (c) => {
			const channelId = c.req.param('channelId');
			const url = new URL(c.req.url);
			const continuation = url.searchParams.get('continuation');

			DEBUG('youtube', `channel: ${channelId}`);

			const body: Record<string, unknown> = continuation
				? { continuation }
				: { browseId: channelId, params: 'EgZ2aWRlb3PyBgQKAjoA' }; // Videos tab

			const data = await innertube('browse', body) as Record<string, unknown>;

			// Parse channel header (only on first page)
			let channel: Record<string, unknown> | null = null;
			if (!continuation) {
				const header = (data as { header?: { pageHeaderRenderer?: { pageTitle?: string; content?: { pageHeaderViewModel?: { image?: { decoratedAvatarViewModel?: { avatar?: { avatarViewModel?: { image?: { sources?: { url: string }[] } } } } } } } } } })?.header?.pageHeaderRenderer;
				if (header) {
					channel = {
						channelId,
						title: header.pageTitle ?? '',
						avatar: header.content?.pageHeaderViewModel?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources?.slice(-1)[0]?.url ?? '',
					};
				}
			}

			// Parse videos
			const videos: Record<string, unknown>[] = [];
			let nextContinuation: string | null = null;

			if (continuation) {
				// Continuation response
				const actions = (data as { onResponseReceivedActions?: { appendContinuationItemsAction?: { continuationItems?: Record<string, unknown>[] } }[] })
					?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems ?? [];
				for (const item of actions) {
					const vid = (item as { richItemRenderer?: { content?: { videoRenderer?: Record<string, unknown> } } })?.richItemRenderer?.content?.videoRenderer;
					if (vid) {
						const v = parseVideoRenderer(vid);
						if (v) videos.push(v);
					}
					const cont = (item as { continuationItemRenderer?: { continuationEndpoint?: { continuationCommand?: { token?: string } } } })
						?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
					if (cont) nextContinuation = cont;
				}
			} else {
				// First page — find Videos tab
				const tabs = (data as { contents?: { twoColumnBrowseResultsRenderer?: { tabs?: Record<string, unknown>[] } } })
					?.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];
				for (const tab of tabs) {
					const tr = (tab as { tabRenderer?: { selected?: boolean; content?: { richGridRenderer?: { contents?: Record<string, unknown>[] } } } })?.tabRenderer;
					if (tr?.selected) {
						const items = tr.content?.richGridRenderer?.contents ?? [];
						for (const item of items) {
							const vid = (item as { richItemRenderer?: { content?: { videoRenderer?: Record<string, unknown> } } })?.richItemRenderer?.content?.videoRenderer;
							if (vid) {
								const v = parseVideoRenderer(vid);
								if (v) videos.push(v);
							}
							const cont = (item as { continuationItemRenderer?: { continuationEndpoint?: { continuationCommand?: { token?: string } } } })
								?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
							if (cont) nextContinuation = cont;
						}
					}
				}
			}

			return c.json({ channel, videos, continuation: nextContinuation });
		},
	},

	// ─── Route 4: Video details ──────────────────────────────────────
	{
		method: 'GET',
		path: '/video/:videoId',
		description: 'Video metadata — title, description, thumbnails, duration.',
		browserRequired: false,
		handler: async (c) => {
			const videoId = c.req.param('videoId');
			DEBUG('youtube', `video: ${videoId}`);

			const data = await innertube('player', { videoId }) as Record<string, unknown>;
			const vd = (data as { videoDetails?: Record<string, unknown> }).videoDetails ?? {};
			const sd = (data as { streamingData?: { formats?: unknown[]; adaptiveFormats?: unknown[] } }).streamingData;

			// Get available qualities from streaming data (may be empty without auth)
			const formats = [...(sd?.formats ?? []), ...(sd?.adaptiveFormats ?? [])];
			const qualities = [...new Set(
				formats
					.map((f) => (f as { qualityLabel?: string }).qualityLabel)
					.filter(Boolean),
			)];

			return c.json({
				videoId: vd.videoId,
				title: vd.title,
				channel: vd.author,
				channelId: vd.channelId,
				description: (vd.shortDescription as string)?.slice(0, 500),
				duration: Number(vd.lengthSeconds),
				views: Number(vd.viewCount),
				thumbnail: (vd.thumbnail as { thumbnails?: { url: string }[] })?.thumbnails?.slice(-1)[0]?.url ?? '',
				keywords: vd.keywords ?? [],
				// Qualities from InnerTube (may be empty — yt-dlp handles actual download)
				availableQualities: qualities.length > 0 ? qualities : ['1080p', '720p', '480p', '360p'],
			});
		},
	},

	// ─── Route 5: Related videos ─────────────────────────────────────
	{
		method: 'GET',
		path: '/video/:videoId/related',
		description: 'Related/recommended videos for a given video.',
		browserRequired: false,
		handler: async (c) => {
			const videoId = c.req.param('videoId');
			DEBUG('youtube', `related: ${videoId}`);

			const data = await innertube('next', { videoId }) as Record<string, unknown>;

			const results = (data as {
				contents?: {
					twoColumnWatchNextResults?: {
						secondaryResults?: {
							secondaryResults?: { results?: Record<string, unknown>[] };
						};
					};
				};
			})?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results ?? [];

			const related: Record<string, unknown>[] = [];
			for (const item of results) {
				// New format: lockupViewModel
				const lockup = (item as { lockupViewModel?: Record<string, unknown> })?.lockupViewModel;
				if (lockup) {
					const meta = (lockup.metadata as { lockupMetadataViewModel?: { title?: { content?: string }; metadata?: { lockupMetadataViewModel?: { title?: { content?: string } } } } })?.lockupMetadataViewModel;
					related.push({
						videoId: lockup.contentId,
						title: meta?.title?.content ?? '',
						thumbnail: (lockup.contentImage as { collectionThumbnailViewModel?: { primaryThumbnail?: { thumbnailViewModel?: { image?: { sources?: { url: string }[] } } } } })
							?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.slice(-1)[0]?.url ?? '',
					});
					continue;
				}
				// Legacy format: compactVideoRenderer
				const vid = (item as { compactVideoRenderer?: Record<string, unknown> })?.compactVideoRenderer;
				if (vid) {
					const v = parseVideoRenderer(vid);
					if (v) related.push(v);
				}
			}

			return c.json({ videoId, related });
		},
	},

	// ─── Route 6: Download via yt-dlp ────────────────────────────────
	{
		method: 'POST',
		path: '/download/:videoId',
		description: 'Start video download via yt-dlp (Python bridge).',
		browserRequired: false,
		handler: async (c) => {
			const videoId = c.req.param('videoId');
			const body = await c.req.json<{ quality?: string }>().catch(() => ({}));
			const quality = body.quality ?? '720p';

			DEBUG('youtube', `download: ${videoId} quality=${quality}`);

			const videoDir = join(DOWNLOADS_DIR, videoId);
			mkdirSync(videoDir, { recursive: true });

			// Check if already downloaded
			const metaPath = join(videoDir, 'metadata.json');
			if (existsSync(metaPath)) {
				const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
				if (meta.status === 'complete') {
					return c.json({ status: 'already_downloaded', videoId, metadata: meta });
				}
			}

			// Get video metadata first
			const data = await innertube('player', { videoId }) as Record<string, unknown>;
			const vd = (data as { videoDetails?: Record<string, unknown> }).videoDetails ?? {};

			// Map quality to yt-dlp format selector
			const formatMap: Record<string, string> = {
				'1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
				'720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
				'480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
				'360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
				'audio': 'bestaudio/best',
			};
			const format = formatMap[quality] ?? formatMap['720p'];

			// Write initial metadata
			const metadata = {
				videoId,
				title: vd.title ?? 'Unknown',
				channel: vd.author ?? 'Unknown',
				channelId: vd.channelId ?? '',
				duration: Number(vd.lengthSeconds ?? 0),
				quality,
				status: 'downloading',
				startedAt: new Date().toISOString(),
			};

			const { writeFileSync } = await import('node:fs');
			writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

			// Run yt-dlp in background
			const { exec } = await import('node:child_process');
			const outputPath = join(videoDir, `video.%(ext)s`);
			const cmd = `yt-dlp -f "${format}" --merge-output-format mp4 -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}" && echo '{"status":"complete"}' > "${join(videoDir, 'status.json')}"`;

			exec(cmd, (error) => {
				if (error) {
					DEBUG('youtube', `download error: ${error.message}`);
					writeFileSync(
						metaPath,
						JSON.stringify({ ...metadata, status: 'error', error: error.message }, null, 2),
					);
				} else {
					// Find the actual file
					const files = readdirSync(videoDir).filter((f) => f.startsWith('video.'));
					writeFileSync(
						metaPath,
						JSON.stringify({ ...metadata, status: 'complete', file: files[0] ?? 'video.mp4', completedAt: new Date().toISOString() }, null, 2),
					);
				}
			});

			return c.json({ status: 'started', videoId, quality, metadata });
		},
	},

	// ─── Route 7: List downloads ─────────────────────────────────────
	{
		method: 'GET',
		path: '/downloads',
		description: 'List all downloaded videos with metadata.',
		browserRequired: false,
		handler: async (c) => {
			mkdirSync(DOWNLOADS_DIR, { recursive: true });
			const dirs = readdirSync(DOWNLOADS_DIR).filter((d) => {
				try {
					return statSync(join(DOWNLOADS_DIR, d)).isDirectory();
				} catch {
					return false;
				}
			});

			const downloads = dirs
				.map((videoId) => {
					const metaPath = join(DOWNLOADS_DIR, videoId, 'metadata.json');
					if (!existsSync(metaPath)) return null;
					try {
						const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
						return { videoId, ...meta };
					} catch {
						return null;
					}
				})
				.filter(Boolean);

			return c.json({ downloads });
		},
	},

	// ─── Route 8: Stream downloaded video ────────────────────────────
	{
		method: 'GET',
		path: '/downloads/:videoId',
		description: 'Stream a downloaded video file for the offline player.',
		browserRequired: false,
		handler: async (c) => {
			const videoId = c.req.param('videoId');
			const videoDir = join(DOWNLOADS_DIR, videoId);
			const metaPath = join(videoDir, 'metadata.json');

			if (!existsSync(metaPath)) {
				return c.json({ error: 'Video not downloaded' }, 404);
			}

			const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
			if (meta.status !== 'complete') {
				return c.json({ error: `Download status: ${meta.status}`, metadata: meta }, 409);
			}

			const fileName = meta.file ?? 'video.mp4';
			const filePath = join(videoDir, fileName);
			if (!existsSync(filePath)) {
				return c.json({ error: 'Video file not found on disk' }, 404);
			}

			const stat = statSync(filePath);
			const range = c.req.header('Range');

			if (range) {
				// Range request for seeking
				const parts = range.replace(/bytes=/, '').split('-');
				const start = Number.parseInt(parts[0], 10);
				const end = parts[1] ? Number.parseInt(parts[1], 10) : stat.size - 1;
				const { createReadStream } = await import('node:fs');
				const stream = createReadStream(filePath, { start, end });
				return new Response(stream as unknown as ReadableStream, {
					status: 206,
					headers: {
						'Content-Range': `bytes ${start}-${end}/${stat.size}`,
						'Accept-Ranges': 'bytes',
						'Content-Length': String(end - start + 1),
						'Content-Type': 'video/mp4',
					},
				});
			}

			const { createReadStream } = await import('node:fs');
			const stream = createReadStream(filePath);
			return new Response(stream as unknown as ReadableStream, {
				headers: {
					'Content-Length': String(stat.size),
					'Content-Type': 'video/mp4',
					'Accept-Ranges': 'bytes',
				},
			});
		},
	},
];

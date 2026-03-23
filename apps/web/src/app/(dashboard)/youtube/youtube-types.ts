// --- YouTube Dashboard Types & Helpers ---

// Browser-safe DEBUG — console-only (no node:fs). The server-side DEBUG
// from @interceptor/shared uses node:fs which breaks in client components.
type DataFactory = () => Record<string, unknown>;
export function DEBUG(location: string, dataFactory: DataFactory): void;
export function DEBUG(location: string, message: string): void;
export function DEBUG(arg1: string, arg2?: string | DataFactory): void {
	if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test') return;
	let data: Record<string, unknown> | undefined;
	let msg = 'debug';
	if (typeof arg2 === 'function') {
		try {
			data = arg2();
		} catch {
			/* skip */
		}
	} else if (typeof arg2 === 'string') {
		msg = arg2;
	}
	const dataStr = data ? ` ${JSON.stringify(data)}` : '';
	console.log(`%c[DEBUG] [${arg1}] ${msg}${dataStr}`, 'color: cyan');
}

export type View = 'search' | 'channel' | 'video' | 'downloads';

export interface Channel {
	type: 'channel';
	channelId: string;
	title: string;
	description?: string;
	subscribers?: string;
	thumbnail?: string;
	videoCount?: string;
}

export interface VideoItem {
	videoId: string;
	title: string;
	channel?: string;
	channelId?: string;
	duration?: string;
	views?: string;
	publishedTime?: string;
	thumbnail?: string;
	type?: string;
}

export interface VideoDetail {
	videoId: string;
	title: string;
	channel: string;
	channelId: string;
	description: string;
	duration: number;
	views: number;
	thumbnail: string;
	keywords?: string[];
	availableQualities: string[];
}

export interface DownloadItem {
	videoId: string;
	title: string;
	channel: string;
	quality: string;
	status: 'downloading' | 'complete' | 'error';
	error?: string;
	file?: string;
	duration?: number;
}

export interface ChannelData {
	channel: {
		channelId: string;
		title: string;
		avatar?: string;
		subscribers?: string;
		description?: string;
		banner?: string;
	} | null;
	videos: VideoItem[];
	continuation: string | null;
}

// --- Helpers ---

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatViews(views: number | string): string {
	if (typeof views === 'string') return views;
	if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
	if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
	return `${views} views`;
}

export function formatViewsShort(views: number | string): string {
	if (typeof views === 'string') return views;
	if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
	if (views >= 1_000) return `${Math.round(views / 1_000)}K`;
	return `${views}`;
}

export function fixThumbnailUrl(url: string): string {
	if (!url) return '';
	if (url.startsWith('//')) return `https:${url}`;
	return url;
}

export function getVideoThumbnail(videoId: string, thumbnail?: string): string {
	if (thumbnail && thumbnail.length > 0) return fixThumbnailUrl(thumbnail);
	return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Fetch wrapper with DEBUG logging and error surfacing */
export async function ytFetch<T>(label: string, url: string, options?: RequestInit): Promise<T> {
	DEBUG('youtube-fetch', () => ({ label, url, method: options?.method ?? 'GET' }));
	const res = await fetch(url, options);
	if (!res.ok) {
		const msg = `${label} failed (${res.status})`;
		DEBUG('youtube-fetch', () => ({ label, error: msg, status: res.status }));
		throw new Error(msg);
	}
	const data = await res.json();
	DEBUG('youtube-fetch', () => ({ label, resultKeys: Object.keys(data) }));
	return data as T;
}

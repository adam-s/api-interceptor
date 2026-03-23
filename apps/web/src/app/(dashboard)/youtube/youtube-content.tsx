'use client';

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Play, Library, AlertCircle, Search } from 'lucide-react';
import type { View, ChannelData, VideoDetail, VideoItem } from './youtube-types';
import { DEBUG, ytFetch } from './youtube-types';
import { YouTubeSearch } from './youtube-search';
import { YouTubeChannel } from './youtube-channel';
import { YouTubeVideo } from './youtube-video';
import { YouTubeDownloads } from './youtube-downloads';

export function YouTubeContent() {
	const [view, setView] = useState<View>('search');
	const [query, setQuery] = useState('');
	const [channelData, setChannelData] = useState<ChannelData | null>(null);
	const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
	const [relatedVideos, setRelatedVideos] = useState<VideoItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [navigationStack, setNavigationStack] = useState<{ view: View; data?: string }[]>([]);
	const [downloadCount, setDownloadCount] = useState(0);

	// Suggestions state (owned here so header search bar can use them)
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Search trigger reference (allows header to trigger search in YouTubeSearch)
	const searchTriggerRef = useRef<((q: string) => void) | null>(null);

	const fetchSuggestions = useCallback((q: string) => {
		if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
		if (q.length < 2) {
			setSuggestions([]);
			return;
		}
		suggestTimerRef.current = setTimeout(async () => {
			try {
				const data = await ytFetch<{ suggestions?: string[] }>('suggestions', `/api/youtube/suggest?q=${encodeURIComponent(q)}`);
				setSuggestions(data.suggestions?.slice(0, 8) ?? []);
			} catch {
				setSuggestions([]);
			}
		}, 200);
	}, []);

	// --- Navigation ---
	const pushNav = useCallback((currentView: View) => {
		setNavigationStack((prev) => [...prev, { view: currentView }]);
	}, []);

	const goBack = useCallback(() => {
		const prev = navigationStack[navigationStack.length - 1];
		if (prev) {
			setNavigationStack((stack) => stack.slice(0, -1));
			setView(prev.view);
			setError(null);
		} else {
			setView('search');
			setError(null);
		}
	}, [navigationStack]);

	// --- Unified search handler ---
	const doSearch = useCallback((q: string) => {
		if (!q.trim()) return;
		setQuery(q);
		setShowSuggestions(false);
		setNavigationStack([]);
		setView('search');
		setError(null);
		// Trigger the actual fetch inside YouTubeSearch
		if (searchTriggerRef.current) {
			searchTriggerRef.current(q);
		}
	}, []);

	// --- Channel ---
	const openChannel = useCallback(async (channelId: string) => {
		pushNav(view);
		setLoading(true);
		setError(null);
		setView('channel');
		DEBUG('youtube-content', () => ({ action: 'open-channel', channelId }));
		try {
			const data = await ytFetch<ChannelData>('Channel', `/api/youtube/channel/${channelId}`);
			setChannelData(data);
			DEBUG('youtube-content', () => ({ action: 'channel-loaded', videoCount: data.videos?.length }));
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed to load channel.';
			setError(msg);
			setChannelData(null);
		}
		setLoading(false);
	}, [view, pushNav]);

	// --- Video ---
	const openVideo = useCallback(async (videoId: string) => {
		pushNav(view);
		setLoading(true);
		setError(null);
		setView('video');
		DEBUG('youtube-content', () => ({ action: 'open-video', videoId }));
		try {
			const [detail, related] = await Promise.all([
				ytFetch<VideoDetail>('Video detail', `/api/youtube/video/${videoId}`),
				ytFetch<{ related?: VideoItem[] }>('Related videos', `/api/youtube/video/${videoId}/related`).catch(() => ({ related: [] })),
			]);
			setVideoDetail(detail);
			setRelatedVideos(related.related ?? []);
			DEBUG('youtube-content', () => ({ action: 'video-loaded', title: detail.title, relatedCount: (related.related ?? []).length }));
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed to load video details.';
			setError(msg);
			setVideoDetail(null);
		}
		setLoading(false);
	}, [view, pushNav]);

	// --- Downloads ---
	const openDownloads = useCallback(() => {
		pushNav(view);
		setView('downloads');
	}, [view, pushNav]);

	const refreshDownloadCount = useCallback(async () => {
		try {
			const data = await ytFetch<{ downloads?: unknown[] }>('Download count', '/api/youtube/downloads');
			setDownloadCount(data.downloads?.length ?? 0);
		} catch (e) {
			DEBUG('youtube-content', () => ({ action: 'download-count-error', error: e instanceof Error ? e.message : 'unknown' }));
		}
	}, []);

	return (
		<div className="flex flex-col h-full min-h-0 bg-background">
			{/* Header */}
			<div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-20">
				{view !== 'search' && (
					<Button variant="ghost" size="icon" onClick={goBack} className="shrink-0 rounded-full">
						<ArrowLeft className="h-5 w-5" />
					</Button>
				)}

				{/* YouTube logo */}
				<div className="flex items-center gap-1.5 shrink-0 mr-2">
					<div className="w-7 h-5 bg-red-600 rounded-[3px] flex items-center justify-center">
						<Play className="h-3 w-3 text-white fill-white" />
					</div>
					<span className="font-semibold text-base tracking-tight hidden sm:inline">YouTube</span>
				</div>

				{/* Search bar - always visible in header */}
				<div className="relative flex-1 max-w-xl mx-auto flex">
					<div className="relative flex-1">
						<Input
							ref={searchInputRef}
							placeholder="Search"
							className="h-10 rounded-l-full rounded-r-none border-r-0 pl-4 pr-4 bg-background border-border/60 focus-visible:ring-1 focus-visible:ring-blue-500"
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								fetchSuggestions(e.target.value);
								setShowSuggestions(true);
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter') doSearch(query);
							}}
							onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
							onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
						/>
						{showSuggestions && suggestions.length > 0 && (
							<div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden py-2">
								{suggestions.map((s) => (
									<button
										key={s}
										type="button"
										className="w-full text-left px-4 py-2 hover:bg-accent text-sm flex items-center gap-3 transition-colors"
										onMouseDown={() => doSearch(s)}
									>
										<Search className="h-4 w-4 text-muted-foreground shrink-0" />
										<span className="truncate">{s}</span>
									</button>
								))}
							</div>
						)}
					</div>
					<button
						type="button"
						onClick={() => doSearch(query)}
						className="h-10 px-5 bg-muted/60 border border-border/60 rounded-r-full hover:bg-muted transition-colors flex items-center justify-center"
					>
						<Search className="h-4 w-4 text-muted-foreground" />
					</button>
				</div>

				{/* Downloads button */}
				<Button
					variant={view === 'downloads' ? 'default' : 'ghost'}
					size="sm"
					onClick={openDownloads}
					className="shrink-0 gap-1.5 rounded-full"
				>
					<Library className="h-4 w-4" />
					<span className="hidden sm:inline">Downloads</span>
					{downloadCount > 0 && (
						<Badge variant="secondary" className="ml-0.5 text-xs px-1.5 h-5 min-w-5 flex items-center justify-center">
							{downloadCount}
						</Badge>
					)}
				</Button>
			</div>

			{/* Error banner */}
			{error && (
				<Alert variant="destructive" className="mx-4 mt-3 shrink-0">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Content area */}
			<div className="flex-1 min-h-0 overflow-auto">
				{view === 'search' && (
					<YouTubeSearch
						query={query}
						setQuery={setQuery}
						onSearch={doSearch}
						onOpenChannel={openChannel}
						onOpenVideo={openVideo}
						searchTriggerRef={searchTriggerRef}
					/>
				)}

				{view === 'channel' && (
					<YouTubeChannel
						channelData={channelData}
						setChannelData={setChannelData}
						loading={loading}
						onOpenVideo={openVideo}
					/>
				)}

				{view === 'video' && (
					<YouTubeVideo
						videoDetail={videoDetail}
						relatedVideos={relatedVideos}
						loading={loading}
						onOpenVideo={openVideo}
						onOpenChannel={openChannel}
						onDownloadStarted={refreshDownloadCount}
					/>
				)}

				{view === 'downloads' && (
					<YouTubeDownloads
						onOpenVideo={openVideo}
						onBackToSearch={() => setView('search')}
					/>
				)}
			</div>
		</div>
	);
}

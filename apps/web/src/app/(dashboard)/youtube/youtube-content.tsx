'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	Search,
	Download,
	Play,
	ArrowLeft,
	Clock,
	Eye,
	Loader2,
	CheckCircle,
	Library,
	XCircle,
	Users,
	Video,
	AlertCircle,
	ChevronDown,
	ThumbsUp,
	Share2,
	MoreHorizontal,
} from 'lucide-react';

// --- Types ---
type View = 'search' | 'channel' | 'video' | 'downloads';

interface Channel {
	type: 'channel';
	channelId: string;
	title: string;
	description?: string;
	subscribers?: string;
	thumbnail?: string;
	videoCount?: string;
}

interface VideoItem {
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

interface VideoDetail {
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

interface DownloadItem {
	videoId: string;
	title: string;
	channel: string;
	quality: string;
	status: 'downloading' | 'complete' | 'error';
	error?: string;
	file?: string;
	duration?: number;
}

interface ChannelData {
	channel: { channelId: string; title: string; avatar?: string; subscribers?: string; description?: string; banner?: string } | null;
	videos: VideoItem[];
	continuation: string | null;
}

// --- Helpers ---
function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(views: number | string): string {
	if (typeof views === 'string') return views;
	if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
	if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
	return `${views} views`;
}

function formatViewsShort(views: number | string): string {
	if (typeof views === 'string') return views;
	if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
	if (views >= 1_000) return `${Math.round(views / 1_000)}K`;
	return `${views}`;
}

function fixThumbnailUrl(url: string): string {
	if (!url) return '';
	if (url.startsWith('//')) return `https:${url}`;
	return url;
}

function getVideoThumbnail(videoId: string, thumbnail?: string): string {
	if (thumbnail && thumbnail.length > 0) return fixThumbnailUrl(thumbnail);
	return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// --- Main Component ---
export function YouTubeContent() {
	const [view, setView] = useState<View>('search');
	const [query, setQuery] = useState('');
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [searchResults, setSearchResults] = useState<(Channel | VideoItem)[]>([]);
	const [channelData, setChannelData] = useState<ChannelData | null>(null);
	const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
	const [relatedVideos, setRelatedVideos] = useState<VideoItem[]>([]);
	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searched, setSearched] = useState(false);
	const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
	const [descriptionExpanded, setDescriptionExpanded] = useState(false);
	const [navigationStack, setNavigationStack] = useState<{ view: View; data?: string }[]>([]);
	const [channelTab, setChannelTab] = useState<'videos' | 'about'>('videos');
	const [channelSort, setChannelSort] = useState<'latest' | 'popular' | 'oldest'>('latest');
	const searchInputRef = useRef<HTMLInputElement>(null);
	const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// --- Suggestions ---
	const fetchSuggestions = useCallback((q: string) => {
		if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
		if (q.length < 2) {
			setSuggestions([]);
			return;
		}
		suggestTimerRef.current = setTimeout(async () => {
			try {
				const res = await fetch(`/api/youtube/suggest?q=${encodeURIComponent(q)}`);
				if (!res.ok) return;
				const data = await res.json();
				setSuggestions(data.suggestions?.slice(0, 8) ?? []);
			} catch {
				setSuggestions([]);
			}
		}, 200);
	}, []);

	// --- Search ---
	const doSearch = async (q: string) => {
		if (!q.trim()) return;
		setQuery(q);
		setShowSuggestions(false);
		setLoading(true);
		setError(null);
		setSearched(true);
		setView('search');
		setNavigationStack([]);
		try {
			const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
			if (!res.ok) throw new Error(`Search failed (${res.status})`);
			const data = await res.json();
			setSearchResults(data.results ?? []);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Search failed. Check your connection and try again.');
			setSearchResults([]);
		}
		setLoading(false);
	};

	// --- Channel ---
	const openChannel = async (channelId: string) => {
		setNavigationStack((prev) => [...prev, { view, data: query }]);
		setLoading(true);
		setError(null);
		setView('channel');
		setChannelTab('videos');
		try {
			const res = await fetch(`/api/youtube/channel/${channelId}`);
			if (!res.ok) throw new Error(`Failed to load channel (${res.status})`);
			const data = await res.json();
			setChannelData(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load channel.');
			setChannelData(null);
		}
		setLoading(false);
	};

	const loadMoreVideos = async () => {
		if (!channelData?.continuation || loadingMore) return;
		setLoadingMore(true);
		try {
			const res = await fetch(
				`/api/youtube/channel/${channelData.channel?.channelId}?continuation=${encodeURIComponent(channelData.continuation)}`,
			);
			if (!res.ok) throw new Error(`Failed to load more videos (${res.status})`);
			const data = await res.json();
			setChannelData((prev) =>
				prev
					? {
							...prev,
							videos: [...prev.videos, ...(data.videos ?? [])],
							continuation: data.continuation,
						}
					: null,
			);
		} catch {
			// silent - button stays visible for retry
		}
		setLoadingMore(false);
	};

	// --- Video ---
	const openVideo = async (videoId: string) => {
		setNavigationStack((prev) => [...prev, { view }]);
		setLoading(true);
		setError(null);
		setView('video');
		setDescriptionExpanded(false);
		try {
			const [detailRes, relatedRes] = await Promise.all([
				fetch(`/api/youtube/video/${videoId}`),
				fetch(`/api/youtube/video/${videoId}/related`),
			]);
			if (!detailRes.ok) throw new Error(`Failed to load video (${detailRes.status})`);
			const detail = await detailRes.json();
			const related = relatedRes.ok ? await relatedRes.json() : { related: [] };
			setVideoDetail(detail);
			setRelatedVideos(related.related ?? []);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load video details.');
			setVideoDetail(null);
		}
		setLoading(false);
	};

	// --- Download ---
	const startDownload = async (videoId: string, quality: string) => {
		setDownloadingIds((prev) => new Set(prev).add(`${videoId}-${quality}`));
		try {
			const res = await fetch(`/api/youtube/download/${videoId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ quality }),
			});
			if (!res.ok) throw new Error(`Download request failed (${res.status})`);
			const data = await res.json();
			if (data.status === 'started' || data.status === 'already_downloaded') {
				loadDownloads();
			}
		} catch {
			// download failed silently - user can retry
		}
		setTimeout(() => {
			setDownloadingIds((prev) => {
				const next = new Set(prev);
				next.delete(`${videoId}-${quality}`);
				return next;
			});
		}, 2000);
	};

	const loadDownloads = async () => {
		try {
			const res = await fetch('/api/youtube/downloads');
			if (!res.ok) return;
			const data = await res.json();
			setDownloads(data.downloads ?? []);
		} catch {
			// silent
		}
	};

	const openDownloads = () => {
		setNavigationStack((prev) => [...prev, { view }]);
		setView('downloads');
		loadDownloads();
	};

	// --- Navigation ---
	const goBack = () => {
		const prev = navigationStack[navigationStack.length - 1];
		if (prev) {
			setNavigationStack((stack) => stack.slice(0, -1));
			setView(prev.view);
			setError(null);
		} else {
			setView('search');
			setError(null);
		}
	};

	// Poll downloads
	useEffect(() => {
		if (view !== 'downloads') return;
		const hasActive = downloads.some((d) => d.status === 'downloading');
		if (!hasActive) return;
		const timer = setInterval(loadDownloads, 3000);
		return () => clearInterval(timer);
	}, [view, downloads]);

	return (
		<div className="flex flex-col h-full min-h-0 bg-background">
			{/* --- YouTube-style Header --- */}
			<div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-20">
				{view !== 'search' && (
					<Button variant="ghost" size="icon" onClick={goBack} className="shrink-0 rounded-full">
						<ArrowLeft className="h-5 w-5" />
					</Button>
				)}

				{/* YouTube logo area */}
				<div className="flex items-center gap-1.5 shrink-0 mr-2">
					<div className="w-7 h-5 bg-red-600 rounded-[3px] flex items-center justify-center">
						<Play className="h-3 w-3 text-white fill-white" />
					</div>
					<span className="font-semibold text-base tracking-tight hidden sm:inline">YouTube</span>
				</div>

				{/* Search bar - YouTube style centered */}
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
					{downloads.length > 0 && (
						<Badge variant="secondary" className="ml-0.5 text-xs px-1.5 h-5 min-w-5 flex items-center justify-center">
							{downloads.length}
						</Badge>
					)}
				</Button>
			</div>

			{/* --- Error --- */}
			{error && (
				<Alert variant="destructive" className="mx-4 mt-3 shrink-0">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* --- Content Area --- */}
			<div className="flex-1 min-h-0 overflow-auto">

				{/* === SEARCH VIEW === */}
				{view === 'search' && (
					<div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
						{/* Loading skeletons - YouTube search style */}
						{loading && (
							<div className="space-y-4">
								{Array.from({ length: 6 }).map((_, i) => (
									<div key={`skel-${i}`} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
										<Skeleton className="w-full sm:w-[300px] lg:w-[360px] shrink-0 aspect-video rounded-xl" />
										<div className="flex-1 space-y-2 pt-1">
											<Skeleton className="h-5 w-full" />
											<Skeleton className="h-5 w-3/4" />
											<Skeleton className="h-3 w-32 mt-3" />
											<Skeleton className="h-3 w-48" />
										</div>
									</div>
								))}
							</div>
						)}

						{/* Idle state */}
						{!loading && !searched && (
							<div className="flex flex-col items-center justify-center py-20 space-y-6">
								<div className="w-20 h-20 rounded-full bg-red-600/10 flex items-center justify-center">
									<div className="w-12 h-8 bg-red-600 rounded-[4px] flex items-center justify-center">
										<Play className="h-5 w-5 text-white fill-white" />
									</div>
								</div>
								<div className="text-center space-y-2">
									<h2 className="text-lg font-medium">Search YouTube</h2>
									<p className="text-sm text-muted-foreground text-center max-w-md">
										Find channels, browse videos, and download for offline viewing.
									</p>
								</div>
								<div className="flex flex-wrap gap-2 justify-center">
									{['Veritasium', '3Blue1Brown', 'Kurzgesagt', 'Fireship', 'The Coding Train'].map((name) => (
										<button
											key={name}
											type="button"
											className="px-4 py-2 rounded-full bg-muted/60 hover:bg-muted text-sm transition-colors cursor-pointer"
											onClick={() => doSearch(name.toLowerCase())}
										>
											{name}
										</button>
									))}
								</div>
							</div>
						)}

						{/* Empty results */}
						{!loading && searched && searchResults.length === 0 && !error && (
							<div className="flex flex-col items-center justify-center py-20 space-y-4">
								<Search className="w-10 h-10 text-muted-foreground/40" />
								<div className="text-center space-y-1">
									<p className="font-medium">No results found</p>
									<p className="text-sm text-muted-foreground">
										Try different keywords or check the spelling
									</p>
								</div>
							</div>
						)}

						{/* Search Results - YouTube list layout */}
						{!loading && searchResults.length > 0 && (
							<div className="space-y-3">
								{searchResults.map((item) => {
									// Channel result
									if ('type' in item && item.type === 'channel') {
										const ch = item as Channel;
										return (
											<div
												key={ch.channelId}
												className="flex items-center gap-4 py-4 cursor-pointer group"
												onClick={() => openChannel(ch.channelId)}
											>
												{/* Channel avatar - responsive width */}
												<div className="w-20 sm:w-[200px] lg:w-[360px] shrink-0 flex items-center justify-center">
													{ch.thumbnail ? (
														<img
															src={fixThumbnailUrl(ch.thumbnail)}
															alt={ch.title}
															className="w-16 h-16 sm:w-[100px] sm:h-[100px] lg:w-[136px] lg:h-[136px] rounded-full object-cover bg-muted"
														/>
													) : (
														<div className="w-16 h-16 sm:w-[100px] sm:h-[100px] lg:w-[136px] lg:h-[136px] rounded-full bg-muted flex items-center justify-center">
															<Users className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
														</div>
													)}
												</div>
												{/* Channel info */}
												<div className="flex-1 min-w-0">
													<h3 className="text-base sm:text-lg font-medium group-hover:text-blue-400 transition-colors">
														{ch.title}
													</h3>
													<p className="text-xs text-muted-foreground mt-1">
														{ch.subscribers}
														{ch.videoCount && ch.videoCount !== ch.subscribers ? ` \u00B7 ${ch.videoCount}` : ''}
													</p>
													{ch.description && (
														<p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2 line-clamp-2">
															{ch.description}
														</p>
													)}
												</div>
											</div>
										);
									}

									// Video result
									const v = item as VideoItem;
									return (
										<div
											key={v.videoId}
											className="flex flex-col sm:flex-row gap-2 sm:gap-4 cursor-pointer group"
											onClick={() => openVideo(v.videoId)}
										>
											{/* Thumbnail */}
											<div className="w-full sm:w-[300px] lg:w-[360px] shrink-0 relative rounded-xl overflow-hidden bg-muted">
												<img
													src={getVideoThumbnail(v.videoId, v.thumbnail)}
													alt={v.title}
													className="w-full aspect-video object-cover"
												/>
												{v.duration && (
													<span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
														{v.duration}
													</span>
												)}
											</div>
											{/* Video info */}
											<div className="flex-1 min-w-0 pt-0 sm:pt-1 px-1 sm:px-0 pb-3 sm:pb-0">
												<h3 className="text-sm sm:text-base font-medium line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">
													{v.title}
												</h3>
												<p className="text-xs text-muted-foreground mt-1 sm:mt-2">
													{v.views}
													{v.publishedTime ? ` \u00B7 ${v.publishedTime}` : ''}
												</p>
												{v.channel && (
													<button
														type="button"
														className="text-xs text-muted-foreground mt-1 sm:mt-2 hover:text-foreground transition-colors flex items-center gap-2"
														onClick={(e) => {
															e.stopPropagation();
															if (v.channelId) openChannel(v.channelId);
														}}
													>
														<div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
															<Users className="h-3 w-3 text-muted-foreground" />
														</div>
														{v.channel}
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

				{/* === CHANNEL VIEW === */}
				{view === 'channel' && (
					<div>
						{loading && !channelData && (
							<div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-6">
								<Skeleton className="w-full h-[150px] rounded-xl" />
								<div className="flex items-center gap-4">
									<Skeleton className="w-20 h-20 rounded-full" />
									<div className="space-y-2">
										<Skeleton className="h-6 w-48" />
										<Skeleton className="h-4 w-32" />
									</div>
								</div>
								<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
									{Array.from({ length: 8 }).map((_, i) => (
										<div key={`vskel-${i}`} className="space-y-2">
											<Skeleton className="aspect-video rounded-xl" />
											<Skeleton className="h-4 w-3/4" />
											<Skeleton className="h-3 w-1/2" />
										</div>
									))}
								</div>
							</div>
						)}

						{channelData && (
							<>
								{/* Banner */}
								<div className="w-full h-[100px] sm:h-[150px] bg-gradient-to-r from-blue-900/40 via-blue-800/20 to-purple-900/30 relative overflow-hidden">
									<div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/40" />
								</div>

								<div className="max-w-6xl mx-auto px-4 sm:px-6">
									{/* Channel header */}
									{channelData.channel && (
										<div className="flex items-start gap-4 sm:gap-6 py-4 sm:py-6">
											{channelData.channel.avatar ? (
												<img
													src={channelData.channel.avatar}
													alt={channelData.channel.title}
													className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover bg-muted shrink-0"
												/>
											) : (
												<div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted flex items-center justify-center shrink-0">
													<Users className="h-8 w-8 text-muted-foreground" />
												</div>
											)}
											<div className="flex-1 min-w-0">
												<h1 className="text-xl sm:text-2xl font-bold">{channelData.channel.title}</h1>
												<p className="text-sm text-muted-foreground mt-1">
													{channelData.channel.subscribers && `${channelData.channel.subscribers}`}
													{channelData.videos.length > 0 && ` \u00B7 ${channelData.videos.length} videos`}
												</p>
												{channelData.channel.description && (
													<p className="text-sm text-muted-foreground mt-1 line-clamp-1">
														{channelData.channel.description}
													</p>
												)}
												<button
													type="button"
													className="mt-3 px-4 py-2 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
												>
													Subscribe
												</button>
											</div>
										</div>
									)}

									{/* Tab bar */}
									<div className="flex gap-0 border-b border-border/40 mb-4">
										{(['videos', 'about'] as const).map((tab) => (
											<button
												key={tab}
												type="button"
												className={`px-4 sm:px-6 py-3 text-sm font-medium transition-colors relative ${
													channelTab === tab
														? 'text-foreground'
														: 'text-muted-foreground hover:text-foreground'
												}`}
												onClick={() => setChannelTab(tab)}
											>
												{tab.charAt(0).toUpperCase() + tab.slice(1)}
												{channelTab === tab && (
													<div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
												)}
											</button>
										))}
									</div>

									{/* Videos tab */}
									{channelTab === 'videos' && (
										<>
											{/* Sort filter chips */}
											<div className="flex gap-2 mb-4">
												{(['latest', 'popular', 'oldest'] as const).map((sort) => (
													<button
														key={sort}
														type="button"
														className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
															channelSort === sort
																? 'bg-white text-black font-medium'
																: 'bg-muted/60 text-muted-foreground hover:bg-muted'
														}`}
														onClick={() => setChannelSort(sort)}
													>
														{sort.charAt(0).toUpperCase() + sort.slice(1)}
													</button>
												))}
											</div>

											{channelData.videos.length > 0 ? (
												<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6 pb-6">
													{channelData.videos.map((video) => (
														<div
															key={video.videoId}
															className="cursor-pointer group"
															onClick={() => openVideo(video.videoId)}
														>
															{/* Thumbnail */}
															<div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-2">
																<img
																	src={getVideoThumbnail(video.videoId, video.thumbnail)}
																	alt={video.title}
																	className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
																/>
																{video.duration && (
																	<span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs font-medium px-1 py-0.5 rounded text-[11px]">
																		{video.duration}
																	</span>
																)}
															</div>
															{/* Title + meta */}
															<h3 className="text-sm font-medium line-clamp-2 leading-snug mb-1 group-hover:text-blue-400 transition-colors">
																{video.title}
															</h3>
															<p className="text-xs text-muted-foreground">
																{video.views}
																{video.publishedTime ? ` \u00B7 ${video.publishedTime}` : ''}
															</p>
														</div>
													))}
												</div>
											) : (
												!loading && (
													<div className="text-center py-12">
														<p className="text-muted-foreground">This channel has no videos yet.</p>
													</div>
												)
											)}

											{/* Load more */}
											{channelData.continuation && (
												<div className="flex justify-center pb-6">
													<Button variant="outline" onClick={loadMoreVideos} disabled={loadingMore} className="gap-2 rounded-full">
														{loadingMore ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<ChevronDown className="h-4 w-4" />
														)}
														Show more
													</Button>
												</div>
											)}
										</>
									)}

									{/* About tab */}
									{channelTab === 'about' && (
										<div className="py-6 max-w-2xl">
											<h3 className="text-base font-medium mb-3">Description</h3>
											<p className="text-sm text-muted-foreground whitespace-pre-line">
												{channelData.channel?.description || 'No description available.'}
											</p>
										</div>
									)}
								</div>
							</>
						)}
					</div>
				)}

				{/* === VIDEO DETAIL VIEW === */}
				{view === 'video' && (
					<>
						{loading && !videoDetail && (
							<div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
								<div className="flex flex-col lg:flex-row gap-6">
									<div className="flex-1 min-w-0 space-y-3">
										<Skeleton className="aspect-video rounded-xl w-full" />
										<Skeleton className="h-6 w-3/4" />
										<Skeleton className="h-4 w-1/3" />
									</div>
									<div className="w-full lg:w-[400px] shrink-0 space-y-3">
										{Array.from({ length: 5 }).map((_, i) => (
											<div key={`rskel-${i}`} className="flex gap-2">
												<Skeleton className="w-[168px] aspect-video rounded-lg shrink-0" />
												<div className="flex-1 space-y-1">
													<Skeleton className="h-3 w-full" />
													<Skeleton className="h-3 w-3/4" />
													<Skeleton className="h-3 w-1/2" />
												</div>
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						{videoDetail && (
							<div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4">
								<div className="flex flex-col lg:flex-row gap-6">
									{/* Main content */}
									<div className="flex-1 min-w-0">
										{/* Video player area */}
										<div className="relative aspect-video rounded-xl overflow-hidden bg-black mb-3">
											<img
												src={fixThumbnailUrl(videoDetail.thumbnail)}
												alt={videoDetail.title}
												className="w-full h-full object-contain"
											/>
											<div className="absolute inset-0 flex items-center justify-center">
												<div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors cursor-pointer">
													<Play className="h-8 w-8 sm:h-10 sm:w-10 text-white fill-white ml-1" />
												</div>
											</div>
										</div>

										{/* Title */}
										<h1 className="text-lg sm:text-xl font-bold leading-snug mb-2">
											{videoDetail.title}
										</h1>

										{/* Channel row + actions */}
										<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
											<div className="flex items-center gap-3">
												<button
													type="button"
													className="flex items-center gap-3 group cursor-pointer"
													onClick={() => openChannel(videoDetail.channelId)}
												>
													<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
														<Users className="h-5 w-5 text-muted-foreground" />
													</div>
													<div>
														<p className="text-sm font-medium group-hover:text-blue-400 transition-colors">
															{videoDetail.channel}
														</p>
													</div>
												</button>
												<button
													type="button"
													className="px-4 py-2 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors ml-2"
												>
													Subscribe
												</button>
											</div>
											<div className="flex items-center gap-2">
												<div className="flex items-center bg-muted/60 rounded-full overflow-hidden">
													<button type="button" className="flex items-center gap-1.5 px-4 py-2 hover:bg-muted transition-colors text-sm">
														<ThumbsUp className="h-4 w-4" />
														{formatViewsShort(videoDetail.views)}
													</button>
													<div className="w-px h-6 bg-border" />
													<button type="button" className="px-3 py-2 hover:bg-muted transition-colors">
														<ThumbsUp className="h-4 w-4 rotate-180" />
													</button>
												</div>
												<button type="button" className="flex items-center gap-1.5 px-4 py-2 bg-muted/60 rounded-full hover:bg-muted transition-colors text-sm">
													<Share2 className="h-4 w-4" />
													Share
												</button>
											</div>
										</div>

										{/* Description card */}
										<div className="bg-muted/40 rounded-xl p-3 mb-4">
											<div className="flex items-center gap-2 text-sm font-medium mb-1">
												<span>{formatViews(videoDetail.views)}</span>
												<span className="flex items-center gap-1 text-muted-foreground">
													<Clock className="h-3.5 w-3.5" />
													{formatDuration(videoDetail.duration)}
												</span>
											</div>
											<p className={`text-sm text-muted-foreground whitespace-pre-line ${descriptionExpanded ? '' : 'line-clamp-3'}`}>
												{videoDetail.description}
											</p>
											{videoDetail.description && videoDetail.description.length > 200 && (
												<button
													type="button"
													className="text-sm font-medium mt-2 hover:text-foreground transition-colors cursor-pointer"
													onClick={() => setDescriptionExpanded(!descriptionExpanded)}
												>
													{descriptionExpanded ? 'Show less' : '...more'}
												</button>
											)}
										</div>

										{/* Download section */}
										<div className="bg-muted/40 rounded-xl p-3 mb-4">
											<p className="text-sm font-medium mb-2 flex items-center gap-2">
												<Download className="h-4 w-4" />
												Download
											</p>
											<div className="flex flex-wrap gap-2">
												{videoDetail.availableQualities.map((q) => {
													const isDownloading = downloadingIds.has(`${videoDetail.videoId}-${q}`);
													return (
														<Button
															key={q}
															variant="outline"
															size="sm"
															disabled={isDownloading}
															onClick={() => startDownload(videoDetail.videoId, q)}
															className="gap-1.5 rounded-full"
														>
															{isDownloading ? (
																<Loader2 className="h-3.5 w-3.5 animate-spin" />
															) : (
																<Download className="h-3.5 w-3.5" />
															)}
															{q}
														</Button>
													);
												})}
											</div>
										</div>

										{/* Keywords */}
										{videoDetail.keywords && videoDetail.keywords.length > 0 && (
											<div className="flex flex-wrap gap-1.5 mb-4">
												{videoDetail.keywords.slice(0, 12).map((kw) => (
													<span
														key={kw}
														className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full cursor-pointer hover:bg-blue-500/20 transition-colors"
													>
														#{kw}
													</span>
												))}
											</div>
										)}
									</div>

									{/* Related videos sidebar */}
									<div className="w-full lg:w-[400px] shrink-0">
										{relatedVideos.length > 0 && (
											<div className="space-y-2">
												{relatedVideos.slice(0, 15).map((v) => (
													<div
														key={v.videoId}
														className="flex gap-2 cursor-pointer hover:bg-muted/40 rounded-lg p-1 transition-colors group"
														onClick={() => openVideo(v.videoId)}
													>
														{/* Thumbnail */}
														<div className="w-[168px] shrink-0 relative rounded-lg overflow-hidden bg-muted">
															<img
																src={getVideoThumbnail(v.videoId, v.thumbnail)}
																alt={v.title}
																className="w-full aspect-video object-cover"
															/>
															{v.duration && (
																<span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1 py-0.5 rounded">
																	{v.duration}
																</span>
															)}
														</div>
														{/* Info */}
														<div className="flex-1 min-w-0 py-0.5">
															<h4 className="text-sm font-medium line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">
																{v.title}
															</h4>
															{v.channel && (
																<p className="text-xs text-muted-foreground mt-1">{v.channel}</p>
															)}
															<p className="text-xs text-muted-foreground">
																{v.views}
																{v.publishedTime ? ` \u00B7 ${v.publishedTime}` : ''}
															</p>
														</div>
													</div>
												))}
											</div>
										)}
									</div>
								</div>
							</div>
						)}
					</>
				)}

				{/* === DOWNLOADS VIEW === */}
				{view === 'downloads' && (
					<div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-xl font-bold">Downloads</h2>
							{downloads.length > 0 && (
								<Button variant="ghost" size="sm" onClick={loadDownloads} className="gap-1.5 rounded-full">
									<Loader2 className={`h-3.5 w-3.5 ${downloads.some((d) => d.status === 'downloading') ? 'animate-spin' : ''}`} />
									Refresh
								</Button>
							)}
						</div>

						{downloads.length === 0 && (
							<div className="flex flex-col items-center justify-center py-20 space-y-4">
								<div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
									<Download className="h-8 w-8 text-muted-foreground" />
								</div>
								<div className="text-center space-y-2">
									<p className="text-base font-medium">No downloads yet</p>
									<p className="text-sm text-muted-foreground text-center max-w-md">
										Browse channels, find a video, and click a quality button to start downloading.
									</p>
								</div>
								<button
									type="button"
									className="px-4 py-2 rounded-full bg-muted/60 hover:bg-muted text-sm transition-colors flex items-center gap-2"
									onClick={() => setView('search')}
								>
									<ArrowLeft className="h-4 w-4" />
									Browse videos
								</button>
							</div>
						)}

						{downloads.length > 0 && (
							<div className="space-y-3">
								{downloads.map((dl) => (
									<div
										key={`${dl.videoId}-${dl.quality}`}
										className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-muted/20 rounded-xl p-3 hover:bg-muted/30 transition-colors"
									>
										{/* Thumbnail */}
										<div className="w-full sm:w-[200px] shrink-0 relative rounded-lg overflow-hidden bg-muted">
											<img
												src={getVideoThumbnail(dl.videoId)}
												alt={dl.title}
												className="w-full aspect-video object-cover"
											/>
											{dl.duration && (
												<span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1 py-0.5 rounded">
													{formatDuration(dl.duration)}
												</span>
											)}
										</div>
										{/* Info */}
										<div className="flex-1 min-w-0 flex flex-col justify-between py-1">
											<div>
												<h3 className="font-medium text-sm line-clamp-2">{dl.title}</h3>
												<p className="text-xs text-muted-foreground mt-1">{dl.channel}</p>
											</div>
											<div className="flex items-center gap-3 mt-2">
												<Badge
													variant={
														dl.status === 'complete'
															? 'default'
															: dl.status === 'error'
																? 'destructive'
																: 'secondary'
													}
													className="text-xs"
												>
													{dl.status === 'complete' && <CheckCircle className="h-3 w-3 mr-1" />}
													{dl.status === 'downloading' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
													{dl.status === 'error' && <XCircle className="h-3 w-3 mr-1" />}
													{dl.status}
												</Badge>
												<span className="text-xs text-muted-foreground">{dl.quality}</span>

												{dl.status === 'complete' && (
													<>
														<Button
															size="sm"
															variant="ghost"
															className="gap-1 text-xs h-7 rounded-full"
															onClick={() => openVideo(dl.videoId)}
														>
															<Play className="h-3 w-3" />
															Watch
														</Button>
														<Button
															size="sm"
															variant="ghost"
															className="gap-1 text-xs h-7 rounded-full"
															asChild
														>
															<a href={`/api/youtube/downloads/${dl.videoId}`} target="_blank" rel="noreferrer">
																<Download className="h-3 w-3" />
																File
															</a>
														</Button>
													</>
												)}
											</div>

											{dl.status === 'error' && dl.error && (
												<p className="text-xs text-destructive mt-1 line-clamp-1">{dl.error.split('\n')[0]}</p>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

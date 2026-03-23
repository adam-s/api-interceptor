'use client';

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
} from 'lucide-react';

type View = 'search' | 'channel' | 'video' | 'downloads';

interface Channel {
	channelId: string;
	title: string;
	description?: string;
	subscribers?: string;
	thumbnail?: string;
	videoCount?: string;
}

interface Video {
	videoId: string;
	title: string;
	channel?: string;
	channelId?: string;
	duration?: string;
	views?: string;
	publishedTime?: string;
	thumbnail?: string;
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
	availableQualities: string[];
}

interface DownloadItem {
	videoId: string;
	title: string;
	channel: string;
	quality: string;
	status: 'downloading' | 'complete' | 'error';
	file?: string;
}

export default function YouTubePage() {
	const [view, setView] = useState<View>('search');
	const [query, setQuery] = useState('');
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [searchResults, setSearchResults] = useState<(Channel | Video & { type: string })[]>([]);
	const [channelData, setChannelData] = useState<{ channel: Channel | null; videos: Video[]; continuation: string | null } | null>(null);
	const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
	const [relatedVideos, setRelatedVideos] = useState<Video[]>([]);
	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);

	const fetchSuggestions = useCallback(async (q: string) => {
		if (q.length < 2) { setSuggestions([]); return; }
		try {
			const res = await fetch(`/api/youtube/suggest?q=${encodeURIComponent(q)}`);
			const data = await res.json();
			setSuggestions(data.suggestions?.slice(0, 6) ?? []);
		} catch { setSuggestions([]); }
	}, []);

	const doSearch = async (q: string) => {
		setQuery(q);
		setShowSuggestions(false);
		setLoading(true);
		setView('search');
		try {
			const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}&type=channel`);
			const data = await res.json();
			setSearchResults(data.results ?? []);
		} catch { setSearchResults([]); }
		setLoading(false);
	};

	const openChannel = async (channelId: string) => {
		setLoading(true);
		setView('channel');
		try {
			const res = await fetch(`/api/youtube/channel/${channelId}`);
			const data = await res.json();
			setChannelData(data);
		} catch { setChannelData(null); }
		setLoading(false);
	};

	const loadMoreVideos = async () => {
		if (!channelData?.continuation) return;
		setLoading(true);
		try {
			const res = await fetch(`/api/youtube/channel/${channelData.channel?.channelId}?continuation=${encodeURIComponent(channelData.continuation)}`);
			const data = await res.json();
			setChannelData(prev => prev ? {
				...prev,
				videos: [...prev.videos, ...(data.videos ?? [])],
				continuation: data.continuation,
			} : null);
		} catch {}
		setLoading(false);
	};

	const openVideo = async (videoId: string) => {
		setLoading(true);
		setView('video');
		try {
			const [detailRes, relatedRes] = await Promise.all([
				fetch(`/api/youtube/video/${videoId}`),
				fetch(`/api/youtube/video/${videoId}/related`),
			]);
			const detail = await detailRes.json();
			const related = await relatedRes.json();
			setVideoDetail(detail);
			setRelatedVideos(related.related ?? []);
		} catch { setVideoDetail(null); }
		setLoading(false);
	};

	const startDownload = async (videoId: string, quality: string) => {
		try {
			const res = await fetch(`/api/youtube/download/${videoId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ quality }),
			});
			const data = await res.json();
			if (data.status === 'started' || data.status === 'already_downloaded') {
				loadDownloads();
			}
		} catch {}
	};

	const loadDownloads = async () => {
		try {
			const res = await fetch('/api/youtube/downloads');
			const data = await res.json();
			setDownloads(data.downloads ?? []);
		} catch {}
	};

	const openDownloads = () => {
		setView('downloads');
		loadDownloads();
	};

	const formatDuration = (seconds: number) => {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
		return `${m}:${String(s).padStart(2, '0')}`;
	};

	const formatViews = (views: number) => {
		if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
		if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K views`;
		return `${views} views`;
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b p-4 flex items-center gap-3">
				{view !== 'search' && (
					<Button variant="ghost" size="icon" onClick={() => setView(view === 'video' && channelData ? 'channel' : 'search')}>
						<ArrowLeft className="h-4 w-4" />
					</Button>
				)}
				<div className="relative flex-1 max-w-xl">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search channels..."
						className="pl-9"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							fetchSuggestions(e.target.value);
							setShowSuggestions(true);
						}}
						onKeyDown={(e) => e.key === 'Enter' && doSearch(query)}
						onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
						onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
					/>
					{showSuggestions && suggestions.length > 0 && (
						<div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50">
							{suggestions.map((s) => (
								<button
									key={s}
									className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
									onMouseDown={() => doSearch(s)}
								>
									{s}
								</button>
							))}
						</div>
					)}
				</div>
				<Button variant="outline" size="icon" onClick={openDownloads}>
					<Library className="h-4 w-4" />
				</Button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-auto p-4">
				{loading && view === 'search' && (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton key={i} className="h-24 rounded-lg" />
						))}
					</div>
				)}

				{/* Search Results */}
				{view === 'search' && !loading && (
					<div className="space-y-4">
						{searchResults.length === 0 && query && (
							<p className="text-muted-foreground text-center py-12">No results for &ldquo;{query}&rdquo;</p>
						)}
						{searchResults.length === 0 && !query && (
							<div className="text-center py-20 space-y-4">
								<Search className="h-12 w-12 mx-auto text-muted-foreground" />
								<p className="text-muted-foreground">Search for a channel to get started</p>
								<div className="flex gap-2 justify-center">
									<Button variant="outline" size="sm" onClick={() => doSearch('veritasium')}>Veritasium</Button>
									<Button variant="outline" size="sm" onClick={() => doSearch('3blue1brown')}>3Blue1Brown</Button>
									<Button variant="outline" size="sm" onClick={() => doSearch('kurzgesagt')}>Kurzgesagt</Button>
								</div>
							</div>
						)}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{searchResults.map((item: Record<string, unknown>) => (
								<Card
									key={(item.channelId ?? item.videoId) as string}
									className="cursor-pointer hover:bg-accent/50 transition-colors"
									onClick={() => item.type === 'channel' ? openChannel(item.channelId as string) : openVideo(item.videoId as string)}
								>
									<CardContent className="flex items-center gap-3 p-3">
										{item.thumbnail && (
											<img
												src={item.thumbnail as string}
												alt={item.title as string}
												className="w-14 h-14 rounded-full object-cover"
											/>
										)}
										<div className="min-w-0 flex-1">
											<p className="font-medium truncate">{item.title as string}</p>
											{item.subscribers && (
												<p className="text-xs text-muted-foreground">{item.subscribers as string}</p>
											)}
											{item.type === 'channel' && (
												<Badge variant="secondary" className="mt-1 text-xs">Channel</Badge>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				)}

				{/* Channel View */}
				{view === 'channel' && channelData && (
					<div className="space-y-6">
						{channelData.channel && (
							<div className="flex items-center gap-4">
								{channelData.channel.avatar && (
									<img src={channelData.channel.avatar} alt="" className="w-16 h-16 rounded-full" />
								)}
								<div>
									<h2 className="text-xl font-bold">{channelData.channel.title}</h2>
								</div>
							</div>
						)}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
							{channelData.videos.map((video) => (
								<Card
									key={video.videoId}
									className="cursor-pointer hover:bg-accent/50 transition-colors overflow-hidden"
									onClick={() => openVideo(video.videoId)}
								>
									{video.thumbnail && (
										<div className="relative aspect-video">
											<img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
											{video.duration && (
												<span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 rounded">
													{video.duration}
												</span>
											)}
										</div>
									)}
									<CardContent className="p-3">
										<p className="font-medium text-sm line-clamp-2">{video.title}</p>
										<div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
											{video.views && <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{video.views}</span>}
											{video.publishedTime && <span>{video.publishedTime}</span>}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
						{channelData.continuation && (
							<div className="flex justify-center">
								<Button variant="outline" onClick={loadMoreVideos} disabled={loading}>
									{loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
									Load More
								</Button>
							</div>
						)}
					</div>
				)}

				{/* Video Detail */}
				{view === 'video' && videoDetail && (
					<div className="max-w-4xl mx-auto space-y-6">
						{videoDetail.thumbnail && (
							<div className="relative aspect-video rounded-lg overflow-hidden bg-black">
								<img src={videoDetail.thumbnail} alt={videoDetail.title} className="w-full h-full object-contain" />
							</div>
						)}
						<div>
							<h1 className="text-xl font-bold">{videoDetail.title}</h1>
							<div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
								<button className="hover:text-foreground" onClick={() => openChannel(videoDetail.channelId)}>
									{videoDetail.channel}
								</button>
								<span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{formatViews(videoDetail.views)}</span>
								<span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(videoDetail.duration)}</span>
							</div>
						</div>

						{/* Download buttons */}
						<div className="flex flex-wrap gap-2">
							{videoDetail.availableQualities.map((q) => (
								<Button
									key={q}
									variant="outline"
									size="sm"
									onClick={() => startDownload(videoDetail.videoId, q)}
								>
									<Download className="h-3.5 w-3.5 mr-1" />
									{q}
								</Button>
							))}
						</div>

						{videoDetail.description && (
							<p className="text-sm text-muted-foreground whitespace-pre-line">{videoDetail.description}</p>
						)}

						{/* Related */}
						{relatedVideos.length > 0 && (
							<div className="space-y-3">
								<h3 className="font-semibold">Related Videos</h3>
								<div className="space-y-2">
									{relatedVideos.slice(0, 8).map((v) => (
										<div
											key={v.videoId}
											className="flex gap-3 cursor-pointer hover:bg-accent/50 rounded-lg p-2 transition-colors"
											onClick={() => openVideo(v.videoId)}
										>
											{v.thumbnail && (
												<img src={v.thumbnail} alt={v.title} className="w-40 aspect-video rounded object-cover flex-shrink-0" />
											)}
											<div className="min-w-0">
												<p className="font-medium text-sm line-clamp-2">{v.title}</p>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Downloads */}
				{view === 'downloads' && (
					<div className="space-y-4">
						<h2 className="text-xl font-bold">Downloads</h2>
						{downloads.length === 0 && (
							<p className="text-muted-foreground text-center py-12">No downloads yet. Browse a channel and download some videos.</p>
						)}
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{downloads.map((dl) => (
								<Card key={dl.videoId}>
									<CardContent className="p-4 space-y-2">
										<p className="font-medium text-sm line-clamp-2">{dl.title}</p>
										<p className="text-xs text-muted-foreground">{dl.channel}</p>
										<div className="flex items-center justify-between">
											<Badge variant={dl.status === 'complete' ? 'default' : dl.status === 'error' ? 'destructive' : 'secondary'}>
												{dl.status === 'complete' && <CheckCircle className="h-3 w-3 mr-1" />}
												{dl.status === 'downloading' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
												{dl.status}
											</Badge>
											{dl.status === 'complete' && (
												<Button size="sm" variant="ghost" asChild>
													<a href={`/api/youtube/downloads/${dl.videoId}`} target="_blank" rel="noreferrer">
														<Play className="h-3.5 w-3.5 mr-1" />
														Play
													</a>
												</Button>
											)}
										</div>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

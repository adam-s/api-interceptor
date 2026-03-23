'use client';

import { Play, Search, Users } from 'lucide-react';
import { type MutableRefObject, useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCard } from './video-card';
import type { Channel, VideoItem } from './youtube-types';
import { DEBUG, fixThumbnailUrl, ytFetch } from './youtube-types';

interface YouTubeSearchProps {
	query: string;
	setQuery: (q: string) => void;
	onSearch: (q: string) => void;
	onOpenChannel: (channelId: string) => void;
	onOpenVideo: (videoId: string) => void;
	searchTriggerRef: MutableRefObject<((q: string) => void) | null>;
}

export function YouTubeSearch({
	query: _query,
	setQuery,
	onSearch,
	onOpenChannel,
	onOpenVideo,
	searchTriggerRef,
}: YouTubeSearchProps) {
	const [searchResults, setSearchResults] = useState<(Channel | VideoItem)[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searched, setSearched] = useState(false);

	const doSearch = async (q: string) => {
		if (!q.trim()) return;
		setLoading(true);
		setError(null);
		setSearched(true);
		DEBUG('youtube-search', () => ({ action: 'search', query: q }));
		try {
			const data = await ytFetch<{ results?: (Channel | VideoItem)[] }>(
				'Search',
				`/api/youtube/search?q=${encodeURIComponent(q)}`,
			);
			setSearchResults(data.results ?? []);
			DEBUG('youtube-search', () => ({
				action: 'search-results',
				count: (data.results ?? []).length,
			}));
		} catch (e) {
			const msg =
				e instanceof Error ? e.message : 'Search failed. Check your connection and try again.';
			setError(msg);
			setSearchResults([]);
		}
		setLoading(false);
	};

	// Register the search trigger so the header can call it
	useEffect(() => {
		searchTriggerRef.current = doSearch;
		return () => {
			searchTriggerRef.current = null;
		};
	});

	return (
		<div className="max-w-[860px] mx-auto px-4 sm:px-6 py-4">
			{/* Error */}
			{error && (
				<div className="mb-4 p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
					{error}
				</div>
			)}

			{/* Loading skeletons */}
			{loading && (
				<div className="space-y-4">
					{Array.from({ length: 6 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no unique ID
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
						{['Veritasium', '3Blue1Brown', 'Kurzgesagt', 'Fireship', 'The Coding Train'].map(
							(name) => (
								<button
									key={name}
									type="button"
									className="px-4 py-2 rounded-full bg-muted/60 hover:bg-muted text-sm transition-colors cursor-pointer"
									onClick={() => {
										setQuery(name.toLowerCase());
										onSearch(name.toLowerCase());
									}}
								>
									{name}
								</button>
							),
						)}
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

			{/* Search Results */}
			{!loading && searchResults.length > 0 && (
				<div className="space-y-4">
					{searchResults.map((item) => {
						if ('type' in item && item.type === 'channel') {
							const ch = item as Channel;
							return (
								<ChannelResult
									key={ch.channelId}
									channel={ch}
									onClick={() => onOpenChannel(ch.channelId)}
								/>
							);
						}
						const v = item as VideoItem;
						return <VideoCard key={v.videoId} video={v} onClick={onOpenVideo} layout="list" />;
					})}
				</div>
			)}
		</div>
	);
}

// --- Channel Search Result ---
interface ChannelResultProps {
	channel: Channel;
	onClick: () => void;
}

function ChannelResult({ channel, onClick }: ChannelResultProps) {
	return (
		<button
			type="button"
			className="flex items-center gap-4 py-4 cursor-pointer group text-left w-full bg-transparent border-0 p-0"
			onClick={onClick}
		>
			{/* Channel avatar */}
			<div className="w-20 sm:w-[200px] lg:w-[360px] shrink-0 flex items-center justify-center">
				{channel.thumbnail ? (
					// biome-ignore lint/performance/noImgElement: external YouTube thumbnails
					<img
						src={fixThumbnailUrl(channel.thumbnail)}
						alt={channel.title}
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
					{channel.title}
				</h3>
				<p className="text-xs text-muted-foreground mt-1">
					{channel.subscribers}
					{channel.videoCount && channel.videoCount !== channel.subscribers
						? ` \u00B7 ${channel.videoCount}`
						: ''}
				</p>
				{channel.description && (
					<p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2 line-clamp-2">
						{channel.description}
					</p>
				)}
			</div>
		</button>
	);
}

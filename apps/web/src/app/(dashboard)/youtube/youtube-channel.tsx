'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, Loader2, ChevronDown } from 'lucide-react';
import type { ChannelData } from './youtube-types';
import { DEBUG, ytFetch } from './youtube-types';
import { VideoCard } from './video-card';

interface YouTubeChannelProps {
	channelData: ChannelData | null;
	setChannelData: (data: ChannelData | null) => void;
	loading: boolean;
	onOpenVideo: (videoId: string) => void;
}

export function YouTubeChannel({ channelData, setChannelData, loading, onOpenVideo }: YouTubeChannelProps) {
	const [channelTab, setChannelTab] = useState<'videos' | 'about'>('videos');
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

	const loadMoreVideos = async () => {
		if (!channelData?.continuation || loadingMore) return;
		setLoadingMore(true);
		setLoadMoreError(null);
		try {
			const data = await ytFetch<{ videos?: typeof channelData.videos; continuation?: string | null }>(
				'Load more videos',
				`/api/youtube/channel/${channelData.channel?.channelId}?continuation=${encodeURIComponent(channelData.continuation)}`,
			);
			DEBUG('youtube-channel', () => ({ action: 'load-more', newVideos: (data.videos ?? []).length }));
			setChannelData({
				...channelData,
				videos: [...channelData.videos, ...(data.videos ?? [])],
				continuation: data.continuation ?? null,
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed to load more videos';
			setLoadMoreError(msg);
		}
		setLoadingMore(false);
	};

	// Loading skeleton
	if (loading && !channelData) {
		return (
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
		);
	}

	if (!channelData) return null;

	return (
		<div>
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
						{channelData.videos.length > 0 ? (
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6 pb-6">
								{channelData.videos.map((video) => (
									<VideoCard
										key={video.videoId}
										video={video}
										onClick={onOpenVideo}
										layout="grid"
									/>
								))}
							</div>
						) : (
							!loading && (
								<div className="text-center py-12">
									<p className="text-muted-foreground">This channel has no videos yet.</p>
								</div>
							)
						)}

						{/* Load more error */}
						{loadMoreError && (
							<div className="flex justify-center pb-4">
								<p className="text-sm text-destructive">{loadMoreError}</p>
							</div>
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
		</div>
	);
}

'use client';

import { Clock, Download, Loader2, Play, Share2, ThumbsUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoCard } from './video-card';
import type { DownloadItem, VideoDetail, VideoItem } from './youtube-types';
import {
	DEBUG,
	fixThumbnailUrl,
	formatDuration,
	formatViews,
	formatViewsShort,
	ytFetch,
} from './youtube-types';

interface YouTubeVideoProps {
	videoDetail: VideoDetail | null;
	relatedVideos: VideoItem[];
	loading: boolean;
	onOpenVideo: (videoId: string) => void;
	onOpenChannel: (channelId: string) => void;
	onDownloadStarted: () => void;
}

export function YouTubeVideo({
	videoDetail,
	relatedVideos,
	loading,
	onOpenVideo,
	onOpenChannel,
	onDownloadStarted,
}: YouTubeVideoProps) {
	const [descriptionExpanded, setDescriptionExpanded] = useState(false);
	const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
	const [downloadError, setDownloadError] = useState<string | null>(null);

	// Reset description expanded when video changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset state when videoId changes
	useEffect(() => {
		setDescriptionExpanded(false);
		setDownloadError(null);
	}, [videoDetail?.videoId]);

	const startDownload = async (videoId: string, quality: string) => {
		const key = `${videoId}-${quality}`;
		setDownloadingIds((prev) => new Set(prev).add(key));
		setDownloadError(null);
		DEBUG('youtube-video', () => ({ action: 'download-start', videoId, quality }));
		try {
			const data = await ytFetch<{ status: string; error?: string }>(
				'Download',
				`/api/youtube/download/${videoId}`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ quality }),
				},
			);
			DEBUG('youtube-video', () => ({ action: 'download-response', status: data.status }));
			if (data.status === 'started' || data.status === 'already_downloaded') {
				// Poll for completion
				await pollForCompletion(videoId);
				onDownloadStarted();
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Download failed. Try again.';
			setDownloadError(msg);
			DEBUG('youtube-video', () => ({ action: 'download-error', error: msg }));
		}
		setDownloadingIds((prev) => {
			const next = new Set(prev);
			next.delete(key);
			return next;
		});
	};

	const pollForCompletion = async (videoId: string): Promise<void> => {
		const maxAttempts = 60; // 60 * 3s = 3 min max
		for (let i = 0; i < maxAttempts; i++) {
			await new Promise((r) => setTimeout(r, 3000));
			try {
				const data = await ytFetch<{ downloads?: DownloadItem[] }>(
					'Download status',
					'/api/youtube/downloads',
				);
				const dl = data.downloads?.find((d) => d.videoId === videoId);
				DEBUG('youtube-video', () => ({ action: 'download-poll', attempt: i, status: dl?.status }));
				if (dl?.status === 'complete') return;
				if (dl?.status === 'error') {
					setDownloadError(dl.error || 'Download failed');
					return;
				}
			} catch (e) {
				DEBUG('youtube-video', () => ({
					action: 'download-poll-error',
					attempt: i,
					error: e instanceof Error ? e.message : 'unknown',
				}));
			}
		}
	};

	// Loading skeleton
	if (loading && !videoDetail) {
		return (
			<div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
				<div className="flex flex-col lg:flex-row gap-6">
					<div className="flex-1 min-w-0 space-y-3">
						<Skeleton className="aspect-video rounded-xl w-full" />
						<Skeleton className="h-6 w-3/4" />
						<Skeleton className="h-4 w-1/3" />
					</div>
					<div className="w-full lg:w-[400px] shrink-0 space-y-3">
						{Array.from({ length: 5 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders have no unique ID
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
		);
	}

	if (!videoDetail) return null;

	return (
		<div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4">
			<div className="flex flex-col lg:flex-row gap-6">
				{/* Main content */}
				<div className="flex-1 min-w-0">
					{/* Video player area */}
					<div className="relative aspect-video rounded-xl overflow-hidden bg-black mb-3">
						{/* biome-ignore lint/performance/noImgElement: external YouTube thumbnails */}
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
					<h1 className="text-lg sm:text-xl font-bold leading-snug mb-2">{videoDetail.title}</h1>

					{/* Channel row + actions */}
					<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
						<div className="flex items-center gap-3">
							<button
								type="button"
								className="flex items-center gap-3 group cursor-pointer"
								onClick={() => onOpenChannel(videoDetail.channelId)}
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
								<button
									type="button"
									className="flex items-center gap-1.5 px-4 py-2 hover:bg-muted transition-colors text-sm"
								>
									<ThumbsUp className="h-4 w-4" />
									{formatViewsShort(videoDetail.views)}
								</button>
								<div className="w-px h-6 bg-border" />
								<button type="button" className="px-3 py-2 hover:bg-muted transition-colors">
									<ThumbsUp className="h-4 w-4 rotate-180" />
								</button>
							</div>
							<button
								type="button"
								className="flex items-center gap-1.5 px-4 py-2 bg-muted/60 rounded-full hover:bg-muted transition-colors text-sm"
							>
								<Share2 className="h-4 w-4" />
								Share
							</button>
						</div>
					</div>

					{/* Description card */}
					<div className="bg-muted/40 rounded-xl p-3 sm:p-4 mb-4">
						<div className="flex items-center gap-2 text-sm font-medium mb-1.5">
							<span>{formatViews(videoDetail.views)}</span>
							<span className="flex items-center gap-1 text-muted-foreground">
								<Clock className="h-3.5 w-3.5" />
								{formatDuration(videoDetail.duration)}
							</span>
						</div>
						<p
							className={`text-sm text-muted-foreground whitespace-pre-line ${descriptionExpanded ? '' : 'line-clamp-3'}`}
						>
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
					<div className="bg-muted/40 rounded-xl p-3 sm:p-4 mb-4">
						<p className="text-sm font-medium mb-2.5 flex items-center gap-2">
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
						{downloadError && <p className="text-sm text-destructive mt-2">{downloadError}</p>}
					</div>

					{/* Keywords */}
					{videoDetail.keywords && videoDetail.keywords.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mb-4">
							{videoDetail.keywords.slice(0, 12).map((kw) => (
								<span
									key={kw}
									className="text-xs text-blue-400/80 hover:text-blue-400 cursor-pointer transition-colors"
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
								<VideoCard key={v.videoId} video={v} onClick={onOpenVideo} layout="compact" />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

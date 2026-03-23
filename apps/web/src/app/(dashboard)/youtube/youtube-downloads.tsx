'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Download, Play, ArrowLeft, Loader2, CheckCircle, XCircle,
} from 'lucide-react';
import type { DownloadItem } from './youtube-types';
import { DEBUG, formatDuration, getVideoThumbnail, ytFetch } from './youtube-types';

interface YouTubeDownloadsProps {
	onOpenVideo: (videoId: string) => void;
	onBackToSearch: () => void;
}

export function YouTubeDownloads({ onOpenVideo, onBackToSearch }: YouTubeDownloadsProps) {
	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [loadError, setLoadError] = useState<string | null>(null);

	const loadDownloads = useCallback(async () => {
		try {
			const data = await ytFetch<{ downloads?: DownloadItem[] }>('Downloads list', '/api/youtube/downloads');
			setDownloads(data.downloads ?? []);
			DEBUG('youtube-downloads', () => ({ action: 'loaded', count: (data.downloads ?? []).length }));
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed to load downloads';
			setLoadError(msg);
			DEBUG('youtube-downloads', () => ({ action: 'load-error', error: msg }));
		}
	}, []);

	// Load on mount
	useEffect(() => {
		loadDownloads();
	}, [loadDownloads]);

	// Poll while any download is active
	useEffect(() => {
		const hasActive = downloads.some((d) => d.status === 'downloading');
		if (!hasActive) return;
		const timer = setInterval(loadDownloads, 3000);
		return () => clearInterval(timer);
	}, [downloads, loadDownloads]);

	return (
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

			{/* Load error */}
			{loadError && (
				<div className="p-3 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm">
					{loadError}
				</div>
			)}

			{/* Empty state */}
			{downloads.length === 0 && !loadError && (
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
						onClick={onBackToSearch}
					>
						<ArrowLeft className="h-4 w-4" />
						Browse videos
					</button>
				</div>
			)}

			{/* Download list */}
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
												onClick={() => onOpenVideo(dl.videoId)}
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
	);
}

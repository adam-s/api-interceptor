'use client';

import type { VideoItem } from './youtube-types';
import { getVideoThumbnail } from './youtube-types';

interface VideoCardProps {
	video: VideoItem;
	onClick: (videoId: string) => void;
	/** 'grid' = channel grid card, 'list' = search result row, 'compact' = related sidebar */
	layout?: 'grid' | 'list' | 'compact';
}

export function VideoCard({ video, onClick, layout = 'grid' }: VideoCardProps) {
	if (layout === 'compact') {
		return (
			<button
				type="button"
				className="flex gap-2 cursor-pointer hover:bg-muted/40 rounded-lg p-1 transition-colors group text-left w-full bg-transparent border-0"
				onClick={() => onClick(video.videoId)}
			>
				{/* Thumbnail */}
				<div className="w-[168px] shrink-0 relative rounded-lg overflow-hidden bg-muted">
					{/* biome-ignore lint/performance/noImgElement: external YouTube thumbnails */}
					<img
						src={getVideoThumbnail(video.videoId, video.thumbnail)}
						alt={video.title}
						className="w-full aspect-video object-cover"
					/>
					{video.duration && (
						<span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-medium px-1 py-0.5 rounded">
							{video.duration}
						</span>
					)}
				</div>
				{/* Info */}
				<div className="flex-1 min-w-0 py-0.5">
					<h4 className="text-sm font-medium line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">
						{video.title}
					</h4>
					{video.channel && <p className="text-xs text-muted-foreground mt-1">{video.channel}</p>}
					<p className="text-xs text-muted-foreground">
						{video.views}
						{video.publishedTime ? ` \u00B7 ${video.publishedTime}` : ''}
					</p>
				</div>
			</button>
		);
	}

	if (layout === 'list') {
		return (
			<button
				type="button"
				className="flex flex-col sm:flex-row gap-2 sm:gap-4 cursor-pointer group text-left w-full bg-transparent border-0 p-0"
				onClick={() => onClick(video.videoId)}
			>
				{/* Thumbnail */}
				<div className="w-full sm:w-[300px] lg:w-[360px] shrink-0 relative rounded-xl overflow-hidden bg-muted">
					{/* biome-ignore lint/performance/noImgElement: external YouTube thumbnails */}
					<img
						src={getVideoThumbnail(video.videoId, video.thumbnail)}
						alt={video.title}
						className="w-full aspect-video object-cover"
					/>
					{video.duration && (
						<span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded">
							{video.duration}
						</span>
					)}
				</div>
				{/* Video info */}
				<div className="flex-1 min-w-0 pt-0 sm:pt-1 px-1 sm:px-0 pb-3 sm:pb-0">
					<h3 className="text-sm sm:text-base font-medium line-clamp-2 leading-snug group-hover:text-blue-400 transition-colors">
						{video.title}
					</h3>
					{video.channel && (
						<p className="text-xs text-muted-foreground mt-1.5 hover:text-foreground transition-colors">
							{video.channel}
						</p>
					)}
					<p className="text-xs text-muted-foreground mt-0.5">
						{video.views}
						{video.publishedTime ? ` \u00B7 ${video.publishedTime}` : ''}
					</p>
				</div>
			</button>
		);
	}

	// grid layout (default) - channel video grid
	return (
		<button
			type="button"
			className="cursor-pointer group text-left w-full bg-transparent border-0 p-0"
			onClick={() => onClick(video.videoId)}
		>
			{/* Thumbnail */}
			<div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-2">
				{/* biome-ignore lint/performance/noImgElement: external YouTube thumbnails */}
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
		</button>
	);
}

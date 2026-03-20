'use client';

import { ArrowLeft, ArrowRight, Home, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OmnibarProps {
	url: string;
	onUrlChange: (url: string) => void;
	onNavigate: (url: string) => void;
	onBack: () => void;
	onForward: () => void;
	onReload: () => void;
	onHome: () => void;
	disabled?: boolean;
	status?: 'connecting' | 'connected' | 'ready' | 'disconnected' | 'error';
}

/**
 * Chrome-like omnibar with navigation controls and URL input.
 */
export function Omnibar({
	url,
	onUrlChange,
	onNavigate,
	onBack,
	onForward,
	onReload,
	onHome,
	disabled = false,
	status = 'disconnected',
}: OmnibarProps) {
	const [inputValue, setInputValue] = useState(url);

	const handleUrlChange = useCallback(
		(value: string) => {
			setInputValue(value);
			onUrlChange(value);
		},
		[onUrlChange],
	);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			if (inputValue) {
				let normalizedUrl = inputValue;
				if (!/^https?:\/\//i.test(normalizedUrl)) {
					normalizedUrl = `https://${normalizedUrl}`;
				}
				onNavigate(normalizedUrl);
			}
		},
		[inputValue, onNavigate],
	);

	// Sync input value when URL prop changes from external navigation
	useEffect(() => {
		if (url && url !== '') {
			setInputValue(url);
		}
	}, [url]);

	const statusColor =
		status === 'ready'
			? 'bg-green-500'
			: status === 'connected'
				? 'bg-yellow-500'
				: status === 'connecting'
					? 'bg-yellow-500 animate-pulse'
					: status === 'error'
						? 'bg-red-500'
						: 'bg-muted-foreground';

	return (
		<div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
			{/* Navigation buttons */}
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					onClick={onBack}
					disabled={disabled}
					title="Go back"
					className="h-8 w-8"
				>
					<ArrowLeft className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onForward}
					disabled={disabled}
					title="Go forward"
					className="h-8 w-8"
				>
					<ArrowRight className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onReload}
					disabled={disabled}
					title="Reload"
					className="h-8 w-8"
				>
					<RotateCw className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					onClick={onHome}
					disabled={disabled}
					title="Home"
					className="h-8 w-8"
				>
					<Home className="h-4 w-4" />
				</Button>
			</div>

			{/* URL input */}
			<form onSubmit={handleSubmit} className="flex flex-1 items-center gap-2">
				<div className="relative flex-1">
					<Input
						type="text"
						value={inputValue}
						onChange={(e) => handleUrlChange(e.target.value)}
						placeholder="Enter URL or search..."
						className="pr-10 font-mono text-sm"
						disabled={disabled}
					/>
					{/* Status indicator */}
					<div
						className={`absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${statusColor}`}
						title={status}
					/>
				</div>
				<Button type="submit" disabled={disabled} size="sm">
					Go
				</Button>
			</form>
		</div>
	);
}

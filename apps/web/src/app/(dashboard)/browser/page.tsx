'use client';

import dynamic from 'next/dynamic';

const BrowserContent = dynamic(() => import('./browser-content'), {
	ssr: false,
});

export default function BrowserPage() {
	return (
		<div className="flex flex-1 flex-col">
			<BrowserContent />
		</div>
	);
}

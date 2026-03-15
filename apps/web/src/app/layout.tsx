import type { Metadata } from 'next';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
	title: 'Deep Research',
	description: 'Pattern discovery in financial data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="bg-background text-foreground min-h-screen">
				<TooltipProvider>{children}</TooltipProvider>
			</body>
		</html>
	);
}

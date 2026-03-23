import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

export const metadata: Metadata = {
	title: 'Interceptor',
	description: 'Discover web APIs through request interception and traffic analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="bg-background text-foreground min-h-screen">
				<NuqsAdapter>
					<TooltipProvider>{children}</TooltipProvider>
					<Toaster />
				</NuqsAdapter>
			</body>
		</html>
	);
}

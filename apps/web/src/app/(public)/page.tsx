import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-6">
			<div className="text-center">
				<h1 className="text-3xl font-bold">Interceptor</h1>
				<p className="mt-2 text-muted-foreground">Discover web APIs through request interception</p>
			</div>
			<div className="flex gap-3">
				<Button asChild>
					<Link href="/dashboard">Open Dashboard</Link>
				</Button>
				<Button variant="outline" asChild>
					<Link href="/browser">Browser Automation</Link>
				</Button>
			</div>
		</main>
	);
}

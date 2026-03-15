import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-6">
			<div className="text-center">
				<h1 className="text-3xl font-bold">Deep Research</h1>
				<p className="mt-2 text-muted-foreground">
					Pattern discovery in financial data
				</p>
			</div>
			<div className="flex gap-3">
				<Button asChild>
					<Link href="/login">Sign In</Link>
				</Button>
				<Button variant="outline" asChild>
					<Link href="/register">Register</Link>
				</Button>
			</div>
		</main>
	);
}

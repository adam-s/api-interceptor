import MultiplierPanel from './multiplier-panel';

export default function DashboardPage() {
	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="text-2xl font-bold">Dashboard</h1>
				<p className="mt-2 text-muted-foreground">
					WebSocket streaming + Python bridge integration.
				</p>
			</div>
			<MultiplierPanel />
		</div>
	);
}

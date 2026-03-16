import { cookies } from 'next/headers';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
	const cookieStore = await cookies();
	const defaultOpen = cookieStore.get('sidebar_state')?.value !== 'false';

	return (
		<SidebarProvider defaultOpen={defaultOpen}>
			<AppSidebar />
			<SidebarInset className="flex flex-col h-screen overflow-hidden">
				<header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<Separator orientation="vertical" className="h-4" />
					<span className="font-semibold">Interceptor</span>
				</header>
				<main className="flex-1 min-h-0 flex flex-col overflow-auto p-4 md:p-6">{children}</main>
			</SidebarInset>
		</SidebarProvider>
	);
}

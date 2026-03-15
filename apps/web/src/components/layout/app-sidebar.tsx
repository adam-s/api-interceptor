'use client';

import { TrendingUp } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from '@/components/ui/sidebar';
import { NavMain } from './nav-main';
import { NavUser } from './nav-user';

export function AppSidebar() {
	const { data: session } = useSession();

	const user = session?.user
		? { name: session.user.name ?? null, email: session.user.email ?? '' }
		: null;

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<a href="/dashboard">
								<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
									<TrendingUp className="size-4" />
								</div>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">Deep Research</span>
									<span className="truncate text-xs">Pattern Discovery</span>
								</div>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={user} onSignOut={() => signOut({ callbackUrl: '/login' })} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}

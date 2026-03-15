'use client';

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Link from 'next/link';
import { useActionState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { login } from '@/lib/actions/auth';
import { type LoginInput, loginSchema } from '@/lib/validations/auth';

export function LoginForm() {
	const [state, formAction, isPending] = useActionState(login, null);

	const {
		register,
		formState: { errors },
	} = useForm<LoginInput>({
		resolver: standardSchemaResolver(loginSchema),
	});

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Sign In</CardTitle>
				<CardDescription>Enter your credentials to access the dashboard.</CardDescription>
			</CardHeader>
			<form action={formAction} className="flex flex-col gap-6">
				<CardContent className="flex flex-col gap-4">
					{state?.error && <p className="text-sm text-destructive">{state.error}</p>}
					<div className="flex flex-col gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="you@example.com"
							autoComplete="email"
							{...register('email')}
						/>
						{errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							{...register('password')}
						/>
						{errors.password && (
							<p className="text-sm text-destructive">{errors.password.message}</p>
						)}
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-3">
					<Button type="submit" className="w-full" disabled={isPending}>
						{isPending ? 'Signing in...' : 'Sign In'}
					</Button>
					<p className="text-sm text-muted-foreground">
						Don&apos;t have an account?{' '}
						<Link href="/register" className="text-primary underline">
							Register
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}

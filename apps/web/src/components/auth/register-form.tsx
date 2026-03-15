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
import { register as registerAction } from '@/lib/actions/auth';
import { type RegisterInput, registerSchema } from '@/lib/validations/auth';

export function RegisterForm() {
	const [state, formAction, isPending] = useActionState(registerAction, null);

	const {
		register,
		formState: { errors },
	} = useForm<RegisterInput>({
		resolver: standardSchemaResolver(registerSchema),
	});

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Create Account</CardTitle>
				<CardDescription>Register to start exploring patterns.</CardDescription>
			</CardHeader>
			<form action={formAction} className="flex flex-col gap-6">
				<CardContent className="flex flex-col gap-4">
					{state?.error && <p className="text-sm text-destructive">{state.error}</p>}
					<div className="flex flex-col gap-2">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							type="text"
							placeholder="Your name"
							autoComplete="name"
							{...register('name')}
						/>
						{errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
					</div>
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
							autoComplete="new-password"
							{...register('password')}
						/>
						{errors.password && (
							<p className="text-sm text-destructive">{errors.password.message}</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="confirmPassword">Confirm Password</Label>
						<Input
							id="confirmPassword"
							type="password"
							autoComplete="new-password"
							{...register('confirmPassword')}
						/>
						{errors.confirmPassword && (
							<p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
						)}
					</div>
				</CardContent>
				<CardFooter className="flex flex-col gap-3">
					<Button type="submit" className="w-full" disabled={isPending}>
						{isPending ? 'Creating account...' : 'Create Account'}
					</Button>
					<p className="text-sm text-muted-foreground">
						Already have an account?{' '}
						<Link href="/login" className="text-primary underline">
							Sign in
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}

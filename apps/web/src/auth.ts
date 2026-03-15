import { db, eq } from '@interceptor/db';
import { users } from '@interceptor/db/schema';
import { compare } from 'bcryptjs';
import type { NextAuthResult } from 'next-auth';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

const nextAuth = NextAuth({
	trustHost: true,
	pages: {
		signIn: '/login',
	},
	session: {
		strategy: 'jwt',
	},
	providers: [
		Credentials({
			credentials: {
				email: {},
				password: {},
			},
			async authorize(credentials) {
				const email = credentials.email as string;
				const password = credentials.password as string;

				if (!email || !password) return null;

				const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

				if (!user) return null;

				const valid = await compare(password, user.passwordHash);
				if (!valid) return null;

				return {
					id: user.id,
					email: user.email,
					name: user.name,
					role: user.role,
				};
			},
		}),
	],
	callbacks: {
		jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.role = (user as { role?: string }).role;
			}
			return token;
		},
		session({ session, token }) {
			if (session.user) {
				session.user.id = token.id as string;
				(session.user as { role?: string }).role = token.role as string;
			}
			return session;
		},
	},
});

// Explicit typed exports to avoid TS2742 in pnpm monorepos
export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;

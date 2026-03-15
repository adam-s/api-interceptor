"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { db, eq } from "@volat/db";
import { users } from "@volat/db/schema";
import { signIn } from "@/auth";
import { loginSchema, registerSchema } from "@/lib/validations/auth";

export async function login(_prevState: unknown, formData: FormData) {
	const raw = {
		email: formData.get("email") as string,
		password: formData.get("password") as string,
	};

	const parsed = loginSchema.safeParse(raw);
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	try {
		await signIn("credentials", {
			email: parsed.data.email,
			password: parsed.data.password,
			redirectTo: "/dashboard",
		});
	} catch (error) {
		// AuthError = invalid credentials. Re-throw everything else (including NEXT_REDIRECT).
		if (error instanceof AuthError) {
			return { error: "Invalid email or password" };
		}
		throw error;
	}
}

export async function register(_prevState: unknown, formData: FormData) {
	const raw = {
		name: formData.get("name") as string,
		email: formData.get("email") as string,
		password: formData.get("password") as string,
		confirmPassword: formData.get("confirmPassword") as string,
	};

	const parsed = registerSchema.safeParse(raw);
	if (!parsed.success) {
		return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
	}

	const existing = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, parsed.data.email))
		.limit(1);

	if (existing.length > 0) {
		return { error: "An account with this email already exists" };
	}

	const passwordHash = await hash(parsed.data.password, 12);

	await db.insert(users).values({
		email: parsed.data.email,
		passwordHash,
		name: parsed.data.name,
	});

	try {
		await signIn("credentials", {
			email: parsed.data.email,
			password: parsed.data.password,
			redirectTo: "/dashboard",
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return { error: "Registration failed" };
		}
		throw error;
	}
}

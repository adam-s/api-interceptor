/**
 * Browser Profile Manager
 *
 * Manages persistent browser profiles for the remote browser service.
 * Profiles store cookies, localStorage, and other auth-related state.
 * Cache, history, and other large data are cleaned on stop to keep profiles lean.
 *
 * Storage location is configurable via BROWSER_PROFILES_DIR env var:
 * - Docker: /data/browser-profiles (mounted volume)
 * - Local dev: ./data/browser-profiles (gitignored)
 *
 * @module browser/remote/profiles
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Profile metadata returned by list operations */
export interface ProfileInfo {
	/** Profile name (lowercase alphanumeric + hyphens) */
	name: string;
	/** Total size in bytes */
	sizeBytes: number;
	/** Human-readable size */
	sizeHuman: string;
	/** Last modified timestamp */
	lastModified: Date;
}

/** Validation result for profile names */
export interface ValidationResult {
	valid: boolean;
	error?: string;
}

// Profile name constraints
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED_NAMES = new Set(['default', 'temp', 'test', 'admin', 'system']);

// Directories to clean (cache, history, etc.) - keeps cookies/localStorage
const CLEANUP_DIRS = [
	'Cache',
	'Code Cache',
	'GPUCache',
	'Service Worker',
	'ShaderCache',
	'blob_storage',
];

// Files to clean
const CLEANUP_FILES = ['History', 'History-journal', 'Visited Links', 'Network Action Predictor'];

// Resolve monorepo root from this file's known location:
// packages/browser/src/remote/profiles.ts → 4 levels up → root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MONOREPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

/**
 * Get the profiles directory from environment or default.
 *
 * Priority:
 * 1. BROWSER_PROFILES_DIR env var (Docker, CI, custom setups)
 * 2. <monorepo-root>/data/browser-profiles/ (local dev)
 */
export function getProfilesDir(): string {
	const envDir = process.env.BROWSER_PROFILES_DIR;
	if (envDir) {
		return resolve(envDir);
	}
	return resolve(MONOREPO_ROOT, 'data', 'browser-profiles');
}

/**
 * Get the maximum number of profiles allowed.
 */
export function getMaxProfiles(): number {
	const envMax = process.env.BROWSER_MAX_PROFILES;
	if (envMax) {
		const parsed = parseInt(envMax, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return 10; // Default
}

/**
 * Ensure the profiles directory exists.
 */
export function ensureProfilesDir(): void {
	const dir = getProfilesDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
		console.log(`[Profiles] Created profiles directory: ${dir}`);
	}
}

/**
 * Validate a profile name.
 */
export function validateProfileName(name: string): ValidationResult {
	if (!name) {
		return { valid: false, error: 'Profile name is required' };
	}

	const normalized = name.toLowerCase().trim();

	if (normalized.length < 3) {
		return { valid: false, error: 'Profile name must be at least 3 characters' };
	}

	if (normalized.length > 32) {
		return { valid: false, error: 'Profile name must be at most 32 characters' };
	}

	if (!NAME_PATTERN.test(normalized)) {
		return {
			valid: false,
			error:
				'Profile name must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric',
		};
	}

	if (RESERVED_NAMES.has(normalized)) {
		return { valid: false, error: `'${normalized}' is a reserved name` };
	}

	return { valid: true };
}

/**
 * Format bytes to human-readable size.
 */
function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Calculate directory size recursively.
 */
function getDirSize(dir: string): number {
	if (!existsSync(dir)) return 0;

	let size = 0;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				size += getDirSize(path);
			} else if (entry.isFile()) {
				try {
					size += statSync(path).size;
				} catch {
					// Skip files we can't stat
				}
			}
		}
	} catch {
		// Skip directories we can't read
	}
	return size;
}

/**
 * List all profiles with metadata.
 */
export function listProfiles(): ProfileInfo[] {
	ensureProfilesDir();
	const dir = getProfilesDir();

	const profiles: ProfileInfo[] = [];

	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const profilePath = join(dir, entry.name);
				const stat = statSync(profilePath);
				const sizeBytes = getDirSize(profilePath);

				profiles.push({
					name: entry.name,
					sizeBytes,
					sizeHuman: formatBytes(sizeBytes),
					lastModified: stat.mtime,
				});
			}
		}
	} catch (err) {
		console.error('[Profiles] Error listing profiles:', err);
	}

	// Sort by last modified (most recent first)
	profiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

	return profiles;
}

/**
 * Check if a profile exists.
 */
export function profileExists(name: string): boolean {
	const profilePath = join(getProfilesDir(), name.toLowerCase());
	return existsSync(profilePath);
}

/**
 * Get the filesystem path for a profile.
 * Returns null if the profile doesn't exist.
 */
export function getProfilePath(name: string): string | null {
	const validation = validateProfileName(name);
	if (!validation.valid) {
		console.error(`[Profiles] Invalid profile name: ${validation.error}`);
		return null;
	}

	const profilePath = join(getProfilesDir(), name.toLowerCase());
	if (!existsSync(profilePath)) {
		return null;
	}

	return profilePath;
}

/**
 * Create a new profile directory.
 * Returns the path on success, null on failure.
 */
export function createProfile(name: string): string | null {
	const validation = validateProfileName(name);
	if (!validation.valid) {
		console.error(`[Profiles] Cannot create profile: ${validation.error}`);
		return null;
	}

	const normalized = name.toLowerCase();

	// Check max profiles limit
	const existing = listProfiles();
	const maxProfiles = getMaxProfiles();
	if (existing.length >= maxProfiles) {
		console.error(`[Profiles] Maximum profiles limit reached (${maxProfiles})`);
		return null;
	}

	// Check if already exists
	if (profileExists(normalized)) {
		console.error(`[Profiles] Profile '${normalized}' already exists`);
		return null;
	}

	ensureProfilesDir();
	const profilePath = join(getProfilesDir(), normalized);

	try {
		mkdirSync(profilePath, { recursive: true });
		console.log(`[Profiles] Created profile: ${normalized}`);
		return profilePath;
	} catch (err) {
		console.error(`[Profiles] Failed to create profile '${normalized}':`, err);
		return null;
	}
}

/**
 * Delete a profile and all its data.
 * Returns true on success, false on failure.
 */
export function deleteProfile(name: string): boolean {
	const validation = validateProfileName(name);
	if (!validation.valid) {
		console.error(`[Profiles] Cannot delete profile: ${validation.error}`);
		return false;
	}

	const normalized = name.toLowerCase();
	const profilePath = join(getProfilesDir(), normalized);

	if (!existsSync(profilePath)) {
		console.error(`[Profiles] Profile '${normalized}' does not exist`);
		return false;
	}

	try {
		rmSync(profilePath, { recursive: true, force: true });
		console.log(`[Profiles] Deleted profile: ${normalized}`);
		return true;
	} catch (err) {
		console.error(`[Profiles] Failed to delete profile '${normalized}':`, err);
		return false;
	}
}

/**
 * Clean a profile's cache and history while preserving auth state.
 * This keeps cookies, localStorage, sessionStorage, and IndexedDB.
 * Returns true on success, false on failure.
 */
export function cleanProfile(name: string): boolean {
	const validation = validateProfileName(name);
	if (!validation.valid) {
		console.error(`[Profiles] Cannot clean profile: ${validation.error}`);
		return false;
	}

	const normalized = name.toLowerCase();
	const profilePath = join(getProfilesDir(), normalized);

	if (!existsSync(profilePath)) {
		console.error(`[Profiles] Profile '${normalized}' does not exist`);
		return false;
	}

	let cleaned = 0;

	// Clean directories
	for (const dir of CLEANUP_DIRS) {
		const dirPath = join(profilePath, dir);
		if (existsSync(dirPath)) {
			try {
				rmSync(dirPath, { recursive: true, force: true });
				cleaned++;
			} catch {
				// Ignore errors (might be locked)
			}
		}
	}

	// Clean files
	for (const file of CLEANUP_FILES) {
		const filePath = join(profilePath, file);
		if (existsSync(filePath)) {
			try {
				rmSync(filePath, { force: true });
				cleaned++;
			} catch {
				// Ignore errors
			}
		}
	}

	// Also clean Default/Cache if using Chrome profile structure
	const defaultDir = join(profilePath, 'Default');
	if (existsSync(defaultDir)) {
		for (const dir of CLEANUP_DIRS) {
			const dirPath = join(defaultDir, dir);
			if (existsSync(dirPath)) {
				try {
					rmSync(dirPath, { recursive: true, force: true });
					cleaned++;
				} catch {
					// Ignore errors
				}
			}
		}
		for (const file of CLEANUP_FILES) {
			const filePath = join(defaultDir, file);
			if (existsSync(filePath)) {
				try {
					rmSync(filePath, { force: true });
					cleaned++;
				} catch {
					// Ignore errors
				}
			}
		}
	}

	console.log(`[Profiles] Cleaned profile '${normalized}': removed ${cleaned} items`);
	return true;
}

/**
 * Get or create a profile path.
 * If the profile doesn't exist, creates it.
 * Returns the path or null on failure.
 */
export function getOrCreateProfilePath(name: string): string | null {
	const existing = getProfilePath(name);
	if (existing) {
		return existing;
	}
	return createProfile(name);
}

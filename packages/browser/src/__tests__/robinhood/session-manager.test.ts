import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RobinhoodSessionManager, type SessionEvent } from '../../robinhood/session-manager';
import type { RobinhoodHeaders } from '../../robinhood/types';

// Mock getProfilePath to prevent loading real sessions from disk
vi.mock('../../remote/profiles', () => ({
	getProfilePath: vi.fn(() => null),
}));

describe('RobinhoodSessionManager', () => {
	let manager: RobinhoodSessionManager;

	const mockHeaders: RobinhoodHeaders = {
		Authorization: 'Bearer test-token',
		'X-Hyper-Ex': 'test-hyper-ex',
		'X-Robinhood-API-Version': '1.0.0',
		'X-TimeZone-Id': 'America/New_York',
	};

	beforeEach(() => {
		// Reset singleton for each test
		RobinhoodSessionManager.resetInstance();
		manager = RobinhoodSessionManager.getInstance();
	});

	afterEach(() => {
		manager.removeAllListeners();
	});

	describe('getInstance', () => {
		it('returns the same instance (singleton)', () => {
			const instance1 = RobinhoodSessionManager.getInstance();
			const instance2 = RobinhoodSessionManager.getInstance();
			expect(instance1).toBe(instance2);
		});

		it('creates new instance after reset', () => {
			const instance1 = RobinhoodSessionManager.getInstance();
			RobinhoodSessionManager.resetInstance();
			const instance2 = RobinhoodSessionManager.getInstance();
			// They are different objects but same class
			expect(instance1).not.toBe(instance2);
		});
	});

	describe('setHeaders', () => {
		it('stores headers for a profile', () => {
			manager.setHeaders('test-profile', mockHeaders);

			const headers = manager.getHeaders('test-profile');
			expect(headers).toEqual(mockHeaders);
		});

		it('sets verified to false initially', () => {
			manager.setHeaders('test-profile', mockHeaders);

			const session = manager.getSession('test-profile');
			expect(session?.verified).toBe(false);
		});

		it('emits connected event', () => {
			const listener = vi.fn();
			manager.on('status', listener);

			manager.setHeaders('test-profile', mockHeaders);

			expect(listener).toHaveBeenCalledTimes(1);
			const event = listener.mock.calls[0][0] as SessionEvent;
			expect(event.type).toBe('connected');
			expect(event.profileName).toBe('test-profile');
			expect(event.status.status).toBe('connected');
		});

		it('preserves existing account info when updating headers', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerified('test-profile', {
				accountNumber: '12345',
				firstName: 'John',
				lastName: 'Doe',
				buyingPower: '1000.00',
			});

			// Update headers (simulating re-capture)
			const newHeaders: RobinhoodHeaders = {
				...mockHeaders,
				Authorization: 'Bearer new-token',
			};
			manager.setHeaders('test-profile', newHeaders);

			const session = manager.getSession('test-profile');
			// Headers updated but account info preserved
			expect(session?.headers?.Authorization).toBe('Bearer new-token');
			expect(session?.firstName).toBe('John');
			expect(session?.lastName).toBe('Doe');
			// Verified should be false after header update
			expect(session?.verified).toBe(false);
		});
	});

	describe('markVerified', () => {
		it('updates session with account details', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerified('test-profile', {
				accountNumber: '12345678',
				firstName: 'Jane',
				lastName: 'Smith',
				buyingPower: '5000.00',
			});

			const session = manager.getSession('test-profile');
			expect(session?.verified).toBe(true);
			expect(session?.accountNumber).toBe('12345678');
			expect(session?.firstName).toBe('Jane');
			expect(session?.lastName).toBe('Smith');
			expect(session?.buyingPower).toBe('5000.00');
		});

		it('clears any previous verification error', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerificationFailed('test-profile', 'Network error');

			manager.markVerified('test-profile', {
				accountNumber: '12345678',
			});

			const session = manager.getSession('test-profile');
			expect(session?.verificationError).toBeUndefined();
		});

		it('emits verified event', () => {
			manager.setHeaders('test-profile', mockHeaders);

			const listener = vi.fn();
			manager.on('status', listener);

			manager.markVerified('test-profile', { accountNumber: '12345' });

			expect(listener).toHaveBeenCalledTimes(1);
			const event = listener.mock.calls[0][0] as SessionEvent;
			expect(event.type).toBe('verified');
		});

		it('does nothing for non-existent profile', () => {
			const listener = vi.fn();
			manager.on('status', listener);

			manager.markVerified('non-existent', { accountNumber: '12345' });

			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('markVerificationFailed', () => {
		it('stores error and sets verified to false', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerificationFailed('test-profile', 'Invalid credentials');

			const session = manager.getSession('test-profile');
			expect(session?.verified).toBe(false);
			expect(session?.verificationError).toBe('Invalid credentials');
		});

		it('emits verification_failed event', () => {
			manager.setHeaders('test-profile', mockHeaders);

			const listener = vi.fn();
			manager.on('status', listener);

			manager.markVerificationFailed('test-profile', 'API error');

			expect(listener).toHaveBeenCalledTimes(1);
			const event = listener.mock.calls[0][0] as SessionEvent;
			expect(event.type).toBe('verification_failed');
		});
	});

	describe('getStatus', () => {
		it('returns disconnected for unknown profile', () => {
			const status = manager.getStatus('unknown-profile');
			expect(status.status).toBe('disconnected');
			expect(status.profileName).toBe('unknown-profile');
		});

		it('returns connected status with all details', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerified('test-profile', {
				accountNumber: '12345',
				firstName: 'Test',
				lastName: 'User',
				buyingPower: '999.99',
			});

			const status = manager.getStatus('test-profile');
			expect(status.status).toBe('connected');
			if (status.status === 'connected') {
				expect(status.verified).toBe(true);
				expect(status.accountNumber).toBe('12345');
				expect(status.firstName).toBe('Test');
				expect(status.lastName).toBe('User');
				expect(status.buyingPower).toBe('999.99');
				expect(status.connectedAt).toBeGreaterThan(0);
			}
		});
	});

	describe('hasValidSession', () => {
		it('returns false for unknown profile', () => {
			expect(manager.hasValidSession('unknown')).toBe(false);
		});

		it('returns true for profile with valid headers', () => {
			manager.setHeaders('test-profile', mockHeaders);
			expect(manager.hasValidSession('test-profile')).toBe(true);
		});
	});

	describe('clearSession', () => {
		it('removes unverified session data', () => {
			manager.setHeaders('test-profile', mockHeaders);
			expect(manager.hasValidSession('test-profile')).toBe(true);

			const result = manager.clearSession('test-profile');

			expect(result).toBe(true);
			expect(manager.hasValidSession('test-profile')).toBe(false);
			expect(manager.getHeaders('test-profile')).toBeNull();
			expect(manager.getSession('test-profile')).toBeNull();
		});

		it('blocks clearing verified session without force flag', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerified('test-profile', {
				accountNumber: '12345678',
				firstName: 'Test',
				lastName: 'User',
			});
			expect(manager.getSession('test-profile')?.verified).toBe(true);

			const result = manager.clearSession('test-profile');

			expect(result).toBe(false);
			expect(manager.hasValidSession('test-profile')).toBe(true);
		});

		it('clears verified session with force flag', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.markVerified('test-profile', {
				accountNumber: '12345678',
				firstName: 'Test',
				lastName: 'User',
			});

			const result = manager.clearSession('test-profile', { force: true });

			expect(result).toBe(true);
			expect(manager.hasValidSession('test-profile')).toBe(false);
		});

		it('emits disconnected event', () => {
			manager.setHeaders('test-profile', mockHeaders);

			const listener = vi.fn();
			manager.on('status', listener);

			manager.clearSession('test-profile');

			expect(listener).toHaveBeenCalledTimes(1);
			const event = listener.mock.calls[0][0] as SessionEvent;
			expect(event.type).toBe('disconnected');
		});
	});

	describe('listSessions', () => {
		it('returns empty array when no sessions', () => {
			expect(manager.listSessions()).toEqual([]);
		});

		it('returns all profile names with sessions', () => {
			manager.setHeaders('profile-1', mockHeaders);
			manager.setHeaders('profile-2', mockHeaders);
			manager.setHeaders('profile-3', mockHeaders);

			const sessions = manager.listSessions();
			expect(sessions).toHaveLength(3);
			expect(sessions).toContain('profile-1');
			expect(sessions).toContain('profile-2');
			expect(sessions).toContain('profile-3');
		});
	});

	describe('setAccountNumber', () => {
		it('updates account number for existing session', () => {
			manager.setHeaders('test-profile', mockHeaders);
			manager.setAccountNumber('test-profile', '99999999');

			const session = manager.getSession('test-profile');
			expect(session?.accountNumber).toBe('99999999');
		});

		it('does nothing for non-existent session', () => {
			manager.setAccountNumber('non-existent', '12345');
			expect(manager.getSession('non-existent')).toBeNull();
		});
	});

	describe('event handling', () => {
		it('allows multiple listeners', () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			manager.on('status', listener1);
			manager.on('status', listener2);

			manager.setHeaders('test-profile', mockHeaders);

			expect(listener1).toHaveBeenCalledTimes(1);
			expect(listener2).toHaveBeenCalledTimes(1);
		});

		it('can remove specific listener', () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			manager.on('status', listener1);
			manager.on('status', listener2);
			manager.off('status', listener1);

			manager.setHeaders('test-profile', mockHeaders);

			expect(listener1).not.toHaveBeenCalled();
			expect(listener2).toHaveBeenCalledTimes(1);
		});
	});
});

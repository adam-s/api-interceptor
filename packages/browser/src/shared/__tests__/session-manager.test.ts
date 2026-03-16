/**
 * Unit tests for GenericSessionManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GenericSessionManager } from '../session-manager';

describe('GenericSessionManager', () => {
	afterEach(() => {
		GenericSessionManager.resetInstances();
	});

	it('should create singleton per domain', () => {
		const manager1 = GenericSessionManager.getInstance('robinhood');
		const manager2 = GenericSessionManager.getInstance('robinhood');

		expect(manager1).toBe(manager2);
	});

	it('should create separate instances for different domains', () => {
		const robinhoodMgr = GenericSessionManager.getInstance('robinhood');
		const linkedinMgr = GenericSessionManager.getInstance('linkedin');

		expect(robinhoodMgr).not.toBe(linkedinMgr);
	});

	it('should support event listeners', () => {
		const manager = GenericSessionManager.getInstance('test-domain');
		const listener = vi.fn();

		manager.on('status', listener);

		// Manager extends EventEmitter and can register listeners
		expect(manager.listenerCount('status')).toBeGreaterThan(0);
	});

	it('should reset all instances', () => {
		const manager1 = GenericSessionManager.getInstance('robinhood');
		GenericSessionManager.resetInstances();
		const manager2 = GenericSessionManager.getInstance('robinhood');

		expect(manager1).not.toBe(manager2);
	});
});

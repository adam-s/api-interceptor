/**
 * Unit tests for GenericSessionManager
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenericSessionManager } from '../session-manager';

describe('GenericSessionManager', () => {
	afterEach(() => {
		GenericSessionManager.resetInstances();
	});

	it('should create singleton per domain', () => {
		const manager1 = GenericSessionManager.getInstance('boardshop');
		const manager2 = GenericSessionManager.getInstance('boardshop');

		expect(manager1).toBe(manager2);
	});

	it('should create separate instances for different domains', () => {
		const boardshopMgr = GenericSessionManager.getInstance('boardshop');
		const deckmarketMgr = GenericSessionManager.getInstance('deckmarket');

		expect(boardshopMgr).not.toBe(deckmarketMgr);
	});

	it('should support event listeners', () => {
		const manager = GenericSessionManager.getInstance('test-domain');
		const listener = vi.fn();

		manager.on('status', listener);

		// Manager extends EventEmitter and can register listeners
		expect(manager.listenerCount('status')).toBeGreaterThan(0);
	});

	it('should reset all instances', () => {
		const manager1 = GenericSessionManager.getInstance('boardshop');
		GenericSessionManager.resetInstances();
		const manager2 = GenericSessionManager.getInstance('boardshop');

		expect(manager1).not.toBe(manager2);
	});
});

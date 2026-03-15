import type { WSContext } from 'hono/ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_getClients,
	_reset,
	addClient,
	getState,
	removeClient,
	setMultiplier,
	setRunning,
} from './state';

function mockWs() {
	return {
		send: vi.fn(),
		close: vi.fn(),
		readyState: 1,
	} as unknown as WSContext;
}

describe('state', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		_reset();
	});

	afterEach(() => {
		_reset();
		vi.useRealTimers();
	});

	it('has correct initial state', () => {
		const s = getState();
		expect(s.multiplier).toBe(1);
		expect(s.count).toBe(0);
		expect(s.running).toBe(true);
		expect(s.connections).toBe(0);
	});

	it('setMultiplier updates the value', () => {
		setMultiplier(2.5);
		expect(getState().multiplier).toBe(2.5);
	});

	it('setMultiplier clamps to range [-10, 10]', () => {
		setMultiplier(99);
		expect(getState().multiplier).toBe(10);
		setMultiplier(-99);
		expect(getState().multiplier).toBe(-10);
	});

	it('increment and decrement via setMultiplier', () => {
		setMultiplier(getState().multiplier + 1);
		expect(getState().multiplier).toBe(2);
		setMultiplier(getState().multiplier - 1);
		expect(getState().multiplier).toBe(1);
	});

	it('broadcasts to connected clients on state change', () => {
		const ws = mockWs();
		addClient(ws);
		// addClient sends initial state — clear that call
		(ws.send as ReturnType<typeof vi.fn>).mockClear();

		setMultiplier(5);
		expect(ws.send).toHaveBeenCalledTimes(1);

		const message = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
		expect(message.type).toBe('state');
		expect(message.data.multiplier).toBe(5);
	});

	it("does not broadcast when value hasn't changed (dedup)", () => {
		const ws = mockWs();
		addClient(ws);
		(ws.send as ReturnType<typeof vi.fn>).mockClear();

		setMultiplier(3);
		const callsAfterFirst = (ws.send as ReturnType<typeof vi.fn>).mock.calls.length;

		// Setting same value again — should not broadcast
		setMultiplier(3);
		expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
	});

	it('tracks client connections', () => {
		const ws1 = mockWs();
		const ws2 = mockWs();
		const ws3 = mockWs();

		const c1 = addClient(ws1);
		addClient(ws2);
		addClient(ws3);
		expect(getState().connections).toBe(3);

		removeClient(c1);
		expect(getState().connections).toBe(2);
	});

	it('removes client on add and remove', () => {
		const ws = mockWs();
		const client = addClient(ws);
		expect(_getClients().size).toBe(1);

		removeClient(client);
		expect(_getClients().size).toBe(0);
	});

	it('tick increments count by multiplier', () => {
		const ws = mockWs();
		addClient(ws); // starts tick since running=true

		expect(getState().count).toBe(0);
		vi.advanceTimersByTime(1000);
		expect(getState().count).toBe(1);
		vi.advanceTimersByTime(1000);
		expect(getState().count).toBe(2);
	});

	it('tick respects multiplier value', () => {
		const ws = mockWs();
		addClient(ws);
		setMultiplier(3);

		vi.advanceTimersByTime(1000);
		expect(getState().count).toBe(3);
		vi.advanceTimersByTime(1000);
		expect(getState().count).toBe(6);
	});

	it('pause stops ticking', () => {
		const ws = mockWs();
		addClient(ws);

		vi.advanceTimersByTime(2000);
		const countBefore = getState().count;
		expect(countBefore).toBe(2);

		setRunning(false);
		expect(getState().running).toBe(false);

		vi.advanceTimersByTime(3000);
		expect(getState().count).toBe(countBefore); // unchanged
	});

	it('play resumes ticking', () => {
		const ws = mockWs();
		addClient(ws);

		setRunning(false);
		vi.advanceTimersByTime(2000);
		expect(getState().count).toBe(0); // no ticks while paused

		setRunning(true);
		vi.advanceTimersByTime(2000);
		expect(getState().count).toBe(2); // ticking again
	});
});

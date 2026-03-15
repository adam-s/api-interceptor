/** Configuration for PythonBridge */
export interface PythonBridgeConfig {
	/** Path to the Python worker script */
	workerPath: string;
	/** Python executable (default: 'python3') */
	pythonPath?: string;
	/** Timeout per request in ms (default: 5000) */
	timeoutMs?: number;
	/** Startup timeout in ms (default: 5000) */
	startupTimeoutMs?: number;
}

/** JSON-RPC request sent to the worker */
export interface BridgeRequest {
	id: string;
	method: string;
	params: Record<string, unknown>;
}

/** JSON-RPC success response from the worker */
export interface BridgeResponse {
	id: string;
	result?: unknown;
	error?: { code: number; message: string };
}

/** Ready message sent by the worker on startup */
export interface BridgeReadyMessage {
	type: 'ready';
	methods: string[];
}

/** Error thrown by bridge operations */
export class BridgeError extends Error {
	constructor(
		message: string,
		public readonly code: number = -1,
	) {
		super(message);
		this.name = 'BridgeError';
	}
}

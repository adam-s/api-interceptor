/**
 * CDP (Chrome DevTools Protocol) event parameter types.
 *
 * These types cover the Network domain events used by our traffic capture.
 * Not exhaustive — only the fields we actually use are typed.
 *
 * @see https://chromedevtools.github.io/devtools-protocol/tot/Network/
 * @module browser/remote/cdp-types
 */

export interface CDPRequestWillBeSent {
	requestId: string;
	type?: string; // 'XHR' | 'Fetch' | 'Document' | 'Script' | 'Stylesheet' | etc.
	request: {
		url: string;
		method: string;
		headers: Record<string, string>;
		postData?: string;
	};
}

export interface CDPResponseReceived {
	requestId: string;
	response: {
		url: string;
		status: number;
		headers: Record<string, string>;
	};
}

export interface CDPLoadingFinished {
	requestId: string;
	encodedDataLength: number;
}

export interface CDPLoadingFailed {
	requestId: string;
	errorText: string;
	type: string;
}

export interface CDPWebSocketCreated {
	requestId: string;
	url: string;
}

export interface CDPWebSocketFrameReceived {
	requestId: string;
	response: {
		payloadData: string;
		opcode: number;
		mask: boolean;
	};
}

export interface CDPWebSocketClosed {
	requestId: string;
}

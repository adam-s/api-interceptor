/**
 * Encoded response transports — base64, msgpack wrappers.
 */

import { encode as msgpackEncode } from '@msgpack/msgpack';

/** Wrap JSON payload in base64 encoding */
export function encodeBase64(data: unknown): Buffer {
	return Buffer.from(JSON.stringify(data), 'utf-8');
}

/** Wrap data in msgpack encoding */
export function encodeMsgpack(data: unknown): Uint8Array {
	return msgpackEncode(data);
}

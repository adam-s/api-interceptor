import { decode as msgpackDecode } from '@msgpack/msgpack';
import protobufjs from 'protobufjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestServer, type TestServerInstance } from '../index';
import { PROTO_DEFINITION } from '../transports/protobuf';

let server: TestServerInstance;
let baseUrl: string;

beforeAll(async () => {
	server = await createTestServer({ port: 0 });
	baseUrl = `${server.url}/sites/databoard`;
});

afterAll(async () => {
	await server.close();
});

async function getToken(): Promise<string> {
	const res = await fetch(`${baseUrl}/api/auth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ clientId: 'test' }),
	});
	const data = await res.json();
	return data.access_token;
}

describe('databoard site', () => {
	test('Bearer token from auth endpoint required for data', async () => {
		// Without token → 401
		const res1 = await fetch(`${baseUrl}/api/products`);
		expect(res1.status).toBe(401);

		// Get token
		const token = await getToken();
		expect(token).toBeTruthy();

		// With token → 200
		const res2 = await fetch(`${baseUrl}/api/products`, {
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(res2.status).toBe(200);
	});

	test('base64 response decodes to valid JSON', async () => {
		const token = await getToken();
		const res = await fetch(`${baseUrl}/api/products`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.headers.get('x-encoding')).toBe('base64');
		const b64 = await res.text();
		const decoded = JSON.parse(Buffer.from(b64, 'base64').toString());

		expect(decoded.items.length).toBeGreaterThan(0);
		expect(decoded.items[0].sku).toBeTruthy();
		expect(decoded.totalCount).toBeGreaterThan(0);
	});

	test('protobuf response matches served schema', async () => {
		// Get schema
		const schemaRes = await fetch(`${baseUrl}/api/schema.proto`);
		const schema = await schemaRes.text();
		expect(schema).toContain('message Product');
		expect(schema).toContain('message ProductList');

		// Get protobuf data
		const token = await getToken();
		const res = await fetch(`${baseUrl}/api/inventory`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.headers.get('content-type')).toBe('application/x-protobuf');
		const buf = Buffer.from(await res.arrayBuffer());

		// Decode with schema
		const root = protobufjs.parse(PROTO_DEFINITION).root;
		const ProductList = root.lookupType('boardshop.ProductList');
		const decoded = ProductList.decode(buf);
		const obj = ProductList.toObject(decoded);

		expect(obj.products.length).toBeGreaterThan(0);
		expect(obj.products[0].sku).toBeTruthy();
		expect(obj.totalCount).toBeGreaterThan(0);
	});

	test('gRPC-Web returns valid framed protobuf', async () => {
		const token = await getToken();
		const res = await fetch(`${baseUrl}/grpc/BoardService/ListProducts`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.headers.get('content-type')).toBe('application/grpc-web+proto');
		const buf = Buffer.from(await res.arrayBuffer());

		// Parse gRPC-Web frame: 1 byte flag + 4 bytes length + payload
		expect(buf[0]).toBe(0x00); // data frame flag
		const len = buf.readUInt32BE(1);
		expect(len).toBeGreaterThan(0);

		// Decode protobuf payload
		const payload = buf.subarray(5, 5 + len);
		const root = protobufjs.parse(PROTO_DEFINITION).root;
		const ProductList = root.lookupType('boardshop.ProductList');
		const decoded = ProductList.decode(payload);
		const obj = ProductList.toObject(decoded);

		expect(obj.products.length).toBeGreaterThan(0);

		// Verify trailer frame exists
		const trailerStart = 5 + len;
		expect(buf[trailerStart]).toBe(0x80); // trailer flag
	});

	test('msgpack response decodes to valid data', async () => {
		const token = await getToken();
		const res = await fetch(`${baseUrl}/api/stats`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		expect(res.headers.get('content-type')).toBe('application/x-msgpack');
		const buf = new Uint8Array(await res.arrayBuffer());
		const decoded = msgpackDecode(buf) as Record<string, unknown>;

		expect(decoded.totalProducts).toBeGreaterThan(0);
		expect(decoded.categories).toBeTruthy();
		expect(decoded.avgPrice).toBeGreaterThan(0);
		expect(decoded.topBrands).toBeTruthy();
	});

	test('GraphQL with inline query returns products', async () => {
		const res = await fetch(`${baseUrl}/graphql`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				operationName: 'SearchProducts',
				query:
					'query SearchProducts($limit: Int) { searchProducts(limit: $limit) { items { sku name price } totalCount } }',
				variables: { limit: 5 },
			}),
		});

		const data = await res.json();
		expect(data.data.searchProducts.items.length).toBe(5);
		expect(data.data.searchProducts.items[0].sku).toBeTruthy();
	});
});

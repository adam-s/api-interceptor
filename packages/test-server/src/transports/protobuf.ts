/**
 * Protobuf encoding utilities for WebSocket and gRPC transports.
 */

import protobufjs from 'protobufjs';

export const PROTO_DEFINITION = `
syntax = "proto3";
package boardshop;

message PriceUpdate {
  string sku = 1;
  float price = 2;
  int64 timestamp = 3;
  string currency = 4;
  int32 volume = 5;
  float change = 6;
  float change_percent = 7;
}

message Product {
  string sku = 1;
  string name = 2;
  string category = 3;
  float price = 4;
  string currency = 5;
  int32 stock = 6;
  string brand = 7;
  float rating = 8;
  int32 review_count = 9;
}

message ProductList {
  repeated Product products = 1;
  int32 total_count = 2;
}
`;

let root: protobufjs.Root | null = null;

function getRoot(): protobufjs.Root {
	if (!root) {
		root = protobufjs.parse(PROTO_DEFINITION).root;
	}
	return root;
}

export function encodePriceUpdate(data: {
	sku: string;
	price: number;
	timestamp: number;
	currency?: string;
	volume?: number;
	change?: number;
	changePercent?: number;
}): Uint8Array {
	const r = getRoot();
	const Type = r.lookupType('boardshop.PriceUpdate');
	const msg = Type.create({
		sku: data.sku,
		price: data.price,
		timestamp: data.timestamp,
		currency: data.currency ?? 'USD',
		volume: data.volume ?? 0,
		change: data.change ?? 0,
		changePercent: data.changePercent ?? 0,
	});
	return Type.encode(msg).finish();
}

export function encodeProductList(
	products: Array<{
		sku: string;
		name: string;
		category: string;
		price: number;
		currency: string;
		stock: number;
		brand: string;
		rating: number;
		reviewCount: number;
	}>,
	totalCount: number,
): Uint8Array {
	const r = getRoot();
	const Type = r.lookupType('boardshop.ProductList');
	const msg = Type.create({
		products: products.map((p) => ({
			sku: p.sku,
			name: p.name,
			category: p.category,
			price: p.price,
			currency: p.currency,
			stock: p.stock,
			brand: p.brand,
			rating: p.rating,
			reviewCount: p.reviewCount,
		})),
		totalCount,
	});
	return Type.encode(msg).finish();
}

/** Wrap protobuf in gRPC-Web frame format */
export function grpcWebFrame(data: Uint8Array): Buffer {
	// Data frame: flag=0x00 + 4-byte big-endian length + payload
	const dataFrame = Buffer.alloc(5 + data.length);
	dataFrame[0] = 0x00;
	dataFrame.writeUInt32BE(data.length, 1);
	Buffer.from(data).copy(dataFrame, 5);

	// Trailer frame: flag=0x80 + trailers
	const trailers = 'grpc-status:0\r\ngrpc-message:OK\r\n';
	const trailerBuf = Buffer.from(trailers);
	const trailerFrame = Buffer.alloc(5 + trailerBuf.length);
	trailerFrame[0] = 0x80;
	trailerFrame.writeUInt32BE(trailerBuf.length, 1);
	trailerBuf.copy(trailerFrame, 5);

	return Buffer.concat([dataFrame, trailerFrame]);
}

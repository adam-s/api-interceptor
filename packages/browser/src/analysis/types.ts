/** Output of the Discovery Analyzer — structured summary of page + traffic */
export interface DiscoveryAnalysis {
	pageUrl: string;
	framework: { name: string | null; evidence: string };
	embeddedData: EmbeddedDataEntry[];
	tokens: TokenEntry[];
	apiEndpoints: ApiEndpointEntry[];
	websocketUrls: string[];
	graphqlOperations: GraphqlOpEntry[];
	skipped: SkippedCounts;
	analyzedAt: string;
	durationMs: number;
}

export interface EmbeddedDataEntry {
	selector: string;
	id: string | null;
	type: string | null;
	sizeBytes: number;
	preview: string;
	dataUrl?: string;
}

export interface TokenEntry {
	name: string;
	value: string;
	source:
		| 'hidden-input'
		| 'meta-tag'
		| 'data-attribute'
		| 'inline-script'
		| 'cookie'
		| 'embedded-json';
	selector: string;
}

export interface ApiEndpointEntry {
	method: string;
	url: string;
	pattern: string;
	status: number;
	contentType: string;
	bodySize: number;
	transport: string;
	evidence: string;
}

export interface GraphqlOpEntry {
	operationName: string | null;
	type: 'query' | 'mutation' | 'subscription' | 'unknown';
	endpoint: string;
}

export interface SkippedCounts {
	jsChunks: number;
	cssFiles: number;
	images: number;
	tracking: number;
	fonts: number;
	other: number;
}

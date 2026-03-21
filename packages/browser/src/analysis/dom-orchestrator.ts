/**
 * DOM Analysis Orchestrator
 *
 * Combines DOM-side analysis (via page.evaluate) with traffic classification
 * to produce a unified discovery result. This is the "Approach B" analyzer
 * that uses zero new dependencies — just page.evaluate() and the existing
 * transport classifier.
 *
 * Usage:
 *   const result = await analyzePage(page, trafficEntries);
 *
 * @module browser/analysis/dom-orchestrator
 */

import type { Page } from 'patchright';
import {
	classifyEntry,
	classifyPage,
	type PageClassification,
	type TrafficClassification,
	type TrafficEntry,
} from '../shared/classify-transport.js';
import { type DomAnalysisResult, domAnalyzerFn } from './dom-analyzer.js';

/**
 * Merged analysis result combining DOM analysis + traffic classification.
 */
export interface DiscoveryAnalysis {
	/** DOM-side analysis results from page.evaluate() */
	dom: DomAnalysisResult;

	/** Traffic classification (per-entry + page-level summary) */
	traffic: {
		/** Individual entry classifications */
		entries: TrafficClassification[];
		/** Page-level summary */
		page: PageClassification;
		/** Raw traffic entry count fed to classifier */
		rawEntryCount: number;
	};

	/** Merged insights derived from both sources */
	summary: {
		/** All detected transport types */
		transports: string[];
		/** True if page uses multiple transport types */
		isHybrid: boolean;
		/** Number of embedded JSON blobs found in DOM */
		embeddedJsonCount: number;
		/** Number of tokens found in DOM */
		tokenCount: number;
		/** Number of WebSocket URLs found in inline scripts */
		websocketUrlCount: number;
		/** Whether DOM has data-bearing custom elements */
		hasDataElements: boolean;
		/** Frameworks detected */
		frameworks: string[];
		/** Combined warnings from traffic classification + DOM analysis */
		warnings: string[];
	};

	/** Timestamp of when this analysis was performed */
	analyzedAt: string;
}

/**
 * Run the full discovery analysis pipeline.
 *
 * 1. Executes `domAnalyzerFn` inside the browser via page.evaluate()
 * 2. Classifies traffic entries using the existing transport classifier
 * 3. Merges DOM analysis + traffic classification into one result
 *
 * @param page - Patchright page instance (must be navigated to target)
 * @param trafficEntries - Raw traffic entries from the capture buffer
 */
export async function analyzePage(
	page: Page,
	trafficEntries: TrafficEntry[],
): Promise<DiscoveryAnalysis> {
	// Step 1: DOM analysis via page.evaluate()
	const dom = await page.evaluate(domAnalyzerFn);

	// Step 2: Traffic classification
	const entryClassifications = trafficEntries.map(classifyEntry);
	const pageClassification = classifyPage(trafficEntries);

	// Step 3: Merge results
	const warnings = [...pageClassification.warnings];

	// Add DOM-informed warnings
	if (dom.websocketUrls.length > 0 && !pageClassification.transports.includes('WEBSOCKET')) {
		warnings.push(
			`DOM contains ${dom.websocketUrls.length} WebSocket URL(s) in inline scripts, ` +
				'but no WebSocket traffic was captured. CDP does not capture WS frames — ' +
				'connect directly to these endpoints to capture data.',
		);
	}

	if (
		dom.embeddedJson.length > 0 &&
		!pageClassification.hasDataTraffic &&
		pageClassification.transports.length === 0
	) {
		warnings.push(
			`Page has ${dom.embeddedJson.length} embedded JSON blob(s) but zero classified traffic. ` +
				'Data is likely served via SSR with embedded JSON (transport type e2). ' +
				'Check the embeddedJson previews for the data you need.',
		);
	}

	// Build transport list combining traffic + DOM hints
	const transports = new Set(pageClassification.transports.map(String));
	if (dom.embeddedJson.length > 0) {
		transports.add('EMBEDDED_JSON');
	}
	if (dom.websocketUrls.length > 0) {
		transports.add('WEBSOCKET_HINT');
	}

	const hasDataElements =
		dom.dataElements.dataField.length > 0 ||
		dom.dataElements.dataTestid.length > 0 ||
		dom.dataElements.dataValue.length > 0;

	return {
		dom,
		traffic: {
			entries: entryClassifications,
			page: pageClassification,
			rawEntryCount: trafficEntries.length,
		},
		summary: {
			transports: [...transports],
			isHybrid: pageClassification.isHybrid || transports.size > 1,
			embeddedJsonCount: dom.embeddedJson.length,
			tokenCount: dom.tokens.length,
			websocketUrlCount: dom.websocketUrls.length,
			hasDataElements,
			frameworks: dom.frameworks,
			warnings,
		},
		analyzedAt: new Date().toISOString(),
	};
}

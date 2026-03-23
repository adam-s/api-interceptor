/**
 * Schema Inferencer
 *
 * Infers Zod schemas from JSON examples.
 * Analyzes response payloads across multiple requests to build type definitions.
 *
 * @module browser/codegen/schema-inferencer
 */

/**
 * Type information inferred from examples.
 */
interface InferredType {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'unknown';
	nullable: boolean;
	itemType?: InferredType;
	properties?: Record<string, InferredType>;
}

/**
 * Infer the type of a single value.
 */
function inferType(value: unknown): InferredType {
	if (value === null || value === undefined) {
		return { type: 'null', nullable: true };
	}

	if (typeof value === 'string') {
		return { type: 'string', nullable: false };
	}

	if (typeof value === 'number') {
		return { type: 'number', nullable: false };
	}

	if (typeof value === 'boolean') {
		return { type: 'boolean', nullable: false };
	}

	if (Array.isArray(value)) {
		const itemTypes = value.map((item) => inferType(item));
		// Find all unique non-null types — if they agree, use that type; otherwise 'unknown'
		const nonNullTypes = itemTypes.filter((t) => t.type !== 'null');
		const uniqueTypes = new Set(nonNullTypes.map((t) => t.type));
		const fallback: InferredType = { type: 'unknown', nullable: true };
		const itemType: InferredType =
			uniqueTypes.size === 1 ? (nonNullTypes[0] ?? fallback) : fallback;
		return {
			type: 'array',
			nullable: false,
			itemType,
		};
	}

	if (typeof value === 'object') {
		const properties: Record<string, InferredType> = {};
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			properties[key] = inferType(val);
		}
		return {
			type: 'object',
			nullable: false,
			properties,
		};
	}

	return { type: 'unknown', nullable: false };
}

/**
 * Merge multiple inferred types to find common schema.
 * Used when analyzing multiple examples of the same endpoint.
 */
function mergeTypes(types: InferredType[]): InferredType {
	if (types.length === 0) {
		return { type: 'unknown', nullable: true };
	}

	const [_first, ..._rest] = types;

	// If any are null, mark as nullable
	const nullable = types.some((t) => t.nullable || t.type === 'null');

	// Filter out nulls for comparison
	const nonNullTypes = types.filter((t) => t.type !== 'null');
	if (nonNullTypes.length === 0) {
		return { type: 'null', nullable: true };
	}

	// All same type
	const baseType = nonNullTypes[0].type;
	if (nonNullTypes.every((t) => t.type === baseType)) {
		if (baseType === 'array') {
			const itemTypes = nonNullTypes.map((t) => t.itemType).filter(Boolean) as InferredType[];
			const mergedItemType: InferredType =
				itemTypes.length > 0 ? mergeTypes(itemTypes) : { type: 'unknown', nullable: true };
			return {
				type: 'array',
				nullable,
				itemType: mergedItemType,
			};
		}

		if (baseType === 'object') {
			const allProperties = new Map<string, InferredType[]>();
			for (const typeInfo of nonNullTypes) {
				if (typeInfo.properties) {
					for (const [key, propType] of Object.entries(typeInfo.properties)) {
						if (!allProperties.has(key)) {
							allProperties.set(key, []);
						}
						allProperties.get(key)?.push(propType);
					}
				}
			}

			const properties: Record<string, InferredType> = {};
			for (const [key, propTypes] of allProperties) {
				properties[key] = mergeTypes(propTypes);
			}

			return {
				type: 'object',
				nullable,
				properties,
			};
		}

		return {
			type: baseType,
			nullable,
		};
	}

	// Mixed types - use unknown
	return { type: 'unknown', nullable };
}

/**
 * Convert inferred type to Zod schema code string.
 */
function typeToZodCode(type: InferredType, indent = 0): string {
	const spaces = '\t'.repeat(indent);

	if (type.type === 'string') {
		return `z.string()${type.nullable ? '.optional()' : ''}`;
	}

	if (type.type === 'number') {
		return `z.number()${type.nullable ? '.optional()' : ''}`;
	}

	if (type.type === 'boolean') {
		return `z.boolean()${type.nullable ? '.optional()' : ''}`;
	}

	if (type.type === 'array' && type.itemType) {
		const itemCode = typeToZodCode(type.itemType, 0);
		return `z.array(${itemCode})${type.nullable ? '.optional()' : ''}`;
	}

	if (type.type === 'object' && type.properties) {
		const lines = ['z.object({'];
		const props = Object.entries(type.properties);
		for (const [key, propType] of props) {
			const propCode = typeToZodCode(propType, indent + 1);
			lines.push(`${spaces}\t${key}: ${propCode},`);
		}
		lines.push(`${spaces}})${type.nullable ? '.optional()' : ''}`);
		return lines.join('\n');
	}

	// Fallback
	return `z.unknown()${type.nullable ? '.optional()' : ''}`;
}

/**
 * Infer a Zod schema from JSON examples.
 *
 * Analyzes the structure across multiple examples and returns a Zod schema
 * as a code string (not executed - just the TypeScript code).
 */
export function inferSchemaFromExamples(examples: unknown[]): string {
	if (examples.length === 0) {
		return 'z.unknown()';
	}

	const types = examples.map((ex) => inferType(ex));
	const merged = mergeTypes(types);
	return typeToZodCode(merged);
}

/**
 * Infer request schema from request body examples.
 */
export function inferRequestSchema(examples: unknown[]): string {
	const nonNull = examples.filter((ex) => ex !== null && ex !== undefined);
	if (nonNull.length === 0) {
		return 'z.any()';
	}
	return inferSchemaFromExamples(nonNull);
}

/**
 * Infer response schema from response body examples.
 */
export function inferResponseSchema(examples: unknown[]): string {
	const nonNull = examples.filter((ex) => ex !== null && ex !== undefined);
	if (nonNull.length === 0) {
		return 'z.any()';
	}
	return inferSchemaFromExamples(nonNull);
}

import type {
  OpenAPISpec,
  OperationObject,
  ParsedOperation,
  ParsedTag,
  ParameterObject,
  SchemaObject,
  ReferenceObject,
  isReferenceObject,
} from '../types/openapi';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

export function parseSpec(spec: OpenAPISpec): ParsedTag[] {
  const tagMap = new Map<string, ParsedOperation[]>();

  for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OperationObject | undefined;
      if (!operation) continue;

      const tag = operation.tags?.[0] || 'default';
      const operationId = operation.operationId || generateOperationId(method, pathStr);

      const allParams: ParameterObject[] = [
        ...(pathItem.parameters || []),
        ...(operation.parameters || []),
      ] as ParameterObject[];

      const pathParams  = allParams.filter((p) => p.in === 'path');
      const queryParams = allParams.filter((p) => p.in === 'query');

      let requestBody: SchemaObject | ReferenceObject | null = null;
      if (operation.requestBody) {
        const rb = operation.requestBody as any;
        if (rb.$ref) {
          requestBody = { $ref: rb.$ref } as ReferenceObject;
        } else if (rb.content) {
          const jsonContent = rb.content['application/json'] || Object.values(rb.content)[0];
          if (jsonContent?.schema) requestBody = jsonContent.schema;
        }
      }

      let responseSchema: SchemaObject | ReferenceObject | null = null;
      if (operation.responses) {
        const sr =
          operation.responses['200'] ||
          operation.responses['201'] ||
          operation.responses['default'];
        if (sr) {
          const resp = sr as any;
          if (resp.$ref) {
            responseSchema = { $ref: resp.$ref } as ReferenceObject;
          } else if (resp.content) {
            const jsonContent = resp.content['application/json'] || Object.values(resp.content)[0];
            if (jsonContent?.schema) responseSchema = jsonContent.schema;
          }
        }
      }

      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag)!.push({
        method, path: pathStr, operationId, tag,
        summary: operation.summary,
        pathParams, queryParams, requestBody, responseSchema,
      });
    }
  }

  return Array.from(tagMap.entries()).map(([name, operations]) => ({
    name,
    slug: computeSlug(operations),
    operations,
  }));
}

// ── slug: derive from common URL path prefix ─────────────────────────────────

/**
 * Computes a clean folder slug from the common static URL prefix.
 *
 * /restricted/files/{id}          \
 * /restricted/files/presigned-url  → "restricted-files"
 *
 * /autenticacao/login              → "autenticacao"
 * /customer/tenant/{id}            → "customer-tenant"
 */
function computeSlug(operations: ParsedOperation[]): string {
  if (operations.length === 0) return 'unknown';

  // Static segments only (no {params})
  const allSegments = operations.map((op) =>
    op.path.split('/').filter((s) => s.length > 0 && !s.startsWith('{'))
  );

  if (allSegments.every((s) => s.length === 0)) return 'unknown';

  const first   = allSegments[0];
  let commonLen = first.length;

  for (const segs of allSegments.slice(1)) {
    let i = 0;
    while (i < commonLen && i < segs.length && first[i] === segs[i]) i++;
    commonLen = i;
  }

  const prefix = commonLen > 0 ? first.slice(0, commonLen) : [first[0]].filter(Boolean);
  if (prefix.length === 0) return 'default';

  return prefix.map(normalizeSegment).join('-');
}

function normalizeSegment(seg: string): string {
  return seg
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function generateOperationId(method: string, path: string): string {
  const cleaned = path
    .replace(/\{([^}]+)\}/g, 'By$1')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `${method}${capitalize(cleaned)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

import type {
  OpenAPISpec,
  OperationObject,
  ParsedOperation,
  ParsedTag,
  ParameterObject,
  SchemaObject,
  ReferenceObject,
} from '../types/openapi';
import { capitalize, extractOperationName, buildNameFromPath } from './helpers';

const HTTP_METHODS = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
] as const;

export class OpenAPIParser {
  readonly tags: ParsedTag[];

  constructor(spec: OpenAPISpec) {
    this.tags = this.parse(spec);
  }

  // ─── main parse ─────────────────────────────────────────────────────────────

  private parse(spec: OpenAPISpec): ParsedTag[] {
    const tagMap = new Map<string, ParsedOperation[]>();

    for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        const operation = pathItem[method] as OperationObject | undefined;
        if (!operation) continue;

        const tag = operation.tags?.[0] || 'default';
        const operationId =
          operation.operationId || this.generateOperationId(method, pathStr);
        const name = extractOperationName(
          operationId,
          buildNameFromPath(method, pathStr),
        );

        const allParams: ParameterObject[] = [
          ...(pathItem.parameters || []),
          ...(operation.parameters || []),
        ] as ParameterObject[];

        const pathParams = allParams.filter((p) => p.in === 'path');
        const queryParams = allParams.filter((p) => p.in === 'query');
        const headerParams = allParams.filter((p) => p.in === 'header');

        const requestBody = this.resolveRequestBody(operation);
        const responseSchema = this.resolveResponseSchema(operation);

        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag)!.push({
          method,
          path: pathStr,
          operationId,
          name,
          tag,
          summary: operation.summary,
          pathParams,
          queryParams,
          headerParams,
          requestBody,
          responseSchema,
        });
      }
    }

    // Deduplicate operation names within each tag
    for (const [, operations] of tagMap) {
      const nameCount = new Map<string, number>();
      // First pass: count occurrences
      for (const op of operations) {
        nameCount.set(op.name, (nameCount.get(op.name) ?? 0) + 1);
      }
      // Second pass: rename duplicates
      const nameSeq = new Map<string, number>();
      for (const op of operations) {
        if ((nameCount.get(op.name) ?? 1) > 1) {
          const seq = (nameSeq.get(op.name) ?? 0) + 1;
          nameSeq.set(op.name, seq);
          op.name = op.name + seq;
        }
      }
    }

    return Array.from(tagMap.entries()).map(([name, operations]) => ({
      name,
      slug: this.computeSlug(operations),
      operations,
    }));
  }

  // ─── request / response extraction ──────────────────────────────────────────

  private resolveRequestBody(
    operation: OperationObject,
  ): SchemaObject | ReferenceObject | null {
    if (!operation.requestBody) return null;

    const rb = operation.requestBody as any;
    if (rb.$ref) return { $ref: rb.$ref } as ReferenceObject;

    if (rb.content) {
      const jsonContent =
        rb.content['application/json'] || Object.values(rb.content)[0];
      if ((jsonContent as any)?.schema) return (jsonContent as any).schema;
    }

    return null;
  }

  private resolveResponseSchema(
    operation: OperationObject,
  ): SchemaObject | ReferenceObject | null {
    if (!operation.responses) return null;

    const sr =
      operation.responses['200'] ||
      operation.responses['201'] ||
      operation.responses['default'];

    if (!sr) return null;

    const resp = sr as any;
    if (resp.$ref) return { $ref: resp.$ref } as ReferenceObject;

    if (resp.content) {
      const jsonContent =
        resp.content['application/json'] || Object.values(resp.content)[0];
      if ((jsonContent as any)?.schema) return (jsonContent as any).schema;
    }

    return null;
  }

  // ─── slug computation ────────────────────────────────────────────────────────

  /**
   * Derives a folder slug from the common static URL prefix.
   *
   * /restricted/files/{id}          \
   * /restricted/files/presigned-url  → "restricted-files"
   *
   * /autenticacao/login              → "autenticacao"
   * /customer/tenant/{id}            → "customer-tenant"
   */
  private computeSlug(operations: ParsedOperation[]): string {
    if (operations.length === 0) return 'unknown';

    const allSegments = operations.map((op) =>
      op.path.split('/').filter((s) => s.length > 0 && !s.startsWith('{')),
    );

    if (allSegments.every((s) => s.length === 0)) return 'unknown';

    const first = allSegments[0];
    let commonLen = first.length;

    for (const segs of allSegments.slice(1)) {
      let i = 0;
      while (i < commonLen && i < segs.length && first[i] === segs[i]) i++;
      commonLen = i;
    }

    const prefix =
      commonLen > 0 ? first.slice(0, commonLen) : [first[0]].filter(Boolean);
    if (prefix.length === 0) return 'default';

    return prefix.map(this.normalizeSegment).join('-');
  }

  private normalizeSegment(seg: string): string {
    return seg
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private generateOperationId(method: string, pathStr: string): string {
    const cleaned = pathStr
      .replace(/\{([^}]+)\}/g, 'By$1')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return `${method}${capitalize(cleaned)}`;
  }
}

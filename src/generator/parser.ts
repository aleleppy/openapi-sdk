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

/**
 * Parses an OpenAPI spec into a map of tag → operations.
 */
export function parseSpec(spec: OpenAPISpec): ParsedTag[] {
  const tagMap = new Map<string, ParsedOperation[]>();

  for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as OperationObject | undefined;
      if (!operation) continue;

      const tag = operation.tags?.[0] || 'default';
      const operationId =
        operation.operationId || generateOperationId(method, pathStr);

      // Collect parameters
      const allParams: ParameterObject[] = [
        ...(pathItem.parameters || []),
        ...(operation.parameters || []),
      ] as ParameterObject[];

      const pathParams = allParams.filter((p) => p.in === 'path');
      const queryParams = allParams.filter((p) => p.in === 'query');

      // Request body schema
      let requestBody: SchemaObject | ReferenceObject | null = null;
      if (operation.requestBody) {
        const rb = operation.requestBody as any;
        if (rb.$ref) {
          requestBody = { $ref: rb.$ref } as ReferenceObject;
        } else if (rb.content) {
          const jsonContent =
            rb.content['application/json'] || Object.values(rb.content)[0];
          if (jsonContent?.schema) {
            requestBody = jsonContent.schema;
          }
        }
      }

      // Response schema (use 200/201/default)
      let responseSchema: SchemaObject | ReferenceObject | null = null;
      if (operation.responses) {
        const successResponse =
          operation.responses['200'] ||
          operation.responses['201'] ||
          operation.responses['default'];

        if (successResponse) {
          const resp = successResponse as any;
          if (resp.$ref) {
            responseSchema = { $ref: resp.$ref } as ReferenceObject;
          } else if (resp.content) {
            const jsonContent =
              resp.content['application/json'] || Object.values(resp.content)[0];
            if (jsonContent?.schema) {
              responseSchema = jsonContent.schema;
            }
          }
        }
      }

      const parsed: ParsedOperation = {
        method,
        path: pathStr,
        operationId,
        tag,
        summary: operation.summary,
        pathParams,
        queryParams,
        requestBody,
        responseSchema,
      };

      if (!tagMap.has(tag)) {
        tagMap.set(tag, []);
      }
      tagMap.get(tag)!.push(parsed);
    }
  }

  return Array.from(tagMap.entries()).map(([name, operations]) => ({
    name,
    operations,
  }));
}

function generateOperationId(method: string, path: string): string {
  // /users/{id} → users_id, POST /users → createUsers
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

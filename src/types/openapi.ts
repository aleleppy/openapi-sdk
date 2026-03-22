// OpenAPI 3.x type definitions (simplified for codegen purposes)

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
    requestBodies?: Record<string, RequestBodyObject>;
    responses?: Record<string, ResponseObject>;
  };
  tags?: Array<{ name: string; description?: string }>;
}

export interface PathItem {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
  options?: OperationObject;
  head?: OperationObject;
  parameters?: ParameterObject[];
}

export interface OperationObject {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: (ParameterObject | ReferenceObject)[];
  requestBody?: RequestBodyObject | ReferenceObject;
  responses?: Record<string, ResponseObject | ReferenceObject>;
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaObject | ReferenceObject;
  description?: string;
}

export interface RequestBodyObject {
  content: Record<string, { schema?: SchemaObject | ReferenceObject }>;
  required?: boolean;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject | ReferenceObject }>;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  items?: SchemaObject | ReferenceObject;
  required?: string[];
  enum?: (string | number | boolean)[];
  allOf?: (SchemaObject | ReferenceObject)[];
  oneOf?: (SchemaObject | ReferenceObject)[];
  anyOf?: (SchemaObject | ReferenceObject)[];
  additionalProperties?: SchemaObject | ReferenceObject | boolean;
  description?: string;
  example?: unknown;
  nullable?: boolean;
}

export interface ReferenceObject {
  $ref: string;
}

export interface ParsedOperation {
  method: string;
  path: string;
  operationId: string;
  /** Controller method name extracted from operationId (e.g. "create", "findAll") */
  name: string;
  tag: string;
  summary?: string;
  pathParams: ParameterObject[];
  queryParams: ParameterObject[];
  headerParams: ParameterObject[];
  requestBody: SchemaObject | ReferenceObject | null;
  responseSchema: SchemaObject | ReferenceObject | null;
}

export interface ParsedTag {
  name: string;
  /** URL-prefix-based slug — used as folder/file name (e.g. "restricted-files") */
  slug: string;
  operations: ParsedOperation[];
}

export function isReferenceObject(obj: unknown): obj is ReferenceObject {
  return typeof obj === 'object' && obj !== null && '\$ref' in obj;
}

// ─── SDK config (schema.json) ─────────────────────────────────────────────────

export interface SchemaConfig {
  docUrl: string;
  apiUrl: string;
  apiKey?: string;
  name: string;
  selectedTags?: string[];
}

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
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject | ReferenceObject;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  security?: Array<Record<string, string[]>>;
}

export interface ParameterObject {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaObject | ReferenceObject;
}

export interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject | ReferenceObject>;
  required?: string[];
  items?: SchemaObject | ReferenceObject;
  enum?: (string | number)[];
  allOf?: (SchemaObject | ReferenceObject)[];
  oneOf?: (SchemaObject | ReferenceObject)[];
  anyOf?: (SchemaObject | ReferenceObject)[];
  $ref?: string;
  description?: string;
  nullable?: boolean;
  default?: unknown;
  additionalProperties?: boolean | SchemaObject | ReferenceObject;
}

export interface ReferenceObject {
  $ref: string;
}

export interface RequestBodyObject {
  description?: string;
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
  $ref?: string;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaTypeObject>;
  $ref?: string;
}

export interface MediaTypeObject {
  schema?: SchemaObject | ReferenceObject;
}

export interface SchemaConfig {
  url: string;
  apiKey?: string;
  output: string;
}

// Parsed operation used internally by the generator
export interface ParsedOperation {
  method: string;
  path: string;
  operationId: string;
  tag: string;
  summary?: string;
  pathParams: ParameterObject[];
  queryParams: ParameterObject[];
  requestBody?: SchemaObject | ReferenceObject | null;
  responseSchema?: SchemaObject | ReferenceObject | null;
}

export interface ParsedTag {
  name: string;
  operations: ParsedOperation[];
}

export function isReferenceObject(obj: unknown): obj is ReferenceObject {
  return typeof obj === 'object' && obj !== null && '$ref' in obj;
}

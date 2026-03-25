import type { SchemaObject, OpenAPISpec } from '../../../types/openapi';

export type Mode = 'input' | 'response';

export interface FieldContext {
  className: string;
  fieldName: string;
  schema: SchemaObject;
  required: boolean;
  mode: Mode;
  prefix: string;
  spec: OpenAPISpec;
}

export interface EmitState {
  emittedHelpers: Set<string>;
  emittedEnums: Map<string, unknown[]>;
}

export interface FieldHandler {
  build(
    ctx: FieldContext,
    state: EmitState,
    buildField: (ctx: FieldContext) => string[],
  ): string[];
}

import type { SchemaObject, ReferenceObject } from '../../types/openapi';

export type SchemaKind =
  | 'primitive'
  | 'enum'
  | 'object'
  | 'array-object'
  | 'array-enum'
  | 'array-primitive'
  | 'union'
  | 'empty-object'
  | 'unknown';

export function classifySchema(
  schema: SchemaObject,
  resolveItems: (ref: SchemaObject | ReferenceObject) => SchemaObject | null,
): SchemaKind {
  if (schema.enum) return 'enum';

  if (schema.oneOf || schema.anyOf) return 'union';

  if (schema.properties && Object.keys(schema.properties).length > 0)
    return 'object';

  if (schema.type === 'array' && schema.items) {
    const item = resolveItems(schema.items);
    if (item?.properties && Object.keys(item.properties).length > 0)
      return 'array-object';
    if (item?.enum) return 'array-enum';
    return 'array-primitive';
  }

  switch (schema.type) {
    case 'string':
    case 'integer':
    case 'number':
    case 'boolean':
      return 'primitive';
    case 'object':
      return 'empty-object';
    default:
      return 'unknown';
  }
}

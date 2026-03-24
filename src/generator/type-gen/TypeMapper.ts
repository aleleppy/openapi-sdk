import type { OpenAPISpec, SchemaObject, ReferenceObject } from '../../types/openapi';
import { resolveSchema, toPascalCase } from '../helpers';

export class TypeMapper {
  private readonly spec: OpenAPISpec;
  private readonly emittedEnums: Map<string, unknown[]>;

  constructor(spec: OpenAPISpec, emittedEnums: Map<string, unknown[]>) {
    this.spec = spec;
    this.emittedEnums = emittedEnums;
  }

  mapType(schema: SchemaObject, fieldName?: string): string {
    if (schema.enum) {
      if (fieldName) {
        const enumRef = toPascalCase(fieldName) + 'Enum';
        if (!this.emittedEnums.has(enumRef)) {
          this.emittedEnums.set(enumRef, schema.enum);
        }
        return enumRef;
      }
      return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : v)).join(' | ');
    }
    if (schema.oneOf || schema.anyOf) {
      return (schema.oneOf || schema.anyOf)!
        .map((v) => {
          const r = resolveSchema(v, this.spec);
          return r ? this.mapType(r, fieldName) : 'unknown';
        })
        .join(' | ');
    }
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      const req = new Set(schema.required || []);
      const fields = Object.entries(schema.properties).map(([key, val]) => {
        const resolved = resolveSchema(val as SchemaObject | ReferenceObject, this.spec);
        const tsType = resolved ? this.mapType(resolved, key) : 'unknown';
        const opt = req.has(key) ? '' : '?';
        return `${key}${opt}: ${tsType}`;
      });
      return `{ ${fields.join('; ')} }`;
    }
    switch (schema.type) {
      case 'string':
        return schema.format === 'date-time' || schema.format === 'date' ? 'Date' : 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array': {
        if (schema.items) {
          const item = resolveSchema(schema.items, this.spec);
          return `${item ? this.mapType(item, fieldName) : 'unknown'}[]`;
        }
        return 'unknown[]';
      }
      case 'object': {
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          const val = resolveSchema(schema.additionalProperties as SchemaObject, this.spec);
          return `Record<string, ${val ? this.mapType(val) : 'unknown'}>`;
        }
        return 'Record<string, unknown>';
      }
      default:
        return 'unknown';
    }
  }

  mapApiPropertyType(schema: SchemaObject): string {
    if (schema.enum) return "'string'";
    switch (schema.type) {
      case 'string':
        return schema.format === 'date-time' || schema.format === 'date' ? 'Date' : "'string'";
      case 'integer':
      case 'number':
        return "'number'";
      case 'boolean':
        return "'boolean'";
      case 'array':
        return "'array'";
      case 'object':
        return "'object'";
      default:
        return "'string'";
    }
  }

  defaultExample(schema: SchemaObject): unknown {
    if (schema.enum) return schema.enum[0] ?? 'VALUE';
    switch (schema.type) {
      case 'string':
        return 'example';
      case 'integer':
      case 'number':
        return 0;
      case 'boolean':
        return true;
      default:
        return null;
    }
  }

  looksLikeDate(value: string): boolean {
    const d = new Date(value);
    return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(value);
  }
}

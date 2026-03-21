import type {
  OpenAPISpec,
  ParsedTag,
  ParsedOperation,
  SchemaObject,
  ReferenceObject,
  ParameterObject,
} from '../types/openapi';
import { isReferenceObject } from '../types/openapi';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Strip combining diacritics (ã→a, ç→c, é→e, etc.) */
function normalizeStr(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** "foo-bar baz [qux]" → "FooBarBazQux" */
function toPascalCase(str: string): string {
  return normalizeStr(str)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Build a unique, readable name from HTTP method + URL path.
 *
 * POST /restricted/files/presigned-url   → PostRestrictedFilesPresignedUrl
 * GET  /restricted/files/{fileId}        → GetRestrictedFilesByFileId
 * DELETE /restricted/files/{key}         → DeleteRestrictedFilesByKey
 */
export function buildNameFromPath(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const parts = segments.map((seg) => {
    if (seg.startsWith('{') && seg.endsWith('}')) {
      const param = seg.slice(1, -1);
      return 'By' + toPascalCase(param);
    }
    return toPascalCase(seg);
  });
  return toPascalCase(method) + parts.join('');
}

function buildTypeName(method: string, path: string, suffix: string): string {
  return buildNameFromPath(method, path) + suffix;
}

// ─── main export ─────────────────────────────────────────────────────────────

export function generateTypes(tag: ParsedTag, spec: OpenAPISpec): string {
  const lines: string[] = ['// AUTO GENERATED — DO NOT EDIT', ''];
  const generatedInterfaces = new Set<string>();

  for (const op of tag.operations) {
    // Request body type
    if (op.requestBody) {
      const typeName = buildTypeName(op.method, op.path, 'Input');
      if (!generatedInterfaces.has(typeName)) {
        const schema = resolveSchema(op.requestBody, spec);
        if (schema) {
          lines.push(generateInterface(typeName, schema, spec));
          lines.push('');
          generatedInterfaces.add(typeName);
        }
      }
    }

    // Query params type
    if (op.queryParams.length > 0) {
      const typeName = buildTypeName(op.method, op.path, 'Params');
      if (!generatedInterfaces.has(typeName)) {
        lines.push(generateParamsInterface(typeName, op.queryParams, spec));
        lines.push('');
        generatedInterfaces.add(typeName);
      }
    }

    // Response type
    if (op.responseSchema) {
      const typeName = buildTypeName(op.method, op.path, 'Response');
      if (!generatedInterfaces.has(typeName)) {
        const schema = resolveSchema(op.responseSchema, spec);
        if (schema) {
          if (schema.type === 'array' && schema.items) {
            const itemSchema = resolveSchema(schema.items, spec);
            if (itemSchema) {
              lines.push(generateInterface(typeName, itemSchema, spec));
              lines.push('');
            }
          } else {
            lines.push(generateInterface(typeName, schema, spec));
            lines.push('');
          }
          generatedInterfaces.add(typeName);
        }
      }
    }
  }

  return lines.join('\n');
}

// ─── schema resolution ───────────────────────────────────────────────────────

export function resolveSchema(
  schemaOrRef: SchemaObject | ReferenceObject,
  spec: OpenAPISpec
): SchemaObject | null {
  if (isReferenceObject(schemaOrRef)) {
    return resolveRef(schemaOrRef.$ref, spec);
  }

  if (schemaOrRef.allOf) {
    const merged: SchemaObject = { type: 'object', properties: {}, required: [] };
    for (const item of schemaOrRef.allOf) {
      const resolved = resolveSchema(item, spec);
      if (resolved?.properties) {
        merged.properties = { ...merged.properties, ...resolved.properties };
      }
      if (resolved?.required) {
        merged.required = [...(merged.required || []), ...resolved.required];
      }
    }
    return merged;
  }

  return schemaOrRef;
}

function resolveRef(ref: string, spec: OpenAPISpec): SchemaObject | null {
  const parts = ref.replace('#/', '').split('/');
  let current: any = spec;
  for (const part of parts) {
    current = current?.[part];
    if (!current) return null;
  }
  if (current.$ref) return resolveRef(current.$ref, spec);
  return current as SchemaObject;
}

// ─── interface generation ─────────────────────────────────────────────────────

function generateInterface(name: string, schema: SchemaObject, spec: OpenAPISpec): string {
  if (!schema.properties && !schema.type) {
    return `export type ${name} = Record<string, unknown>;`;
  }
  if (schema.type && schema.type !== 'object') {
    return `export type ${name} = ${mapType(schema, spec)};`;
  }

  const lines: string[] = [`export interface ${name} {`];
  const required = new Set(schema.required || []);

  if (schema.properties) {
    for (const [propName, propSchemaOrRef] of Object.entries(schema.properties)) {
      const propSchema = resolveSchema(propSchemaOrRef, spec);
      const isRequired = required.has(propName);
      const tsType = propSchema ? mapType(propSchema, spec) : 'unknown';
      const optional = isRequired ? '' : '?';
      const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName)
        ? propName
        : `'${propName}'`;
      lines.push(`  ${safeName}${optional}: ${tsType};`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function generateParamsInterface(
  name: string,
  params: ParameterObject[],
  spec: OpenAPISpec
): string {
  const lines: string[] = [`export interface ${name} {`];
  for (const param of params) {
    const schema = param.schema ? resolveSchema(param.schema, spec) : null;
    const tsType = schema ? mapType(schema, spec) : 'string';
    const optional = param.required ? '' : '?';
    lines.push(`  ${param.name}${optional}: ${tsType};`);
  }
  lines.push('}');
  return lines.join('\n');
}

function mapType(schema: SchemaObject, spec: OpenAPISpec): string {
  if (schema.enum) {
    return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : v)).join(' | ');
  }
  if (schema.oneOf || schema.anyOf) {
    const variants = (schema.oneOf || schema.anyOf)!;
    return variants
      .map((v) => { const r = resolveSchema(v, spec); return r ? mapType(r, spec) : 'unknown'; })
      .join(' | ');
  }
  switch (schema.type) {
    case 'string':    return 'string';
    case 'integer':
    case 'number':    return 'number';
    case 'boolean':   return 'boolean';
    case 'array': {
      if (schema.items) {
        const itemSchema = resolveSchema(schema.items, spec);
        return `${itemSchema ? mapType(itemSchema, spec) : 'unknown'}[]`;
      }
      return 'unknown[]';
    }
    case 'object': {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const valSchema = resolveSchema(schema.additionalProperties as SchemaObject, spec);
        return `Record<string, ${valSchema ? mapType(valSchema, spec) : 'unknown'}>`;
      }
      return 'Record<string, unknown>';
    }
    default: return 'unknown';
  }
}

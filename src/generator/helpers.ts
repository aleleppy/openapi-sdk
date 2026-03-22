import type { OpenAPISpec, SchemaObject, ReferenceObject } from '../types/openapi';
import { isReferenceObject } from '../types/openapi';

// ─── string utils ─────────────────────────────────────────────────────────────

export function normalizeStr(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function toPascalCase(str: string): string {
  return normalizeStr(str)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function toCamelCase(str: string): string {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── operation name (from NestJS operationId) ────────────────────────────────

/**
 * Extracts the controller method name from a NestJS operationId.
 *
 * NestJS Swagger format: "UsersController_create" → "create"
 *                        "UsersController_findAll" → "findAll" (list → listAll)
 *
 * Falls back to `fallback` when operationId doesn't follow the pattern.
 */
export function extractOperationName(operationId: string, fallback: string): string {
  const idx  = operationId.indexOf('_');
  if (idx === -1) return fallback;
  const name = operationId.slice(idx + 1);
  if (!name) return fallback;
  if (name === 'list') return 'listAll';
  return name;
}

/** Derives type/class name prefix from operation name: "create" → "Create" */
export function operationTypeName(opName: string, suffix: string): string {
  return toPascalCase(opName) + suffix;
}

// ─── name builders (path-based fallback) ────────────────────────────────────

export function buildNameFromPath(method: string, pathStr: string): string {
  const segments = pathStr.split('/').filter(Boolean);
  const parts = segments.map((seg) => {
    if (seg.startsWith('{') && seg.endsWith('}')) {
      return 'By' + toPascalCase(seg.slice(1, -1));
    }
    return toPascalCase(seg);
  });
  return toPascalCase(method) + parts.join('');
}

export function buildTypeName(method: string, pathStr: string, suffix: string): string {
  return buildNameFromPath(method, pathStr) + suffix;
}

// ─── schema resolution ────────────────────────────────────────────────────────

export function resolveSchema(
  schemaOrRef: SchemaObject | ReferenceObject,
  spec: OpenAPISpec,
): SchemaObject | null {
  if (isReferenceObject(schemaOrRef)) return resolveRef(schemaOrRef.$ref, spec);

  if (schemaOrRef.allOf) {
    const merged: SchemaObject = { type: 'object', properties: {}, required: [] };
    for (const item of schemaOrRef.allOf) {
      const r = resolveSchema(item, spec);
      if (r?.properties) merged.properties = { ...merged.properties, ...r.properties };
      if (r?.required)   merged.required   = [...(merged.required || []), ...r.required];
    }
    return merged;
  }

  return schemaOrRef;
}

function resolveRef(ref: string, spec: OpenAPISpec): SchemaObject | null {
  const parts = ref.replace('#/', '').split('/');
  let current: any = spec;
  for (const p of parts) {
    current = current?.[p];
    if (!current) return null;
  }
  if (current.$ref) return resolveRef(current.$ref, spec);
  return current as SchemaObject;
}

export function extractDataSchema(schema: SchemaObject, spec: OpenAPISpec): SchemaObject | null {
  const props = schema.properties || {};
  if ((props.statusCode || props.status) && props.data) {
    return resolveSchema(props.data as SchemaObject | ReferenceObject, spec);
  }
  return null;
}

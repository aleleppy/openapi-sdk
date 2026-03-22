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

function normalizeStr(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toPascalCase(str: string): string {
  return normalizeStr(str)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

export function buildNameFromPath(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const parts = segments.map((seg) => {
    if (seg.startsWith('{') && seg.endsWith('}')) {
      return 'By' + toPascalCase(seg.slice(1, -1));
    }
    return toPascalCase(seg);
  });
  return toPascalCase(method) + parts.join('');
}

function buildTypeName(method: string, path: string, suffix: string): string {
  return buildNameFromPath(method, path) + suffix;
}

// ─── wrapper detection ───────────────────────────────────────────────────────

export function extractDataSchema(
  schema: SchemaObject,
  spec: OpenAPISpec,
): SchemaObject | null {
  const props = schema.properties || {};
  if ((props.statusCode || props.status) && props.data) {
    return resolveSchema(props.data as SchemaObject | ReferenceObject, spec);
  }
  return null;
}

// ─── main export ─────────────────────────────────────────────────────────────

export function generateTypes(tag: ParsedTag, spec: OpenAPISpec): string {
  const blocks: string[]   = [];
  const generated          = new Set<string>();

  for (const op of tag.operations) {
    if (op.requestBody) {
      const name = buildTypeName(op.method, op.path, 'Input');
      if (!generated.has(name)) {
        const schema = resolveSchema(op.requestBody, spec);
        if (schema) {
          blocks.push(generateClassBlock(name, schema, spec, 'input'));
          generated.add(name);
        }
      }
    }

    if (op.queryParams.length > 0) {
      const name = buildTypeName(op.method, op.path, 'Query');
      if (!generated.has(name)) {
        blocks.push(generateQueryClass(name, op.queryParams, spec));
        generated.add(name);
      }
    }

    if (op.responseSchema) {
      const name = buildTypeName(op.method, op.path, 'Response');
      if (!generated.has(name)) {
        const raw = resolveSchema(op.responseSchema, spec);
        if (raw) {
          const inner  = extractDataSchema(raw, spec);
          const schema = inner ?? raw;
          const unwrapped = schema.type === 'array' && schema.items
            ? resolveSchema(schema.items, spec) ?? schema
            : schema;
          blocks.push(generateClassBlock(name, unwrapped, spec, 'response'));
          generated.add(name);
        }
      }
    }
  }

  if (blocks.length === 0) return '// AUTO GENERATED \u2014 DO NOT EDIT\n';

  const lines: string[] = [
    '// AUTO GENERATED \u2014 DO NOT EDIT',
    "import { ApiProperty, IntersectionType } from '@nestjs/swagger';",
    "import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsEnum } from 'class-validator';",
    '',
    ...blocks.flatMap((b) => [b, '']),
  ];

  return lines.join('\n');
}

// ─── class generation ─────────────────────────────────────────────────────────

type Mode = 'input' | 'response';

function generateClassBlock(
  name: string,
  schema: SchemaObject,
  spec: OpenAPISpec,
  mode: Mode,
): string {
  if (!schema.properties) {
    // No properties — simple type alias
    return `export type ${name} = ${mapType(schema, spec)};`;
  }

  const required  = new Set(schema.required || []);
  const fieldNames = Object.keys(schema.properties);

  if (fieldNames.length === 0) {
    return `export type ${name} = Record<string, unknown>;`;
  }

  const lines: string[] = [];

  // One class per field
  const fieldClassNames: string[] = [];
  for (const fieldName of fieldNames) {
    const fieldSchemaOrRef = schema.properties![fieldName];
    const fieldSchema      = resolveSchema(fieldSchemaOrRef, spec);
    if (!fieldSchema) continue;

    const isReq       = required.has(fieldName);
    const className   = toPascalCase(fieldName) + (mode === 'input' ? 'Dto' : 'Res');
    fieldClassNames.push(className);

    lines.push(...generateFieldClass(className, fieldName, fieldSchema, isReq, spec, mode));
    lines.push('');
  }

  // Main class
  if (fieldClassNames.length === 1) {
    lines.push(`export class ${name} extends ${fieldClassNames[0]} {}`);
  } else {
    lines.push(
      `export class ${name} extends IntersectionType(`,
      ...fieldClassNames.slice(0, -1).map((c) => `  ${c},`),
      `  ${fieldClassNames[fieldClassNames.length - 1]},`,
      `) {}`,
    );
  }

  return lines.join('\n');
}

function generateFieldClass(
  className: string,
  fieldName: string,
  schema: SchemaObject,
  required: boolean,
  spec: OpenAPISpec,
  mode: Mode,
): string[] {
  const tsType     = mapType(schema, spec);
  const apiType    = mapApiPropertyType(schema, spec);
  const example    = schema.example !== undefined ? schema.example : defaultExample(schema);
  const exampleStr = JSON.stringify(example);
  const optional   = !required;

  const lines: string[] = [`class ${className} {`];

  // @ApiProperty
  if (schema.enum) {
    const enumRef = toPascalCase(fieldName) + 'Enum';
    lines.push(`  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: ${exampleStr}, required: ${!optional} })`);
  } else {
    lines.push(`  @ApiProperty({ type: ${apiType}, example: ${exampleStr}, required: ${!optional} })`);
  }

  // Validators (Input only)
  if (mode === 'input') {
    if (optional) lines.push('  @IsOptional()');
    if (schema.enum) {
      const enumRef = toPascalCase(fieldName) + 'Enum';
      lines.push(`  @IsEnum(${enumRef})`);
    } else {
      switch (schema.type) {
        case 'string':
          lines.push('  @IsString()');
          if (!optional) lines.push('  @IsNotEmpty()');
          break;
        case 'integer':
        case 'number':
          lines.push('  @IsNumber()');
          break;
        case 'boolean':
          lines.push('  @IsBoolean()');
          break;
      }
    }
  }

  const bang     = optional ? '' : '!';
  const question = optional ? '?' : '';
  lines.push(`  ${fieldName}${question}${bang}: ${tsType};`);
  lines.push('}');

  return lines;
}

function generateQueryClass(
  name: string,
  params: ParameterObject[],
  spec: OpenAPISpec,
): string {
  if (params.length === 0) return `export type ${name} = Record<string, unknown>;`;

  const lines: string[] = [];
  const fieldClassNames: string[] = [];

  for (const param of params) {
    const schema    = param.schema ? resolveSchema(param.schema, spec) : null;
    const className = toPascalCase(param.name) + 'QueryDto';
    fieldClassNames.push(className);
    const isReq     = !!param.required;
    const tsType    = schema ? mapType(schema, spec) : 'string';
    const apiType   = schema ? mapApiPropertyType(schema, spec) : "'string'";
    const example   = schema?.example !== undefined ? schema.example : defaultExample(schema ?? { type: 'string' });
    const optional  = !isReq;

    lines.push(`class ${className} {`);
    lines.push(`  @ApiProperty({ type: ${apiType}, example: ${JSON.stringify(example)}, required: ${isReq} })`);
    if (optional) lines.push('  @IsOptional()');
    if (schema?.type === 'number' || schema?.type === 'integer') {
      lines.push('  @IsNumber()');
    } else {
      lines.push('  @IsString()');
    }
    const bang = optional ? '' : '!';
    const q    = optional ? '?' : '';
    lines.push(`  ${param.name}${q}${bang}: ${tsType};`);
    lines.push('}');
    lines.push('');
  }

  if (fieldClassNames.length === 1) {
    lines.push(`export class ${name} extends ${fieldClassNames[0]} {}`);
  } else {
    lines.push(
      `export class ${name} extends IntersectionType(`,
      ...fieldClassNames.slice(0, -1).map((c) => `  ${c},`),
      `  ${fieldClassNames[fieldClassNames.length - 1]},`,
      `) {}`,
    );
  }

  return lines.join('\n');
}

// ─── schema resolution ───────────────────────────────────────────────────────

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

// ─── type mapping ─────────────────────────────────────────────────────────────

function mapType(schema: SchemaObject, spec: OpenAPISpec): string {
  if (schema.enum) {
    return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : v)).join(' | ');
  }
  if (schema.oneOf || schema.anyOf) {
    return (schema.oneOf || schema.anyOf)!
      .map((v) => { const r = resolveSchema(v, spec); return r ? mapType(r, spec) : 'unknown'; })
      .join(' | ');
  }
  switch (schema.type) {
    case 'string':  return 'string';
    case 'integer':
    case 'number':  return 'number';
    case 'boolean': return 'boolean';
    case 'array': {
      if (schema.items) {
        const item = resolveSchema(schema.items, spec);
        return `${item ? mapType(item, spec) : 'unknown'}[]`;
      }
      return 'unknown[]';
    }
    case 'object': {
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        const val = resolveSchema(schema.additionalProperties as SchemaObject, spec);
        return `Record<string, ${val ? mapType(val, spec) : 'unknown'}>`;
      }
      return 'Record<string, unknown>';
    }
    default: return 'unknown';
  }
}

function mapApiPropertyType(schema: SchemaObject, spec: OpenAPISpec): string {
  if (schema.enum) return "'string'";
  switch (schema.type) {
    case 'string':  return "'string'";
    case 'integer':
    case 'number':  return "'number'";
    case 'boolean': return "'boolean'";
    case 'array':   return "'array'";
    case 'object':  return "'object'";
    default:        return "'string'";
  }
}

function defaultExample(schema: SchemaObject): unknown {
  if (schema.enum) return schema.enum[0] ?? 'VALUE';
  switch (schema.type) {
    case 'string':  return 'example';
    case 'integer':
    case 'number':  return 0;
    case 'boolean': return true;
    default:        return null;
  }
}

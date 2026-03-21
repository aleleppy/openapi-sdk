import type { ParsedTag, ParsedOperation, OpenAPISpec } from '../types/openapi';
import { resolveSchema, buildNameFromPath } from './type-gen';

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

function toCamelCase(str: string): string {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function buildTypeName(method: string, path: string, suffix: string): string {
  return buildNameFromPath(method, path) + suffix;
}

function slugToModuleName(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('') + 'Module';
}

export function generateModule(tag: ParsedTag, spec: OpenAPISpec): string {
  const lines: string[] = ['// AUTO GENERATED \u2014 DO NOT EDIT'];
  lines.push("import axios from 'axios';");

  const typeImports = collectTypeImports(tag);
  if (typeImports.length > 0) {
    lines.push(`import type { ${typeImports.join(', ')} } from './${tag.slug}.types';`);
  }

  lines.push('');
  lines.push("const BASE_URL = process.env.API_URL || '';");
  lines.push('');
  lines.push('const instance = axios.create({ baseURL: BASE_URL });');
  lines.push('');

  const moduleName = slugToModuleName(tag.slug);
  lines.push(`export const ${moduleName} = {`);

  for (let i = 0; i < tag.operations.length; i++) {
    const op = tag.operations[i];
    const methodLines = generateMethodLines(op, spec);
    lines.push(...methodLines.map((l) => '  ' + l));
    if (i < tag.operations.length - 1) lines.push('');
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

function collectTypeImports(tag: ParsedTag): string[] {
  const imports: string[] = [];
  for (const op of tag.operations) {
    if (op.requestBody)        imports.push(buildTypeName(op.method, op.path, 'Input'));
    if (op.queryParams.length) imports.push(buildTypeName(op.method, op.path, 'Query'));
    if (op.responseSchema)     imports.push(buildTypeName(op.method, op.path, 'Response'));
  }
  return [...new Set(imports)];
}

function generateMethodLines(op: ParsedOperation, spec: OpenAPISpec): string[] {
  const fnName  = toCamelCase(buildNameFromPath(op.method, op.path));
  const argStr  = buildArgument(op);
  const retType = buildReturnType(op, spec);
  const call    = buildAxiosCall(op);

  if (!argStr) {
    // No params at all
    return [`${fnName}: (): ${retType} =>`, `  ${call},`];
  }

  return [`${fnName}: (${argStr}): ${retType} =>`, `  ${call},`];
}

/**
 * Generates a single destructured argument object.
 *
 * No params:
 *   ()
 *
 * Only path params:
 *   ({ params }: { params: { id: string } })
 *
 * Path + body + query:
 *   ({ params, body, query }: {
 *     params: { tenantId: string; sellerId: string };
 *     body: CreateInput;
 *     query?: ListQuery;
 *   })
 */
function buildArgument(op: ParsedOperation): string {
  const hasPath  = op.pathParams.length > 0;
  const hasBody  = !!op.requestBody;
  const hasQuery = op.queryParams.length > 0;

  if (!hasPath && !hasBody && !hasQuery) return '';

  const destructured: string[] = [];
  const typeFields:   string[] = [];

  if (hasPath) {
    destructured.push('params');
    const fields = op.pathParams.map((p) => `${p.name}: string`).join('; ');
    typeFields.push(`params: { ${fields} }`);
  }

  if (hasBody) {
    destructured.push('body');
    typeFields.push(`body: ${buildTypeName(op.method, op.path, 'Input')}`);
  }

  if (hasQuery) {
    destructured.push('query');
    typeFields.push(`query?: ${buildTypeName(op.method, op.path, 'Query')}`);
  }

  const lhs = `{ ${destructured.join(', ')} }`;
  const rhs = typeFields.join('; ');

  return `${lhs}: { ${rhs} }`;
}

function buildReturnType(op: ParsedOperation, spec: OpenAPISpec): string {
  if (!op.responseSchema) return 'Promise<void>';
  const typeName = buildTypeName(op.method, op.path, 'Response');
  const schema   = resolveSchema(op.responseSchema, spec);
  return schema?.type === 'array' ? `Promise<${typeName}[]>` : `Promise<${typeName}>`;
}

function buildAxiosCall(op: ParsedOperation): string {
  // Path params accessed via params.xxx
  let url = op.path.replace(/\{([^}]+)\}/g, (_, p) => '${params.' + p + '}');
  url = '`${BASE_URL}' + url + '`';

  const hasBody  = !!op.requestBody;
  const hasQuery = op.queryParams.length > 0;
  const m        = op.method;
  const isData   = ['post', 'put', 'patch'].includes(m);

  if (isData) {
    if (hasBody && hasQuery) return `instance.${m}(${url}, body, { params: query }).then(r => r.data)`;
    if (hasBody)             return `instance.${m}(${url}, body).then(r => r.data)`;
    if (hasQuery)            return `instance.${m}(${url}, undefined, { params: query }).then(r => r.data)`;
    return                          `instance.${m}(${url}).then(r => r.data)`;
  }

  if (hasQuery) return `instance.${m}(${url}, { params: query }).then(r => r.data)`;
  return              `instance.${m}(${url}).then(r => r.data)`;
}

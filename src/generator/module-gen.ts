import type { ParsedTag, ParsedOperation, OpenAPISpec } from '../types/openapi';
import { resolveSchema } from './type-gen';

/**
 * Normalizes accented/special characters to ASCII equivalents.
 * Handles Portuguese chars like ã→a, ç→c, é→e, etc.
 */
function normalizeStr(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip combining diacritics
}

function toPascalCase(str: string): string {
  return normalizeStr(str)
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[a-z]/, (s) => s.toUpperCase());
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebab(str: string): string {
  return normalizeStr(str)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/**
 * Generates the module file (.module.ts) for a parsed tag.
 * Each module exports an object with methods for each endpoint.
 */
export function generateModule(
  tag: ParsedTag,
  spec: OpenAPISpec
): string {
  const lines: string[] = ['// AUTO GENERATED — DO NOT EDIT'];
  lines.push("import axios from 'axios';");

  // Collect all type imports
  const typeImports = collectTypeImports(tag, spec);
  if (typeImports.length > 0) {
    lines.push(
      `import type { ${typeImports.join(', ')} } from './${toKebab(tag.name)}.types';`
    );
  }

  lines.push('');
  lines.push("const BASE_URL = process.env.API_URL || '';");
  lines.push('');

  // Configure axios instance with api key support
  lines.push('const instance = axios.create({');
  lines.push('  baseURL: BASE_URL,');
  lines.push('});');
  lines.push('');

  const moduleName = toPascalCase(tag.name) + 'Module';
  lines.push(`export const ${moduleName} = {`);

  for (let i = 0; i < tag.operations.length; i++) {
    const op = tag.operations[i];
    const methodLines = generateMethodLines(op, spec);
    lines.push(...methodLines.map((l) => '  ' + l));
    if (i < tag.operations.length - 1) {
      lines.push('');
    }
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

function collectTypeImports(tag: ParsedTag, spec: OpenAPISpec): string[] {
  const imports: string[] = [];

  for (const op of tag.operations) {
    if (op.requestBody) {
      imports.push(buildTypeName(op.operationId, 'Input'));
    }
    if (op.queryParams.length > 0) {
      imports.push(buildTypeName(op.operationId, 'Params'));
    }
    if (op.responseSchema) {
      imports.push(buildTypeName(op.operationId, 'Response'));
    }
  }

  return imports;
}

function generateMethodLines(op: ParsedOperation, spec: OpenAPISpec): string[] {
  const fnName = toCamelCase(op.operationId);
  const params = buildFnParams(op);
  const returnType = buildReturnType(op, spec);
  const axiosCall = buildAxiosCall(op, spec);

  return [`${fnName}: (${params}): ${returnType} =>`, `  ${axiosCall},`];
}

function buildFnParams(op: ParsedOperation): string {
  const parts: string[] = [];

  // Path params
  for (const p of op.pathParams) {
    parts.push(`${p.name}: string`);
  }

  // Request body
  if (op.requestBody) {
    const typeName = buildTypeName(op.operationId, 'Input');
    parts.push(`body: ${typeName}`);
  }

  // Query params
  if (op.queryParams.length > 0) {
    const typeName = buildTypeName(op.operationId, 'Params');
    parts.push(`params?: ${typeName}`);
  }

  return parts.join(', ');
}

function buildReturnType(op: ParsedOperation, spec: OpenAPISpec): string {
  if (!op.responseSchema) return 'Promise<void>';

  const typeName = buildTypeName(op.operationId, 'Response');
  const schema = resolveSchema(op.responseSchema, spec);

  if (schema?.type === 'array') {
    return `Promise<${typeName}[]>`;
  }

  return `Promise<${typeName}>`;
}

function buildAxiosCall(op: ParsedOperation, spec: OpenAPISpec): string {
  // Build URL with template literals for path params
  let url = op.path.replace(/\{([^}]+)\}/g, (_, param) => `\${${param}}`);
  url = '`${BASE_URL}' + url + '`';

  const method = op.method;
  const hasBody = !!op.requestBody;
  const hasParams = op.queryParams.length > 0;

  const dataMethods = ['post', 'put', 'patch'];

  if (dataMethods.includes(method)) {
    if (hasBody && hasParams) {
      return `instance.${method}(${url}, body, { params }).then(r => r.data)`;
    }
    if (hasBody) {
      return `instance.${method}(${url}, body).then(r => r.data)`;
    }
    if (hasParams) {
      return `instance.${method}(${url}, undefined, { params }).then(r => r.data)`;
    }
    return `instance.${method}(${url}).then(r => r.data)`;
  }

  // GET, DELETE, HEAD, OPTIONS
  if (hasParams) {
    return `instance.${method}(${url}, { params }).then(r => r.data)`;
  }
  return `instance.${method}(${url}).then(r => r.data)`;
}

function buildTypeName(operationId: string, suffix: string): string {
  return toPascalCase(operationId) + suffix;
}

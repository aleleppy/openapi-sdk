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

function toKebab(str: string): string {
  return normalizeStr(str)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildTypeName(method: string, path: string, suffix: string): string {
  return buildNameFromPath(method, path) + suffix;
}

export function generateModule(tag: ParsedTag, spec: OpenAPISpec): string {
  const lines: string[] = ['// AUTO GENERATED — DO NOT EDIT'];
  lines.push("import axios from 'axios';");

  const typeImports = collectTypeImports(tag);
  if (typeImports.length > 0) {
    lines.push(
      `import type { ${typeImports.join(', ')} } from './${toKebab(tag.name)}.types';`
    );
  }

  lines.push('');
  lines.push("const BASE_URL = process.env.API_URL || '';");
  lines.push('');
  lines.push('const instance = axios.create({ baseURL: BASE_URL });');
  lines.push('');

  const moduleName = toPascalCase(tag.name) + 'Module';
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
    if (op.queryParams.length) imports.push(buildTypeName(op.method, op.path, 'Params'));
    if (op.responseSchema)     imports.push(buildTypeName(op.method, op.path, 'Response'));
  }
  return [...new Set(imports)];
}

function generateMethodLines(op: ParsedOperation, spec: OpenAPISpec): string[] {
  const fnName  = toCamelCase(buildNameFromPath(op.method, op.path));
  const params  = buildFnParams(op);
  const retType = buildReturnType(op, spec);
  const call    = buildAxiosCall(op);
  return [`${fnName}: (${params}): ${retType} =>`, `  ${call},`];
}

function buildFnParams(op: ParsedOperation): string {
  const parts: string[] = [];
  for (const p of op.pathParams) parts.push(`${p.name}: string`);
  if (op.requestBody)        parts.push(`body: ${buildTypeName(op.method, op.path, 'Input')}`);
  if (op.queryParams.length) parts.push(`params?: ${buildTypeName(op.method, op.path, 'Params')}`);
  return parts.join(', ');
}

function buildReturnType(op: ParsedOperation, spec: OpenAPISpec): string {
  if (!op.responseSchema) return 'Promise<void>';
  const typeName = buildTypeName(op.method, op.path, 'Response');
  const schema   = resolveSchema(op.responseSchema, spec);
  return schema?.type === 'array' ? `Promise<${typeName}[]>` : `Promise<${typeName}>`;
}

function buildAxiosCall(op: ParsedOperation): string {
  let url = op.path.replace(/\{([^}]+)\}/g, (_, p) => `\${\}`);
  url = '`${BASE_URL}' + url + '`';
  const hasBody   = !!op.requestBody;
  const hasParams = op.queryParams.length > 0;
  const m         = op.method;
  const isData    = ['post', 'put', 'patch'].includes(m);
  if (isData) {
    if (hasBody && hasParams) return `instance.${m}(${url}, body, { params }).then(r => r.data)`;
    if (hasBody)              return `instance.${m}(${url}, body).then(r => r.data)`;
    if (hasParams)            return `instance.${m}(${url}, undefined, { params }).then(r => r.data)`;
    return                           `instance.${m}(${url}).then(r => r.data)`;
  }
  if (hasParams) return `instance.${m}(${url}, { params }).then(r => r.data)`;
  return               `instance.${m}(${url}).then(r => r.data)`;
}

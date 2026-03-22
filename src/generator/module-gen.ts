import type { ParsedTag, ParsedOperation, OpenAPISpec } from '../types/openapi';
import { resolveSchema, buildNameFromPath, extractDataSchema } from './type-gen';

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

/** True if the endpoint's raw response schema is a NestJS wrapper { statusCode, data } */
function isWrappedResponse(op: ParsedOperation, spec: OpenAPISpec): boolean {
  if (!op.responseSchema) return false;
  const raw = resolveSchema(op.responseSchema, spec);
  if (!raw) return false;
  return extractDataSchema(raw, spec) !== null;
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
  const fnName   = toCamelCase(buildNameFromPath(op.method, op.path));
  const argStr   = buildArgument(op);
  const retType  = buildReturnType(op, spec);
  const wrapped  = isWrappedResponse(op, spec);

  // Build axios call URL
  let url = op.path.replace(/\{([^}]+)\}/g, (_, p) => '${params.' + p + '}');
  url = '`${BASE_URL}' + url + '`';

  const hasBody  = !!op.requestBody;
  const hasQuery = op.queryParams.length > 0;
  const m        = op.method;
  const isData   = ['post', 'put', 'patch'].includes(m);

  // Build the axios call expression
  let axiosCall: string;
  if (isData) {
    if (hasBody && hasQuery) axiosCall = `instance.${m}<${retType.replace('Promise<','').replace('>','')}>(${url}, body, { params: query })`;
    else if (hasBody)        axiosCall = `instance.${m}<${retType.replace('Promise<','').replace('>','')}>(${url}, body)`;
    else if (hasQuery)       axiosCall = `instance.${m}<${retType.replace('Promise<','').replace('>','')}>(${url}, undefined, { params: query })`;
    else                     axiosCall = `instance.${m}<${retType.replace('Promise<','').replace('>','')}>(${url})`;
  } else {
    if (hasQuery) axiosCall = `instance.${m}<${retType.replace('Promise<','').replace('>','')}>(${url}, { params: query })`;
    else          axiosCall = `instance.${m}<${retType.replace('Promise<','').replace('>','')}>(${url})`;
  }

  // Accessor: .data (axios unwrap) + .data again if NestJS wrapper
  const accessor = wrapped ? 'response.data.data' : 'response.data';

  const argPart = argStr ? `(${argStr})` : '()';

  return [
    `${fnName}: async ${argPart}: ${retType} => {`,
    `  const response = await ${axiosCall};`,
    `  return ${accessor};`,
    `},`,
  ];
}

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

  return `{ ${destructured.join(', ')} }: { ${typeFields.join('; ')} }`;
}

function buildReturnType(op: ParsedOperation, spec: OpenAPISpec): string {
  if (!op.responseSchema) return 'Promise<void>';
  const typeName = buildTypeName(op.method, op.path, 'Response');
  const raw      = resolveSchema(op.responseSchema, spec);
  if (!raw) return `Promise<${typeName}>`;

  // Use inner data schema for array detection
  const inner  = extractDataSchema(raw, spec);
  const schema = inner ?? raw;

  return schema?.type === 'array' ? `Promise<${typeName}[]>` : `Promise<${typeName}>`;
}

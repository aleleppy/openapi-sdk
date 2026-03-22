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
  return slug.split('-').filter(Boolean)
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

  lines.push(`export const ${slugToModuleName(tag.slug)} = {`);

  for (let i = 0; i < tag.operations.length; i++) {
    const methodLines = generateMethodLines(tag.operations[i], spec);
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

  // Detect wrapper
  const wrapped = (() => {
    if (!op.responseSchema) return false;
    const raw = resolveSchema(op.responseSchema, spec);
    return raw ? extractDataSchema(raw, spec) !== null : false;
  })();

  // Axios generic: if wrapped, pass { data: T } so response.data.data is typed
  const respTypeName = op.responseSchema ? buildTypeName(op.method, op.path, 'Response') : 'void';
  const axiosGeneric = wrapped ? `{ data: ${respTypeName} }` : respTypeName;

  // Build URL
  let url = op.path.replace(/\{([^}]+)\}/g, (_, p) => '${params.' + p + '}');
  url = '`${BASE_URL}' + url + '`';

  const hasBody  = !!op.requestBody;
  const hasQuery = op.queryParams.length > 0;
  const m        = op.method;
  const isData   = ['post', 'put', 'patch'].includes(m);

  let axiosExpr: string;
  if (isData) {
    if (hasBody && hasQuery) axiosExpr = `instance.${m}<${axiosGeneric}>(${url}, body, { params: query })`;
    else if (hasBody)        axiosExpr = `instance.${m}<${axiosGeneric}>(${url}, body)`;
    else if (hasQuery)       axiosExpr = `instance.${m}<${axiosGeneric}>(${url}, undefined, { params: query })`;
    else                     axiosExpr = `instance.${m}<${axiosGeneric}>(${url})`;
  } else {
    axiosExpr = hasQuery
      ? `instance.${m}<${axiosGeneric}>(${url}, { params: query })`
      : `instance.${m}<${axiosGeneric}>(${url})`;
  }

  // accessor
  const accessor = wrapped ? 'response.data.data' : 'response.data';
  const argPart  = argStr ? `(${argStr})` : '()';

  return [
    `${fnName}: async ${argPart}: ${retType} => {`,
    `  const response = await ${axiosExpr};`,
    `  return ${accessor};`,
    `},`,
  ];
}

function buildArgument(op: ParsedOperation): string {
  const hasPath  = op.pathParams.length > 0;
  const hasBody  = !!op.requestBody;
  const hasQuery = op.queryParams.length > 0;
  if (!hasPath && !hasBody && !hasQuery) return '';

  const d: string[] = [];
  const t: string[] = [];

  if (hasPath)  { d.push('params'); t.push(`params: { ${op.pathParams.map((p) => `${p.name}: string`).join('; ')} }`); }
  if (hasBody)  { d.push('body');   t.push(`body: ${buildTypeName(op.method, op.path, 'Input')}`); }
  if (hasQuery) { d.push('query');  t.push(`query?: ${buildTypeName(op.method, op.path, 'Query')}`); }

  return `{ ${d.join(', ')} }: { ${t.join('; ')} }`;
}

function buildReturnType(op: ParsedOperation, spec: OpenAPISpec): string {
  if (!op.responseSchema) return 'Promise<void>';
  const typeName = buildTypeName(op.method, op.path, 'Response');
  const raw      = resolveSchema(op.responseSchema, spec);
  if (!raw) return `Promise<${typeName}>`;
  const inner  = extractDataSchema(raw, spec);
  const schema = inner ?? raw;
  return schema?.type === 'array' ? `Promise<${typeName}[]>` : `Promise<${typeName}>`;
}

import type { ParsedTag, ParsedOperation, OpenAPISpec } from '../types/openapi';
import {
  resolveSchema,
  extractDataSchema,
  buildNameFromPath,
  buildTypeName,
  toCamelCase,
} from './helpers';

export class ModuleGenerator {
  private readonly tag:  ParsedTag;
  private readonly spec: OpenAPISpec;

  constructor(tag: ParsedTag, spec: OpenAPISpec) {
    this.tag  = tag;
    this.spec = spec;
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  build(): string {
    const lines: string[] = ['// AUTO GENERATED — DO NOT EDIT'];
    lines.push("import axios from 'axios';");

    const typeImports = this.collectTypeImports();
    if (typeImports.length > 0) {
      lines.push(
        `import type { ${typeImports.join(', ')} } from './${this.tag.slug}.types';`,
      );
    }

    lines.push('');
    lines.push("const BASE_URL = process.env.API_URL || '';");
    lines.push('');
    lines.push('const instance = axios.create({ baseURL: BASE_URL });');
    lines.push('');

    lines.push(`export const ${this.slugToModuleName()} = {`);

    for (let i = 0; i < this.tag.operations.length; i++) {
      const methodLines = this.generateMethodLines(this.tag.operations[i]);
      lines.push(...methodLines.map((l) => '  ' + l));
      if (i < this.tag.operations.length - 1) lines.push('');
    }

    lines.push('};');
    lines.push('');
    return lines.join('\n');
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private slugToModuleName(): string {
    return (
      this.tag.slug
        .split('-')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('') + 'Module'
    );
  }

  private collectTypeImports(): string[] {
    const imports: string[] = [];
    for (const op of this.tag.operations) {
      if (op.requestBody)        imports.push(buildTypeName(op.method, op.path, 'Input'));
      if (op.queryParams.length) imports.push(buildTypeName(op.method, op.path, 'Query'));
      if (op.responseSchema)     imports.push(buildTypeName(op.method, op.path, 'Response'));
    }
    return [...new Set(imports)];
  }

  private generateMethodLines(op: ParsedOperation): string[] {
    const fnName  = toCamelCase(buildNameFromPath(op.method, op.path));
    const argStr  = this.buildArgument(op);
    const retType = this.buildReturnType(op);

    const wrapped = (() => {
      if (!op.responseSchema) return false;
      const raw = resolveSchema(op.responseSchema, this.spec);
      return raw ? extractDataSchema(raw, this.spec) !== null : false;
    })();

    const respTypeName  = op.responseSchema ? buildTypeName(op.method, op.path, 'Response') : 'void';
    const axiosGeneric  = wrapped ? `{ data: ${respTypeName} }` : respTypeName;

    let url = op.path.replace(/\{([^}]+)\}/g, (_, p) => '${params.' + p + '}');
    url     = '`${BASE_URL}' + url + '`';

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

    const accessor = wrapped ? 'response.data.data' : 'response.data';
    const argPart  = argStr ? `(${argStr})` : '()';

    return [
      `${fnName}: async ${argPart}: ${retType} => {`,
      `  const response = await ${axiosExpr};`,
      `  return ${accessor};`,
      `},`,
    ];
  }

  private buildArgument(op: ParsedOperation): string {
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

  private buildReturnType(op: ParsedOperation): string {
    if (!op.responseSchema) return 'Promise<void>';
    const typeName = buildTypeName(op.method, op.path, 'Response');
    const raw      = resolveSchema(op.responseSchema, this.spec);
    if (!raw) return `Promise<${typeName}>`;
    const inner  = extractDataSchema(raw, this.spec);
    const schema = inner ?? raw;
    return schema?.type === 'array' ? `Promise<${typeName}[]>` : `Promise<${typeName}>`;
  }
}

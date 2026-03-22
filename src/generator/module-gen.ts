import type { ParsedTag, ParsedOperation, OpenAPISpec } from '../types/openapi';
import {
  resolveSchema,
  extractDataSchema,
  operationTypeName,
  toPascalCase,
} from './helpers';

export class ModuleGenerator {
  private readonly tag: ParsedTag;
  private readonly spec: OpenAPISpec;
  private readonly apiUrl: string;
  private readonly name: string;

  constructor(tag: ParsedTag, spec: OpenAPISpec, apiUrl: string, name: string) {
    this.tag = tag;
    this.spec = spec;
    this.apiUrl = apiUrl;
    this.name = name;
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  build(): string {
    const lines: string[] = ['// AUTO GENERATED — DO NOT EDIT'];
    const hasAnyQuery = this.tag.operations.some(
      (op) => op.queryParams.length > 0,
    );
    if (hasAnyQuery) {
      lines.push(
        "import { ApiDefaultService, toQueryString } from '../../api-default-service';",
      );
    } else {
      lines.push(
        "import { ApiDefaultService } from '../../api-default-service';",
      );
    }

    const typeImports = this.collectTypeImports();
    if (typeImports.length > 0) {
      lines.push(
        `import type { ${typeImports.join(', ')} } from './${this.tag.slug}.types';`,
      );
    }

    lines.push('');

    const className = this.slugToClassName();
    const envKey = this.toEnvKey(this.name);
    lines.push(`export class ${className} extends ApiDefaultService {`);
    lines.push(
      `  constructor(params?: { baseUrl?: string; apiKey?: string }) {`,
    );
    lines.push(`    super({`);
    lines.push(`      baseUrl: params?.baseUrl ?? '${this.apiUrl}',`);
    lines.push(`      apiKey: params?.apiKey ?? process.env.${envKey},`);
    lines.push(`    });`);
    lines.push(`  }`);
    lines.push('');

    for (let i = 0; i < this.tag.operations.length; i++) {
      const methodLines = this.generateMethodLines(this.tag.operations[i]);
      lines.push(...methodLines.map((l) => '  ' + l));
      if (i < this.tag.operations.length - 1) lines.push('');
    }

    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }

  // ─── helpers ─────────────────────────────────────────────────────────────────

  private slugToClassName(): string {
    return (
      this.tag.slug
        .split('-')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('') + 'Service'
    );
  }

  private collectTypeImports(): string[] {
    const imports: string[] = [];
    for (const op of this.tag.operations) {
      if (op.requestBody) imports.push(operationTypeName(op.name, 'InputDto'));
      if (op.queryParams.length)
        imports.push(operationTypeName(op.name, 'Query'));
      if (op.responseSchema)
        imports.push(operationTypeName(op.name, 'Response'));
      for (const p of op.pathParams) {
        const schema = p.schema ? resolveSchema(p.schema, this.spec) : null;
        if (schema?.enum) imports.push(toPascalCase(p.name) + 'Enum');
      }
    }
    return [...new Set(imports)];
  }

  private generateMethodLines(op: ParsedOperation): string[] {
    const fnName = op.name;
    const argStr = this.buildArgument(op);
    const retType = this.buildReturnType(op);

    const hasPath = op.pathParams.length > 0;
    const hasBody = !!op.requestBody;
    const hasQuery = op.queryParams.length > 0;
    const hasHeaders = (op.headerParams?.length ?? 0) > 0;
    const m = op.method;

    // Build URL expression
    let urlExpr: string;
    if (hasPath) {
      urlExpr =
        '`' +
        op.path.replace(/\{([^}]+)\}/g, (_, p) => '${params.' + p + '}') +
        '`';
    } else {
      urlExpr = `'${op.path}'`;
    }

    const argPart = argStr ? `(${argStr})` : '()';
    const lines: string[] = [];

    lines.push(`async ${fnName}${argPart}: ${retType} {`);

    if (hasQuery) {
      lines.push(`  const qs = query ? toQueryString(query) : '';`);
      urlExpr = `\`\${${urlExpr}}\${qs}\``;
    }

    const callParts = [`url: ${urlExpr}`];
    if (hasBody) callParts.push('body');
    if (hasHeaders) callParts.push('headers');
    lines.push(`  return this.${m}({ ${callParts.join(', ')} });`);

    lines.push('}');
    return lines;
  }

  private buildArgument(op: ParsedOperation): string {
    const hasPath = op.pathParams.length > 0;
    const hasBody = !!op.requestBody;
    const hasQuery = op.queryParams.length > 0;
    if (!hasPath && !hasBody && !hasQuery) return '';

    const args: { name: string; type: string; optional: boolean }[] = [];

    if (hasPath) {
      const paramFields = op.pathParams.map((p) => {
        const schema = p.schema ? resolveSchema(p.schema, this.spec) : null;
        const type = schema?.enum ? toPascalCase(p.name) + 'Enum' : 'string';
        return `${p.name}: ${type}`;
      });
      args.push({
        name: 'params',
        type: `{ ${paramFields.join('; ')} }`,
        optional: false,
      });
    }
    if (hasBody)
      args.push({
        name: 'body',
        type: operationTypeName(op.name, 'InputDto'),
        optional: false,
      });
    if (hasQuery)
      args.push({
        name: 'query',
        type: operationTypeName(op.name, 'Query'),
        optional: true,
      });
    if ((op.headerParams?.length ?? 0) > 0) {
      const headerFields = op.headerParams
        .map((p) => {
          const q = p.required ? '' : '?';
          return `'${p.name}'${q}: string`;
        })
        .join('; ');
      args.push({
        name: 'headers',
        type: `{ ${headerFields} }`,
        optional: true,
      });
    }

    if (args.length === 1) {
      const a = args[0];
      return `${a.name}${a.optional ? '?' : ''}: ${a.type}`;
    }

    const d = args.map((a) => a.name);
    const t = args.map((a) => `${a.name}${a.optional ? '?' : ''}: ${a.type}`);
    return `{ ${d.join(', ')} }: { ${t.join('; ')} }`;
  }

  private buildReturnType(op: ParsedOperation): string {
    if (!op.responseSchema) return 'Promise<void>';
    const typeName = operationTypeName(op.name, 'Response');
    const raw = resolveSchema(op.responseSchema, this.spec);
    if (!raw) return `Promise<${typeName}>`;
    const inner = extractDataSchema(raw, this.spec);
    const schema = inner ?? raw;
    return schema?.type === 'array'
      ? `Promise<${typeName}[]>`
      : `Promise<${typeName}>`;
  }

  private toEnvKey(name: string): string {
    return name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase() + '_KEY';
  }
}

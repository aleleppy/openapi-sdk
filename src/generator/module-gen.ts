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
    lines.push("import { ApiDefaultService } from '../api-default-service';");

    const typeImports = this.collectTypeImports();
    if (typeImports.length > 0) {
      lines.push(
        `import type { ${typeImports.join(', ')} } from './${this.tag.slug}.types';`,
      );
    }

    lines.push('');

    const className = this.slugToClassName();
    lines.push(`export class ${className} extends ApiDefaultService {`);

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

    const hasPath  = op.pathParams.length > 0;
    const hasBody  = !!op.requestBody;
    const hasQuery = op.queryParams.length > 0;
    const m        = op.method;

    // Build URL expression
    let urlExpr: string;
    if (hasPath) {
      urlExpr = '`' + op.path.replace(/\{([^}]+)\}/g, (_, p) => '${params.' + p + '}') + '`';
    } else {
      urlExpr = `'${op.path}'`;
    }

    const argPart = argStr ? `(${argStr})` : '()';
    const lines: string[] = [];

    lines.push(`async ${fnName}${argPart}: ${retType} {`);

    if (hasQuery) {
      lines.push(`  const qs = query ? \`?\${new URLSearchParams(query as any).toString()}\` : '';`);
      urlExpr = `\`\${${urlExpr}}\${qs}\``;
    }

    const callParts = [`url: ${urlExpr}`];
    if (hasBody) callParts.push('body');
    lines.push(`  return this.${m}({ ${callParts.join(', ')} });`);

    lines.push('}');
    return lines;
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

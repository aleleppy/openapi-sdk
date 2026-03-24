import type { OpenAPISpec, ParameterObject } from '../../types/openapi';
import { resolveSchema, toPascalCase } from '../helpers';
import { TypeMapper } from './TypeMapper';

export class QueryClassBuilder {
  private readonly spec: OpenAPISpec;
  private readonly emittedHelpers: Set<string>;
  private readonly emittedEnums: Map<string, unknown[]>;
  private readonly typeMapper: TypeMapper;

  constructor(
    spec: OpenAPISpec,
    emittedHelpers: Set<string>,
    emittedEnums: Map<string, unknown[]>,
    typeMapper: TypeMapper,
  ) {
    this.spec = spec;
    this.emittedHelpers = emittedHelpers;
    this.emittedEnums = emittedEnums;
    this.typeMapper = typeMapper;
  }

  // ─── query class ─────────────────────────────────────────────────────────────

  generateQueryClass(name: string, params: ParameterObject[]): string {
    if (params.length === 0) return `export type ${name} = Record<string, unknown>;`;

    const lines: string[] = [];
    const fieldClassNames: string[] = [];

    for (const param of params) {
      const schema = param.schema ? resolveSchema(param.schema, this.spec) : null;
      const className = toPascalCase(param.name) + 'QueryDto';
      fieldClassNames.push(className);

      if (!this.emittedHelpers.has(className)) {
        const isReq = !!param.required;
        const optional = !isReq;

        // Detect enum (direct or array of enum)
        const itemSchema = schema?.type === 'array' && schema.items ? resolveSchema(schema.items, this.spec) : null;
        const enumSource = schema?.enum ? schema : itemSchema?.enum ? itemSchema : null;
        const enumRef = enumSource?.enum ? toPascalCase(param.name) + 'Enum' : null;

        if (enumRef && enumSource?.enum) {
          if (!this.emittedEnums.has(enumRef)) {
            this.emittedEnums.set(enumRef, enumSource.enum);
          }
        }

        const tsType =
          enumRef
            ? schema?.type === 'array'
              ? `${enumRef}[]`
              : enumRef
            : schema
              ? this.typeMapper.mapType(schema)
              : 'string';

        const example =
          schema?.example !== undefined ? schema.example : this.typeMapper.defaultExample(schema ?? { type: 'string' });
        const exampleStr = typeof example === 'string' ? `'${example}'` : JSON.stringify(example);

        lines.push(`class ${className} {`);
        if (enumRef) {
          const enumExample =
            schema?.type === 'array' ? `Object.values(${enumRef})` : `Object.values(${enumRef})[0]`;
          if (schema?.type === 'array') {
            lines.push(
              `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', isArray: true, example: ${enumExample} })`,
            );
          } else {
            lines.push(
              `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: ${enumExample} })`,
            );
          }
        } else {
          const apiType = schema ? this.typeMapper.mapApiPropertyType(schema) : "'string'";
          lines.push(`  @ApiProperty({ type: ${apiType}, example: ${exampleStr} })`);
        }

        if (optional) lines.push('  @IsOptional()');
        if (enumRef) {
          lines.push(`  @IsEnum(${enumRef}${schema?.type === 'array' ? ", { each: true }" : ''})`);
        } else if (schema?.type === 'number' || schema?.type === 'integer') {
          lines.push('  @IsNumber()');
        } else {
          lines.push('  @IsString()');
        }

        const bang = optional ? '' : '!';
        const q = optional ? '?' : '';
        lines.push(`  ${param.name}${q}${bang}: ${tsType};`);
        lines.push('}');
        lines.push('');
        this.emittedHelpers.add(className);
      }
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
}

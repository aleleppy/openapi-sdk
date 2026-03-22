import type {
  OpenAPISpec,
  ParsedTag,
  SchemaObject,
  ReferenceObject,
  ParameterObject,
} from '../types/openapi';
import {
  resolveSchema,
  extractDataSchema,
  buildTypeName,
  toPascalCase,
} from './helpers';

type Mode = 'input' | 'response';

export class TypeGenerator {
  private readonly tag:  ParsedTag;
  private readonly spec: OpenAPISpec;

  constructor(tag: ParsedTag, spec: OpenAPISpec) {
    this.tag  = tag;
    this.spec = spec;
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  build(): string {
    const blocks:    string[] = [];
    const generated           = new Set<string>();

    for (const op of this.tag.operations) {
      if (op.requestBody) {
        const name = buildTypeName(op.method, op.path, 'Input');
        if (!generated.has(name)) {
          const schema = resolveSchema(op.requestBody, this.spec);
          if (schema) {
            blocks.push(this.generateClassBlock(name, schema, 'input'));
            generated.add(name);
          }
        }
      }

      if (op.queryParams.length > 0) {
        const name = buildTypeName(op.method, op.path, 'Query');
        if (!generated.has(name)) {
          blocks.push(this.generateQueryClass(name, op.queryParams));
          generated.add(name);
        }
      }

      if (op.responseSchema) {
        const name = buildTypeName(op.method, op.path, 'Response');
        if (!generated.has(name)) {
          const raw = resolveSchema(op.responseSchema, this.spec);
          if (raw) {
            const inner     = extractDataSchema(raw, this.spec);
            const schema    = inner ?? raw;
            const unwrapped =
              schema.type === 'array' && schema.items
                ? resolveSchema(schema.items, this.spec) ?? schema
                : schema;
            blocks.push(this.generateClassBlock(name, unwrapped, 'response'));
            generated.add(name);
          }
        }
      }
    }

    if (blocks.length === 0) return '// AUTO GENERATED — DO NOT EDIT\n';

    return [
      '// AUTO GENERATED — DO NOT EDIT',
      "import { ApiProperty, IntersectionType } from '@nestjs/swagger';",
      "import { IsString, IsNotEmpty, IsNumber, IsBoolean, IsOptional, IsEnum } from 'class-validator';",
      '',
      ...blocks.flatMap((b) => [b, '']),
    ].join('\n');
  }

  // ─── class block ─────────────────────────────────────────────────────────────

  private generateClassBlock(name: string, schema: SchemaObject, mode: Mode): string {
    if (!schema.properties) {
      return `export type ${name} = ${this.mapType(schema)};`;
    }

    const required   = new Set(schema.required || []);
    const fieldNames = Object.keys(schema.properties);

    if (fieldNames.length === 0) {
      return `export type ${name} = Record<string, unknown>;`;
    }

    const lines:           string[] = [];
    const fieldClassNames: string[] = [];

    for (const fieldName of fieldNames) {
      const fieldSchemaOrRef = schema.properties![fieldName];
      const fieldSchema      = resolveSchema(fieldSchemaOrRef, this.spec);
      if (!fieldSchema) continue;

      const isReq    = required.has(fieldName);
      const suffix   = mode === 'input' ? 'Dto' : 'Res';
      const className = toPascalCase(fieldName) + suffix;
      fieldClassNames.push(className);

      lines.push(...this.generateFieldClass(className, fieldName, fieldSchema, isReq, mode));
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

  private generateFieldClass(
    className: string,
    fieldName: string,
    schema: SchemaObject,
    required: boolean,
    mode: Mode,
  ): string[] {
    const tsType     = this.mapType(schema);
    const apiType    = this.mapApiPropertyType(schema);
    const example    = schema.example !== undefined ? schema.example : this.defaultExample(schema);
    const exampleStr = JSON.stringify(example);
    const optional   = !required;

    const lines: string[] = [`class ${className} {`];

    if (schema.enum) {
      const enumRef = toPascalCase(fieldName) + 'Enum';
      lines.push(
        `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: ${exampleStr}, required: ${!optional} })`,
      );
    } else {
      lines.push(
        `  @ApiProperty({ type: ${apiType}, example: ${exampleStr}, required: ${!optional} })`,
      );
    }

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

  // ─── query class ─────────────────────────────────────────────────────────────

  private generateQueryClass(name: string, params: ParameterObject[]): string {
    if (params.length === 0) return `export type ${name} = Record<string, unknown>;`;

    const lines:           string[] = [];
    const fieldClassNames: string[] = [];

    for (const param of params) {
      const schema    = param.schema ? resolveSchema(param.schema, this.spec) : null;
      const className = toPascalCase(param.name) + 'QueryDto';
      fieldClassNames.push(className);

      const isReq   = !!param.required;
      const tsType  = schema ? this.mapType(schema) : 'string';
      const apiType = schema ? this.mapApiPropertyType(schema) : "'string'";
      const example =
        schema?.example !== undefined ? schema.example : this.defaultExample(schema ?? { type: 'string' });
      const optional = !isReq;

      lines.push(`class ${className} {`);
      lines.push(
        `  @ApiProperty({ type: ${apiType}, example: ${JSON.stringify(example)}, required: ${isReq} })`,
      );
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

  // ─── type mapping ─────────────────────────────────────────────────────────────

  private mapType(schema: SchemaObject): string {
    if (schema.enum) {
      return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : v)).join(' | ');
    }
    if (schema.oneOf || schema.anyOf) {
      return (schema.oneOf || schema.anyOf)!
        .map((v) => {
          const r = resolveSchema(v, this.spec);
          return r ? this.mapType(r) : 'unknown';
        })
        .join(' | ');
    }
    switch (schema.type) {
      case 'string':  return 'string';
      case 'integer':
      case 'number':  return 'number';
      case 'boolean': return 'boolean';
      case 'array': {
        if (schema.items) {
          const item = resolveSchema(schema.items, this.spec);
          return `${item ? this.mapType(item) : 'unknown'}[]`;
        }
        return 'unknown[]';
      }
      case 'object': {
        if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === 'object'
        ) {
          const val = resolveSchema(schema.additionalProperties as SchemaObject, this.spec);
          return `Record<string, ${val ? this.mapType(val) : 'unknown'}>`;
        }
        return 'Record<string, unknown>';
      }
      default: return 'unknown';
    }
  }

  private mapApiPropertyType(schema: SchemaObject): string {
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

  private defaultExample(schema: SchemaObject): unknown {
    if (schema.enum) return schema.enum[0] ?? 'VALUE';
    switch (schema.type) {
      case 'string':  return 'example';
      case 'integer':
      case 'number':  return 0;
      case 'boolean': return true;
      default:        return null;
    }
  }
}

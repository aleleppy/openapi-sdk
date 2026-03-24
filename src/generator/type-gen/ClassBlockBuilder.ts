import type { OpenAPISpec, SchemaObject } from '../../types/openapi';
import { resolveSchema, toPascalCase } from '../helpers';
import { TypeMapper } from './TypeMapper';

type Mode = 'input' | 'response';

export class ClassBlockBuilder {
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

  // ─── class block ─────────────────────────────────────────────────────────────

  generateClassBlock(name: string, schema: SchemaObject, mode: Mode): string {
    if (!schema.properties) {
      return `export type ${name} = ${this.typeMapper.mapType(schema)};`;
    }

    const required = new Set(schema.required || []);
    const fieldNames = Object.keys(schema.properties);

    if (fieldNames.length === 0) {
      return `export type ${name} = Record<string, unknown>;`;
    }

    const lines: string[] = [];
    const fieldClassNames: string[] = [];

    for (const fieldName of fieldNames) {
      const fieldSchemaOrRef = schema.properties![fieldName];
      const fieldSchema = resolveSchema(fieldSchemaOrRef, this.spec);
      if (!fieldSchema) continue;

      const isReq = required.has(fieldName);
      const suffix = mode === 'input' ? 'Dto' : 'Res';
      const className = toPascalCase(fieldName) + suffix;
      fieldClassNames.push(className);

      if (!this.emittedHelpers.has(className)) {
        lines.push(...this.generateFieldClass(className, fieldName, fieldSchema, isReq, mode));
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

  generateFieldClass(
    className: string,
    fieldName: string,
    schema: SchemaObject,
    required: boolean,
    mode: Mode,
    prefix: string = '',
  ): string[] {
    const optional = !required;

    // ─── nested object → generate sub-classes + IntersectionType ───────────
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      const nestedReq = new Set(schema.required || []);
      const fieldNames = Object.keys(schema.properties);
      const lines: string[] = [];
      const nestedClassNames: string[] = [];
      const nestedPrefix = prefix + toPascalCase(fieldName);

      for (const nestedField of fieldNames) {
        const nestedSchemaOrRef = schema.properties![nestedField];
        const nestedSchema = resolveSchema(nestedSchemaOrRef, this.spec);
        if (!nestedSchema) continue;

        const isReq = nestedReq.has(nestedField);
        const suffix = mode === 'input' ? 'Dto' : 'Res';
        const nestedClass = nestedPrefix + toPascalCase(nestedField) + suffix;
        nestedClassNames.push(nestedClass);

        if (!this.emittedHelpers.has(nestedClass)) {
          lines.push(...this.generateFieldClass(nestedClass, nestedField, nestedSchema, isReq, mode, nestedPrefix));
          lines.push('');
          this.emittedHelpers.add(nestedClass);
        }
      }

      // combined type class for the nested object
      const typeName = nestedPrefix + (mode === 'input' ? 'DtoType' : 'ResType');
      if (nestedClassNames.length === 1) {
        lines.push(`class ${typeName} extends ${nestedClassNames[0]} {}`);
      } else if (nestedClassNames.length > 1) {
        lines.push(
          `class ${typeName} extends IntersectionType(`,
          ...nestedClassNames.slice(0, -1).map((c) => `  ${c},`),
          `  ${nestedClassNames[nestedClassNames.length - 1]},`,
          `) {}`,
        );
      }
      lines.push('');

      // parent field class referencing the nested type
      lines.push(`class ${className} {`);
      lines.push(`  @ApiProperty({ type: ${typeName} })`);
      if (mode === 'input' && optional) lines.push('  @IsOptional()');
      const bang = optional ? '' : '!';
      const question = optional ? '?' : '';
      lines.push(`  ${fieldName}${question}${bang}: ${typeName};`);
      lines.push('}');

      return lines;
    }

    // ─── array of objects → generate item class + isArray ────────────────
    if (schema.type === 'array' && schema.items) {
      const itemSchema = resolveSchema(schema.items, this.spec);
      if (itemSchema?.properties && Object.keys(itemSchema.properties).length > 0) {
        // Delegate to nested object generation for the item type
        const itemClassName = className + 'Item';
        const itemLines = this.generateFieldClass(itemClassName, fieldName, itemSchema, true, mode, prefix);

        // The last generated type class is the one we reference
        const nestedPrefix = prefix + toPascalCase(fieldName);
        const typeName = nestedPrefix + (mode === 'input' ? 'DtoType' : 'ResType');

        const lines: string[] = [...itemLines];
        // Remove the wrapping field class that generateFieldClass added (last class block)
        // and replace it with our array version
        const lastClassIdx = lines.lastIndexOf(`class ${itemClassName} {`);
        if (lastClassIdx !== -1) {
          lines.splice(lastClassIdx); // remove from the item wrapper class onwards
        }
        lines.push('');
        lines.push(`class ${className} {`);
        lines.push(`  @ApiProperty({ type: ${typeName}, isArray: true })`);
        if (mode === 'input' && optional) lines.push('  @IsOptional()');
        const bang = optional ? '' : '!';
        const question = optional ? '?' : '';
        lines.push(`  ${fieldName}${question}${bang}: ${typeName}[];`);
        lines.push('}');
        return lines;
      }
    }

    // ─── array of enums → enum ref + isArray ────────────────────────────
    if (schema.type === 'array' && schema.items) {
      const itemSchema = resolveSchema(schema.items, this.spec);
      if (itemSchema?.enum) {
        const enumRef = toPascalCase(fieldName) + 'Enum';
        if (!this.emittedEnums.has(enumRef)) {
          this.emittedEnums.set(enumRef, itemSchema.enum);
        }

        const lines: string[] = [`class ${className} {`];
        lines.push(
          `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', isArray: true, example: Object.values(${enumRef}) })`,
        );
        if (mode === 'input') {
          if (optional) lines.push('  @IsOptional()');
          lines.push(`  @IsEnum(${enumRef}, { each: true })`);
        }
        const bang = optional ? '' : '!';
        const question = optional ? '?' : '';
        lines.push(`  ${fieldName}${question}${bang}: ${enumRef}[];`);
        lines.push('}');
        return lines;
      }
    }

    // ─── primitive / enum / array field ────────────────────────────────────
    const example = schema.example !== undefined ? schema.example : this.typeMapper.defaultExample(schema);
    const isDateByExample =
      mode === 'response' && typeof example === 'string' && this.typeMapper.looksLikeDate(example);
    const tsType = schema.enum
      ? toPascalCase(fieldName) + 'Enum'
      : isDateByExample
        ? 'Date'
        : this.typeMapper.mapType(schema, fieldName);
    const apiType = isDateByExample ? 'Date' : this.typeMapper.mapApiPropertyType(schema);
    const exampleStr = typeof example === 'string' ? `'${example}'` : JSON.stringify(example);

    const lines: string[] = [`class ${className} {`];

    if (schema.enum) {
      const enumRef = toPascalCase(fieldName) + 'Enum';
      if (!this.emittedEnums.has(enumRef)) {
        this.emittedEnums.set(enumRef, schema.enum);
      }
      lines.push(
        `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: Object.values(${enumRef})[0] })`,
      );
    } else if (schema.type === 'object') {
      lines.push(`  @ApiProperty({ example: {} })`);
    } else {
      lines.push(`  @ApiProperty({ type: ${apiType}, example: ${exampleStr} })`);
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

    const bang = optional ? '' : '!';
    const question = optional ? '?' : '';
    lines.push(`  ${fieldName}${question}${bang}: ${tsType};`);
    lines.push('}');

    return lines;
  }
}

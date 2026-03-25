import { resolveSchema, toPascalCase } from '../../helpers';
import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';

export class ArrayObjectFieldHandler implements FieldHandler {
  build(
    ctx: FieldContext,
    state: EmitState,
    buildField: (ctx: FieldContext) => string[],
  ): string[] {
    const { className, fieldName, schema, required, mode, prefix, spec } = ctx;
    const optional = !required;

    const itemSchema = resolveSchema(schema.items!, spec)!;
    const nestedReq = new Set(itemSchema.required || []);
    const fieldNames = Object.keys(itemSchema.properties!);
    const lines: string[] = [];
    const nestedClassNames: string[] = [];
    const nestedPrefix = prefix + toPascalCase(fieldName);

    for (const nestedField of fieldNames) {
      const nestedSchemaOrRef = itemSchema.properties![nestedField];
      const nestedSchema = resolveSchema(nestedSchemaOrRef, spec);
      if (!nestedSchema) continue;

      const isReq = nestedReq.has(nestedField);
      const suffix = mode === 'input' ? 'Dto' : 'Res';
      const nestedClass = nestedPrefix + toPascalCase(nestedField) + suffix;
      nestedClassNames.push(nestedClass);

      if (!state.emittedHelpers.has(nestedClass)) {
        lines.push(
          ...buildField({
            className: nestedClass,
            fieldName: nestedField,
            schema: nestedSchema,
            required: isReq,
            mode,
            prefix: nestedPrefix,
            spec,
          }),
        );
        lines.push('');
        state.emittedHelpers.add(nestedClass);
      }
    }

    // combined type class for the array items
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

    // parent field class with isArray
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

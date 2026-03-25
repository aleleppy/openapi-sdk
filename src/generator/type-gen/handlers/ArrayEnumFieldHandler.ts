import { resolveSchema, toPascalCase } from '../../helpers';
import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';

export class ArrayEnumFieldHandler implements FieldHandler {
  build(ctx: FieldContext, state: EmitState): string[] {
    const { className, fieldName, schema, required, mode } = ctx;
    const optional = !required;

    const itemSchema = schema.items
      ? resolveSchema(schema.items, ctx.spec)
      : null;
    const enumRef = toPascalCase(fieldName) + 'Enum';
    if (itemSchema?.enum && !state.emittedEnums.has(enumRef)) {
      state.emittedEnums.set(enumRef, itemSchema.enum);
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

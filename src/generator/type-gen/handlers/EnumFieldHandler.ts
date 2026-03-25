import { toPascalCase } from '../../helpers';
import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';
import type { TypeMapper } from '../TypeMapper';

export class EnumFieldHandler implements FieldHandler {
  constructor(private readonly _typeMapper: TypeMapper) {}

  build(ctx: FieldContext, state: EmitState): string[] {
    const { className, fieldName, schema, required, mode } = ctx;
    const optional = !required;

    const enumRef = toPascalCase(fieldName) + 'Enum';
    if (!state.emittedEnums.has(enumRef)) {
      state.emittedEnums.set(enumRef, schema.enum!);
    }

    const lines: string[] = [`class ${className} {`];
    lines.push(
      `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: Object.values(${enumRef})[0] })`,
    );

    if (mode === 'input') {
      if (optional) lines.push('  @IsOptional()');
      lines.push(`  @IsEnum(${enumRef})`);
    }

    const bang = optional ? '' : '!';
    const question = optional ? '?' : '';
    lines.push(`  ${fieldName}${question}${bang}: ${enumRef};`);
    lines.push('}');

    return lines;
  }
}

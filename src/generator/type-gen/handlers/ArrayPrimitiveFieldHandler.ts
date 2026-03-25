import { resolveSchema } from '../../helpers';
import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';
import type { TypeMapper } from '../TypeMapper';

export class ArrayPrimitiveFieldHandler implements FieldHandler {
  constructor(private readonly typeMapper: TypeMapper) {}

  build(ctx: FieldContext, _state: EmitState): string[] {
    const { className, fieldName, schema, required, mode } = ctx;
    const optional = !required;

    const itemSchema = schema.items
      ? resolveSchema(schema.items, ctx.spec)
      : null;
    const itemTsType = itemSchema
      ? this.typeMapper.mapType(itemSchema, fieldName)
      : 'unknown';
    const itemApiType = itemSchema
      ? this.typeMapper.mapApiPropertyType(itemSchema)
      : "'string'";

    const lines: string[] = [`class ${className} {`];
    lines.push(
      `  @ApiProperty({ type: ${itemApiType}, isArray: true, example: [] })`,
    );
    if (mode === 'input' && optional) lines.push('  @IsOptional()');

    const bang = optional ? '' : '!';
    const question = optional ? '?' : '';
    lines.push(`  ${fieldName}${question}${bang}: ${itemTsType}[];`);
    lines.push('}');

    return lines;
  }
}

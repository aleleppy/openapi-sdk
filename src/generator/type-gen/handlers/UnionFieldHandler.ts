import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';
import type { TypeMapper } from '../TypeMapper';

export class UnionFieldHandler implements FieldHandler {
  constructor(private readonly typeMapper: TypeMapper) {}

  build(ctx: FieldContext, _state: EmitState): string[] {
    const { className, fieldName, schema, required, mode } = ctx;
    const optional = !required;

    const tsType = this.typeMapper.mapType(schema, fieldName);
    const exampleStr = "'example'";

    const lines: string[] = [`class ${className} {`];
    lines.push(`  @ApiProperty({ example: ${exampleStr} })`);

    if (mode === 'input' && optional) lines.push('  @IsOptional()');

    const bang = optional ? '' : '!';
    const question = optional ? '?' : '';
    lines.push(`  ${fieldName}${question}${bang}: ${tsType};`);
    lines.push('}');

    return lines;
  }
}

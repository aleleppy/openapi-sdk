import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';

export class EmptyObjectFieldHandler implements FieldHandler {
  build(ctx: FieldContext, _state: EmitState): string[] {
    const { className, fieldName, required, mode } = ctx;
    const optional = !required;

    const lines: string[] = [`class ${className} {`];
    lines.push(`  @ApiProperty({ example: {} })`);

    if (mode === 'input' && optional) lines.push('  @IsOptional()');

    const bang = optional ? '' : '!';
    const question = optional ? '?' : '';
    lines.push(`  ${fieldName}${question}${bang}: Record<string, unknown>;`);
    lines.push('}');

    return lines;
  }
}

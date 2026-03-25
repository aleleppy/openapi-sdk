import type { FieldHandler, FieldContext, EmitState } from './FieldHandler';
import type { TypeMapper } from '../TypeMapper';

export class PrimitiveFieldHandler implements FieldHandler {
  constructor(private readonly typeMapper: TypeMapper) {}

  build(ctx: FieldContext, _state: EmitState): string[] {
    const { className, fieldName, schema, required, mode } = ctx;
    const optional = !required;

    const example =
      schema.example !== undefined
        ? schema.example
        : this.typeMapper.defaultExample(schema);
    const isDateByExample =
      mode === 'response' &&
      typeof example === 'string' &&
      this.typeMapper.looksLikeDate(example);

    const tsType = isDateByExample ? 'Date' : this.typeMapper.mapType(schema, fieldName);
    const apiType = isDateByExample ? 'Date' : this.typeMapper.mapApiPropertyType(schema);
    const exampleStr =
      typeof example === 'string' ? `'${example}'` : JSON.stringify(example);

    const lines: string[] = [`class ${className} {`];

    if (schema.type === 'object') {
      lines.push(`  @ApiProperty({ example: {} })`);
    } else {
      lines.push(
        `  @ApiProperty({ type: ${apiType}, example: ${exampleStr} })`,
      );
    }

    if (mode === 'input') {
      if (optional) lines.push('  @IsOptional()');
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

    const bang = optional ? '' : '!';
    const question = optional ? '?' : '';
    lines.push(`  ${fieldName}${question}${bang}: ${tsType};`);
    lines.push('}');

    return lines;
  }
}

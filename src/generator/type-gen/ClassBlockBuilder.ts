import type { OpenAPISpec, SchemaObject } from '../../types/openapi';
import { resolveSchema, toPascalCase } from '../helpers';
import { TypeMapper } from './TypeMapper';
import { classifySchema } from './schema-classifier';
import { FieldHandlerFactory } from './handlers/FieldHandlerFactory';
import type { FieldContext, EmitState, Mode } from './handlers/FieldHandler';

export class ClassBlockBuilder {
  private readonly spec: OpenAPISpec;
  private readonly state: EmitState;
  private readonly typeMapper: TypeMapper;
  private readonly factory: FieldHandlerFactory;

  constructor(
    spec: OpenAPISpec,
    emittedHelpers: Set<string>,
    emittedEnums: Map<string, unknown[]>,
    typeMapper: TypeMapper,
  ) {
    this.spec = spec;
    this.state = { emittedHelpers, emittedEnums };
    this.typeMapper = typeMapper;
    this.factory = new FieldHandlerFactory(typeMapper);
  }

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
      const fieldSchemaOrRef = schema.properties[fieldName];
      const fieldSchema = resolveSchema(fieldSchemaOrRef, this.spec);
      if (!fieldSchema) continue;

      const isRequired = required.has(fieldName);
      const suffix = mode === 'input' ? 'Dto' : 'Res';
      const className = toPascalCase(fieldName) + suffix;
      fieldClassNames.push(className);

      if (!this.state.emittedHelpers.has(className)) {
        lines.push(
          ...this.buildField({
            className,
            fieldName,
            schema: fieldSchema,
            required: isRequired,
            mode,
            prefix: '',
            spec: this.spec,
          }),
        );

        this.state.emittedHelpers.add(className);
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

  private buildField(ctx: FieldContext): string[] {
    if (this.state.emittedHelpers.has(ctx.className)) return [];

    const kind = classifySchema(ctx.schema, (ref) =>
      resolveSchema(ref, this.spec),
    );

    const handler = this.factory.get(kind);

    return handler.build(ctx, this.state, (nestedCtx) =>
      this.buildField(nestedCtx),
    );
  }
}

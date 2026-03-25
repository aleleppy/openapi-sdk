import type {
  OpenAPISpec,
  ParsedTag,
  ParsedOperation,
  SchemaObject,
  ReferenceObject,
} from '../types/openapi';
import {
  resolveSchema,
  extractDataSchema,
  toPascalCase,
  operationTypeName,
} from './helpers';
import { schemaRefs } from './schema-refs';
import { TypeMapper } from './type-gen/TypeMapper';
import { ClassBlockBuilder } from './type-gen/ClassBlockBuilder';
import { QueryClassBuilder } from './type-gen/QueryClassBuilder';
import { ImportBuilder } from './type-gen/ImportBuilder';

export class TypeGenerator {
  private readonly tag: ParsedTag;
  private readonly spec: OpenAPISpec;
  private readonly emittedHelpers = new Set<string>();
  private readonly emittedEnums = new Map<string, unknown[]>();
  private readonly typeMapper: TypeMapper;
  private readonly classBlockBuilder: ClassBlockBuilder;
  private readonly queryClassBuilder: QueryClassBuilder;

  constructor(tag: ParsedTag, spec: OpenAPISpec) {
    this.tag = tag;
    this.spec = spec;
    this.typeMapper = new TypeMapper(spec, this.emittedEnums);
    this.classBlockBuilder = new ClassBlockBuilder(
      spec,
      this.emittedHelpers,
      this.emittedEnums,
      this.typeMapper,
    );
    this.queryClassBuilder = new QueryClassBuilder(
      spec,
      this.emittedHelpers,
      this.emittedEnums,
      this.typeMapper,
    );

    const schemas = spec.components?.schemas;
    if (schemas) {
      Object.entries(schemas).forEach(([name, obj]) => {
        schemaRefs.set(name, obj);
      });
    }
  }

  build(): string {
    const blocks = this.generateBlocks();
    if (blocks.length === 0) return '// AUTO GENERATED — DO NOT EDIT\n';

    const enumBlocks = this.buildEnumBlocks();
    const allContent = [...enumBlocks, ...blocks].join('\n');

    return [
      '// AUTO GENERATED — DO NOT EDIT',
      ...new ImportBuilder(allContent).build(),
      ...enumBlocks.flatMap((b) => [b, '']),
      ...blocks.flatMap((b) => [b, '']),
    ].join('\n');
  }

  private getResponseSchema(params: {
    blocks: string[];
    generated: Set<string>;
    responseSchema: SchemaObject | ReferenceObject;
    opName: string;
  }) {
    const { blocks, generated, responseSchema, opName } = params;

    const raw = resolveSchema(responseSchema, this.spec);
    if (!raw) return;

    const name = operationTypeName(opName, 'Response');

    const inner = extractDataSchema(raw, this.spec);

    const schema = inner ?? raw;
    const unwrapped =
      schema.type === 'array' && schema.items
        ? (resolveSchema(schema.items, this.spec) ?? schema)
        : schema;

    blocks.push(
      this.classBlockBuilder.generateClassBlock(name, unwrapped, 'response'),
    );

    generated.add(name);
  }

  private generateBlocks(): string[] {
    const blocks: string[] = [];
    const generated = new Set<string>();

    for (const op of this.tag.operations) {
      this.collectPathParamEnums(op);

      if (op.requestBody) {
        const name = operationTypeName(op.name, 'InputDto');

        if (!generated.has(name)) {
          const schema = resolveSchema(op.requestBody, this.spec);

          if (schema) {
            blocks.push(
              this.classBlockBuilder.generateClassBlock(name, schema, 'input'),
            );

            generated.add(name);
          }
        }
      }

      if (op.queryParams.length > 0) {
        const name = operationTypeName(op.name, 'Query');
        if (!generated.has(name)) {
          blocks.push(
            this.queryClassBuilder.generateQueryClass(name, op.queryParams),
          );
          generated.add(name);
        }
      }

      if (op.responseSchema && !generated.has(op.name)) {
        this.getResponseSchema({
          blocks,
          generated,
          opName: op.name,
          responseSchema: op.responseSchema,
        });
      }
    }

    return blocks;
  }

  private collectPathParamEnums(op: ParsedOperation): void {
    for (const p of op.pathParams) {
      const schema = p.schema ? resolveSchema(p.schema, this.spec) : null;
      if (!schema?.enum) continue;

      const enumRef = toPascalCase(p.name) + 'Enum';
      if (!this.emittedEnums.has(enumRef)) {
        this.emittedEnums.set(enumRef, schema.enum);
      }
    }
  }

  private buildEnumBlocks(): string[] {
    const enumBlocks: string[] = [];

    for (const [enumName, values] of this.emittedEnums) {
      const entries = values
        .map((v) => {
          const key = typeof v === 'string' ? v : `Value${v}`;
          const val = typeof v === 'string' ? `'${v}'` : String(v);
          return `  ${key}: ${val}`;
        })
        .join(',\n');
      enumBlocks.push(
        `export const ${enumName} = {\n${entries},\n} as const;\nexport type ${enumName} = (typeof ${enumName})[keyof typeof ${enumName}];`,
      );
    }

    return enumBlocks;
  }
}

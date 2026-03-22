import type { OpenAPISpec, ParsedTag, SchemaObject, ReferenceObject, ParameterObject } from "../types/openapi";
import { resolveSchema, extractDataSchema, toPascalCase, operationTypeName } from "./helpers";

type Mode = "input" | "response";

export class TypeGenerator {
  private readonly tag: ParsedTag;
  private readonly spec: OpenAPISpec;
  private readonly emittedHelpers = new Set<string>();
  private readonly emittedEnums = new Map<string, unknown[]>();

  constructor(tag: ParsedTag, spec: OpenAPISpec) {
    this.tag = tag;
    this.spec = spec;
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  build(): string {
    const blocks: string[] = [];
    const generated = new Set<string>();

    for (const op of this.tag.operations) {
      // collect enums from path params
      for (const p of op.pathParams) {
        const schema = p.schema ? resolveSchema(p.schema, this.spec) : null;
        if (schema?.enum) {
          const enumRef = toPascalCase(p.name) + "Enum";
          if (!this.emittedEnums.has(enumRef)) {
            this.emittedEnums.set(enumRef, schema.enum);
          }
        }
      }

      if (op.requestBody) {
        const name = operationTypeName(op.name, "InputDto");
        if (!generated.has(name)) {
          const schema = resolveSchema(op.requestBody, this.spec);
          if (schema) {
            blocks.push(this.generateClassBlock(name, schema, "input"));
            generated.add(name);
          }
        }
      }

      if (op.queryParams.length > 0) {
        const name = operationTypeName(op.name, "Query");
        if (!generated.has(name)) {
          blocks.push(this.generateQueryClass(name, op.queryParams));
          generated.add(name);
        }
      }

      if (op.responseSchema) {
        const name = operationTypeName(op.name, "Response");
        if (!generated.has(name)) {
          const raw = resolveSchema(op.responseSchema, this.spec);
          if (raw) {
            const inner = extractDataSchema(raw, this.spec);
            const schema = inner ?? raw;
            const unwrapped =
              schema.type === "array" && schema.items ? (resolveSchema(schema.items, this.spec) ?? schema) : schema;
            blocks.push(this.generateClassBlock(name, unwrapped, "response"));
            generated.add(name);
          }
        }
      }
    }

    if (blocks.length === 0) return "// AUTO GENERATED — DO NOT EDIT\n";

    const enumBlocks: string[] = [];
    for (const [enumName, values] of this.emittedEnums) {
      const members = values.map((v) => `  ${String(v)} = '${String(v)}',`).join("\n");
      enumBlocks.push(`export enum ${enumName} {\n${members}\n}`);
    }

    const allContent = [...enumBlocks, ...blocks].join("\n");

    const swaggerImports: string[] = [];
    if (allContent.includes("@ApiProperty")) swaggerImports.push("ApiProperty");
    if (allContent.includes("IntersectionType")) swaggerImports.push("IntersectionType");

    const validatorImports: string[] = [];
    if (allContent.includes("@IsString")) validatorImports.push("IsString");
    if (allContent.includes("@IsNotEmpty")) validatorImports.push("IsNotEmpty");
    if (allContent.includes("@IsNumber")) validatorImports.push("IsNumber");
    if (allContent.includes("@IsBoolean")) validatorImports.push("IsBoolean");
    if (allContent.includes("@IsOptional")) validatorImports.push("IsOptional");
    if (allContent.includes("@IsEnum")) validatorImports.push("IsEnum");

    const lines: string[] = ["// AUTO GENERATED — DO NOT EDIT"];
    if (swaggerImports.length > 0) {
      lines.push(`import { ${swaggerImports.join(", ")} } from '@nestjs/swagger';`);
    }
    if (validatorImports.length > 0) {
      lines.push(`import { ${validatorImports.join(", ")} } from 'class-validator';`);
    }
    lines.push("");

    return [...lines, ...enumBlocks.flatMap((b) => [b, ""]), ...blocks.flatMap((b) => [b, ""])].join("\n");
  }

  // ─── class block ─────────────────────────────────────────────────────────────

  private generateClassBlock(name: string, schema: SchemaObject, mode: Mode): string {
    if (!schema.properties) {
      return `export type ${name} = ${this.mapType(schema)};`;
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
      const suffix = mode === "input" ? "Dto" : "Res";
      const className = toPascalCase(fieldName) + suffix;
      fieldClassNames.push(className);

      if (!this.emittedHelpers.has(className)) {
        lines.push(...this.generateFieldClass(className, fieldName, fieldSchema, isReq, mode));
        lines.push("");
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

    return lines.join("\n");
  }

  private generateFieldClass(
    className: string,
    fieldName: string,
    schema: SchemaObject,
    required: boolean,
    mode: Mode,
    prefix: string = "",
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
        const suffix = mode === "input" ? "Dto" : "Res";
        const nestedClass = nestedPrefix + toPascalCase(nestedField) + suffix;
        nestedClassNames.push(nestedClass);

        if (!this.emittedHelpers.has(nestedClass)) {
          lines.push(...this.generateFieldClass(nestedClass, nestedField, nestedSchema, isReq, mode, nestedPrefix));
          lines.push("");
          this.emittedHelpers.add(nestedClass);
        }
      }

      // combined type class for the nested object
      const typeName = nestedPrefix + (mode === "input" ? "DtoType" : "ResType");
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
      lines.push("");

      // parent field class referencing the nested type
      lines.push(`class ${className} {`);
      lines.push(`  @ApiProperty({ type: ${typeName} })`);
      if (mode === "input" && optional) lines.push("  @IsOptional()");
      const bang = optional ? "" : "!";
      const question = optional ? "?" : "";
      lines.push(`  ${fieldName}${question}${bang}: ${typeName};`);
      lines.push("}");

      return lines;
    }

    // ─── array of objects → generate item class + isArray ────────────────
    if (schema.type === "array" && schema.items) {
      const itemSchema = resolveSchema(schema.items, this.spec);
      if (itemSchema?.properties && Object.keys(itemSchema.properties).length > 0) {
        // Delegate to nested object generation for the item type
        const itemClassName = className + "Item";
        const itemLines = this.generateFieldClass(itemClassName, fieldName, itemSchema, true, mode, prefix);

        // The last generated type class is the one we reference
        const nestedPrefix = prefix + toPascalCase(fieldName);
        const typeName = nestedPrefix + (mode === "input" ? "DtoType" : "ResType");

        const lines: string[] = [...itemLines];
        // Remove the wrapping field class that generateFieldClass added (last class block)
        // and replace it with our array version
        const lastClassIdx = lines.lastIndexOf(`class ${itemClassName} {`);
        if (lastClassIdx !== -1) {
          lines.splice(lastClassIdx); // remove from the item wrapper class onwards
        }
        lines.push("");
        lines.push(`class ${className} {`);
        lines.push(`  @ApiProperty({ type: ${typeName}, isArray: true })`);
        if (mode === "input" && optional) lines.push("  @IsOptional()");
        const bang = optional ? "" : "!";
        const question = optional ? "?" : "";
        lines.push(`  ${fieldName}${question}${bang}: ${typeName}[];`);
        lines.push("}");
        return lines;
      }
    }

    // ─── array of enums → enum ref + isArray ────────────────────────────
    if (schema.type === "array" && schema.items) {
      const itemSchema = resolveSchema(schema.items, this.spec);
      if (itemSchema?.enum) {
        const enumRef = toPascalCase(fieldName) + "Enum";
        if (!this.emittedEnums.has(enumRef)) {
          this.emittedEnums.set(enumRef, itemSchema.enum);
        }

        const lines: string[] = [`class ${className} {`];
        lines.push(
          `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', isArray: true, example: Object.values(${enumRef}) })`,
        );
        if (mode === "input") {
          if (optional) lines.push("  @IsOptional()");
          lines.push(`  @IsEnum(${enumRef}, { each: true })`);
        }
        const bang = optional ? "" : "!";
        const question = optional ? "?" : "";
        lines.push(`  ${fieldName}${question}${bang}: ${enumRef}[];`);
        lines.push("}");
        return lines;
      }
    }

    // ─── primitive / enum / array field ────────────────────────────────────
    const example = schema.example !== undefined ? schema.example : this.defaultExample(schema);
    const isDateByExample = mode === "response" && typeof example === "string" && this.looksLikeDate(example);
    const tsType = schema.enum ? toPascalCase(fieldName) + "Enum" : isDateByExample ? "Date" : this.mapType(schema, fieldName);
    const apiType = isDateByExample ? "Date" : this.mapApiPropertyType(schema);
    const exampleStr = typeof example === "string" ? `'${example}'` : JSON.stringify(example);

    const lines: string[] = [`class ${className} {`];

    if (schema.enum) {
      const enumRef = toPascalCase(fieldName) + "Enum";
      if (!this.emittedEnums.has(enumRef)) {
        this.emittedEnums.set(enumRef, schema.enum);
      }
      lines.push(
        `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: Object.values(${enumRef})[0] })`,
      );
    } else if (schema.type === "object") {
      lines.push(`  @ApiProperty({ example: {} })`);
    } else {
      lines.push(`  @ApiProperty({ type: ${apiType}, example: ${exampleStr} })`);
    }

    if (mode === "input") {
      if (optional) lines.push("  @IsOptional()");

      if (schema.enum) {
        const enumRef = toPascalCase(fieldName) + "Enum";
        lines.push(`  @IsEnum(${enumRef})`);
      } else {
        switch (schema.type) {
          case "string":
            lines.push("  @IsString()");
            if (!optional) lines.push("  @IsNotEmpty()");
            break;
          case "integer":
          case "number":
            lines.push("  @IsNumber()");
            break;
          case "boolean":
            lines.push("  @IsBoolean()");
            break;
        }
      }
    }

    const bang = optional ? "" : "!";
    const question = optional ? "?" : "";
    lines.push(`  ${fieldName}${question}${bang}: ${tsType};`);
    lines.push("}");

    return lines;
  }

  // ─── query class ─────────────────────────────────────────────────────────────

  private generateQueryClass(name: string, params: ParameterObject[]): string {
    if (params.length === 0) return `export type ${name} = Record<string, unknown>;`;

    const lines: string[] = [];
    const fieldClassNames: string[] = [];

    for (const param of params) {
      const schema = param.schema ? resolveSchema(param.schema, this.spec) : null;
      const className = toPascalCase(param.name) + "QueryDto";
      fieldClassNames.push(className);

      if (!this.emittedHelpers.has(className)) {
        const isReq = !!param.required;
        const optional = !isReq;

        // Detect enum (direct or array of enum)
        const itemSchema = schema?.type === "array" && schema.items ? resolveSchema(schema.items, this.spec) : null;
        const enumSource = schema?.enum ? schema : itemSchema?.enum ? itemSchema : null;
        const enumRef = enumSource?.enum ? toPascalCase(param.name) + "Enum" : null;

        if (enumRef && enumSource?.enum) {
          if (!this.emittedEnums.has(enumRef)) {
            this.emittedEnums.set(enumRef, enumSource.enum);
          }
        }

        const tsType = enumRef ? (schema?.type === "array" ? `${enumRef}[]` : enumRef) : schema ? this.mapType(schema) : "string";

        const example = schema?.example !== undefined ? schema.example : this.defaultExample(schema ?? { type: "string" });
        const exampleStr = typeof example === "string" ? `'${example}'` : JSON.stringify(example);

        lines.push(`class ${className} {`);
        if (enumRef) {
          const enumExample = schema?.type === "array" ? `Object.values(${enumRef})` : `Object.values(${enumRef})[0]`;
          if (schema?.type === "array") {
            lines.push(
              `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', isArray: true, example: ${enumExample} })`,
            );
          } else {
            lines.push(
              `  @ApiProperty({ enum: ${enumRef}, enumName: '${enumRef}', example: ${enumExample} })`,
            );
          }
        } else {
          const apiType = schema ? this.mapApiPropertyType(schema) : "'string'";
          lines.push(`  @ApiProperty({ type: ${apiType}, example: ${exampleStr} })`);
        }

        if (optional) lines.push("  @IsOptional()");
        if (enumRef) {
          lines.push(`  @IsEnum(${enumRef}${schema?.type === "array" ? ", { each: true }" : ""})`);
        } else if (schema?.type === "number" || schema?.type === "integer") {
          lines.push("  @IsNumber()");
        } else {
          lines.push("  @IsString()");
        }

        const bang = optional ? "" : "!";
        const q = optional ? "?" : "";
        lines.push(`  ${param.name}${q}${bang}: ${tsType};`);
        lines.push("}");
        lines.push("");
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

    return lines.join("\n");
  }

  // ─── type mapping ─────────────────────────────────────────────────────────────

  private mapType(schema: SchemaObject, fieldName?: string): string {
    if (schema.enum) {
      if (fieldName) {
        const enumRef = toPascalCase(fieldName) + "Enum";
        if (!this.emittedEnums.has(enumRef)) {
          this.emittedEnums.set(enumRef, schema.enum);
        }
        return enumRef;
      }
      return schema.enum.map((v) => (typeof v === "string" ? `'${v}'` : v)).join(" | ");
    }
    if (schema.oneOf || schema.anyOf) {
      return (schema.oneOf || schema.anyOf)!
        .map((v) => {
          const r = resolveSchema(v, this.spec);
          return r ? this.mapType(r, fieldName) : "unknown";
        })
        .join(" | ");
    }
    if (schema.properties && Object.keys(schema.properties).length > 0) {
      const req = new Set(schema.required || []);
      const fields = Object.entries(schema.properties).map(([key, val]) => {
        const resolved = resolveSchema(val as SchemaObject | ReferenceObject, this.spec);
        const tsType = resolved ? this.mapType(resolved, key) : "unknown";
        const opt = req.has(key) ? "" : "?";
        return `${key}${opt}: ${tsType}`;
      });
      return `{ ${fields.join("; ")} }`;
    }
    switch (schema.type) {
      case "string":
        return schema.format === "date-time" || schema.format === "date" ? "Date" : "string";
      case "integer":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "array": {
        if (schema.items) {
          const item = resolveSchema(schema.items, this.spec);
          return `${item ? this.mapType(item, fieldName) : "unknown"}[]`;
        }
        return "unknown[]";
      }
      case "object": {
        if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
          const val = resolveSchema(schema.additionalProperties as SchemaObject, this.spec);
          return `Record<string, ${val ? this.mapType(val) : "unknown"}>`;
        }
        return "Record<string, unknown>";
      }
      default:
        return "unknown";
    }
  }

  private mapApiPropertyType(schema: SchemaObject): string {
    if (schema.enum) return "'string'";
    switch (schema.type) {
      case "string":
        return schema.format === "date-time" || schema.format === "date" ? "Date" : "'string'";
      case "integer":
      case "number":
        return "'number'";
      case "boolean":
        return "'boolean'";
      case "array":
        return "'array'";
      case "object":
        return "'object'";
      default:
        return "'string'";
    }
  }

  private defaultExample(schema: SchemaObject): unknown {
    if (schema.enum) return schema.enum[0] ?? "VALUE";
    switch (schema.type) {
      case "string":
        return "example";
      case "integer":
      case "number":
        return 0;
      case "boolean":
        return true;
      default:
        return null;
    }
  }

  private looksLikeDate(value: string): boolean {
    const d = new Date(value);
    return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(value);
  }
}

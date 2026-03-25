export class ImportBuilder {
  private readonly allContent: string;

  constructor(allContent: string) {
    this.allContent = allContent;
  }

  private static readonly SWAGGER_TOKENS = ['@ApiProperty', 'IntersectionType'];

  private static readonly VALIDATOR_DECORATORS = [
    'IsString',
    'IsNotEmpty',
    'IsNumber',
    'IsBoolean',
    'IsOptional',
    'IsEnum',
  ];

  private getSwaggerImports(): string[] {
    return ImportBuilder.SWAGGER_TOKENS
      .filter((t) => this.allContent.includes(t))
      .map((t) => t.replace('@', ''));
  }

  private getValidatorImports(): string[] {
    return ImportBuilder.VALIDATOR_DECORATORS.filter((d) =>
      this.allContent.includes(`@${d}`),
    );
  }

  build(): string[] {
    const lines: string[] = [];

    const swaggerImports = this.getSwaggerImports();
    const validatorImports = this.getValidatorImports();

    if (swaggerImports.length > 0) {
      lines.push(
        `import { ${swaggerImports.join(', ')} } from '@nestjs/swagger';`,
      );
    }

    if (validatorImports.length > 0) {
      lines.push(
        `import { ${validatorImports.join(', ')} } from 'class-validator';`,
      );
    }

    lines.push('');
    return lines;
  }
}

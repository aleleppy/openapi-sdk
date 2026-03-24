import * as path from 'path';
import { Source } from '../../generator/source';
import type { OpenAPISpec, SchemaConfig, ParsedTag } from '../../types/openapi';

export class ReadmeBuilder {
  async build(
    config: SchemaConfig,
    spec: OpenAPISpec,
    tags: ParsedTag[],
    outputDir: string,
  ): Promise<void> {
    const apiName = config.name;
    const title   = spec.info.title;
    const version = spec.info.version;

    // First service slug (for usage snippet)
    const firstTag  = tags[0];
    const firstSlug = firstTag?.slug ?? 'example';

    // Derive a PascalCase service name from the slug
    const toServiceName = (slug: string): string =>
      slug
        .split(/[-_]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('') + 'Service';

    const firstServiceName = toServiceName(firstSlug);
    const firstMethod      = firstTag?.operations[0]?.name ?? 'findAll';

    // Build services table section
    const servicesSections = tags.map((tag) => {
      const serviceName = toServiceName(tag.slug);
      const rows = tag.operations.map((op) => {
        const method   = op.method.toUpperCase();
        const endpoint = op.path;
        const desc     = op.summary ?? '';
        return `| \`${op.name}\` | ${method} ${endpoint} | ${desc} |`;
      });

      return [
        `### ${serviceName}`,
        '| Method | Endpoint | Description |',
        '|--------|----------|-------------|',
        ...rows,
      ].join('\n');
    });

    const lines = [
      `# ${apiName} SDK`,
      '',
      `> Auto-generated from ${title} v${version}`,
      `> **Do not edit manually — regenerate with \`openapi-sdk generate\`**`,
      '',
      '## Services',
      '',
      servicesSections.join('\n\n'),
      '',
      '## Usage',
      '',
      '```ts',
      `import { ${firstServiceName} } from '@myapp/sdk/${apiName}';`,
      '',
      `const svc = new ${firstServiceName}();`,
      `const result = await svc.${firstMethod}();`,
      '```',
      '',
    ];

    const file = new Source({ path: path.join(outputDir, 'README.md') });
    file.changeData(lines.join('\n'));
    await file.save();
    console.log(`  📝 ${path.relative(process.cwd(), file.path)}`);
  }
}

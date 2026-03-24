import * as path from 'path';
import { Source } from '../../generator/source';
import type { ParsedTag } from '../../types/openapi';

export class IndexBuilder {
  async build(
    tagResults: Map<string, { hasTypes: boolean }>,
    tags: ParsedTag[],
    outputDir: string,
  ): Promise<void> {
    const lines = ['// AUTO GENERATED — DO NOT EDIT', ''];

    for (const tag of tags) {
      const result = tagResults.get(tag.slug);
      if (result?.hasTypes) {
        lines.push(`export * from './${tag.slug}/${tag.slug}.types';`);
      }
      lines.push(`export * from './${tag.slug}/${tag.slug}.module';`);
    }

    lines.push('');

    const file = new Source({ path: path.join(outputDir, 'index.ts') });
    file.changeData(lines.join('\n'));
    await file.save();
    console.log(`  📝 ${path.relative(process.cwd(), file.path)}`);
  }
}

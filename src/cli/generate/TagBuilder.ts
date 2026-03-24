import * as fs from 'fs';
import * as path from 'path';
import { TypeGenerator } from '../../generator/type-gen';
import { ModuleGenerator } from '../../generator/module-gen';
import { Source } from '../../generator/source';
import type { OpenAPISpec, ParsedTag, SchemaConfig } from '../../types/openapi';

export interface TagBuilderEntry {
  config: SchemaConfig;
  spec: OpenAPISpec;
  tags: ParsedTag[];
  outputDir: string;
}

export class TagBuilder {
  async build(
    tag: ParsedTag,
    entry: TagBuilderEntry,
    outputDir: string,
  ): Promise<{ hasTypes: boolean }> {
    const tagDir = path.join(outputDir, tag.slug);
    fs.mkdirSync(tagDir, { recursive: true });

    const typesContent = new TypeGenerator(tag, entry.spec).build();
    const hasTypes = typesContent.includes('export ');

    if (hasTypes) {
      const typesFile = new Source({ path: path.join(tagDir, `${tag.slug}.types.ts`) });
      typesFile.changeData(typesContent);
      await typesFile.save();
      console.log(`  📝 ${path.relative(process.cwd(), typesFile.path)}`);
    }

    const moduleFile = new Source({ path: path.join(tagDir, `${tag.slug}.module.ts`) });
    moduleFile.changeData(
      new ModuleGenerator(tag, entry.spec, entry.config.apiUrl, entry.config.name).build(),
    );
    await moduleFile.save();
    console.log(`  📝 ${path.relative(process.cwd(), moduleFile.path)}`);

    return { hasTypes };
  }
}

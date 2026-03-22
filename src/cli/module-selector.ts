import { checkbox } from '@inquirer/prompts';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIParser } from '../generator/parser';
import type { OpenAPISpec, SchemaConfig, ParsedTag } from '../types/openapi';

export class ModuleSelector {
  private readonly configPath: string;

  constructor(dir: string = process.cwd()) {
    this.configPath = path.join(dir, 'schema.json');
  }

  async select(spec: OpenAPISpec, config: SchemaConfig): Promise<string[]> {
    const tags = new OpenAPIParser(spec).tags;

    if (tags.length === 0) {
      console.log('No modules found in the spec.');
      return [];
    }

    const selected = await checkbox<string>({
      message: 'Select modules to generate:',
      choices: tags.map((t) => ({
        name: `${t.name} (${t.operations.length} endpoints) → ${t.slug}/`,
        value: t.name,
        checked: config.selectedTags
          ? config.selectedTags.includes(t.name)
          : false,
      })),
    });

    if (selected.length === 0) {
      console.warn('Warning: no modules selected. Nothing will be generated.');
    }

    const updatedConfig: SchemaConfig = { ...config, selectedTags: selected };
    fs.writeFileSync(this.configPath, JSON.stringify(updatedConfig, null, 2) + '\n', 'utf-8');
    console.log(`Saved ${selected.length} module(s) to schema.json`);

    return selected;
  }
}

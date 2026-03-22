import { checkbox } from '@inquirer/prompts';
import { OpenAPIParser } from '../generator/parser';
import { OpenAPIFetcher } from '../generator/fetcher';
import type { OpenAPISpec, SchemaConfig } from '../types/openapi';

export class ModuleSelector {
  private readonly fetcher: OpenAPIFetcher;

  constructor(dir?: string) {
    this.fetcher = new OpenAPIFetcher(dir);
  }

  async select(spec: OpenAPISpec, config: SchemaConfig): Promise<string[]> {
    const tags = new OpenAPIParser(spec).tags;

    if (tags.length === 0) {
      console.log('No modules found in the spec.');
      return [];
    }

    const selected = await checkbox<string>({
      message: `Select modules for ${config.apiUrl}:`,
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

    // update this config in the array and save
    const configs = this.fetcher.configs.map((c) =>
      c.docUrl === config.docUrl ? { ...c, selectedTags: selected } : c,
    );
    this.fetcher.saveConfigs(configs);
    console.log(`Saved ${selected.length} module(s) to schema.json`);

    return selected;
  }
}

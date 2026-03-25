import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIFetcher } from '../generator/fetcher';
import { OpenAPIParser } from '../generator/parser';
import { ModuleSelector } from './module-selector';
import { BaseServiceBuilder } from './generate/BaseServiceBuilder';
import { TagBuilder } from './generate/TagBuilder';
import { IndexBuilder } from './generate/IndexBuilder';
import { ReadmeBuilder } from './generate/ReadmeBuilder';
import type { OpenAPISpec, SchemaConfig, ParsedTag } from '../types/openapi';

export interface GenerateOptions {
  forceSelect?: boolean;
  generateAll?: boolean;
}

export class SDKGenerator {
  private readonly entries: Array<{
    config: SchemaConfig;
    spec: OpenAPISpec;
    tags: ParsedTag[];
    outputDir: string;
  }>;

  private constructor(entries: SDKGenerator['entries']) {
    this.entries = entries;
  }

  static async create(
    dir?: string,
    options: GenerateOptions = {},
  ): Promise<SDKGenerator> {
    const fetcher = new OpenAPIFetcher(dir);
    const selector = new ModuleSelector(dir);
    const entries: SDKGenerator['entries'] = [];

    for (let config of fetcher.configs) {
      const spec = await fetcher.fetch(config);
      const allTags = new OpenAPIParser(spec).tags;

      if (options.generateAll) {
        config = { ...config, selectedTags: undefined };
      } else {
        const needsSelection =
          options.forceSelect || config.selectedTags === undefined;
        if (needsSelection) {
          const selected = await selector.select(spec, config);
          config = { ...config, selectedTags: selected };
        }
      }

      let tags: ParsedTag[];
      if (config.selectedTags) {
        tags = allTags.filter((t) => config.selectedTags!.includes(t.name));
        const missing = config.selectedTags.filter(
          (name) => !allTags.some((t) => t.name === name),
        );
        if (missing.length > 0) {
          console.warn(
            `⚠️  Tags not found in spec (${config.apiUrl}): ${missing.join(', ')}`,
          );
        }
      } else {
        tags = allTags;
      }

      const safeName = config.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sdkRoot2 = path.resolve(process.cwd(), 'src/sdk');
      const outputDir = path.resolve(sdkRoot2, safeName);
      if (
        !outputDir.startsWith(sdkRoot2 + path.sep) &&
        outputDir !== sdkRoot2
      ) {
        throw new Error(
          `Invalid config name (path traversal detected): ${config.name}`,
        );
      }

      entries.push({ config, spec, tags, outputDir });
    }

    return new SDKGenerator(entries);
  }

  // ─── orchestrator ─────────────────────────────────────────────────────────────

  async build(): Promise<void> {
    console.log("🦍 openapi-sdk generate — let's gooooooo!");

    const sdkRoot = path.resolve(process.cwd(), 'src/sdk');
    fs.mkdirSync(sdkRoot, { recursive: true });

    await new BaseServiceBuilder().build(sdkRoot);

    const tagBuilder = new TagBuilder();
    const indexBuilder = new IndexBuilder();
    const readmeBuilder = new ReadmeBuilder();

    for (const entry of this.entries) {
      console.log('');
      console.log(`📡 Spec: ${entry.config.docUrl}`);
      console.log(
        `✅ Loaded: ${entry.spec.info.title} v${entry.spec.info.version}`,
      );

      fs.mkdirSync(entry.outputDir, { recursive: true });

      const tagResults = new Map<string, { hasTypes: boolean }>();
      for (const tag of entry.tags) {
        tagResults.set(
          tag.slug,
          await tagBuilder.build(tag, entry, entry.outputDir),
        );
      }

      await indexBuilder.build(tagResults, entry.tags, entry.outputDir);
      await readmeBuilder.build(
        entry.config,
        entry.spec,
        entry.tags,
        entry.outputDir,
      );
    }

    console.log('');
    console.log('🎉 SDK generated successfully!');
  }
}

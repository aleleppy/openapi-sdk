import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIFetcher } from '../generator/fetcher';
import { OpenAPIParser } from '../generator/parser';
import { TypeGenerator } from '../generator/type-gen';
import { ModuleGenerator } from '../generator/module-gen';
import type { OpenAPISpec, SchemaConfig, ParsedTag } from '../types/openapi';

export class SDKGenerator {
  readonly config:    SchemaConfig;
  readonly spec:      OpenAPISpec;
  readonly tags:      ParsedTag[];
  readonly outputDir: string;

  private constructor(config: SchemaConfig, spec: OpenAPISpec) {
    this.config    = config;
    this.spec      = spec;
    this.tags      = new OpenAPIParser(spec).tags;
    this.outputDir = path.resolve(process.cwd(), config.output);
  }

  static async create(dir?: string): Promise<SDKGenerator> {
    const fetcher = new OpenAPIFetcher(dir);
    const spec    = await fetcher.fetch();
    return new SDKGenerator(fetcher.config, spec);
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  build(): void {
    console.log("🦍 openapi-sdk generate — let's go!");
    console.log('');
    console.log(`📡 Spec: ${this.config.url}`);
    console.log(`✅ Loaded: ${this.spec.info.title} v${this.spec.info.version}`);
    console.log(`📦 Found ${this.tags.length} tag(s)`);
    this.tags.forEach((t) => console.log(`   · "${t.name}" → ${t.slug}/`));
    console.log('');

    for (const tag of this.tags) {
      this.buildTag(tag);
    }

    this.buildBarrelIndex();

    console.log('');
    console.log('🎉 SDK generated successfully!');
  }

  // ─── private builders ────────────────────────────────────────────────────────

  private buildTag(tag: ParsedTag): void {
    const tagDir = path.join(this.outputDir, tag.slug);
    fs.mkdirSync(tagDir, { recursive: true });

    const typesContent = new TypeGenerator(tag, this.spec).build();
    const typesFile    = path.join(tagDir, `${tag.slug}.types.ts`);
    fs.writeFileSync(typesFile, typesContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), typesFile)}`);

    const moduleContent = new ModuleGenerator(tag, this.spec).build();
    const moduleFile    = path.join(tagDir, `${tag.slug}.module.ts`);
    fs.writeFileSync(moduleFile, moduleContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), moduleFile)}`);
  }

  private buildBarrelIndex(): void {
    const lines = ['// AUTO GENERATED — DO NOT EDIT', ''];

    for (const tag of this.tags) {
      lines.push(`export * from './${tag.slug}/${tag.slug}.types';`);
      lines.push(`export * from './${tag.slug}/${tag.slug}.module';`);
    }

    lines.push('');

    const indexFile = path.join(this.outputDir, 'index.ts');
    fs.writeFileSync(indexFile, lines.join('\n'), 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), indexFile)}`);
  }
}

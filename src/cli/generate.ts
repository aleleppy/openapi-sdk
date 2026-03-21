import * as fs from 'fs';
import * as path from 'path';
import { readSchemaConfig, fetchOpenAPISpec } from '../generator/fetcher';
import { parseSpec } from '../generator/parser';
import { generateTypes } from '../generator/type-gen';
import { generateModule } from '../generator/module-gen';

export async function runGenerate(): Promise<void> {
  console.log("🦍 openapi-sdk generate — let's go!");
  console.log('');

  const config = readSchemaConfig();
  console.log(`📡 Fetching OpenAPI spec from: ${config.url}`);

  const spec = await fetchOpenAPISpec(config);
  console.log(`✅ Spec loaded: ${spec.info.title} v${spec.info.version}`);

  const tags = parseSpec(spec);
  console.log(`📦 Found ${tags.length} tag(s)`);
  tags.forEach((t) => console.log(`   · "${t.name}" → ${t.slug}/`));
  console.log('');

  const outputDir = path.resolve(process.cwd(), config.output);

  for (const tag of tags) {
    const tagDir = path.join(outputDir, tag.slug);
    fs.mkdirSync(tagDir, { recursive: true });

    const typesContent  = generateTypes(tag, spec);
    const typesFile     = path.join(tagDir, `${tag.slug}.types.ts`);
    fs.writeFileSync(typesFile, typesContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), typesFile)}`);

    const moduleContent = generateModule(tag, spec);
    const moduleFile    = path.join(tagDir, `${tag.slug}.module.ts`);
    fs.writeFileSync(moduleFile, moduleContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), moduleFile)}`);
  }

  // Barrel index
  const indexLines = ['// AUTO GENERATED — DO NOT EDIT', ''];
  for (const tag of tags) {
    indexLines.push(`export * from './${tag.slug}/${tag.slug}.types';`);
    indexLines.push(`export * from './${tag.slug}/${tag.slug}.module';`);
  }
  indexLines.push('');

  const indexFile = path.join(outputDir, 'index.ts');
  fs.writeFileSync(indexFile, indexLines.join('\n'), 'utf-8');
  console.log(`  📝 ${path.relative(process.cwd(), indexFile)}`);

  console.log('');
  console.log('🎉 SDK generated successfully!');
}

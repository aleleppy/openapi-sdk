import * as fs from 'fs';
import * as path from 'path';
import { readSchemaConfig, fetchOpenAPISpec } from '../generator/fetcher';
import { parseSpec } from '../generator/parser';
import { generateTypes } from '../generator/type-gen';
import { generateModule } from '../generator/module-gen';

/**
 * Main generation command.
 * Reads schema.json, fetches the OpenAPI spec, and generates SDK files.
 */
export async function runGenerate(): Promise<void> {
  console.log('🦍 openapi-sdk generate — let\'s go!');
  console.log('');

  // 1. Read config
  const config = readSchemaConfig();
  console.log(`📡 Fetching OpenAPI spec from: ${config.url}`);

  // 2. Fetch spec
  const spec = await fetchOpenAPISpec(config);
  console.log(`✅ Spec loaded: ${spec.info.title} v${spec.info.version}`);

  // 3. Parse into tags
  const tags = parseSpec(spec);
  console.log(`📦 Found ${tags.length} tag(s): ${tags.map((t) => t.name).join(', ')}`);

  // 4. Generate output
  const outputDir = path.resolve(process.cwd(), config.output);

  for (const tag of tags) {
    const tagDir = path.join(outputDir, toKebab(tag.name));
    fs.mkdirSync(tagDir, { recursive: true });

    // Generate types file
    const typesContent = generateTypes(tag, spec);
    const typesFile = path.join(tagDir, `${toKebab(tag.name)}.types.ts`);
    fs.writeFileSync(typesFile, typesContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), typesFile)}`);

    // Generate module file
    const moduleContent = generateModule(tag, spec);
    const moduleFile = path.join(tagDir, `${toKebab(tag.name)}.module.ts`);
    fs.writeFileSync(moduleFile, moduleContent, 'utf-8');
    console.log(`  📝 ${path.relative(process.cwd(), moduleFile)}`);
  }

  // 5. Generate index barrel
  const indexLines = ['// AUTO GENERATED — DO NOT EDIT', ''];
  for (const tag of tags) {
    const kebab = toKebab(tag.name);
    indexLines.push(`export * from './${kebab}/${kebab}.types';`);
    indexLines.push(`export * from './${kebab}/${kebab}.module';`);
  }
  indexLines.push('');

  const indexFile = path.join(outputDir, 'index.ts');
  fs.writeFileSync(indexFile, indexLines.join('\n'), 'utf-8');
  console.log(`  📝 ${path.relative(process.cwd(), indexFile)}`);

  console.log('');
  console.log('🎉 SDK generated successfully!');
}

function toKebab(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase();
}

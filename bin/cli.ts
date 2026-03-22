#!/usr/bin/env node

import { Command } from 'commander';
import { SDKSetup }     from '../src/cli/setup';
import { SDKGenerator } from '../src/cli/generate';
import { ModuleSelector } from '../src/cli/module-selector';
import { OpenAPIFetcher } from '../src/generator/fetcher';
import * as path from 'path';

// resolve package.json from dist/bin/ → ../../package.json (root)
const pkg = require(path.resolve(__dirname, '../../package.json'));

const program = new Command();

program
  .name('openapi-sdk')
  .description('Generate typed TypeScript SDK from an OpenAPI 3.x spec 🦍')
  .version(pkg.version);

program
  .command('setup')
  .description('Create a schema.json config file in the current directory')
  .option('-d, --doc-url <url>', 'OpenAPI spec URL')
  .option('-a, --api-url <url>', 'Base API URL')
  .option('-k, --api-key <key>', 'API key for authentication')
  .option('-o, --output <dir>', 'Output directory for generated SDK', 'src/sdk')
  .action((options) => {
    new SDKSetup({
      docUrl: options.docUrl,
      apiUrl: options.apiUrl,
      apiKey: options.apiKey,
      output: options.output,
    }).run();
  });

program
  .command('generate')
  .description('Fetch OpenAPI spec and generate the TypeScript SDK')
  .option('--all', 'Generate all modules, ignoring saved preferences')
  .option('--select', 'Force interactive module selection before generating')
  .action(async (options) => {
    try {
      const generator = await SDKGenerator.create(undefined, {
        forceSelect: options.select,
        generateAll: options.all,
      });
      await generator.build();
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('select')
  .description('Fetch spec and interactively select which modules to generate')
  .action(async () => {
    try {
      const fetcher  = new OpenAPIFetcher();
      const selector = new ModuleSelector();
      for (const config of fetcher.configs) {
        const spec = await fetcher.fetch(config);
        await selector.select(spec, config);
      }
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();

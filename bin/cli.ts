#!/usr/bin/env node

import { Command } from 'commander';
import { runSetup } from '../src/cli/setup';
import { runGenerate } from '../src/cli/generate';
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
  .option('-u, --url <url>', 'OpenAPI spec URL')
  .option('-k, --api-key <key>', 'API key for authentication')
  .option('-o, --output <dir>', 'Output directory for generated SDK', 'src/sdk')
  .action((options) => {
    runSetup({
      url: options.url,
      apiKey: options.apiKey,
      output: options.output,
    });
  });

program
  .command('generate')
  .description('Fetch OpenAPI spec and generate the TypeScript SDK')
  .action(async () => {
    try {
      await runGenerate();
    } catch (err: any) {
      console.error(`❌ Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();

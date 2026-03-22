import * as fs from 'fs';
import * as path from 'path';
import { OpenAPIFetcher } from '../generator/fetcher';
import { OpenAPIParser } from '../generator/parser';
import { TypeGenerator } from '../generator/type-gen';
import { ModuleGenerator } from '../generator/module-gen';
import { ModuleSelector } from './module-selector';
import { Source } from '../generator/source';
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

  static async create(dir?: string, options: GenerateOptions = {}): Promise<SDKGenerator> {
    const fetcher  = new OpenAPIFetcher(dir);
    const selector = new ModuleSelector(dir);
    const entries: SDKGenerator['entries'] = [];

    for (let config of fetcher.configs) {
      const spec    = await fetcher.fetch(config);
      const allTags = new OpenAPIParser(spec).tags;

      if (options.generateAll) {
        config = { ...config, selectedTags: undefined };
      } else {
        const needsSelection = options.forceSelect || config.selectedTags === undefined;
        if (needsSelection) {
          const selected = await selector.select(spec, config);
          config = { ...config, selectedTags: selected };
        }
      }

      let tags: ParsedTag[];
      if (config.selectedTags) {
        tags = allTags.filter((t) => config.selectedTags!.includes(t.name));
        const missing = config.selectedTags.filter((name) => !allTags.some((t) => t.name === name));
        if (missing.length > 0) {
          console.warn(`⚠️  Tags not found in spec (${config.apiUrl}): ${missing.join(', ')}`);
        }
      } else {
        tags = allTags;
      }

      const safeName = config.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const sdkRoot2 = path.resolve(process.cwd(), 'src/sdk');
      const outputDir = path.resolve(sdkRoot2, safeName);
      if (!outputDir.startsWith(sdkRoot2 + path.sep) && outputDir !== sdkRoot2) {
        throw new Error(`Invalid config name (path traversal detected): ${config.name}`);
      }

      entries.push({
        config,
        spec,
        tags,
        outputDir,
      });
    }

    return new SDKGenerator(entries);
  }

  // ─── public API ──────────────────────────────────────────────────────────────

  async build(): Promise<void> {
    console.log("🦍 openapi-sdk generate — let's go!");

    const sdkRoot = path.resolve(process.cwd(), 'src/sdk');
    fs.mkdirSync(sdkRoot, { recursive: true });
    await this.buildBaseService(sdkRoot);

    for (const entry of this.entries) {
      console.log('');
      console.log(`📡 Spec: ${entry.config.docUrl}`);
      console.log(`✅ Loaded: ${entry.spec.info.title} v${entry.spec.info.version}`);
      console.log(`📦 Found ${entry.tags.length} tag(s)`);
      entry.tags.forEach((t) => console.log(`   · "${t.name}" → ${t.slug}/`));
      console.log('');

      fs.mkdirSync(entry.outputDir, { recursive: true });

      const tagResults = new Map<string, { hasTypes: boolean }>();
      for (const tag of entry.tags) {
        tagResults.set(tag.slug, await this.buildTag(tag, entry));
      }

      await this.buildEntryIndex(tagResults, entry);
    }

    console.log('');
    console.log('🎉 SDK generated successfully!');
  }

  // ─── private builders ────────────────────────────────────────────────────────

  private async buildTag(tag: ParsedTag, entry: SDKGenerator['entries'][number]): Promise<{ hasTypes: boolean }> {
    const tagDir = path.join(entry.outputDir, tag.slug);
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
    moduleFile.changeData(new ModuleGenerator(tag, entry.spec, entry.config.apiUrl, entry.config.name).build());
    await moduleFile.save();
    console.log(`  📝 ${path.relative(process.cwd(), moduleFile.path)}`);

    return { hasTypes };
  }

  private async buildBaseService(sdkRoot: string): Promise<void> {
    const content = `// AUTO GENERATED — DO NOT EDIT
import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import {
  AppErrorServiceUnavailable,
  AppErrorCustom,
  AppErrorInternal,
} from '@repo/_utils/errors/app-errors';

type Headers = AxiosRequestConfig<unknown>['headers'];

export function toQueryString<T extends object>(query: T): string {
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)]);
  return params.length > 0 ? \`?\${new URLSearchParams(params).toString()}\` : '';
}

export abstract class ApiDefaultService {
  private readonly baseUrl: string;
  private readonly config: {
    headers: Headers;
  };

  constructor(params: { baseUrl: string; apiKey?: string }) {
    const { baseUrl, apiKey } = params;
    this.baseUrl = baseUrl;

    this.config = {
      headers: {
        ...(apiKey ? { 'api-key': apiKey } : {}),
      },
    };
  }

  private getUrl(url: string) {
    const buildedUrl = \`\${this.baseUrl}\${url}\`;

    return buildedUrl;
  }

  private throwError(error: unknown): never {
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new AppErrorServiceUnavailable(
          'Serviço temporariamente indisponível. Tente novamente em alguns instantes.',
        );
      }

      if (error.response) {
        throw new AppErrorCustom({
          message: error.response.data?.message || error.response.data?.error,
          code: error.response.status,
        });
      }
    }

    throw new AppErrorInternal(JSON.stringify(error));
  }

  private getConfig(headers?: Headers) {
    return headers ? { headers: headers } : this.config;
  }

  private responseParser<T>(data: unknown): T | undefined {
    if (data && typeof data === 'object' && 'data' in data) {
      return this.responseParser(data.data);
    }
    return data as T;
  }

  private async tryAndCatch<T>(promise: Promise<unknown>): Promise<T> {
    try {
      const res = await promise;
      return this.responseParser(res);
    } catch (error) {
      this.throwError(error);
    }
  }

  protected async put<T>(params: { body?: unknown; headers?: Headers; url: string }): Promise<T> {
    const { body, url, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.put(finalUrl, body, config));
  }

  protected async get<T>(params: { url: string; headers?: Headers }): Promise<T> {
    const { url, headers } = params;

    const config = this.getConfig(headers);

    return this.tryAndCatch<T>(axios.get(this.getUrl(url), config));
  }

  protected async post<T>(params: { url: string; body?: unknown; headers?: Headers }): Promise<T> {
    const { url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.post(finalUrl, body, config));
  }

  protected async patch<T>(params: { url: string; body?: unknown; headers?: Headers }): Promise<T> {
    const { url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.patch(finalUrl, body, config));
  }

  protected async delete<T>(params: { url: string; body?: unknown; headers?: Headers }): Promise<T> {
    const { url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    return this.tryAndCatch<T>(axios.delete(finalUrl, { ...config, data: body }));
  }

  protected fireAndForget(params: {
    method: 'post' | 'put';
    url: string;
    body: unknown;
    headers?: Headers;
  }): void {
    const { method, url, body, headers } = params;

    const config = this.getConfig(headers);
    const finalUrl = this.getUrl(url);

    axios[method](finalUrl, body, config).catch(() => {});
  }
}
`;

    const file = new Source({ path: path.join(sdkRoot, 'api-default-service.ts') });
    file.changeData(content);
    await file.save();
    console.log(`  📝 ${path.relative(process.cwd(), file.path)}`);
  }

  private async buildEntryIndex(tagResults: Map<string, { hasTypes: boolean }>, entry: SDKGenerator['entries'][number]): Promise<void> {
    const lines = ['// AUTO GENERATED — DO NOT EDIT', ''];

    for (const tag of entry.tags) {
      const result = tagResults.get(tag.slug);
      if (result?.hasTypes) {
        lines.push(`export * from './${tag.slug}/${tag.slug}.types';`);
      }
      lines.push(`export * from './${tag.slug}/${tag.slug}.module';`);
    }

    lines.push('');

    const file = new Source({ path: path.join(entry.outputDir, 'index.ts') });
    file.changeData(lines.join('\n'));
    await file.save();
    console.log(`  📝 ${path.relative(process.cwd(), file.path)}`);
  }

}

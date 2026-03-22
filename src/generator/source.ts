import { writeFile } from 'node:fs/promises';
import prettier from 'prettier';

export class Source {
  path: string;
  data: string;

  constructor(params: { path: string; data?: string }) {
    const { path, data } = params;
    this.path = path;
    this.data = data ?? '';
  }

  async save(): Promise<void> {
    let output = this.data;
    try {
      const options = await prettier.resolveConfig(process.cwd());
      output = await prettier.format(this.data, { singleQuote: true, ...options, filepath: this.path });
    } catch (err: any) {
      console.warn(`⚠️  Prettier failed for ${this.path}, saving unformatted: ${err.message}`);
    }
    await writeFile(this.path, output, 'utf-8');
  }

  changeData(data: string): void {
    this.data = data;
  }
}

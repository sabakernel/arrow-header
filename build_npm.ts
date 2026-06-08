import { build, emptyDir } from '@deno/dnt';
import denoJson from './deno.json' with { type: 'json' };

await emptyDir('./npm');

await build({
  entryPoints: [denoJson.exports],
  outDir: './npm',
  shims: {
    deno: true,
  },
  compilerOptions: {
    target: 'ES2022',
  },
  test: false,
  package: {
    name: denoJson.name,
    version: denoJson.version,
    description: 'Robust > delimited stream header parser & builder for Deno and npm.',
    license: 'MIT',
    author: 'sabakernel',
    keywords: [
      'stream',
      'parser',
      'header',
      'protocol',
      'delimited',
      'deno',
      'node',
    ],
  },
  postBuild() {
    Deno.copyFileSync('README.md', 'npm/README.md');
    Deno.copyFileSync('LICENSE', 'npm/LICENSE');
    console.log('npm build done.');
  },
});

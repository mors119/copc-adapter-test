import { installAdapterSource } from './package-source.mjs';
import { runMatrix } from './runner.mjs';

const command = process.argv[2] ?? 'build';

if (command === 'bootstrap') {
  const result = await installAdapterSource();
  console.log(`Adapter source: ${result.spec}`);
} else if (command === 'build') {
  await runMatrix('build');
} else if (command === 'typecheck') {
  await runMatrix('typecheck');
} else {
  throw new Error(`Unknown command "${command}". Use bootstrap, build, or typecheck.`);
}

import { resolve } from 'node:path';
import { bootstrapAdapterSource, clearViteCaches, packAdapterCheckout, validateInstalledPackage, validateTarball } from './index.mjs';

const command = process.argv[2] ?? 'bootstrap';
const args = process.argv.slice(3);
const sourceIndex = args.indexOf('--source');
const source = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;

try {
  if (command === 'bootstrap') {
    const result = await bootstrapAdapterSource(source);
    await clearViteCaches();
    console.log(`Validated installed package: ${result.metadata?.name ?? '@frillab/copc-adapter'}@${result.metadata?.version ?? '0.4.0'}`);
  } else if (command === 'pack') {
    const result = await packAdapterCheckout();
    console.log(`Packed ${result.metadata.name}@${result.metadata.version}: ${result.tarball}`);
  } else if (command === 'validate') {
    if (process.env.COPC_ADAPTER_TARBALL) await validateTarball(resolve(process.env.COPC_ADAPTER_TARBALL));
    const result = await validateInstalledPackage();
    console.log(`Valid package: ${result.metadata.name}@${result.metadata.version} (${result.packageRoot})`);
  } else {
    throw new Error('Use bootstrap, pack, or validate.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

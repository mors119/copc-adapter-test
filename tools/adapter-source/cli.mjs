import { resolve } from 'node:path';
import { bootstrapAdapterSource, clearViteCaches, packAdapterCheckout, resolveLocalAdapterTarball, validateInstalledPackage, validateTarball } from './index.mjs';

const command = process.argv[2] ?? 'bootstrap';
const args = process.argv.slice(3);
const sourceIndex = args.indexOf('--source');
const source = sourceIndex >= 0 ? args[sourceIndex + 1] : undefined;

try {
  if (command === 'bootstrap' || command === 'bootstrap-tarball') {
    const bootstrapSource = command === 'bootstrap-tarball' ? 'tarball' : source;
    if (command === 'bootstrap-tarball') {
      process.env.COPC_ADAPTER_TARBALL = await resolveLocalAdapterTarball();
    }
    const result = await bootstrapAdapterSource(bootstrapSource);
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
    throw new Error('Use bootstrap, bootstrap-tarball, pack, or validate.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

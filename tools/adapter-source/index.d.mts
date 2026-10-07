export const ADAPTER_PACKAGE: '@frillab/copc-adapter';
export const ADAPTER_VERSION: '0.4.0';
export const PUBLIC_EXPORTS: readonly ['.', './cesium', './three'];
export function readAdapterSourceMetadata(): {
  packageName: string;
  packageSource: 'checkout' | 'tarball' | 'npm';
  packageVersion: string;
};
export function vitePackageDefines(prefix?: string): Record<string, string>;
export function validateTarball(tarball: string): Promise<Record<string, unknown>>;
export function validateInstalledPackage(): Promise<{
  packageRoot: string;
  metadata: Record<string, unknown>;
}>;
export function packAdapterCheckout(checkout?: string, destination?: string): Promise<{
  checkout: string;
  packageDirectory: string;
  tarball: string;
  metadata: Record<string, unknown>;
}>;
export function bootstrapAdapterSource(source?: 'checkout' | 'tarball' | 'npm'): Promise<Record<string, unknown>>;
export function clearViteCaches(): Promise<string[]>;

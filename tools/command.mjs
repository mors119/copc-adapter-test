import { spawn } from 'node:child_process';

const WINDOWS_PACKAGE_MANAGER_COMMANDS = new Set(['npm', 'npx', 'pnpm', 'yarn', 'bun']);

export function commandSpawnOptions(command, platform = process.platform) {
  return {
    shell: platform === 'win32' && WINDOWS_PACKAGE_MANAGER_COMMANDS.has(command),
  };
}

export function spawnPlatformCommand(command, args, { platform = process.platform, ...options } = {}) {
  return spawn(command, args, {
    ...options,
    ...commandSpawnOptions(command, platform),
  });
}

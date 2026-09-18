import path from 'node:path';

export function runtimePaths(root: string, localAppData: string, smoke: boolean) {
  const base = smoke ? path.join(root, 'work', 'smoke-profile') : path.join(localAppData, 'Glint');
  return { data: path.join(base, 'data'), logs: path.join(base, 'logs') };
}

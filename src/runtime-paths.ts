import path from 'node:path';

export function runtimePaths(root: string, localAppData: string, smoke: boolean, linux?: { home: string; env: NodeJS.ProcessEnv }) {
  if (!smoke && linux) {
    const xdg = (value: string | undefined, fallback: string) => value && path.isAbsolute(value) ? value : path.join(linux.home, fallback);
    return {
      data: path.join(xdg(linux.env.XDG_DATA_HOME, '.local/share'), 'Glint', 'data'),
      logs: path.join(xdg(linux.env.XDG_STATE_HOME, '.local/state'), 'Glint', 'logs')
    };
  }
  const base = smoke ? path.join(root, 'work', 'smoke-profile') : path.join(localAppData, 'Glint');
  return { data: path.join(base, 'data'), logs: path.join(base, 'logs') };
}

import versions from "virtual:asset-versions";

const _base = import.meta.env.BASE_URL ?? "/";

export function assetUrl(path: string): string {
  let key = path;
  if (_base !== "/" && path.startsWith(_base)) {
    key = "/" + path.slice(_base.length);
  }
  if (!key.startsWith("/")) key = "/" + key;
  const hash = versions[key];
  return hash ? `${path}?v=${hash}` : path;
}

export function loadEsm<T>(specifier: string): Promise<T> {
  if (process.env.VITEST) {
    return import(specifier) as Promise<T>;
  }
  return new Function('specifier', 'return import(specifier)')(specifier) as Promise<T>;
}


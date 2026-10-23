if (typeof URL.parse !== 'function') {
  Object.defineProperty(URL, 'parse', {
    configurable: true,
    writable: true,
    value(input: string | URL, base?: string | URL) {
      try {
        return new URL(input, base);
      } catch {
        return null;
      }
    },
  });
}

export {};

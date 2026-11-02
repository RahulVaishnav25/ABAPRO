const NOT_DESTINATIONS = ['/forbidden', '/no-clinic', '/login'];

export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') {
    return '/';
  }
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  // Pages that only explain why someone cannot continue are never a destination after signing in.
  const path = value.split(/[?#]/)[0] ?? '';
  if (NOT_DESTINATIONS.some((page) => path === page || path.startsWith(`${page}/`))) {
    return '/';
  }
  return value;
}

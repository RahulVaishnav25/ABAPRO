export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  quiet?: boolean;
}

let unauthorizedHandler: ((message: string) => void) | null = null;

export function setUnauthorizedHandler(handler: (message: string) => void): void {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
    });
  } catch {
    throw new ApiError(0, 'The server could not be reached. Start the API and try again.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    if (response.status === 401 && !options.quiet && !path.endsWith('/auth/logout')) {
      unauthorizedHandler?.(message);
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    if (payload.message) {
      return payload.message;
    }
  } catch {
    return response.statusText || 'Request failed.';
  }
  return response.statusText || 'Request failed.';
}

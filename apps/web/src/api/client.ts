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

/** Builds a request path, encoding each interpolated value as a single path segment. */
export function encodedPath(strings: TemplateStringsArray, ...values: Array<string | number>): string {
  return strings.reduce((path, text, index) => path + text + (index < values.length ? encodeURIComponent(String(values[index])) : ''), '');
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

/** Sends a JSON body like apiRequest, reporting how much of it has been sent, for file uploads. */
export function apiUpload<T>(path: string, body: unknown, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${baseUrl}${path}`);
    request.withCredentials = true;
    request.setRequestHeader('Content-Type', 'application/json');
    request.setRequestHeader('Accept', 'application/json');
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new ApiError(0, 'The server could not be reached. Start the API and try again.'));
    request.onload = () => {
      let payload: unknown = null;
      try {
        payload = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        payload = null;
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(payload as T);
        return;
      }
      const message = (payload as { message?: string } | null)?.message ?? (request.statusText || 'Request failed.');
      if (request.status === 401) unauthorizedHandler?.(message);
      reject(new ApiError(request.status, message));
    };
    request.send(JSON.stringify(body));
  });
}

/** Fetches a file the API serves, for downloading or playing. */
export async function apiBlob(path: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'The server could not be reached. Start the API and try again.');
  }
  if (!response.ok) throw new ApiError(response.status, await readErrorMessage(response));
  return response.blob();
}

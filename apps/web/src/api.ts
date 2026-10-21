export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const responseBody = await response.text()
  let payload: unknown = null
  try {
    payload = responseBody ? JSON.parse(responseBody) : null
  } catch {
    payload = responseBody
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload as { error?: unknown }).error
      : typeof payload === 'string' && payload.trim()
        ? payload.trim()
        : null
    throw new Error(typeof message === 'string' ? message : `Request failed with status ${response.status}.`)
  }

  return payload as T
}

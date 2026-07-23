import { sessionStore } from '../stores/sessionStore'
import { toastStore } from '../stores/toastStore'

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly body?: unknown

  constructor(
    message: string,
    status: number,
    body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return response.json()
  return response.text()
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(sessionStore.token.value ? { Authorization: `Bearer ${sessionStore.token.value}` } : {}),
        ...init.headers,
      },
      credentials: 'include',
    })
  } catch (error) {
    toastStore.push('网络请求失败，请检查连接后重试。', 'error')
    throw new ApiError('Network request failed', 0, error)
  }

  const body = response.status === 204 ? undefined : await readBody(response)
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      sessionStore.clear()
      toastStore.push(response.status === 401 ? '登录状态已失效，请重新登录。' : '你没有执行此操作的权限。', 'error')
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String(body.message)
      : `Request failed (${response.status})`
    throw new ApiError(message, response.status, body)
  }

  return body as T
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, body: unknown, init?: RequestInit) => request<T>(path, {
    ...init,
    method: 'POST',
    body: JSON.stringify(body),
  }),
}

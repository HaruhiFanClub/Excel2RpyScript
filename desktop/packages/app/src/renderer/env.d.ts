import type { E2rApi } from '../shared/ipc'

declare global {
  interface Window {
    e2r: E2rApi
  }
}

export {}

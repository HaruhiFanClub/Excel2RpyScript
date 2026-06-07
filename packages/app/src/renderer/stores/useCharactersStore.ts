import { create } from 'zustand'
import type { TtsConfig } from '@e2r/core/tts'

// 全局角色配置（单一来源）：从主进程加载，编辑后防抖写回 userData/characters.json。
interface CharactersState {
  config: TtsConfig | null
  loaded: boolean
  load: () => Promise<void>
  update: (updater: (prev: TtsConfig) => TtsConfig) => void
  flush: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const useCharactersStore = create<CharactersState>((set, get) => ({
  config: null,
  loaded: false,
  load: async () => {
    const config = await window.e2r.ttsCharacters()
    set({ config, loaded: true })
  },
  update: (updater) => {
    const prev = get().config
    if (!prev) return
    const next = updater(prev)
    set({ config: next })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void window.e2r.ttsSaveCharacters(next)
    }, 350)
  },
  flush: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const c = get().config
    if (c) await window.e2r.ttsSaveCharacters(c)
  },
}))

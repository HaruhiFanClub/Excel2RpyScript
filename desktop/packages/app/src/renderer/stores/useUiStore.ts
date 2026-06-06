import { create } from 'zustand'

interface UiState {
  settingsOpen: boolean
  openSettings: () => void
  closeSettings: () => void
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}))

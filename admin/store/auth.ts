import { create } from "zustand"
import { persist } from "zustand/middleware"

interface Staff {
  id: number
  name: string
  email: string
  role: string
  isActive: boolean
}

interface AuthState {
  token: string | null
  staff: Staff | null
  login: (token: string, staff: Staff) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      staff: null,
      login: (token, staff) => set({ token, staff }),
      logout: () => set({ token: null, staff: null }),
    }),
    {
      name: "auth-storage",
    }
  )
)

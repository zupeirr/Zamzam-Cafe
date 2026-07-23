"use client"

import { useAuthStore } from "@/store/auth"
import { useRouter } from "next/navigation"
import { LogOut, UtensilsCrossed, LayoutDashboard } from "lucide-react"

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  const { staff, logout } = useAuthStore()
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem("admin_token")
    logout()
    router.push("/login")
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
      {/* Kitchen Top Bar */}
      <header className="h-16 flex-shrink-0 bg-gray-950 border-b border-gray-800 flex items-center justify-between px-6 shadow-sm z-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-orange-600 flex items-center justify-center">
            <UtensilsCrossed className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-tight leading-tight">Kitchen Display</h1>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aura Coffee KDS</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-gray-100">{staff?.name || "Loading..."}</p>
            <p className="text-xs font-medium text-gray-500 capitalize">{staff?.role}</p>
          </div>
          
          <div className="flex gap-2 border-l border-gray-800 pl-4 ml-2">
            {(staff?.role === "owner" || staff?.role === "manager") && (
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors border border-gray-700"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Admin</span>
              </button>
            )}
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-red-400 bg-red-950 hover:bg-red-900 transition-colors border border-red-900"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* KDS Content */}
      <main className="flex-1 overflow-hidden p-6 pb-0">
        {children}
      </main>
    </div>
  )
}

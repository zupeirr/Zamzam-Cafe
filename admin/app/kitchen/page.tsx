"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api"
import { toast } from "sonner"
import {
  CheckCircle2, Clock, Play, UtensilsCrossed, AlertCircle,
  MapPin, Timer, Bell, BellOff, Volume2, VolumeX,
  ChefHat, Coffee, Flame, Cookie, GlassWater, IceCream,
  Loader2, Filter, BarChart2, CheckCheck, Zap, RefreshCw,
  User, Package, Bike, Star
} from "lucide-react"

// ── Station config ────────────────────────────────────────────────────────────
const STATIONS = [
  { id: "all",     label: "All Stations",  icon: ChefHat,     color: "from-gray-700 to-gray-800",    accent: "#9ca3af" },
  { id: "coffee",  label: "Coffee Bar",    icon: Coffee,      color: "from-amber-800 to-amber-900",  accent: "#f59e0b" },
  { id: "grill",   label: "Grill",         icon: Flame,       color: "from-red-800 to-red-900",      accent: "#ef4444" },
  { id: "bakery",  label: "Bakery",        icon: Cookie,      color: "from-orange-700 to-orange-900",accent: "#f97316" },
  { id: "drinks",  label: "Drinks",        icon: GlassWater,  color: "from-blue-800 to-blue-900",    accent: "#3b82f6" },
  { id: "desserts",label: "Desserts",      icon: IceCream,    color: "from-pink-700 to-pink-900",    accent: "#ec4899" },
]

// Which product categories map to which station
const STATION_CATEGORIES: Record<string, string[]> = {
  coffee:   ["Hot Drinks", "Hot Coffee", "Coffee"],
  drinks:   ["Cold Drinks", "Iced Drinks", "Smoothies", "Shakes", "Juices"],
  bakery:   ["Cakes", "Pancakes", "Bread", "Pastry"],
  desserts: ["Ice Cream", "Desserts"],
  grill:    ["Grill", "Sandwiches", "Burgers", "Food"],
}

function getItemStation(item: any): string {
  for (const [station, cats] of Object.entries(STATION_CATEGORIES)) {
    if (cats.some(c => c.toLowerCase() === (item.categoryId || "").toLowerCase())) {
      return station
    }
  }
  return "coffee" // default
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; glow: string }> = {
  pending:    { label: "New",       color: "text-blue-400",  bg: "bg-blue-950/60",   border: "border-blue-700",  glow: "shadow-blue-900/30" },
  confirmed:  { label: "Accepted",  color: "text-cyan-400",  bg: "bg-cyan-950/60",   border: "border-cyan-700",  glow: "shadow-cyan-900/30" },
  preparing:  { label: "Preparing", color: "text-orange-400",bg: "bg-orange-950/60", border: "border-orange-600",glow: "shadow-orange-900/40" },
  ready:      { label: "Ready",     color: "text-green-400", bg: "bg-green-950/60",  border: "border-green-600", glow: "shadow-green-900/40" },
  served:     { label: "Served",    color: "text-gray-400",  bg: "bg-gray-900",      border: "border-gray-700",  glow: "" },
}

// ── Timer hook ────────────────────────────────────────────────────────────────
function useTimer() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return tick
}

function getElapsedSeconds(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function getUrgency(seconds: number): "normal" | "warning" | "urgent" {
  if (seconds >= 20 * 60) return "urgent"
  if (seconds >= 10 * 60) return "warning"
  return "normal"
}

// ── Order type icon ───────────────────────────────────────────────────────────
function OrderTypeIcon({ type }: { type: string }) {
  if (type === "dine-in")  return <UtensilsCrossed className="w-3.5 h-3.5" />
  if (type === "takeaway") return <Package className="w-3.5 h-3.5" />
  if (type === "delivery") return <Bike className="w-3.5 h-3.5" />
  return <User className="w-3.5 h-3.5" />
}

// ── Order Card ────────────────────────────────────────────────────────────────
function OrderCard({
  order, station, onAccept, onPrepare, onReady, onServed, isPending
}: {
  order: any; station: string; onAccept: () => void; onPrepare: () => void
  onReady: () => void; onServed: () => void; isPending: boolean
}) {
  useTimer() // re-renders every second
  const elapsed = getElapsedSeconds(order.createdAt)
  const urgency = getUrgency(elapsed)
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending

  // Filter items by station
  const items = station === "all"
    ? order.items
    : order.items.filter((item: any) => getItemStation(item) === station)

  if (station !== "all" && items.length === 0) return null

  const urgencyBorder = urgency === "urgent" ? "border-red-500 shadow-red-900/50 shadow-lg animate-pulse"
    : urgency === "warning" ? "border-yellow-500 shadow-yellow-900/30 shadow-md"
    : cfg.border

  return (
    <div className={`flex flex-col rounded-2xl border-2 overflow-hidden transition-all ${cfg.bg} ${urgencyBorder} min-h-[280px]`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${
        urgency === "urgent" ? "bg-red-950/80 border-red-800" :
        urgency === "warning" ? "bg-yellow-950/60 border-yellow-800" :
        "bg-black/30 border-white/5"
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-white font-black text-xl tracking-tight">#{order.id.slice(-5)}</span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${cfg.color} bg-white/5`}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {urgency === "urgent" && <AlertCircle className="w-4 h-4 text-red-400 animate-bounce" />}
          <span className={`font-mono font-black text-base ${
            urgency === "urgent" ? "text-red-400" :
            urgency === "warning" ? "text-yellow-400" : "text-gray-300"
          }`}>
            {formatTimer(elapsed)}
          </span>
        </div>
      </div>

      {/* Info Row */}
      <div className="px-4 py-2 flex items-center gap-2 flex-wrap border-b border-white/5 bg-black/20">
        <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md ${cfg.color} bg-white/5`}>
          <OrderTypeIcon type={order.orderType} />
          {order.orderType}
        </span>
        {order.customer?.tableNumber && (
          <span className="flex items-center gap-1 text-xs font-bold text-orange-300 bg-orange-400/10 px-2 py-0.5 rounded-md">
            <UtensilsCrossed className="w-3 h-3" /> T{order.customer.tableNumber}
          </span>
        )}
        {order.customer?.fullName && (
          <span className="text-xs font-bold text-gray-400 truncate max-w-[120px]">
            {order.customer.fullName}
          </span>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {items.map((item: any, idx: number) => (
          <div key={idx} className="flex gap-3 items-start">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0 ${
              item.quantity > 1 ? "bg-orange-500 text-white" : "bg-white/10 text-gray-300"
            }`}>
              {item.quantity}x
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base leading-snug">{item.title}</p>
              {item.note && (
                <p className="text-xs font-bold text-yellow-300/80 mt-0.5 border-l-2 border-yellow-500/40 pl-1.5">
                  {item.note}
                </p>
              )}
            </div>
          </div>
        ))}

        {order.notes && (
          <div className="mt-2 p-2.5 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <p className="text-[10px] font-black text-yellow-500 uppercase tracking-wider flex items-center gap-1 mb-1">
              <AlertCircle className="w-3 h-3" /> Note
            </p>
            <p className="text-sm font-medium text-yellow-100/80">{order.notes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-white/5 bg-black/20 flex gap-2">
        {order.status === "pending" && (
          <button onClick={onAccept} disabled={isPending}
            className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-black text-sm transition-colors flex items-center justify-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Accept
          </button>
        )}
        {order.status === "confirmed" && (
          <button onClick={onPrepare} disabled={isPending}
            className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-black text-sm transition-colors flex items-center justify-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            Start Prep
          </button>
        )}
        {order.status === "preparing" && (
          <button onClick={onReady} disabled={isPending}
            className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-sm transition-colors flex items-center justify-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Mark Ready
          </button>
        )}
        {order.status === "ready" && (
          <button onClick={onServed} disabled={isPending}
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-sm transition-colors flex items-center justify-center gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
            Served
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main KDS Page ─────────────────────────────────────────────────────────────
export default function KitchenPage() {
  const queryClient = useQueryClient()
  const [station, setStation] = useState("all")
  const [filterStatus, setFilterStatus] = useState<string[]>(["pending", "confirmed", "preparing", "ready"])
  const [filterType, setFilterType] = useState("all")
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const prevOrderIds = useRef<Set<string>>(new Set())
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ── Sound ────────────────────────────────────────────────────────────────────
  const playBeep = useCallback((urgent = false) => {
    if (!soundEnabled) return
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const ctx = audioCtxRef.current
      const freqs = urgent ? [880, 660, 880] : [523, 659]
      let time = ctx.currentTime
      freqs.forEach(freq => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = freq
        osc.type = "sine"
        gain.gain.setValueAtTime(0.3, time)
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25)
        osc.start(time)
        osc.stop(time + 0.25)
        time += 0.3
      })
    } catch {}
  }, [soundEnabled])

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["kitchen"],
    queryFn: () => fetchApi("/orders/kitchen"),
    refetchInterval: 5000,
  })

  const orders: any[] = data?.orders || []
  const stats = data?.stats || {}

  // Detect new orders and play sound
  useEffect(() => {
    if (orders.length === 0) return
    const currentIds = new Set(orders.map((o: any) => o.id))
    const isFirstLoad = prevOrderIds.current.size === 0

    if (!isFirstLoad) {
      const newOrders = orders.filter((o: any) => !prevOrderIds.current.has(o.id))
      if (newOrders.length > 0) {
        const hasUrgent = newOrders.some((o: any) => {
          const secs = getElapsedSeconds(o.createdAt)
          return getUrgency(secs) === "urgent"
        })
        playBeep(hasUrgent)
        newOrders.forEach((o: any) => {
          toast.custom((id) => (
            <div className="bg-blue-900 border border-blue-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-xl">
              <Bell className="w-5 h-5 text-blue-300 animate-bounce" />
              <div>
                <p className="font-black text-sm">New Order #{o.id.slice(-5)}</p>
                <p className="text-xs text-blue-300">{o.orderType} · {o.items?.length} items</p>
              </div>
            </div>
          ), { duration: 4000 })
        })
      }

      // Alert for delayed orders
      const newDelayed = orders.filter((o: any) => {
        const secs = getElapsedSeconds(o.createdAt)
        return secs >= 20 * 60 && (o.status === "pending" || o.status === "preparing")
      })
      if (newDelayed.length > 0) playBeep(true)
    }
    prevOrderIds.current = currentIds
  }, [orders, playBeep])

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetchApi(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["kitchen"] })
      if (status === "ready") {
        playBeep(false)
        toast.success("Order marked ready! 🔔")
      }
    },
    onError: (err: any) => toast.error(err.message || "Failed to update")
  })

  // ── Filtering ─────────────────────────────────────────────────────────────────
  const filteredOrders = orders.filter(o => {
    if (!filterStatus.includes(o.status)) return false
    if (filterType !== "all" && o.orderType !== filterType) return false
    if (station !== "all") {
      const hasStationItems = o.items?.some((item: any) => getItemStation(item) === station)
      if (!hasStationItems) return false
    }
    return true
  })

  // Group by status for kanban view
  const grouped = {
    pending:   filteredOrders.filter(o => o.status === "pending"),
    confirmed: filteredOrders.filter(o => o.status === "confirmed"),
    preparing: filteredOrders.filter(o => o.status === "preparing"),
    ready:     filteredOrders.filter(o => o.status === "ready"),
  }

  const activeStation = STATIONS.find(s => s.id === station) || STATIONS[0]

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-950">
        <Loader2 className="w-12 h-12 animate-spin mb-4 text-orange-500" />
        <p className="font-black text-gray-300 text-lg">Loading Kitchen Display...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-950 text-white overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-4">

          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-black text-white text-base leading-none">Kitchen Display</h1>
              <p className="text-xs text-gray-400 font-bold mt-0.5">{activeStation.label}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="hidden md:flex items-center gap-2">
            {[
              { label: "New", value: stats.pending || 0, color: "text-blue-400 bg-blue-900/50" },
              { label: "Prep", value: stats.preparing || 0, color: "text-orange-400 bg-orange-900/50" },
              { label: "Ready", value: stats.ready || 0, color: "text-green-400 bg-green-900/50" },
              { label: "Done", value: stats.completedToday || 0, color: "text-gray-300 bg-gray-800" },
              { label: "Delayed", value: stats.delayed || 0, color: "text-red-400 bg-red-900/50" },
            ].map(s => (
              <div key={s.label} className={`flex flex-col items-center px-3 py-1.5 rounded-xl ${s.color}`}>
                <span className="text-lg font-black leading-none">{s.value}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4 text-gray-300" />
            </button>
            <button onClick={() => setShowFilters(f => !f)}
              className={`p-2.5 rounded-xl transition-colors ${showFilters ? "bg-orange-600 text-white" : "bg-gray-800 hover:bg-gray-700 text-gray-300"}`}>
              <Filter className="w-4 h-4" />
            </button>
            <button onClick={() => setSoundEnabled(s => !s)}
              className={`p-2.5 rounded-xl transition-colors ${soundEnabled ? "bg-green-800 text-green-300" : "bg-gray-800 text-gray-500"}`}
              title={soundEnabled ? "Sound On" : "Sound Off"}>
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 font-bold mr-1">STATUS</span>
              {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "served").map(([key, cfg]) => (
                <button key={key}
                  onClick={() => setFilterStatus(prev =>
                    prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
                  )}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                    filterStatus.includes(key) ? `${cfg.color} border-current bg-white/5` : "border-gray-700 text-gray-500"
                  }`}>
                  {cfg.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 font-bold mr-1">TYPE</span>
              {["all", "walk-in", "dine-in", "takeaway"].map(t => (
                <button key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border ${
                    filterType === t ? "border-orange-500 text-orange-400 bg-orange-900/30" : "border-gray-700 text-gray-500"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Station Tabs ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex gap-2 px-4 py-2.5 bg-gray-900/50 border-b border-gray-800 overflow-x-auto no-scrollbar">
        {STATIONS.map(s => {
          const Icon = s.icon
          const isActive = station === s.id
          return (
            <button key={s.id} onClick={() => setStation(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all flex-shrink-0 ${
                isActive
                  ? `bg-gradient-to-r ${s.color} text-white shadow-lg`
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}>
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* ── Kanban Board ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex gap-3 p-3">
        {filteredOrders.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center text-gray-600">
            <CheckCheck className="w-16 h-16 mb-4 text-gray-700" />
            <h2 className="text-2xl font-black text-gray-500">All clear!</h2>
            <p className="text-gray-600 font-medium mt-1">No active orders for this station.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([status, statusOrders]) => {
            const cfg = STATUS_CONFIG[status]
            return (
              <div key={status} className="flex-1 min-w-[230px] flex flex-col min-h-0">
                {/* Column header */}
                <div className={`flex-shrink-0 flex items-center justify-between px-3 py-2 rounded-xl mb-2 ${cfg.bg} border ${cfg.border}`}>
                  <span className={`font-black text-sm uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black bg-white/10 ${cfg.color}`}>
                    {statusOrders.length}
                  </span>
                </div>
                {/* Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {statusOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-700">
                      <CheckCircle2 className="w-8 h-8 mb-2 text-gray-800" />
                      <p className="text-xs font-bold text-gray-700">Empty</p>
                    </div>
                  ) : statusOrders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      station={station}
                      isPending={statusMutation.isPending}
                      onAccept={() => statusMutation.mutate({ id: order.id, status: "confirmed" })}
                      onPrepare={() => statusMutation.mutate({ id: order.id, status: "preparing" })}
                      onReady={() => statusMutation.mutate({ id: order.id, status: "ready" })}
                      onServed={() => statusMutation.mutate({ id: order.id, status: "served" })}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

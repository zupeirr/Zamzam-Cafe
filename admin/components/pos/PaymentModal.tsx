"use client"

import { useState } from "react"
import { X, Banknote, CreditCard, Smartphone, ArrowRight, CheckCircle2, Minus, Plus } from "lucide-react"

export type PaymentMethod = "cash" | "card" | "zaad" | "evc-plus" | "edahab"

interface PaymentEntry {
  method: PaymentMethod
  amount: number // cents
}

interface PaymentModalProps {
  totalCents: number
  onConfirm: (payments: PaymentEntry[], changeGiven: number) => void
  onClose: () => void
}

const METHODS: { id: PaymentMethod; label: string; color: string; icon: React.ReactNode }[] = [
  { id: "cash",     label: "Cash",     color: "#16a34a", icon: <Banknote className="w-5 h-5" /> },
  { id: "card",     label: "Card",     color: "#2563eb", icon: <CreditCard className="w-5 h-5" /> },
  { id: "zaad",     label: "ZAAD",     color: "#7c3aed", icon: <Smartphone className="w-5 h-5" /> },
  { id: "evc-plus", label: "EVC Plus", color: "#d97706", icon: <Smartphone className="w-5 h-5" /> },
  { id: "edahab",   label: "eDahab",   color: "#0891b2", icon: <Smartphone className="w-5 h-5" /> },
]

export function PaymentModal({ totalCents, onConfirm, onClose }: PaymentModalProps) {
  const [step, setStep] = useState<"method" | "cash-amount" | "split-1" | "split-2">("method")
  const [primaryMethod, setPrimaryMethod] = useState<PaymentMethod | null>(null)
  const [primaryAmount, setPrimaryAmount] = useState<string>("")
  const [secondaryMethod, setSecondaryMethod] = useState<PaymentMethod | null>(null)
  const [isSplit, setIsSplit] = useState(false)
  const [cashTendered, setCashTendered] = useState<string>("")

  const totalDollars = (totalCents / 100).toFixed(2)

  // Quick cash amounts
  const quickAmounts = [
    Math.ceil(totalCents / 100),
    Math.ceil(totalCents / 500) * 5,
    Math.ceil(totalCents / 1000) * 10,
    Math.ceil(totalCents / 2000) * 20,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= totalCents / 100)

  const tenderedCents = Math.round(parseFloat(cashTendered || "0") * 100)
  const change = tenderedCents - totalCents

  const primaryCents = Math.round(parseFloat(primaryAmount || "0") * 100)
  const secondaryCents = totalCents - primaryCents

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleMethodSelect(method: PaymentMethod) {
    setPrimaryMethod(method)
    if (method === "cash") {
      setCashTendered(totalDollars)
      setStep("cash-amount")
    } else if (isSplit) {
      setPrimaryAmount((totalCents / 200).toFixed(2)) // default 50/50
      setStep("split-1")
    } else {
      // Non-cash, full payment — confirm immediately
      onConfirm([{ method, amount: totalCents }], 0)
    }
  }

  function handleCashConfirm() {
    if (tenderedCents < totalCents) return
    onConfirm([{ method: "cash", amount: totalCents }], change)
  }

  function handleSplitConfirm() {
    if (!primaryMethod || !secondaryMethod) return
    if (primaryCents <= 0 || secondaryCents <= 0) return
    onConfirm(
      [
        { method: primaryMethod,   amount: primaryCents },
        { method: secondaryMethod, amount: secondaryCents },
      ],
      0
    )
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Payment</h2>
            <p className="text-2xl font-black mt-0.5" style={{ color: "#FF7043" }}>
              ${totalDollars}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Step: Choose method */}
        {(step === "method" || step === "split-2") && (
          <div className="p-6 space-y-4">
            {step === "split-2" && (
              <div className="bg-blue-50 rounded-xl p-3 mb-4 flex justify-between text-sm">
                <span className="text-blue-700 font-medium">
                  {primaryMethod?.toUpperCase()} ${(primaryCents / 100).toFixed(2)}
                </span>
                <span className="text-blue-700 font-medium">
                  Remaining: ${(secondaryCents / 100).toFixed(2)}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {METHODS
                .filter(m => step === "split-2" ? m.id !== primaryMethod : true)
                .map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (step === "split-2") {
                        setSecondaryMethod(m.id)
                        // Non-cash secondary — confirm
                        onConfirm([
                          { method: primaryMethod!, amount: primaryCents },
                          { method: m.id, amount: secondaryCents },
                        ], 0)
                      } else {
                        handleMethodSelect(m.id)
                      }
                    }}
                    className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-gray-100 hover:border-gray-200 transition-all hover:shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                      style={{ background: m.color }}>
                      {m.icon}
                    </div>
                    <span className="font-bold text-gray-800 text-sm">{m.label}</span>
                  </button>
                ))}
            </div>

            {step === "method" && (
              <button
                onClick={() => { setIsSplit(true); setStep("split-1") }}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 font-medium text-sm hover:border-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Split Payment (2 methods)
              </button>
            )}
          </div>
        )}

        {/* Step: Split — pick first method + amount */}
        {step === "split-1" && (
          <div className="p-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-gray-600 mb-2 block">
                First Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPrimaryMethod(m.id)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-bold ${primaryMethod === m.id ? "border-orange-400 bg-orange-50" : "border-gray-100"}`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                      style={{ background: m.color }}>
                      {m.icon}
                    </div>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-600 mb-2 block">
                Amount for first payment
              </label>
              <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-4">
                <span className="text-gray-400 font-bold text-lg">$</span>
                <input
                  type="number"
                  value={primaryAmount}
                  onChange={e => setPrimaryAmount(e.target.value)}
                  className="flex-1 bg-transparent py-3 pl-2 text-xl font-bold text-gray-900 focus:outline-none"
                  placeholder="0.00"
                  min="0"
                  max={totalDollars}
                  step="0.01"
                />
              </div>
              {primaryCents > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  Remaining: <span className="font-bold text-gray-800">${(Math.max(0, secondaryCents) / 100).toFixed(2)}</span> via second method
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("method")} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 font-medium">
                Back
              </button>
              <button
                onClick={() => {
                  if (!primaryMethod || primaryCents <= 0 || secondaryCents <= 0) return
                  setStep("split-2")
                }}
                disabled={!primaryMethod || primaryCents <= 0 || secondaryCents <= 0}
                className="flex-1 py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #FF7043, #E64A19)" }}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Cash tendered */}
        {step === "cash-amount" && (
          <div className="p-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-gray-600 mb-2 block">Amount Tendered</label>
              <div className="flex items-center bg-gray-50 border-2 border-orange-200 rounded-xl px-4">
                <span className="text-gray-400 font-bold text-2xl">$</span>
                <input
                  autoFocus
                  type="number"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  className="flex-1 bg-transparent py-4 pl-2 text-2xl font-black text-gray-900 focus:outline-none"
                  placeholder="0.00"
                  min={totalDollars}
                  step="0.01"
                />
              </div>
              {/* Quick amounts */}
              <div className="flex gap-2 mt-3">
                {quickAmounts.slice(0, 4).map(amt => (
                  <button
                    key={amt}
                    onClick={() => setCashTendered(amt.toString())}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm hover:bg-orange-50 hover:text-orange-600 transition-colors"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Change due */}
            <div className={`rounded-xl p-4 ${change >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex justify-between items-center">
                <span className={`font-semibold text-sm ${change >= 0 ? "text-green-700" : "text-red-600"}`}>
                  {change >= 0 ? "Change Due" : "Amount Short"}
                </span>
                <span className={`text-2xl font-black ${change >= 0 ? "text-green-700" : "text-red-600"}`}>
                  ${Math.abs(change / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("method")} className="flex-1 py-3.5 rounded-xl border border-gray-200 text-gray-600 font-medium">
                Back
              </button>
              <button
                onClick={handleCashConfirm}
                disabled={tenderedCents < totalCents}
                className="flex-1 py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}
              >
                <CheckCircle2 className="w-5 h-5" /> Confirm
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

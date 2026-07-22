import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { fetchApi } from "@/lib/api"
import { toast } from "sonner"
import { X, Loader2, Save, User, Mail, Lock, Shield, KeyRound } from "lucide-react"

export function StaffModal({ isOpen, onClose, staff }: { isOpen: boolean; onClose: () => void; staff?: any }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "staff",
    pin: "",
  })

  useEffect(() => {
    if (staff) {
      setFormData({
        name: staff.name || "",
        email: staff.email || "",
        password: "", // never populate password
        role: staff.role || "staff",
        pin: staff.pin || "",
      })
    } else {
      setFormData({ name: "", email: "", password: "", role: "staff", pin: "" })
    }
  }, [staff, isOpen])

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (staff?.id) {
        // Edit mode (password optional, email immutable in this basic setup but backend might ignore it anyway)
        const payload: any = { name: data.name, role: data.role, pin: data.pin || null }
        if (data.password) payload.password = data.password
        return fetchApi(`/staff/${staff.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      } else {
        // Create mode
        return fetchApi("/staff", {
          method: "POST",
          body: JSON.stringify(data),
        })
      }
    },
    onSuccess: (res) => {
      if (!res.success) throw new Error(res.message || "Failed")
      queryClient.invalidateQueries({ queryKey: ["staff"] })
      toast.success(`Staff ${staff ? "updated" : "invited"} successfully`)
      onClose()
    },
    onError: (err: any) => {
      toast.error(err.message || "Something went wrong")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!staff && !formData.password) {
      return toast.error("Password is required for new staff")
    }
    if (formData.pin && formData.pin.length !== 4) {
      return toast.error("PIN must be exactly 4 digits")
    }
    mutation.mutate(formData)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold text-gray-900">{staff ? "Edit Staff" : "Invite Staff"}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="staff-form" onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF7043] transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Email Address {staff && "(Cannot be changed)"}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  required
                  type="email"
                  disabled={!!staff}
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@zamzam.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF7043] transition-all disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    required={!staff}
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    placeholder={staff ? "Leave blank to keep" : "••••••••"}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF7043] transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">4-Digit PIN</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={formData.pin}
                    onChange={e => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                    placeholder="E.g. 1234"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF7043] transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">Role</label>
              <div className="relative">
                <Shield className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#FF7043] transition-all bg-white appearance-none"
                >
                  <option value="staff">Staff</option>
                  <option value="cashier">Cashier</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="manager">Manager</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="staff-form"
            disabled={mutation.isPending}
            className="flex-1 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #FF7043, #E64A19)" }}
          >
            {mutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Save className="h-5 w-5" />
                {staff ? "Save Changes" : "Create Staff"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

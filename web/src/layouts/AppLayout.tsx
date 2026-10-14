import { useQueryClient } from '@tanstack/react-query'
import { Briefcase, LogOut, Users } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom'

import { http } from '@/lib/api'
import { useMe } from '@/lib/auth'
import { cn } from '@/lib/utils'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-white/15 text-white' : 'text-header-foreground/80 hover:bg-white/10',
  )

export default function AppLayout() {
  const me = useMe()
  const qc = useQueryClient()

  if (me.isPending) return <p className="p-8 text-sm text-muted-foreground">Завантаження…</p>
  if (!me.data) return <Navigate to="/login" replace />

  async function logout() {
    await http.post('/api/auth/sign-out', {})
    qc.clear()
    window.location.assign('/login')
  }

  return (
    <div className="min-h-screen">
      <header className="bg-header text-header-foreground">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 text-base font-semibold text-white">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-sm">S</span>
            StatusDEV
          </Link>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              <Briefcase className="size-4" /> Проєкти
            </NavLink>
            <NavLink to="/clients" className={navClass}>
              <Users className="size-4" /> Клієнти
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-header-foreground/80 sm:inline">{me.data.name}</span>
            <button
              onClick={logout}
              title="Вийти"
              className="rounded-md p-2 hover:bg-white/10"
              aria-label="Вийти"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

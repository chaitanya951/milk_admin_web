import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/shared/components/ui/overlays'
import { SearchInput } from '@/shared/components/misc'
import { InitialAvatar } from '@/shared/illustrations/avatars'
import { ADMIN_NAV_ITEMS } from '@/apps/admin/routes/AdminLayout'
import { useUI } from '@/shared/layouts/ui'
import { paletteSearch, type PaletteHit } from '@/shared/data/api'
import { Search, ArrowRight } from 'lucide-react'

type Result = PaletteHit & { icon?: React.ReactNode }

export function AdminCommandPalette() {
  const open = useUI((s) => s.commandOpen)
  const setOpen = useUI((s) => s.setCommandOpen)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  useEffect(() => {
    if (open) { setQuery(''); setCursor(0) }
  }, [open])

  // Debounced search across stores, products, orders, customers, riders and tickets.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 180)
    return () => clearTimeout(t)
  }, [query])

  const { data: hits = [], isFetching } = useQuery({
    queryKey: ['palette', debounced],
    queryFn: () => paletteSearch(debounced),
    enabled: open,
    staleTime: 5_000,
  })

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase()
    const pages: Result[] = (ADMIN_NAV_ITEMS as Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }>).filter((n) => !q || n.label.toLowerCase().includes(q)).map((n) => {
      const Icon = n.icon
      return { id: `page-${n.to}`, group: 'Pages', title: n.label, to: n.to, icon: <Icon className="h-4 w-4" /> }
    })
    if (!q) return pages.slice(0, 8)
    return [...hits, ...pages].slice(0, 20)
  }, [query, hits])

  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>()
    for (const r of results) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group)!.push(r)
    }
    return [...map.entries()]
  }, [results])

  const flat = grouped.flatMap(([, rs]) => rs)
  const run = (r: Result) => { setOpen(false); navigate(r.to) }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Command Palette" description="Search stores, products, orders, customers, riders and tickets" wide className="top-[18%] p-0">
        <div
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(flat.length - 1, c + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)) }
            if (e.key === 'Enter' && flat[cursor]) { e.preventDefault(); run(flat[cursor]!) }
          }}
        >
          <div className="p-4 pb-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Type to search stores, products, orders, customers, riders, tickets…" kbd />
          </div>
          <div className="scrollbar-thin max-h-[360px] overflow-y-auto p-2">
            {flat.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Search className="h-6 w-6 text-muted-foreground/50" />
                <p className="text-sm font-semibold">No matches for “{query}”</p>
                <p className="text-xs text-muted-foreground">Try an order id like DD10489, a store name, or a customer.</p>
              </div>
            )}
            {isFetching && flat.length === 0 && query && <div className="space-y-2 p-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-9 w-full rounded-lg" />)}</div>}
            {grouped.map(([group, items]) => (
              <div key={group} className="mb-1.5">
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group}</div>
                {items.map((r) => {
                  const idx = flat.indexOf(r)
                  return (
                    <button
                      key={`${r.group}-${r.id}`}
                      onClick={() => run(r)}
                      onMouseEnter={() => setCursor(idx)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${idx === cursor ? 'bg-primary-soft' : 'hover:bg-muted/60'}`}
                    >
                      <span className="grid h-7 w-7 place-items-center">{r.icon ?? <span className="text-base">•</span>}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{r.title}</span>
                        {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                      </span>
                      {idx === cursor && <ArrowRight className="h-4 w-4 text-brand-600" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          <span>↑↓ to navigate · Enter to open</span>
          <span>Esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PaletteAvatar({ name, size = 20 }: { name: string; size?: number }) {
  return <InitialAvatar name={name} size={size} className="ring-0" />
}

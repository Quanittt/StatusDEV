const dateFmt = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })

export const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : '—')

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'щойно'
  if (min < 60) return `${min} хв тому`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} год тому`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} дн тому`
  return dateFmt.format(new Date(iso))
}

// <input type="date"> повертає YYYY-MM-DD; API чекає дату або null.
export const dateInputToApi = (v: string) => (v ? new Date(v).toISOString() : null)
export const apiToDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

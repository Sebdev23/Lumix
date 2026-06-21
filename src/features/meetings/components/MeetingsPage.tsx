import { Card } from '@shared/components/ui/Card'
import { Button } from '@shared/components/ui/Button'

const meetings = [
  { title: 'Planning Sprint 2', date: 'Lun 22 Jun', time: '10:00', status: 'upcoming' },
  { title: 'Revision de errores', date: 'Mie 24 Jun', time: '15:00', status: 'upcoming' },
]

export function MeetingsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-200">Reuniones</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <Button size="sm" className="w-full mb-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Iniciar reunion
        </Button>
        {meetings.map((m, i) => (
          <Card key={i} padding="md">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-200">{m.title}</h3>
                <p className="text-xs text-slate-400 mt-1">{m.date} · {m.time}</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-600/20 text-indigo-400 text-xs font-medium">
                Proxima
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

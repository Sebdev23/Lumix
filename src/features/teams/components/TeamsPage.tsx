import { useState } from 'react'
import { Card } from '@shared/components/ui/Card'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Input } from '@shared/components/ui/Input'
import { Modal } from '@shared/components/ui/Modal'
import { Avatar } from '@shared/components/ui/Avatar'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useTeams, useTeamMembers } from '@features/teams/hooks/useTeams'

export function TeamsPage() {
  const { teams, loading, createTeam } = useTeams()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const {
    members,
    loading: membersLoading,
    addMember,
    removeMember,
  } = useTeamMembers(selectedTeam ?? '')
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState('')

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createTeam(newName, newDesc)
    setNewName('')
    setNewDesc('')
    setShowCreate(false)
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setError('')
    try {
      await addMember(inviteEmail)
      setInviteEmail('')
    } catch {
      setError('Usuario no encontrado')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Equipos</h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + Nuevo
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-slate-400">No tienes equipos</p>
            <p className="text-xs text-slate-600 mt-1">Crea uno o pide que te inviten</p>
          </div>
        ) : (
          teams.map((team) => (
            <Card key={team.id} padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-200">{team.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{team.description || 'Sin descripcion'}</p>
                </div>
                {profile?.team_id === team.id && (
                  <Badge variant="success">Actual</Badge>
                )}
              </div>

              {selectedTeam === team.id && (
                <div className="mt-4 pt-3 border-t border-slate-700">
                  <h4 className="text-xs font-medium text-slate-400 mb-3">Miembros</h4>

                  {membersLoading ? (
                    <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : (
                    <div className="space-y-2 mb-3">
                      {members.map((m) => (
                        <div key={m.user_id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Avatar name={m.profile.full_name} size="sm" />
                            <div>
                              <p className="text-xs text-slate-300">{m.profile.full_name}</p>
                              <p className="text-[10px] text-slate-500">{m.profile.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge>{m.role}</Badge>
                            {m.user_id !== profile?.id && isAdmin && (
                              <button
                                onClick={() => removeMember(m.user_id)}
                                className="text-[10px] text-red-400 hover:text-red-300"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="flex gap-2">
                      <input
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="Email para invitar..."
                        className="flex-1 text-xs rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      />
                      <Button size="sm" onClick={handleInvite}>Invitar</Button>
                    </div>
                  )}
                  {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                </div>
              )}

              {isAdmin ? (
                <button
                  onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 mt-3"
                >
                  {selectedTeam === team.id ? 'Ocultar miembros' : 'Gestionar miembros'}
                </button>
              ) : (
                <button
                  onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
                  className="text-xs text-slate-500 hover:text-slate-400 mt-3"
                >
                  {selectedTeam === team.id ? 'Ocultar miembros' : 'Ver miembros'}
                </button>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Create team modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Crear equipo" size="sm">
        <div className="space-y-4">
          <Input
            label="Nombre del equipo"
            placeholder="Ej: Equipo de Desarrollo"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            label="Descripcion (opcional)"
            placeholder="Descripcion del equipo"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <Button onClick={handleCreate} className="w-full" disabled={!newName.trim()}>
            Crear equipo
          </Button>
        </div>
      </Modal>
    </div>
  )
}

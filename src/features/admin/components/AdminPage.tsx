import { useState } from 'react'
import { Card } from '@shared/components/ui/Card'
import { Badge } from '@shared/components/ui/Badge'
import { Button } from '@shared/components/ui/Button'
import { Input } from '@shared/components/ui/Input'
import { Avatar } from '@shared/components/ui/Avatar'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useTeams, useTeamMembers } from '@features/teams/hooks/useTeams'
import { adminService } from '@infrastructure/supabase/admin.service'

const roles = ['admin', 'jefatura', 'colaborador', 'invitado'] as const

export function AdminPage() {
  const { profile } = useAuth()
  const { teams, loading: teamsLoading, createTeam } = useTeams()
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const { members, loading: membersLoading, reload } = useTeamMembers(selectedTeam ?? '')

  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<string>('colaborador')
  const [newTeamName, setNewTeamName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-sm text-slate-400">No tienes permisos de administrador</p>
      </div>
    )
  }

  const handleCreateUser = async () => {
    if (!newEmail || !newName) return
    setError('')
    setSuccess('')
    setGeneratedPassword('')
    try {
      const result = await adminService.createUser(
        newEmail,
        '',
        newName,
        newRole,
        selectedTeam ?? undefined,
      )
      setSuccess(`Usuario ${newEmail} creado. Rol: ${newRole}`)
      setGeneratedPassword(result.password)
      setNewEmail('')
      setNewName('')
      if (selectedTeam) reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return
    await createTeam(newTeamName.trim(), '')
    setNewTeamName('')
  }

  const handleChangeRole = async (userId: string, role: string) => {
    if (!selectedTeam) return
    await adminService.changeRole(userId, selectedTeam, role)
    reload()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-3 sm:px-4 h-12 sm:h-14 border-b border-slate-800 bg-slate-900 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-200">Administracion</h2>
        <Badge variant="danger" className="ml-2">
          Admin
        </Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Crear usuario */}
        <Card>
          <h3 className="text-sm font-medium text-slate-200 mb-4">Crear usuario</h3>
          <div className="space-y-3">
            <Input
              label="Nombre completo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del usuario"
            />
            <Input
              label="Email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="usuario@email.com"
            />

            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">Rol</label>
              <div className="flex gap-1 flex-wrap">
                {roles.map((r) => (
                  <button
                    key={r}
                    onClick={() => setNewRole(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      newRole === r
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-300 block mb-1.5">
                Equipo (opcional)
              </label>
              <select
                value={selectedTeam ?? ''}
                onChange={(e) => setSelectedTeam(e.target.value || null)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                <option value="">Sin equipo</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && (
              <div className="p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50">
                <p className="text-xs text-emerald-400">{success}</p>
                {generatedPassword && (
                  <p className="text-xs text-emerald-300 mt-1 font-mono">
                    Clave temporal:{' '}
                    <span className="font-bold select-all">{generatedPassword}</span>
                  </p>
                )}
                <p className="text-[10px] text-emerald-600 mt-1">
                  Debera cambiarla al iniciar sesion
                </p>
              </div>
            )}

            <Button onClick={handleCreateUser} className="w-full" disabled={!newEmail || !newName}>
              Crear usuario
            </Button>
          </div>
        </Card>

        {/* Equipos y miembros */}
        <Card>
          <h3 className="text-sm font-medium text-slate-200 mb-4">Equipos</h3>

          <div className="flex gap-2 mb-4">
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Nombre del nuevo equipo"
              className="flex-1 text-xs rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <Button size="sm" onClick={handleCreateTeam} disabled={!newTeamName.trim()}>
              + Equipo
            </Button>
          </div>

          {teamsLoading ? (
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
                <div key={team.id} className="border border-slate-700 rounded-lg">
                  <button
                    onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/50 transition-colors rounded-lg"
                  >
                    <span className="text-sm text-slate-200">{team.name}</span>
                    <span className="text-[10px] text-slate-500">
                      {selectedTeam === team.id ? 'Ocultar' : 'Gestionar'}
                    </span>
                  </button>

                  {selectedTeam === team.id && (
                    <div className="px-3 pb-3 border-t border-slate-700 pt-2">
                      {membersLoading ? (
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto my-2" />
                      ) : (
                        <div className="space-y-2">
                          {members.map((m) => (
                            <div key={m.user_id} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Avatar name={m.profile.full_name} size="sm" />
                                <div>
                                  <p className="text-xs text-slate-300">{m.profile.full_name}</p>
                                  <p className="text-[10px] text-slate-500">{m.profile.email}</p>
                                </div>
                              </div>
                              <select
                                value={m.role}
                                onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                                className="text-xs rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                              >
                                {roles.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {members.length === 0 && (
                            <p className="text-xs text-slate-500 py-2 text-center">Sin miembros</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { teamsService, type GrupoTrabajo } from '@infrastructure/supabase/teams.service'
import { useAuth } from '@core/auth/hooks/useAuth'

interface Team {
  id: string
  name: string
  description: string | null
  created_by: string
  created_at: string
}

interface Member {
  id: string
  team_id: string
  user_id: string
  role: string
  permissions?: Record<string, boolean>
  grupo_id?: string | null
  profile: { full_name: string; email: string }
}

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function load() {
      const data = await teamsService.getMyTeams(user!.id)
      if (cancelled) return
      setTeams(data)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [user])

  const createTeam = async (name: string, description: string) => {
    if (!user) return
    await teamsService.create(name, description, user.id)
    const data = await teamsService.getMyTeams(user.id)
    setTeams(data)
  }

  return { teams, loading, createTeam }
}

export function useTeamMembers(teamId: string) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teamId) return

    let cancelled = false

    async function load() {
      const data = await teamsService.getMembers(teamId)
      if (cancelled) return
      setMembers(data)
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
    }
  }, [teamId])

  const addMember = async (email: string) => {
    await teamsService.addMember(teamId, email)
    const data = await teamsService.getMembers(teamId)
    setMembers(data)
  }

  const removeMember = async (userId: string) => {
    await teamsService.removeMember(teamId, userId)
    const data = await teamsService.getMembers(teamId)
    setMembers(data)
  }

  const changeRole = async (userId: string, role: string) => {
    await teamsService.changeRole(teamId, userId, role)
    setMembers(await teamsService.getMembers(teamId))
  }

  const updatePermissions = async (userId: string, permissions: Record<string, boolean>) => {
    await teamsService.updatePermissions(teamId, userId, permissions)
    setMembers(await teamsService.getMembers(teamId))
  }

  const changeGrupo = async (userId: string, grupoId: string | null) => {
    await teamsService.assignGrupo(teamId, userId, grupoId)
    setMembers(await teamsService.getMembers(teamId))
  }

  return {
    members,
    loading,
    addMember,
    removeMember,
    changeRole,
    updatePermissions,
    changeGrupo,
    reload: async () => {
      const data = await teamsService.getMembers(teamId)
      setMembers(data)
    },
  }
}

// Grupos de trabajo (alias "foco") de un equipo: catalogo que crea/borra jefatura, usado
// para asignar personas (aqui) y para filtrar en Minuta/Actividades (donde solo se lee).
export function useGruposTrabajo(teamId: string) {
  const [grupos, setGrupos] = useState<GrupoTrabajo[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const reload = async () => {
    if (!teamId) return
    setGrupos(await teamsService.getGrupos(teamId))
  }

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    teamsService.getGrupos(teamId).then((data) => {
      if (!cancelled) {
        setGrupos(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [teamId])

  const crearGrupo = async (nombre: string) => {
    if (!user || !nombre.trim()) return
    await teamsService.createGrupo(teamId, nombre, user.id)
    await reload()
  }

  const eliminarGrupo = async (grupoId: string) => {
    await teamsService.deleteGrupo(grupoId)
    await reload()
  }

  return { grupos, loading, crearGrupo, eliminarGrupo, reload }
}

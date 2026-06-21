import { useState, useEffect } from 'react'
import { teamsService } from '@infrastructure/supabase/teams.service'
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

  return {
    members,
    loading,
    addMember,
    removeMember,
    reload: async () => {
      const data = await teamsService.getMembers(teamId)
      setMembers(data)
    },
  }
}

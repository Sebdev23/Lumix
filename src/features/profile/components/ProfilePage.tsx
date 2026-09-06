import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@shared/components/ui/Button'
import { Input } from '@shared/components/ui/Input'
import { Card } from '@shared/components/ui/Card'
import { Badge } from '@shared/components/ui/Badge'
import { Avatar } from '@shared/components/ui/Avatar'
import { LumixIcon } from '@shared/components/ui/LumixIcon'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useTheme } from '@core/theme/ThemeContext'
import { supabase } from '@infrastructure/supabase/client'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { normalizeFullName } from '@shared/utils/name'
import { APP_VERSION, APP_VERSION_DATE } from '@shared/changelog'

const EMOJI_OPTIONS = [
  '😀',
  '😎',
  '🤓',
  '🦊',
  '🐱',
  '🐶',
  '🦁',
  '🐯',
  '🐻',
  '🐼',
  '🐨',
  '🐙',
  '🦑',
  '🦀',
  '🐳',
  '🦄',
  '🐝',
  '🌸',
  '⭐',
  '🔥',
  '💡',
  '🚀',
  '💎',
  '🎯',
  '🛡️',
  '⚡',
  '🌟',
  '💪',
  '🧠',
  '👑',
  '🎸',
  '🎨',
  '🔧',
  '📊',
  '📈',
  '🗂️',
  '💬',
  '✅',
  '❌',
  '⚠️',
  '♻️',
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  jefatura: 'Jefatura',
  colaborador: 'Colaborador',
  invitado: 'Invitado',
}

export function ProfilePage() {
  const { profile, user, signOut } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [showEmoji, setShowEmoji] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    try {
      await profilesService.update(user.id, {
        full_name: normalizeFullName(fullName),
        avatar_url: avatarUrl || null,
      })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 6) {
      setPasswordError('La contrasena debe tener al menos 6 caracteres')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contrasenas no coinciden')
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setPasswordError(error.message)
    } else {
      setPasswordSuccess('Contrasena actualizada')
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 sm:px-4 h-12 sm:h-14 border-b border-border bg-panel flex-shrink-0">
        <h2 className="text-sm font-semibold text-fg-body">Perfil</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Avatar */}
        <Card padding="md">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowEmoji((v) => !v)} className="flex-shrink-0">
              {avatarUrl ? (
                <span className="text-4xl">{avatarUrl}</span>
              ) : (
                <Avatar
                  name={profile?.full_name ?? 'Usuario'}
                  src={profile?.avatar_url}
                  size="lg"
                />
              )}
            </button>
            <div>
              <p className="text-sm font-medium text-fg-body">{profile?.full_name}</p>
              <Badge variant="info" className="mt-1">
                {ROLE_LABELS[profile?.role ?? 'colaborador'] ?? profile?.role}
              </Badge>
              <p className="text-xs text-slate-500 mt-0.5">{profile?.email}</p>
            </div>
          </div>

          {showEmoji && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-xs text-fg-faint mb-2">Elegi un emoji como avatar</p>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setAvatarUrl(emoji)
                      setShowEmoji(false)
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-2 text-lg transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
                {avatarUrl && (
                  <button
                    onClick={() => setAvatarUrl('')}
                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-900/50 text-xs text-red-400 light:text-red-600 light:hover:bg-red-100 transition-colors"
                    title="Quitar emoji"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Nombre */}
        <Card padding="md">
          <p className="text-xs text-fg-faint mb-2">Nombre completo</p>
          <div className="flex gap-2">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
              className="flex-1"
            />
            <Button size="sm" onClick={saveProfile} disabled={saving}>
              {saving ? '...' : 'Guardar'}
            </Button>
          </div>
        </Card>

        {/* Cambiar password */}
        <Card padding="md">
          <button
            onClick={() => setShowPassword((v) => !v)}
            className="w-full text-left text-sm font-medium text-fg-body flex items-center justify-between"
          >
            Cambiar contrasena
            <svg
              className={`w-4 h-4 text-fg-faint transition-transform ${showPassword ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showPassword && (
            <form onSubmit={changePassword} className="mt-3 space-y-3 pt-3 border-t border-border">
              {passwordError && (
                <p className="text-xs text-red-400 light:text-red-600 bg-red-900/30 border border-red-700/50 light:bg-red-50 light:border-red-200 rounded-lg px-3 py-2">
                  {passwordError}
                </p>
              )}
              {passwordSuccess && (
                <p className="text-xs text-emerald-400 light:text-emerald-700 bg-emerald-900/30 border border-emerald-700/50 light:bg-emerald-50 light:border-emerald-200 rounded-lg px-3 py-2">
                  {passwordSuccess}
                </p>
              )}
              <Input
                label="Nueva contrasena"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
              />
              <Input
                label="Confirmar contrasena"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeti la contrasena"
              />
              <Button type="submit" size="sm" className="w-full">
                Actualizar contrasena
              </Button>
            </form>
          )}
        </Card>

        {/* Apariencia: oscuro (default de siempre) o claro, opt-in y guardado por dispositivo */}
        <Card padding="md">
          <p className="text-sm font-medium text-fg-body mb-2">Apariencia</p>
          <div className="inline-flex rounded-lg bg-surface p-0.5">
            <button
              onClick={() => setTheme('dark')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                theme === 'dark'
                  ? 'bg-slate-700 text-indigo-300 shadow-sm'
                  : 'text-fg-faint hover:text-fg-body'
              }`}
            >
              🌙 Oscuro
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                theme === 'light'
                  ? 'light:bg-white light:text-indigo-600 light:shadow-sm'
                  : 'text-fg-faint hover:text-fg-body'
              }`}
            >
              ☀️ Claro
            </button>
          </div>
          <p className="text-[11px] text-slate-500 light:text-slate-400 mt-2">
            Se guarda en este dispositivo.
          </p>
        </Card>

        {/* Sobre Lumix */}
        <Card padding="lg">
          <div className="flex items-center gap-3 mb-4">
            <LumixIcon size="md" />
            <div>
              <p className="text-base font-semibold text-fg">Lumix</p>
              <p className="text-xs text-slate-500">Tu asistente conversacional</p>
            </div>
          </div>

          <p className="text-sm text-fg-muted leading-relaxed mb-4">
            Lumix transforma tus conversaciones en acciones. Escribi en lenguaje natural lo que
            necesitas y el se encarga del resto. Sin formularios, sin menus, solo chat.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {[
              {
                icon: '📋',
                title: 'Actividades',
                desc: 'Crea, asigna y gestiona tareas con lenguaje natural',
              },
              {
                icon: '🗓️',
                title: 'Minuta',
                desc: 'Dicta temas para la reunion semanal, con subtareas',
              },
              {
                icon: '🚀',
                title: 'Proyectos',
                desc: 'Inicia iniciativas de varias semanas, con Lista/Tablero/Cronograma',
              },
              {
                icon: '🐛',
                title: 'Bitacora',
                desc: 'Registra errores con severidad detectada automaticamente',
              },
              {
                icon: '💬',
                title: 'Consultas',
                desc: 'Pregunta por el estado del equipo, carga o pendientes',
              },
              {
                icon: '✏️',
                title: 'Modificaciones',
                desc: 'Completa, mueve, reasigna o cambia prioridades',
              },
              {
                icon: '📦',
                title: 'Modo masivo',
                desc: 'Crea varias actividades de una vez desde una lista',
              },
              {
                icon: '⚠️',
                title: 'Alertas',
                desc: 'Detecta sobrecarga y avisa cuando alguien tiene mucho',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface-soft border border-border"
              >
                <span className="text-lg flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="text-xs font-medium text-fg-body">{item.title}</p>
                  <p className="text-[11px] text-fg-faint leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-indigo-600/10 border border-indigo-500/20 p-3">
            <p className="text-xs text-indigo-300 light:text-indigo-700">
              <span className="font-medium">Tip:</span> Escribi{' '}
              <code className="px-1 py-0.5 rounded bg-indigo-600/20 text-indigo-300 light:text-indigo-700 text-[11px]">
                ayuda
              </code>{' '}
              en el chat para ver ejemplos de todo lo que podes hacer.
            </p>
          </div>
          <p className="text-[11px] text-slate-500 text-center mt-3">
            Version {APP_VERSION} · actualizado el {APP_VERSION_DATE}
          </p>
        </Card>

        {/* Cerrar sesion */}
        <button
          onClick={handleLogout}
          className="w-full px-4 py-3 rounded-xl bg-red-900/20 border border-red-700/30 text-sm text-red-400 hover:bg-red-900/30 light:bg-red-50 light:border-red-200 light:text-red-600 light:hover:bg-red-100 transition-colors"
        >
          Cerrar sesion
        </button>
      </div>
    </div>
  )
}

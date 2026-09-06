import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@shared/components/ui/Button'
import { Input } from '@shared/components/ui/Input'
import { LumixIcon } from '@shared/components/ui/LumixIcon'
import { useAuth } from '@core/auth/hooks/useAuth'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // Validacion propia en vez de "required": el mensaje nativo del navegador ("Please fill
    // out this field") sale en ingles y no calza con el resto de la app, ya toda en espanol.
    if (!email.trim() || !password.trim()) {
      setError('Completa email y contrasena.')
      return
    }
    setLoading(true)
    const { error: err } = await signIn(email, password)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      navigate('/chat')
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LumixIcon size="lg" className="mx-auto" />
          <h1 className="text-xl font-bold text-slate-100 mt-4">Lumix</h1>
          <p className="text-sm text-slate-500 mt-1">Sistema Operativo Conversacional</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Contraseña"
            type="password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </Button>
        </form>

        <p className="text-xs text-slate-600 text-center mt-6">
          ¿No tienes cuenta? Pide una invitación a tu administrador.
        </p>
      </div>
    </div>
  )
}

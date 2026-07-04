import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@shared/components/ui/Button'
import { Input } from '@shared/components/ui/Input'
import { LumixIcon } from '@shared/components/ui/LumixIcon'
import { useAuth } from '@core/auth/hooks/useAuth'

export function SignUpPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const { error: err } = await signUp(email, password, fullName)
    setLoading(false)

    if (err) {
      setError(err)
    } else {
      setSuccess('Cuenta creada. Revisa tu email para confirmar.')
      setTimeout(() => navigate('/login'), 3000)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <LumixIcon size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-100">Crear cuenta</h1>
          <p className="text-sm text-slate-500 mt-1">Unete a Lumix</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-900/30 border border-emerald-700/50 text-sm text-emerald-400">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nombre completo"
            placeholder="Tu nombre"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Contrasena"
            type="password"
            placeholder="Minimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </Button>
        </form>

        <p className="text-xs text-slate-500 text-center mt-6">
          Ya tienes cuenta?{' '}
          <Link to="/login" className="text-indigo-400 hover:text-indigo-300">
            Inicia sesion
          </Link>
        </p>
      </div>
    </div>
  )
}

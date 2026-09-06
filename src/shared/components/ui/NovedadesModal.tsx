import { useState } from 'react'
import { Modal } from '@shared/components/ui/Modal'
import { Button } from '@shared/components/ui/Button'
import { useAuth } from '@core/auth/hooks/useAuth'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { CHANGELOG_VERSION, CHANGELOG_ITEMS } from '@shared/changelog'

// Se muestra UNA vez por usuario (no por dispositivo) cuando su `changelog_visto` queda
// atras de CHANGELOG_VERSION. `profile` llega desde AuthContext ya cargado -AppLayout solo
// se monta dentro de AuthGuard, asi que siempre hay sesion cuando esto renderiza.
export function NovedadesModal() {
  const { profile, user } = useAuth()
  const yaVisto = (profile?.changelog_visto ?? 0) >= CHANGELOG_VERSION
  // Estado propio para poder cerrar al instante sin esperar a que AuthContext refresque el
  // profile completo -guardar en la base es en paralelo, no bloquea la UI.
  const [cerrado, setCerrado] = useState(false)

  const cerrar = () => {
    setCerrado(true)
    if (user)
      profilesService.update(user.id, { changelog_visto: CHANGELOG_VERSION }).catch(() => {})
  }

  if (!profile || yaVisto || cerrado) return null

  return (
    <Modal open onClose={cerrar} title="Novedades en Lumix" size="md">
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">Esto es lo nuevo desde la ultima vez que entraste:</p>
        <div className="space-y-2">
          {CHANGELOG_ITEMS.map((item) => (
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
        <Button onClick={cerrar} className="w-full">
          Entendido
        </Button>
      </div>
    </Modal>
  )
}

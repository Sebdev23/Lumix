import { useEffect } from 'react'

/**
 * Fija --app-height al alto REAL disponible (visualViewport), no al alto logico de la
 * pantalla. Bug real reportado: en el celular, al escribir en el chat, el boton enviar
 * quedaba tapado por el teclado y solo volvia a verse haciendo zoom a mano.
 *
 * Causa: `100dvh` (lo que se usaba antes) esta pensado para el chrome del navegador
 * (barra de direccion que aparece/desaparece), no para el teclado en pantalla. En iOS
 * Safari en particular, el teclado NO reduce `dvh` -se superpone encima del layout, que
 * sigue creyendo que tiene toda la pantalla, y el ultimo tramo (donde vive el input+boton)
 * queda literalmente detras del teclado-. El zoom manual "arreglaba" el sintoma porque
 * fuerza a Safari a recalcular el viewport visual, no porque el layout estuviera bien.
 *
 * `window.visualViewport` SI refleja el alto real visible (descuenta el teclado) en todos
 * los navegadores modernos, asi que se usa eso para fijar la variable CSS que consume
 * AppLayout, en vez de depender de una unidad de viewport que no esta pensada para esto.
 */
export function useAppHeight() {
  useEffect(() => {
    const vv = window.visualViewport
    const setAltura = () => {
      const alto = vv?.height ?? window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${alto}px`)
    }
    setAltura()
    vv?.addEventListener('resize', setAltura)
    vv?.addEventListener('scroll', setAltura)
    window.addEventListener('resize', setAltura)
    return () => {
      vv?.removeEventListener('resize', setAltura)
      vv?.removeEventListener('scroll', setAltura)
      window.removeEventListener('resize', setAltura)
    }
  }, [])
}

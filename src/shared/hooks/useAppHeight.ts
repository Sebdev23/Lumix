import { useEffect } from 'react'

/**
 * Fija --app-height y --app-top al alto y desplazamiento REALES del viewport visual (no al
 * viewport logico de la pantalla). Dos bugs reales reportados, probando en el celular:
 *
 * 1. Al ESCRIBIR, el boton enviar quedaba tapado por el teclado (ya corregido con
 *    --app-height): `100dvh` esta pensado para el chrome del navegador (barra de direccion
 *    que aparece/desaparece), no para el teclado en pantalla -en iOS el teclado se
 *    superpone encima del layout sin achicarlo, y el ultimo tramo (input+boton) quedaba
 *    detras del teclado-.
 *
 * 2. Al CERRAR el teclado, la parte de arriba quedaba fuera de la vista ("se pierde hacia
 *    arriba"). Causa: un bug conocido de iOS 26 donde `visualViewport.offsetTop` no vuelve
 *    a 0 al cerrar el teclado -el viewport VISUAL queda corrido hacia abajo respecto del
 *    viewport logico (donde vive nuestro layout, que arranca en 0), asi que el tramo de
 *    arriba del layout cae fuera de lo que se ve, aunque el layout en si este bien-.
 *
 * La solucion robusta (no depende de que iOS "arregle" el numero) es dejar de vivir en el
 * flujo normal del documento: el contenedor raiz pasa a `position: fixed` con su `top` Y su
 * `height` tomados en vivo de `visualViewport` (ver AppLayout.tsx). Asi el layout SIEMPRE
 * pinta exactamente donde el navegador dice que esta lo visible, sea o no ese numero
 * "correcto" por especificacion -no hace falta juzgar si iOS esta bien o mal, alcanza con
 * seguirlo-.
 */
export function useAppHeight() {
  useEffect(() => {
    const vv = window.visualViewport
    const aplicar = () => {
      const alto = vv?.height ?? window.innerHeight
      const arriba = vv?.offsetTop ?? 0
      document.documentElement.style.setProperty('--app-height', `${alto}px`)
      document.documentElement.style.setProperty('--app-top', `${arriba}px`)
    }
    // Un segundo chequeo con una demora corta: en iOS 26 el primer evento de resize/scroll
    // al abrir/cerrar el teclado a veces llega con el offset todavia sin asentar del todo
    // (se corrige una fraccion de segundo despues).
    const aplicarConDemora = () => {
      aplicar()
      setTimeout(aplicar, 120)
    }
    aplicar()
    vv?.addEventListener('resize', aplicarConDemora)
    vv?.addEventListener('scroll', aplicarConDemora)
    window.addEventListener('resize', aplicarConDemora)
    return () => {
      vv?.removeEventListener('resize', aplicarConDemora)
      vv?.removeEventListener('scroll', aplicarConDemora)
      window.removeEventListener('resize', aplicarConDemora)
    }
  }, [])
}

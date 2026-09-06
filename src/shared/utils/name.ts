// Normaliza un nombre escrito por una persona: recorta espacios, colapsa dobles espacios,
// y deja la primera letra de cada palabra en mayuscula. Se aplica en cada punto donde un
// full_name entra al sistema (signup, admin, perfil) para que la inconsistencia de
// mayusculas no vuelva a aparecer.
export function normalizeFullName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((palabra) =>
      palabra
        ? palabra.charAt(0).toLocaleUpperCase('es') + palabra.slice(1).toLocaleLowerCase('es')
        : palabra,
    )
    .join(' ')
}

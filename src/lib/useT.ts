import { useAppStore } from '../store'
import { translate } from '../i18n'

export function useT(): (key: string, ...args: Array<string | number>) => string {
  const language = useAppStore((state) => state.language)
  return (key, ...args) => translate(language, key, ...args)
}

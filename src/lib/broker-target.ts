import { getEndpoint } from './auth.js'

export type BrokerConnectionKind = 'same-origin' | 'remote' | 'custom'

export interface BrokerTarget {
  kind: BrokerConnectionKind
  display: string
}

// Keep every consumer on the same endpoint precedence: an explicitly remembered
// broker wins over a build-time standalone default; blank means this origin.
export function selectBrokerBaseURL(stored: string, built?: string): string {
  return stored || built || ''
}

export function brokerBaseURL(): string {
  return selectBrokerBaseURL(getEndpoint(), import.meta.env.VITE_MQLITE_URL as string | undefined)
}

// Describe only the origin. User info, paths, query parameters and fragments are
// deliberately never returned to UI code.
export function describeBrokerTarget(baseURL: string, pageOrigin: string): BrokerTarget {
  try {
    const page = new URL(pageOrigin)
    const target = new URL(baseURL || page.origin, page.origin)
    if (!['http:', 'https:'].includes(target.protocol) || target.origin === 'null') {
      return { kind: 'custom', display: 'custom endpoint' }
    }
    return {
      kind: target.origin === page.origin ? 'same-origin' : 'remote',
      display: target.origin,
    }
  } catch {
    return { kind: 'custom', display: 'custom endpoint' }
  }
}

export function currentBrokerTarget(): BrokerTarget {
  return describeBrokerTarget(brokerBaseURL(), window.location.origin)
}

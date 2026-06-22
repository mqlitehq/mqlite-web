import { useCallback, useEffect, useState } from 'react'
import { onUnauthorized } from './lib/api'
import { clearToken, isAuthed } from './lib/auth'
import { Login } from './components/Login'
import { Shell } from './components/Shell'

export function App() {
  const [authed, setAuthed] = useState(isAuthed())

  // any 401 from the api layer bounces us back to the login screen.
  useEffect(() => onUnauthorized(() => setAuthed(false)), [])

  const signOut = useCallback(() => {
    clearToken()
    setAuthed(false)
  }, [])

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />
  return <Shell onSignOut={signOut} />
}

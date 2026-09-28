import { createContext, useContext, useState, useEffect } from 'react'
import api from '../api/axios'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('hdm_token')
    if (savedToken) {
      setToken(savedToken)
      fetchUser(savedToken)
    } else {
      setIsLoading(false)
    }
  }, [])

  const fetchUser = async (authToken) => {
    try {
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      setUser(response.data.user)
    } catch (error) {
      localStorage.removeItem('hdm_token')
      setToken(null)
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password })
    const { token: newToken, user: userData } = response.data
    localStorage.setItem('hdm_token', newToken)
    setToken(newToken)
    setUser(userData)
    return userData
  }

  const register = async (email, password, deviceName) => {
    const response = await api.post('/auth/register', { email, password, deviceName })
    const { token: newToken, user: userData } = response.data
    localStorage.setItem('hdm_token', newToken)
    setToken(newToken)
    setUser(userData)
    return userData
  }

  const loginWithFarmvexa = async (email, password) => {
    const response = await api.post('/auth/farmvexa', { email, password })
    const { token: newToken, user: userData } = response.data
    localStorage.setItem('hdm_token', newToken)
    setToken(newToken)
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('hdm_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!token,
      isLoading,
      login,
      register,
      loginWithFarmvexa,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
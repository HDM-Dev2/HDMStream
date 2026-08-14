import { useEffect, useState, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

export function useSocket(role, deviceName = '') {
  const [socket, setSocket] = useState(null)
  const [connected, setConnected] = useState(false)
  const [senders, setSenders] = useState([])
  const [receivers, setReceivers] = useState([])
  const [error, setError] = useState(null)
  
  const socketRef = useRef(null)
  const deviceNameRef = useRef(deviceName)
  const roleRef = useRef(role)

  useEffect(() => {
    deviceNameRef.current = deviceName
  }, [deviceName])

  useEffect(() => {
    roleRef.current = role
  }, [role])

  useEffect(() => {
    const token = localStorage.getItem('hdm_token')
    
    const newSocket = io({
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      timeout: 10000,
      autoConnect: true,
      forceNew: true,
      maxHttpBufferSize: 5e6,
      auth: { token }
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    const joinRoom = () => {
      const currentRole = roleRef.current
      const name = deviceNameRef.current
      
      if (currentRole === 'sender') {
        newSocket.emit('sender-join', { name })
      } else if (currentRole === 'receiver') {
        newSocket.emit('receiver-join', { name })
      }
    }

    newSocket.on('connect', () => {
      setConnected(true)
      setError(null)
      joinRoom()
    })

    newSocket.on('disconnect', () => {
      setConnected(false)
      setSenders([])
      setReceivers([])
    })

    newSocket.on('connect_error', (err) => {
      setError(err.message)
      setConnected(false)
    })

    newSocket.on('reconnect', () => {
      setConnected(true)
      setError(null)
      joinRoom()
    })

    newSocket.on('senders-update', (sendersList) => {
      setSenders(sendersList)
    })

    newSocket.on('receivers-update', (receiversList) => {
      setReceivers(receiversList)
    })

    newSocket.on('sender-available', (data) => {
      setSenders(prev => {
        const exists = prev.some(s => s.socketId === data.senderId)
        if (!exists) {
          return [...prev, { socketId: data.senderId, ...data }]
        }
        return prev
      })
    })

    newSocket.on('sender-disconnected', (senderId) => {
      setSenders(prev => prev.filter(s => s.socketId !== senderId))
    })

    newSocket.on('receiver-disconnected', (receiverId) => {
      setReceivers(prev => prev.filter(r => r.socketId !== receiverId))
    })

    return () => {
      newSocket.removeAllListeners()
      newSocket.disconnect()
      socketRef.current = null
      setSocket(null)
      setConnected(false)
      setSenders([])
      setReceivers([])
      setError(null)
    }
  }, [])

  const emit = useCallback((event, data) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit(event, data)
    }
  }, [])

  return {
    socket,
    connected,
    senders,
    receivers,
    error,
    emit,
    socketId: socketRef.current?.id
  }
}
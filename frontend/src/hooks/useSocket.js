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
      maxHttpBufferSize: 5e6
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    const joinRoom = () => {
      const currentRole = roleRef.current
      const name = deviceNameRef.current || `${currentRole}-${newSocket.id.slice(0, 4)}`
      
      if (currentRole === 'sender') {
        newSocket.emit('sender-join', {
          deviceId: newSocket.id,
          name: name
        })
      } else if (currentRole === 'receiver') {
        newSocket.emit('receiver-join', {
          deviceId: newSocket.id,
          name: name
        })
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

    newSocket.on('reconnect_failed', () => {
      setError('Failed to reconnect')
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

  const joinRoom = useCallback((roomId) => {
    emit('join-room', roomId)
  }, [emit])

  const leaveRoom = useCallback((roomId) => {
    emit('leave-room', roomId)
  }, [emit])

  const sendOffer = useCallback((target, offer) => {
    emit('offer', { target, offer })
  }, [emit])

  const sendAnswer = useCallback((target, answer) => {
    emit('answer', { target, answer })
  }, [emit])

  const sendIceCandidate = useCallback((target, candidate) => {
    emit('ice-candidate', { target, candidate })
  }, [emit])

  const updateDeviceName = useCallback((name) => {
    deviceNameRef.current = name
    if (socketRef.current && socketRef.current.connected) {
      const currentRole = roleRef.current
      if (currentRole === 'receiver') {
        socketRef.current.emit('receiver-join', {
          deviceId: socketRef.current.id,
          name: name
        })
      } else if (currentRole === 'sender') {
        socketRef.current.emit('sender-join', {
          deviceId: socketRef.current.id,
          name: name
        })
      }
    }
  }, [])

  return {
    socket,
    connected,
    senders,
    receivers,
    error,
    emit,
    joinRoom,
    leaveRoom,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    updateDeviceName,
    socketId: socketRef.current?.id
  }
}
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import api from '../api/axios'

export default function ReceivePage() {
  const navigate = useNavigate()
  const { socket, connected, senders, error } = useSocket('receiver')
  
  const [streams, setStreams] = useState(new Map())
  const [status, setStatus] = useState('Ready to receive...')
  const [capturedImages, setCapturedImages] = useState([])
  const [showGallery, setShowGallery] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(true)
  const [uploading, setUploading] = useState(false)
  
  const deviceIdRef = useRef(null)

  useEffect(() => {
    deviceIdRef.current = localStorage.getItem('receiverDeviceId') || generateDeviceId()
    localStorage.setItem('receiverDeviceId', deviceIdRef.current)
    
    const savedName = localStorage.getItem('receiverName')
    if (savedName) {
      setDeviceName(savedName)
      setShowNamePrompt(false)
    }
  }, [])

  useEffect(() => {
    if (!socket) return
    
    socket.emit('get-device-name', { deviceId: deviceIdRef.current, type: 'receiver' })
    
    socket.on('device-name-found', (data) => {
      if (data.name) {
        setDeviceName(data.name)
        localStorage.setItem('receiverName', data.name)
        setShowNamePrompt(false)
      }
    })
    
    return () => {
      socket.off('device-name-found')
    }
  }, [socket])

  useEffect(() => {
    if (senders.length > 0) {
      setStatus(`${senders.length} sender(s) online - Waiting for stream...`)
    } else {
      setStatus('Ready to receive...')
    }
  }, [senders])

  useEffect(() => {
    if (!socket) return

    socket.on('frame', (data) => {
      const { frameData, senderId, senderName } = data
      
      const blob = new Blob([frameData], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      
      setStreams(prev => {
        const newMap = new Map(prev)
        const oldData = newMap.get(senderId)
        if (oldData && oldData.url) {
          URL.revokeObjectURL(oldData.url)
        }
        newMap.set(senderId, { type: 'relay', url, senderName })
        return newMap
      })
      
      setStatus('Receiving stream...')
    })

    socket.on('sender-available', () => {
      setStatus('Sender found - Waiting for stream...')
    })

    socket.on('sender-disconnected', (senderId) => {
      setStreams(prev => {
        const newMap = new Map(prev)
        const oldData = newMap.get(senderId)
        if (oldData && oldData.url) {
          URL.revokeObjectURL(oldData.url)
        }
        newMap.delete(senderId)
        return newMap
      })
      setStatus('Ready to receive...')
    })

    return () => {
      socket.off('frame')
      socket.off('sender-available')
      socket.off('sender-disconnected')
    }
  }, [socket])

  const generateDeviceId = () => {
    return 'receiver-' + Math.random().toString(36).substring(2, 15)
  }

  const handleRegister = () => {
    const name = deviceName.trim() || `Receiver-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    setDeviceName(name)
    localStorage.setItem('receiverName', name)
    setShowNamePrompt(false)
    
    if (socket) {
      socket.emit('register-device', { deviceId: deviceIdRef.current, name, type: 'receiver' })
    }
  }

  const capturePhoto = async (senderId) => {
    const streamData = streams.get(senderId)
    if (!streamData || !streamData.url) return
    
    setUploading(true)
    setStatus('Uploading to Cloudinary...')
    
    try {
      const blob = await fetch(streamData.url).then(r => r.blob())
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      
      const response = await api.post('/upload', { dataUrl })
      
      const capture = {
        id: response.data.publicId,
        type: 'photo',
        url: response.data.url,
        timestamp: new Date().toISOString()
      }
      
      setCapturedImages(prev => [capture, ...prev])
      setStatus('Photo captured and uploaded!')
    } catch (error) {
      console.error('Upload failed:', error)
      setStatus('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const deleteCapture = async (capture) => {
    try {
      await api.delete('/upload', { data: { publicId: capture.id } })
      setCapturedImages(prev => prev.filter(c => c.id !== capture.id))
      setStatus('Photo deleted')
    } catch (error) {
      console.error('Delete failed:', error)
      setStatus('Delete failed')
    }
  }

  const clearAllCaptures = async () => {
    for (const capture of capturedImages) {
      await deleteCapture(capture)
    }
  }

  const downloadCapture = async (capture) => {
    try {
      const response = await fetch(capture.url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `hdm-capture-${capture.timestamp}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(blobUrl)
    } catch (error) {
      console.error('Download failed:', error)
      window.open(capture.url, '_blank')
    }
  }

  if (showNamePrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📥</div>
            <h1 className="text-3xl font-bold text-white mb-2">Receiver Setup</h1>
            <p className="text-gray-400">Enter a device name to identify this receiver</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
              placeholder={`Receiver-${Math.random().toString(36).substring(2, 6).toUpperCase()}`}
              className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={handleRegister}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
            >
              Start Receiving
            </button>

            <button
              onClick={() => {
                const autoName = `Receiver-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                setDeviceName(autoName)
                localStorage.setItem('receiverName', autoName)
                setShowNamePrompt(false)
                if (socket) {
                  socket.emit('register-device', { deviceId: deviceIdRef.current, name: autoName, type: 'receiver' })
                }
              }}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition"
            >
              Auto-generate Name
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="bg-gray-800 p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white"
          >
            ← Home
          </button>
          <h1 className="text-xl font-bold">Receive Mode</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowGallery(!showGallery)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              📁 Gallery ({capturedImages.length})
            </button>
            <span className="text-sm text-gray-300">{deviceName}</span>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">{senders.length} sender(s)</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        {!showGallery ? (
          <>
            {streams.size === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="text-6xl mb-4 animate-pulse">📥</div>
                <p className="text-gray-400 text-lg font-semibold">{status}</p>
                <p className="text-gray-500 text-sm mt-2">
                  Waiting for camera streams...
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  Device: {deviceName}
                </p>
                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
              </div>
            ) : (
              <div className={`grid gap-4 ${
                streams.size === 1 ? 'grid-cols-1' :
                streams.size <= 4 ? 'grid-cols-2' :
                'grid-cols-3'
              }`}>
                {Array.from(streams.entries()).map(([senderId, streamData]) => (
                  <div key={senderId} className="relative bg-black rounded-lg overflow-hidden group">
                    <img 
                      src={streamData.url}
                      alt="Stream"
                      className="w-full h-auto"
                    />
                    
                    <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded px-2 py-1">
                      <span className="text-xs text-white">
                        {streamData.senderName || `Sender ${senderId.slice(0, 8)}`}
                      </span>
                    </div>

                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => capturePhoto(senderId)}
                        disabled={uploading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm disabled:opacity-50"
                      >
                        {uploading ? '⏳ Uploading...' : '📸 Capture'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Gallery ({capturedImages.length})</h2>
              {capturedImages.length > 0 && (
                <button
                  onClick={clearAllCaptures}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm"
                >
                  🗑 Clear All
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {capturedImages.map(capture => (
                <div key={capture.id} className="relative group">
                  <img 
                    src={capture.url} 
                    alt="Capture" 
                    className="w-full rounded-lg"
                    loading="lazy"
                  />
                  <div className="absolute bottom-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => downloadCapture(capture)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={() => deleteCapture(capture)}
                      className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded px-2 py-1">
                    <span className="text-xs text-white">
                      {new Date(capture.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            {capturedImages.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">📁</div>
                <p className="text-gray-400">No captures yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import api from '../api/axios'

export default function SendPage() {
  const navigate = useNavigate()
  const { socket, connected, receivers, error } = useSocket('sender')
  
  const [status, setStatus] = useState('Starting camera...')
  const [isStreaming, setIsStreaming] = useState(false)
  const [useFrontCamera, setUseFrontCamera] = useState(false)
  const [selectedReceivers, setSelectedReceivers] = useState([])
  const [showReceiverList, setShowReceiverList] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(true)
  const [capturedImages, setCapturedImages] = useState([])
  const [recordings, setRecordings] = useState([])
  const [showGallery, setShowGallery] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const localStream = useRef(null)
  const videoRef = useRef(null)
  const mediaRecorder = useRef(null)
  const recordedChunks = useRef([])
  const frameInterval = useRef(null)
  const deviceIdRef = useRef(null)

  useEffect(() => {
    deviceIdRef.current = localStorage.getItem('senderDeviceId') || generateDeviceId()
    localStorage.setItem('senderDeviceId', deviceIdRef.current)
    
    const savedName = localStorage.getItem('senderName')
    if (savedName) {
      setDeviceName(savedName)
      setShowNamePrompt(false)
      startCamera()
    }
  }, [])

  useEffect(() => {
    if (!socket) return
    
    socket.emit('get-device-name', { deviceId: deviceIdRef.current, type: 'sender' })
    
    socket.on('device-name-found', (data) => {
      if (data.name) {
        setDeviceName(data.name)
        localStorage.setItem('senderName', data.name)
        setShowNamePrompt(false)
        startCamera()
      }
    })
    
    return () => {
      socket.off('device-name-found')
    }
  }, [socket])

  useEffect(() => {
    if (receivers.length > 0) {
      setStatus(`${receivers.length} receiver(s) online - Select to send`)
    } else {
      setStatus('Camera ready - Waiting for receivers...')
    }
  }, [receivers])

  const generateDeviceId = () => {
    return 'sender-' + Math.random().toString(36).substring(2, 15)
  }

  const handleRegister = () => {
    const name = deviceName.trim() || `Camera-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    setDeviceName(name)
    localStorage.setItem('senderName', name)
    setShowNamePrompt(false)
    
    if (socket) {
      socket.emit('register-device', { deviceId: deviceIdRef.current, name, type: 'sender' })
    }
    
    startCamera()
  }

  const startCamera = async () => {
    try {
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: useFrontCamera ? 'user' : 'environment',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      })

      localStream.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setIsStreaming(true)
      setStatus('Camera ready')
    } catch (err) {
      setStatus('Camera error: ' + err.message)
      setIsStreaming(false)
    }
  }

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, 640, 480)
    
    canvas.toBlob((blob) => {
      if (blob && socket && socket.connected) {
        const reader = new FileReader()
        reader.onloadend = () => {
          const arrayBuffer = reader.result
          if (selectedReceivers.length === 1) {
            socket.emit('frame', {
              frameData: arrayBuffer,
              receiverId: selectedReceivers[0],
              senderName: deviceName
            })
          } else if (selectedReceivers.length > 1) {
            socket.emit('frame-broadcast', {
              frameData: arrayBuffer,
              senderName: deviceName
            })
          }
        }
        reader.readAsArrayBuffer(blob)
      }
    }, 'image/jpeg', 0.5)
  }, [socket, selectedReceivers, deviceName])

  const startStreaming = useCallback(() => {
    if (frameInterval.current) {
      clearInterval(frameInterval.current)
    }
    
    frameInterval.current = setInterval(() => {
      captureFrame()
    }, 200)
  }, [captureFrame])

  const stopStreaming = useCallback(() => {
    if (frameInterval.current) {
      clearInterval(frameInterval.current)
      frameInterval.current = null
    }
  }, [])

  const sendToSelected = () => {
    if (selectedReceivers.length === 0) {
      setStatus('Please select at least one receiver')
      return
    }

    startStreaming()
    setStatus(`Streaming to ${selectedReceivers.length} receiver(s)`)
    setShowReceiverList(false)
  }

  const switchCamera = async () => {
    setUseFrontCamera(prev => {
      const newValue = !prev
      setTimeout(() => startCamera(), 100)
      return newValue
    })
  }

  const stopCamera = () => {
    stopStreaming()
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop())
      localStream.current = null
    }
    setIsStreaming(false)
    setStatus('Camera stopped')
    setSelectedReceivers([])
    if (socket) {
      socket.emit('sender-stop')
    }
  }

  const addWatermark = (ctx, width, height) => {
    const baseFontSize = Math.max(10, width * 0.015)
    
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    
    const padding = width * 0.015
    const x = padding
    const y = height - padding
    
    ctx.font = `bold ${baseFontSize}px Arial, sans-serif`
    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)'
    ctx.fillText('HDM', x, y)
    
    const hdmWidth = ctx.measureText('HDM').width
    
    ctx.font = `bold ${baseFontSize * 0.6}px Arial, sans-serif`
    ctx.fillStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.fillText('HD', x + hdmWidth + 2, y - baseFontSize * 0.4)
  }

  const capturePhoto = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    setUploading(true)
    setStatus('Uploading to Cloudinary...')

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      addWatermark(ctx, canvas.width, canvas.height)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      
      const response = await api.post('/upload', { dataUrl })
      
      const capture = {
        id: response.data.publicId,
        type: 'photo',
        url: response.data.url,
        downloadUrl: response.data.downloadUrl,
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

  const startRecording = () => {
    if (!localStream.current || isRecording) return

    try {
      const recorder = new MediaRecorder(localStream.current, {
        mimeType: 'video/webm;codecs=vp8,opus'
      })
      
      const chunks = []
      recordedChunks.current = chunks
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }
      
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        
        const recording = {
          id: Date.now(),
          type: 'video',
          url,
          blob,
          timestamp: new Date().toISOString()
        }
        
        setRecordings(prev => [recording, ...prev])
        setIsRecording(false)
        setStatus('Recording saved!')
      }
      
      recorder.start(1000)
      mediaRecorder.current = recorder
      setIsRecording(true)
      setStatus('Recording started...')
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
      mediaRecorder.current = null
      setStatus('Recording stopped')
    }
  }

  const downloadCapture = (capture) => {
    if (capture.type === 'photo') {
      const link = document.createElement('a')
      link.href = capture.downloadUrl || capture.url
      link.download = `hdm-capture-${capture.timestamp}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } else {
      const link = document.createElement('a')
      link.href = capture.url
      link.download = `hdm-recording-${capture.timestamp}.webm`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const deleteCapture = async (capture) => {
    if (capture.type === 'photo') {
      try {
        await api.delete('/upload', { data: { publicId: capture.id } })
        setCapturedImages(prev => prev.filter(c => c.id !== capture.id))
        setStatus('Photo deleted')
      } catch (error) {
        console.error('Delete failed:', error)
        setStatus('Delete failed')
      }
    } else {
      URL.revokeObjectURL(capture.url)
      setRecordings(prev => prev.filter(r => r.id !== capture.id))
      setStatus('Recording deleted')
    }
  }

  const clearAllCaptures = async () => {
    for (const capture of capturedImages) {
      await deleteCapture(capture)
    }
    for (const recording of recordings) {
      await deleteCapture(recording)
    }
  }

  const toggleReceiver = (receiverId) => {
    setSelectedReceivers(prev => {
      if (prev.includes(receiverId)) {
        return prev.filter(id => id !== receiverId)
      } else {
        return [...prev, receiverId]
      }
    })
  }

  useEffect(() => {
    return () => {
      stopStreaming()
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [stopStreaming])

  if (showNamePrompt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">📤</div>
            <h1 className="text-3xl font-bold text-white mb-2">Sender Setup</h1>
            <p className="text-gray-400">Enter a device name for this camera</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleRegister()}
              placeholder={`Camera-${Math.random().toString(36).substring(2, 6).toUpperCase()}`}
              className="w-full px-4 py-3 rounded-lg bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={handleRegister}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
            >
              Start Camera
            </button>

            <button
              onClick={() => {
                const autoName = `Camera-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
                setDeviceName(autoName)
                localStorage.setItem('senderName', autoName)
                setShowNamePrompt(false)
                if (socket) {
                  socket.emit('register-device', { deviceId: deviceIdRef.current, name: autoName, type: 'sender' })
                }
                startCamera()
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
          <h1 className="text-xl font-bold">Send Mode</h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowGallery(!showGallery)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              📁 Gallery ({capturedImages.length + recordings.length})
            </button>
            <span className="text-sm text-gray-300">{deviceName}</span>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">{receivers.length} online</span>
          </div>
        </div>
      </div>

      <div className="flex-1 relative bg-black">
        {!showGallery ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
            />
            
            <div className="absolute top-4 left-4 bg-black bg-opacity-50 rounded-lg px-3 py-2">
              <p className="text-white text-sm flex items-center gap-2">
                {isStreaming && (
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                )}
                {status}
              </p>
              {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
            </div>

            <div className="absolute bottom-2 left-2 flex items-end">
              <span className="text-xs font-bold" style={{ color: 'rgba(16, 185, 129, 0.8)' }}>HDM</span>
              <span className="text-[8px] font-bold mb-1" style={{ color: 'rgba(59, 130, 246, 0.8)' }}>HD</span>
            </div>
          </>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Gallery ({capturedImages.length + recordings.length})</h2>
              {(capturedImages.length > 0 || recordings.length > 0) && (
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
              
              {recordings.map(recording => (
                <div key={recording.id} className="relative group">
                  <video 
                    src={recording.url} 
                    controls 
                    className="w-full rounded-lg"
                  />
                  <div className="absolute bottom-2 right-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => downloadCapture(recording)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      ⬇
                    </button>
                    <button
                      onClick={() => deleteCapture(recording)}
                      className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded px-2 py-1">
                    <span className="text-xs text-white">
                      {new Date(recording.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            {capturedImages.length === 0 && recordings.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">📁</div>
                <p className="text-gray-400">No captures or recordings yet</p>
              </div>
            )}
          </div>
        )}
      </div>

      {!showGallery && (
        <div className="bg-gray-800 p-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <button
              onClick={switchCamera}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold"
            >
              🔄 Switch
            </button>
            
            <button
              onClick={() => setShowReceiverList(!showReceiverList)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold"
            >
              📥 Receivers ({receivers.length})
            </button>
            
            <button
              onClick={sendToSelected}
              disabled={selectedReceivers.length === 0}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📤 Send ({selectedReceivers.length})
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <button
              onClick={capturePhoto}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              {uploading ? '⏳ Uploading...' : '📸 Capture'}
            </button>
            
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold"
              >
                ⏺ Record
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold"
              >
                ⏹ Stop Rec
              </button>
            )}
            
            <button
              onClick={stopCamera}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold"
            >
              ⏹ Stop
            </button>
          </div>

          {showReceiverList && (
            <div className="bg-gray-700 rounded-lg p-4">
              <h3 className="text-white font-bold mb-3">Select Receivers</h3>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {receivers.map(receiver => (
                  <button
                    key={receiver.socketId}
                    onClick={() => toggleReceiver(receiver.socketId)}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition ${
                      selectedReceivers.includes(receiver.socketId)
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-lg">📥</span>
                      <div>
                        <div className="font-medium">
                          {receiver.name || `Receiver-${receiver.socketId.slice(0, 8)}`}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs">
                      {selectedReceivers.includes(receiver.socketId) ? '✓ Selected' : 'Click to select'}
                    </span>
                  </button>
                ))}
                
                {receivers.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2">📥</div>
                    <p className="text-gray-400 text-sm">
                      No receivers online yet
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
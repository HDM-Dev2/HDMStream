import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function SendPage() {
  const navigate = useNavigate()
  const { user, fieldScanSettings } = useAuth()
  const { socket, connected, receivers, error } = useSocket('sender', user?.deviceName)
  
  const [status, setStatus] = useState('Starting camera...')
  const [isStreaming, setIsStreaming] = useState(false)
  const [useFrontCamera, setUseFrontCamera] = useState(false)
  const [selectedReceivers, setSelectedReceivers] = useState([])
  const [showReceiverList, setShowReceiverList] = useState(false)
  const [capturedImages, setCapturedImages] = useState([])
  const [recordings, setRecordings] = useState([])
  const [showGallery, setShowGallery] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const [isFieldScanMode, setIsFieldScanMode] = useState(false)
  const [scanPhotos, setScanPhotos] = useState([])
  const [gpsData, setGpsData] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [sendingToFarmVexa, setSendingToFarmVexa] = useState(false)
  
  const localStream = useRef(null)
  const videoRef = useRef(null)
  const mediaRecorder = useRef(null)
  const recordedChunks = useRef([])
  const frameInterval = useRef(null)
  const gpsWatchId = useRef(null)
  const scanIntervalRef = useRef(null)

  useEffect(() => {
    startCamera()
    fetchCaptures()
    return () => stopCamera()
  }, [])

  useEffect(() => {
    if (receivers.length > 0) {
      setStatus(`${receivers.length} receiver(s) online - Select to send`)
    } else {
      setStatus('Camera ready - Waiting for receivers...')
    }
  }, [receivers])

  const fetchCaptures = async () => {
    try {
      const response = await api.get('/captures')
      setCapturedImages(response.data.captures.filter(c => c.type === 'photo').map(c => ({
        id: c.id,
        type: 'photo',
        url: c.cloudinaryUrl,
        cloudinaryPublicId: c.cloudinaryPublicId,
        timestamp: c.createdAt
      })))
    } catch (error) {
      console.error('Failed to fetch captures:', error)
    }
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
              senderName: user?.deviceName
            })
          } else if (selectedReceivers.length > 1) {
            socket.emit('frame-broadcast', {
              frameData: arrayBuffer,
              senderName: user?.deviceName
            })
          }
        }
        reader.readAsArrayBuffer(blob)
      }
    }, 'image/jpeg', 0.5)
  }, [socket, selectedReceivers, user])

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
    setStatus('Uploading...')

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      addWatermark(ctx, canvas.width, canvas.height)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      
      const response = await api.post('/upload', { 
        dataUrl,
        senderName: user?.deviceName
      })
      
      const capture = {
        id: response.data.captureId,
        type: 'photo',
        url: response.data.url,
        cloudinaryPublicId: response.data.publicId,
        timestamp: new Date().toISOString()
      }
      
      setCapturedImages(prev => [capture, ...prev])
      setStatus('Photo captured!')
    } catch (error) {
      setStatus('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const startGps = () => {
    setGpsError('')
    
    if (!navigator.geolocation) {
      setGpsError('GPS not supported')
      return false
    }
    
    gpsWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsData({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || 0
        })
      },
      (err) => {
        setGpsError('GPS error: ' + err.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    )
    
    return true
  }

  const stopGps = () => {
    if (gpsWatchId.current) {
      navigator.geolocation.clearWatch(gpsWatchId.current)
      gpsWatchId.current = null
    }
    setGpsData(null)
  }

  const capturePhotoForScan = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    
    const maxPhotos = fieldScanSettings?.maxPhotosPerScan || 100
    if (scanPhotos.length >= maxPhotos) {
      stopFieldScan()
      return
    }
    
    const requiredAccuracy = fieldScanSettings?.requireGpsAccuracy || 15
    if (!gpsData || gpsData.accuracy > requiredAccuracy) {
      setGpsError(`Need GPS accuracy < ${requiredAccuracy}m`)
      return
    }
    
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      
      const response = await api.post('/upload', {
        dataUrl,
        senderName: user?.deviceName,
        gps: gpsData,
        scanMode: true
      })
      
      const photo = {
        id: response.data.captureId,
        url: response.data.url,
        cloudinaryPublicId: response.data.publicId,
        lat: gpsData.lat,
        lng: gpsData.lng,
        timestamp: new Date().toISOString()
      }
      
      setScanPhotos(prev => [...prev, photo])
      setStatus(`📸 Captured ${scanPhotos.length + 1}/${maxPhotos}`)
    } catch (error) {
      setStatus('Capture failed')
    }
  }

  const startFieldScan = async () => {
    if (!fieldScanSettings?.enabled) {
      setStatus('Field scan is disabled')
      return
    }
    
    if (!isStreaming) {
      await startCamera()
    }
    
    const gpsStarted = startGps()
    if (!gpsStarted) return
    
    setStatus('Waiting for GPS...')
    
    setTimeout(() => {
      if (!gpsData) {
        setGpsError('No GPS signal')
        return
      }
      
      setScanPhotos([])
      setIsFieldScanMode(true)
      setStatus(`Field scan started`)
      
      const intervalMs = (fieldScanSettings.captureInterval || 5) * 1000
      scanIntervalRef.current = setInterval(() => {
        capturePhotoForScan()
      }, intervalMs)
    }, 2000)
  }

  const stopFieldScan = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    
    stopGps()
    setIsFieldScanMode(false)
    
    if (scanPhotos.length > 0) {
      sendBatchToFarmVexa()
    } else {
      setStatus('No photos captured')
    }
  }

  const sendBatchToFarmVexa = () => {
    setSendingToFarmVexa(true)
    
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'farmvexa-field-scan-batch',
        photos: scanPhotos,
        totalPhotos: scanPhotos.length,
        timestamp: new Date().toISOString()
      }, '*')
      
      setStatus(`✅ Sent ${scanPhotos.length} photos to FarmVexa`)
    } else {
      setStatus('Open from FarmVexa to send field scan')
    }
    
    setSendingToFarmVexa(false)
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
      setStatus('Recording failed')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
      mediaRecorder.current = null
      setStatus('Recording stopped')
    }
  }

  const downloadCapture = async (capture) => {
    if (capture.type === 'photo') {
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
        window.open(capture.url, '_blank')
      }
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
        await api.delete('/upload', { 
          data: { 
            publicId: capture.cloudinaryPublicId,
            captureId: capture.id
          } 
        })
        setCapturedImages(prev => prev.filter(c => c.id !== capture.id))
        setStatus('Photo deleted')
      } catch (error) {
        setStatus('Delete failed')
      }
    } else {
      URL.revokeObjectURL(capture.url)
      setRecordings(prev => prev.filter(r => r.id !== capture.id))
      setStatus('Recording deleted')
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
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current)
      }
      stopGps()
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [stopStreaming])

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
            <span className="text-sm text-gray-300">{user?.deviceName}</span>
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
            <h2 className="text-xl font-bold mb-4">Gallery ({capturedImages.length + recordings.length})</h2>
            
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
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!showGallery && (
        <div className="bg-gray-800 p-4">
          {!isFieldScanMode ? (
            <>
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
                  {uploading ? '⏳' : '📸 Capture'}
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

              {fieldScanSettings?.enabled && (
                <button
                  onClick={startFieldScan}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-semibold"
                >
                  🌾 Start Field Scan
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white font-semibold">
                  📸 {scanPhotos.length} / {fieldScanSettings?.maxPhotosPerScan || 100}
                </span>
                <span className="text-gray-300 text-sm">
                  ⏱ Every {fieldScanSettings?.captureInterval || 5}s
                </span>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <span className={gpsData ? 'text-green-400' : 'text-red-400'}>
                  📍 {gpsData ? `${gpsData.lat.toFixed(5)}, ${gpsData.lng.toFixed(5)} (±${gpsData.accuracy}m)` : 'Waiting for GPS...'}
                </span>
              </div>
              {gpsError && <p className="text-red-400 text-xs">{gpsError}</p>}
              
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(scanPhotos.length / (fieldScanSettings?.maxPhotosPerScan || 100)) * 100}%` }}
                />
              </div>
              
              <button
                onClick={stopFieldScan}
                disabled={sendingToFarmVexa}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold w-full disabled:opacity-50"
              >
                {sendingToFarmVexa ? '⏳ Sending...' : `⏹ Stop & Send (${scanPhotos.length})`}
              </button>
            </div>
          )}

          {showReceiverList && !isFieldScanMode && (
            <div className="bg-gray-700 rounded-lg p-4 mt-4">
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
                          {receiver.name || 'Receiver'}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs">
                      {selectedReceivers.includes(receiver.socketId) ? '✓ Selected' : 'Click'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
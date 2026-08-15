import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function SendPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { socket, connected, receivers, error } = useSocket('sender', user?.deviceName)
  
  const [status, setStatus] = useState('Starting camera...')
  const [isStreaming, setIsStreaming] = useState(false)
  const [useFrontCamera, setUseFrontCamera] = useState(false)
  const [selectedReceivers, setSelectedReceivers] = useState([])
  const [showReceiverList, setShowReceiverList] = useState(false)
  const [capturedImages, setCapturedImages] = useState([])
  const [recordings, setRecordings] = useState([])
  const [scanGroups, setScanGroups] = useState([])
  const [showGallery, setShowGallery] = useState(false)
  const [galleryTab, setGalleryTab] = useState('photos')
  const [isRecording, setIsRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  const [isFieldScanMode, setIsFieldScanMode] = useState(false)
  const [scanPhotos, setScanPhotos] = useState([])
  const [gpsData, setGpsData] = useState(null)
  const [scanElapsed, setScanElapsed] = useState(0)
  const [currentScanSettings, setCurrentScanSettings] = useState(null)
  const [fieldScanEnabled, setFieldScanEnabled] = useState(false)
  const [toast, setToast] = useState('')
  
  const localStream = useRef(null)
  const videoRef = useRef(null)
  const mediaRecorder = useRef(null)
  const recordedChunks = useRef([])
  const frameInterval = useRef(null)
  const gpsWatchId = useRef(null)
  const scanIntervalRef = useRef(null)
  const scanStartTimeRef = useRef(null)
  const scanTimerRef = useRef(null)
  const scanPhotosRef = useRef([])
  const gpsDataRef = useRef(null)
  const toastTimeoutRef = useRef(null)

  const isFarmvexaUser = user?.authProvider === 'farmvexa'

  useEffect(() => {
    startCamera()
    fetchCaptures()
    fetchScans()
    fetchFieldScanStatus()
    return () => stopCamera()
  }, [])

  useEffect(() => {
    if (receivers.length > 0) {
      setStatus(`${receivers.length} receiver(s) online - Select to send`)
    } else {
      setStatus('Camera ready - Waiting for receivers...')
    }
  }, [receivers])

  useEffect(() => {
    if (isFieldScanMode) {
      scanTimerRef.current = setInterval(() => {
        setScanElapsed(Math.floor((Date.now() - scanStartTimeRef.current) / 1000))
      }, 1000)
    }
    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current)
      }
    }
  }, [isFieldScanMode])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const showToast = (message) => {
    setToast(message)
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToast('')
    }, 5000)
  }

  const fetchFieldScanStatus = async () => {
    try {
      const response = await api.get('/field-scan/settings')
      const settings = response.data.settings
      setFieldScanEnabled(settings.fieldScan?.enabled || false)
      setCurrentScanSettings(settings.fieldScan)
    } catch (error) {
      console.error('Failed to fetch field scan status:', error)
    }
  }

  const fetchCaptures = async () => {
    try {
      const response = await api.get('/captures')
      setCapturedImages(response.data.captures
        .filter(c => c.type === 'photo' && !c.scanMode)
        .map(c => ({
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

  const fetchScans = async () => {
    try {
      const response = await api.get('/scans')
      setScanGroups(response.data.scans)
    } catch (error) {
      console.error('Failed to fetch scans:', error)
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
        await videoRef.current.play()
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
    if (!navigator.geolocation) return false
    
    gpsWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newGpsData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude || 0
        }
        gpsDataRef.current = newGpsData
        setGpsData(newGpsData)
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    )
    return true
  }

  const stopGps = () => {
    if (gpsWatchId.current) {
      navigator.geolocation.clearWatch(gpsWatchId.current)
      gpsWatchId.current = null
    }
    gpsDataRef.current = null
    setGpsData(null)
  }

  const capturePhotoForScan = async (maxPhotos = 100) => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    
    if (scanPhotosRef.current.length >= maxPhotos) {
      stopFieldScan()
      return
    }
    
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      
      const currentGps = gpsDataRef.current
      
      const response = await api.post('/upload', {
        dataUrl,
        senderName: user?.deviceName,
        gps: currentGps,
        scanMode: true
      })
      
      const photo = {
        id: response.data.captureId,
        url: response.data.url,
        cloudinaryPublicId: response.data.publicId,
        lat: currentGps?.lat || null,
        lng: currentGps?.lng || null,
        accuracy: currentGps?.accuracy || null,
        timestamp: new Date().toISOString()
      }
      
      scanPhotosRef.current = [...scanPhotosRef.current, photo]
      setScanPhotos(scanPhotosRef.current)
      
      if (socket) {
        socket.emit('scan-photo-captured', {
          count: scanPhotosRef.current.length,
          total: maxPhotos,
          photo: photo
        })
      }
      
      const gpsStatus = currentGps ? `GPS ✓` : 'GPS pending'
      setStatus(`📸 Captured ${scanPhotosRef.current.length}/${maxPhotos} - ${gpsStatus}`)
      
      if (scanPhotosRef.current.length >= maxPhotos) {
        stopFieldScan()
      }
    } catch (error) {
      console.error('Scan capture failed:', error)
      setStatus('Capture failed')
    }
  }

  const startFieldScan = async () => {
    try {
      const response = await api.get('/field-scan/settings')
      const settings = response.data.settings.fieldScan
      
      setCurrentScanSettings(settings)
      
      if (!settings.enabled) {
        setStatus('Field scan is disabled')
        return
      }
      
      if (!isStreaming) {
        await startCamera()
      }
      
      startGps()
      
      scanPhotosRef.current = []
      setScanPhotos([])
      scanStartTimeRef.current = Date.now()
      setScanElapsed(0)
      setIsFieldScanMode(true)
      
      if (socket) {
        socket.emit('scan-started', { settings: settings })
      }
      
      const intervalMs = (settings.captureInterval || 5) * 1000
      const maxPhotos = settings.maxPhotosPerScan || 100
      
      scanIntervalRef.current = setInterval(() => {
        capturePhotoForScan(maxPhotos)
      }, intervalMs)
      
      setStatus(`Field scan started - every ${settings.captureInterval}s`)
    } catch (error) {
      console.error('Failed to fetch field scan settings:', error)
      setStatus('Failed to get scan settings')
    }
  }

  const stopFieldScan = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }
    
    stopGps()
    setIsFieldScanMode(false)
    
    if (scanPhotosRef.current.length > 0) {
      if (socket) {
        socket.emit('scan-stopped', {
          totalPhotos: scanPhotosRef.current.length,
          photos: scanPhotosRef.current,
          settings: currentScanSettings,
          duration: Math.floor((Date.now() - scanStartTimeRef.current) / 1000)
        })
      }
      
      saveScanGroup()
      
      showToast(`✅ Scan saved - ${scanPhotosRef.current.length} photos and auto sent to FarmVexa`)
      
      setStatus('Scan complete')
    } else {
      setStatus('No photos captured')
    }
  }

  const saveScanGroup = async () => {
    try {
      const duration = Math.floor((Date.now() - scanStartTimeRef.current) / 1000)
      
      await api.post('/scans', {
        photos: scanPhotosRef.current,
        totalPhotos: scanPhotosRef.current.length,
        duration: duration,
        sentToFarmvexa: true,
        startedAt: new Date(scanStartTimeRef.current).toISOString(),
        endedAt: new Date().toISOString()
      })
      fetchScans()
    } catch (error) {
      console.error('Failed to save scan:', error)
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
  }

  const deleteCapture = async (capture) => {
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
  }

  const toggleMarkPhoto = async (scanId, photoId) => {
    try {
      await api.put(`/scans/${scanId}/photo/${photoId}/mark`)
      fetchScans()
    } catch (error) {
      console.error('Failed to mark photo:', error)
    }
  }

  const markAllPhotos = async (scanId) => {
    try {
      await api.put(`/scans/${scanId}/mark-all`)
      fetchScans()
    } catch (error) {
      console.error('Failed to mark all:', error)
    }
  }

  const deletePhoto = async (scanId, photoId) => {
    try {
      await api.delete(`/scans/${scanId}/photo/${photoId}`)
      fetchScans()
    } catch (error) {
      console.error('Failed to delete photo:', error)
    }
  }

  const bulkDeleteMarked = async (scanId) => {
    try {
      await api.delete(`/scans/${scanId}/bulk-delete-marked`)
      fetchScans()
    } catch (error) {
      console.error('Failed to bulk delete:', error)
    }
  }

  const deleteScanGroup = async (scanId) => {
    try {
      await api.delete(`/scans/${scanId}`)
      fetchScans()
    } catch (error) {
      console.error('Failed to delete scan:', error)
    }
  }

  const resendToFarmvexa = (scan) => {
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'farmvexa-field-scan-batch',
        photos: scan.photos,
        totalPhotos: scan.photos.length,
        timestamp: new Date().toISOString()
      }, '*')
      showToast(`✅ Resent ${scan.photos.length} photos to FarmVexa!`)
    } else {
      showToast('Open from FarmVexa to resend')
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
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current)
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
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
            {isFarmvexaUser && fieldScanEnabled && !isFieldScanMode && (
              <button
                onClick={startFieldScan}
                className="text-sm text-emerald-400 hover:text-emerald-300"
                title="Start Field Scan"
              >
                🌾 Scan
              </button>
            )}
            <button
              onClick={() => setShowGallery(!showGallery)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              📁 Gallery ({capturedImages.length + scanGroups.length})
            </button>
            <span className="text-sm text-gray-300">{user?.deviceName}</span>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">{receivers.length} online</span>
          </div>
        </div>
        
        {isFieldScanMode && currentScanSettings && (
          <div className="mt-3 bg-emerald-900/50 border border-emerald-700 rounded-lg px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-emerald-400 font-bold text-sm">🌾 Field Scan</span>
                <span className="text-white text-sm">📸 {scanPhotos.length}/{currentScanSettings.maxPhotosPerScan}</span>
                <span className="text-emerald-300 text-sm">⏱ {formatTime(scanElapsed)}</span>
                <span className="text-emerald-400 text-sm">Every {currentScanSettings.captureInterval}s</span>
              </div>
              <button
                onClick={stopFieldScan}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-semibold"
              >
                ⏹ Stop
              </button>
            </div>
            <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min((scanPhotos.length / currentScanSettings.maxPhotosPerScan) * 100, 100)}%` }}
              />
            </div>
            <div className="flex items-center gap-2 mt-1">
              {gpsData ? (
                <span className="text-green-400 text-xs">
                  📍 {gpsData.lat.toFixed(5)}, {gpsData.lng.toFixed(5)} (±{Math.round(gpsData.accuracy)}m)
                </span>
              ) : (
                <span className="text-yellow-400 text-xs">📍 GPS pending</span>
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-lg px-6 py-3 shadow-xl">
          <p className="text-white text-sm">{toast}</p>
        </div>
      )}

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
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setGalleryTab('photos')}
                className={`px-4 py-2 rounded-lg ${galleryTab === 'photos' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
              >
                📸 Photos ({capturedImages.length})
              </button>
              {isFarmvexaUser && (
                <button
                  onClick={() => setGalleryTab('scans')}
                  className={`px-4 py-2 rounded-lg ${galleryTab === 'scans' ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                >
                  🌾 Scans ({scanGroups.length})
                </button>
              )}
            </div>

            {galleryTab === 'photos' ? (
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
                {capturedImages.length === 0 && (
                  <div className="col-span-full text-center py-20">
                    <div className="text-6xl mb-4">📁</div>
                    <p className="text-gray-400">No photos yet</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {scanGroups.map(scan => (
                  <div key={scan.id} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-white font-bold">
                          Scan - {new Date(scan.createdAt).toLocaleString()}
                        </h3>
                        <p className="text-gray-400 text-sm">
                          {scan.totalPhotos} photos | {scan.duration}s | {scan.sentToFarmvexa ? '✓ Sent' : '✗ Not Sent'}
                        </p>
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => markAllPhotos(scan.id)}
                          className="text-yellow-400 hover:text-yellow-300 text-xs"
                        >
                          ☑ Mark All
                        </button>
                        <button
                          onClick={() => bulkDeleteMarked(scan.id)}
                          className="text-orange-400 hover:text-orange-300 text-xs"
                        >
                          🗑 Bulk Delete
                        </button>
                        <button
                          onClick={() => deleteScanGroup(scan.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          🗑 Delete All
                        </button>
                        <button
                          onClick={() => resendToFarmvexa(scan)}
                          className="text-green-400 hover:text-green-300 text-xs"
                        >
                          🌾 Resend
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                      {scan.photos.map(photo => (
                        <div key={photo._id} className="relative group">
                          <img src={photo.cloudinaryUrl} className="w-full h-20 object-cover rounded" />
                          {photo.marked && (
                            <div className="absolute top-1 right-1 text-yellow-400 text-xs">⭐</div>
                          )}
                          <button
                            onClick={() => toggleMarkPhoto(scan.id, photo._id)}
                            className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 text-yellow-400 text-xs"
                          >
                            {photo.marked ? '⭐' : '☆'}
                          </button>
                          <button
                            onClick={() => deletePhoto(scan.id, photo._id)}
                            className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-100 text-red-400 text-xs"
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {scanGroups.length === 0 && (
                  <div className="text-center py-20">
                    <div className="text-6xl mb-4">🌾</div>
                    <p className="text-gray-400">No scans yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!showGallery && !isFieldScanMode && (
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

          <div className="grid grid-cols-3 gap-3">
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

          {showReceiverList && (
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
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function ReceivePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { socket, connected, senders, error } = useSocket('receiver', user?.deviceName)
  
  const [streams, setStreams] = useState(new Map())
  const [status, setStatus] = useState('Ready to receive...')
  const [capturedImages, setCapturedImages] = useState([])
  const [scanGroups, setScanGroups] = useState([])
  const [showGallery, setShowGallery] = useState(false)
  const [galleryTab, setGalleryTab] = useState('photos')
  const [uploading, setUploading] = useState(false)
  
  const [isScanMode, setIsScanMode] = useState(false)
  const [scanPhotoCount, setScanPhotoCount] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const [scanStartTime, setScanStartTime] = useState(null)
  const [scanElapsed, setScanElapsed] = useState(0)
  const [scanSettings, setScanSettings] = useState(null)
  const [scanPhotosData, setScanPhotosData] = useState([])
  const [scanGpsData, setScanGpsData] = useState(null)
  
  const [sendingToFarmVexa, setSendingToFarmVexa] = useState(false)
  const [sendProgress, setSendProgress] = useState(0)
  const [toast, setToast] = useState('')
  
  const currentStreamRef = useRef(null)
  const scanTimerRef = useRef(null)
  const toastTimeoutRef = useRef(null)

  const isFarmvexaUser = user?.authProvider === 'farmvexa'

  useEffect(() => {
    fetchCaptures()
    fetchScans()
  }, [])

  useEffect(() => {
    if (senders.length > 0) {
      setStatus(`${senders.length} sender(s) online - Waiting for stream...`)
    } else {
      setStatus('Ready to receive...')
    }
  }, [senders])

  useEffect(() => {
    if (isScanMode && scanStartTime) {
      scanTimerRef.current = setInterval(() => {
        setScanElapsed(Math.floor((Date.now() - scanStartTime) / 1000))
      }, 1000)
    }
    return () => {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current)
      }
    }
  }, [isScanMode, scanStartTime])

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
      
      currentStreamRef.current = { url, senderName }
      setStatus('Receiving stream...')
    })

    socket.on('scan-started', (data) => {
      setIsScanMode(true)
      setScanPhotoCount(0)
      setScanTotal(data.settings?.maxPhotosPerScan || 10)
      setScanStartTime(Date.now())
      setScanSettings(data.settings)
      setScanPhotosData([])
      setScanGpsData(null)
      setStatus('Field scan started')
    })

    socket.on('scan-photo-captured', (data) => {
      setScanPhotoCount(data.count)
      setScanTotal(data.total)
      if (data.photo) {
        setScanPhotosData(prev => [...prev, data.photo])
        if (data.photo.lat && data.photo.lng) {
          setScanGpsData({
            lat: data.photo.lat,
            lng: data.photo.lng,
            accuracy: data.photo.accuracy || 0
          })
        }
      }
      setStatus(`📸 ${data.count}/${data.total} photos`)
    })

    socket.on('scan-stopped', (data) => {
      setIsScanMode(false)
      setScanStartTime(null)
      setScanElapsed(0)
      setScanPhotoCount(data.totalPhotos)
      setScanTotal(data.totalPhotos)
      setScanPhotosData(data.photos || [])
      setScanGpsData(null)
      setStatus(`✅ Scan complete - ${data.totalPhotos} photos`)
      
      fetchScans()
      
      if (data.photos && data.photos.length > 0) {
        sendScanToFarmVexa(data.photos)
      }
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
      socket.off('scan-started')
      socket.off('scan-photo-captured')
      socket.off('scan-stopped')
      socket.off('sender-available')
      socket.off('sender-disconnected')
    }
  }, [socket])

  const sendScanToFarmVexa = async (photos) => {
    setSendingToFarmVexa(true)
    setSendProgress(0)
    
    if (window.parent !== window) {
      const total = photos.length
      
      const normalizedPhotos = photos.map((photo) => ({
        imageUrl: photo.cloudinaryUrl || photo.url || photo.imageUrl,
        lat: photo.lat || photo.gps?.lat || null,
        lng: photo.lng || photo.gps?.lng || null,
        timestamp: photo.timestamp || photo.createdAt || new Date().toISOString()
      }))
      
      for (let i = 0; i < total; i++) {
        setSendProgress(Math.round(((i + 1) / total) * 100))
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      window.parent.postMessage({
        type: 'farmvexa-field-scan-batch',
        photos: normalizedPhotos,
        totalPhotos: total,
        timestamp: new Date().toISOString()
      }, '*')
      
      showToast(`✅ Sent ${total} photos to FarmVexa!`)
    } else {
      showToast('Open from FarmVexa to send scan')
    }
    
    setSendingToFarmVexa(false)
    setSendProgress(0)
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  const refreshSenders = () => {
    if (socket && socket.connected) {
      socket.emit('receiver-join', { name: user?.deviceName })
      setStatus('Refreshing...')
    }
  }

  const capturePhoto = async () => {
    if (!currentStreamRef.current?.url) {
      setStatus('No stream available to capture')
      return
    }
    
    setUploading(true)
    setStatus('Uploading...')
    
    try {
      const blob = await fetch(currentStreamRef.current.url).then(r => r.blob())
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      
      const response = await api.post('/upload', { 
        dataUrl,
        receiverName: user?.deviceName,
        senderName: currentStreamRef.current.senderName
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

  const sendToFarmVexa = (capture) => {
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'farmvexa-crop-photo',
        imageUrl: capture.url,
        timestamp: new Date().toISOString()
      }, '*')
      showToast('✅ Photo sent to FarmVexa!')
    } else {
      showToast('Open from FarmVexa to send photos')
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
      const normalizedPhotos = scan.photos.map((photo) => ({
        imageUrl: photo.cloudinaryUrl || photo.url || photo.imageUrl,
        lat: photo.lat || photo.gps?.lat || null,
        lng: photo.lng || photo.gps?.lng || null,
        timestamp: photo.timestamp || photo.createdAt || new Date().toISOString()
      }))
      
      window.parent.postMessage({
        type: 'farmvexa-field-scan-batch',
        photos: normalizedPhotos,
        totalPhotos: normalizedPhotos.length,
        timestamp: new Date().toISOString()
      }, '*')
      
      showToast(`✅ Resent ${normalizedPhotos.length} photos to FarmVexa!`)
    } else {
      showToast('Open from FarmVexa to resend')
    }
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
              onClick={refreshSenders}
              className="text-sm text-yellow-400 hover:text-yellow-300"
              title="Refresh senders"
            >
              🔄
            </button>
            <button
              onClick={capturePhoto}
              disabled={uploading}
              className="text-sm text-blue-400 hover:text-blue-300"
              title="Capture photo"
            >
              {uploading ? '⏳' : '📸'}
            </button>
            <button
              onClick={() => setShowGallery(!showGallery)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              📁 Gallery ({capturedImages.length + scanGroups.length})
            </button>
            <span className="text-sm text-gray-300">{user?.deviceName}</span>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">{senders.length} sender(s)</span>
          </div>
        </div>
      </div>

      {isScanMode && (
        <div className="bg-emerald-900/50 border-b border-emerald-700 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-emerald-400 font-bold">🌾 Field Scan</span>
              <span className="text-white">📸 {scanPhotoCount}/{scanTotal || '?'}</span>
              <span className="text-emerald-300">⏱ {formatTime(scanElapsed)}</span>
              {scanSettings && (
                <>
                  <span className="text-emerald-400 text-xs">Every {scanSettings.captureInterval}s</span>
                  <span className="text-emerald-400 text-xs">Max {scanSettings.maxPhotosPerScan}</span>
                </>
              )}
            </div>
            <span className="text-emerald-400 text-sm animate-pulse">● Scanning...</span>
          </div>
          <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${scanTotal > 0 ? (scanPhotoCount / scanTotal) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1">
            {scanGpsData ? (
              <span className="text-green-400 text-xs">
                📍 {scanGpsData.lat.toFixed(5)}, {scanGpsData.lng.toFixed(5)} (±{Math.round(scanGpsData.accuracy)}m)
              </span>
            ) : (
              <span className="text-yellow-400 text-xs">📍 GPS pending</span>
            )}
          </div>
        </div>
      )}

      {sendingToFarmVexa && (
        <div className="bg-blue-900/50 border-b border-blue-700 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-400 font-bold">📤 Sending to FarmVexa...</span>
            <span className="text-white text-sm">{sendProgress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all"
              style={{ width: `${sendProgress}%` }}
            />
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-gray-800 border border-gray-700 rounded-lg px-6 py-3 shadow-xl">
          <p className="text-white text-sm">{toast}</p>
        </div>
      )}

      <div className="flex-1 p-4">
        {!showGallery ? (
          <>
            {streams.size === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="text-6xl mb-4 animate-pulse">📥</div>
                <p className="text-gray-400 text-lg font-semibold">{status}</p>
                <p className="text-gray-500 text-sm mt-2">Waiting for camera streams...</p>
                <p className="text-gray-500 text-sm mt-1">Device: {user?.deviceName}</p>
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
                        {streamData.senderName || 'Sender'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
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
                      {isFarmvexaUser && (
                        <button
                          onClick={() => sendToFarmVexa(capture)}
                          className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                          title="Send to FarmVexa"
                        >
                          🌾
                        </button>
                      )}
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
    </div>
  )
}
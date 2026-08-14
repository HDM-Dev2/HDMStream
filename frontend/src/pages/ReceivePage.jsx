import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../hooks/useSocket'
import api from '../api/axios'

export default function ReceivePage() {
  const navigate = useNavigate()
  const { socket, connected, senders, error, sendAnswer, sendIceCandidate } = useSocket('receiver')
  
  const [streams, setStreams] = useState(new Map())
  const [status, setStatus] = useState('Ready to receive...')
  const [capturedImages, setCapturedImages] = useState([])
  const [recordings, setRecordings] = useState([])
  const [showGallery, setShowGallery] = useState(false)
  const [recordingStates, setRecordingStates] = useState(new Map())
  const [deviceName, setDeviceName] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(true)
  
  const peerConnections = useRef(new Map())
  const videoRefs = useRef(new Map())
  const mediaRecorders = useRef(new Map())
  const recordedChunks = useRef(new Map())

  useEffect(() => {
    const savedName = localStorage.getItem('receiverName')
    if (savedName) {
      setDeviceName(savedName)
      setShowNamePrompt(false)
    }
  }, [])

  useEffect(() => {
    if (senders.length > 0) {
      setStatus(`${senders.length} sender(s) online - Waiting for stream...`)
    } else {
      setStatus('Ready to receive...')
    }
  }, [senders])

  const handleRegister = async () => {
    const name = deviceName.trim() || `Receiver-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    setDeviceName(name)
    localStorage.setItem('receiverName', name)
    setShowNamePrompt(false)
    
    try {
      await api.post('/camera/register', {
        deviceId: socket?.id || 'pending',
        name: name,
        type: 'receiver'
      })
    } catch (error) {
      console.error('Failed to register receiver:', error)
    }
  }

  useEffect(() => {
    if (!socket) return

    socket.on('sender-available', () => {
      setStatus('Sender found - Waiting for stream...')
    })

    socket.on('offer', async (data) => {
      await handleOffer(data)
    })

    socket.on('ice-candidate', async (data) => {
      await handleIceCandidate(data)
    })

    socket.on('sender-disconnected', (senderId) => {
      handleSenderDisconnect(senderId)
    })

    return () => {
      socket.off('sender-available')
      socket.off('offer')
      socket.off('ice-candidate')
      socket.off('sender-disconnected')
    }
  }, [socket])

  const handleOffer = async (data) => {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })

      peerConnections.current.set(data.from, pc)

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendIceCandidate(data.from, event.candidate)
        }
      }

      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        setStreams(prev => {
          const newMap = new Map(prev)
          newMap.set(data.from, remoteStream)
          return newMap
        })
        setStatus('Stream connected!')
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStatus('Connected to sender')
        }
      }

      await pc.setRemoteDescription(data.offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendAnswer(data.from, answer)
    } catch (error) {
      console.error('Error handling offer:', error)
    }
  }

  const handleIceCandidate = async (data) => {
    const pc = peerConnections.current.get(data.from)
    if (pc) {
      try {
        await pc.addIceCandidate(data.candidate)
      } catch (error) {
        console.error('Error adding ICE candidate:', error)
      }
    }
  }

  const handleSenderDisconnect = (senderId) => {
    const pc = peerConnections.current.get(senderId)
    if (pc) {
      pc.close()
      peerConnections.current.delete(senderId)
    }
    
    if (mediaRecorders.current.has(senderId)) {
      stopRecording(senderId)
    }
    
    setStreams(prev => {
      const newMap = new Map(prev)
      newMap.delete(senderId)
      return newMap
    })
    setStatus('Ready to receive...')
  }

  const capturePhoto = (senderId) => {
    const video = videoRefs.current.get(senderId)
    if (!video || !video.videoWidth) return

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)
      
      const capture = {
        id: Date.now(),
        senderId,
        type: 'photo',
        dataUrl: imageDataUrl,
        timestamp: new Date().toISOString()
      }
      
      setCapturedImages(prev => [capture, ...prev])
      setStatus('Photo captured!')
    } catch (error) {
      console.error('Error capturing photo:', error)
    }
  }

  const startRecording = (senderId) => {
    const stream = streams.get(senderId)
    if (!stream) return

    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus'
      })
      
      const chunks = []
      recordedChunks.current.set(senderId, chunks)
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        const url = URL.createObjectURL(blob)
        
        const recording = {
          id: Date.now(),
          senderId,
          type: 'video',
          url,
          blob,
          timestamp: new Date().toISOString()
        }
        
        setRecordings(prev => [recording, ...prev])
        setRecordingStates(prev => {
          const newMap = new Map(prev)
          newMap.set(senderId, false)
          return newMap
        })
        setStatus('Recording saved!')
      }
      
      mediaRecorder.start(1000)
      mediaRecorders.current.set(senderId, mediaRecorder)
      
      setRecordingStates(prev => {
        const newMap = new Map(prev)
        newMap.set(senderId, true)
        return newMap
      })
      setStatus('Recording started...')
    } catch (error) {
      console.error('Error starting recording:', error)
    }
  }

  const stopRecording = (senderId) => {
    const mediaRecorder = mediaRecorders.current.get(senderId)
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
      mediaRecorders.current.delete(senderId)
      setStatus('Recording stopped')
    }
  }

  const downloadCapture = (capture) => {
    if (capture.type === 'photo') {
      const link = document.createElement('a')
      link.href = capture.dataUrl
      link.download = `capture-${capture.timestamp}.jpg`
      link.click()
    } else {
      const link = document.createElement('a')
      link.href = capture.url
      link.download = `recording-${capture.timestamp}.webm`
      link.click()
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
              📁 Gallery ({capturedImages.length + recordings.length})
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
                {Array.from(streams.entries()).map(([senderId, stream]) => (
                  <div key={senderId} className="relative bg-black rounded-lg overflow-hidden group">
                    <video
                      ref={(el) => {
                        if (el) {
                          videoRefs.current.set(senderId, el)
                          el.srcObject = stream
                          el.play().catch(err => console.error('Error playing:', err))
                        }
                      }}
                      autoPlay
                      playsInline
                      className="w-full h-auto"
                      style={{ minHeight: '200px' }}
                    />
                    
                    <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded px-2 py-1">
                      <span className="text-xs text-white">
                        {senders.find(s => s.socketId === senderId)?.name || `Sender ${senderId.slice(0, 8)}`}
                      </span>
                    </div>

                    {recordingStates.get(senderId) && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-red-600 rounded px-2 py-1">
                        <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                        <span className="text-xs text-white">REC</span>
                      </div>
                    )}

                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-2 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => capturePhoto(senderId)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm"
                      >
                        📸 Capture
                      </button>
                      
                      {!recordingStates.get(senderId) ? (
                        <button
                          onClick={() => startRecording(senderId)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-sm"
                        >
                          ⏺ Record
                        </button>
                      ) : (
                        <button
                          onClick={() => stopRecording(senderId)}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded-lg text-sm"
                        >
                          ⏹ Stop
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div>
            <h2 className="text-xl font-bold mb-4">Captures & Recordings</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {capturedImages.map(capture => (
                <div key={capture.id} className="relative group">
                  <img 
                    src={capture.dataUrl} 
                    alt="Capture" 
                    className="w-full rounded-lg"
                  />
                  <div className="absolute bottom-2 right-2 space-x-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => downloadCapture(capture)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      ⬇ Download
                    </button>
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
                  <div className="absolute bottom-2 right-2 space-x-2 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => downloadCapture(recording)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      ⬇ Download
                    </button>
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
    </div>
  )
}
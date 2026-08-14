import { useEffect, useRef } from 'react'

export function VideoPlayer({ stream, muted = false, className = '' }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`w-full rounded-lg shadow-lg bg-black ${className}`}
    />
  )
}
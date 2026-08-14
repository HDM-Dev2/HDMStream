export const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export function createPeerConnection() {
  return new RTCPeerConnection(rtcConfig)
}

export async function getMediaStream(constraints = {}) {
  const defaultConstraints = {
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  }
  
  return await navigator.mediaDevices.getUserMedia({
    ...defaultConstraints,
    ...constraints
  })
}

export function addStreamToPeer(pc, stream) {
  stream.getTracks().forEach(track => {
    pc.addTrack(track, stream)
  })
}

export function closePeerConnection(pc) {
  if (pc) {
    pc.close()
  }
}
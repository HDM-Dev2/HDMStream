import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" className="w-20 h-20">
              <defs>
                <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style={{ stopColor: '#10b981', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#059669', stopOpacity: 1 }} />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="48" fill="url(#bgGradient)" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="#047857" strokeWidth="2" />
              <rect x="30" y="35" width="40" height="30" rx="5" fill="white" />
              <circle cx="50" cy="50" r="10" fill="#065f46" />
              <circle cx="50" cy="50" r="6" fill="#047857" />
              <circle cx="50" cy="50" r="3" fill="#a7f3d0" />
              <rect x="40" y="30" width="20" height="8" rx="2" fill="#d1fae5" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">HDM Stream</h1>
          <p className="text-gray-400">
            {user?.deviceName ? `Welcome, ${user.deviceName}` : 'Device Camera Streaming'}
          </p>
          {user?.farmvexaData && (
            <p className="text-green-400 text-sm mt-1">
              🌾 FarmVexa: {user.farmvexaData.name} ({user.farmvexaData.farms?.length || 0} farms)
            </p>
          )}
        </div>

        <div className="space-y-4">
          <button
            onClick={() => navigate('/in')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-6 transition duration-200"
          >
            <div className="text-3xl mb-2">📥</div>
            <div className="text-xl font-bold">Receive</div>
            <div className="text-sm text-blue-200 mt-1">View streams from other devices</div>
          </button>

          <button
            onClick={() => navigate('/out')}
            className="w-full bg-green-600 hover:bg-green-700 text-white rounded-lg p-6 transition duration-200"
          >
            <div className="text-3xl mb-2">📤</div>
            <div className="text-xl font-bold">Send</div>
            <div className="text-sm text-green-200 mt-1">Stream your camera to receivers</div>
          </button>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-sm"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}
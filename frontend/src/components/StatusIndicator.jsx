export function StatusIndicator({ status, connected }) {
  return (
    <div className="flex items-center space-x-2">
      <span className={`w-3 h-3 rounded-full ${
        connected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
      }`} />
      <span className="text-sm text-gray-300">{status}</span>
    </div>
  )
}
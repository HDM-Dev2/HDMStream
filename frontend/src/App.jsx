import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ReceivePage from './pages/ReceivePage'
import SendPage from './pages/SendPage'

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/in" element={<ReceivePage />} />
        <Route path="/out" element={<SendPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
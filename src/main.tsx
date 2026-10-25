import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { JournalSandbox } from './views/JournalSandbox.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/sandbox/journal" element={<JournalSandbox />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)

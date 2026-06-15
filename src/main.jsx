import React from 'react'
import ReactDOM from 'react-dom/client'
import SalesApp from './SalesApp.jsx'   // ← Changed
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SalesApp />
  </React.StrictMode>,
)

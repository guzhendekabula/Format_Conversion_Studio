import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={{ token: { colorPrimary: '#20835c', colorPrimaryHover: '#2a956b', colorPrimaryActive: '#176c4a', controlOutline: '#20835c22' } }}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)

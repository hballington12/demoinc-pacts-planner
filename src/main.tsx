import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MapViewer } from './pages/MapViewer.tsx'
import { MapEditor } from './pages/MapEditor.tsx'

function Root() {
  const [hash, setHash] = useState(location.hash);

  useEffect(() => {
    const handler = () => setHash(location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (hash === '#/map') return <MapViewer />;
  if (hash === '#/edit') return <MapEditor />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

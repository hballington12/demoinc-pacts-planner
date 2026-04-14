import { useState } from 'react';
import type { PlannerState } from '../utils/storage';
import { getShareUrl, encodeState, decodeState, copyToClipboard } from '../utils/sharing';

interface Props {
  state: PlannerState;
  onImport: (partial: Partial<PlannerState>) => void;
}

export function SharePanel({ state, onImport }: Props) {
  const [showPanel, setShowPanel] = useState(false);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');

  const handleCopyLink = async () => {
    const url = getShareUrl(state);
    const ok = await copyToClipboard(url);
    setMessage(ok ? 'Link copied!' : 'Failed to copy');
    setTimeout(() => setMessage(''), 2000);
  };

  const handleCopyData = async () => {
    const encoded = encodeState(state);
    const ok = await copyToClipboard(encoded);
    setMessage(ok ? 'Data copied!' : 'Failed to copy');
    setTimeout(() => setMessage(''), 2000);
  };

  const handleImport = () => {
    const trimmed = importText.trim();
    if (!trimmed) return;

    let data: string = trimmed;
    try {
      const url = new URL(trimmed);
      const stateParam = url.searchParams.get('state');
      if (stateParam) data = stateParam;
    } catch {
      // Not a URL, treat as raw encoded data
    }

    const decoded = decodeState(data);
    if (decoded) {
      onImport(decoded);
      setMessage('Imported successfully!');
      setImportText('');
    } else {
      setMessage('Invalid import data');
    }
    setTimeout(() => setMessage(''), 2000);
  };

  if (!showPanel) {
    return (
      <button className="share-toggle-btn" onClick={() => setShowPanel(true)}>
        Share / Import
      </button>
    );
  }

  return (
    <div className="share-panel">
      <div className="share-header">
        <h3>Share / Import</h3>
        <button onClick={() => setShowPanel(false)}>Close</button>
      </div>
      <div className="share-actions">
        <button onClick={handleCopyLink}>Copy Share Link</button>
        <button onClick={handleCopyData}>Copy Data to Clipboard</button>
      </div>
      <div className="import-section">
        <input
          type="text"
          placeholder="Paste a share link or data string..."
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button onClick={handleImport}>Import</button>
      </div>
      {message && <p className="share-message">{message}</p>}
    </div>
  );
}

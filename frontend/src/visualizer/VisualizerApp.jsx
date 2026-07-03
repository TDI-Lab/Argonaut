import { useState, useEffect } from 'react'
import VisualizerCore from './VisualizerCore'
import { parseCsv } from '../api'
import './visualizer.css'

const BASE = import.meta.env.VITE_API_URL || '/api'

export default function VisualizerApp({ jobId, onClose }) {
  const dataUrl = `${BASE}/results/${jobId}/viz-data`
  const [bfGcs, setBfGcs] = useState(null)
  const [isKilled, setIsKilled] = useState(false)

  useEffect(() => {
    fetch(`${BASE}/results/${jobId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.solutionwiseresults) {
          const rows = parseCsv(data.solutionwiseresults);
          const gcs = rows
            .map((row) => parseFloat(row.GC))
            .filter((v) => !isNaN(v))
            .sort((a, b) => a - b);
          setBfGcs(gcs);
        }
        if (data.status === 'KILLED' || data.wasKilled) {
          setIsKilled(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load results for ranking:", err);
      });
  }, [jobId]);

  return (
    <div className="viz-scope viz-overlay">
      <button className="viz-close-btn" onClick={onClose}>
        ✕ Close Visualizer
      </button>
      <div className="viz-offline-badge">
        @Offline
      </div>
      <VisualizerCore dataUrl={dataUrl} bfGcs={bfGcs} isKilled={isKilled} />
    </div>
  )
}

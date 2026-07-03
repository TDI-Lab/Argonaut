import { useState, useEffect, useMemo } from 'react'
import { parseCsv, fetchIterationHistory } from '../api'
import * as d3 from 'd3'

const BASE = import.meta.env.VITE_API_URL || '/api'

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── EPOS results ─────────────────────────────────────────────────────────────

function EposResults({ results, logs, config }) {
  const [tab, setTab] = useState('downloads')

  const globalCost  = parseCsv(results['global-cost'])
  const unfairness  = parseCsv(results['unfairness'])
  const localCost   = parseCsv(results['local-cost'])
  const complexCost = parseCsv(results['global-complex-cost'])

  const last = arr => arr.length ? arr[arr.length - 1].Mean : '—'
  const fmt  = v => typeof v === 'number' ? v.toFixed(6) : v

  const csvFiles = [
    { key: 'global-cost',         label: 'global-cost.csv' },
    { key: 'unfairness',          label: 'unfairness.csv' },
    { key: 'local-cost',          label: 'local-cost.csv' },
    { key: 'global-complex-cost', label: 'global-complex-cost.csv' },
    { key: 'selected-plans',      label: 'selected-plans.csv' },
    { key: 'indexes-histogram',   label: 'indexes-histogram.csv' },
    { key: 'termination',         label: 'termination.csv' },
  ]

  return (
    <>
      <div className="summary-cards">
        {[
          { label: 'Final Global Cost',   value: fmt(last(globalCost)) },
          { label: 'Final Unfairness',    value: fmt(last(unfairness)) },
          { label: 'Final Local Cost',    value: fmt(last(localCost)) },
          { label: 'Weighted Total Cost', value: fmt(last(complexCost)) },
        ].map(({ label, value }) => (
          <div key={label} className="summary-card">
            <div className="sc-label">{label}</div>
            <div className="sc-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="tabs">
        {['downloads', 'logs'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'downloads' ? '⬇ Downloads' : '📋 Logs'}
          </button>
        ))}
      </div>

      {tab === 'downloads' && (
        <div className="download-list">
          {csvFiles.map(({ key, label }) =>
            results[key] ? (
              <div key={key} className="download-item">
                <span>{label}</span>
                <button className="dl-btn" onClick={() => downloadCsv(results[key], label)}>⬇ Download</button>
              </div>
            ) : null
          )}
        </div>
      )}

      {tab === 'logs' && <pre className="log-box">{logs || 'No log output captured.'}</pre>}
    </>
  )
}

// ── Brute Force visualizer overlay ───────────────────────────────────────────

function getLabelColor(bgColor) {
  const c = d3.color(bgColor)
  if (!c) return '#fff'
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#000' : '#fff'
}

const bfColorScale = d3.scaleSequential()
  .interpolator(d3.interpolateRgbBasis([
    '#ffffb2',
    '#fed976',
    '#feb24c',
    '#fd8d3c',
    '#fc4e2a',
    '#e31a1c',
    '#b10026'
  ]))

const nodeRadius = 18;

function getConcentricPos(nodeIds, baseRadius = 65) {
  const pos = {};
  const rem = [...nodeIds].sort((a, b) => a - b);
  let c = 0;
  const radii = [];
  while (rem.length > 0) {
    const cap = Math.pow(2, c);
    const chunk = rem.splice(0, cap);
    const r = (c + 1) * baseRadius;
    radii.push(r);
    for (let i = 0; i < chunk.length; i++) {
      const nd = chunk[i];
      let angle;
      if (chunk.length === 1) {
        angle = Math.PI / 2;
      } else {
        angle = i * (2 * Math.PI / chunk.length);
      }
      pos[nd] = { x: r * Math.cos(angle), y: r * Math.sin(angle) };
    }
    c++;
  }
  return { pos, radii };
}

function BruteForceVizOverlay({ jobId, results, onClose }) {
  const [idx, setIdx]         = useState(0)
  const [loading, setLoading] = useState(true)
  const [iterHistoryRaw, setIterHistoryRaw] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)

  useEffect(() => {
    fetchIterationHistory(jobId)
      .then(raw => {
        setIterHistoryRaw(raw)
        setLoading(false)
      })
      .catch(err => {
        console.error("Error fetching iteration history:", err)
        setLoading(false)
      })
  }, [jobId])

  const bfResults = results?.solutionwiseresults ? parseCsv(results.solutionwiseresults) : []
  const iterHistory = useMemo(() => {
    return parseCsv(iterHistoryRaw)
  }, [iterHistoryRaw])

  const { minLc, maxLc, agentCols, costsMap } = useMemo(() => {
    if (!iterHistory.length) return { minLc: 0, maxLc: 1, agentCols: [], costsMap: new Map() }
    const cols = Object.keys(iterHistory[0]).filter(k => k.startsWith('Agent '))
    let minVal = Infinity
    let maxVal = -Infinity
    const map = new Map()
    
    iterHistory.forEach(r => {
      cols.forEach(col => {
        const val = parseFloat(r[col])
        if (!isNaN(val)) {
          if (val < minVal) minVal = val
          if (val > maxVal) maxVal = val
        }
      })
      
      if (parseInt(r.Iteration, 10) === 1) {
        map.set(r.Start_State, r)
      }
    })
    
    return {
      minLc: minVal === Infinity ? 0 : minVal,
      maxLc: maxVal === -Infinity ? 1 : maxVal,
      agentCols: cols,
      costsMap: map
    }
  }, [iterHistory])

  // Get combination data for currently selected index
  const row = bfResults[idx]
  const currentCosts = useMemo(() => {
    if (!row) return null
    return costsMap.get(row.Indices)
  }, [row, costsMap])

  const minGC = useMemo(() => {
    if (!bfResults.length) return null
    let minVal = Infinity
    for (let i = 0; i < bfResults.length; i++) {
      const val = parseFloat(bfResults[i].GC)
      if (!isNaN(val) && val < minVal) {
        minVal = val
      }
    }
    return minVal === Infinity ? null : minVal
  }, [bfResults])

  const isBest = row && minGC !== null && parseFloat(row.GC) === minGC
  const label = row 
    ? `Solution Space: ${row.Indices} <span style="font-size: 0.95em; font-weight: bold; color: #a4d673; margin-left: 12px;">(Global Cost: ${row.GC != null ? parseFloat(row.GC).toFixed(4) : '—'})</span>`
    : bfResults.length ? `Solution Space ${idx + 1}` : ''

  const nodeIds = useMemo(() => {
    return agentCols.map(col => {
      const match = col.match(/\d+/)
      return match ? parseInt(match[0], 10) : 0
    }).sort((a, b) => a - b)
  }, [agentCols])

  const { pos, radii } = useMemo(() => {
    return getConcentricPos(nodeIds, 65)
  }, [nodeIds])

  const colorScale = useMemo(() => {
    return bfColorScale.copy().domain([minLc, maxLc])
  }, [minLc, maxLc])

  const maxRadius = radii.length ? radii[radii.length - 1] : 100
  const svgSize = maxRadius * 2 + 80
  const center = svgSize / 2

  const titleText = row 
    ? `Solution Space: ${row.Indices} | Global Cost: ${row.GC != null ? parseFloat(row.GC).toFixed(4) : '—'}${isBest ? ' [Best/Optimum]' : ''}`
    : 'No solution space selected'

  const handleNodeMouseEnter = (event, nodeId, cost) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const container = event.currentTarget.closest('.bf-viz')
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    
    setHoveredNode({
      id: nodeId,
      cost: cost,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 10
    })
  }

  const handleNodeMouseLeave = () => {
    setHoveredNode(null)
  }

  return (
    <div className="bf-viz-overlay">
      <button className="viz-close-btn" onClick={onClose}>✕ Close Visualizer</button>
      {loading && <div className="bf-viz-msg">Loading visualizations…</div>}
      {!loading && bfResults.length === 0 && (
        <div className="bf-viz-msg">No visualizations generated for this run.</div>
      )}
      {!loading && bfResults.length > 0 && (
        <div className="bf-viz" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="bf-viz-title" style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'white', marginBottom: '15px', textAlign: 'center' }}>
            {titleText}
          </div>
          <div className="bf-viz-controls">
            <button className="bf-nav-btn" onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹ Prev</button>
            <span className="bf-viz-label" dangerouslySetInnerHTML={{ __html: label }} />
            <span className="bf-viz-counter" style={{ color: '#aaaaaa', fontSize: '0.9em', marginLeft: '10px' }}>
              ({idx + 1} / {bfResults.length})
            </span>
            <button className="bf-nav-btn" onClick={() => setIdx(i => Math.min(bfResults.length - 1, i + 1))} disabled={idx === bfResults.length - 1}>Next ›</button>
          </div>
          
          <svg width={svgSize} height={svgSize} style={{ marginTop: '20px', backgroundColor: '#0d0f1a', borderRadius: '8px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)' }}>
            {/* Concentric orbits */}
            {radii.map((r, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke="#666666"
                strokeDasharray="4 4"
                strokeWidth="1.2"
              />
            ))}
            
            {/* Nodes */}
            {nodeIds.map((nodeId) => {
              const p = pos[nodeId] || { x: 0, y: 0 }
              const cost = parseFloat(currentCosts?.[`Agent ${nodeId}`] || 0)
              const bgColor = colorScale(cost)
              const textColor = getLabelColor(bgColor)
              
              return (
                <g 
                  key={nodeId} 
                  transform={`translate(${center + p.x}, ${center - p.y})`}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) => handleNodeMouseEnter(e, nodeId, cost)}
                  onMouseLeave={handleNodeMouseLeave}
                >
                  <circle
                    cx="0"
                    cy="0"
                    r={nodeRadius}
                    fill={bgColor}
                    stroke="white"
                    strokeWidth="2.5"
                    style={{ transition: 'all 0.15s ease-in-out' }}
                  />
                  <text
                    x="0"
                    y="0"
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={textColor}
                    style={{ fontWeight: 'bold', fontSize: '11px', pointerEvents: 'none' }}
                  >
                    {nodeId}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* Hover Tooltip */}
          {hoveredNode && (
            <div 
              className="bf-node-tooltip" 
              style={{
                position: 'absolute',
                left: hoveredNode.x,
                top: hoveredNode.y,
                transform: 'translate(-50%, -100%)',
                backgroundColor: 'rgba(13, 15, 26, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                padding: '8px 12px',
                borderRadius: '6px',
                pointerEvents: 'none',
                color: 'white',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                fontSize: '0.9em',
                textAlign: 'left',
                transition: 'left 0.1s ease, top 0.1s ease'
              }}
            >
              <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '4px', marginBottom: '4px' }}>
                Agent {hoveredNode.id}
              </div>
              <div>
                Local Cost: <span style={{ color: '#a4d673', fontWeight: 'bold' }}>{hoveredNode.cost.toFixed(4)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Brute Force results ───────────────────────────────────────────────────────

function BruteForceResults({ results, logs, jobId }) {
  const [tab, setTab] = useState('downloads')
  const summary = results.summary ? JSON.parse(results.summary) : null

  return (
    <>
      {summary && (
        <div className="summary-cards">
          {[
            { label: 'Combinations Tested', value: summary.total_combinations?.toLocaleString() },
            { label: 'Best Global Cost',    value: summary.best_gc?.toFixed(6) },
            { label: 'Best Local Cost',     value: summary.best_lc?.toFixed(6) },
            { label: 'Success Rate',        value: summary.success_rate != null ? `${summary.success_rate}%` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="summary-card">
              <div className="sc-label">{label}</div>
              <div className="sc-value">{value ?? '—'}</div>
            </div>
          ))}
        </div>
      )}

      {summary?.best_combo_label && (
        <div className="best-combo-box">
          <span className="bc-label">Optimal selection:</span>
          <span className="bc-value">{summary.best_combo_label}</span>
        </div>
      )}

      <div className="tabs">
        {['downloads', 'logs'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'downloads' ? '⬇ Downloads' : '📋 Logs'}
          </button>
        ))}
      </div>

      {tab === 'downloads' && (
        <div className="download-list">
          {results.solutionwiseresults && (
            <div className="download-item">
              <span>solutionwiseresults.csv</span>
              <button className="dl-btn"
                onClick={() => downloadCsv(results.solutionwiseresults, 'solutionwiseresults.csv')}>
                ⬇ Download
              </button>
            </div>
          )}
          {results.epossimulationresults && (
            <div className="download-item">
              <span>epossimulationresults.csv</span>
              <button className="dl-btn"
                onClick={() => downloadCsv(results.epossimulationresults, 'epossimulationresults.csv')}>
                ⬇ Download
              </button>
            </div>
          )}
          {results.summary && (
            <div className="download-item">
              <span>summary.json</span>
              <button className="dl-btn"
                onClick={() => {
                  const b = new Blob([results.summary], { type: 'application/json' })
                  const u = URL.createObjectURL(b)
                  const a = document.createElement('a')
                  a.href = u; a.download = 'summary.json'; a.click()
                  URL.revokeObjectURL(u)
                }}>
                ⬇ Download
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && <pre className="log-box">{logs || 'No log output captured.'}</pre>}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function ResultsPanel({ results, logs, config, algorithm, jobId, onOpenVisualizer }) {
  const hasEposResults = !!results['global-cost']
  const hasBfResults = !!results.solutionwiseresults

  const isBrute = algorithm === 'BRUTE_FORCE' || algorithm === 'BOTH'
  const isBruteOnly = algorithm === 'BRUTE_FORCE'
  const [showBfViz, setShowBfViz] = useState(false)

  return (
    <>
      {showBfViz && <BruteForceVizOverlay jobId={jobId} results={results} onClose={() => setShowBfViz(false)} />}
      <div className="results-panel">
        {results.status === 'KILLED' && (
          <div className="warn-box" style={{ marginBottom: 14, background: 'rgba(232, 200, 115, 0.12)', border: '1px solid var(--yellow)', borderRadius: 'var(--radius)', padding: '12px' }}>
            <strong>⚠️ Run Terminated (Partial Results)</strong>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--muted)', lineHeight: '1.4' }}>
              This brute-force run was killed by the user. The statistics below reflect only the combinations evaluated before termination.
            </p>
          </div>
        )}
        <div className="results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2>{results.status === 'KILLED' ? '⏹ Run Terminated' : '✅ Run Completed'}</h2>
            <p>
              {algorithm === 'BOTH'
                ? `I-EPOS + Brute Force Exhaustive Search · ${config.numIterations} iterations · α=${config.alpha} · β=${config.beta}`
                : (algorithm === 'BRUTE_FORCE' ? 'Brute Force exhaustive search' : `I-EPOS · ${config.numIterations} iterations · α=${config.alpha} · β=${config.beta} · ${config.globalCostFunction}`)}
            </p>
          </div>
          {algorithm === 'BRUTE_FORCE' ? (
            !showBfViz && (
              <button className="viz-launch-btn" onClick={() => setShowBfViz(true)}>
                ◉ Open Visualizer
              </button>
            )
          ) : (
            onOpenVisualizer && (
              <button className="viz-launch-btn" onClick={onOpenVisualizer}>
                ◉ Open Visualizer
              </button>
            )
          )}
        </div>
        {algorithm === 'BOTH' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '16px' }}>
            {hasEposResults ? (
              <div className="both-results-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <h3 style={{ marginBottom: '12px', color: 'var(--accent-light)' }}>🌲 Tree-Based (I-EPOS) Results</h3>
                <EposResults results={results} logs={logs} config={config} />
              </div>
            ) : (
              <div className="warn-box">⚠ Tree-Based results are not available for this run.</div>
            )}
            {hasBfResults ? (
              <div className="both-results-section" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, color: 'var(--accent-light)' }}>⏹ Brute Force Results</h3>
                  {!showBfViz && (
                    <button className="viz-launch-btn" style={{ margin: 0 }} onClick={() => setShowBfViz(true)}>
                      ◉ Open Brute Force Visualizer
                    </button>
                  )}
                </div>
                <BruteForceResults results={results} logs={logs} jobId={jobId} />
              </div>
            ) : (
              <div className="warn-box">⚠ Brute Force results are not available for this run.</div>
            )}
          </div>
        ) : (
          algorithm === 'BRUTE_FORCE' ? (
            hasBfResults ? (
              <BruteForceResults results={results} logs={logs} jobId={jobId} />
            ) : (
              <div className="warn-box">⚠ Brute Force results are not available for this run.</div>
            )
          ) : (
            hasEposResults ? (
              <EposResults results={results} logs={logs} config={config} />
            ) : (
              <div className="warn-box">⚠ Tree-Based results are not available for this run.</div>
            )
          )
        )}
      </div>
    </>
  )
}

export default function ConfigPanel({ config, onChange, algorithm, onAlgorithmChange, availableSignals = {}, selectedDatasetPath = '', isRunning }) {
  const set = (key, val) => onChange({ ...config, [key]: val })
  const isBrute = algorithm === 'BRUTE_FORCE'
  const hasBrute = algorithm === 'BRUTE_FORCE' || algorithm === 'BOTH'

  const activeSignalKey = Object.entries(availableSignals).find(
    ([_, val]) => val === config.goalSignal?.trim()
  )?.[0] || 'manual';

  const handleSignalSelect = (key) => {
    if (key === 'manual') {
      // keep manual
    } else {
      set('goalSignal', availableSignals[key]);
    }
  }

  return (
    <div className="panel">
      <h3>⚙️ Configuration</h3>

      {/* Algorithm selector */}
      <div className="config-section">
        <h4>Algorithm</h4>
        <div className="algo-toggle">
          {[
            { id: 'EPOS',        label: 'Tree-Based',  desc: 'Iterative' },
            { id: 'BRUTE_FORCE', label: 'Brute Force',  desc: 'Exhaustive search' },
            { id: 'BOTH',        label: 'Both',        desc: 'Tree-Based + Brute Force' },
          ].map(({ id, label, desc }) => (
            <button
              key={id}
              className={`algo-btn ${algorithm === id ? 'active' : ''}`}
              onClick={() => onAlgorithmChange(id)}
              disabled={isRunning}
              style={isRunning ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
            >
              <span className="algo-label">{label}</span>
              <span className="algo-desc">{desc}</span>
            </button>
          ))}
        </div>
        {hasBrute && (
          <div className="warn-box" style={{ marginTop: 8 }}>
            ⚠ Brute force tests every plan combination. Suitable for small datasets (≤ 1 M combinations).
          </div>
        )}
      </div>

      {/* EPOS-only params */}
      {(algorithm === 'EPOS' || algorithm === 'BOTH') && (
        <>
          <div className="config-section">
            <h4>Algorithm Parameters</h4>
            <div className="field-row">
              <label>Iterations</label>
              <input type="number" min="1" max="500" value={config.numIterations}
                onChange={e => set('numIterations', +e.target.value)} />
            </div>
            <div className="field-row">
              <label>Children per node</label>
              <input type="number" min="1" max="10" value={config.numChildren}
                onChange={e => set('numChildren', +e.target.value)} />
            </div>
            <div className="field-row">
              <label>Simulations</label>
              <input type="number" min="1" max="20" value={config.numSimulations || 1}
                onChange={e => set('numSimulations', +e.target.value)} />
            </div>
          </div>

          <div className="config-section">
            <h4>Objective Weights</h4>
            <p className="hint">
              Cost = <strong>(1−α−β)·Global</strong> + <strong>α·Unfairness</strong> + <strong>β·Local</strong>
            </p>
            <div className="field-row">
              <label>α — Unfairness <span className="weight-val">{config.alpha.toFixed(2)}</span></label>
              <input type="range" min="0" max="1" step="0.01" value={config.alpha}
                onChange={e => set('alpha', +e.target.value)} />
            </div>
            <div className="field-row">
              <label>β — Local cost <span className="weight-val">{config.beta.toFixed(2)}</span></label>
              <input type="range" min="0" max="1" step="0.01" value={config.beta}
                onChange={e => set('beta', +e.target.value)} />
            </div>
            <div className="weight-bar">
              <div className="wb-seg wb-global" style={{ flex: Math.max(0, 1 - config.alpha - config.beta) }}>
                Global {((1 - config.alpha - config.beta) * 100).toFixed(0)}%
              </div>
              <div className="wb-seg wb-unfair" style={{ flex: config.alpha }}>
                Unfair {(config.alpha * 100).toFixed(0)}%
              </div>
              <div className="wb-seg wb-local" style={{ flex: config.beta }}>
                Local {(config.beta * 100).toFixed(0)}%
              </div>
            </div>
            {config.alpha + config.beta > 1 && (
              <div className="warn-box">⚠ α + β must be ≤ 1</div>
            )}
          </div>

          <div className="config-section">
            <h4>Cost Functions</h4>
            <div className="field-row">
              <label>Global cost</label>
              <select value={config.globalCostFunction}
                onChange={e => set('globalCostFunction', e.target.value)}>
                <option value="VAR">VAR – Variance</option>
                <option value="RSS">RSS – Residual Sum of Squares</option>
                <option value="RMSE">RMSE – Root Mean Square Error</option>
                <option value="XCORR">XCORR – Cross-Correlation</option>
              </select>
            </div>
            <div className="field-row">
              <label>Local cost</label>
              <select value={config.localCostFunction}
                onChange={e => set('localCostFunction', e.target.value)}>
                <option value="INDEX">INDEX – Plan index</option>
                <option value="DISC">DISC – Discomfort score</option>
                <option value="PREF">PREF – Preference</option>
              </select>
            </div>
             {['RSS', 'RMSE', 'XCORR'].includes(config.globalCostFunction) && (() => {
               const isPrivacyDataset = selectedDatasetPath === 'built-in' || selectedDatasetPath.toLowerCase().includes('privacy');
               const isGaussianDataset = selectedDatasetPath.toLowerCase().includes('gaussian');
               const filteredSignalKeys = Object.keys(availableSignals).filter(key => {
                 if (key === 'linear-increase' || key === 'sine-wave' || key === 'zero') return true;
                 if (key === 'gaussian') return isGaussianDataset;
                 if (key.toLowerCase().includes('privacy')) return isPrivacyDataset;
                 return false;
               });

               return (
                 <>
                   <div className="field-row">
                     <label>Goal signal source</label>
                     <select
                       value={activeSignalKey}
                       onChange={e => handleSignalSelect(e.target.value)}
                     >
                       <option value="manual">✍️ Manual Entry</option>
                       {filteredSignalKeys.map(key => (
                         <option key={key} value={key}>
                           📄 {key}
                         </option>
                       ))}
                     </select>
                   </div>
                   <div className="field-col">
                     <label>Goal signal (comma-separated values)</label>
                     <textarea rows="3" placeholder="e.g. 0.5,1.0,1.5,..."
                       value={config.goalSignal}
                       onChange={e => set('goalSignal', e.target.value)} />
                   </div>
                 </>
               );
             })()}
          </div>
        </>
      )}
    </div>
  )
}

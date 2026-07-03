import { useState, useCallback, useEffect, useRef } from 'react'
import ConfigPanel    from './components/ConfigPanel'
import FileUpload     from './components/FileUpload'
import ResultsPanel   from './components/ResultsPanel'
import PlanViewer     from './components/PlanViewer'
import VisualizerApp  from './visualizer/VisualizerApp'
import { submitRun, pollStatus, fetchResults, fetchPrivacyDataset, fetchSignals, fetchDatasets, fetchDatasetByPath, fetchDatasetMetadata, fetchSelectedAgents, killJob, checkCache } from './api'

const DEFAULT_CONFIG = {
  numPlans: 10, planDim: 100, numIterations: 40, numChildren: 2, numSimulations: 1,
  alpha: 0.2, beta: 0.1, globalCostFunction: 'VAR',
  localCostFunction: 'INDEX', goalSignal: '',
}

// Parse a .plans file text → [{ cost, values }]
function parsePlansText(text) {
  return text.trim().split('\n').filter(Boolean).map(line => {
    const [costStr, vecStr] = line.split(':')
    return { cost: parseFloat(costStr), values: vecStr.split(',').map(Number) }
  })
}

// Serialize parsedPlans back to File objects
function serializePlans(parsedPlans) {
  return parsedPlans.map(agent => {
    const content = agent.plans.map(p => `${p.cost}:${p.values.join(',')}`).join('\n')
    return new File([content], `${agent.name}.plans`, { type: 'text/plain' })
  })
}

function getDatasetDisplayName(path) {
  if (!path) return '';
  if (path === 'built-in') return 'IoT Data Sharing';
  const name = path.split('/').pop();
  if (name === 'gaussian_full') return 'Gaussian [Full]';
  if (name === 'gaussian') return 'Gaussian [Subset]';
  if (name === 'privacy') return 'IoT Data Sharing';
  if (name === 'EPOS-BICYCLES' || name.toLowerCase() === 'bicycle') return 'Bike Sharing';
  if (name.startsWith('Sense10000_')) return 'Drone Surveillance';
  if (name === 'energy') return 'Household Electricity';
  return name;
}

export default function App() {
  const [files,       setFiles]       = useState([])
  const [config,      setConfig]      = useState(DEFAULT_CONFIG)
  const [algorithm,   setAlgorithm]   = useState('EPOS')
  const [datasetType, setDatasetType] = useState('gaussian')
  const [parsedPlans, setParsedPlans] = useState([])   // [{ name, plans:[{cost,values}] }]
  const [isLoadingDataset, setIsLoadingDataset] = useState(false)
  const [jobId,           setJobId]           = useState(null)
  const [status,          setStatus]          = useState(null)
  const [results,         setResults]         = useState(null)
  const [error,           setError]           = useState(null)
  const [logs,            setLogs]            = useState('')
  const [showVisualizer,  setShowVisualizer]  = useState(false)
  const [currentPhase,    setCurrentPhase]    = useState(null)
  const [isKilling,       setIsKilling]       = useState(false)

  const [datasetMeta,     setDatasetMeta]     = useState(null) // {numAgents, numPlans, planDim, agentNames}
  const [isLoadingPlans,  setIsLoadingPlans]  = useState(false)

  const [agentSelectionMode, setAgentSelectionMode] = useState('bulk') // 'bulk' (auto first N) or 'subset' (manual selection)
  const [agentCountN,         setAgentCountN]         = useState(3) // N agents
  const [selectedAgentNames,  setSelectedAgentNames]  = useState([]) // subset manual choice
  const [isSelectionDone,     setIsSelectionDone]     = useState(false) // lock selection for plan editor

  const [planSelectionMode,   setPlanSelectionMode]   = useState('bulk') // 'bulk' (auto first M) or 'subset' (manual selection)
  const [planCountM,           setPlanCountM]           = useState(3) // M plans per agent
  const [selectedPlanIndices,  setSelectedPlanIndices]  = useState([]) // selected plan indices e.g. [0, 1, 2]
  const [isPlanSelectionDone,  setIsPlanSelectionDone]  = useState(false) // lock plan selection for editor

  const [dimSelectionMode,     setDimSelectionMode]     = useState('bulk') // 'bulk' (auto first D) or 'subset' (manual selection)
  const [planDimD,             setPlanDimD]             = useState(3) // D dimensions
  const [selectedDimIndices,   setSelectedDimIndices]   = useState([]) // selected dimension indices, e.g. [0, 1, 2]
  const [isDimSelectionDone,   setIsDimSelectionDone]   = useState(false) // lock dimension selection for editor

  const [availableDatasets,   setAvailableDatasets]   = useState([])
  const [selectedDatasetPath, setSelectedDatasetPath] = useState('')

  const [availableSignals,    setAvailableSignals]    = useState({})

  // Load available target signals and datasets on mount
  useEffect(() => {
    fetchSignals().then(setAvailableSignals).catch(err => console.error("Failed to load available signals:", err))
    fetchDatasets().then(setAvailableDatasets).catch(err => console.error("Failed to load datasets:", err))
  }, [])

  // Parse uploaded files into parsedPlans whenever files change
  useEffect(() => {
    if (files.length === 0) {
      if (selectedDatasetPath) return
      setParsedPlans([]);
      return
    }
    setIsLoadingDataset(true)
    Promise.all(files.map(async f => ({
      name:  f.name.replace('.plans', ''),
      plans: parsePlansText(await f.text()),
    })))
      .then(agents => {
        setParsedPlans(agents)
        setIsLoadingDataset(false)
      })
      .catch(err => {
        setError('Failed to parse uploaded files: ' + err.message)
        setIsLoadingDataset(false)
      })
  }, [files, selectedDatasetPath])

  // Reset defaults when parsedPlans changes
  const lastLength = useRef(0)
  useEffect(() => {
    if (parsedPlans.length !== lastLength.current) {
      lastLength.current = parsedPlans.length
      setIsSelectionDone(false)
      setIsPlanSelectionDone(false)
      setIsDimSelectionDone(false)
      if (parsedPlans.length > 0) {
        // Only reset agent selection if not using metadata flow (where user already chose agents)
        if (!datasetMeta) {
          const defaultN = Math.min(3, parsedPlans.length)
          setAgentCountN(defaultN)
          setSelectedAgentNames(parsedPlans.slice(0, defaultN).map(p => p.name))
        }

        const maxAvailablePlans = Math.min(...parsedPlans.map(a => a.plans.length))
        const defaultM = Math.min(3, maxAvailablePlans)
        setPlanCountM(defaultM)
        setSelectedPlanIndices(Array.from({ length: defaultM }, (_, i) => i))

        const actualPlanDim = parsedPlans[0].plans.length > 0 && parsedPlans[0].plans[0].values
          ? parsedPlans[0].plans[0].values.length
          : 0;
        const defaultD = actualPlanDim;
        setPlanDimD(defaultD)
        setSelectedDimIndices(Array.from({ length: defaultD }, (_, i) => i))
      } else {
        setSelectedAgentNames([])
        setSelectedPlanIndices([])
        setSelectedDimIndices([])
      }
    }
  }, [parsedPlans])

  const handleDatasetPathChange = async path => {
    setSelectedDatasetPath(path)
    setFiles([])
    setIsSelectionDone(false)
    setIsPlanSelectionDone(false)
    setIsDimSelectionDone(false)
    setStatus(null); setResults(null); setError(null)
    setParsedPlans([])
    setDatasetMeta(null)

    if (path === 'built-in') {
      setIsLoadingDataset(true)
      setConfig(c => ({ ...c, planDim: 64, numPlans: 3 }))
      try {
        const agents = await fetchPrivacyDataset()
        setParsedPlans(agents.map(a => ({ name: a.name, plans: a.plans })))
      } catch (e) {
        setError('Failed to load privacy dataset: ' + e.message)
      } finally {
        setIsLoadingDataset(false)
      }
    } else if (path === '') {
      // Custom Upload
      setParsedPlans([])
      if (datasetType === 'privacy') {
        setConfig(c => ({ ...c, planDim: 64, numPlans: 3 }))
      } else {
        setConfig(c => ({ ...c, planDim: 100, numPlans: 10 }))
      }
    } else {
      // Pre-loaded dataset: fetch metadata only (fast)
      setIsLoadingDataset(true)
      try {
        const meta = await fetchDatasetMetadata(path)
        setDatasetMeta(meta)
        setConfig(c => ({ ...c, planDim: meta.planDim, numPlans: meta.numPlans }))
        const defaultN = Math.min(3, meta.numAgents)
        setAgentCountN(defaultN)
        setSelectedAgentNames(meta.agentNames.slice(0, defaultN))
        setAgentSelectionMode('bulk')
      } catch (e) {
        setError('Failed to load dataset: ' + e.message)
      } finally {
        setIsLoadingDataset(false)
      }
    }
  }

  // When switching dataset type, update config defaults
  const handleDatasetType = async type => {
    setDatasetType(type)
    setAgentSelectionMode('bulk')
    setPlanSelectionMode('bulk')
    setDimSelectionMode('bulk')
    setIsSelectionDone(false)
    setIsPlanSelectionDone(false)
    setIsDimSelectionDone(false)
    setStatus(null); setResults(null); setError(null)
    setFiles([]); setParsedPlans([])
    if (type === 'privacy') {
      handleDatasetPathChange('built-in')
    } else {
      handleDatasetPathChange('')
    }
  }

  // Selected agents list based on current settings (even if not locked yet)
  const selectedAgents = agentSelectionMode === 'subset'
    ? parsedPlans.filter(p => selectedAgentNames.includes(p.name))
    : parsedPlans.slice(0, agentCountN);

  // Compute bottleneck agents where plan count is less than planCountM
  // Only check among the selectedAgents (or all parsedPlans if selectedAgents is empty)
  const activeAgentsForPlanValidation = selectedAgents.length > 0 ? selectedAgents : parsedPlans;
  const bottleneckAgents = planCountM > 0
    ? activeAgentsForPlanValidation.filter(a => a.plans.length < planCountM)
    : [];

  // Agent names for selection panel: prefer full metadata list, fall back to parsedPlans
  const allAgentNames = datasetMeta?.agentNames?.length > 0
    ? datasetMeta.agentNames
    : parsedPlans.map(p => p.name)
  const totalAgentCount = allAgentNames.length

  const getAgentValidationError = () => {
    if (totalAgentCount === 0) return null;
    if (agentCountN <= 0) {
      return "Number of agents (N) must be greater than 0.";
    }
    if (agentCountN > totalAgentCount) {
      return `N (${agentCountN}) cannot exceed the total loaded agents (${totalAgentCount}).`;
    }
    if (agentSelectionMode === 'subset') {
      if (selectedAgentNames.length !== agentCountN) {
        return `Please choose exactly ${agentCountN} agent(s). (Currently selected: ${selectedAgentNames.length})`;
      }
    }
    return null;
  };

  const getPlanValidationError = () => {
    if (parsedPlans.length === 0) return null;
    if (planCountM <= 0) {
      return "Number of plans (M) must be greater than 0.";
    }
    if (bottleneckAgents.length > 0) {
      const names = bottleneckAgents.map(a => `${a.name} (${a.plans.length} plans)`).join(', ');
      return `M (${planCountM}) exceeds available plans for selected agent(s): ${names}.`;
    }
    if (planSelectionMode === 'subset') {
      if (selectedPlanIndices.length !== planCountM) {
        return `Please choose exactly ${planCountM} plans. (Currently selected: ${selectedPlanIndices.length})`;
      }
    }
    return null;
  };

  const getDimensionSelectionError = () => {
    if (parsedPlans.length === 0) return null;
    const actualPlanDim = parsedPlans[0].plans.length > 0 && parsedPlans[0].plans[0].values
      ? parsedPlans[0].plans[0].values.length
      : 0;
    if (planDimD <= 0) {
      return "Number of dimensions (D) must be greater than 0.";
    }
    if (planDimD > actualPlanDim) {
      return `D (${planDimD}) cannot exceed actual plan dimensions (${actualPlanDim}).`;
    }
    if (dimSelectionMode === 'subset') {
      if (selectedDimIndices.length !== planDimD) {
        return `Please choose exactly ${planDimD} dimensions. (Currently selected: ${selectedDimIndices.length})`;
      }
    }
    return null;
  };

  const agentSelectionError = getAgentValidationError();
  const planSelectionError = getPlanValidationError();
  const dimensionSelectionError = getDimensionSelectionError();

  const validationError = agentSelectionError || planSelectionError || dimensionSelectionError;

  const getValidationError = () => validationError;

  // Reset status and results when parameters change (unless currently running)
  const isRunningRef = useRef(false);
  isRunningRef.current = status === 'RUNNING';

  useEffect(() => {
    if (isRunningRef.current) return;
    setStatus(null);
    setResults(null);
    setLogs('');
    setJobId(null);
  }, [
    config,
    algorithm,
    datasetType,
    agentSelectionMode,
    agentCountN,
    selectedAgentNames,
    planSelectionMode,
    planCountM,
    selectedPlanIndices,
    dimSelectionMode,
    planDimD,
    selectedDimIndices,
  ]);

  // Check backend cache when config/data changes
  useEffect(() => {
    if (parsedPlans.length === 0 || status !== null) return;

    // Validation check before calling checkCache to avoid errors
    const agentErr = getAgentValidationError();
    const planErr = getPlanValidationError();
    const dimErr = getDimensionSelectionError();
    if (agentErr || planErr || dimErr) {
      // Clear results if configuration is invalid
      setJobId(null);
      setResults(null);
      setLogs('');
      setStatus(null);
      return;
    }

    const checkBackendCache = async () => {
      try {
        const selectedPlans = agentSelectionMode === 'subset'
          ? parsedPlans.filter(p => selectedAgentNames.includes(p.name))
          : parsedPlans.slice(0, agentCountN);

        const finalPlansWithPlanSelection = selectedPlans.map(agent => {
          const filteredPlans = planSelectionMode === 'subset'
            ? agent.plans.filter((_, idx) => selectedPlanIndices.includes(idx))
            : agent.plans.slice(0, planCountM);
          return {
            ...agent,
            plans: filteredPlans
          }
        });

        const finalPlansWithDimSelection = finalPlansWithPlanSelection.map(agent => {
          return {
            ...agent,
            plans: agent.plans.map(p => {
              const filteredValues = dimSelectionMode === 'subset'
                ? p.values.filter((_, idx) => selectedDimIndices.includes(idx))
                : p.values.slice(0, planDimD);
              return {
                ...p,
                values: filteredValues
              }
            })
          }
        });

        const filesToSend = serializePlans(finalPlansWithDimSelection);

        let slicedGoalSignal = config.goalSignal || '';
        if (slicedGoalSignal) {
          const rawSignal = availableSignals[slicedGoalSignal] || slicedGoalSignal;
          const signalParts = rawSignal.split(',').map(s => s.trim());
          if (signalParts.length > 0) {
            const filteredParts = dimSelectionMode === 'subset'
              ? signalParts.filter((_, idx) => selectedDimIndices.includes(idx))
              : signalParts.slice(0, planDimD);
            slicedGoalSignal = filteredParts.join(',');
          }
        }

        const cfg = {
          ...config,
          numAgents: agentCountN,
          numPlans: planCountM,
          planDim: planDimD,
          goalSignal: slicedGoalSignal,
          algorithm,
          datasetType,
        };

        const cacheRes = await checkCache(filesToSend, cfg);
        if (cacheRes.exists) {
          setJobId(cacheRes.jobId);
          setResults(cacheRes.results);
          setLogs(cacheRes.logs || '');
          setStatus('COMPLETED');
          setError(null);
        } else {
          // If no cache entry exists, reset results
          setJobId(null);
          setResults(null);
          setLogs('');
          setStatus(null);
          setError(null);
        }
      } catch (err) {
        console.error("Cache check failed:", err);
      }
    };

    checkBackendCache();
  }, [
    parsedPlans,
    config,
    algorithm,
    datasetType,
    agentSelectionMode,
    agentCountN,
    selectedAgentNames,
    planSelectionMode,
    planCountM,
    selectedPlanIndices,
    dimSelectionMode,
    planDimD,
    selectedDimIndices,
    availableSignals,
    status
  ]);

  const handleRun = useCallback(async () => {
    const errorMsg = getValidationError()
    if (errorMsg) {
      setError(errorMsg)
      return
    }
    // Auto-lock all selections if everything is valid
    setIsSelectionDone(true)
    setIsPlanSelectionDone(true)
    setIsDimSelectionDone(true)
    setError(null); setResults(null); setLogs(''); setStatus('RUNNING'); setIsKilling(false); setCurrentPhase(algorithm === 'BOTH' ? 'EPOS' : (algorithm === 'BRUTE_FORCE' ? 'BRUTE_FORCE' : 'EPOS'))

    try {
      // slice/filter the plans according to agentSelectionMode
      const selectedPlans = agentSelectionMode === 'subset'
        ? parsedPlans.filter(p => selectedAgentNames.includes(p.name))
        : parsedPlans.slice(0, agentCountN);

      // slice/filter the plans inside each selected agent!
      const finalPlansWithPlanSelection = selectedPlans.map(agent => {
        const filteredPlans = planSelectionMode === 'subset'
          ? agent.plans.filter((_, idx) => selectedPlanIndices.includes(idx))
          : agent.plans.slice(0, planCountM);
        return {
          ...agent,
          plans: filteredPlans
        }
      });

      // slice/filter the plan dimensions inside each plan values array!
      const finalPlansWithDimSelection = finalPlansWithPlanSelection.map(agent => {
        return {
          ...agent,
          plans: agent.plans.map(p => {
            const filteredValues = dimSelectionMode === 'subset'
              ? p.values.filter((_, idx) => selectedDimIndices.includes(idx))
              : p.values.slice(0, planDimD);
            return {
              ...p,
              values: filteredValues
            }
          })
        }
      });

      const filesToSend = serializePlans(finalPlansWithDimSelection)

      // slice/filter goalSignal if set
      let slicedGoalSignal = config.goalSignal || '';
      if (slicedGoalSignal) {
        const rawSignal = availableSignals[slicedGoalSignal] || slicedGoalSignal;
        const signalParts = rawSignal.split(',').map(s => s.trim());
        if (signalParts.length > 0) {
          const filteredParts = dimSelectionMode === 'subset'
            ? signalParts.filter((_, idx) => selectedDimIndices.includes(idx))
            : signalParts.slice(0, planDimD);
          slicedGoalSignal = filteredParts.join(',');
        }
      }

      const cfg = {
        ...config,
        numAgents: agentCountN,
        numPlans: planCountM,
        planDim: planDimD,
        goalSignal: slicedGoalSignal,
        algorithm,
        datasetType,
      }
      const { jobId: id } = await submitRun(filesToSend, cfg)
      setJobId(id)

      const interval = setInterval(async () => {
        try {
          const s = await pollStatus(id)
          if (s.currentPhase) {
            setCurrentPhase(s.currentPhase)
          }
          if (s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'KILLED') {
            clearInterval(interval)
            setStatus(s.status)
            setIsKilling(false)
            const r = await fetchResults(id)
            setResults(r)
            setLogs(r.logs || '')
            if (s.status === 'FAILED') setError(r.error || 'Run failed.')
          }
        } catch (e) {
          clearInterval(interval)
          setStatus('FAILED')
          setIsKilling(false)
          setError(e.message)
        }
      }, 2000)
    } catch (e) {
      setStatus('FAILED')
      setError(e.message)
    }
  }, [parsedPlans, config, algorithm, datasetType, agentSelectionMode, agentCountN, selectedAgentNames, planSelectionMode, planCountM, selectedPlanIndices, dimSelectionMode, planDimD, selectedDimIndices, availableSignals])

  const handleKillJob = useCallback(async () => {
    if (!jobId) return
    const confirmKill = window.confirm("Are you sure you want to kill the run? This will stop execution and display partial results.")
    if (!confirmKill) return

    setIsKilling(true)
    try {
      await killJob(jobId)
    } catch (e) {
      setError("Failed to kill run: " + e.message)
      setIsKilling(false)
    }
  }, [jobId])

  const selectedAgentNamesList = agentSelectionMode === 'subset'
    ? selectedAgentNames
    : parsedPlans.slice(0, agentCountN).map(p => p.name);

  const selectedPlanIndicesList = planSelectionMode === 'subset'
    ? selectedPlanIndices
    : Array.from({ length: planCountM }, (_, i) => i);

  const selectedDimIndicesList = dimSelectionMode === 'subset'
    ? selectedDimIndices
    : Array.from({ length: planDimD }, (_, i) => i);

  const canRun = parsedPlans.length > 0

  return (
    <>
    <div className="app">
      <header className="app-header">
        <h1>Argonaut: Discrete Choice Optimization</h1>
        <p>Iterative Tree-Based Planning</p>
      </header>

      <main className="app-main">
        <aside className="app-sidebar">

          {/* Dataset source selector */}
          <div className="panel">
            <h3>📁 Dataset</h3>
            <div className="field-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Select Dataset Source</label>
              <select
                value={selectedDatasetPath}
                onChange={e => handleDatasetPathChange(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="">-- Custom Upload Plans --</option>
                {availableDatasets
                  .filter(path => {
                    const name = path.split('/').pop();
                    return name !== 'Gaussian_Agent10_Plan5_top' && 
                           name !== 'Gaussian_Agent_10_Plan_5_top' &&
                           name !== 'sample';
                  })
                  .map(path => (
                    <option key={path} value={path}>{getDatasetDisplayName(path)}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* Conditional File Uploader / Confirmation Panel */}
          {selectedDatasetPath ? (
            <div className="panel" style={{ background: 'rgba(141,184,114,0.06)', borderColor: 'rgba(141,184,114,0.25)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--green)', fontSize: '0.85rem', fontWeight: 600 }}>
                <span style={{ fontSize: '1rem' }}>✓</span> Loaded Pre-configured Dataset
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '6px', lineHeight: '1.4' }}>
                Dataset: <code>{getDatasetDisplayName(selectedDatasetPath)}</code>
              </p>
              <button
                type="button"
                className="link-btn"
                style={{ marginTop: '10px', fontSize: '0.78rem', color: 'var(--red)', cursor: 'pointer', padding: 0 }}
                onClick={() => handleDatasetPathChange('')}
              >
                Clear and upload manually
              </button>
            </div>
          ) : (
            <FileUpload files={files} onChange={setFiles} />
          )}

          {/* Loading Indicator for Sidebar */}
          {isLoadingDataset && (
            <div className="sidebar-loading-panel">
              <div className="spinner" />
              <div className="pulsing-text">Loading dataset...</div>
            </div>
          )}

          {/* Agent Selection Panel */}
          {!isLoadingDataset && (parsedPlans.length > 0 || datasetMeta) && (
            <div className="panel" style={{ opacity: isSelectionDone ? 0.9 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3>👥 Agent Selection</h3>
                {isSelectionDone && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent)',
                    background: 'rgba(164,214,115,0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid var(--accent)'
                  }}>
                    Locked
                  </span>
                )}
              </div>
              
              {/* Numeric N input (Shared for both modes) */}
              <div className="field-row" style={{ marginBottom: 12 }}>
                <label>Number of agents (N)</label>
                <input
                  type="number"
                  min="1"
                  max={totalAgentCount}
                  disabled={isSelectionDone}
                  style={{
                    width: '90px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    textAlign: 'center',
                    opacity: isSelectionDone ? 0.6 : 1
                  }}
                  value={agentCountN}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setAgentCountN(val);
                    if (agentSelectionMode === 'subset') {
                      setSelectedAgentNames(allAgentNames.slice(0, val));
                    }
                  }}
                />
              </div>

              {/* Mode toggle */}
              <div className="algo-toggle" style={{ marginBottom: 12, opacity: isSelectionDone ? 0.6 : 1, pointerEvents: isSelectionDone ? 'none' : 'auto' }}>
                {[
                  { id: 'bulk',   label: 'Bulk (Auto N)' },
                  { id: 'subset', label: 'Subset (Manual)' },
                ].map(({ id, label }) => (
                  <button key={id}
                    type="button"
                    className={`algo-btn ${agentSelectionMode === id ? 'active' : ''}`}
                    onClick={() => {
                      setAgentSelectionMode(id);
                      if (id === 'bulk') {
                        setError(null);
                      }
                      if (id === 'subset') {
                        setSelectedAgentNames(allAgentNames.slice(0, agentCountN));
                      }
                    }}>
                    <span className="algo-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Bulk Mode Hint */}
              {agentSelectionMode === 'bulk' && agentCountN > 0 && agentCountN <= totalAgentCount && (
                <p className="hint" style={{ fontSize: '0.78rem', color: 'var(--muted)', opacity: 0.85 }}>
                  First {agentCountN} of {totalAgentCount} agents will be selected automatically.
                </p>
              )}

              {/* Subset Mode Manual Checkboxes */}
              {agentSelectionMode === 'subset' && (
                <div>
                  <label style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Choose exactly {agentCountN} agents manually:
                  </label>
                  <div style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    opacity: isSelectionDone ? 0.6 : 1,
                    pointerEvents: isSelectionDone ? 'none' : 'auto'
                  }}>
                    {allAgentNames.map(agentName => {
                      const isChecked = selectedAgentNames.includes(agentName);
                      return (
                        <label key={agentName} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.82rem',
                          cursor: isSelectionDone ? 'default' : 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'background 0.2s',
                          margin: 0
                        }}
                        onMouseEnter={(e) => { if (!isSelectionDone) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={(e) => { if (!isSelectionDone) e.currentTarget.style.background = 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            disabled={isSelectionDone}
                            style={{
                              accentColor: 'var(--accent)',
                              cursor: isSelectionDone ? 'default' : 'pointer',
                              margin: 0
                            }}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedAgentNames(selectedAgentNames.filter(n => n !== agentName));
                              } else {
                                setSelectedAgentNames([...selectedAgentNames, agentName]);
                              }
                            }}
                          />
                          <span style={{ color: isChecked ? 'var(--accent)' : 'var(--text)' }}>
                            {agentName}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                    fontSize: '0.78rem',
                  }}>
                    <span style={{ color: 'var(--muted)' }}>
                      Selected count:
                    </span>
                    <span style={{
                      fontWeight: 'bold',
                      color: selectedAgentNames.length === agentCountN ? 'var(--accent)' : 'var(--yellow)',
                      background: selectedAgentNames.length === agentCountN ? 'rgba(141,184,114,0.1)' : 'rgba(232,200,115,0.1)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      border: `1px solid ${selectedAgentNames.length === agentCountN ? 'var(--accent)' : 'var(--yellow)'}`
                    }}>
                      {selectedAgentNames.length} / {agentCountN}
                    </span>
                  </div>
                </div>
              )}

              {/* Inline Agent Selection Error */}
              {agentSelectionError && !isSelectionDone && (
                <div className="error-box" style={{ marginTop: 10, fontSize: '0.78rem', padding: '6px 10px' }}>
                  ⚠️ {agentSelectionError}
                </div>
              )}

              {/* Done/Edit Selection Button */}
              <button
                type="button"
                className="run-btn"
                style={{
                  marginTop: 12,
                  padding: '8px',
                  fontSize: '0.85rem',
                  background: isSelectionDone ? '#4c6c8c' : 'var(--btn-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                disabled={(!isSelectionDone && !!agentSelectionError) || isLoadingPlans}
                onClick={async () => {
                  if (isSelectionDone) {
                    setIsSelectionDone(false)
                    return
                  }
                  // If metadata-only dataset, fetch selected agents' plan data now
                  if (datasetMeta && selectedDatasetPath && selectedDatasetPath !== 'built-in') {
                    const namesToLoad = agentSelectionMode === 'subset'
                      ? selectedAgentNames
                      : (datasetMeta.agentNames || []).slice(0, agentCountN)
                    // Skip fetch if plans already loaded for the same agents
                    const loadedNames = new Set(parsedPlans.map(p => p.name))
                    const needsFetch = namesToLoad.length !== loadedNames.size || namesToLoad.some(n => !loadedNames.has(n))
                    if (needsFetch) {
                      setIsLoadingPlans(true)
                      try {
                        const agents = await fetchSelectedAgents(selectedDatasetPath, namesToLoad)
                        setParsedPlans(agents.map(a => ({ name: a.name, plans: a.plans })))
                      } catch (e) {
                        setError('Failed to load agent plans: ' + e.message)
                        setIsLoadingPlans(false)
                        return
                      }
                      setIsLoadingPlans(false)
                    }
                  }
                  setIsSelectionDone(true)
                }}
              >
                {isLoadingPlans ? '⏳ Loading Plans…' : (isSelectionDone ? '✏️ Edit Agent Selection' : '✔️ Done (Lock Selection)')}
              </button>
            </div>
          )}

          {/* Plan Selection Panel */}
          {!isLoadingDataset && parsedPlans.length > 0 && (
            <div className="panel" style={{ opacity: isPlanSelectionDone ? 0.9 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>📋 Plan Selection</h3>
                {isPlanSelectionDone && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent)',
                    background: 'rgba(164,214,115,0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid var(--accent)'
                  }}>
                    Locked
                  </span>
                )}
              </div>

              {/* Numeric M input (Shared for both modes) */}
              <div className="field-row" style={{ marginBottom: 12 }}>
                <label>Plans per agent (M)</label>
                <input
                  type="number"
                  min="1"
                  max={parsedPlans.length > 0 ? Math.max(...parsedPlans.map(a => a.plans.length)) : 1}
                  disabled={isPlanSelectionDone}
                  style={{
                    width: '90px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    textAlign: 'center',
                    opacity: isPlanSelectionDone ? 0.6 : 1
                  }}
                  value={planCountM}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setPlanCountM(val);
                  }}
                />
              </div>

              {/* Mode toggle */}
              <div className="algo-toggle" style={{ marginBottom: 12, opacity: isPlanSelectionDone ? 0.6 : 1, pointerEvents: isPlanSelectionDone ? 'none' : 'auto' }}>
                {[
                  { id: 'bulk',   label: 'Bulk (Auto M)' },
                  { id: 'subset', label: 'Subset (Manual)' },
                ].map(({ id, label }) => (
                  <button key={id}
                    type="button"
                    className={`algo-btn ${planSelectionMode === id ? 'active' : ''}`}
                    onClick={() => {
                      setPlanSelectionMode(id);
                      if (id === 'bulk') {
                        setError(null);
                      }
                    }}>
                    <span className="algo-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Bulk Mode Hint */}
              {planSelectionMode === 'bulk' && planCountM > 0 && parsedPlans.length > 0 && planCountM <= Math.min(...parsedPlans.map(a => a.plans.length)) && (
                <p className="hint" style={{ fontSize: '0.78rem', color: 'var(--muted)', opacity: 0.85 }}>
                  First {planCountM} plans for each agent will be selected automatically.
                </p>
              )}

              {/* Subset Mode Manual Checkboxes */}
              {planSelectionMode === 'subset' && parsedPlans.length > 0 && (
                <div>
                  <label style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Choose exactly {planCountM} plan indices manually:
                  </label>
                  <div style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    opacity: isPlanSelectionDone ? 0.6 : 1,
                    pointerEvents: isPlanSelectionDone ? 'none' : 'auto'
                  }}>
                    {Array.from({ length: selectedAgents.length > 0 ? Math.max(...selectedAgents.map(a => a.plans.length)) : Math.max(...parsedPlans.map(a => a.plans.length)) }, (_, idx) => {
                      const isChecked = selectedPlanIndices.includes(idx);
                      return (
                        <label key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.82rem',
                          cursor: isPlanSelectionDone ? 'default' : 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'background 0.2s',
                          margin: 0
                        }}
                        onMouseEnter={(e) => { if (!isPlanSelectionDone) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={(e) => { if (!isPlanSelectionDone) e.currentTarget.style.background = 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            disabled={isPlanSelectionDone}
                            style={{
                              accentColor: 'var(--accent)',
                              cursor: isPlanSelectionDone ? 'default' : 'pointer',
                              margin: 0
                            }}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedPlanIndices(selectedPlanIndices.filter(i => i !== idx));
                              } else {
                                setSelectedPlanIndices([...selectedPlanIndices, idx]);
                              }
                            }}
                          />
                          <span style={{ color: isChecked ? 'var(--accent)' : 'var(--text)' }}>
                            Plan Index {idx}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                    fontSize: '0.78rem',
                  }}>
                    <span style={{ color: 'var(--muted)' }}>
                      Selected count:
                    </span>
                    <span style={{
                      fontWeight: 'bold',
                      color: selectedPlanIndices.length === planCountM ? 'var(--accent)' : 'var(--yellow)',
                      background: selectedPlanIndices.length === planCountM ? 'rgba(141,184,114,0.1)' : 'rgba(232,200,115,0.1)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      border: `1px solid ${selectedPlanIndices.length === planCountM ? 'var(--accent)' : 'var(--yellow)'}`
                    }}>
                      {selectedPlanIndices.length} / {planCountM}
                    </span>
                  </div>
                </div>
              )}

              {/* Inline Plan Selection Error & Bottleneck Info */}
              {planSelectionError && !isPlanSelectionDone && (
                <div className="warn-box" style={{ marginTop: 10, fontSize: '0.78rem', padding: '6px 10px' }}>
                  <strong>⚠️ Plan Limit:</strong>
                  <div style={{ marginTop: 4 }}>
                    {planSelectionError}
                  </div>
                  {bottleneckAgents.length > 0 && (
                    <div style={{ marginTop: 6, opacity: 0.9, borderTop: '1px solid rgba(232,200,115,0.2)', paddingTop: 6 }}>
                      💡 <em>Tip: Reduce M to {Math.min(...activeAgentsForPlanValidation.map(a => a.plans.length))} or select only agents that have enough plans.</em>
                    </div>
                  )}
                </div>
              )}

              {/* Done/Edit Selection Button */}
              <button
                type="button"
                className="run-btn"
                style={{
                  marginTop: 12,
                  padding: '8px',
                  fontSize: '0.85rem',
                  background: isPlanSelectionDone ? '#4c6c8c' : 'var(--btn-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                disabled={!isPlanSelectionDone && !!planSelectionError}
                onClick={() => setIsPlanSelectionDone(!isPlanSelectionDone)}
              >
                {isPlanSelectionDone ? '✏️ Edit Plan Selection' : '✔️ Done (Lock Selection)'}
              </button>
            </div>
          )}

          {/* Dimension Selection Panel */}
          {!isLoadingDataset && parsedPlans.length > 0 && (
            <div className="panel" style={{ opacity: isDimSelectionDone ? 0.9 : 1, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>📐 Dimension Selection</h3>
                {isDimSelectionDone && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--accent)',
                    background: 'rgba(164,214,115,0.1)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid var(--accent)'
                  }}>
                    Locked
                  </span>
                )}
              </div>

              {/* Numeric D input (Shared for both modes) */}
              <div className="field-row" style={{ marginBottom: 12 }}>
                <label>Number of dimensions (D)</label>
                <input
                  type="number"
                  min="1"
                  max={parsedPlans.length > 0 && parsedPlans[0].plans.length > 0 && parsedPlans[0].plans[0].values
                    ? parsedPlans[0].plans[0].values.length
                    : 1}
                  disabled={isDimSelectionDone}
                  style={{
                    width: '90px',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: '0.82rem',
                    textAlign: 'center',
                    opacity: isDimSelectionDone ? 0.6 : 1
                  }}
                  value={planDimD}
                  onChange={e => {
                    const val = parseInt(e.target.value) || 0;
                    setPlanDimD(val);
                  }}
                />
              </div>

              {/* Mode toggle */}
              <div className="algo-toggle" style={{ marginBottom: 12, opacity: isDimSelectionDone ? 0.6 : 1, pointerEvents: isDimSelectionDone ? 'none' : 'auto' }}>
                {[
                  { id: 'bulk',   label: 'Bulk (Auto D)' },
                  { id: 'subset', label: 'Subset (Manual)' },
                ].map(({ id, label }) => (
                  <button key={id}
                    type="button"
                    className={`algo-btn ${dimSelectionMode === id ? 'active' : ''}`}
                    onClick={() => {
                      setDimSelectionMode(id);
                      if (id === 'bulk') {
                        setError(null);
                      }
                    }}>
                    <span className="algo-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Bulk Mode Hint */}
              {dimSelectionMode === 'bulk' && planDimD > 0 && parsedPlans.length > 0 && parsedPlans[0].plans.length > 0 && parsedPlans[0].plans[0].values && planDimD <= parsedPlans[0].plans[0].values.length && (
                <p className="hint" style={{ fontSize: '0.78rem', color: 'var(--muted)', opacity: 0.85 }}>
                  First {planDimD} dimensions of each plan will be selected automatically.
                </p>
              )}

              {/* Subset Mode Manual Checkboxes */}
              {dimSelectionMode === 'subset' && parsedPlans.length > 0 && parsedPlans[0].plans.length > 0 && parsedPlans[0].plans[0].values && (
                <div>
                  <label style={{ fontSize: '0.82rem', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                    Choose exactly {planDimD} dimensions manually:
                  </label>
                  <div style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    background: 'var(--surface)',
                    padding: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    opacity: isDimSelectionDone ? 0.6 : 1,
                    pointerEvents: isDimSelectionDone ? 'none' : 'auto'
                  }}>
                    {Array.from({ length: parsedPlans[0].plans[0].values.length }, (_, idx) => {
                      const isChecked = selectedDimIndices.includes(idx);
                      return (
                        <label key={idx} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '0.82rem',
                          cursor: isDimSelectionDone ? 'default' : 'pointer',
                          padding: '4px',
                          borderRadius: '4px',
                          transition: 'background 0.2s',
                          margin: 0
                        }}
                        onMouseEnter={(e) => { if (!isDimSelectionDone) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={(e) => { if (!isDimSelectionDone) e.currentTarget.style.background = 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            disabled={isDimSelectionDone}
                            style={{
                              accentColor: 'var(--accent)',
                              cursor: isDimSelectionDone ? 'default' : 'pointer',
                              margin: 0
                            }}
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setSelectedDimIndices(selectedDimIndices.filter(i => i !== idx));
                              } else {
                                setSelectedDimIndices([...selectedDimIndices, idx]);
                              }
                            }}
                          />
                          <span style={{ color: isChecked ? 'var(--accent)' : 'var(--text)' }}>
                            Dimension d{idx + 1}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 8,
                    fontSize: '0.78rem',
                  }}>
                    <span style={{ color: 'var(--muted)' }}>
                      Selected count:
                    </span>
                    <span style={{
                      fontWeight: 'bold',
                      color: selectedDimIndices.length === planDimD ? 'var(--accent)' : 'var(--yellow)',
                      background: selectedDimIndices.length === planDimD ? 'rgba(141,184,114,0.1)' : 'rgba(232,200,115,0.1)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      border: `1px solid ${selectedDimIndices.length === planDimD ? 'var(--accent)' : 'var(--yellow)'}`
                    }}>
                      {selectedDimIndices.length} / {planDimD}
                    </span>
                  </div>
                </div>
              )}

              {/* Inline Dimension Selection Error */}
              {dimensionSelectionError && !isDimSelectionDone && (
                <div className="error-box" style={{ marginTop: 10, fontSize: '0.78rem', padding: '6px 10px' }}>
                  ⚠️ {dimensionSelectionError}
                </div>
              )}

              {/* Done/Edit Selection Button */}
              <button
                type="button"
                className="run-btn"
                style={{
                  marginTop: 12,
                  padding: '8px',
                  fontSize: '0.85rem',
                  background: isDimSelectionDone ? '#4c6c8c' : 'var(--btn-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
                disabled={!isDimSelectionDone && !!dimensionSelectionError}
                onClick={() => setIsDimSelectionDone(!isDimSelectionDone)}
              >
                {isDimSelectionDone ? '✏️ Edit Dimension Selection' : '✔️ Done (Lock Selection)'}
              </button>
            </div>
          )}

          <ConfigPanel
            config={config}
            onChange={setConfig}
            algorithm={algorithm}
            onAlgorithmChange={setAlgorithm}
            availableSignals={availableSignals}
            selectedDatasetPath={selectedDatasetPath}
            isRunning={status === 'RUNNING'}
          />

          <button
            className="run-btn"
            onClick={handleRun}
            disabled={status === 'RUNNING' || !canRun}
          >
            {status === 'RUNNING' ? '⏳ Running…' : '▶ Run Algorithm'}
          </button>

          {(error || validationError) && (
            <div className="error-box">
              {error || validationError}
            </div>
          )}
        </aside>

        <section className="app-content">
          {status === 'RUNNING' && (
            <div className="status-card running" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="spinner" />
                <span>
                  {isKilling
                    ? '⏳ Loading partial results…'
                    : (currentPhase === 'BRUTE_FORCE'
                        ? 'Searching all combinations (Brute Force)…'
                        : 'Running Tree-Base (Iterative) Algorithm')}
                </span>
              </div>
              {!isKilling && (algorithm === 'BRUTE_FORCE' || algorithm === 'BOTH') && (
                <button
                  type="button"
                  className="pv-agent-delete"
                  style={{ width: '100%', margin: 0, padding: '10px' }}
                  onClick={handleKillJob}
                >
                  ⏹ Kill Run
                </button>
              )}
            </div>
          )}

          {(status === 'COMPLETED' || status === 'KILLED') && results && (
            <ResultsPanel
              results={results}
              logs={logs}
              config={config}
              algorithm={algorithm}
              jobId={jobId}
              onOpenVisualizer={() => setShowVisualizer(true)}
            />
          )}

          {!status && isLoadingDataset && (
            <div className="placeholder">
              <div className="spinner-large" />
              <h2 className="pulsing-text">Loading Agent Plans & Dimensions</h2>
              <p>Parsing dataset files and preparing the visualizer editor...</p>
            </div>
          )}

          {!status && !isLoadingDataset && parsedPlans.length > 0 && (
            <PlanViewer
              parsedPlans={parsedPlans}
              onPlansChange={setParsedPlans}
              visibleAgentNames={isSelectionDone ? selectedAgentNamesList : null}
              visiblePlanIndices={isPlanSelectionDone ? selectedPlanIndicesList : null}
              visibleDimensionIndices={isDimSelectionDone ? selectedDimIndicesList : null}
            />
          )}

          {!status && !isLoadingDataset && parsedPlans.length === 0 && (
            <div className="placeholder">
              <div className="placeholder-icon">⚙️</div>
              <h2>Select a dataset to get started</h2>
              <p>
                Upload <code>.plans</code> files or choose the built-in Privacy dataset,
                then configure the algorithm and click <strong>Run Algorithm</strong>.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>

      {showVisualizer && jobId && (
        <VisualizerApp
          jobId={jobId}
          onClose={() => setShowVisualizer(false)}
        />
      )}
    </>
  )
}

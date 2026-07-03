/**
 * VisualizerCore.jsx
 * Adapted from EPOS-Visualizer/src/App.jsx.
 * Accepts a `dataUrl` prop instead of a hard-coded fetch path.
 * All other logic is identical to the upstream App.jsx.
 *
 * To update: replace all component/hook/util files in this directory
 * with the latest versions from the EPOS-Visualizer repo, then update
 * the single `dataUrl` prop below if the loading pattern changes.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import ControlPanel from "./components/ControlPanel.jsx";
import TreeViewer from "./components/TreeViewer.jsx";
import IterationControls from "./components/IterationControls.jsx";
import MetricConvergenceChart from "./components/MetricConvergenceChart.jsx";
import GlobalResponseChart from "./components/GlobalResponseChart.jsx";
import LocalCostChart from "./components/LocalCostChart.jsx";
import { useExperiment, useDropdownOptions } from "./hooks/useExperiment.js";
import styles from "./App.module.css";

const METRIC_CONFIGS = {
  globalCost: {
    label: "Global Cost",
    title: "Global Cost Convergence",
    yLabel: "Global Cost",
    color: "#a4d673",
    extract: (agents) =>
      agents.reduce((max, a) => Math.max(max, a.complexCost), 0),
  },
  unfairness: {
    label: "Unfairness",
    title: "Unfairness Convergence",
    yLabel: "Unfairness (σ)",
    color: "#f87171",
    extract: (agents) => {
      const costs = agents.map((a) => a.localCost);
      const mean = costs.reduce((s, c) => s + c, 0) / costs.length;
      const variance =
        costs.reduce((s, c) => s + (c - mean) ** 2, 0) / costs.length;
      return Math.sqrt(variance);
    },
  },
  localCost: {
    label: "Local Cost",
    title: "Local Cost Convergence",
    yLabel: "Avg Local Cost",
    color: "#ffffff",
    extract: (agents) =>
      agents.reduce((s, a) => s + a.localCost, 0) / agents.length,
  },
};

const COMPLEX_COST_CONFIG = {
  title: "Complex Cost Convergence",
  yLabel: "Avg Complex Cost",
  color: "#fbbf24",
  extract: (agents) =>
    agents.reduce((s, a) => s + a.complexCost, 0) / agents.length,
};

function getDatasetDisplayName(name) {
  if (!name) return "—";
  if (name === "gaussian_full") return "Gaussian [Full]";
  if (name === "gaussian") return "Gaussian [Subset]";
  if (name === "privacy") return "IoT Data Sharing";
  if (name === "EPOS-BICYCLES" || name.toLowerCase() === "bicycle") return "Bike Sharing";
  if (name.startsWith("Sense10000_")) return "Drone Surveillance";
  if (name === "energy") return "Household Electricity";

  return name;
}

export default function VisualizerCore({ dataUrl, bfGcs, isKilled }) {
  const [experiments, setExperiments] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selection, setSelection] = useState({
    numAgents: 10,
    numPlans: 5,
    alpha: 0.0,
    beta: 0.0,
    treeType: "binary",
    simulation: 1,
  });

  const [iterationA, setIterationA] = useState(0);
  const [iterationB, setIterationB] = useState(0);
  const [isSplit, setIsSplit] = useState(false);

  const [colorMode, setColorMode] = useState("complex");
  const [iterMode, setIterMode] = useState("all");
  const [convergenceMetric, setConvergenceMetric] = useState("globalCost");

  // Load from provided URL (backend API or static file)
  useEffect(() => {
    fetch(dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setExperiments(data.experiments);
        // Auto-select first experiment's params
        if (data.experiments?.length) {
          const first = data.experiments[0].config;
          setSelection((prev) => ({
            ...prev,
            numAgents: first.numAgents,
            numPlans:  first.numPlans,
            alpha:     first.alpha,
            beta:      first.beta,
            simulation: first.numSimulations ?? 1,
            treeType:  (first.numChildren ?? 2) === 3 ? "ternary" : "binary",
          }));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load viz data:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [dataUrl]);

  const experiment = useExperiment(experiments, selection);
  const options = useDropdownOptions(experiments, selection.treeType);

  const activeMetricConfig = METRIC_CONFIGS[convergenceMetric];
  const metricData = useMemo(() => {
    if (!experiment?.iterations) return [];
    return experiment.iterations.slice(0, 10).map((it) => ({
      iter: it.iteration,
      value: activeMetricConfig.extract(it.agents),
    }));
  }, [experiment, activeMetricConfig]);

  const complexCostData = useMemo(() => {
    if (!experiment?.iterations) return [];
    return experiment.iterations.slice(0, 10).map((it) => ({
      iter: it.iteration,
      value: COMPLEX_COST_CONFIG.extract(it.agents),
    }));
  }, [experiment]);

  // Auto-revert tree type if there are no experiments for the selected type
  useEffect(() => {
    if (!experiments?.length) return;
    const hasBinary  = experiments.some(e => !e.id.includes("_ternary"));
    const hasTernary = experiments.some(e =>  e.id.includes("_ternary"));
    if (selection.treeType === "ternary" && !hasTernary && hasBinary) {
      setSelection(prev => ({ ...prev, treeType: "binary" }));
    } else if (selection.treeType === "binary" && !hasBinary && hasTernary) {
      setSelection(prev => ({ ...prev, treeType: "ternary" }));
    }
  }, [experiments, selection.treeType]);

  useEffect(() => {
    if (!experiment && experiments?.length) {
      const isTernarySelected = selection.treeType === "ternary";
      const treeFiltered = experiments.filter((e) => {
        const isTernaryExp = e.id.includes("_ternary");
        return isTernarySelected ? isTernaryExp : !isTernaryExp;
      });
      if (!treeFiltered.length) return;
      const subset = treeFiltered.filter(
        (e) =>
          e.config.numAgents === selection.numAgents &&
          e.config.numPlans === selection.numPlans,
      );
      let fallback = subset[0] || treeFiltered[0];
      const matchAlpha = subset.find(
        (e) => Math.abs(e.config.alpha - selection.alpha) < 0.001,
      );
      const matchBeta = subset.find(
        (e) => Math.abs(e.config.beta - selection.beta) < 0.001,
      );
      if (matchAlpha) fallback = matchAlpha;
      else if (matchBeta) fallback = matchBeta;
      setSelection((prev) => ({
        ...prev,
        numAgents: fallback.config.numAgents,
        numPlans:  fallback.config.numPlans,
        alpha:     fallback.config.alpha,
        beta:      fallback.config.beta,
      }));
    }
  }, [experiment, experiments, selection]);

  useEffect(() => {
    setIterationA(0);
    setIterationB(0);
  }, [experiment?.id]);

  useEffect(() => {
    if (!isSplit) setIterationB(iterationA);
  }, [isSplit]);

  const handleIterChangeA = useCallback((valOrFn) => {
    setIterationA((prev) =>
      typeof valOrFn === "function" ? valOrFn(prev) : valOrFn,
    );
  }, []);
  const handleIterChangeB = useCallback((valOrFn) => {
    setIterationB((prev) =>
      typeof valOrFn === "function" ? valOrFn(prev) : valOrFn,
    );
  }, []);

  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen message={error} />;

  const iterDataA  = experiment?.iterations?.[iterationA];
  const globalCostA = iterDataA
    ? iterDataA.agents.reduce((max, a) => Math.max(max, a.complexCost), 0).toFixed(6)
    : "—";
  const iterDataB   = experiment?.iterations?.[iterationB];
  const globalCostB = iterDataB
    ? iterDataB.agents.reduce((max, a) => Math.max(max, a.complexCost), 0).toFixed(6)
    : "—";

  return (
    <div className={styles.app}>
      <ControlPanel
        selection={selection}
        onSelection={setSelection}
        colorMode={colorMode}
        onColorMode={setColorMode}
        iterMode={iterMode}
        onIterMode={setIterMode}
        isSplit={isSplit}
        onSplitToggle={setIsSplit}
        options={options}
        experiment={experiment}
      />

      <main className={styles.main}>
        <div className={`${styles.treeArea} ${isSplit ? styles.treeAreaSplit : ""}`}>
          <div className={styles.treeHalf}>
            {isSplit && (
              <div className={`${styles.treeBadge} ${styles.badgeA}`}>Panel A</div>
            )}
            <TreeViewer experiment={experiment} iteration={iterationA} colorMode={colorMode} />
          </div>

          {isSplit && (
            <>
              <div className={styles.treeDivider} />
              <div className={styles.treeHalf}>
                <div className={`${styles.treeBadge} ${styles.badgeB}`}>Panel B</div>
                <TreeViewer experiment={experiment} iteration={iterationB} colorMode={colorMode} />
              </div>
            </>
          )}
        </div>

        <aside className={`glass ${styles.sidebar} ${isSplit ? styles.sidebarWide : ""}`}>
          <SidebarInfo
            experiment={experiment}
            iterationA={iterationA}
            iterationB={iterationB}
            globalCostA={globalCostA}
            globalCostB={globalCostB}
            colorMode={colorMode}
            isSplit={isSplit}
            onIterationA={handleIterChangeA}
            onIterationB={handleIterChangeB}
            iterMode={iterMode}
            bfGcs={bfGcs}
            isKilled={isKilled}
          />
        </aside>
      </main>

      <footer className={`${styles.footer} ${isSplit ? styles.footerSplit : ""}`}>
        <div className={styles.convergenceSection}>
          <div className={styles.convergenceLeft}>
            <div className={styles.convergenceDropdown}>
              <select
                value={convergenceMetric}
                onChange={(e) => setConvergenceMetric(e.target.value)}
              >
                {Object.entries(METRIC_CONFIGS).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div className={styles.convergenceChart}>
              <MetricConvergenceChart
                data={metricData}
                title={activeMetricConfig.title}
                showTitle={false}
                yLabel={activeMetricConfig.yLabel}
                color={activeMetricConfig.color}
                activeIterations={isSplit ? [iterationA, iterationB] : [iterationA]}
                onIteration={handleIterChangeA}
                keyIterations={experiment?.keyIterations ?? []}
              />
            </div>
          </div>

          <div className={styles.convergenceRight}>
            <MetricConvergenceChart
              data={complexCostData}
              title={COMPLEX_COST_CONFIG.title}
              yLabel={COMPLEX_COST_CONFIG.yLabel}
              color={COMPLEX_COST_CONFIG.color}
              activeIterations={isSplit ? [iterationA, iterationB] : [iterationA]}
              onIteration={handleIterChangeA}
              keyIterations={experiment?.keyIterations ?? []}
            />
          </div>
        </div>

        <div className={styles.chartArea}>
          <div className={styles.vectorChartContainer}>
            <GlobalResponseChart
              experiment={experiment}
              activeIterations={isSplit ? [iterationA, iterationB] : [iterationA]}
            />
          </div>
          <div className={styles.localCostChartContainer}>
            <LocalCostChart
              experiment={experiment}
              activeIterations={isSplit ? [iterationA, iterationB] : [iterationA]}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

function SidebarInfo({
  experiment, iterationA, iterationB, globalCostA, globalCostB,
  colorMode, isSplit, onIterationA, onIterationB, iterMode,
  bfGcs, isKilled,
}) {
  if (!experiment)
    return <div className={styles.sidebarEmpty}>No experiment selected</div>;
  const { config, iterations } = experiment;

  const iterDataA = iterations[iterationA] ?? iterations[0];
  const agentsA   = iterDataA?.agents || [];
  const iterDataB = isSplit ? (iterations[iterationB] ?? iterations[0]) : null;
  const agentsB   = iterDataB?.agents || [];

  const meanLocalCostA = agentsA.length > 0
    ? agentsA.reduce((s, a) => s + a.localCost, 0) / agentsA.length
    : 0;
  const meanLocalCostB = agentsB.length > 0
    ? agentsB.reduce((s, a) => s + a.localCost, 0) / agentsB.length
    : 0;

  const costLabel = colorMode === "complex" ? "Complex" : (colorMode === "local" ? "Local" : "Unfairness");

  const getRankStr = (gcStr) => {
    if (gcStr === "—" || !bfGcs || bfGcs.length === 0) return null;
    const gcVal = Number(gcStr);
    if (isNaN(gcVal)) return null;

    if (isKilled) {
      if (gcVal < bfGcs[0]) {
        return "Best GC (w.r.t. partial combinations tested)";
      }
      const rank = bfGcs.filter((v) => v < gcVal).length + 1;
      return `${rank} / ${bfGcs.length} (w.r.t. partial results)`;
    } else {
      const rank = bfGcs.filter((v) => v < gcVal).length + 1;
      return `${rank} / ${bfGcs.length}`;
    }
  };

  return (
    <div className={styles.sidebarContent}>
      <div className={styles.sidebarTitle}>Experiment</div>
      <div className={styles.infoGrid}>
        <InfoRow label="Agents"     value={config.numAgents} />
        <InfoRow label="Plans"      value={config.numPlans} />
        <InfoRow label="Iterations" value={config.numIterations} />
        <InfoRow label="Dataset"    value={getDatasetDisplayName(config.dataset)} small />
        <InfoRow label="Algorithm"  value={config.algorithm === 'BRUTE_FORCE' ? 'Brute Force' : (config.algorithm === 'BOTH' ? 'Tree + Brute Force' : 'Tree-Based')} />
      </div>

      <div className={styles.sidebarIterSection}>
        <div className={styles.sidebarDivider} />
        <div className={styles.sidebarTitle}>{isSplit ? "Panel A" : "Panel"}</div>
        <IterationControls
          experiment={experiment}
          iteration={iterationA}
          onIteration={onIterationA}
          iterMode={iterMode}
        />
        {isSplit && (
          <>
            <div className={styles.sidebarTitle} style={{ marginTop: 4 }}>Panel B</div>
            <IterationControls
              experiment={experiment}
              iteration={iterationB}
              onIteration={onIterationB}
              iterMode={iterMode}
            />
          </>
        )}
      </div>

      <div className={styles.sidebarDivider} />
      <div className={styles.sidebarTitle}>{isSplit ? "Current States" : "Current State"}</div>
      <div className={styles.infoGrid}>
        <InfoRow label={isSplit ? "Iter A" : "Iteration"} value={iterationA} labelAccent={isSplit ? "purple" : null} />
        <InfoRow label={isSplit ? "Cost A" : "Global Cost"} value={globalCostA} accent />
        {bfGcs && bfGcs.length > 0 && (
          <InfoRow label={isSplit ? "Best BF GC A" : "Best BF GC"} value={bfGcs[0].toFixed(6) + (isKilled ? " (w.r.t. partial results)" : "")} />
        )}
        {bfGcs && bfGcs.length > 0 && globalCostA !== "—" && (
          <InfoRow label={isSplit ? "Rank A" : "GC Rank"} value={getRankStr(globalCostA)} small />
        )}
        {isSplit && (
          <>
            <InfoRow label="Iter B" value={iterationB} labelAccent="teal" />
            <InfoRow label="Cost B" value={globalCostB} accent="teal" />
            {bfGcs && bfGcs.length > 0 && (
              <InfoRow label="Best BF GC B" value={bfGcs[0].toFixed(6) + (isKilled ? " (w.r.t. partial results)" : "")} />
            )}
            {bfGcs && bfGcs.length > 0 && globalCostB !== "—" && (
              <InfoRow label="Rank B" value={getRankStr(globalCostB)} small />
            )}
          </>
        )}
      </div>

      <div className={`${styles.agentTableContainer} ${isSplit ? styles.tableContainerSplit : ""}`}>
        <div className={`${styles.agentTableHeader} ${isSplit ? styles.tableHeaderSplit : ""}`}>
          <span>Agent</span>
          <span className={isSplit ? styles.headerA : ""}>{isSplit ? "Plan A" : "Plan"}</span>
          {isSplit && <span className={styles.headerB}>Plan B</span>}
          <span className={isSplit ? styles.headerA : ""} style={{ textAlign: "right" }}>
            {isSplit ? "Cost A" : costLabel}
          </span>
          {isSplit && <span className={styles.headerB} style={{ textAlign: "right" }}>Cost B</span>}
        </div>
        <div className={styles.agentTableBody}>
          {agentsA.map((a, i) => {
            const b = isSplit ? agentsB[i] : null;
            const changed = isSplit && b && a.plan !== b.plan;
            const getCostVal = (agent, meanCost) => {
              if (colorMode === "complex") return agent.complexCost;
              if (colorMode === "local") return agent.localCost;
              return Math.abs(agent.localCost - meanCost);
            };
            const costA = getCostVal(a, meanLocalCostA).toFixed(4);
            const costB = b ? getCostVal(b, meanLocalCostB).toFixed(4) : null;
            return (
              <div
                key={a.id}
                className={`${styles.agentTableRow} ${isSplit ? styles.tableRowSplit : ""} ${changed ? styles.rowChanged : ""}`}
              >
                <span className={styles.agentId}>{a.id}</span>
                <span className={`${styles.agentPlan} ${isSplit ? styles.planA : ""}`} title={`Plan ${a.plan}`}>
                  {isSplit ? a.plan : `Plan ${a.plan}`}
                </span>
                {isSplit && <span className={`${styles.agentPlan} ${styles.planB}`} title={`Plan ${b.plan}`}>{b.plan}</span>}
                <span className={`${styles.agentCost} ${isSplit ? styles.costA : ""}`}>{costA}</span>
                {isSplit && <span className={`${styles.agentCost} ${styles.costB}`}>{costB}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, accent, labelAccent, small }) {
  let valClass = styles.infoValue;
  if (accent === true || accent === "purple") valClass += ` ${styles.infoAccent}`;
  if (accent === "teal") valClass += ` ${styles.infoAccentTeal}`;
  if (small) valClass += ` ${styles.infoSmall}`;

  let labClass = styles.infoLabel;
  if (labelAccent === "teal") labClass += ` ${styles.infoAccentTeal}`;
  else if (labelAccent === "purple") labClass += ` ${styles.infoAccent}`;

  return (
    <>
      <span className={labClass}>{label}</span>
      <span className={valClass}>{value}</span>
    </>
  );
}

function LoadingScreen() {
  return (
    <div className={styles.fullScreen}>
      <div className={styles.loadingSpinner} />
      <p>Loading visualization data…</p>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className={styles.fullScreen}>
      <div className={styles.errorIcon}>⚠</div>
      <p>Failed to load data: {message}</p>
    </div>
  );
}

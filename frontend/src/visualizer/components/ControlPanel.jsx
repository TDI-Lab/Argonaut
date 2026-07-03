/**
 * ControlPanel.jsx
 * Top navigation bar with dropdowns (agents, plans, α, β),
 * color mode toggle (Complex Cost / Local Cost),
 * iteration mode toggle (All / Key Changes Only),
 * and split screen comparison toggle.
 */
import styles from "./ControlPanel.module.css";

/**
 * @param {Object} props
 * @param {Object}   props.selection     - current { numAgents, numPlans, alpha, beta }
 * @param {Function} props.onSelection   - callback(newSelection)
 * @param {string}   props.colorMode     - 'complex' | 'local'
 * @param {Function} props.onColorMode   - callback(mode)
 * @param {string}   props.iterMode      - 'all' | 'key'
 * @param {Function} props.onIterMode    - callback(mode)
 * @param {boolean}  props.isSplit       - true if split screen is active
 * @param {Function} props.onSplitToggle - callback(isSplit)
 * @param {Object}   props.options       - { agentCounts, planCounts, alphas, betas }
 * @param {Object|null} props.experiment - the currently selected experiment (for gamma display)
 */
export default function ControlPanel({
  selection,
  onSelection,
  colorMode,
  onColorMode,
  iterMode,
  onIterMode,
  isSplit,
  onSplitToggle,
  options,
  experiment,
}) {
  const { agentCounts = [], planCounts = [], alphaBetas = [], simulations = [] } = options;

  // Derived gamma = 1 - α - β
  const gamma = experiment
    ? (1 - experiment.config.alpha - experiment.config.beta).toFixed(2)
    : "—";

  function handleChange(key, value) {
    onSelection((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <header className={`glass ${styles.panel}`}>
      <div className={styles.brand}>
        <span className={styles.brandIcon}>◉</span>
        <span className={styles.brandName}>
          Argonaut:<span className={styles.brandSub}> Discrete Choice Optimization Visualizer</span>
        </span>
      </div>

      <div className={styles.controls}>
        {/* ---- Tree Type ---- */}
        <div className={styles.field}>
          <div className="field-label">Tree Type</div>
          <div className="seg-group">
            <button
              className={`seg-btn ${selection.treeType === "binary" ? "active" : ""}`}
              onClick={() => handleChange("treeType", "binary")}
              id="btn-tree-binary"
            >
              Binary
            </button>
            <button
              className={`seg-btn ${selection.treeType === "ternary" ? "active" : ""}`}
              onClick={() => handleChange("treeType", "ternary")}
              id="btn-tree-ternary"
            >
              Ternary
            </button>
          </div>
        </div>

        {/* ---- Agents ---- */}
        <div className={styles.field}>
          <div className="field-label">Agents</div>
          <select
            value={selection.numAgents}
            onChange={(e) => handleChange("numAgents", Number(e.target.value))}
            id="select-agents"
          >
            {agentCounts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* ---- Plans ---- */}
        <div className={styles.field}>
          <div className="field-label">Plans</div>
          <select
            value={selection.numPlans}
            onChange={(e) => handleChange("numPlans", Number(e.target.value))}
            id="select-plans"
          >
            {planCounts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* ---- Simulation ---- */}
        <div className={styles.field}>
          <div className="field-label">Simulation</div>
          <select
            value={selection.simulation}
            onChange={(e) => handleChange("simulation", Number(e.target.value))}
            id="select-simulation"
          >
            {simulations.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* ---- Weights ---- */}
        <div className={styles.field}>
          <div className="field-label">Weights (α, β, γ)</div>
          <select
            value={`${selection.alpha},${selection.beta}`}
            onChange={(e) => {
              const [a, b] = e.target.value.split(",").map(Number);
              handleChange("alpha", a);
              handleChange("beta", b);
            }}
            id="select-weights"
          >
            {alphaBetas.map(({ alpha, beta }) => {
              const g = (1 - alpha - beta).toFixed(1);
              return (
                <option key={`${alpha},${beta}`} value={`${alpha},${beta}`}>
                  α={alpha.toFixed(1)} / β={beta.toFixed(1)} / γ={g}
                </option>
              );
            })}
          </select>
        </div>

        <div className={styles.divider} />

        {/* ---- Split Compare ---- */}
        <div className={styles.field}>
          <div className="field-label">View</div>
          <div className="seg-group">
            <button
              className={`seg-btn ${!isSplit ? "active" : ""}`}
              onClick={() => onSplitToggle(false)}
              id="btn-view-single"
            >
              Single
            </button>
            <button
              className={`seg-btn ${isSplit ? "active" : ""}`}
              onClick={() => onSplitToggle(true)}
              id="btn-view-split"
            >
              Compare
            </button>
          </div>
        </div>

        {/* ---- Color mode ---- */}
        <div className={styles.field}>
          <div className="field-label">Color by</div>
          <div className="seg-group">
            <button
              className={`seg-btn ${colorMode === "complex" ? "active" : ""}`}
              onClick={() => onColorMode("complex")}
              id="btn-color-complex"
            >
              Complex Cost
            </button>
            <button
              className={`seg-btn ${colorMode === "local" ? "active" : ""}`}
              onClick={() => onColorMode("local")}
              id="btn-color-local"
            >
              Local Cost
            </button>
            <button
              className={`seg-btn ${colorMode === "unfairness" ? "active" : ""}`}
              onClick={() => onColorMode("unfairness")}
              id="btn-color-unfairness"
            >
              Unfairness
            </button>
          </div>
        </div>

        {/* ---- Iteration mode ---- */}
        <div className={styles.field}>
          <div className="field-label">Iterations</div>
          <div className="seg-group">
            <button
              className={`seg-btn ${iterMode === "all" ? "active" : ""}`}
              onClick={() => onIterMode("all")}
              id="btn-iter-all"
            >
              All
            </button>
            <button
              className={`seg-btn ${iterMode === "key" ? "active" : ""}`}
              onClick={() => onIterMode("key")}
              id="btn-iter-key"
            >
              Key Changes
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

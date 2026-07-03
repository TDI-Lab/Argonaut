/**
 * NodeDetailPanel.jsx
 * Floating glassmorphism card showing persistent details
 * for a selected tree node / agent.
 *
 * Slides in from the left side when a node is clicked.
 */
import styles from './NodeDetailPanel.module.css'

/**
 * @param {Object}   props
 * @param {Object}   props.node      - selected node data { id, plan, localCost, complexCost, depth, isRoot, isLeaf, parent, childrenIds }
 * @param {Object}   props.config    - experiment config (numAgents, numPlans, alpha, beta, …)
 * @param {Function} props.onClose   - callback to deselect / close
 */
export default function NodeDetailPanel({ node, config, onClose }) {
  if (!node) return null

  const gamma = (1 - (config.alpha ?? 0) - (config.beta ?? 0)).toFixed(2)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.nodeIcon}>
            {node.isRoot ? '◉' : node.isLeaf ? '○' : '◎'}
          </span>
          <div>
            <div className={styles.title}>Agent {node.id}</div>
            <div className={styles.subtitle}>
              {node.isRoot ? 'Root Node' : node.isLeaf ? 'Leaf Node' : `Depth ${node.depth}`}
            </div>
          </div>
        </div>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close detail panel"
          id="btn-close-node-detail"
        >
          ✕
        </button>
      </div>

      <div className={styles.divider} />

      {/* Cost Metrics */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Cost Metrics</div>
        <div className={styles.metricGrid}>
          <MetricCard
            label="Local Cost"
            value={node.localCost?.toFixed(4) ?? '—'}
            color="#fbbf24"
          />
          <MetricCard
            label="Complex Cost"
            value={node.complexCost?.toFixed(4) ?? '—'}
            color="#a388ff"
          />
        </div>
      </div>

      <div className={styles.divider} />

      {/* Plan & Topology */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Plan & Topology</div>
        <div className={styles.infoGrid}>
          <InfoRow label="Selected Plan" value={node.plan ?? '—'} />
          <InfoRow label="Tree Depth" value={node.depth} />
          <InfoRow label="Parent" value={node.parent !== null && node.parent !== undefined ? `Agent ${node.parent}` : '—'} />
          <InfoRow label="Children" value={node.childrenIds?.length > 0 ? node.childrenIds.join(', ') : 'None (leaf)'} />
        </div>
      </div>

      <div className={styles.divider} />

      {/* Experiment Context */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Experiment Context</div>
        <div className={styles.infoGrid}>
          <InfoRow label="Total Agents" value={config.numAgents} />
          <InfoRow label="Available Plans" value={config.numPlans} />
          <InfoRow label="α (local)" value={config.alpha?.toFixed(1) ?? '—'} />
          <InfoRow label="β (unfair)" value={config.beta?.toFixed(1) ?? '—'} />
          <InfoRow label="γ (global)" value={gamma} />
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue} style={{ color }}>
        {value}
      </div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{value}</span>
    </>
  )
}

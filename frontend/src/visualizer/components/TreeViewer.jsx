/**
 * TreeViewer.jsx
 * Displays the EPOS agent tree as an interactive D3.js radial visualization.
 * Replaces the previous static PNG approach with a dynamic SVG rendering
 * that supports zoom, pan, hover tooltips, and click-to-select.
 */
import { useState, useCallback } from 'react'
import RadialTree from './RadialTree.jsx'
import NodeDetailPanel from './NodeDetailPanel.jsx'
import styles from './TreeViewer.module.css'

/**
 * @param {Object}   props.experiment - full experiment object from JSON
 * @param {number}   props.iteration
 * @param {string}   props.colorMode  - 'complex' | 'local'
 */
export default function TreeViewer({ experiment, iteration, colorMode }) {
  const [selectedNode, setSelectedNode] = useState(null)

  const handleNodeSelect = useCallback((nodeData) => {
    setSelectedNode(nodeData)
  }, [])

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null)
  }, [])

  if (!experiment) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>⌀</div>
        <p>Select an experiment from the controls above.</p>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <RadialTree
        experiment={experiment}
        iteration={iteration}
        colorMode={colorMode}
        selectedNodeId={selectedNode?.id ?? null}
        onNodeSelect={handleNodeSelect}
      />

      <NodeDetailPanel
        node={selectedNode}
        config={experiment.config}
        onClose={handleClosePanel}
      />
    </div>
  )
}

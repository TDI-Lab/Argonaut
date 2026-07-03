/**
 * RadialTree.jsx
 * Interactive D3.js radial tree visualization for EPOS agent trees.
 *
 * Features:
 *  - Radial (polar) layout with root at center
 *  - Zoom & pan via d3.zoom
 *  - Hover tooltips showing agent details
 *  - Click-to-select with path-to-root highlighting
 *  - Smooth animated transitions on data change
 *  - Color mapping:
 *      Complex Cost: white → lavender/purple (based on cost value)
 *      Local Cost:   yellow → orange → red/crimson (based on cost value)
 *  - Root node: green glow ring (fill follows cost color scale like all nodes)
 *  - All nodes are uniform size (no depth-based sizing)
 */
import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import * as d3 from 'd3'
import { buildFullHierarchy, buildVisibleHierarchy, computeRadialLayoutForHierarchy, nodeRadius } from '../utils/treeLayout.js'
import styles from './RadialTree.module.css'

/* ── Color Scales ────────────────────────────────────────────────── */

/** Complex cost: white (0) → light green → dark green */
const complexColorScale = d3.scaleSequential()
  .interpolator(d3.interpolateRgbBasis([
    '#80deea',    // clear light cyan-blue (beautiful contrast on green background)
    '#62b9a7',    // teal
    '#48976c',    // medium green
    '#2d7237',    // dark green
    '#174f17',    // very dark green
  ]))

/** Local cost: pale orange → orange → red/crimson */
const localColorScale = d3.scaleSequential()
  .interpolator(d3.interpolateRgbBasis([
    '#fcaa7c',    // clear light orange/peach (non-whitish)
    '#f58051',    // orange
    '#e3523f',    // red-orange
    '#c42121',    // red
    '#8a0303',    // crimson/dark red
  ]))

/** Unfairness cost: light pinkish/orange → red/crimson */
const unfairnessColorScale = d3.scaleSequential()
  .interpolator(d3.interpolateRgbBasis([
    '#fee5d9',
    '#fcbba1',
    '#fc9272',
    '#fb6a4a',
    '#de2d26',
  ]))

/**
 * Returns '#000' for light backgrounds, '#fff' for dark backgrounds.
 * Uses relative luminance (WCAG formula) to decide contrast.
 */
function getLabelColor(bgColor) {
  const c = d3.color(bgColor)
  if (!c) return '#fff'
  // Relative luminance
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.45 ? '#000' : '#fff'
}

/**
 * @param {Object}   props
 * @param {Object}   props.experiment  - full experiment object
 * @param {number}   props.iteration   - current iteration index
 * @param {string}   props.colorMode   - 'complex' | 'local'
 * @param {number|null}   props.selectedNodeId - currently selected node ID
 * @param {Function} props.onNodeSelect - callback(agentData | null)
 */
export default function RadialTree({
  experiment,
  iteration,
  colorMode,
  selectedNodeId,
  onNodeSelect,
}) {
  const svgRef = useRef(null)
  const gRef = useRef(null)      // the inner <g> that gets zoomed
  const zoomRef = useRef(null)   // persisted d3.zoom behavior
  const tooltipRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const containerRef = useRef(null)
  const centeredRef = useRef(false) // track whether we've done initial centering
  const prevStructureRef = useRef(null) // track previous numAgents+numChildren to detect structure changes

  const { config, iterations } = experiment
  const numAgents = config.numAgents
  const numChildren = config.numChildren || 2
  const iterData = iterations[iteration] ?? iterations[0]
  const agents = iterData?.agents || []

  // Build agent lookup map: agentId → agent data
  const agentMap = useMemo(() => {
    const m = new Map()
    agents.forEach(a => m.set(a.id, a))
    return m
  }, [agents])

  // React state for collapsed nodes (stores agent IDs that are collapsed)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState(new Set())

  // Compute full tree hierarchy
  const fullHierarchy = useMemo(() => {
    return buildFullHierarchy(numAgents, numChildren)
  }, [numAgents, numChildren])

  // Reset and auto-collapse nodes at depth >= 3 initially for large datasets (> 120 agents)
  useEffect(() => {
    const initialCollapsed = new Set()
    if (numAgents > 120) {
      fullHierarchy.descendants().forEach(d => {
        if (d.depth === 3 && d.children) {
          initialCollapsed.add(d.data.id)
        }
      })
    }
    setCollapsedNodeIds(initialCollapsed)
  }, [fullHierarchy, numAgents])

  // Filter full hierarchy to visible nodes
  const visibleHierarchy = useMemo(() => {
    return buildVisibleHierarchy(fullHierarchy, collapsedNodeIds)
  }, [fullHierarchy, collapsedNodeIds])

  // Compute coordinates only for visible nodes
  const layout = useMemo(() => {
    return computeRadialLayoutForHierarchy(visibleHierarchy, numAgents)
  }, [visibleHierarchy, numAgents])

  // Node lookup for parent-path tracing
  const nodeMap = useMemo(() => {
    const m = new Map()
    layout.nodes.forEach(n => m.set(n.id, n))
    return m
  }, [layout])

  // Compute the path from a node to the root
  const pathToRoot = useCallback((nodeId) => {
    const path = []
    let current = nodeId
    while (current !== null) {
      path.push(current)
      const node = nodeMap.get(current)
      current = node ? node.parent : null
    }
    return path
  }, [nodeMap])

  // Set of node IDs in the selected path
  const selectedPath = useMemo(() => {
    if (selectedNodeId === null || selectedNodeId === undefined) return new Set()
    return new Set(pathToRoot(selectedNodeId))
  }, [selectedNodeId, pathToRoot])

  // Compute mean local cost for iterations
  const meanLocalCost = useMemo(() => {
    if (agents.length === 0) return 0
    return agents.reduce((s, a) => s + a.localCost, 0) / agents.length
  }, [agents])

  // Color scale domain based on current iteration data
  const colorScale = useMemo(() => {
    let scale
    if (colorMode === 'complex') {
      scale = complexColorScale.copy()
    } else if (colorMode === 'local') {
      scale = localColorScale.copy()
    } else {
      scale = unfairnessColorScale.copy()
    }

    const values = agents.map(a => {
      if (colorMode === 'complex') return a.complexCost
      if (colorMode === 'local') return a.localCost
      return Math.abs(a.localCost - meanLocalCost)
    })

    if (values.length === 0) return scale.domain([0, 1])
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    return scale.domain([minVal, maxVal === minVal ? minVal + 1 : maxVal])
  }, [agents, colorMode, meanLocalCost])

  // Get fill color for a node
  const getNodeColor = useCallback((agentId) => {
    const agent = agentMap.get(agentId)
    if (!agent) return '#4a5280'
    const val = colorMode === 'complex' 
      ? agent.complexCost 
      : (colorMode === 'local' ? agent.localCost : Math.abs(agent.localCost - meanLocalCost))
    return colorScale(val)
  }, [agentMap, colorMode, colorScale, meanLocalCost])

  // ── Zoom & Pan Setup + Auto-center ────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const svg = d3.select(svgRef.current)
    const g = d3.select(gRef.current)

    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })

    svg.call(zoom)
    zoomRef.current = zoom

    // Center the tree on initial load
    const centerTree = () => {
      const rect = containerRef.current.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const initialTransform = d3.zoomIdentity.translate(cx, cy)
      svg.call(zoom.transform, initialTransform)
    }

    // Center immediately
    centerTree()
    centeredRef.current = true

    // Reset zoom on double-click → re-center
    svg.on('dblclick.zoom', () => {
      const rect = containerRef.current.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      svg.transition()
        .duration(600)
        .call(zoom.transform, d3.zoomIdentity.translate(cx, cy))
    })

    // Re-center on resize
    const resizeObserver = new ResizeObserver(() => {
      if (!centeredRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      // Only re-center if user hasn't panned
      const currentTransform = d3.zoomTransform(svgRef.current)
      if (currentTransform.k === 1) {
        svg.call(zoom.transform, d3.zoomIdentity.translate(cx, cy))
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      svg.on('.zoom', null)
      resizeObserver.disconnect()
    }
  }, [])

  // Re-center when experiment/tree structure changes
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !zoomRef.current) return
    const svg = d3.select(svgRef.current)
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    svg.transition()
      .duration(600)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(cx, cy))
  }, [numAgents, numChildren])

  // ── Render / Update the D3 tree ────────────────────────────────
  useEffect(() => {
    if (!gRef.current || !layout || agents.length === 0) return

    const g = d3.select(gRef.current)
    const r = nodeRadius(0, 0, layout.nodes.length) // uniform radius scaled dynamically based on visible count

    // Detect tree structure change — if numAgents or numChildren changed,
    // clear everything and re-render fresh to avoid stale DOM elements
    const structureKey = `${numAgents}-${numChildren}`
    if (prevStructureRef.current && prevStructureRef.current !== structureKey) {
      g.selectAll('*').remove()
    }
    prevStructureRef.current = structureKey

    // ── Links ──
    const linkSelection = g.selectAll('.tree-link')
      .data(layout.links, d => `${d.source.id}-${d.target.id}`)

    // Enter
    const linkEnter = linkSelection.enter()
      .append('line')
      .attr('class', 'tree-link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.source.x)
      .attr('y2', d => d.source.y)
      .attr('stroke', 'rgba(255,255,255,0.45)')
      .attr('stroke-width', 2)

    // Update
    linkSelection.merge(linkEnter)
      .transition('layout')
      .duration(800)
      .ease(d3.easeCubicInOut)
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)

    linkSelection.exit()
      .transition('layout')
      .duration(400)
      .attr('opacity', 0)
      .remove()

    // ── Node Groups ──
    const nodeSelection = g.selectAll('.tree-node')
      .data(layout.nodes, d => d.id)

    // Enter
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'tree-node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .attr('opacity', 0)

    // Outer ring circle (uniform radius, customized stroke in merge update)
    nodeEnter.append('circle')
      .attr('class', 'node-outer')
      .attr('fill', 'none')

    // Inner fill circle (uniform radius)
    nodeEnter.append('circle')
      .attr('class', 'node-inner')
      .attr('r', r)

    // Root glow ring (only for root on enter)
    nodeEnter.filter(d => d.isRoot)
      .append('circle')
      .attr('class', 'node-root-glow')
      .attr('r', r + 8)
      .attr('fill', 'none')
      .attr('stroke', '#e8c873')
      .attr('stroke-width', 3)
      .attr('opacity', 0.8)

    // Agent ID label on each node (uniform font size)
    nodeEnter.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', d => getLabelColor(getNodeColor(d.id)))
      .attr('font-weight', 600)
      .attr('font-family', 'Inter, sans-serif')
      .attr('pointer-events', 'none')
      .text(d => d.id)

    // Invisible hit area for easier hover/click
    nodeEnter.append('circle')
      .attr('class', 'node-hitarea')
      .attr('r', Math.max(r + 8, 16))
      .attr('fill', 'transparent')
      .attr('stroke', 'none')
      .style('cursor', 'pointer')

    // ── Merge (enter + update) ──
    const allNodes = nodeSelection.merge(nodeEnter)

    // Animate positions
    allNodes.transition('layout')
      .duration(800)
      .ease(d3.easeCubicInOut)
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .attr('opacity', 1)

    // Update outer ring properties - Collapsed nodes have a beautiful glowing gold dashed border
    allNodes.select('.node-outer')
      .transition('style')
      .duration(400)
      .attr('r', d => d.isCollapsed ? r + 5 : r + 3)
      .attr('stroke', d => d.isCollapsed ? '#fbbf24' : '#fff')
      .attr('stroke-width', d => d.isCollapsed ? 2 : 1.5)
      .attr('stroke-dasharray', d => d.isCollapsed ? '3 2' : 'none')
      .attr('opacity', d => d.isCollapsed ? 0.95 : 0.6)

    // Update inner circle properties
    allNodes.select('.node-inner')
      .transition('color')
      .duration(600)
      .attr('r', r)
      .attr('fill', d => getNodeColor(d.id))
      .attr('stroke', 'rgba(255,255,255,0.4)')
      .attr('stroke-width', 1)

    // Update labels
    allNodes.select('.node-label')
      .transition('color')
      .duration(600)
      .attr('fill', d => getLabelColor(getNodeColor(d.id)))
      .attr('font-size', Math.max(r * 0.85, 8) + 'px')

    // Ensure root glow ring is correct on update:
    allNodes.filter(d => !d.isRoot).select('.node-root-glow').remove()
    allNodes.filter(d => d.isRoot).each(function() {
      if (d3.select(this).select('.node-root-glow').empty()) {
        d3.select(this).insert('circle', '.node-hitarea')
          .attr('class', 'node-root-glow')
          .attr('r', r + 8)
          .attr('fill', 'none')
          .attr('stroke', '#e8c873')
          .attr('stroke-width', 3)
          .attr('opacity', 0.8)
      }
    })

    // Exit
    nodeSelection.exit()
      .transition('layout')
      .duration(400)
      .attr('opacity', 0)
      .remove()

    // ── Hover events ──
    allNodes.select('.node-hitarea')
      .on('mouseenter', function(event, d) {
        const agent = agentMap.get(d.id)
        const svgRect = svgRef.current.getBoundingClientRect()
        const nodeGroup = this.parentNode
        const ctm = nodeGroup.getScreenCTM()
        const tipX = ctm.e - svgRect.left + 20
        const tipY = ctm.f - svgRect.top - 10

        setTooltip({
          x: tipX,
          y: tipY,
          agentId: d.id,
          plan: agent?.plan,
          localCost: agent?.localCost,
          complexCost: agent?.complexCost,
          depth: d.depth,
          isRoot: d.isRoot,
          isLeaf: d.isLeaf,
          hasChildren: d.hasChildren,
          isCollapsed: d.isCollapsed,
          totalDescendants: d.totalDescendants,
        })

        // Scale up the inner circle
        d3.select(nodeGroup).select('.node-inner')
          .transition()
          .duration(200)
          .attr('r', r * 1.3)

        // Scale up outer border
        d3.select(nodeGroup).select('.node-outer')
          .transition()
          .duration(200)
          .attr('r', (d.isCollapsed ? r + 5 : r + 3) * 1.3)
          .attr('stroke', d.isCollapsed ? '#fbbf24' : '#688f4e')
          .attr('opacity', 1)
      })
      .on('mouseleave', function(event, d) {
        setTooltip(null)
        const nodeGroup = this.parentNode
        d3.select(nodeGroup).select('.node-inner')
          .transition()
          .duration(200)
          .attr('r', r)

        d3.select(nodeGroup).select('.node-outer')
          .transition()
          .duration(200)
          .attr('r', d.isCollapsed ? r + 5 : r + 3)
          .attr('stroke', d.isCollapsed ? '#fbbf24' : '#fff')
          .attr('opacity', d.isCollapsed ? 0.95 : 0.6)
      })
      .on('click', function(event, d) {
        event.stopPropagation()
        
        // Toggle expansion if it has hidden children in full tree
        if (d.hasChildren) {
          setCollapsedNodeIds(prev => {
            const next = new Set(prev)
            if (next.has(d.id)) {
              next.delete(d.id) // Expand
            } else {
              next.add(d.id)    // Collapse
            }
            return next
          })
        }

        const agent = agentMap.get(d.id)
        if (selectedNodeId === d.id) {
          onNodeSelect(null)
        } else {
          onNodeSelect({
            ...d,
            plan: agent?.plan,
            localCost: agent?.localCost,
            complexCost: agent?.complexCost,
          })
        }
      })

  }, [layout, agents, colorMode, numAgents, getNodeColor, agentMap, selectedNodeId, onNodeSelect, collapsedNodeIds])

  // ── Highlight selected path ────────────────────────────────────
  useEffect(() => {
    if (!gRef.current) return
    const g = d3.select(gRef.current)

    // Update link highlighting
    g.selectAll('.tree-link')
      .transition('highlight')
      .duration(400)
      .attr('stroke', d => {
        if (selectedPath.has(d.source.id) && selectedPath.has(d.target.id)) {
          return '#688f4e'
        }
        return 'rgba(255,255,255,0.45)'
      })
      .attr('stroke-width', d => {
        if (selectedPath.has(d.source.id) && selectedPath.has(d.target.id)) {
          return 3
        }
        return 2
      })
      .attr('opacity', d => {
        if (selectedPath.size > 0) {
          if (selectedPath.has(d.source.id) && selectedPath.has(d.target.id)) {
            return 1
          }
          return 0.3
        }
        return 1
      })

    // Dim non-path nodes when a path is selected
    g.selectAll('.tree-node')
      .transition('highlight')
      .duration(400)
      .attr('opacity', d => {
        if (selectedPath.size > 0) {
          return selectedPath.has(d.id) ? 1 : 0.25
        }
        return 1
      })

    // Add selection ring (uniform radius)
    const selR = nodeRadius(0, 0, layout.nodes.length)
    g.selectAll('.node-select-ring').remove()
    if (selectedNodeId !== null && selectedNodeId !== undefined) {
      const selectedGroup = g.selectAll('.tree-node')
        .filter(d => d.id === selectedNodeId)

      selectedGroup.append('circle')
        .attr('class', 'node-select-ring')
        .attr('r', selR + 12)
        .attr('fill', 'none')
        .attr('stroke', '#688f4e')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4 2')
        .attr('opacity', 0)
        .transition()
        .duration(400)
        .attr('opacity', 0.85)
        .attr('r', selR + 7)
    }
  }, [selectedPath, selectedNodeId, layout])

  // Click background to deselect
  const handleSvgClick = useCallback(() => {
    if (selectedNodeId !== null && selectedNodeId !== undefined) {
      onNodeSelect(null)
    }
  }, [selectedNodeId, onNodeSelect])

  return (
    <div className={styles.container} ref={containerRef}>
      <svg
        ref={svgRef}
        className={styles.svg}
        onClick={handleSvgClick}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g ref={gRef} />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          ref={tooltipRef}
          className={styles.tooltip}
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <div className={styles.tooltipHeader}>
            Agent {tooltip.agentId}
            {tooltip.isRoot && <span className={styles.tooltipBadge}>Root</span>}
            {tooltip.isLeaf && !tooltip.hasChildren && <span className={styles.tooltipBadgeLeaf}>Leaf</span>}
            {tooltip.hasChildren && tooltip.isCollapsed && <span className={styles.tooltipBadgeCollapsed}>Collapsed</span>}
          </div>
          <div className={styles.tooltipGrid}>
            <span className={styles.tooltipLabel}>Plan</span>
            <span className={styles.tooltipValue}>{tooltip.plan ?? '—'}</span>
            <span className={styles.tooltipLabel}>Local Cost</span>
            <span className={styles.tooltipValue}>
              {tooltip.localCost != null ? tooltip.localCost.toFixed(4) : '—'}
            </span>
            <span className={styles.tooltipLabel}>Complex Cost</span>
            <span className={styles.tooltipValue}>
              {tooltip.complexCost != null ? tooltip.complexCost.toFixed(4) : '—'}
            </span>
            <span className={styles.tooltipLabel}>Depth</span>
            <span className={styles.tooltipValue}>{tooltip.depth}</span>
            {tooltip.hasChildren && tooltip.isCollapsed && (
              <>
                <span className={styles.tooltipLabel}>Hidden Agents</span>
                <span className={styles.tooltipValue} style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                  +{tooltip.totalDescendants}
                </span>
              </>
            )}
          </div>
          {tooltip.hasChildren && (
            <div className={styles.tooltipPrompt}>
              {tooltip.isCollapsed ? '💡 Click node to expand branch' : '💡 Click node to collapse branch'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * treeLayout.js
 * Computes pixel-space node positions for the EPOS agent tree,
 * matching the hierarchical layout used in the PNG images.
 *
 * EPOS builds a balanced binary tree where:
 *   - The root is the highest-indexed agent (numAgents - 1)
 *   - BFS position p corresponds to agent (numAgents - 1 - p)
 *   - Children of BFS position p are at positions p*k+1 … p*k+k
 *
 * We use d3.tree() to produce an orderly layout, then scale it
 * to fit the visible canvas area.
 */
import * as d3 from 'd3'

/**
 * Build a d3-compatible hierarchy from EPOS tree edges.
 * @param {number} numAgents
 * @param {number} numChildren - branching factor (usually 2)
 * @returns {Object} d3 hierarchy node
 */
function buildHierarchy(numAgents, numChildren = 2) {
  const root = numAgents - 1  // root agent ID

  function makeNode(agentId, pos) {
    const children = []
    for (let c = 1; c <= numChildren; c++) {
      const childPos = pos * numChildren + c
      if (childPos < numAgents) {
        const childAgentId = numAgents - 1 - childPos
        children.push(makeNode(childAgentId, childPos))
      }
    }
    return { id: agentId, children: children.length ? children : undefined }
  }

  return d3.hierarchy(makeNode(root, 0))
}

/**
 * Compute pixel positions for all nodes that match the PNG image layout.
 * Returns a Map from agentId -> { x, y }.
 *
 * @param {number} numAgents
 * @param {number} numChildren
 * @param {number} width  - container width in pixels
 * @param {number} height - container height in pixels
 * @returns {Map<number, {x: number, y: number, depth: number, isRoot: boolean, isLeaf: boolean}>}
 */
export function computeNodePositions(numAgents, numChildren, width, height) {
  const hier = buildHierarchy(numAgents, numChildren)

  // Use d3.tree for an orthogonal layout; we then rotate it 90°
  // so the root is at top-center, matching the PNG orientation
  const treeLayout = d3.tree()
    .size([width * 0.82, height * 0.70])  // leave margins
    .separation((a, b) => (a.parent === b.parent ? 1.2 : 2))

  const rooted = treeLayout(hier)
  const maxDepth = Math.max(...rooted.descendants().map(d => d.depth))

  const positions = new Map()
  rooted.descendants().forEach(node => {
    positions.set(node.data.id, {
      // Center the tree horizontally; push it down from top by ~8%
      x: node.x + width * 0.09,
      y: node.y + height * 0.07,
      depth: node.depth,
      isRoot: node.depth === 0,
      isLeaf: !node.children,
      maxDepth,
    })
  })

  return positions
}

/**
 * Compute radius for a node.
 * Returns a UNIFORM size for all nodes (regardless of depth).
 * Only varies by total agent count to prevent overlap in large trees.
 */
export function nodeRadius(depth, maxDepth, numAgents) {
  // Uniform radius – all nodes are the same size
  if (numAgents > 40) return 12
  if (numAgents > 20) return 16
  if (numAgents > 10) return 18
  return 22
}

/**
 * Compute a radial (polar-coordinate) tree layout matching the PNG images.
 * The root is at the center, with children radiating outward.
 *
 * @param {number} numAgents
 * @param {number} numChildren - branching factor (2 for binary, 3 for ternary)
 * @param {number} [radiusSize] - optional radius of the outermost ring in px
 * @returns {{ nodes: Array, links: Array, hierarchy: Object }}
 *   - nodes: [{ id, x, y, angle, r, depth, isRoot, isLeaf, maxDepth, parent, childrenIds }]
 *   - links: [{ source: {id,x,y}, target: {id,x,y} }]
 */
export function computeRadialLayout(numAgents, numChildren = 2, radiusSize = 260) {
  const hier = buildHierarchy(numAgents, numChildren)

  // Scale radius based on number of agents for proper spacing
  const effectiveRadius = numAgents > 40
    ? radiusSize * 1.4
    : numAgents > 20
      ? radiusSize * 1.15
      : radiusSize

  const treeLayout = d3.tree()
    .size([2 * Math.PI, effectiveRadius])
    .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth || 1)

  const root = treeLayout(hier)
  const maxDepth = Math.max(...root.descendants().map(d => d.depth))

  const nodes = root.descendants().map(d => {
    const angle = d.x       // angle in radians
    const r = d.y            // distance from center
    // Convert polar to Cartesian (center at 0,0)
    const x = r * Math.cos(angle - Math.PI / 2)
    const y = r * Math.sin(angle - Math.PI / 2)

    return {
      id: d.data.id,
      x,
      y,
      angle,
      r,
      depth: d.depth,
      isRoot: d.depth === 0,
      isLeaf: !d.children,
      maxDepth,
      parent: d.parent ? d.parent.data.id : null,
      childrenIds: d.children ? d.children.map(c => c.data.id) : [],
    }
  })

  const links = root.links().map(l => ({
    source: {
      id: l.source.data.id,
      x: l.source.y * Math.cos(l.source.x - Math.PI / 2),
      y: l.source.y * Math.sin(l.source.x - Math.PI / 2),
    },
    target: {
      id: l.target.data.id,
      x: l.target.y * Math.cos(l.target.x - Math.PI / 2),
      y: l.target.y * Math.sin(l.target.x - Math.PI / 2),
    },
  }))

  return { nodes, links, hierarchy: root }
}

/**
 * Builds the complete hierarchy tree for all agents, pre-computing
 * child and total descendant counts for all nodes using D3.
 *
 * @param {number} numAgents
 * @param {number} numChildren
 * @returns {Object} d3 hierarchy node
 */
export function buildFullHierarchy(numAgents, numChildren = 2) {
  const root = numAgents - 1  // root agent ID

  function makeNode(agentId, pos) {
    const children = []
    for (let c = 1; c <= numChildren; c++) {
      const childPos = pos * numChildren + c
      if (childPos < numAgents) {
        const childAgentId = numAgents - 1 - childPos
        children.push(makeNode(childAgentId, childPos))
      }
    }
    return { id: agentId, children: children.length ? children : undefined }
  }

  const hier = d3.hierarchy(makeNode(root, 0))
  
  // Pre-calculate descendant counts for collapsing logic
  hier.each(d => {
    d.data.totalDescendants = d.descendants().length - 1
    d.data.hasChildren = !!d.children
  })
  
  return hier
}

/**
 * Recursively clones the full hierarchy to build a visible tree,
 * stopping at any node that is marked as collapsed.
 *
 * @param {Object} fullHier - full d3 hierarchy node
 * @param {Set<number>} collapsedNodeIds - set of agent IDs that are collapsed
 * @returns {Object} d3 hierarchy node representing only the visible hierarchy
 */
export function buildVisibleHierarchy(fullHier, collapsedNodeIds) {
  function cloneNode(node) {
    const isCollapsed = collapsedNodeIds.has(node.data.id)
    const cloned = {
      id: node.data.id,
      totalDescendants: node.data.totalDescendants,
      hasChildren: node.data.hasChildren,
      isCollapsed: isCollapsed && node.data.hasChildren
    }
    
    if (!isCollapsed && node.children) {
      cloned.children = node.children.map(cloneNode)
    }
    
    return cloned
  }
  
  return d3.hierarchy(cloneNode(fullHier))
}

/**
 * Compute the radial layout coordinate systems ONLY for the visible hierarchy.
 *
 * @param {Object} visibleHier - visible d3 hierarchy node
 * @param {number} numAgents - total agents
 * @param {number} radiusSize - base layout radius
 * @returns {{ nodes: Array, links: Array, hierarchy: Object }}
 */
export function computeRadialLayoutForHierarchy(visibleHier, numAgents, radiusSize = 260) {
  const maxDepth = Math.max(...visibleHier.descendants().map(d => d.depth))
  
  // Dynamically size radius to fit depth neatly without overlap
  const effectiveRadius = radiusSize * (1 + maxDepth * 0.15)

  const treeLayout = d3.tree()
    .size([2 * Math.PI, effectiveRadius])
    .separation((a, b) => (a.parent === b.parent ? 1.0 : 1.6) / (a.depth || 1))

  const root = treeLayout(visibleHier)

  const nodes = root.descendants().map(d => {
    const angle = d.x       // angle in radians
    const r = d.y            // distance from center
    // Convert polar to Cartesian (center at 0,0)
    const x = r * Math.cos(angle - Math.PI / 2)
    const y = r * Math.sin(angle - Math.PI / 2)

    return {
      id: d.data.id,
      x,
      y,
      angle,
      r,
      depth: d.depth,
      isRoot: d.depth === 0,
      isLeaf: !d.children, // visible leaf
      isCollapsed: d.data.isCollapsed,
      hasChildren: d.data.hasChildren,
      totalDescendants: d.data.totalDescendants,
      maxDepth,
      parent: d.parent ? d.parent.data.id : null,
      childrenIds: d.children ? d.children.map(c => c.data.id) : [],
    }
  })

  const links = root.links().map(l => ({
    source: {
      id: l.source.data.id,
      x: l.source.y * Math.cos(l.source.x - Math.PI / 2),
      y: l.source.y * Math.sin(l.source.x - Math.PI / 2),
    },
    target: {
      id: l.target.data.id,
      x: l.target.y * Math.cos(l.target.x - Math.PI / 2),
      y: l.target.y * Math.sin(l.target.x - Math.PI / 2),
    },
  }))

  return { nodes, links, hierarchy: root }
}


import { useState } from 'react'

export default function PlanViewer({ parsedPlans, onPlansChange, visibleAgentNames, visiblePlanIndices, visibleDimensionIndices }) {
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (!parsedPlans || parsedPlans.length === 0) return null

  const visiblePlans = visibleAgentNames
    ? parsedPlans.filter(p => visibleAgentNames.includes(p.name))
    : parsedPlans;

  if (visiblePlans.length === 0) {
    return (
      <div className="placeholder">
        <div className="placeholder-icon">👥</div>
        <h2>No visible agents</h2>
        <p>Please select at least one agent in the sidebar selection panel.</p>
      </div>
    )
  }

  const idx   = Math.min(selectedIdx, visiblePlans.length - 1)
  const agent = visiblePlans[idx]
  const dims  = agent.plans[0]?.values.length ?? 0

  const originalIdx = parsedPlans.findIndex(p => p.name === agent.name)

  const deleteAgent = (i) => {
    const agentToDelete = visiblePlans[i]
    const next = parsedPlans.filter(a => a.name !== agentToDelete.name)
    onPlansChange(next)
    setSelectedIdx(prev => Math.min(prev, visiblePlans.length - 2))
  }

  const update = (planIdx, field, raw) => {
    const val = parseFloat(raw)
    if (isNaN(val)) return
    const next = parsedPlans.map((a, ai) => {
      if (ai !== originalIdx) return a
      return {
        ...a,
        plans: a.plans.map((p, pi) => {
          if (pi !== planIdx) return p
          if (field === 'cost') return { ...p, cost: val }
          const v = [...p.values]; v[field] = val
          return { ...p, values: v }
        })
      }
    })
    onPlansChange(next)
  }

  return (
    <div className="plan-viewer">
      <div className="pv-header">
        <h3>Plan Editor</h3>
        <div className="pv-selector-wrapper">
          <select
            className="pv-agent-select"
            value={idx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
          >
            {visiblePlans.map((a, i) => (
              <option key={a.name} value={i}>
                {a.name}
              </option>
            ))}
          </select>
          {visiblePlans.length > 1 && (
            <button
              className="pv-agent-delete"
              onClick={() => deleteAgent(idx)}
              title="Remove selected agent"
            >
              Remove Selected
            </button>
          )}
        </div>
      </div>

      <div className="pv-meta">
        {agent.plans.length} plan{agent.plans.length !== 1 ? 's' : ''} &nbsp;·&nbsp; {dims} dimensions
      </div>

      <div className="pv-scroll">
        <table className="pv-table">
          <thead>
            <tr>
              <th className="pv-sticky">#</th>
              <th className="pv-sticky">Local Cost</th>
              {Array.from({ length: dims }, (_, i) => {
                if (visibleDimensionIndices && !visibleDimensionIndices.includes(i)) return null;
                return (
                  <th key={i}>d{i + 1}</th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {agent.plans.map((plan, pi) => {
              if (visiblePlanIndices && !visiblePlanIndices.includes(pi)) return null;
              return (
                <tr key={pi}>
                  <td className="pv-sticky pv-idx">{pi}</td>
                  <td className="pv-sticky">
                    <input
                      className="pv-cell pv-cost"
                      type="number"
                      value={plan.cost}
                      onChange={e => update(pi, 'cost', e.target.value)}
                    />
                  </td>
                  {plan.values.map((v, vi) => {
                    if (visibleDimensionIndices && !visibleDimensionIndices.includes(vi)) return null;
                    return (
                      <td key={vi}>
                        <input
                          className="pv-cell"
                          type="number"
                          value={v}
                          onChange={e => update(pi, vi, e.target.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

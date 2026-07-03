import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'

const COLORS = ['#4f8ef7', '#f74f8e', '#4ff7a0', '#f7c44f', '#c44ff7']

export function CostChart({ data, title, dataKey = 'Mean', color = '#4f8ef7', yLabel = 'Cost' }) {
  if (!data || data.length === 0) return null
  return (
    <div className="chart-card">
      <h4>{title}</h4>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis dataKey="Iteration" label={{ value: 'Iteration', position: 'insideBottom', offset: -2 }} />
          <YAxis label={{ value: yLabel, angle: -90, position: 'insideLeft', offset: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6 }}
            labelStyle={{ color: '#aaa' }}
          />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PlanFrequencyChart({ data }) {
  if (!data || data.length === 0) return null
  // data rows: { PlanIndex, Frequency (or Count) }
  // columns after iteration header: plan index columns
  const headers = Object.keys(data[0]).filter(k => k !== 'Iteration')
  // sum across iterations for each plan index
  const totals = headers.map(h => ({
    plan: h,
    count: data.reduce((s, row) => s + (row[h] || 0), 0)
  }))

  return (
    <div className="chart-card">
      <h4>Plan Selection Frequency (total across all agents &amp; iterations)</h4>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={totals} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
          <XAxis dataKey="plan" label={{ value: 'Plan Index', position: 'insideBottom', offset: -2 }} />
          <YAxis />
          <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 6 }} />
          <Bar dataKey="count" name="Times Selected">
            {totals.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

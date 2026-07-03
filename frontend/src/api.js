const BASE = import.meta.env.VITE_API_URL || '/api'

export async function submitRun(files, config) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  // send all config including algorithm + datasetType
  Object.entries(config).forEach(([k, v]) => form.append(k, v))

  const res = await fetch(`${BASE}/run`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function pollStatus(jobId) {
  const res = await fetch(`${BASE}/status/${jobId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchResults(jobId) {
  const res = await fetch(`${BASE}/results/${jobId}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function cleanupJob(jobId) {
  await fetch(`${BASE}/jobs/${jobId}`, { method: 'DELETE' })
}

export async function fetchPrivacyDataset() {
  const res = await fetch(`${BASE}/dataset/privacy`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchSignals() {
  const res = await fetch(`${BASE}/dataset/signals`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchDatasets() {
  try {
    const localRes = await fetch('/datasets/datasets.json')
    if (localRes.ok) return await localRes.json()
  } catch (e) {
    console.log("Local datasets list not found, falling back to backend")
  }
  const res = await fetch(`${BASE}/datasets`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchDatasetByPath(path) {
  try {
    const localRes = await fetch(`/datasets/${path}/dataset.json`)
    if (localRes.ok) return await localRes.json()
  } catch (e) {
    console.log("Local dataset file not found, falling back to backend")
  }
  const res = await fetch(`${BASE}/datasets/load?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchDatasetMetadata(path) {
  try {
    const localRes = await fetch(`/datasets/${path}/metadata.json`)
    if (localRes.ok) return await localRes.json()
  } catch (e) {
    console.log("Local metadata file not found, falling back to backend")
  }
  const res = await fetch(`${BASE}/datasets/metadata?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchSelectedAgents(path, agentNames) {
  try {
    const localRes = await fetch(`/datasets/${path}/dataset.json`)
    if (localRes.ok) {
      const all = await localRes.json()
      const nameSet = new Set(agentNames)
      return all.filter(a => nameSet.has(a.name))
    }
  } catch (e) {
    console.log("Local dataset file not found, falling back to backend")
  }
  const res = await fetch(`${BASE}/datasets/load-agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, agents: agentNames })
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function killJob(jobId) {
  const res = await fetch(`${BASE}/jobs/${jobId}/kill`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function fetchIterationHistory(jobId) {
  const res = await fetch(`${BASE}/results/${jobId}/iteration-history`)
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

/** Parse a CSV string (with header) into [{col: val, ...}, ...] */
export function parseCsv(raw) {
  if (!raw) return []
  const lines = raw.trim().split('\n')
  if (lines.length < 2) return []

  // Check if semicolon delimited
  const isSemicolon = lines[0].includes(';')
  const delimiter = isSemicolon ? ';' : ','
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))

  const parsed = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    let vals
    if (!isSemicolon && line.includes('"')) {
      const parts = line.split('"')
      if (parts.length >= 3) {
        const tupleVal = parts[1]
        const remaining = parts.slice(2).join('').replace(/^,/, '').split(',')
        vals = [tupleVal, ...remaining]
      } else {
        vals = line.split(delimiter)
      }
    } else {
      vals = line.split(delimiter)
    }

    const obj = {}
    for (let j = 0; j < headers.length; j++) {
      const h = headers[j]
      const v = vals[j]
      if (v === undefined || v === '') {
        obj[h] = v
      } else {
        const f = parseFloat(v)
        obj[h] = isNaN(f) ? v : f
      }
    }
    parsed.push(obj)
  }
  return parsed
}

export async function checkCache(files, config) {
  const form = new FormData()
  files.forEach(f => form.append('files', f))
  Object.entries(config).forEach(([k, v]) => form.append(k, v))

  const res = await fetch(`${BASE}/check-cache`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

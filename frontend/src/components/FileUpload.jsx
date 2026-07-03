import { useRef, useState } from 'react'

export default function FileUpload({ files, onChange }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const addFiles = newFiles => {
    const plans = Array.from(newFiles).filter(f => f.name.endsWith('.plans'))
    if (plans.length === 0) return
    // Merge, dedup by name
    const merged = [...files]
    plans.forEach(f => {
      if (!merged.find(e => e.name === f.name)) merged.push(f)
    })
    // Sort by agent index so agent_0 comes first
    merged.sort((a, b) => {
      const ia = parseInt(a.name.match(/\d+/) || [99999])
      const ib = parseInt(b.name.match(/\d+/) || [99999])
      return ia - ib
    })
    onChange(merged)
  }

  const remove = name => onChange(files.filter(f => f.name !== name))
  const clear = () => onChange([])

  return (
    <div className="panel">
      <h3>📂 Agent Plan Files</h3>

      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".plans"
          style={{ display: 'none' }}
          onChange={e => addFiles(e.target.files)}
        />
        <span>Drop <code>.plans</code> files here or click to browse</span>
      </div>

      {files.length > 0 && (
        <>
          <div className="file-list">
            {files.map(f => (
              <div key={f.name} className="file-item">
                <span>{f.name}</span>
                <button className="remove-btn" onClick={() => remove(f.name)}>✕</button>
              </div>
            ))}
          </div>
          <div className="file-summary">
            <span>{files.length} agent{files.length !== 1 ? 's' : ''} loaded</span>
            <button className="link-btn" onClick={clear}>Clear all</button>
          </div>
        </>
      )}
    </div>
  )
}

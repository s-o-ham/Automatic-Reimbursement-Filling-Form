import React, { useState, useRef, useCallback } from 'react'
import './App.css'

const ACCEPTED_TYPES = ['.pdf', '.doc', '.docx', '.csv', '.png']

function getFileIcon(filename) {
  const ext = filename?.split('.').pop()?.toLowerCase()
  return { pdf: '📄', doc: '📝', docx: '📝', csv: '📊', png: '🖼️' }[ext] || '📁'
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validateFile(f) {
  const ext = '.' + f.name.split('.').pop().toLowerCase()
  if (!ACCEPTED_TYPES.includes(ext))
    return `"${f.name}" is not a supported type. Allowed: PDF, DOC, DOCX, CSV.`
  if (f.size > 10 * 1024 * 1024)
    return `"${f.name}" exceeds 10 MB.`
  return null
}

// Each entry: { file: File, date: string }
export default function App() {
  const [entries, setEntries] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [downloadFilename, setDownloadFilename] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef(null)

  // Default date = today
  const today = new Date().toISOString().slice(0, 10)

  const addFiles = (incoming) => {
    setError('')
    setDownloadUrl(null)
    setSuccess(false)
    const errors = []
    const valid = []
    for (const f of incoming) {
      const err = validateFile(f)
      if (err) { errors.push(err); continue }
      const isDup = entries.some((e) => e.file.name === f.name && e.file.size === f.size)
      if (!isDup) valid.push({ file: f, date: today })
    }
    if (errors.length) setError(errors.join(' '))
    if (valid.length) setEntries((prev) => [...prev, ...valid].slice(0, 10))
  }

  const removeEntry = (i) => {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
    setDownloadUrl(null)
    setSuccess(false)
  }

  const setEntryDate = (i, date) => {
    setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, date } : e))
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [entries])

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onFileChange = (e) => { addFiles(Array.from(e.target.files)); e.target.value = '' }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setDownloadUrl(null)
    setSuccess(false)

    if (entries.length === 0) { setError('Please add at least one file.'); return }

    const missingDate = entries.find((e) => !e.date)
    if (missingDate) {
      setError(`Please select a date for "${missingDate.file.name}".`)
      return
    }

    setIsLoading(true)
    try {
      const formData = new FormData()
      // IMPORTANT: append all files first, then all dates.
      // Interleaving files and text fields in multipart confuses multer's
      // body parser, causing all dates to collapse to the first value.
      entries.forEach(({ file }) => formData.append('files', file))
      entries.forEach(({ date }) => formData.append('dates', date))

      const API_BASE = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${API_BASE}/api/generate`, { method: 'POST', body: formData })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error: ${res.status}`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const fnMatch = (res.headers.get('Content-Disposition') || '').match(/filename="?([^"]+)"?/)
      setDownloadUrl(url)
      setDownloadFilename(fnMatch ? fnMatch[1] : 'reimbursement.pdf')
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to generate PDF. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = downloadFilename
    a.click()
  }

  const handleReset = () => {
    setEntries([])
    setDownloadUrl(null)
    setDownloadFilename('')
    setError('')
    setSuccess(false)
  }

  return (
    <div className="app-bg">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="container">
        <header className="header">
          <div className="header-icon">📋</div>
          <h1 className="header-title">Reimbursement Generator</h1>
          <p className="header-subtitle">
            Upload bills, set a date per file, download one professional PDF
          </p>
        </header>

        <div className="card">
          <form onSubmit={handleSubmit} id="main-form">

            {/* Drop Zone */}
            <section className="section">
              <label className="section-label">
                <span className="label-icon">📎</span>
                Upload Bills
                {entries.length > 0 && (
                  <span className="file-badge">{entries.length}/10</span>
                )}
              </label>

              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''} ${entries.length > 0 ? 'compact' : ''}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                id="drop-zone"
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <div className="drop-icon">{isDragging ? '📂' : '☁️'}</div>
                <p className="drop-title">
                  {isDragging ? 'Drop files here!' : entries.length === 0 ? 'Drag & drop your files' : 'Add more files'}
                </p>
                <p className="drop-subtitle">or <span className="drop-link">browse files</span></p>
                <p className="drop-types">PDF, DOC, DOCX, CSV, PNG · Max 10 MB each · Up to 10 files</p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                id="file-input"
                accept=".pdf,.doc,.docx,.csv,.png"
                multiple
                onChange={onFileChange}
                className="hidden-input"
              />

              {/* File list with per-file date */}
              {entries.length > 0 && (
                <div className="file-list">
                  {entries.map(({ file, date }, i) => (
                    <div className="file-item" key={`${file.name}-${i}`} style={{ animationDelay: `${i * 40}ms` }}>

                      {/* Left: number + icon + info */}
                      <span className="file-item-num">{i + 1}</span>
                      <span className="file-item-icon">{getFileIcon(file.name)}</span>
                      <div className="file-item-info">
                        <p className="file-item-name">{file.name}</p>
                        <p className="file-item-size">{formatFileSize(file.size)}</p>
                      </div>

                      {/* Right: date picker */}
                      <input
                        type="date"
                        className="file-date-input"
                        value={date}
                        onChange={(e) => setEntryDate(i, e.target.value)}
                        required
                        aria-label={`Date for ${file.name}`}
                        id={`file-date-${i}`}
                      />

                      {/* Remove */}
                      <button
                        type="button"
                        className="file-remove-btn"
                        id={`remove-file-${i}`}
                        onClick={() => removeEntry(i)}
                        aria-label={`Remove ${file.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Error */}
            {error && (
              <div className="alert alert-error" role="alert" id="error-message">
                <span className="alert-icon">⚠️</span>{error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="alert alert-success" role="status" id="success-message">
                <span className="alert-icon">✅</span>
                PDF generated with {entries.length} bill{entries.length > 1 ? 's' : ''}! Click download below.
              </div>
            )}

            {/* Actions */}
            <div className="actions">
              {!success ? (
                <button type="submit" className="btn btn-primary" id="generate-btn" disabled={isLoading}>
                  {isLoading ? (
                    <><span className="spinner" />Generating PDF…</>
                  ) : (
                    <><span className="btn-icon">⚡</span>Generate PDF{entries.length > 1 ? ` (${entries.length} bills)` : ''}</>
                  )}
                </button>
              ) : (
                <div className="action-row">
                  <button type="button" className="btn btn-download" id="download-btn" onClick={handleDownload}>
                    <span className="btn-icon">⬇️</span>Download PDF
                  </button>
                  <button type="button" className="btn btn-secondary" id="new-bill-btn" onClick={handleReset}>
                    + New
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Steps */}
        <div className="steps">
          {[
            { icon: '📤', label: 'Upload', desc: 'Up to 10 bills' },
            { icon: '📅', label: 'Date each', desc: 'Per-file date' },
            { icon: '✨', label: 'Generate', desc: 'All bills in one PDF' },
            { icon: '⬇️', label: 'Download', desc: 'Professional PDF ready' },
          ].map((step, i) => (
            <div className="step" key={i}>
              <div className="step-icon">{step.icon}</div>
              <p className="step-label">{step.label}</p>
              <p className="step-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

'use client'

import type { AppStage, ProcessingResult } from './Dashboard'

interface ResultPanelProps {
  stage: AppStage
  result: ProcessingResult | null
  onValidate: () => void
}

export default function ResultPanel({ stage, result, onValidate }: ResultPanelProps) {
  const handleDownload = () => {
    if (!result?.geotiffUrl) return
    const a = document.createElement('a')
    a.href = result.geotiffUrl
    a.download = `georef_${Date.now()}.tif`
    a.click()
  }

  return (
    <div style={{ padding: '14px 16px', flexShrink: 0 }}>
      <div className="section-label" style={{ marginBottom: 10 }}>result</div>

      {/* No result yet */}
      {!result && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'var(--text-muted)',
          padding: '8px 0',
        }}>
          awaiting pipeline...
        </div>
      )}

      {/* Stats */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Match quality bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>match quality</span>
              <span style={{ fontSize: 10, color: result.matchScore > 0.7 ? 'var(--accent-green)' : result.matchScore > 0.4 ? 'var(--accent-amber)' : 'var(--accent-red)', fontFamily: 'monospace' }}>
                {(result.matchScore * 100).toFixed(1)}%
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{
                width: `${result.matchScore * 100}%`,
                background: result.matchScore > 0.7
                  ? 'linear-gradient(90deg, #68d391, #4fd1c5)'
                  : result.matchScore > 0.4
                  ? 'linear-gradient(90deg, #f6ad55, #ed8936)'
                  : 'linear-gradient(90deg, #fc8181, #e53e3e)',
              }} />
            </div>
          </div>

          {/* Stats grid */}
          <div className="card" style={{ padding: '8px 10px' }}>
            {[
              ['inlier matches', String(result.inlierCount)],
              ['crs', 'EPSG:4326'],
              ['north', `${result.overlayBounds.north.toFixed(5)}°`],
              ['south', `${result.overlayBounds.south.toFixed(5)}°`],
              ['east',  `${result.overlayBounds.east.toFixed(5)}°`],
              ['west',  `${result.overlayBounds.west.toFixed(5)}°`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{k}</span>
                <span style={{ fontSize: 10, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          {stage === 'preview' && (
            <button className="btn-validate" onClick={onValidate} style={{ width: '100%' }}>
              ✓ validate result
            </button>
          )}

          {stage === 'validated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                color: 'var(--accent-green)',
                textAlign: 'center',
                padding: '4px 0',
              }}>
                ✓ validated — WGS84 / EPSG:4326
              </div>
              <button className="btn-download" onClick={handleDownload} style={{ width: '100%' }}>
                ↓ export geotiff
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

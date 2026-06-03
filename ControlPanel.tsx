'use client'

import { useRef, useState } from 'react'
import type { AppStage, MapViewport } from './Dashboard'

const PIPELINE_CONFIG = [
  ['clip limit', '2.0'],
  ['grid', '8×8'],
  ['grid kp', '4×4'],
  ['ratio test', '0.75'],
  ['ransac thr', '5.0 px'],
  ['projection', 'WGS84'],
]

interface ControlPanelProps {
  stage: AppStage
  viewport: MapViewport
  capturedProxy: string | null
  referencePreview: string | null
  referenceFile: File | null
  imageType: 'sharp' | 'medium' | 'blurry' | null // <-- ADD THIS
  setImageType: (type: 'sharp' | 'medium' | 'blurry') => void // <-- ADD THIS
  onCapture: () => void
  onUpload: (file: File) => void
  onProcess: () => void
}

export default function ControlPanel({
  stage, viewport, capturedProxy, referencePreview, referenceFile,
  imageType, setImageType,
  onCapture, onUpload, onProcess,
}: ControlPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) onUpload(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  const canCapture = stage === 'navigating' || stage === 'idle'
  const canUpload = stage === 'captured' || stage === 'ready'
  const canProcess = stage === 'ready' && imageType !== null

  // Pixel resolution
  const metersPerPx = 156543.03392 * Math.cos(viewport.lat * Math.PI / 180) / Math.pow(2, viewport.zoom)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
        <div className="section-label" style={{ marginBottom: 2 }}>pipeline controls</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 12px' }}>

        {/* ── STEP 1: PROXY CAPTURE ── */}
        <StepSection
          num="01"
          title="capture proxy map"
          active={stage === 'navigating' || stage === 'idle'}
          done={!!capturedProxy}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px', fontFamily: "'JetBrains Mono', monospace" }}>
            Navigate the satellite map to the rough location of your reference image, then capture.
          </p>

          {/* Viewport info */}
          <div className="card" style={{ padding: '8px 10px', marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 0' }}>
              {[
                ['lat', `${viewport.lat.toFixed(5)}°`],
                ['lng', `${viewport.lng.toFixed(5)}°`],
                ['zoom', `${viewport.zoom}`],
                ['m/px', `${metersPerPx.toFixed(2)}`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 32 }}>{k}</span>
                  <span style={{ fontSize: 10, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={onCapture}
            disabled={!canCapture}
            style={{ width: '100%' }}
          >
            capture proxy image
          </button>

          {/* Proxy thumbnail */}
          {/* Proxy thumbnail */}
          {capturedProxy && (
            <div style={{ marginTop: 10, position: 'relative', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <img
                src={capturedProxy}
                alt="Proxy map"
                style={{ width: '100%', display: 'block', opacity: 1 }} // Opacity removed
                onError={(e) => {
                  const t = e.target as HTMLImageElement
                  t.style.display = 'none'
                }}
              />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                padding: '8px 8px 6px',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                color: 'rgba(104,211,145,0.9)',
              }}>
                ✓ proxy locked · 640×640px satellite
              </div>
            </div>
          )}
        </StepSection>

        {/* ── STEP 2: REFERENCE UPLOAD ── */}
        <StepSection
          num="02"
          title="upload reference"
          active={stage === 'captured' || stage === 'ready'}
          done={!!referenceFile}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px', fontFamily: "'JetBrains Mono', monospace" }}>
            Upload the image to be georeferenced. Any raster format works.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />

          <div
            className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
            style={{
              padding: 16,
              textAlign: 'center',
              opacity: canUpload ? 1 : 0.4,
              cursor: canUpload ? 'pointer' : 'default',
            }}
            onClick={() => canUpload && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); if (canUpload) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={canUpload ? handleFileDrop : undefined}
          >
            <div style={{ marginBottom: 6 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto', display: 'block' }}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round" />
                <polyline points="17,8 12,3 7,8" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="3" x2="12" y2="15" stroke="var(--accent-blue)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-secondary)' }}>
              {referenceFile ? referenceFile.name : 'drop image or click'}
            </div>
            {referenceFile && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {(referenceFile.size / 1024).toFixed(0)} KB
              </div>
            )}
          </div>

          {referencePreview && (
            <div style={{ marginTop: 12 }}>
              <img src={referencePreview} alt="ref" style={{
                width: '100%', height: 120, objectFit: 'cover',
                borderRadius: 4, border: '1px solid var(--border)'
              }} />

              {/* --- NEW IMAGE TYPE SELECTOR --- */}
              <div style={{ marginTop: 12, padding: '10px', background: 'rgba(0,0,0,0.02)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
                  Select Image Quality:
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['sharp', 'medium', 'blurry'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setImageType(type as any)}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        fontSize: 11,
                        fontFamily: "'Space Grotesk', sans-serif",
                        background: imageType === type ? 'var(--accent-blue)' : 'white',
                        color: imageType === type ? 'white' : 'var(--text-secondary)',
                        border: `1px solid ${imageType === type ? 'var(--accent-blue)' : 'var(--border)'}`,
                        borderRadius: 4,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        textTransform: 'capitalize'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              {/* --- END NEW SELECTOR --- */}

            </div>
          )}
        </StepSection>

        {/* ── STEP 3: RUN PIPELINE ── */}
        <StepSection
          num="03"
          title="run pipeline"
          active={stage === 'ready'}
          done={stage === 'preview' || stage === 'validated'}
        >
          <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 10px', fontFamily: "'JetBrains Mono', monospace" }}>
            CLAHE → SIFT → homography → warp → GeoTIFF
          </p>

          {/* Pipeline params display */}
          <div className="card" style={{ padding: '8px 10px', marginBottom: 10 }}>
            {PIPELINE_CONFIG.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{k}</span>
                <span style={{ fontSize: 10, color: 'var(--accent-purple)', fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>

          <button
            className="btn-primary"
            onClick={onProcess}
            disabled={!canProcess}
            style={{ width: '100%' }}
          >
            {stage === 'processing' ? '⠿ processing...' : 'run georeferencing'}
          </button>
        </StepSection>
      </div>
    </div>
  )
}

function StepSection({
  num, title, active, done, children
}: {
  num: string
  title: string
  active: boolean
  done: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: '1px solid var(--border)',
      opacity: (!active && !done) ? 0.4 : 1,
      transition: 'opacity 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          color: done ? 'var(--accent-green)' : active ? 'var(--accent-blue)' : 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}>
          {done ? '✓' : num}
        </span>
        <span style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 12,
          fontWeight: 500,
          color: done ? 'var(--accent-green)' : active ? 'var(--text-primary)' : 'var(--text-muted)',
          letterSpacing: '0.01em',
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

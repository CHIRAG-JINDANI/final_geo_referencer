'use client'

import { useEffect, useRef, useState } from 'react'
import type { LogEntry } from './Dashboard'

interface LogPanelProps {
  logs: LogEntry[]
}

export default function LogPanel({ logs }: LogPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // ADD THIS STATE
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true) // Set mounted to true once client takes over
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const fmt = (ts: number) => {
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '10px 16px 12px' }}>
      <div className="section-label" style={{ marginBottom: 8 }}>pipeline log</div>
      <div className="log-terminal" style={{ flex: 1, overflow: 'auto' }}>
        {logs.map((entry, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, lineHeight: 1.6 }}>
            <span className="log-dim" style={{ flexShrink: 0, minWidth: 56 }}>{fmt(entry.ts)}</span>
            <span className={`log-${entry.type}`}>{entry.msg}</span>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* UPDATE THIS LINE to check for mounted status */}
          <span className="log-dim" style={{ minWidth: 56 }}>
            {mounted ? fmt(Date.now()) : '--:--:--'}
          </span>
          <span className="log-dim">▋<span className="cursor">_</span></span>
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
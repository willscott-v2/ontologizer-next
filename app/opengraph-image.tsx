import { ImageResponse } from 'next/og'

export const alt = 'Ontologizer by Search Influence: AI Content Clarity Analyzer'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 80px',
        color: '#ffffff',
        background: 'linear-gradient(135deg, #002f3f 0%, #075f73 100%)',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: '#f47a38' }}>
        Search Influence
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 74, fontWeight: 800, lineHeight: 1.05 }}>
          Ontologizer
        </div>
        <div style={{ display: 'flex', marginTop: 22, maxWidth: 940, fontSize: 42, lineHeight: 1.2 }}>
          AI Content Clarity &amp; Connected Schema Analyzer
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 25, color: '#d7edf1' }}>
        Topic focus · Entity clarity · Semantic coherence · Answer structure
      </div>
    </div>,
    size,
  )
}

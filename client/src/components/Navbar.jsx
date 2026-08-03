import React from 'react';

export default function Navbar({ activeMode, setActiveMode }) {
  return (
    <header className="glass-panel" style={{
      margin: '16px 24px',
      padding: '16px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: '16px',
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{
          width: '42px',
          height: '42px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #f3c623 0%, #d97706 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(243, 198, 35, 0.4)',
          fontWeight: '900',
          fontSize: '1.2rem',
          color: '#000'
        }}>
          N
        </div>
        <div>
          <h1 className="serif-title" style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.3px' }}>
            History-Nexus <span style={{ color: 'var(--accent-gold)', fontSize: '0.9rem', fontFamily: 'var(--font-sans)', fontWeight: '600' }}>AI+X 체험존</span>
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
            Re:Frame 역사 인물 대화 및 영상 생성 플랫폼
          </p>
        </div>
      </div>

      {/* Mode Switcher */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.4)',
        padding: '4px',
        borderRadius: '12px',
        display: 'flex',
        gap: '4px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <button
          onClick={() => setActiveMode('kiosk')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.88rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: activeMode === 'kiosk' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'transparent',
            color: activeMode === 'kiosk' ? '#000' : 'var(--text-sub)'
          }}
        >
          💬 관람객 체험존 (Kiosk)
        </button>
        <button
          onClick={() => setActiveMode('studio')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.88rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            background: activeMode === 'studio' ? 'linear-gradient(135deg, #f3c623 0%, #e0a96d 100%)' : 'transparent',
            color: activeMode === 'studio' ? '#000' : 'var(--text-sub)'
          }}
        >
          🎬 영상 제작 템플릿 (Studio)
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}>
          ● Local AI Active (0 Token)
        </span>
      </div>
    </header>
  );
}

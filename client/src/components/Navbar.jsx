import React from 'react';

export default function Navbar({ activeMode, setActiveMode }) {
  return (
    <header className="glass-panel" style={{
      margin: '8px 20px',
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: '8px',
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

      {/* Live Kiosk Mode Status Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 18px',
        borderRadius: '12px',
        background: 'rgba(0, 242, 254, 0.08)',
        border: '1px solid rgba(0, 242, 254, 0.25)',
        boxShadow: '0 0 15px rgba(0, 242, 254, 0.15)'
      }}>
        <span style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#00f2fe',
          boxShadow: '0 0 8px #00f2fe'
        }}></span>
        <span style={{
          fontSize: '0.88rem',
          fontWeight: '700',
          color: '#00f2fe',
          letterSpacing: '-0.2px'
        }}>
          💬 실시간 AI 역사 인물 대화 체험존
        </span>
      </div>
    </header>
  );
}

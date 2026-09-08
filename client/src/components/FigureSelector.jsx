import React, { useState } from 'react';

export default function FigureSelector({ figures, selectedFigure, onSelectFigure, onAddNewFigure }) {
  const [isUploading, setIsUploading] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customTitle, setCustomTitle] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64Image = evt.target.result;
      
      const newFig = {
        id: `custom-${Date.now()}`,
        name: customName.trim() || file.name.split('.')[0] || '내 커스텀 인물',
        title: customTitle.trim() || '사용자 업로드 아바타',
        era: '사용자 지정',
        ageCategory: '커스텀',
        voiceProfile: { tone: '단호하고 또렷한 톤', speechStyle: '격식체 어조', pitch: 1.0, rate: 0.95 },
        portraitUrl: base64Image,
        avatarBg: '#1e293b',
        themeColor: '#00f2fe',
        description: '사용자가 직접 업로드한 인물 초상화 이미지'
      };

      if (onAddNewFigure) {
        onAddNewFigure(newFig);
      }
      onSelectFigure(newFig);
      setIsUploading(false);
      setCustomName('');
      setCustomTitle('');
    };

    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Step 1 Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{
          fontSize: '0.88rem',
          fontWeight: '700',
          color: 'var(--accent-gold)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          letterSpacing: '-0.2px'
        }}>
          <span>1️⃣</span>
          <span>인물 선택</span>
        </h3>
        <button
          onClick={() => setIsUploading(!isUploading)}
          style={{
            background: 'transparent',
            color: 'var(--text-sub)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '6px',
            padding: '3px 10px',
            fontSize: '0.74rem',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {isUploading ? '✕ 닫기' : '📷 인물 추가'}
        </button>
      </div>

      {/* Upload Box Form (Compact) */}
      {isUploading && (
        <div className="glass-panel" style={{
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          background: 'rgba(0, 242, 254, 0.05)',
          border: '1px solid rgba(0, 242, 254, 0.3)',
          borderRadius: '10px'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <input
              type="text"
              placeholder="인물 성함 (예: 안중근 의사)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff', fontSize: '0.8rem' }}
            />
            <input
              type="text"
              placeholder="직함 (예: 독립운동가)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff', fontSize: '0.8rem' }}
            />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            style={{
              padding: '6px',
              borderRadius: '6px',
              border: '1px dashed var(--accent-cyan)',
              background: 'rgba(0,0,0,0.4)',
              color: 'var(--text-sub)',
              fontSize: '0.78rem',
              cursor: 'pointer'
            }}
          />
        </div>
      )}

      {/* Sleek Horizontal Figure Selector Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(figures.length, 5)}, 1fr)`,
        gap: '8px'
      }}>
        {figures.slice(0, 5).map((fig) => {
          const isSelected = selectedFigure?.id === fig.id;
          const themeColor = fig.themeColor || '#f3c623';
          return (
            <div
              key={fig.id}
              onClick={() => onSelectFigure(fig)}
              className="glass-card"
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                borderRadius: '12px',
                border: isSelected ? `2px solid ${themeColor}` : '1px solid rgba(255, 255, 255, 0.08)',
                background: isSelected ? `rgba(255, 255, 255, 0.08)` : 'rgba(255, 255, 255, 0.02)',
                boxShadow: isSelected ? `0 0 16px ${themeColor}40` : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Circular Avatar Thumbnail */}
              <div style={{
                width: '38px',
                height: '38px',
                minWidth: '38px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: isSelected ? `2px solid ${themeColor}` : '1px solid rgba(255, 255, 255, 0.15)',
                background: fig.avatarBg || '#05070a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img
                  src={fig.portraitUrl}
                  alt={fig.name}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: isSelected ? 'contrast(1.05)' : 'grayscale(15%)'
                  }}
                />
              </div>

              {/* Name & Title */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  color: isSelected ? themeColor : 'var(--text-main)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {fig.name}
                </div>
                <div style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {fig.title.split(' ')[0]}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

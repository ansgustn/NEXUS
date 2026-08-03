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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>👑</span> 역사 인물 선택 라이브러리
        </h3>
        <button
          onClick={() => setIsUploading(!isUploading)}
          style={{
            background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '0.82rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 0 12px rgba(0,242,254,0.3)'
          }}
        >
          📷 사진 파일 업로드
        </button>
      </div>

      {/* Upload Box Form */}
      {isUploading && (
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,242,254,0.05)', border: '1px solid rgba(0,242,254,0.3)' }}>
          <h4 style={{ fontSize: '0.88rem', color: 'var(--accent-cyan)' }}>
            📤 컴퓨터에서 초상화/인물 사진 선택
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <input
              type="text"
              placeholder="인물 성함 (예: 안중근 의사)"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff', fontSize: '0.85rem' }}
            />
            <input
              type="text"
              placeholder="직함/설명 (예: 독립운동가)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid #333', background: '#000', color: '#fff', fontSize: '0.85rem' }}
            />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            style={{
              padding: '10px',
              borderRadius: '8px',
              border: '1px dashed var(--accent-cyan)',
              background: 'rgba(0,0,0,0.4)',
              color: 'var(--text-sub)',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          />
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        {figures.map((fig) => {
          const isSelected = selectedFigure?.id === fig.id;
          return (
            <div
              key={fig.id}
              onClick={() => onSelectFigure(fig)}
              className="glass-card"
              style={{
                padding: '12px',
                cursor: 'pointer',
                border: isSelected ? `2px solid ${fig.themeColor}` : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: isSelected ? `0 0 20px ${fig.themeColor}35` : 'none',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Card Image */}
              <div style={{
                width: '100%',
                height: '130px',
                borderRadius: '8px',
                overflow: 'hidden',
                marginBottom: '10px',
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
                    objectFit: 'contain',
                    filter: isSelected ? 'contrast(1.05)' : 'grayscale(15%)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: isSelected ? fig.themeColor : 'var(--text-main)' }}>
                  {fig.name}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fig.title}
                </p>
                <span className="badge" style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  fontSize: '0.68rem',
                  alignSelf: 'flex-start',
                  color: 'var(--text-muted)',
                  marginTop: '4px'
                }}>
                  {fig.era}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

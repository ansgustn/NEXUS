import React, { useState, useEffect } from 'react';

export default function VideoGallery({ figures, selectedFigure, onSelectVideo, currentVideoUrl, onBackToMain }) {
  const [gallery, setGallery] = useState([]);
  const [activeFigureId, setActiveFigureId] = useState('all'); // 'all' or figureId
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGallery();
  }, []);

  const fetchGallery = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:3001/api/videos/gallery');
      const data = await res.json();
      if (data.success && data.gallery) {
        setGallery(data.gallery);
      }
    } catch (err) {
      console.warn('Failed to fetch video gallery:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredVideos = gallery.filter(item => {
    if (activeFigureId === 'all') return true;
    return item.figureId === activeFigureId;
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      animation: 'fadeIn 0.25s ease'
    }}>
      {/* Top Navigation & Header */}
      <div className="glass-panel" style={{
        padding: '16px 22px',
        borderRadius: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>🎬</span>
            <h2 style={{
              fontSize: '1.25rem',
              color: '#fff',
              fontFamily: 'var(--font-serif)',
              margin: 0
            }}>
              역사 인물 명장면 영상 아카이브
            </h2>
            <span style={{
              fontSize: '0.78rem',
              background: 'rgba(243, 198, 35, 0.15)',
              color: 'var(--accent-gold)',
              border: '1px solid rgba(243, 198, 35, 0.3)',
              padding: '2px 10px',
              borderRadius: '12px',
              fontWeight: '600'
            }}>
              총 {gallery.length}개 보관 영상
            </span>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', margin: '4px 0 0 0' }}>
            원하시는 사료 명장면을 선택하시면 대화 체험존에서 해당 영상으로 즉시 대화 및 시청을 이어가실 수 있습니다.
          </p>
        </div>

        {/* Back to Page 1 Button */}
        {onBackToMain && (
          <button
            onClick={onBackToMain}
            className="btn-primary"
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              fontSize: '0.86rem',
              fontWeight: '700',
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)'
            }}
          >
            <span>←</span>
            <span>대화 체험존으로 돌아가기</span>
          </button>
        )}
      </div>

      {/* Filter Tabs by Historical Figure */}
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        <button
          onClick={() => setActiveFigureId('all')}
          style={{
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '0.82rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: activeFigureId === 'all' ? '1px solid var(--accent-gold)' : '1px solid rgba(255, 255, 255, 0.1)',
            background: activeFigureId === 'all' ? 'rgba(243, 198, 35, 0.2)' : 'rgba(255, 255, 255, 0.03)',
            color: activeFigureId === 'all' ? 'var(--accent-gold)' : 'var(--text-sub)'
          }}
        >
          🌟 전체 인물 ({gallery.length})
        </button>

        {figures && figures.map(fig => {
          const count = gallery.filter(i => i.figureId === fig.id).length;
          const isSelected = activeFigureId === fig.id;
          const themeColor = fig.themeColor || '#f3c623';
          return (
            <button
              key={fig.id}
              onClick={() => setActiveFigureId(fig.id)}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: isSelected ? `1px solid ${themeColor}` : '1px solid rgba(255, 255, 255, 0.1)',
                background: isSelected ? `${themeColor}25` : 'rgba(255, 255, 255, 0.03)',
                color: isSelected ? themeColor : 'var(--text-sub)'
              }}
            >
              <span>{fig.name}</span>
              <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Video Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-sub)' }}>
          영상 아카이브 불러오는 중...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px'
        }}>
          {filteredVideos.map((item) => {
            const isSelected = currentVideoUrl === item.videoUrl;
            const themeColor = item.themeColor || '#f3c623';
            return (
              <div
                key={item.id}
                onClick={() => onSelectVideo(item)}
                className="glass-card"
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  border: isSelected ? `2px solid ${themeColor}` : '1px solid rgba(255, 255, 255, 0.08)',
                  background: isSelected ? 'rgba(243, 198, 35, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  boxShadow: isSelected ? `0 0 20px ${themeColor}35` : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.25s ease'
                }}
              >
                {/* Figure Header & Tag */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {item.portraitUrl && (
                      <img
                        src={item.portraitUrl}
                        alt={item.figureName}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `1px solid ${themeColor}`
                        }}
                      />
                    )}
                    <span style={{ fontSize: '0.86rem', fontWeight: '700', color: themeColor }}>
                      {item.figureName}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: 'var(--text-sub)'
                  }}>
                    {item.tag}
                  </span>
                </div>

                {/* Video Title */}
                <h3 style={{
                  fontSize: '1rem',
                  fontWeight: '700',
                  color: '#fff',
                  lineHeight: '1.4',
                  margin: 0
                }}>
                  {item.title}
                </h3>

                {/* Speech Preview */}
                <p style={{
                  fontSize: '0.82rem',
                  color: 'var(--text-sub)',
                  lineHeight: '1.5',
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  fontFamily: 'var(--font-serif)'
                }}>
                  "{item.speechText}"
                </p>

                {/* Bottom Action */}
                <div style={{
                  marginTop: 'auto',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.74rem', color: isSelected ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                    {isSelected ? '🔊 현재 체험존 재생 중' : 'HD 비디오 스트림'}
                  </span>
                  <button
                    type="button"
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      border: 'none',
                      background: isSelected
                        ? 'var(--accent-gold)'
                        : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: isSelected ? '#000' : '#fff',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isSelected ? '재생 중' : '▶ 이 영상으로 대화하기 ➔'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

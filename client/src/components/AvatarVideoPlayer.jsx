import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const AvatarVideoPlayer = forwardRef(({ figure, speechText, aiVideoResult, isGenerating, onSpeechEnd }, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportVideoAndDownload: () => {
      handleDownloadVideo();
    }
  }));

  // Resolve Real AI MP4 Video Stream
  useEffect(() => {
    if (aiVideoResult?.videoUrl) {
      setActiveVideoUrl(aiVideoResult.videoUrl);
    } else if (aiVideoResult?.pipeline?.videoResult?.videoUrl) {
      setActiveVideoUrl(aiVideoResult.pipeline.videoResult.videoUrl);
    } else if (figure) {
      const figureVideoPath = `/videos/${figure.id}_talking_avatar.mp4`;
      setActiveVideoUrl(figureVideoPath);
    }
  }, [figure, aiVideoResult]);

  const handlePlayVideo = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.currentTime = 0;
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.warn('MP4 video playback autoplay note:', err);
        videoRef.current.muted = true;
        videoRef.current.play().then(() => setIsPlaying(true));
      });
    }
  };

  useEffect(() => {
    if (figure && videoRef.current) {
      handlePlayVideo();
    }
  }, [figure, speechText]);

  const handleDownloadVideo = () => {
    const link = document.createElement('a');
    link.href = activeVideoUrl || figure?.portraitUrl;
    link.download = `${figure?.name || '역사인물'}_AI_Talking_Avatar.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const themeColor = figure?.themeColor || '#f3c623';

  return (
    <div className="glass-panel" style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '24px',
      border: `1px solid ${isPlaying ? themeColor : 'rgba(255,255,255,0.12)'}`,
      boxShadow: isPlaying ? `0 0 35px ${themeColor}40` : '0 10px 30px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      transition: 'all 0.4s ease'
    }}>
      {/* 100% Pure Native HTML5 Video Viewport (Zero 2D Canvas Overlays / Zero Image Shaking) */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '420px',
        background: '#05070a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {/* Pure Native HTML5 Video Player */}
        <video
          ref={videoRef}
          src={activeVideoUrl}
          poster={figure?.portraitUrl}
          controls
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            if (onSpeechEnd) onSpeechEnd();
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: isPlaying ? 'brightness(1.04)' : 'brightness(0.95)',
            transition: 'filter 0.3s ease'
          }}
        />

        {/* Play Overlay Button */}
        {!isPlaying && !isGenerating && (
          <button
            onClick={handlePlayVideo}
            style={{
              position: 'absolute',
              zIndex: 8,
              background: 'rgba(0, 0, 0, 0.75)',
              border: `2px solid ${themeColor}`,
              color: '#fff',
              padding: '12px 24px',
              borderRadius: '30px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: `0 4px 20px ${themeColor}50`,
              transition: 'transform 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
          >
            <span style={{ fontSize: '1.2rem', color: themeColor }}>▶</span>
            {figure?.name} AI 비디오 영상 재생
          </button>
        )}

        {/* Top Badge */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          zIndex: 5,
          pointerEvents: 'none'
        }}>
          <span className="badge" style={{
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            color: themeColor,
            border: `1px solid ${themeColor}60`
          }}>
            {figure?.name} • Pure MP4 Video Stream
          </span>

          {isPlaying && (
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.4)' }}>
              ● PLAYING
            </span>
          )}
        </div>

        {/* Active Equalizer Indicator */}
        {isPlaying && (
          <div style={{
            position: 'absolute',
            bottom: '50px',
            right: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(0,0,0,0.75)',
            padding: '6px 14px',
            borderRadius: '20px',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            zIndex: 5,
            pointerEvents: 'none'
          }}>
            <div className="speaking-bar" />
            <div className="speaking-bar" />
            <div className="speaking-bar" />
            <div className="speaking-bar" />
            <span style={{ fontSize: '0.78rem', color: '#fff', marginLeft: '4px', fontWeight: '600' }}>
              AI 비디오 재생 중
            </span>
          </div>
        )}

        {isGenerating && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 7, 10, 0.88)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            zIndex: 10
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              border: `4px solid ${themeColor}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '600' }}>
              AI 비디오 로딩 중...
            </p>
          </div>
        )}
      </div>

      {/* Subtitle & Controls Bar */}
      <div style={{
        width: '100%',
        padding: '16px 24px',
        background: 'rgba(12, 16, 24, 0.9)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)' }}>
            <span>비디오 소스: <strong style={{ color: 'var(--accent-gold)' }}>{activeVideoUrl}</strong></span>
          </div>

          <button
            onClick={handlePlayVideo}
            disabled={isPlaying}
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: '0.8rem', background: 'linear-gradient(135deg, #e0a96d 0%, #c98844 100%)' }}
          >
            ▶ MP4 동영상 재생
          </button>
        </div>

        {speechText && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '12px 16px',
            borderRadius: '10px',
            borderLeft: `4px solid ${themeColor}`,
            fontSize: '0.95rem',
            lineHeight: '1.5',
            color: '#f1f5f9',
            fontFamily: 'var(--font-serif)'
          }}>
            "{speechText}"
          </div>
        )}
      </div>
    </div>
  );
});

export default AvatarVideoPlayer;

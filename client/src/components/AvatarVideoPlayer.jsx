import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const AvatarVideoPlayer = forwardRef(({ figure, speechText, aiVideoResult, dialogueResult, isGenerating, onSpeechEnd }, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeVideoUrl, setActiveVideoUrl] = useState(null);
  const videoRef = useRef(null);

  // Extract active AI video result and ensure it belongs to the CURRENT figure!
  const activeAi = dialogueResult?.aiVideoResult || aiVideoResult;
  const belongsToCurrentFigure = Boolean(
    (!activeAi || !activeAi.figureId || activeAi.figureId === figure?.id) &&
    (!dialogueResult || !dialogueResult.figure || dialogueResult.figure.id === figure?.id)
  );

  // Extract video candidates
  const activeVideoUrlCandidate = dialogueResult?.videoUrl || activeAi?.videoUrl;
  const rawList = dialogueResult?.videoList || activeAi?.videoList || (activeVideoUrlCandidate ? [activeVideoUrlCandidate] : []);
  const videoPlaylist = Array.isArray(rawList) && rawList.length > 0 ? rawList : (activeVideoUrlCandidate ? [activeVideoUrlCandidate] : []);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const isTalkingMode = Boolean(belongsToCurrentFigure && videoPlaylist.length > 0 && activeVideoUrlCandidate);
  const currentClipUrl = isTalkingMode ? (videoPlaylist[currentClipIndex] || videoPlaylist[0]) : null;

  // Reset clip index when figure or dialogue changes
  useEffect(() => {
    setCurrentClipIndex(0);
  }, [figure?.id, dialogueResult?.query, dialogueResult?.speechText]);

  useImperativeHandle(ref, () => ({
    playWithSound: () => {
      handlePlayVideo();
    }
  }));

  const handlePlayVideo = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
      setIsMuted(false);
      
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.warn('[Video Player] User gesture play note:', err.message);
        });
      }
    }
  };

  // Video source orchestration: Chained Talking Video Clips vs Standby Portrait Photo
  useEffect(() => {
    if (!videoRef.current) return;

    if (isTalkingMode && currentClipUrl) {
      setActiveVideoUrl(currentClipUrl);
      const targetSrc = currentClipUrl.startsWith('http') ? currentClipUrl : `${window.location.origin}${currentClipUrl}`;
      if (videoRef.current.src !== targetSrc) {
        videoRef.current.src = currentClipUrl;
      }
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
      videoRef.current.loop = false;
      setIsMuted(false);

      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(err => {
          console.warn('[Video Player] Unmuted autoplay blocked by browser policy, trying muted fallback:', err.message);
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().then(() => {
              setIsPlaying(true);
            }).catch(mutedErr => {
              console.warn('[Video Player] Muted autoplay also blocked:', mutedErr.message);
              setIsPlaying(false);
            });
          }
        });
      }
    } else {
      setActiveVideoUrl(null);
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
    }
  }, [currentClipUrl, figure?.id, isTalkingMode]);

  const themeColor = figure?.themeColor || '#f3c623';

  return (
    <div className="glass-panel" style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '20px',
      border: `1px solid ${isPlaying ? themeColor : 'rgba(255,255,255,0.12)'}`,
      boxShadow: isPlaying ? `0 0 35px ${themeColor}40` : '0 10px 30px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      transition: 'all 0.3s ease',
      width: '100%',
      height: '520px',
      minHeight: '520px',
      maxHeight: '520px',
      boxSizing: 'border-box'
    }}>
      {/* Upper Screen Viewport: Exactly 440px Fixed Height */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '440px',
        minHeight: '440px',
        maxHeight: '440px',
        background: '#05070a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        {/* Permanent Video Element in DOM to avoid unmount/remount race conditions */}
        <video
          ref={videoRef}
          src={isTalkingMode && currentClipUrl ? currentClipUrl : undefined}
          poster={figure?.portraitUrl}
          playsInline
          preload="auto"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            if (currentClipIndex < videoPlaylist.length - 1) {
              console.log(`[Chained Video Player] Transitioning to Clip ${currentClipIndex + 2} of ${videoPlaylist.length}`);
              setCurrentClipIndex(prev => prev + 1);
            } else {
              setIsPlaying(false);
              if (onSpeechEnd) onSpeechEnd();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'brightness(1.04)',
            transition: 'filter 0.3s ease',
            display: (isTalkingMode && currentClipUrl) ? 'block' : 'none'
          }}
        />

        {/* Standby Portrait Image when not playing video */}
        {(!isTalkingMode || !currentClipUrl) && (
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src={figure?.portraitUrl}
              alt={figure?.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'brightness(1.0)',
                transition: 'all 0.3s ease'
              }}
            />
          </div>
        )}

        {/* Click-to-Play Overlay if genuine video is loaded but paused / blocked by autoplay policy */}
        {isTalkingMode && currentClipUrl && !isPlaying && !isGenerating && (
          <div
            onClick={handlePlayVideo}
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(5, 7, 10, 0.65)',
              backdropFilter: 'blur(4px)',
              cursor: 'pointer',
              zIndex: 10,
              transition: 'all 0.25s ease'
            }}
          >
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f3c623 0%, #e0a96d 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 35px rgba(243, 198, 35, 0.7)',
              cursor: 'pointer',
              transform: 'scale(1.0)',
              transition: 'transform 0.2s'
            }}>
              <span style={{ fontSize: '2.2rem', color: '#000', marginLeft: '6px' }}>▶</span>
            </div>
            <div style={{ marginTop: '14px', fontSize: '1.05rem', fontWeight: '700', color: '#fff' }}>
              {figure?.name} 답변 영상 재생
            </div>
            <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.8)', marginTop: '4px' }}>
              화면을 클릭하시면 음성과 함께 영상이 즉시 재생됩니다
            </div>
          </div>
        )}

        {/* Unmute notification button if browser forced muted autoplay */}
        {isTalkingMode && isPlaying && isMuted && (
          <button
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.muted = false;
                setIsMuted(false);
              }
            }}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              padding: '8px 16px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: '#fff',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              cursor: 'pointer',
              zIndex: 12,
              boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
              animation: 'pulse 1.5s infinite'
            }}
          >
            🔇 소리 켜기 (클릭)
          </button>
        )}

        {/* Top Identification Badge */}
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
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            color: themeColor,
            border: `1px solid ${themeColor}60`
          }}>
            {figure?.name} • {isTalkingMode ? `사료 대화 영상${videoPlaylist.length > 1 ? ` (${currentClipIndex + 1}/${videoPlaylist.length}부 연속 재생)` : ''}` : '대기 모드'}
          </span>

          {isPlaying && (
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.4)' }}>
              {isMuted ? '🔇 음소거 재생 중' : '🔊 재생 중'}
            </span>
          )}
        </div>

        {isPlaying && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
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
              음성 및 비디오 재생 중
            </span>
          </div>
        )}

        {/* Dedicated "영상을 생성하고 있습니다. 잠시만 기다려 주세요..." Waiting Screen */}
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
            gap: '16px',
            zIndex: 20,
            padding: '24px',
            textAlign: 'center'
          }}>
            {/* Current Figure's Portrait Thumbnail (NEVER Kim Koo) */}
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              overflow: 'hidden',
              border: `3px solid ${themeColor}`,
              boxShadow: `0 0 25px ${themeColor}60`
            }}>
              <img
                src={figure?.portraitUrl}
                alt={figure?.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {/* Pulsing Spinner */}
            <div style={{
              width: '38px',
              height: '38px',
              border: `3px solid ${themeColor}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />

            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#fff', letterSpacing: '-0.2px' }}>
                [{figure?.name}] 영상을 생성하고 있습니다
              </div>
              <div style={{ fontSize: '0.88rem', color: 'var(--accent-gold)', marginTop: '4px', fontWeight: '600' }}>
                잠시만 기다려 주세요...
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-sub)', marginTop: '6px' }}>
                영상이 완성되는 대로 백엔드에 자동 저장되어 재생됩니다
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Bottom Control Bar (80px) */}
      <div style={{
        width: '100%',
        height: '80px',
        minHeight: '80px',
        maxHeight: '80px',
        padding: '12px 24px',
        background: 'rgba(12, 16, 24, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.1rem' }}>🎬</span>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: '700', color: themeColor }}>
              {figure?.name || '역사 인물'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
              HD 비디오 스트림 {isPlaying ? '• 🔊 음성 재생 중' : '• 대기 상태'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handlePlayVideo}
            disabled={isPlaying || isGenerating}
            className="btn-primary"
            style={{
              padding: '8px 20px',
              fontSize: '0.82rem',
              fontWeight: '700',
              background: (isPlaying || isGenerating) ? '#475569' : 'linear-gradient(135deg, #e0a96d 0%, #c98844 100%)',
              cursor: (isPlaying || isGenerating) ? 'default' : 'pointer'
            }}
          >
            {isGenerating ? '영상 생성 중...' : isPlaying ? '🔊 재생 중...' : '▶ MP4 동영상 재생'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default AvatarVideoPlayer;

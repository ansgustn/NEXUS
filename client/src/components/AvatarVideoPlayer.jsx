import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const AvatarVideoPlayer = forwardRef(({ figure, speechText, aiVideoResult, dialogueResult, isGenerating, onSpeechEnd }, ref) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const idleVideoRef = useRef(null);

  const [hasEnded, setHasEnded] = useState(false);

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

  const resolveMediaUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    // In dev mode (Vite on port 5173), Express port 3001 provides instant 28ms HTTP 206 streaming
    if (typeof window !== 'undefined' && window.location.port === '5173') {
      return `http://${window.location.hostname}:3001${url.startsWith('/') ? url : '/' + url}`;
    }
    return url;
  };

  const isTalkingMode = Boolean(!hasEnded && belongsToCurrentFigure && videoPlaylist.length > 0 && activeVideoUrlCandidate);
  const rawClipUrl = isTalkingMode ? (videoPlaylist[currentClipIndex] || videoPlaylist[0]) : null;
  const currentClipUrl = resolveMediaUrl(rawClipUrl);
  const activeAudioUrl = resolveMediaUrl(belongsToCurrentFigure ? (dialogueResult?.audioUrl || activeAi?.audioUrl) : null);
  const showTalkingVideo = Boolean(isTalkingMode && currentClipUrl && !hasEnded);
  const rawIdleVideoUrl = figure?.idleVideoUrl || `/videos/idle_blink_${figure?.id || 'kim-koo'}.mp4`;
  const idleVideoUrl = resolveMediaUrl(rawIdleVideoUrl);

  // Reset clip index and ended state when figure or dialogue changes
  useEffect(() => {
    setCurrentClipIndex(0);
    setHasEnded(false);
  }, [figure?.id, dialogueResult?.speechText, dialogueResult?.query, activeVideoUrlCandidate]);

  // Synchronous user-gesture priming to authorize browser unmuted media playback
  const ensureUnmuted = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
    }
    setIsMuted(false);
  };

  useEffect(() => {
    const handleGlobalInteraction = () => {
      ensureUnmuted();
    };
    window.addEventListener('click', handleGlobalInteraction, { passive: true });
    window.addEventListener('touchstart', handleGlobalInteraction, { passive: true });
    window.addEventListener('keydown', handleGlobalInteraction, { passive: true });
    return () => {
      window.removeEventListener('click', handleGlobalInteraction);
      window.removeEventListener('touchstart', handleGlobalInteraction);
      window.removeEventListener('keydown', handleGlobalInteraction);
    };
  }, []);

  const primeMedia = (candidateUrl = null) => {
    try {
      ensureUnmuted();
      if (candidateUrl && videoRef.current) {
        const resolved = resolveMediaUrl(candidateUrl);
        if (resolved && videoRef.current.src !== resolved) {
          videoRef.current.src = resolved;
        }
      }
      if (videoRef.current) {
        const vp = videoRef.current.play();
        if (vp !== undefined) {
          vp.then(() => {
            setIsPlaying(true);
            setIsMuted(false);
            if (!showTalkingVideo && !candidateUrl) videoRef.current.pause();
          }).catch(() => {});
        }
      }
      if (idleVideoRef.current) {
        idleVideoRef.current.play().catch(() => {});
      }
    } catch (e) {}
  };

  const stopMedia = () => {
    try {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setIsPlaying(false);
      setHasEnded(true);
      if (idleVideoRef.current) {
        idleVideoRef.current.currentTime = 0;
        idleVideoRef.current.play().catch(() => {});
      }
    } catch (e) {
      console.warn('stopMedia error:', e);
    }
  };

  const handleTogglePlayOrUnmute = () => {
    ensureUnmuted();
    if (showTalkingVideo && videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn('Play error:', e));
      } else {
        videoRef.current.currentTime = 0;
        videoRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn('Play error:', e));
      }
    } else if (!activeVideoUrlCandidate && activeAudioUrl && audioRef.current) {
      audioRef.current.muted = false;
      audioRef.current.volume = 1.0;
      audioRef.current.currentTime = 0;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn('Audio play error:', e));
    }
  };

  useImperativeHandle(ref, () => ({
    primeMedia,
    stopMedia,
    playWithSound: handleTogglePlayOrUnmute,
    unmute: ensureUnmuted,
    isWebRTC: false
  }));

  // Standalone audio playback ONLY when there is NO video at all, and it has not ended!
  useEffect(() => {
    if (!activeVideoUrlCandidate && !hasEnded && activeAudioUrl && audioRef.current) {
      audioRef.current.src = activeAudioUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
      audioRef.current.volume = 1.0;
      const p = audioRef.current.play();
      if (p !== undefined) {
        p.then(() => setIsPlaying(true)).catch(err => {
          console.warn('[Audio Player Autoplay]:', err.message);
        });
      }
    } else if (audioRef.current) {
      // Whenever a video is present or dialogue has ended: STRICTLY PAUSE AUDIO!
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [activeVideoUrlCandidate, activeAudioUrl, hasEnded]);

  // Ensure standby eye-blink loop video plays smoothly when figure changes or talking ends
  useEffect(() => {
    if (!showTalkingVideo && idleVideoRef.current) {
      idleVideoRef.current.muted = true;
      const p = idleVideoRef.current.play();
      if (p !== undefined) {
        p.catch(() => {});
      }
    }
  }, [figure?.id, showTalkingVideo, hasEnded]);

  // MP4 video source orchestration (Plays genuine high-definition talking avatar video with embedded audio)
  useEffect(() => {
    if (!videoRef.current) return;

    if (showTalkingVideo && currentClipUrl) {
      let isMounted = true;
      console.log('🎬 [Authentic Video Player] Loading clip:', currentClipUrl);

      const playAttempt = async () => {
        try {
          videoRef.current.currentTime = 0;
          videoRef.current.muted = false;
          videoRef.current.volume = 1.0;
          await videoRef.current.play();
          if (isMounted) {
            setIsPlaying(true);
            setIsMuted(false);
          }
        } catch (unmutedErr) {
          console.warn('[Video Player] Unmuted playback blocked, attempting recovery:', unmutedErr.message);
          if (!isMounted) return;

          // Register one-time listener to unmute immediately on the user's very next touch/click!
          const onNextInteraction = () => {
            if (videoRef.current) {
              videoRef.current.muted = false;
              videoRef.current.volume = 1.0;
              setIsMuted(false);
            }
          };
          window.addEventListener('click', onNextInteraction, { once: true });
          window.addEventListener('touchstart', onNextInteraction, { once: true });

          try {
            videoRef.current.muted = true;
            await videoRef.current.play();
            if (isMounted) {
              setIsPlaying(true);
              setIsMuted(true);
            }
          } catch (mutedErr) {
            console.warn('[Video Player] Muted play also blocked:', mutedErr.message);
            if (isMounted) setIsPlaying(false);
          }
        }
      };

      playAttempt();

      return () => {
        isMounted = false;
      };
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      if (!activeVideoUrlCandidate) {
        setIsPlaying(false);
      }
    }
  }, [currentClipUrl, showTalkingVideo, figure?.id]);

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
      <div 
        onClick={handleTogglePlayOrUnmute}
        style={{
          position: 'relative',
          width: '100%',
          height: '440px',
          minHeight: '440px',
          maxHeight: '440px',
          background: '#05070a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          cursor: 'pointer'
        }}
        title="클릭하여 재생 또는 소리 켜기"
      >
        {/* 1. Genuine High-Definition Talking Video Player (Primary Talking Mode) */}
        <video
          ref={videoRef}
          src={showTalkingVideo ? currentClipUrl : undefined}
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
              console.log('🎬 [Video Player] Video playback completed -> Switch to Idle Standby Video');
              if (videoRef.current) {
                videoRef.current.pause();
              }
              if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
              }
              setIsPlaying(false);
              setHasEnded(true);
              if (idleVideoRef.current) {
                idleVideoRef.current.currentTime = 0;
                idleVideoRef.current.play().catch(() => {});
              }
              if (onSpeechEnd) onSpeechEnd();
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            filter: 'brightness(1.04)',
            transition: 'filter 0.3s ease',
            display: showTalkingVideo ? 'block' : 'none'
          }}
        />

        {/* 2. Standby High-Definition Eye-Blink Loop Video (Alive during IDLE, Figure Selection, and Audio playback) */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: showTalkingVideo ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <video
            ref={idleVideoRef}
            key={`idle-video-${figure?.id}`}
            src={idleVideoUrl}
            poster={figure?.portraitUrl}
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: isPlaying ? 'brightness(1.08)' : 'brightness(1.0)',
              transform: isPlaying ? 'scale(1.015)' : 'scale(1.0)',
              transition: 'all 0.3s ease'
            }}
          />
          {isPlaying && (
            <div style={{
              position: 'absolute',
              bottom: '24px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(0, 0, 0, 0.8)',
              color: themeColor,
              fontSize: '0.8rem',
              fontWeight: '700',
              border: `1px solid ${themeColor}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(8px)',
              animation: 'pulse 1.5s infinite'
            }}>
              <span>🔊</span>
              <span>{figure?.name} 음성 증언 발화 중</span>
            </div>
          )}
        </div>

        {/* Hidden Audio Element for Voice Playback (Strictly audio-only fallback) */}
        <audio
          ref={audioRef}
          onPlay={() => setIsPlaying(true)}
          onEnded={() => {
            if (audioRef.current) {
              audioRef.current.pause();
              audioRef.current.currentTime = 0;
            }
            setIsPlaying(false);
            setHasEnded(true);
            if (onSpeechEnd) onSpeechEnd();
          }}
          style={{ display: 'none' }}
        />

        {/* Prominent Play Overlay Button if Autoplay was completely blocked */}
        {showTalkingVideo && !isPlaying && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlayOrUnmute();
            }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              padding: '14px 28px',
              borderRadius: '30px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              fontSize: '0.95rem',
              fontWeight: '800',
              cursor: 'pointer',
              zIndex: 15,
              boxShadow: '0 0 30px rgba(245, 158, 11, 0.7)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              animation: 'pulse 1.8s infinite'
            }}
          >
            <span>▶</span>
            <span>답변 영상 재생 (소리 켜기)</span>
          </button>
        )}

        {/* Unmute notification button if browser forced muted autoplay */}
        {isMuted && isPlaying && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef.current) {
                videoRef.current.muted = false;
                videoRef.current.volume = 1.0;
              }
              setIsMuted(false);
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
              animation: 'pulse 1.5s infinite',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🔇</span>
            <span>소리 켜기 (클릭)</span>
          </button>
        )}

        {/* Top Status & Character Badge (Clean Museum UI) */}
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
            {figure?.name}
          </span>

          {isPlaying ? (
            <span className="badge" style={{
              background: 'rgba(16, 185, 129, 0.25)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.5)'
            }}>
              🔊 {isMuted ? '영상 재생 중 (음소거됨)' : '답변 발화 중'}
            </span>
          ) : (
            <span className="badge" style={{
              background: 'rgba(0, 0, 0, 0.65)',
              color: 'var(--text-sub)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              🏛️ 대기 상태
            </span>
          )}
        </div>
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
          <span style={{ fontSize: '1.1rem' }}>{isPlaying ? '🔊' : '🏛️'}</span>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: '700', color: themeColor }}>
              {figure?.name || '역사 인물'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
              {isPlaying 
                ? (isMuted ? '• 🔇 영상 재생 중 (소리를 켜려면 화면 클릭)' : '• 🔊 역사 증언 발화 중')
                : '• 대기 상태 (질문을 선택하거나 답변을 재생하세요)'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Sound / Replay Button */}
          <button
            onClick={handleTogglePlayOrUnmute}
            disabled={isGenerating}
            className="btn-primary"
            style={{
              padding: '8px 18px',
              fontSize: '0.82rem',
              fontWeight: '700',
              background: isPlaying
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #e0a96d 0%, #c98844 100%)',
              cursor: 'pointer'
            }}
          >
            {isPlaying ? '🔊 다시 듣기' : '▶ 답변 재생'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default AvatarVideoPlayer;

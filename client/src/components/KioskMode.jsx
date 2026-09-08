import React, { useState, useEffect } from 'react';
import FigureSelector from './FigureSelector';
import AvatarVideoPlayer from './AvatarVideoPlayer';
import VideoGallery from './VideoGallery';

export default function KioskMode({ figures }) {
  const [selectedFigure, setSelectedFigure] = useState(figures[0] || null);
  const [queryInput, setQueryInput] = useState('');
  const [dialogueResult, setDialogueResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dialogueError, setDialogueError] = useState(null);

  // Page Switcher: 'main' (대화 체험존) vs 'gallery' (영상 둘러보기 전용 페이지)
  const [viewMode, setViewMode] = useState('main');

  // Background Video Generation State
  const [backgroundTask, setBackgroundTask] = useState(null);

  useEffect(() => {
    if (figures.length > 0 && !selectedFigure) {
      setSelectedFigure(figures[0]);
    }
  }, [figures]);

  // Web Speech API STT Handler
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('사용하시는 브라우저가 STT 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 브라우저를 사용해 주세요.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQueryInput(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.warn('STT Error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // CRITICAL: Reset dialogue and video state on figure switch so Kim Koo's video never bleeds over!
  useEffect(() => {
    if (selectedFigure) {
      setDialogueResult(null); // Reset previous figure's dialogue & video immediately!
      setQueryInput('');
      setDialogueError(null);
      setBackgroundTask(null);
      setIsLoading(false);
    }
  }, [selectedFigure?.id]);

  // Selection from VideoGallery (switches figure, sets video, and returns to main conversation page)
  const handleSelectGalleryVideo = (item) => {
    if (item.figureId !== selectedFigure?.id) {
      const matched = figures.find(f => f.id === item.figureId);
      if (matched) setSelectedFigure(matched);
    }

    const galleryVideoResult = {
      success: true,
      valid: true,
      isCacheHit: true,
      isPreset: true,
      figure: {
        id: item.figureId,
        name: item.figureName,
        portraitUrl: item.portraitUrl,
        themeColor: item.themeColor
      },
      speechText: item.speechText,
      videoUrl: item.videoUrl,
      audioUrl: item.audioUrl,
      aiVideoResult: {
        success: true,
        figureId: item.figureId,
        provider: item.tag,
        videoUrl: item.videoUrl,
        audioUrl: item.audioUrl,
        speechText: item.speechText,
        status: 'ready'
      }
    };

    setDialogueResult(galleryVideoResult);
    setViewMode('main'); // Immediately return to Main Conversation page with fixed video player
  };

  const fetchDialogue = async (figureId, queryText) => {
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    setIsLoading(true);
    setDialogueError(null);

    // Provide immediate visual feedback that video generation is underway
    setBackgroundTask({
      isGenerating: true,
      figureId,
      figureName: selectedFigure?.name || '역사 인물',
      query: cleanQuery,
      status: 'generating',
      result: null
    });

    try {
      let data = null;
      try {
        const res = await fetch('http://localhost:3001/api/dialogue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figureId, query: cleanQuery })
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {
        console.warn('Direct 3001 dialogue fetch error:', e);
      }

      if (data && data.valid === false) {
        setDialogueError(data.message || '질문을 할 수 없습니다.');
        setBackgroundTask(null);
        setIsLoading(false);
        return;
      }

      if (data && data.success) {
        const rawList = data.videoList || data.aiVideoResult?.videoList || (data.videoUrl ? [data.videoUrl] : []);
        const readyResult = {
          ...data,
          videoList: rawList,
          aiVideoResult: {
            ...data.aiVideoResult,
            success: Boolean(data.videoUrl),
            figureId,
            provider: data.isCacheHit ? '지능형 캐시' : 'AI 영상 생성 엔진',
            videoUrl: data.videoUrl || null,
            videoList: rawList,
            audioUrl: data.audioUrl,
            speechText: data.speechText,
            status: data.videoUrl ? 'ready' : 'generating'
          }
        };

        setDialogueResult(readyResult);
        setBackgroundTask(null);
      } else if (data && !data.success) {
        setDialogueError(data.message || '질문을 할 수 없습니다.');
        setBackgroundTask(null);
      }
    } catch (err) {
      console.error('Failed to fetch dialogue:', err);
      setDialogueError('질문을 처리하는 중 오류가 발생했습니다.');
      setBackgroundTask(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAsk = (e) => {
    e.preventDefault();
    if (!queryInput.trim() || !selectedFigure) return;
    fetchDialogue(selectedFigure.id, queryInput);
  };

  const sampleQuestions = {
    'kim-koo': ['백범 김구 선생님의 소원은 무엇이었나요?', '상하이 임시정부에 대해 말씀해주세요.', '높은 문화의 힘에 대해 말씀해주세요.'],
    'king-sejong': ['훈민정음을 창제하신 까닭은 무엇인가요?', '장영실과 발명품에 대해 말씀해주세요.', '백성을 위한 정책은 무엇이었나요?'],
    'yi-sun-sin': ['명량해전에서 12척 배로 어떻게 이겼나요?', '거북선은 어떤 구조로 만들어졌나요?', '난중일기를 쓰신 심정은 어떠하셨나요?'],
    'yu-gwan-sun': ['아우내 장터 만세 운동 이야기를 해주세요.', '옥중에서도 만세를 외치신 이유가 무엇인가요?', '청년들에게 하실 말씀이 있으신가요?'],
    'shin-saimdang': ['초충도 그림을 그리실 때 마음은 어떠셨나요?', '율곡 이이를 가르치신 교육관은 무엇인가요?', '자연과 시에 대한 생각을 나누어주세요.']
  };

  const currentQuestions = sampleQuestions[selectedFigure?.id] || [
    '업적에 대해 말씀해주세요.',
    '삶의 좌우명은 무엇이었나요?'
  ];

  const currentSpeechText = dialogueResult?.speechText || selectedFigure?.description || '질문을 하시면 역사 인물이 음성과 함께 답변을 들려드립니다.';
  const themeColor = selectedFigure?.themeColor || '#f3c623';

  return (
    <div style={{
      maxWidth: '1440px',
      margin: '0 auto',
      padding: '0 20px 10px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {/* Top Header Bar: Clean & Compact with Page Switcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 4px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.2rem' }}>🏛️</span>
          <h2 style={{
            fontSize: '1.15rem',
            color: '#fff',
            fontFamily: 'var(--font-serif)',
            margin: 0,
            letterSpacing: '-0.3px'
          }}>
            역사 인물 대화 체험존
          </h2>
          <span style={{
            fontSize: '0.78rem',
            color: 'var(--text-sub)',
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '2px 10px',
            borderRadius: '12px',
            marginLeft: '6px'
          }}>
            {selectedFigure?.name}
          </span>
        </div>

        {/* Page Switcher Tabs */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '3px',
          borderRadius: '10px',
          display: 'flex',
          gap: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            onClick={() => setViewMode('main')}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: viewMode === 'main' ? 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)' : 'transparent',
              color: viewMode === 'main' ? '#000' : 'var(--text-sub)'
            }}
          >
            💬 대화 체험존 (1페이지)
          </button>
          <button
            onClick={() => setViewMode('gallery')}
            style={{
              padding: '6px 16px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: viewMode === 'gallery' ? 'linear-gradient(135deg, #f3c623 0%, #e0a96d 100%)' : 'transparent',
              color: viewMode === 'gallery' ? '#000' : 'var(--text-sub)'
            }}
          >
            🎬 영상 둘러보기 (2페이지)
          </button>
        </div>
      </div>

      {/* PAGE 1: 메인 대화 체험존 (인물선택 -> 질문 -> 답변 -> 고정 크기 영상재생) */}
      {viewMode === 'main' ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr 1fr',
          gap: '16px',
          alignItems: 'start'
        }}>
          {/* Left Column: Flow of Steps 1, 2, 3 + Gallery Transition Link */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* Step 1: 인물 선택 (Horizontal Compact Avatars) */}
            <div className="glass-panel" style={{ padding: '12px 14px', borderRadius: '14px' }}>
              <FigureSelector
                figures={figures}
                selectedFigure={selectedFigure}
                onSelectFigure={(fig) => setSelectedFigure(fig)}
                onAddNewFigure={(newFig) => {
                  figures.unshift(newFig);
                  setSelectedFigure(newFig);
                }}
              />
            </div>

            {/* Step 2: 질문하기 (Mic + Input + Quick Chips) */}
            <div className="glass-panel" style={{
              padding: '12px 14px',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  color: '#4ea8de',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: 0
                }}>
                  <span>2️⃣</span>
                  <span>질문하기</span>
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  음성 또는 텍스트로 자유롭게 질문하세요
                </span>
              </div>

              {/* Guardrail Warning Banner */}
              {dialogueError && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#f87171',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '0.82rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>⚠️</span>
                  <span>{dialogueError}</span>
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={handleAsk} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder={isListening ? "🎙️ 말씀하시는 내용을 듣고 있습니다..." : `${selectedFigure?.name || '역사 인물'}에게 질문을 입력하세요...`}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: isListening ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.12)',
                    background: isListening ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.35)',
                    color: 'var(--text-main)',
                    fontSize: '0.86rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={startListening}
                  title="마이크 음성으로 질문"
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: isListening ? '1px solid #ef4444' : '1px solid var(--accent-gold)',
                    background: isListening ? '#ef4444' : 'rgba(243, 198, 35, 0.12)',
                    color: isListening ? '#fff' : 'var(--accent-gold)',
                    fontWeight: '700',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isListening ? '듣는 중...' : '🎤 마이크'}
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isLoading}
                  style={{
                    padding: '9px 16px',
                    fontSize: '0.82rem',
                    fontWeight: '700',
                    background: isLoading ? '#475569' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    cursor: isLoading ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isLoading ? '답변 조회 중...' : '질문하기 ➔'}
                </button>
              </form>

              {/* Quick Sample Question Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {currentQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setQueryInput(q);
                      fetchDialogue(selectedFigure.id, q);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '4px 10px',
                      color: 'var(--text-sub)',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-gold)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
                  >
                    💡 {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: 인물의 답변 (Speech Text Quote Card) */}
            <div className="glass-panel" style={{
              padding: '14px 18px',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              borderLeft: `4px solid ${themeColor}`,
              background: 'rgba(255, 255, 255, 0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  margin: 0
                }}>
                  <span>3️⃣</span>
                  <span>{selectedFigure?.name}의 답변</span>
                </h3>
                <span style={{
                  fontSize: '0.7rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span>🔊</span>
                  <span>동영상 음성 싱크</span>
                </span>
              </div>

              {/* Direct Persona Speech Text */}
              <p style={{
                fontSize: '0.96rem',
                lineHeight: '1.6',
                color: '#f8fafc',
                fontFamily: 'var(--font-serif)',
                margin: 0,
                padding: '2px 0'
              }}>
                "{currentSpeechText}"
              </p>
            </div>

            {/* Transition Navigation Card: Go to Page 2 (Video Archive Gallery) */}
            <div
              onClick={() => setViewMode('gallery')}
              className="glass-card"
              style={{
                padding: '14px 18px',
                borderRadius: '14px',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12) 0%, rgba(147, 51, 234, 0.15) 100%)',
                border: '1px solid rgba(147, 51, 234, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.25s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '1.4rem' }}>🎬</span>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>역사 명장면 영상 아카이브 둘러보기</span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'rgba(243, 198, 35, 0.2)',
                      color: 'var(--accent-gold)',
                      fontWeight: '600'
                    }}>
                      사료 영상 둘러보기
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-sub)', marginTop: '2px' }}>
                    세종대왕 훈민정음 등 다양한 영상을 전용 페이지에서 둘러보세요
                  </div>
                </div>
              </div>
              <button
                type="button"
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                영상 둘러보기 ➔
              </button>
            </div>
          </div>

          {/* Right Column: Step 4: 영상 재생 (Avatar Video Player with 100% FIXED SIZING) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Step 4 Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 4px'
            }}>
              <h3 style={{
                fontSize: '0.88rem',
                fontWeight: '700',
                color: '#a78bfa',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                margin: 0
              }}>
                <span>4️⃣</span>
                <span>AI 영상 재생</span>
              </h3>
              <span style={{ fontSize: '0.72rem', color: themeColor, fontWeight: '600' }}>
                {selectedFigure?.name} • 고정 뷰포트
              </span>
            </div>

            {/* Main Avatar Video Player with 100% FIXED 520px height and dedicated Waiting Overlay */}
            <AvatarVideoPlayer
              figure={selectedFigure}
              speechText={dialogueResult?.speechText}
              aiVideoResult={dialogueResult?.aiVideoResult}
              dialogueResult={dialogueResult}
              isGenerating={isLoading || backgroundTask?.isGenerating}
              onSpeechEnd={() => {
                console.log('🎬 [Speech Complete] Video finished');
              }}
            />
          </div>
        </div>
      ) : (
        /* PAGE 2: 역사 인물 영상 아카이브 둘러보기 전용 페이지 */
        <VideoGallery
          figures={figures}
          selectedFigure={selectedFigure}
          onSelectVideo={handleSelectGalleryVideo}
          currentVideoUrl={dialogueResult?.aiVideoResult?.videoUrl || dialogueResult?.videoUrl}
          onBackToMain={() => setViewMode('main')}
        />
      )}
    </div>
  );
}

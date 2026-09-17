import React, { useState, useEffect, useRef } from 'react';
import FigureSelector from './FigureSelector';
import AvatarVideoPlayer from './AvatarVideoPlayer';

export default function KioskMode({ figures }) {
  const [selectedFigure, setSelectedFigure] = useState(figures[0] || null);
  const [queryInput, setQueryInput] = useState('');
  const [pendingQuery, setPendingQuery] = useState('');
  const [dialogueResult, setDialogueResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [dialogueError, setDialogueError] = useState(null);

  const avatarPlayerRef = useRef(null);
  const abortControllerRef = useRef(null);

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
      if (selectedFigure) {
        fetchDialogue(selectedFigure.id, transcript);
      }
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

  // Distinct Historical Greetings & Personas
  const FIGURE_GREETINGS = {
    'kim-koo': '반갑소! 백범 김구입니다. 나의 소원은 오직 우리 대한의 완전한 자주독립과 높은 문화의 힘을 가진 나라가 되는 것이오. 그대와 독립과 미래에 대해 이야기 나누고 싶소.',
    'king-sejong': '과인은 조선의 제4대 국왕 세종이오. 백성이 제 뜻을 쉽게펴지 못함을 가엽게 여겨 훈민정음을 창제하였소. 우리의 글과 학문에 대해 무엇이든 물어보시오.',
    'yi-sun-sin': '나를 찾아온 이유가 무엇인가. 신에게는 아직 열두 척의 배가 남아있사옵니다. 사즉생 생즉사의 각오로 바다를 지킨 이야기를 들려주겠소.',
    'yu-gwan-sun': '대한 독립 만세! 저는 유관순입니다. 나라를 잃은 슬픔보다 독립을 향한 뜨거운 마음으로 만세를 불렀습니다. 우리 조국의 독립 이야기를 나누어 보아요.',
    'shin-saimdang': '어서 오세요. 신사임당입니다. 자연의 풀과 벌레를 관찰하며 시와 그림을 짓고, 율곡을 기르며 배움의 도리를 다했습니다. 예술과 가족의 마음에 대해 말씀드리겠습니다.'
  };

  const FIGURE_THINKINGS = {
    'kim-koo': '허허, 참으로 신선한 질문이구려. 내가 잠시 생각을 정리해 보겠소.',
    'king-sejong': '과인에게 참으로 흥미로운 물음이로다. 잠시 깊이 생각에 잠겨보겠노라.',
    'yi-sun-sin': '뜻밖의 물음이오. 잠시 바다를 바라보며 생각을 정리해 보겠소.',
    'yu-gwan-sun': '정말 대단한 생각이에요! 잠시만 생각할 시간을 주세요.',
    'shin-saimdang': '참으로 고운 질문이네요. 잠시 마음에 담아두고 생각을 해보겠습니다.'
  };

  const SAMPLE_QUESTIONS = {
    'kim-koo': ['백범 김구 선생님의 소원은 무엇이었나요?', '상하이 임시정부에 대해 말씀해주세요.', '높은 문화의 힘에 대해 말씀해주세요.'],
    'king-sejong': ['훈민정음을 창제하신 까닭은 무엇인가요?', '장영실과 발명품에 대해 말씀해주세요.', '백성을 위한 정책은 무엇이었나요?'],
    'yi-sun-sin': ['명량해전에서 12척 배로 어떻게 이겼나요?', '거북선은 어떤 구조로 만들어졌나요?', '난중일기를 쓰신 심정은 어떠하셨나요?'],
    'yu-gwan-sun': ['아우내 장터 만세 운동 이야기를 해주세요.', '옥중에서도 만세를 외치신 이유가 무엇인가요?', '청년들에게 하실 말씀이 있으신가요?'],
    'shin-saimdang': ['초충도 그림을 그리실 때 마음은 어떠셨나요?', '율곡 이이를 가르치신 교육관은 무엇인가요?', '자연과 시에 대한 생각을 나누어주세요.']
  };

  // Trigger natural persona self-introduction whenever selectedFigure changes
  useEffect(() => {
    if (selectedFigure) {
      // Stop ongoing speech when switching figures
      avatarPlayerRef.current?.stopMedia?.();

      const greeting = FIGURE_GREETINGS[selectedFigure.id] || selectedFigure.description || `${selectedFigure.name}입니다. 무엇이든 편하게 질문해 주세요.`;
      
      setDialogueResult({
        figure: selectedFigure,
        speechText: greeting,
        isGreeting: true,
        aiVideoResult: {
          success: true,
          figureId: selectedFigure.id,
          provider: '역사 인물 대화 아카이브',
          speechText: greeting,
          status: 'ready'
        }
      });

      setQueryInput('');
      setPendingQuery('');
      setDialogueError(null);
      setIsLoading(false);
      setIsSpeaking(false);
    }
  }, [selectedFigure?.id]);

  const fetchDialogue = async (figureId, queryText) => {
    const cleanQuery = queryText.trim();
    if (!cleanQuery) return;

    // 1. Immediately abort any existing pending network requests
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch (e) {}
    }
    const currentAbortController = new AbortController();
    abortControllerRef.current = currentAbortController;

    // 2. Immediately STOP any currently playing video/audio and prime playback
    const isPresetQuestion = (SAMPLE_QUESTIONS[figureId] || []).some(sq => cleanQuery.includes(sq) || sq.includes(cleanQuery));
    const candidateThinkingUrl = !isPresetQuestion ? `/videos/${figureId}_thinking.mp4` : null;

    if (avatarPlayerRef.current?.stopMedia) {
      avatarPlayerRef.current.stopMedia();
    }
    if (avatarPlayerRef.current?.primeMedia) {
      avatarPlayerRef.current.primeMedia(candidateThinkingUrl);
    }
    if (avatarPlayerRef.current?.unmute) {
      avatarPlayerRef.current.unmute();
    }

    // 3. If query is a new/un-cached question, IMMEDIATELY play Thinking Buffer Video!
    if (!isPresetQuestion) {
      const thinkingText = FIGURE_THINKINGS[figureId] || '신선한 질문이군요. 잠시 생각을 가다듬어 보겠습니다.';
      setDialogueResult({
        figure: selectedFigure,
        query: cleanQuery,
        isThinking: true,
        speechText: thinkingText,
        videoUrl: `/videos/${figureId}_thinking.mp4`,
        audioUrl: `/audio/${figureId}_thinking.mp3`,
        aiVideoResult: {
          success: true,
          figureId,
          provider: '생각 중...',
          videoUrl: `/videos/${figureId}_thinking.mp4`,
          audioUrl: `/audio/${figureId}_thinking.mp3`,
          speechText: thinkingText,
          status: 'ready'
        }
      });
      setIsSpeaking(true);
    }

    setIsLoading(true);
    setPendingQuery(cleanQuery);
    setDialogueError(null);

    try {
      let data = null;
      const reqBody = JSON.stringify({ figureId, query: cleanQuery, webrtcMode: false });

      try {
        const res = await fetch('/api/dialogue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: reqBody,
          signal: currentAbortController.signal
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // User interrupted with another question
        console.warn('Vite proxy /api/dialogue note:', e);
      }

      // If proxy did not return valid data, fallback to direct 3001 port using current host IP
      if (!data && !currentAbortController.signal.aborted) {
        try {
          const host = window.location.hostname || 'localhost';
          const res2 = await fetch(`http://${host}:3001/api/dialogue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: reqBody,
            signal: currentAbortController.signal
          });
          if (res2.ok) data = await res2.json();
        } catch (e2) {
          if (e2.name === 'AbortError') return;
          console.warn('Direct 3001 dialogue fetch note:', e2);
        }
      }

      if (currentAbortController.signal.aborted) return;

      if (data && data.valid === false) {
        // If server provided refusal video/speech, display and play it naturally!
        if (data.videoUrl || data.speechText) {
          setDialogueResult({
            ...data,
            query: cleanQuery,
            isRefusal: true,
            aiVideoResult: {
              success: true,
              figureId,
              provider: '예의 및 품위 안내',
              videoUrl: data.videoUrl || null,
              audioUrl: data.audioUrl || null,
              speechText: data.speechText,
              status: 'ready'
            }
          });
          setIsSpeaking(true);
        } else {
          setDialogueError(data.message || '질문을 할 수 없습니다.');
        }
        setIsLoading(false);
        return;
      }

      if (data && data.success) {
        const rawList = data.videoList || data.aiVideoResult?.videoList || (data.videoUrl ? [data.videoUrl] : []);
        const readyResult = {
          ...data,
          query: cleanQuery,
          videoList: rawList,
          aiVideoResult: {
            ...data.aiVideoResult,
            success: Boolean(data.videoUrl),
            figureId,
            provider: data.isCacheHit ? '지능형 캐시' : 'AI 영상 엔진',
            videoUrl: data.videoUrl || null,
            videoList: rawList,
            audioUrl: data.audioUrl,
            speechText: data.speechText,
            status: data.videoUrl ? 'ready' : 'generating'
          }
        };

        setDialogueResult(readyResult);
        setIsSpeaking(true);
      } else if (data && !data.success) {
        setDialogueError(data.message || '질문을 할 수 없습니다.');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Failed to fetch dialogue:', err);
      setDialogueError('질문을 처리하는 중 오류가 발생했습니다.');
    } finally {
      if (!currentAbortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const handleAsk = (e) => {
    e.preventDefault();
    if (!queryInput.trim() || !selectedFigure) return;
    fetchDialogue(selectedFigure.id, queryInput);
  };

  const currentQuestions = SAMPLE_QUESTIONS[selectedFigure?.id] || [
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
      {/* Top Header Bar: Clean & Compact Single Mode */}
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

        <div style={{
          fontSize: '0.78rem',
          color: isSpeaking ? '#34d399' : 'var(--text-muted)',
          background: isSpeaking ? 'rgba(52, 211, 153, 0.1)' : 'rgba(255, 255, 255, 0.05)',
          padding: '4px 12px',
          borderRadius: '12px',
          border: isSpeaking ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: '600'
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: isSpeaking ? '#34d399' : '#94a3b8',
            boxShadow: isSpeaking ? '0 0 8px #34d399' : 'none'
          }} />
          <span>{isSpeaking ? '답변 영상 재생 중' : '대기 모드 (눈 깜빡임)'}</span>
        </div>
      </div>

      {/* Main 대화 체험존: 인물선택 -> 질문 -> 답변 -> 고정 크기 영상재생 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr',
        gap: '16px',
        alignItems: 'start'
      }}>
        {/* Left Column: Flow of Steps 1, 2, 3 */}
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
                재생 중에도 새 질문을 누르면 즉시 이전 영상을 멈추고 새 답변을 재생합니다
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
                style={{
                  padding: '9px 16px',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {isLoading ? '답변 조회 중...' : '질문하기 ➔'}
              </button>
            </form>

            {/* Quick Sample Question Chips (Always clickable with instant interruption) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {currentQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQueryInput(q);
                    fetchDialogue(selectedFigure.id, q);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '5px 12px',
                    color: 'var(--text-sub)',
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-gold)';
                    e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.color = 'var(--text-sub)';
                  }}
                >
                  <span>💡</span>
                  <span>{q}</span>
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
            background: 'rgba(255, 255, 255, 0.03)',
            transition: 'all 0.2s ease'
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
                color: isSpeaking ? '#34d399' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <span>🔊</span>
                <span>{isSpeaking ? '동영상 음성 싱크 재생' : '대기 완료'}</span>
              </span>
            </div>

            {/* Direct Persona Speech Text or Active Thinking Feedback */}
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                <div style={{
                  width: '18px',
                  height: '18px',
                  border: `2px solid ${themeColor}`,
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0
                }} />
                <p style={{
                  fontSize: '0.94rem',
                  lineHeight: '1.5',
                  color: themeColor,
                  fontFamily: 'var(--font-serif)',
                  margin: 0,
                  fontWeight: '600'
                }}>
                  "{queryInput || '질문'}"에 대해 {selectedFigure?.name}이(가) 답변을 전합니다...
                </p>
              </div>
            ) : (
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
            )}
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
              {selectedFigure?.name} • {isSpeaking ? '재생 중' : '대기 화면'}
            </span>
          </div>

          {/* Main Avatar Video Player with 100% FIXED 520px height */}
          <AvatarVideoPlayer
            ref={avatarPlayerRef}
            figure={selectedFigure}
            speechText={dialogueResult?.speechText}
            aiVideoResult={dialogueResult?.aiVideoResult}
            dialogueResult={dialogueResult}
            isGenerating={false}
            onSpeechEnd={() => {
              console.log('🎬 [Speech Complete] Video finished -> Transition to Standby');
              setIsSpeaking(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}

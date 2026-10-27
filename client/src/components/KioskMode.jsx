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
  const [questionQueue, setQuestionQueue] = useState([]);

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
        enqueueOrAsk(transcript);
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
    'kim-koo': '신선한 질문이구려. 내가 잠시 옛 기억과 생각을 가다듬어 볼 터이니 조금만 기다려 주시게.',
    'king-sejong': '참으로 기발하고 신선한 물음이로다. 과인이 잠시 생각을 정리할 터이니 잠시 기다리시오.',
    'yi-sun-sin': '신선한 물음이오. 군무 중 잠시 뜻을 헤아려 볼 터이니 기다려 주시오.',
    'yu-gwan-sun': '참 새롭고 신선한 질문이네요! 잠시 제 생각을 정리해 볼 테니 조금만 기다려 주세요!',
    'shin-saimdang': '참으로 신선하고 뜻깊은 물음이군요. 제 마음에 떠오르는 생각을 가다듬어 말씀드리겠습니다.'
  };

  const SAMPLE_QUESTIONS = {
    'kim-koo': [
      '백범 김구 선생님의 소원은 무엇이었나요?',
      '상하이 임시정부에 대해 말씀해주세요.',
      '높은 문화의 힘에 대해 말씀해주세요.',
      '독립운동을 하시면서 가장 힘들거나 두려웠던 순간은 언제였고, 어떻게 극복하셨나요?',
      '지금 대한민국의 모습을 보시면 어떤 생각이 드시나요?'
    ],
    'king-sejong': [
      '훈민정음을 창제하신 까닭은 무엇인가요?',
      '장영실과 발명품에 대해 말씀해주세요.',
      '백성을 위한 정책은 무엇이었나요?',
      '요즘 시대의 사람들은 줄임말이나 신조어를 많이 쓰는데, 한글을 만든 창제자로서 어떻게 생각하시나요?',
      '집현전 학자들과 일 할때 갈등이 생기면 어떻게 해결하셨나요?'
    ],
    'yi-sun-sin': [
      '명량해전에서 12척 배로 어떻게 이겼나요?',
      '거북선은 어떤 구조로 만들어졌나요?',
      '바쁜 전쟁 중에도 매일 난중일기를 쓰신 특별한 이유가 있나요?',
      '전쟁에 대한 두려움과 압박감이 엄청 컸을 것 같은데 어떻게 마음을 다스리셨나요?',
      '난중일기를 쓰신 심정은 어떠하셨나요?'
    ],
    'yu-gwan-sun': [
      '아우내 장터 만세 운동 이야기를 해주세요.',
      '옥중에서도 만세를 외치신 이유가 무엇인가요?',
      '어린 나이에 만세 운동을 주도하셨는데, 무섭거나 망설여지지는 않으셨나요?',
      '학창 시절 만세 운동 외에 꿈꾸셨던 미래나 하고 싶었던 일은 무엇이였나요?',
      '10대 학생들에게 전하고 싶은 말이 있으신가요?'
    ],
    'shin-saimdang': [
      '초충도 그림을 그리실 때 마음은 어떠셨나요?',
      '율곡 이이를 가르치신 교육관은 무엇인가요?',
      '조선 시대라는 제약 속에서도 자신만의 에술을 끝까지 포기하지 않은 비결이 무엇일까요?',
      '가정환경 때문에 자신의 꿈이나 재능을 펼치기 힘들어하는 학생들에게 해주고 싶은 조언이 있나요?',
      '아들인 율곡 이이가 공부하기 싫어하거나 방황한 적은 없었나요? 그럴 땐 어떻게 대해주셨나요?'
    ]
  };

  // Trigger natural persona self-introduction whenever selectedFigure changes
  useEffect(() => {
    if (selectedFigure) {
      // Clear queue & stop ongoing speech when switching figures
      setQuestionQueue([]);
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

  /**
   * Question Dispatcher with Smart Queueing:
   * When video/audio is already speaking, enqueues next question to prevent jarring interruptions.
   * forceImmediate=true bypasses queue and interrupts immediately.
   */
  const enqueueOrAsk = (queryText, forceImmediate = false) => {
    const clean = queryText.trim();
    if (!clean || !selectedFigure) return;

    if (isSpeaking && !forceImmediate) {
      setQuestionQueue(prev => {
        const isDuplicate = prev.some(item => item.queryText === clean && item.figureId === selectedFigure.id);
        if (isDuplicate) return prev;
        return [...prev, { figureId: selectedFigure.id, queryText: clean, timestamp: Date.now() }];
      });
      return;
    }

    fetchDialogue(selectedFigure.id, clean);
  };

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
    const candidateThinkingUrl = `/videos/${figureId}_thinking.mp4`;

    if (avatarPlayerRef.current?.stopMedia) {
      avatarPlayerRef.current.stopMedia();
    }
    if (avatarPlayerRef.current?.primeMedia) {
      avatarPlayerRef.current.primeMedia(candidateThinkingUrl);
    }
    if (avatarPlayerRef.current?.unmute) {
      avatarPlayerRef.current.unmute();
    }

    setIsLoading(true);
    setPendingQuery(cleanQuery);
    setDialogueError(null);

    // 3. Thinking Buffer Video Trigger:
    // If response is not an instant 40ms cache hit (i.e. generating answer via LLM/ComfyUI/TTS),
    // immediately play the authentic persona thinking video ("생각을 가다듬어 보겠습니다")!
    let isResponseHandled = false;
    const thinkingText = FIGURE_THINKINGS[figureId] || '신선한 질문이군요. 잠시 생각을 가다듬어 보겠습니다.';

    const thinkingTimer = setTimeout(() => {
      if (!isResponseHandled && !currentAbortController.signal.aborted) {
        console.log(`🤔 [Thinking Buffer Triggered] Playing thinking video for '${figureId}' while generating response`);
        setDialogueResult({
          figure: selectedFigure,
          query: cleanQuery,
          isThinking: true,
          speechText: thinkingText,
          videoUrl: candidateThinkingUrl,
          audioUrl: `/audio/${figureId}_thinking.mp3`,
          aiVideoResult: {
            success: true,
            figureId,
            provider: '생각 중...',
            videoUrl: candidateThinkingUrl,
            audioUrl: `/audio/${figureId}_thinking.mp3`,
            speechText: thinkingText,
            status: 'ready'
          }
        });
        setIsSpeaking(true);
      }
    }, 60);

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

      if (currentAbortController.signal.aborted) {
        clearTimeout(thinkingTimer);
        return;
      }

      isResponseHandled = true;
      clearTimeout(thinkingTimer);

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
      clearTimeout(thinkingTimer);
      if (!currentAbortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const handleRemoveFromQueue = (indexToRemove) => {
    setQuestionQueue(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleForcePlayQueued = (item, index) => {
    setQuestionQueue(prev => prev.filter((_, idx) => idx !== index));
    setQueryInput(item.queryText);
    fetchDialogue(item.figureId, item.queryText);
  };

  const handleAsk = (e) => {
    e.preventDefault();
    if (!queryInput.trim() || !selectedFigure) return;
    enqueueOrAsk(queryInput);
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
              <span style={{ fontSize: '0.72rem', color: isSpeaking ? '#a78bfa' : 'var(--text-muted)' }}>
                {isSpeaking ? '💡 재생 중 질문을 누르면 대기열(큐)에 등록되어 말씀이 끝난 후 이어집니다' : '원하는 질문을 누르거나 직접 질문을 입력하세요'}
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

            {/* Smart Question Queue Banner */}
            {questionQueue.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(167, 139, 250, 0.14))',
                border: '1px solid rgba(167, 139, 250, 0.35)',
                borderRadius: '10px',
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                animation: 'fadeIn 0.25s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.76rem',
                    color: '#c4b5fd',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <span>⏳</span>
                    <span>다음 질문 대기열 ({questionQueue.length}건 대기 중 — 말씀 후 자동 재생)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuestionQueue([])}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    대기열 비우기
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {questionQueue.map((item, qIdx) => (
                    <div
                      key={qIdx}
                      style={{
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(167, 139, 250, 0.3)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.74rem',
                        color: '#f8fafc'
                      }}
                    >
                      <span>#{qIdx + 1} {item.queryText.length > 22 ? item.queryText.slice(0, 22) + '...' : item.queryText}</span>
                      <button
                        type="button"
                        onClick={() => handleForcePlayQueued(item, qIdx)}
                        title="현재 말씀을 건너뛰고 지금 바로 질문하기"
                        style={{
                          background: 'rgba(243, 198, 35, 0.2)',
                          border: '1px solid var(--accent-gold)',
                          borderRadius: '4px',
                          padding: '1px 5px',
                          color: 'var(--accent-gold)',
                          fontSize: '0.66rem',
                          fontWeight: '700',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ 즉시 재생
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromQueue(qIdx)}
                        title="대기열에서 삭제"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          lineHeight: 1
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
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
                  background: isSpeaking ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {isLoading ? '답변 조회 중...' : (isSpeaking ? '대기열 추가 ➔' : '질문하기 ➔')}
              </button>
            </form>

            {/* Quick Sample Question Chips (Clicking during speech gracefully enqueues next answer) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {currentQuestions.map((q, idx) => {
                const isQueued = questionQueue.some(item => item.queryText === q);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQueryInput(q);
                      enqueueOrAsk(q);
                    }}
                    style={{
                      background: isQueued ? 'rgba(167, 139, 250, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                      border: isQueued ? '1px solid #a78bfa' : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      padding: '5px 12px',
                      color: isQueued ? '#e9d5ff' : 'var(--text-sub)',
                      fontSize: '0.76rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = isQueued ? '#c4b5fd' : 'var(--accent-gold)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = isQueued ? '#a78bfa' : 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = isQueued ? '#e9d5ff' : 'var(--text-sub)';
                    }}
                  >
                    <span>{isQueued ? '⏳' : '💡'}</span>
                    <span>{q}</span>
                    {isQueued && (
                      <span style={{
                        fontSize: '0.66rem',
                        color: '#c4b5fd',
                        background: 'rgba(124, 58, 237, 0.35)',
                        padding: '1px 5px',
                        borderRadius: '6px',
                        marginLeft: '3px',
                        fontWeight: '700'
                      }}>
                        대기 중
                      </span>
                    )}
                  </button>
                );
              })}
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
            {dialogueResult?.isThinking ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${themeColor}`,
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                    flexShrink: 0
                  }} />
                  <span style={{
                    fontSize: '0.74rem',
                    color: themeColor,
                    fontWeight: '700',
                    background: 'rgba(243, 198, 35, 0.15)',
                    padding: '2px 8px',
                    borderRadius: '6px'
                  }}>
                    🤔 생각을 가다듬는 중...
                  </span>
                </div>
                <p style={{
                  fontSize: '0.96rem',
                  lineHeight: '1.6',
                  color: '#f8fafc',
                  fontFamily: 'var(--font-serif)',
                  margin: 0
                }}>
                  "{dialogueResult.speechText}"
                </p>
              </div>
            ) : isLoading ? (
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
                  "{pendingQuery || queryInput || '질문'}"에 대해 {selectedFigure?.name}이(가) 답변을 준비 중입니다...
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
              if (isLoading || dialogueResult?.isThinking) {
                console.log('⏳ [Speech Buffer] Thinking video ended while waiting for full answer -> Holding standby state');
                return;
              }
              console.log('🎬 [Speech Complete] Video finished -> Transition to Standby');
              setIsSpeaking(false);

              // Seamless Queue processing: pop next item from queue with natural breathing interval
              setQuestionQueue(prevQueue => {
                if (prevQueue.length > 0) {
                  const [nextItem, ...restQueue] = prevQueue;
                  console.log('📥 [Queue Processing] Executing next queued question:', nextItem.queryText);
                  setTimeout(() => {
                    setQueryInput(nextItem.queryText);
                    fetchDialogue(nextItem.figureId, nextItem.queryText);
                  }, 400); // 400ms natural breathing interval
                  return restQueue;
                }
                return prevQueue;
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import FigureSelector from './FigureSelector';
import AvatarVideoPlayer from './AvatarVideoPlayer';

export default function KioskMode({ figures }) {
  const [selectedFigure, setSelectedFigure] = useState(figures[0] || null);
  const [queryInput, setQueryInput] = useState('');
  const [dialogueResult, setDialogueResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (figures.length > 0 && !selectedFigure) {
      setSelectedFigure(figures[0]);
    }
  }, [figures]);

  // Initial welcome dialogue when figure is switched
  useEffect(() => {
    if (selectedFigure) {
      fetchDialogue(selectedFigure.id, '');
    }
  }, [selectedFigure]);

  const fetchDialogue = async (figureId, queryText) => {
    setIsLoading(true);
    try {
      let data = null;
      
      try {
        const res = await fetch('http://localhost:3001/api/dialogue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ figureId, query: queryText || '' })
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {
        console.warn('Direct 3001 dialogue fetch failed:', e);
      }

      if (data && data.success) {
        setDialogueResult(data);

        // Instantly call AI Video Pipeline in Kiosk Mode Viewport
        try {
          const videoRes = await fetch('http://localhost:3001/api/pipeline/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              figureId,
              text: data.speechText,
              engineType: 'SolutionA_SadTalker'
            })
          });
          const videoData = await videoRes.json();
          if (videoData.success && videoData.pipeline) {
            setDialogueResult(prev => ({
              ...prev,
              aiVideoResult: videoData.pipeline.videoResult
            }));
          }
        } catch (e) {
          console.warn('AI video pipeline fetch error:', e);
        }
      }
    } catch (err) {
      console.error('Failed to fetch dialogue:', err);
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
    'kim-koo': ['백범 김구 선생님의 소원은 무엇이었나요?', '상하이 임시정부에 대해 말씀해주세요.', '독립운동 당시 기억을 말해주세요.'],
    'king-sejong': ['훈민정음을 만든 이와 까닭은 무엇인가요?', '장영실과 발명품에 대해 말씀해주세요.', '백성을 위한 정책은 무엇이었나요?'],
    'yi-sun-sin': ['명량해전에서 12척 배로 어떻게 이겼나요?', '거북선은 어떤 구조로 만들어졌나요?', '난중일기를 쓰신 심정은 어떠하셨나요?'],
    'yu-gwan-sun': ['아우내 장터 만세 운동 이야기를 해주세요.', '옥중에서도 독립만세를 외치신 이유가 무엇인가요?', '젊은이들에게 하실 말씀이 있으신가요?'],
    'shin-saimdang': ['초충도 그림을 그리실 때 마음은 어떠셨나요?', '율곡 이이를 가르치신 교육관은 무엇인가요?', '자연과 시에 대한 생각을 나누어주세요.']
  };

  const currentQuestions = sampleQuestions[selectedFigure?.id] || [
    '업적에 대해 말씀해주세요.',
    '삶의 좌우명은 무엇이었나요?'
  ];

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 40px 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2.1rem', color: '#fff', marginBottom: '0.6rem', fontFamily: 'var(--font-serif)' }}>
          🏛️ 역사 인물 AI 역동적 3D 모션 체험존
        </h2>
        <p style={{ color: 'var(--text-sub)', fontSize: '1.02rem', maxWidth: '680px', margin: '0 auto' }}>
          사진 1장으로 입술과 상체, 몸 전체가 역동적으로 대화하는 5인의 역사 인물과 실시간 대화를 나누어 보세요.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        gap: '24px'
      }}>
      {/* Left Column: Figures Selection & Interactive Q&A Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <FigureSelector
          figures={figures}
          selectedFigure={selectedFigure}
          onSelectFigure={(fig) => setSelectedFigure(fig)}
          onAddNewFigure={(newFig) => {
            figures.unshift(newFig);
            setSelectedFigure(newFig);
          }}
        />

        {/* Question Input Box */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)' }}>
              💬 {selectedFigure?.name}에게 직접 질문하기
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
              오프라인 0토큰 Engine
            </span>
          </div>

          <form onSubmit={handleAsk} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={`${selectedFigure?.name || '역사 인물'}에게 질문을 입력하세요...`}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(0, 0, 0, 0.4)',
                color: 'var(--text-main)',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading}
              style={{
                padding: '12px 22px',
                background: isLoading ? '#475569' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                cursor: isLoading ? 'wait' : 'pointer'
              }}
            >
              {isLoading ? '답변 인덱싱 중...' : '질문하기 ➔'}
            </button>
          </form>

          {/* Quick Sample Question Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            <span style={{ width: '100%', fontSize: '0.75rem', color: 'var(--text-sub)' }}>추천 체험 질문:</span>
            {currentQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQueryInput(q);
                  fetchDialogue(selectedFigure.id, q);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '6px 12px',
                  color: 'var(--text-sub)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Historical Document Verification Source (Local RAG) */}
        {dialogueResult && (
          <div className="glass-panel" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📜 문헌 데이터베이스 매핑 (검증된 역사 사료 RAG)
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: '1.5' }}>
              <strong>주제:</strong> {dialogueResult.matchedTopic}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
              "{dialogueResult.historicalReference}"
            </p>
          </div>
        )}
      </div>

      {/* Right Column: Avatar Video Renderer with Lip-Sync */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <AvatarVideoPlayer
          figure={selectedFigure}
          speechText={dialogueResult?.speechText}
          aiVideoResult={dialogueResult?.aiVideoResult}
          isGenerating={isLoading}
        />
        </div>
      </div>
    </div>
  );
}

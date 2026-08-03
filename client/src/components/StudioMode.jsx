import React, { useState, useRef } from 'react';
import FigureSelector from './FigureSelector';
import AvatarVideoPlayer from './AvatarVideoPlayer';

export default function StudioMode({ figures }) {
  const videoPlayerRef = useRef(null);
  const [selectedFigure, setSelectedFigure] = useState(figures[0] || null);
  const [currentStep, setCurrentStep] = useState(1);
  const [customText, setCustomText] = useState('');
  const [language, setLanguage] = useState('한국어');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [engineType, setEngineType] = useState('D-ID'); // 'D-ID', 'Local_GPU', 'GoogleColab_Ngrok', 'HappyHorse'
  const [apiKey, setApiKey] = useState('');


  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [isRendering, setIsRendering] = useState(false);

  const handleDownloadVideo = () => {
    if (videoPlayerRef.current) {
      videoPlayerRef.current.exportVideoAndDownload();
    }
  };

  const handleSynthesizeMedia = async () => {
    if (!selectedFigure || !customText.trim()) return;

    setIsRendering(true);
    try {
      let data = null;
      try {
        const res = await fetch('http://localhost:3001/api/pipeline/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            figureId: selectedFigure.id,
            text: customText,
            engineType,
            apiKey
          })
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {
        console.warn('Pipeline fetch failed, fallback to local:', e);
      }

      if (data && data.success) {
        setGeneratedVideo(data.pipeline);
        setCurrentStep(4);
      }
    } catch (err) {
      console.error('Video Synthesis Error:', err);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px 40px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Template Step Header (Substitutes Figure 2 Workflow) */}
      <div className="glass-panel" style={{ padding: '20px 28px' }}>
        <h2 className="serif-title" style={{ fontSize: '1.2rem', color: 'var(--accent-gold)', marginBottom: '16px' }}>
          🎬 역사인물 AI 영상 제작 템플릿 (Face to Voice & 영상 생성)
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          {[
            { step: 1, title: '1. 역사인물 선택', desc: '인물 라이브러리' },
            { step: 2, title: '2. Face to Voice 추론', desc: '초상화 톤/말투 자동설정' },
            { step: 3, title: '3. 대사 입력 및 생성', desc: '원하는 메시지 작성' },
            { step: 4, title: '4. 인물 영상 완성', desc: 'Lip Sync 입술동기화 렌더링' }
          ].map((item) => {
            const isActive = currentStep === item.step;
            return (
              <div
                key={item.step}
                onClick={() => setCurrentStep(item.step)}
                style={{
                  background: isActive ? 'linear-gradient(135deg, rgba(243, 198, 35, 0.2) 0%, rgba(0,0,0,0.5) 100%)' : 'rgba(255, 255, 255, 0.03)',
                  border: isActive ? '1px solid var(--accent-gold)' : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: isActive ? 'var(--accent-gold)' : 'var(--text-main)' }}>
                  {item.title}
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Workflow Studio Main Container */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px' }}>
        {/* Step Interactive Forms */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* STEP 1 & 2 Controls */}
          {currentStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FigureSelector
                figures={figures}
                selectedFigure={selectedFigure}
                onSelectFigure={(fig) => setSelectedFigure(fig)}
                onAddNewFigure={(newFig) => {
                  figures.unshift(newFig);
                  setSelectedFigure(newFig);
                }}
              />
              <button
                className="btn-primary"
                onClick={() => setCurrentStep(2)}
                style={{ alignSelf: 'flex-end', marginTop: '10px' }}
              >
                다음: Face to Voice 음성 추론 ➔
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--accent-gold)' }}>
                🎙️ Step 2. Face to Voice 캐릭터 프로필 자동 추론
              </h3>
              
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>추론된 연령 및 시대 배경:</label>
                  <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)', marginTop: '4px' }}>
                    {selectedFigure?.name} ({selectedFigure?.era}) • {selectedFigure?.ageCategory}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>자동 감정 & 음성 톤 프로필:</label>
                  <div style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)', marginTop: '4px' }}>
                    {selectedFigure?.voiceProfile?.tone}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
                  <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.8rem', color: 'var(--accent-gold)', marginBottom: '0.5rem', fontFamily: 'var(--font-serif)' }}>
                      🎬 Full-Body Dynamic Motion AI 비디오 스튜디오
                    </h2>
                    <p style={{ color: 'var(--text-sub)', fontSize: '0.95rem' }}>
                      사진 1장으로 입술뿐만 아니라 몸 전체와 상체가 실제로 역동적으로 움직이는 고품질 역사 인물 AI 영상을 제작합니다.
                    </p>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--accent-gold)', fontWeight: '700' }}>
                      ⚙️ SOTA AI 해결책 파이프라인 엔진 선택 (Solutions A, B, C)
                    </label>
                    <select
                      value={engineType}
                      onChange={(e) => setEngineType(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#111827', color: '#fff', border: '1px solid var(--accent-gold)', marginTop: '4px', fontSize: '0.9rem' }}
                    >
                      <option value="D-ID">🎬 D-ID Cloud API Engine [20 무료 체험 토큰 = 5분/20~30개 숏폼 영상 제작]</option>
                      <option value="Local_GPU">⚡ 로컬 RTX 4070 Ti SUPER GPU (PyTorch CUDA) [100% 무료 / 결제 0원 무제한]</option>
                      <option value="GoogleColab_Ngrok">🆓 Google Colab T4 GPU + FastAPI + Ngrok [100% 무료 클라우드 서버]</option>
                      <option value="HuggingFace_Gradio">🎁 Hugging Face Gradio Spaces (@gradio/client) [100% 무료 퍼블릭]</option>
                      <option value="HappyHorse">🐎 Alibaba Happy Horse 1.1 (Replicate API) [유료 결제 계정용]</option>
                      <option value="Replicate">⭐ Replicate Cloud GPU API (LivePortrait / SadTalker) [유료 결제 계정용]</option>
                      <option value="VisionStory">VisionStory AI (openapi.visionstory.ai API)</option>
                    </select>
                  </div>

                  {engineType === 'D-ID' && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--accent-gold)', fontWeight: '700' }}>
                        🔑 D-ID API Key (Basic xxxxx 또는 API Key 입력)
                      </label>
                      <input
                        type="password"
                        placeholder="D-ID API Key 입력 (https://studio.d-id.com/account 에서 발급)"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#000', color: '#fff', border: '1px solid var(--accent-gold)', marginTop: '4px' }}
                      />
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                        * 💡 <strong>D-ID 20개 무료 체험 토큰 차감 안내</strong>: 15초당 1 토큰 차감 ➔ 20 토큰 = <strong>총 5분 분량 (10~15초 숏폼 기준 20~30개 영상 제작 가능!)</strong>
                      </p>
                    </div>
                  )}

                  {(engineType === 'Replicate' || engineType === 'HappyHorse') && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--accent-gold)', fontWeight: '700' }}>
                        🔑 Replicate API Token (r8_xxxxxxxxxxxxxxxxxxxx)
                      </label>
                      <input
                        type="password"
                        placeholder="r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxx API Token 입력"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#000', color: '#fff', border: '1px solid var(--accent-gold)', marginTop: '4px' }}
                      />
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-sub)', marginTop: '4px' }}>
                        * Replicate (https://replicate.com/account/api-tokens)에서 발급받으신 API Token을 입력하시면, 이미지와 음성을 기반으로 유튜브급 AI 비디오를 생성합니다.
                      </p>
                    </div>
                  )}

                  {engineType === 'GoogleColab_Ngrok' && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--accent-gold)' }}>Google Colab Ngrok 퍼블릭 URL</label>
                      <input
                        type="text"
                        placeholder="https://xxxx-xxxx.ngrok-free.app 입력"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#000', color: '#fff', border: '1px solid var(--accent-gold)', marginTop: '4px' }}
                      />
                    </div>
                  )}

                  {(engineType === 'VisionStory' || engineType === 'DID_API' || engineType === 'Fal_Replicate') && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)' }}>
                        {engineType === 'VisionStory' ? 'VisionStory X-API-Key (sk-vs-...)' : 'API Key (선택)'}
                      </label>
                      <input
                        type="password"
                        placeholder={engineType === 'VisionStory' ? 'sk-vs-xxxxxxxxxxxxxxxxxxx API Key 입력' : 'API Key 입력'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#000', color: '#fff', border: '1px solid var(--accent-cyan)', marginTop: '4px' }}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>언어 설정</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid #333' }}
                    >
                      <option>한국어 (기본)</option>
                      <option>English</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>영상 비율</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid #333' }}
                    >
                      <option>16 : 9 (가로형)</option>
                      <option>9 : 16 (숏폼/세로형)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button className="btn-secondary" onClick={() => setCurrentStep(1)}>
                  ⬅ 인물 재선택
                </button>
                <button className="btn-primary" onClick={() => setCurrentStep(3)}>
                  다음: 대사 입력 ➔
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Text Script Input */}
          {currentStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--accent-gold)' }}>
                ✍️ Step 3. 대사 입력 및 영상 생성 클릭
              </h3>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '8px', display: 'block' }}>
                  {selectedFigure?.name} 인물이 발화할 대사를 입력하세요:
                </label>
                <textarea
                  rows={5}
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  placeholder="예: 백성을 위해 우리의 자주독립과 높은 문화의 힘을 세계에 널리 알려야 할 것입니다."
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    color: 'var(--text-main)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontSize: '0.95rem',
                    lineHeight: '1.5',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Sample Script Quick Fill */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>사료 추천 대사:</span>
                <button
                  onClick={() => setCustomText(selectedFigure?.description || '')}
                  style={{
                    background: 'rgba(243, 198, 35, 0.1)',
                    border: '1px solid rgba(243, 198, 35, 0.3)',
                    color: 'var(--accent-gold)',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  기본 사료 어록 적용
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <button className="btn-secondary" onClick={() => setCurrentStep(2)}>
                  ⬅ 이전 단계
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSynthesizeMedia}
                  disabled={isRendering || !customText.trim()}
                  style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                >
                  {isRendering ? '영상 렌더링 중...' : '🚀 생성 시작 (Lip Sync Rendering)'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Rendered Output & Export */}
          {currentStep === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '1rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✅ Step 4. 인물 AI 영상 완성 (렌더링 완료)
              </h3>

              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '14px', borderRadius: '10px', fontSize: '0.85rem', color: '#a7f3d0' }}>
                ✔ 입술 동기화(Lip Sync) 및 표정 렌더링 파이프라인 처리가 성공적으로 완료되었습니다!
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn-primary"
                  onClick={handleDownloadVideo}
                  style={{ flex: 1, background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)', color: '#000', fontWeight: '800' }}
                >
                  📥 비디오 파일 인코딩 및 즉시 다운로드 (.webm / .mp4)
                </button>
                <button className="btn-secondary" onClick={() => setCurrentStep(3)}>
                  🔄 새로운 대사 수정
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Preview Output Screen */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-sub)' }}>
            🎥 실시간 미리보기 및 입모양 동기화 출력
          </h3>
          <AvatarVideoPlayer
            ref={videoPlayerRef}
            figure={selectedFigure}
            speechText={customText || selectedFigure?.description}
            isGenerating={isRendering}
          />
        </div>
      </div>
    </div>
  );
}

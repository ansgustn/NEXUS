import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import KioskMode from './components/KioskMode';
import StudioMode from './components/StudioMode';

const DEFAULT_FIGURES = [
  {
    id: "kim-koo",
    name: "백범 김구",
    title: "대한민국 임시정부 주석 & 독립운동가",
    era: "근현대 (1876 ~ 1949)",
    ageCategory: "장년/노년",
    voiceProfile: { tone: "중저음의 단호하고 진정성 있는 톤", speechStyle: "격식 있고 애국심 넘치는 명료한 어조", pitch: 0.9, rate: 0.95 },
    portraitUrl: "/images/kim-koo.webp",
    defaultVideoUrl: "/videos/kim-koo_talking_avatar.mp4",
    mouthCenterRatioY: 0.43,
    mouthScaleRatio: 0.11,
    avatarBg: "#2c1810",
    themeColor: "#e0a96d",
    description: "오직 한없이 가지고 싶은 것은 높은 문화의 힘이다."
  },
  {
    id: "king-sejong",
    name: "세종대왕",
    title: "조선 제4대 국왕 (한글 창제)",
    era: "조선 전기 (1397 ~ 1450)",
    ageCategory: "중년/장년",
    voiceProfile: { tone: "위엄 있고 인자한 성군 음성", speechStyle: "백성을 사랑하는 하오체 및 어제 어조", pitch: 0.85, rate: 0.9 },
    portraitUrl: "/images/king-sejong.webp",
    mouthCenterRatioY: 0.28,
    mouthScaleRatio: 0.08,
    avatarBg: "#3b0000",
    themeColor: "#f3c623",
    description: "나랏말싸미 댯귁에 달라 문자와로 서로 사맛디 아니할쎄"
  },
  {
    id: "yi-sun-sin",
    name: "충무공 이순신",
    title: "삼도수군통제사 & 난중일기",
    era: "조선 중기 (1545 ~ 1598)",
    ageCategory: "중년/장년",
    voiceProfile: { tone: "묵직하고 힘있는 장수의 톤", speechStyle: "절제되고 굳은 의지의 장수 어조", pitch: 0.8, rate: 0.95 },
    portraitUrl: "/images/yi-sun-sin.webp",
    mouthCenterRatioY: 0.31,
    mouthScaleRatio: 0.09,
    avatarBg: "#0d1b2a",
    themeColor: "#4ea8de",
    description: "신에게는 아직 12척의 배가 있사옵니다."
  },
  {
    id: "yu-gwan-sun",
    name: "유관순 열사",
    title: "3·1 운동 독립운동가",
    era: "근대 (1902 ~ 1920)",
    ageCategory: "청년",
    voiceProfile: { tone: "맑고 맑으나 강인한 청년 음성", speechStyle: "당차고 외침에 찬 독립 의지의 어조", pitch: 1.1, rate: 1.0 },
    portraitUrl: "/images/yu-gwan-sun.webp",
    mouthCenterRatioY: 0.36,
    mouthScaleRatio: 0.10,
    avatarBg: "#1f2421",
    themeColor: "#69b578",
    description: "내 손톱이 빠져나가고 귀와 코가 잘려도 대한독립 만세!"
  },
  {
    id: "shin-saimdang",
    name: "신사임당",
    title: "조선 시대 문인, 화가, 여류 시인",
    era: "조선 중기 (1504 ~ 1551)",
    ageCategory: "중년",
    voiceProfile: { tone: "단아하고 따뜻한 여류 화가 음성", speechStyle: "온화하고 학식 깊은 품격 있는 어조", pitch: 1.05, rate: 0.9 },
    portraitUrl: "/images/shin-saimdang.webp",
    avatarBg: "#2b2d42",
    themeColor: "#d8b4e2",
    description: "자연을 담은 초충도와 지혜로운 어미의 마음"
  }
];

export default function App() {
  const [activeMode, setActiveMode] = useState('kiosk');
  const [figures, setFigures] = useState(DEFAULT_FIGURES);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadFigures = async () => {
      try {
        let res;
        try {
          res = await fetch('/api/figures');
        } catch (e) {
          res = await fetch('http://localhost:3001/api/figures');
        }
        const data = await res.json();
        if (data.figures && data.figures.length > 0) {
          setFigures(data.figures);
        }
      } catch (err) {
        console.warn('Using default figures fallback:', err);
      }
    };
    loadFigures();
  }, []);

  if (loading) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-main)',
        fontSize: '1.1rem'
      }}>
        History-Nexus AI 시스템 로딩 중...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar activeMode={activeMode} setActiveMode={setActiveMode} />
      <main style={{ flex: 1 }}>
        {activeMode === 'kiosk' ? (
          <KioskMode figures={figures} />
        ) : (
          <StudioMode figures={figures} />
        )}
      </main>
      <footer style={{
        textAlign: 'center',
        padding: '20px',
        fontSize: '0.78rem',
        color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)'
      }}>
        History-Nexus AI 역사 인물 대화 시스템 • AI+X Nexus 체험존 개발 프로젝트 • Re:Frame(리프레임)
      </footer>
    </div>
  );
}

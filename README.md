# NEXUS 체험존: AI 기반 역사 인물 인터랙티브 시스템

> **교내 NEXUS 체험존 오프라인 전시를 위해 개발된 AI 융합 인터랙티브 플랫폼**  
> 관람객이 역사적 인물(백범 김구, 세종대왕, 이순신 장군, 유관순 열사, 신사임당)과 실시간으로 대화하고, 직접 작성한 대사로 3D 안면 립싱크(Lip-sync) 영상을 렌더링하여 영구 소장할 수 있는 체험형 미디어 시스템입니다.

---

## 1. 프로젝트 개요 (Overview)

과거의 위대한 역사 인물들을 현대의 생성형 AI 기술과 분산 렌더링 파이프라인으로 재현했습니다.  
관람객이 키오스크나 태블릿에서 역사적 질문을 던지면 페르소나 LLM이 당시 시대상과 인물의 철학을 반영한 고유 어조로 답변하며, 고성능 GPU 딥러닝 립싱크 신경망(Wav2Lip GAN / LivePortrait)을 통해 실제 말하는 듯한 초고화질 아바타 영상으로 실시간 반응합니다.

* **인터랙티브 대화**: 역사 인물별 성격, 시대 어휘, 가치관을 철저히 반영한 페르소나 RAG 및 가드레일 탑재
* **커스텀 스튜디오**: 사용자가 원하는 문장을 직접 입력하면 인물의 목소리와 안면 동기화 영상으로 즉시 제작 및 다운로드
* **분산 하이브리드 파이프라인**: 저사양 전시용 키오스크/노트북(UI)과 옆 컴퓨터(고성능 RTX GPU ComfyUI)를 LAN/HTTP REST API로 분리 연동하여 발열 및 렌더링 병목 완전 해소

---

## 2. 기술 스택 및 시스템 아키텍처 (Tech Stack & Architecture)

### 2.1 기술 스택
* **Frontend**: React 18, Vite, Vanilla CSS (Glassmorphism & Cyberpunk Design System)
* **Backend**: Node.js (Express), WebRTC Streaming Microservice
* **AI & Media Pipeline**:
  * **음성 합성**: Microsoft Edge-TTS (인물별 VoiceProfile 음색·속도·피치 정밀 튜닝)
  * **립싱크 렌더링**: ComfyUI (Wav2Lip GAN / LivePortrait / VHS_VideoCombine)
  * **페르소나 생성**: Ollama Local LLM (`qwen2.5:3b`) & Historical Preset Database
  * **미디어 후처리**: FFmpeg (정밀 오디오 트림 및 H.264 MP4 인코딩)

### 2.2 분산 네트워크 아키텍처
노트북과 고성능 데스크탑 GPU PC 간에 복잡한 파일 공유(Samba) 없이, HTTP REST API를 통해 오디오/이미지 전송 및 완성 비디오 다운로드가 100% 자동 처리됩니다.

```
┌─────────────────────────────────────────┐          HTTP REST API          ┌─────────────────────────────────────────┐
│     [전시존 노트북 / 키오스크 클라이언트]    │ ────────────────────────────────► │       [옆 컴퓨터 데스크탑 PC (RTX GPU)]     │
│                                         │                                 │                                         │
│  1. 인물 선택 & 질문/대사 입력           │                                 │  • ComfyUI 인퍼런스 서버 (--listen 0.0.0.0) │
│  2. Edge-TTS 음성 합성 (0.3초)          │   POST /upload/image (이미지/음성) │  • Wav2Lip GAN PyTorch CUDA 가속 (2~4초) │
│  3. 영상 생성 요청 ──────────────────────┼─────────────────────────────────►│  • VHS_VideoCombine 무손실 MP4 인코딩   │
│  4. 완성된 MP4 다운로드 & 비디오 재생 ◄──┼─────────────────────────────────┼─── GET /view?filename=... (MP4 다운로드)  │
└─────────────────────────────────────────┘                                 └─────────────────────────────────────────┘
```

---

## 3. 핵심 기능 (Key Features)

1. **실시간 페르소나 질의응답 (체험 모드)**
   * 역사적 고증을 거친 인물별 답변 생성 및 현대 비속어/시대착오적 질문 자동 필터링(Guardrail)
   * 0ms 즉각 응답을 보장하는 지능형 유사도 캐싱 DB(Similarity Cache DB) 탑재
2. **사용자 맞춤형 대사 스튜디오 (제작 모드)**
   * 관람객이 직접 쓴 응원 문구, 독립 선언문, 가훈 등을 인물이 직접 낭독하는 영상 생성
   * 원클릭 MP4 파일 로컬 다운로드 지원
3. **디커플링 3단계 초고속 파이프라인**
   * 음성 생성(0.3초)과 영상 렌더링(2~4초)을 분리하여 관람객 대기 시간을 80% 단축
   * 음성이 먼저 재생되는 동안 백그라운드에서 GPU 립싱크 비디오를 매끄럽게 연결

---

## 4. 깃허브 배포 및 빠른 시작 가이드 (Quick Start & Deployment)

### 4.1 사용하는 방법 및 실행 파일 안내 (Execution Files)
Windows 환경에서 별도의 터미널 명령어를 입력할 필요 없이, **더블 클릭 한 번**으로 동작하도록 원클릭 실행 파일들이 루트 디렉터리에 준비되어 있습니다.

| 실행 파일명 | 설명 | 권장 사용 시점 |
| :--- | :--- | :--- |
| **`run_nexus.bat`** | **NEXUS 웹 시스템 메인 런처**<br>- Node.js 환경 검사<br>- `.env` 자동 복사 생성<br>- `node_modules` 자동 설치<br>- 백엔드(3001) + 프론트엔드(5173) 동시 기동<br>- 브라우저 자동 오픈 (`http://localhost:5173`) | 평상시 웹 애플리케이션 실행 시 |
| **`install_comfyui.bat`** | **ComfyUI 및 AI 모델 원클릭 자동 설치기**<br>- ComfyUI 다운로드 및 폴더 구성<br>- 필수 커스텀 노드 3종 자동 클론<br>- 딥러닝 가중치(`wav2lip_gan.pth`, `s3fd.pth`) HuggingFace 고속 자동 다운로드 | 최초 세팅 시 (초간편 설치) |
| **`run_comfyui.bat`** | **ComfyUI GPU 서버 외부 허용 실행기**<br>- `--listen 0.0.0.0 --port 8188 --fast fp16_accumulation`<br>- 원격 노트북 및 로컬 어디서든 접속 허용 | 데스크탑 GPU PC에서 ComfyUI 켤 때 |
| **`start_all.bat`** | **올인원 마스터 런처**<br>- ComfyUI 서버 기동 + NEXUS 웹 서버 동시 기동 | 단일 PC에서 한 번에 모두 켤 때 |

---

### 4.2 환경 설정 (.env) 및 세팅하는 방법 (Configuration & Setup)

#### 1) 사전 요구사항 (Prerequisites)
* **OS**: Windows 10 / 11 (64-bit)
* **Node.js**: v18.0.0 이상 ([공식 다운로드](https://nodejs.org/))
* **GPU**: NVIDIA RTX 계열 (VRAM 6GB 이상 권장, 단일 PC 또는 분산 데스크탑)

#### 2) 환경 설정 파일 세팅 (`.env`)
프로젝트 루트의 `.env.example`을 복사하여 `.env`를 생성합니다. (`run_nexus.bat`을 실행하면 자동 생성됩니다.)

```env
# ==============================================================================
# [NEXUS] 환경 설정 파일 (.env)
# ==============================================================================

# 1. ComfyUI AI 인퍼런스 서버 URL
# - 동일한 PC에서 모두 실행하는 경우:
COMFYUI_URL=http://127.0.0.1:8188
# - 별도의 데스크탑 GPU PC에서 실행하는 경우 (예시):
# COMFYUI_URL=http://192.168.0.25:8188

# 2. 백엔드 서버 포트 (기본: 3001)
PORT=3001

# 3. (선택) 로컬 Ollama LLM 설정
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

* **분산 PC 환경 설정 팁**:
  1. 데스크탑 GPU PC의 CMD에서 `ipconfig`를 입력하여 IPv4 주소(예: `192.168.0.25`)를 확인합니다.
  2. 노트북의 `.env` 파일에 `COMFYUI_URL=http://192.168.0.25:8188` 로 입력합니다.
  3. 데스크탑 PC에서 `run_comfyui.bat`을 켜두면 준비 완료입니다.

---

### 4.3 ComfyUI 원클릭 자동 설치 및 모델 세팅 (ComfyUI Automated Setup)

ComfyUI를 수동으로 다운로드하고 노드를 찾는 번거로운 과정을 완전히 자동화했습니다.

#### 실행 방법
1. 루트 디렉터리의 **`install_comfyui.bat`** 파일을 더블 클릭합니다.
2. 스크립트가 다음 과정을 자동으로 수행합니다:
   * **ComfyUI 본체 설치**: `ComfyUI_windows_portable/` 폴더 구성
   * **필수 커스텀 노드 설치**:
     * `custom_nodes/ComfyUI_wav2lip` (PyTorch CUDA 립싱크 엔진)
     * `custom_nodes/ComfyUI-VideoHelperSuite` (고화질 MP4 인코더)
     * `custom_nodes/comfyui-edgetts` (인물 보이스 합성 노드)
   * **필수 딥러닝 모델 가중치 자동 다운로드**:
     * `wav2lip_gan.pth` (415.6 MB) ➔ `checkpoints/` 폴더 자동 배치
     * `s3fd.pth` (85.7 MB) ➔ `face_detection/.../sfd/` 폴더 자동 배치
3. 설치 완료 후 **`run_comfyui.bat`** 을 실행하면 GPU 인퍼런스 서버가 즉시 동작합니다.

---

### 4.4 파라미터 유효성 검증 및 즉시 조치형 에러 로그 (Actionable Error Logs)

NEXUS 백엔드(`server/index.js`)의 모든 API 엔드포인트는 **철저한 if-else 유효성 검사**를 거칩니다.  
파라미터가 누락되거나 잘못된 경우, 개발자가 **서버 터미널 콘솔 로그만 보고 1초 만에 원인과 조치 방법을 파악**할 수 있도록 구체적인 가이드가 출력됩니다.

#### 1) 터미널 출력 예시 (Actionable Error Log)
```bash
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 [파라미터 유효성 검증 오류] POST /api/dialogue
   ▶ 대상 파라미터 : 'figureId'
   ▶ 오류 원인     : 필수 파라미터 'figureId'가 누락되었거나 비어 있습니다.
   ▶ 전달받은 값   : {"query":"선생님의 소원은 무엇입니까?"}
   💡 [즉시 해결 방법]: body에 'figureId'를 포함하세요. 등록된 인물 ID: [kim-koo, king-sejong, yi-sun-sin, yu-gwan-sun, shin-saimdang]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

```bash
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 [파라미터 유효성 검증 오류] POST /api/video/generate
   ▶ 대상 파라미터 : 'audioUrl'
   ▶ 오류 원인     : 립싱크할 음성 파일 경로('audioUrl')가 누락되었습니다.
   ▶ 전달받은 값   : {"figureId":"kim-koo"}
   💡 [즉시 해결 방법]: 2단계 /api/audio/generate 호출 후 반환된 audioUrl (예: "/audio/guide_speech_123.mp3")을 전달하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 2) 클라이언트 HTTP 응답 예시 (HTTP 400 Bad Request)
클라이언트 측에도 원인과 수정 힌트가 JSON으로 명확하게 전달되어 프론트엔드 연동 디버깅이 매우 수월합니다:
```json
{
  "success": false,
  "errorCode": "MISSING_PARAM_FIGURE_ID",
  "error": "필수 파라미터 'figureId'가 누락되었습니다.",
  "hint": "사용 가능한 figureId: kim-koo, king-sejong, yi-sun-sin, yu-gwan-sun, shin-saimdang",
  "received": {
    "query": "선생님의 소원은 무엇입니까?"
  }
}
```

---

## 5. 기술적 문제 해결 및 아키텍처 진화 (Troubleshooting)

### 문제 1: 오픈소스 비전 모델의 안면 애니메이션 퀄리티 한계
* **상황**: 초기 프로토타입 단계에서 SadTalker, LivePortrait 등 정지 이미지 기반 오픈소스를 적용했으나, 입술 주변의 검은색 타원형 노이즈 및 안면 일그러짐 등 전시용으로 부적합한 시각적 결함이 발생했습니다.
* **해결 및 진화**:
  1. 초기에는 D-ID 상용 API를 도입하여 품질을 확보했으나, API 비용 및 렌더링 대기 시간 문제가 대두되었습니다.
  2. 최종적으로 **로컬 RTX GPU 가속 기반의 ComfyUI Wav2Lip GAN 파이프라인**을 구축했습니다.
  3. 인위적인 2D 타원 왜곡을 완전히 배제하고, 순수 PyTorch CUDA 텐서 기반 립싱크를 적용하여 **2~4초 내 초고속 무비용 렌더링**을 달성했습니다.

https://github.com/user-attachments/assets/4b67f8e3-44a5-48ef-b8e7-c1eca45b2eaa

> **[초기 테스트 영상: 무료 SOTA 모델을 활용한 립싱크(Lip-sync) 생성의 한계]**  
> 원본 이미지의 입술 윤곽이 고정된 상태에서 내부만 왜곡되어 부자연스러운 타원형 그림자가 남았던 초기 버전입니다. 현재 파이프라인에서는 Wav2Lip GAN 및 고화질 H.264 인코딩을 통해 완벽하게 해결되었습니다.

https://github.com/user-attachments/assets/fbf42b6c-c2d0-4a17-b5e2-6b8aab03582a

> **[초기 테스트 영상: FFmpeg를 활용한 워터마크 블러(Blur) 처리의 한계]**  
> 상용 솔루션의 워터마크를 가리기 위해 FFmpeg 필터를 적용했으나 전체 화질이 저하되었던 한계를 확인하고, 자체 독립 호스팅 ComfyUI 파이프라인으로 전환하는 핵심 계기가 되었습니다.

---

### 문제 2: 역사 인물의 음성 데이터(Voice Data) 부재 및 합성의 어려움
* **상황**: 세종대왕, 이순신 장군 등 실제 음성 녹음본이 존재하지 않는 인물의 목소리를 구현해야 했습니다.
* **해결**:
  * Edge-TTS의 다채로운 한국어 신경망 성우(`ko-KR-InJoonNeural`, `ko-KR-BongJinNeural`, `ko-KR-SunHiNeural`)를 기반으로 인물별 **Pitch(음높이)**, **Speed(속도)**, **볼륨** 파라미터를 정밀 튜닝했습니다.
  * 백범 김구 선생은 중후하고 결연한 저음톤, 이순신 장군은 묵직한 군관의 호령조, 세종대왕은 위엄 있고 인자한 어조를 성공적으로 구현했습니다.

---

### 문제 3: 오프라인 전시존 0초 지연시간을 위한 지능형 유사도 캐싱 & 비동기 디커플링
* **상황**: 관람객이 몰리는 오프라인 체험존 환경에서 모든 질문마다 신규 비디오를 인퍼런스할 경우 대기열이 발생하는 병목이 있었습니다.
* **해결**:
  * **지능형 유사도 캐시 (Similarity Cache DB)**: 기생성된 역사적 명장면 및 질문-답변 비디오를 로컬 디스크에 자동 아카이빙하여, 유사 질문 인입 시 0ms 즉각 스트리밍 응답을 제공합니다.
  * **음성-영상 디커플링 (Decoupled 2-Step)**: 음성(0.3초)을 먼저 재생하여 대기 시간을 체감 0초로 줄이고, 영상이 준비되는 즉시 자연스럽게 크로스페이드 연결되는 부드러운 UX를 구현했습니다.

---

## 6. 깃허브 업로드 주의사항 및 파일 관리 (Repository Guidelines)

* **대용량 파일 배제 (`.gitignore`)**:
  * `ComfyUI_windows_portable/`, 모델 가중치(`*.pth`, `*.safetensors`), 임시 비디오 캐시는 GitHub 100MB 단일 파일 제한에 걸리지 않도록 `.gitignore`에 완벽하게 등록되어 있습니다.
  * 새로운 모델이나 ComfyUI는 `install_comfyui.bat`을 통해 클라이언트 머신에서 직접 안전하게 다운로드됩니다.
* **보안 환경 변수 관리**:
  * 개인 설정이 담긴 `.env` 파일은 커밋되지 않으며, 배포 시에는 `.env.example`을 참조하여 환경을 구성합니다.

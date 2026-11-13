# NEXUS 체험존: AI 역사 인물 대화 키오스크

> 교내 NEXUS 체험존 오프라인 전시를 위해 만든 대화형 키오스크입니다.
> 관람객이 백범 김구, 세종대왕, 충무공 이순신, 유관순 열사, 신사임당에게 질문하면, 인물이 자신의 목소리와 말하는 영상으로 답합니다.

---

## 1. 주요 기능

- **역사 인물 5명과 대화**: 인물을 고르고 화면의 예시 질문을 누르거나 직접 질문을 입력합니다.
- **미리 만든 질문 영상 32개**: 자주 나올 질문(인물별 6~7개)은 LTX-2.3 image-to-video 모델로 미리 렌더링해 두었기 때문에 기다리지 않고 바로 재생됩니다.
- **원본 초상화 기반 영상**: 화면 확대, 배경 변경, 인물 변형 없이 원본 사진에서 입과 고개만 자연스럽게 움직입니다.
- **대기 화면 및 생각/거절 영상**:
  - **대기 화면 (`idle_blink_*.mp4`)**: 질문이 없을 때는 5인 인물이 자연스럽게 눈을 깜빡이는 루프 영상이 재생되며, 답변 영상이 끝나면 대기 화면으로 이질감 없이 넘어갑니다.
  - **생각 중 영상 (`{인물}_thinking.mp4`)**: 새 질문 입력 시 답변이 생성될 때까지 *"잠시 생각을 가다듬어 보겠습니다"* 하며 자연스러운 버퍼링을 제공합니다.
  - **시대착오·부적절 질문 즉시 거절 (`{인물}_refusal.mp4`)**: 스마트폰, 컴퓨터 등 시대에 맞지 않는 단어나 비속어 입력 시 인물이 품위 있게 정중히 거절합니다.
- **새 질문 대응**: 준비되지 않은 질문은 사료 검색(RAG)과 로컬 LLM으로 답변을 만들고 Edge-TTS 음성으로 읽어 줍니다.

---

## 2. 시스템 구성

키오스크 PC와 GPU PC를 나눠 씁니다. 두 PC는 같은 네트워크에서 HTTP로 통신하며, 파일 공유 설정은 필요 없습니다.

```
┌──────────────────────────────┐                    ┌──────────────────────────────┐
│  키오스크 PC (전시용 노트북)   │      HTTP (LAN)     │      GPU PC (RTX 데스크톱)     │
│                              │ ─────────────────► │                              │
│  React 키오스크 화면 (5173)    │  이미지·음성 업로드   │  ComfyUI 서버 (8188)          │
│  Node.js API 서버 (3001)      │ ◄───────────────── │  LTX-2.3 영상 생성            │
│  Edge-TTS 음성 합성           │  완성 영상 다운로드   │                              │
└──────────────────────────────┘                    └──────────────────────────────┘
```

### 질문에 답하는 순서 (`POST /api/dialogue`)

1. **거절 판단**: 현대 단어나 부적절한 표현이면 인물별 거절 영상을 재생합니다. 판정 목록은 `client/src/guardrail.js` 한 곳에 있고 화면과 서버가 함께 씁니다.
2. **프리셋 확인**: 미리 만든 질문 영상(`server/data/historical_docs.json`)과 맞으면 그 영상을 바로 재생합니다.
3. **캐시 확인**: 프리셋에 없지만 이전에 답한 비슷한 질문이면 저장된 답변을 돌려줍니다.
4. **새 답변 생성**: 사료를 검색해 로컬 LLM(Ollama)으로 1~2문장 답변을 만들고 Edge-TTS로 읽습니다. 기다리는 동안 화면에는 인물의 "생각 중" 영상이 나옵니다.
5. **영상 생성과 캐시 저장**: GPU PC가 켜져 있으면 답변 영상을 만들어 캐시에 저장합니다. GPU PC가 꺼져 있으면 대기 화면 위에서 음성만 재생합니다.

---

## 3. 기술 스택

| 영역 | 사용 기술 |
| :--- | :--- |
| 프론트엔드 | React 18, Vite 5 |
| 백엔드 | Node.js (Express) |
| 답변 생성 | 사료 검색(RAG) + Ollama 로컬 LLM (`qwen2.5:3b`) |
| 음성 합성 | Microsoft Edge-TTS (인물별 음높이·속도·음색 조정) |
| 영상 생성 | ComfyUI + LTX-2.3 image-to-video (사진 + 음성 → 말하는 영상) |
| 후처리 | FFmpeg, OpenCV (길이 맞춤, 품질 검사, 대기 영상 생성) |

---

## 4. 폴더 구조

```
NEXUS/
├── client/                     # React 키오스크 화면
│   ├── src/guardrail.js        # 시대착오·비속어 판정 (화면과 서버 공용)
│   ├── src/components/
│   │   ├── KioskMode.jsx       # 인물 선택, 예시 질문, 거절 처리
│   │   └── AvatarVideoPlayer.jsx  # 답변 영상과 대기 영상 재생·전환
│   └── public/
│       ├── images/             # 인물 초상화
│       ├── audio/              # 질문별 답변 음성
│       └── videos/             # 질문별 답변 영상, 대기(눈 깜빡임) 영상
├── server/
│   ├── index.js                # API 서버
│   ├── services/               # RAG, LLM, TTS, 캐시, 영상 생성 서비스
│   ├── data/
│   │   ├── figures.json        # 인물 정보
│   │   ├── historical_docs.json   # 질문 프리셋 (대사, 영상·음성 경로)
│   │   └── cached_dialogues.json  # 답변 캐시
│   └── scripts/
│       └── batch_ltx_preset_generator.py  # 질문 영상 일괄 생성기
├── comfyui_ltx_workflow.json   # LTX-2.3 ComfyUI 워크플로
├── run_nexus.bat               # 키오스크 실행
├── run_comfyui.bat             # GPU PC에서 ComfyUI 실행
├── start_all.bat               # 한 PC에서 모두 실행
└── install_comfyui.bat         # ComfyUI 설치
```

---

## 5. 빠른 시작

### 5.1 준비물

- Windows 10 / 11 (64비트)
- Node.js 18 이상 ([다운로드](https://nodejs.org/))
- Python 3.10 이상 (Edge-TTS 음성 합성용, 설치할 때 **Add python.exe to PATH** 체크)
- 영상을 새로 만들 때만: NVIDIA RTX GPU PC (VRAM 16GB에서 확인함)

### 5.2 실행 파일

모두 더블 클릭으로 실행됩니다.

| 파일 | 하는 일 | 언제 쓰나 |
| :--- | :--- | :--- |
| `run_nexus.bat` | Node.js 확인, `.env` 자동 생성, npm 패키지와 Python 패키지(edge-tts) 자동 설치, API 서버(3001)와 화면(5173) 실행 | 키오스크를 켤 때 |
| `run_comfyui.bat` | 다른 PC에서 접속할 수 있도록 ComfyUI를 8188 포트로 실행 | GPU PC에서 |
| `start_all.bat` | ComfyUI와 키오스크를 한 번에 실행 | 한 PC에서 모두 쓸 때 |
| `install_comfyui.bat` | ComfyUI 본체와 기본 커스텀 노드 설치 | 처음 한 번 |

> 미리 만든 질문 영상만 재생할 때는 GPU PC가 없어도 됩니다.

### 5.3 환경 설정 (`.env`)

`.env.example`을 복사해 `.env`를 만듭니다. `run_nexus.bat`을 실행하면 자동으로 만들어집니다.

```env
# ComfyUI 서버 주소 (같은 PC면 127.0.0.1, GPU PC가 따로 있으면 그 PC의 IPv4 주소)
COMFYUI_URL=http://127.0.0.1:8188

# API 서버 포트
PORT=3001

# (선택) 새 질문에 답할 로컬 LLM
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b
```

**GPU PC를 따로 쓰는 경우**
1. GPU PC에서 `ipconfig`로 IPv4 주소를 확인합니다 (예: `192.168.0.25`).
2. 키오스크 PC의 `.env`에 `COMFYUI_URL=http://192.168.0.25:8188`을 적습니다.
3. GPU PC에서 `run_comfyui.bat`을 실행합니다.

### 5.4 전시용 빌드

화면 코드를 고친 뒤에는 다시 빌드해야 합니다. `client/dist`가 있으면 API 서버(3001)가 빌드된 화면을 함께 제공합니다.

```bash
npm run build
```

---

## 6. 질문 영상 만들기 (LTX-2.3)

질문 영상은 GPU PC의 ComfyUI로 미리 만들어 `client/public/videos`에 넣습니다. 초상화 한 장과 답변 음성 하나로 영상 하나를 만듭니다.

### 6.1 필요한 모델

GPU PC의 ComfyUI `models` 폴더에 아래 파일이 있어야 합니다. 저장소에는 포함되지 않습니다.

| 종류 | 파일 |
| :--- | :--- |
| 본체 | `ltx-2.3-22b-dev-fp8.safetensors` |
| Distilled LoRA | `ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors` |
| 공간 업스케일러 | `ltx-2.3-spatial-upscaler-x2-1.1.safetensors` |
| 텍스트 인코더 | `gemma_3_12B_it_fp4_mixed.safetensors`, `gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors` |
| 이미지 업스케일 | `4x-UltraSharp.pth` |

키오스크 PC에서 생성기를 돌리려면 Python 패키지 `opencv-python`, `numpy`, `torch`가 필요합니다.

### 6.2 실행

```bash
# 모든 질문 영상 생성
python server/scripts/batch_ltx_preset_generator.py --keep-idle

# 특정 인물이나 질문만 생성
python server/scripts/batch_ltx_preset_generator.py --keep-idle --figure king-sejong
python server/scripts/batch_ltx_preset_generator.py --keep-idle --doc doc-yi-01 doc-yi-02
```

| 옵션 | 설명 |
| :--- | :--- |
| `--doc`, `--figure` | 만들 질문이나 인물만 고릅니다 |
| `--keep-idle` | 대기 영상(`idle_blink_*.mp4`)을 다시 만들지 않습니다 |
| `--source-image` | 기본 초상화 대신 쓸 이미지 |
| `--final-size` | 최종 영상 크기 (예: `838x1076`) |
| `--skip-existing` | 이미 있는 영상은 건너뜁니다 |

김구는 대기 영상과 같은 사진에서 시작하고 크기를 맞추기 위해 `--source-image`(대기 영상의 첫 프레임)와 `--final-size 838x1076`을 함께 씁니다.

### 6.3 자동 품질 검사

렌더링이 끝날 때마다 아래 항목을 검사합니다. 기준을 넘으면 시드를 바꿔 다시 만들고(기본 최대 6회), 끝까지 통과하지 못하면 가장 나은 결과를 씁니다. 기준값은 환경 변수로 바꿀 수 있습니다.

| 검사 | 내용 | 기본 기준 (환경 변수) |
| :--- | :--- | :--- |
| 화면 확대 | 첫 프레임 대비 화면 크기 변화 | 3% 이하 (`LTX_MAX_ZOOM_DRIFT`) |
| 입 멈춤 | 음성이 나오는데 입이 움직이지 않는 구간 | 15% 이하, 최장 1초 (`LTX_MAX_DEAD_PCT`, `LTX_MAX_DEAD_RUN`) |
| 입 닫힘 (김구만) | 말하는 중에 입이 다문 사진 그대로인 구간 | 20% 이하, 최장 1초 (`LTX_MAX_CLOSED_PCT`) |
| 고개 흔들림 | 고개 이동 크기와 속도 | 좌우 8%, 상하 10%, 속도 22 (`LTX_MAX_HEAD_X/Y/SPEED`) |
| 프레임 튐 | 한 프레임 만에 얼굴이 바뀌는 현상 | 5 이하 (`LTX_MAX_FRAME_JUMP`) |

### 6.4 영상 생성 방식

- 긴 답변도 나누지 않고 한 번에 렌더링합니다. 나눠 만들면 이어지는 부분에서 영상이 끊기고 원래 사진으로 돌아가 보입니다.
- 일정 간격으로 원본 초상화를 기준점으로 넣어 화면이 서서히 확대되는 것을 막습니다.
- 마지막 프레임을 원본 사진 쪽으로 끌어당겨, 영상이 끝나면 대기 화면과 자연스럽게 이어집니다.
- 말이 끝난 뒤 입을 다무는 약 0.8초를 남기고, 원래 음성을 그대로 다시 입힙니다.

---

## 7. API

| 메서드 | 경로 | 설명 |
| :--- | :--- | :--- |
| GET | `/api/figures` | 인물 목록 |
| POST | `/api/dialogue` | 질문에 대한 답변 (텍스트, 음성, 영상 경로) |
| POST | `/api/audio/generate` | 문장을 인물 음성으로 합성 |
| POST | `/api/video/generate` | 음성으로 말하는 영상 생성 요청 |
| GET | `/api/videos/gallery` | 생성된 영상 목록 |

필수 값이 빠지면 서버는 HTTP 400과 함께 원인과 해결 방법을 JSON으로 돌려주고, 서버 콘솔에도 같은 내용을 출력합니다.

```json
{
  "success": false,
  "errorCode": "MISSING_PARAM_FIGURE_ID",
  "error": "필수 파라미터 'figureId'가 누락되었습니다.",
  "hint": "사용 가능한 figureId: kim-koo, king-sejong, yi-sun-sin, yu-gwan-sun, shin-saimdang"
}
```

---

## 8. 개발 과정에서 해결한 문제

### 8.1 말하는 영상의 품질
- **문제**: SadTalker, LivePortrait 같은 정지 이미지 기반 모델은 입 주변에 검은 타원형 얼룩이 생기거나 얼굴이 일그러졌습니다. 상용 API(D-ID)는 비용, 대기 시간, 워터마크가 문제였습니다.
- **해결**: 로컬 GPU에서 ComfyUI Wav2Lip을 거쳐, 최종적으로 사진과 음성으로 고개·표정·입을 함께 만드는 LTX-2.3 image-to-video로 바꿨습니다.

https://github.com/user-attachments/assets/4b67f8e3-44a5-48ef-b8e7-c1eca45b2eaa

> **초기 테스트: 무료 립싱크 모델의 한계.** 입술 윤곽은 고정된 채 안쪽만 바뀌어 부자연스러운 타원형 그림자가 남았습니다.

https://github.com/user-attachments/assets/fbf42b6c-c2d0-4a17-b5e2-6b8aab03582a

> **초기 테스트: 워터마크 블러 처리의 한계.** 상용 서비스의 워터마크를 FFmpeg 블러로 가리자 전체 화질이 떨어져, 직접 운영하는 ComfyUI 방식으로 바꾸게 됐습니다.

### 8.2 LTX-2.3 영상의 확대와 왜곡
- **문제**: 프롬프트에 "확대 금지"를 넣어도 모델이 평평한 초상화 배경에서 화면을 서서히 확대했습니다. 이를 보정하려던 후처리는 오히려 화면 가장자리가 두 겹으로 보이는 왜곡을 만들었습니다.
- **해결**: 후처리 보정을 없애고, 원본 초상화를 일정 간격의 기준점으로 넣어 모델이 처음부터 구도를 유지하게 했습니다. 확대량은 렌더링마다 측정해 3%를 넘으면 다시 만듭니다.

### 8.3 입이 움직이지 않는 영상
- **문제**: 같은 설정이어도 시드에 따라 영상 일부나 전체에서 입이 멈췄습니다.
- **해결**: 음성 크기와 입 영역 변화를 비교해 말하는 중 입이 멈춘 구간을 찾고, 기준을 넘으면 시드를 바꿔 다시 만듭니다. 사진 질감이 거친 김구는 입을 다문 사진과의 유사도를 추가로 검사합니다.

### 8.4 이음새 끊김과 끝부분 왜곡
- **문제**: 긴 답변을 조각으로 나눠 만들면 조각마다 원래 사진에서 다시 시작해 영상이 끊겨 보였습니다. 끝부분을 원래 사진으로 억지로 변형하면 얼굴이 일그러졌습니다.
- **해결**: 답변 전체를 한 번에 렌더링하고, 끝부분은 변형하지 않고 모델이 원래 자세로 돌아오도록 마지막 프레임을 유도합니다. 플레이어는 영상이 끝나도 마지막 프레임을 유지한 채 대기 화면으로 넘어갑니다.

### 8.5 실제 음성이 없는 인물의 목소리
- **문제**: 세종대왕, 이순신처럼 녹음이 남아 있지 않은 인물의 목소리를 만들어야 했습니다.
- **해결**: Edge-TTS 한국어 음성을 바탕으로 인물마다 음높이, 속도, 음색(EQ)을 조정했습니다. 김구는 기존 영상의 음성과 음색을 맞춰 더 무겁고 낮은 목소리로 만들었습니다.

### 8.6 전시장 대기 시간
- **문제**: 질문마다 영상을 새로 만들면 관람객이 기다려야 했습니다.
- **해결**: 자주 나올 질문은 영상을 미리 만들어 두고, 한 번 답한 질문은 캐시에 저장해 바로 재생합니다.

---

## 9. 저장소 관리

- **올리지 않는 파일** (`.gitignore`): `ComfyUI_windows_portable/`, 모델 가중치(`*.safetensors`, `*.pth`), `client/dist/`, 렌더링 로그(`server/data/ltx_batch_log*.txt`), 영상 백업(`server/data/video_backup*/`)
- **환경 변수**: `.env`는 올리지 않습니다. 새 PC에서는 `.env.example`을 복사해 씁니다.
- **영상 파일 크기**: 질문 영상은 한 개에 6MB 이하라 GitHub 단일 파일 제한(100MB)에 걸리지 않습니다.

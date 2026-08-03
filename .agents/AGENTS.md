# Project Rules & Customizations

## ABSOLUTE IRONCLAD RULES (CRITICAL - NEVER BREAK)

1. **이미지 좌우/위아래 흔들기 영상 제작 절대 금지 (NO Shaking/Swaying)**
   - 2D `warpAffine` 좌표 흔들기나 이미지 전체 흔들림(Swaying)을 이용한 가짜 동영상 제작 금지.
   - 배경, 체형, 경계면이 어색하게 흔들리는 연출은 어떠한 경우에도 하지 않는다.

2. **이미지에 입 모양(타원/그래픽) 붙이기 절대 금지 (NO Ellipse/Graphic Mouth Overlay)**
   - 2D Canvas나 OpenCV `cv2.ellipse`, 타원 그림, 입 모양 도형 덮어씌우기는 절대로 사용하지 않는다.
   - 인공적인 입 모양 덧그리기는 금지한다.

3. **실사 AI Talking Head 및 딥러닝 텍스처 립싱크 준수**
   - 딥러닝 신경망 인퍼런스(SadTalker / LivePortrait / Wav2Lip) 또는 PyTorch CUDA 텐서 그리드 변형을 통해서만 자연스러운 3D 표정과 입술 움직임을 구현한다.

// 시대착오·비속어 질문 판정.
// 키오스크 화면(KioskMode.jsx)과 API 서버(server/index.js, llmService.js)가 이 파일 하나를 함께 쓴다.
// 목록을 고칠 때는 여기만 고치면 된다.

// 1) 현대 문물: 띄어쓰기를 없앤 질문에 들어 있기만 하면 거절한다 ("스마트 폰"도 잡는다)
const MODERN_WORDS = [
  '스마트폰', '핸드폰', '휴대폰', '아이폰', '갤럭시', '컴퓨터', '노트북', '태블릿', '아이패드',
  '인터넷', '와이파이', '웹사이트', '유튜브', '넷플릭스', '카카오톡', '카톡', '인스타',
  '페이스북', '페북', '틱톡', '트위터', '비트코인', '코인', '가상화폐', '암호화폐', '주식',
  '인공지능', '챗gpt', '챗지피티', 'chatgpt', '로봇', '드론', '자동차', '전기차', '비행기', '우주선',
  '텔레비전', '티비', '라디오', '게임', '스타크래프트', '오버워치', '배그'
];

// 2) 영문 약어: 다른 영어 단어의 일부일 때는 거절하지 않는다 ("said"의 ai 등)
const LATIN_WORDS = ['pc', 'sns', 'ai', 'tv', 'gpt', 'sex'];

// 3) 비속어: 들어 있기만 하면 거절한다
const PROFANITY_WORDS = [
  '시발', '씨발', '개새끼', '새끼', '지랄', '병신', '바보', '멍청이', '섹스', '느금', '엠창', '개소리',
  '미친놈', '미친년', '미친새끼', '미친것', '미친거', '미쳤냐', '미쳤니', '미쳤어', '미쳤나',
  '죽어라', '죽어버려', '죽인다', '죽여버', '꺼져라', '꺼져버려', '닥쳐라', '입닥쳐', '아가리'
];

// 4) 정상 문장에도 흔히 나오는 글자: 낱말 하나로 따로 쓰였을 때만 거절한다.
//    "영향을 미친", "위기가 닥쳐올 때", "롤모델", "돌아보지", "잠을 자지 못하고" 같은 질문은 통과시킨다.
const TOKEN_WORDS = {
  '롤': ['', '을', '를', '이', '은', '도', '하', '해'],
  '보지': ['', '를', '가'],
  '자지': ['', '를', '가']
};
// "해 보지 않으셨나요", "잠을 자지 못하셨나요"처럼 뒤에 부정 표현이 오면 정상 문장이다
const NEGATION_START = /^(않|못|말|마|아니)/;

export function isAnachronisticOrRude(query) {
  if (!query || typeof query !== 'string') return false;
  const lower = query.toLowerCase();
  const noSpace = lower.replace(/\s+/g, '');

  if (MODERN_WORDS.some(w => noSpace.includes(w))) return true;
  if (PROFANITY_WORDS.some(w => noSpace.includes(w))) return true;
  if (LATIN_WORDS.some(w => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(lower))) return true;

  const tokens = lower.split(/[\s.,!?~"'“”‘’()\[\]…·]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    for (const [word, suffixes] of Object.entries(TOKEN_WORDS)) {
      if (!suffixes.some(sfx => token === word + sfx)) continue;
      if ((word === '보지' || word === '자지') && tokens[i + 1] && NEGATION_START.test(tokens[i + 1])) continue;
      return true;
    }
    // "죽어"는 문장 끝에 홀로 쓰였을 때만 욕설로 본다 ("내가 죽어 조국이 산다면"은 통과)
    if (token === '죽어' && i === tokens.length - 1) return true;
    // "닥쳐", "꺼져"는 문장 처음이나 끝에 홀로 쓰였을 때만 욕설로 본다 ("불이 꺼져 가는"은 통과)
    if (['닥쳐', '꺼져', '닥쳐요', '꺼져요'].includes(token) && (i === 0 || i === tokens.length - 1)) return true;
  }
  return false;
}

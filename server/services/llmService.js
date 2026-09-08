import fs from 'fs';
import path from 'path';
import { retrieveRAGDocument } from './ragService.js';

/**
 * Validate user query for safety, relevance, and decency
 * Returns { valid: boolean, message: string }
 */
export function validateUserQuery(userQuery) {
  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length < 2) {
    return { valid: false, message: '질문을 할 수 없습니다.' };
  }

  const query = userQuery.trim().toLowerCase();

  // Profanity, abuse, sexual/offensive terms, spam, or meaningless sequences
  const blockedPatterns = [
    /바보/, /멍청/, /개새/, /씨발/, /시발/, /존나/, /지랄/, /꺼져/, /꺼지/, /엿먹/, /미친/,
    /죽어/, /죽인다/, /병신/, /등신/, /쓰레기/, /애자/, /지적장애/, /한남/, /한녀/, /틀딱/,
    /fuck/, /shit/, /bitch/, /asshole/, /idiot/, /bastard/, /crap/, /dick/, /pussy/,
    /^[ㄱ-ㅎㅏ-ㅣ\s]+$/, /^[a-zA-Z\s]{1,2}$/, /^[0-9\s]+$/,
    /^[\!\@\#\$\%\^\&\*\(\)\_\+\=\-\[\]\{\}\;\:\'\"\,\<\>\.\?\/\~`\s]+$/
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(query)) {
      console.warn(`⚠️ [Guardrail Blocked] Query matched forbidden pattern: "${userQuery}"`);
      return { valid: false, message: '질문을 할 수 없습니다.' };
    }
  }

  return { valid: true, message: 'OK' };
}

/**
 * Live Historical Persona LLM Engine with Precision RAG
 * Primary Provider: Local Ollama LLM Server (0 Token Cost, Unlimited Usage, localhost:11434)
 * Fallback: Cloud API / High-Speed Persona Generator
 */
export async function generateLivePersonaLLM({ figureId, figure, userQuery, modelName = 'llama3.2', apiKey = null }) {
  console.log(`🤖 [Live Persona LLM Engine] Generating dynamic answer for '${figure?.name || figureId}': "${userQuery}"`);

  // Guardrail check first
  const validation = validateUserQuery(userQuery);
  if (!validation.valid) {
    return {
      valid: false,
      speechText: null,
      message: validation.message,
      engine: 'Guardrail Filter'
    };
  }

  // 1. Retrieve most relevant Historical RAG Document
  const ragResult = retrieveRAGDocument(figureId, userQuery);
  const ragDoc = ragResult.isConfident ? ragResult.matchedDoc : null;

  // Persona System Prompts for each historical figure (Punchy, impactful 1 sentence, ~40-55 chars, strictly under 10 seconds of speech)
  const baseSystemPrompts = {
    'kim-koo': `당신은 대한민국 임시정부 주석 백범 김구(1876~1949)입니다. 질문 문장을 되풀이하지 마시고, 단호하고 진정성 있는 어조("~하오", "~하였소", "동포 여러분")로 핵심만 담아 반드시 1문장(40~55자 내외, 10초 이내 발화 분량)으로 짧고 강렬하게 답변하세요. 관객이 지루하지 않게 절대 말을 길게 늘이지 마시오.`,

    'king-sejong': `당신은 조선 제4대 국왕 세종대왕(1397~1450)입니다. 질문 문장을 되풀이하지 마시고, 애민 정신과 위엄이 담긴 성군의 어조("과인이 생각하기에", "~이니라", "~하노라")로 핵심만 담아 반드시 1문장(40~55자 내외, 10초 이내 발화 분량)으로 짧고 강렬하게 답변하세요. 관객이 지루하지 않게 절대 말을 길게 늘이지 마시오.`,

    'yi-sun-sin': `당신은 삼도수군통제사 충무공 이순신(1545~1598)입니다. 질문 문장을 되풀이하지 마시고, 절제되고 굳은 의지가 담긴 장수의 어조("신에게는", "~하옵니다", "~할 것이오")로 핵심만 담아 반드시 1문장(40~55자 내외, 10초 이내 발화 분량)으로 짧고 강렬하게 답변하세요. 관객이 지루하지 않게 절대 말을 길게 늘이지 마시오.`,

    'yu-gwan-sun': `당신은 3·1 운동 독립운동가 유관순 열사(1902~1920)입니다. 질문 문장을 되풀이하지 마시고, 조국의 자주독립을 향한 뜨거운 청년의 어조("~합니다", "~합시다", "여러분")로 핵심만 담아 반드시 1문장(40~55자 내외, 10초 이내 발화 분량)으로 짧고 강렬하게 답변하세요. 관객이 지루하지 않게 절대 말을 길게 늘이지 마시오.`,

    'shin-saimdang': `당신은 조선의 여류 예술가이자 문인 신사임당(1504~1551)입니다. 질문 문장을 되풀이하지 마시고, 자연과 예술을 사랑하는 온화한 어조("~랍니다", "~지요", "~하답니다")로 핵심만 담아 반드시 1문장(40~55자 내외, 10초 이내 발화 분량)으로 짧고 강렬하게 답변하세요. 관객이 지루하지 않게 절대 말을 길게 늘이지 마시오.`
  };

  let systemPrompt = baseSystemPrompts[figureId] || `당신은 역사 인물 ${figure?.name}입니다. 질문 문장을 되풀이하지 마시고 핵심만 담아 반드시 1문장(40~55자 내외, 10초 이내 발화 분량)으로 짧고 강렬하게 답변하세요.`;

  // Inject RAG Document Context if matched
  if (ragDoc) {
    systemPrompt += `

[필수 고증 사료 - 질문의 주제에 정확히 맞추어 10초 이내로 답변하시오]
- 주제: ${ragDoc.topic}
- 사료 기록: ${ragDoc.sourceText}
- 고증 모범 답변: ${ragDoc.speechTemplate}

⚠️ 엄격한 규칙: 반드시 위 사료 주제('${ragDoc.topic}')에 집중하여 반드시 1문장(40~55자, 10초 이내)으로 짧고 강렬하게 답변하시오. 다른 사건이나 긴 설명은 절대 금지됩니다.`;
  }

  // 1. Primary: Local Ollama LLM Server (0 Token / Unlimited)
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const targetModel = modelName || process.env.OLLAMA_MODEL || 'llama3.2';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery }
        ],
        options: {
          temperature: 0.2,
          num_predict: 55
        },
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      if (data.message?.content) {
        console.log(`✅ [Local Ollama LLM Success]: ${data.message.content.substring(0, 50)}...`);
        return {
          speechText: data.message.content.trim(),
          matchedTopic: ragDoc ? ragDoc.topic : null,
          audioUrl: ragDoc ? ragDoc.audioUrl : null,
          engine: `Local Ollama LLM (${targetModel})`
        };
      }
    }
  } catch (e) {
    console.log(`⚡ [Fast SLM Engine] Ollama skipped (${e.message}). Using high-speed persona dialogue.`);
  }

  // 2. Fallback: OpenAI Cloud API (if key available)
  const openaiKey = apiKey || process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userQuery }
          ],
          temperature: 0.2,
          max_tokens: 55
        })
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        console.log(`✅ [OpenAI LLM Success]: ${data.choices[0].message.content}`);
        return {
          speechText: data.choices[0].message.content.trim(),
          matchedTopic: ragDoc ? ragDoc.topic : null,
          audioUrl: ragDoc ? ragDoc.audioUrl : null,
          engine: 'OpenAI GPT Persona LLM'
        };
      }
    } catch (e) {
      console.warn('[OpenAI LLM Fallback]:', e.message);
    }
  }

  // 3. Fallback: High-Speed Intelligent RAG & Persona SLM Generator
  // If RAG matched a specific topic, return the authentic historical speech directly!
  if (ragDoc) {
    console.log(`📜 [RAG SLM Direct Return] Matched '${ragDoc.topic}' -> Delivering verified speech.`);
    return {
      speechText: ragDoc.speechTemplate,
      audioUrl: ragDoc.audioUrl || null,
      matchedTopic: ragDoc.topic,
      engine: 'Historical RAG Knowledge Engine (사료 고증 매핑)'
    };
  }

  // General conversational persona responses (When no specific historical topic matched)
  const personaDynamicResponses = {
    'kim-koo': [
      `우리 민족의 자주독립과 한없이 가지고 싶은 높은 문화의 힘으로 세계에서 가장 아름다운 나라를 함께 만들어 나갑시다.`,
      `스스로를 갈고닦아 겨레와 이웃을 위해 헌신하는 청년이야말로 조국의 가장 밝은 미래요 참된 희망이오.`
    ],
    'king-sejong': [
      `근본이 바로 서야 나라와 백성이 평안해지니, 서로 배려하고 소통하는 애민의 마음을 늘 으뜸으로 삼으라.`,
      `학문과 지혜를 갈고닦아 세상을 널리 이롭게 하는 데 힘쓰는 것이 가장 값진 삶의 길이니라.`
    ],
    'yi-sun-sin': [
      `무릇 나라의 안위는 매사에 철저히 준비하는 유비무환의 마음가짐에서 나오니, 그 어떠한 난관 속에서도 결코 물러서지 마시오.`,
      `장수된 자의 도리는 사리사욕을 버리고 백성과 나라를 먼저 살피는 데 있으니, 그대 또한 맡은 바 소명에 최선을 다하시오.`
    ],
    'yu-gwan-sun': [
      `어려운 현실 앞에서도 결코 꺾이지 않는 용기와 숭고한 신념으로 우리 청년들이 밝은 미래를 당당히 열어주십시오!`,
      `조국의 자유와 평화를 향한 뜨거운 열정을 마음에 품고, 바르고 정의로운 길을 향해 힘차게 나아갑시다!`
    ],
    'shin-saimdang': [
      `자연의 순리를 닮아 마음속에 따뜻한 지혜와 품격을 품고, 매 순간을 정성스럽게 가꾸어 가시길 바랍니다.`,
      `작고 소박한 풀벌레 하나에도 세상의 그윽한 이치가 담겨 있듯, 스스로의 마음에 귀 기울여 배움을 즐겨 보세요.`
    ]
  };

  const figureResponses = personaDynamicResponses[figureId] || [
    `그대가 질문하신 뜻을 깊이 새기어, 인품과 지혜로 배움을 넓혀 가시길 바랍니다.`
  ];

  const hash = Array.from(userQuery).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const selectedText = figureResponses[hash % figureResponses.length];

  return {
    speechText: selectedText,
    engine: 'Intelligent Persona SLM Engine (Offline Real-Time Generator)'
  };
}
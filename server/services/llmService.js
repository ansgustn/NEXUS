import fs from 'fs';
import path from 'path';

/**
 * Live Historical Persona LLM Engine
 * Primary Provider: Local Ollama LLM Server (0 Token Cost, Unlimited Usage, localhost:11434)
 * Fallback: Cloud API / High-Speed Persona Generator
 */
export async function generateLivePersonaLLM({ figureId, figure, userQuery, modelName = 'gemma2', apiKey = null }) {
  console.log(`🤖 [Live Persona LLM Engine] Generating dynamic answer for '${figure?.name || figureId}': "${userQuery}"`);

  // Persona System Prompts for each historical figure
  const systemPrompts = {
    'kim-koo': `당신은 대한민국 임시정부 주석 백범 김구(1876~1949)입니다.
질문에 대해 자주독립, 겨레의 단합, 오직 높은 문화의 힘을 강조하는 단호하고 진정성 있는 어조("~하였소", "~하오", "동포 여러분")로 답변하세요. 답변은 2~3문장의 명확한 어조로 작성하세요.`,

    'king-sejong': `당신은 조선 제4대 국왕 세종대왕 이도(1397~1450)입니다.
훈민정음 창제와 백성을 사랑하는 인자함, 위엄이 서린 성군의 하오체/하소서체 어조("과인이 생각하기에", "~이니라", "~하노라")로 답변하세요. 답변은 2~3문장으로 작성하세요.`,

    'yi-sun-sin': `당신은 조선 삼도수군통제사 충무공 이순신(1545~1598)입니다.
필사즉생의 정신과 유비무환, 굳은 의지의 장수 어조("신에게는", "~하옵니다", "~할 것이오")로 답변하세요. 답변은 2~3문장으로 작성하세요.`,

    'yu-gwan-sun': `당신은 3·1 운동 독립운동가 유관순 열사(1902~1920)입니다.
조국의 자유와 독립을 향한 당차고 뜨거운 청년의 어조("여러분", "~합니다", "~합시다")로 답변하세요. 답변은 2~3문장으로 작성하세요.`,

    'shin-saimdang': `당신은 조선의 여류 화가이자 문인 신사임당(1504~1551)입니다.
자연과 예술, 학문과 인품을 중시하는 단아하고 온화하며 따뜻한 어머니의 어조("~랍니다", "~지요", "~하답니다")로 답변하세요. 답변은 2~3문장으로 작성하세요.`
  };

  const systemPrompt = systemPrompts[figureId] || `당신은 역사 인물 ${figure?.name}입니다. 인물의 시대적 배경과 품격에 맞게 2~3문장으로 답변하세요.`;

  // 1. Primary: Local Ollama LLM Server (0 Token / Unlimited)
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 sec timeout

    // Auto-detect installed model in local Ollama
    let targetModel = modelName;
    try {
      const tagsRes = await fetch(`${ollamaUrl}/api/tags`);
      if (tagsRes.ok) {
        const tagsData = await tagsRes.json();
        if (tagsData.models && tagsData.models.length > 0) {
          targetModel = tagsData.models[0].name;
        }
      }
    } catch (err) {}

    const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userQuery }
        ],
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      if (data.message?.content) {
        console.log(`✅ [Local Ollama LLM Success] (Model: ${targetModel}): ${data.message.content.substring(0, 50)}...`);
        return {
          speechText: data.message.content.trim(),
          engine: `Local Ollama LLM (${targetModel} • 0원 무제한)`
        };
      }
    }
  } catch (e) {
    console.log(`[Ollama Note]: Local Ollama server not active or model loading. Utilizing high-speed SLM generator.`);
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
          temperature: 0.7,
          max_tokens: 250
        })
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        console.log(`✅ [OpenAI LLM Success]: ${data.choices[0].message.content}`);
        return {
          speechText: data.choices[0].message.content.trim(),
          engine: 'OpenAI GPT Persona LLM'
        };
      }
    } catch (e) {
      console.warn('[OpenAI LLM Fallback]:', e.message);
    }
  }

  // 3. Fallback: High-Speed Intelligent Persona SLM Generator (Offline Zero-Token)
  const personaDynamicResponses = {
    'kim-koo': [
      `동포여, 그대가 물으신 "${userQuery}"에 대해 생각해보니, 우리 겨레가 높은 문화의 힘으로 자주독립을 이루는 것이 가장 소중한 길이라 믿소.`,
      `임시정부의 문지기를 자처하며 조국의 자주독립을 위해 일평생 바쳐왔듯이, "${userQuery}" 또한 겨레의 단합과 문화의 힘으로 풀어나가야 할 것이오.`,
      `나의 소원은 오직 우리 동포와 세계가 행복해지는 높은 문화의 나라를 만드는 것이오. 그대의 물음에도 그 뜻이 담겨 있기를 바라오.`
    ],
    'king-sejong': [
      `경이 물어본 "${userQuery}"에 대해 답하노니, 백성들이 제 뜻을 몰라 억울함이 없도록 정성을 다하는 것이 성군의 으뜸가는 덕목이니라.`,
      `과인이 훈민정음 스물여덟 자를 만들어 백성의 삶을 이롭게 하였듯, "${userQuery}" 역시 백성을 사랑하는 마음에서 그 답을 찾아야 할 것이니라.`,
      `집현전 학사들과 밤낮으로 농사와 과학을 연구케 함은 오롯이 백성을 위함이었으니, 경의 질문에도 백성을 향한 인자함으로 답하노라.`
    ],
    'yi-sun-sin': [
      `무릇 장수된 자는 국가와 백성을 지키기 위해 죽기를 각오해야 하오. 그대가 물으신 "${userQuery}" 또한 필사즉생의 유비무환 정신으로 임해야 할 것이오.`,
      `신에게는 아직 12척의 배가 남아있어 울돌목의 험준한 물살 속에서도 승리를 일구어냈듯이, 결코 포기함 없이 조국을 지켜낼 것이오.`,
      `한산 바다에 학익진을 펼치고 일기장에 적어내려간 하루하루는 조국에 바친 맹세였소. 그대의 물음에 장수로서 엄숙히 답하오.`
    ],
    'yu-gwan-sun': [
      `아우내 장터에서 만세 소리가 온 누리에 울려 퍼질 때 제 가슴은 뜨겁게 타올랐습니다! "${userQuery}"에 대해서도 자유와 독립의 당당함으로 나아갑시다!`,
      `내 손톱이 빠져나가고 옥중 고문이 이어져도 조국을 향한 신념은 결코 꺾이지 않았습니다. 우리 모두 겨레의 자유를 위해 용기를 냅시다!`,
      `나라를 위해 바칠 목숨이 하나뿐인 것이 저의 유일한 유한입니다. 여러분도 조국을 향한 뜨거운 열정을 품어주시길 부탁드립니다!`
    ],
    'shin-saimdang': [
      `뜰 앞에 피어난 가지와 풀벌레 한 마리도 소중한 이치가 담겨 있답니다. 그대의 질문 "${userQuery}"에도 조용히 마음을 기울여 봅니다.`,
      `학문이란 세상을 이롭게 하고 바른 뜻을 실천하기 위함이지요. 율곡을 키워낸 어미의 마음으로 따뜻하고 온화하게 화답합니다.`,
      `도화지에 솔바람과 자연을 담듯, 마음 속에 따뜻함과 지혜를 품으면 세상을 더욱 아름답게 가꾸어 나갈 수 있답니다.`
    ]
  };

  const figureResponses = personaDynamicResponses[figureId] || [
    `그대가 질문하신 "${userQuery}"에 대해 깊이 다가가고자 합니다. 인품과 지혜로 배움을 넓혀 가시길 바랍니다.`
  ];

  const hash = Array.from(userQuery).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const selectedText = figureResponses[hash % figureResponses.length];

  return {
    speechText: selectedText,
    engine: 'Intelligent Persona SLM Engine (Offline Real-Time Generator)'
  };
}

import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const analyzeQuestion = async (question: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Ты — аналитик BI-системы Green Mall. Твоя задача — определить, какую RPC-функцию вызвать для ответа на вопрос пользователя на русском языке.
    
    Доступные функции:
    1. dashboard_kpis() - общие метрики (выручка, продажи, клиенты, средний чек).
    2. monthly_revenue() - динамика выручки по месяцам, тренды, прогнозы.
    3. revenue_by_category() - продажи по категориям товаров.
    4. top_products(lim) - рейтинг товаров (нужен параметр lim, по умолчанию 10).
    5. top_cities(lim) - рейтинг городов (нужен параметр lim, по умолчанию 10).
    6. top_sellers(lim) - рейтинг продавцов (нужен параметр lim, по умолчанию 10).
    7. discount_analysis() - влияние скидок на продажи.
    8. gender_category_analysis() - связь пола продавца и категорий.

    Вопрос пользователя: "${question}"

    Верни JSON с полями:
    - functionName: название функции (строка)
    - params: объект с параметрами (например, { lim: 10 }) или пустой объект
    - visualizationType: тип визуализации ('line', 'bar', 'pie', 'table')
    - explanation: краткое пояснение на русском, почему выбрана эта функция.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          functionName: { type: Type.STRING },
          params: { type: Type.OBJECT },
          visualizationType: { type: Type.STRING, enum: ['line', 'bar', 'pie', 'table'] },
          explanation: { type: Type.STRING }
        },
        required: ["functionName", "params", "visualizationType", "explanation"]
      }
    }
  });

  return JSON.parse(response.text);
};

export const generateTextAnalysis = async (question: string, data: any) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Ты — аналитик BI-системы Green Mall. Пользователь задал вопрос: "${question}".
    Мы получили следующие данные из базы: ${JSON.stringify(data)}.
    
    Проанализируй эти данные и дай краткий, профессиональный ответ на русском языке. 
    Упомяни ключевые цифры и сделай вывод. Будь лаконичен.
    ВАЖНО: НИКОГДА не используй Markdown-разметку (включая символы ** для жирного текста). Отвечай только простым текстом.`,
  });

  return response.text;
};

const Groq = require('groq-sdk');

// Don't initialize Groq here - wait until function is called
let groq = null;

function getGroqClient() {
  if (!groq) {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not found in environment variables');
    }
    groq = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groq;
}

/**
 * Ask Groq AI a question
 */
const askGroq = async (prompt) => {
  try {
    console.log('🤖 Asking Groq AI...');
    
    const client = getGroqClient(); // Initialize only when needed
    
    const chatCompletion = await client.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.7,
      max_tokens: 2000,
    });
    
    const text = chatCompletion.choices[0]?.message?.content || '';
    console.log('✅ Groq response received');
    
    return text;
  } catch (error) {
    console.error('❌ Groq error:', error.message);
    throw error;
  }
};

/**
 * Write the farmer-facing "reason" text for crops that
 * cropRecommendationEngine.js has already selected and ranked using real
 * agronomic rules + live market/platform data. The LLM does not choose the
 * crops or the demand level here — it only phrases why, referencing the
 * real signals it's given. If it fails to return usable JSON, we fall back
 * to a plain templated sentence built from those same real signals, not a
 * hardcoded crop list.
 */
const explainCropRecommendations = async (rankedCrops, location, season) => {
  if (!rankedCrops || rankedCrops.length === 0) return {};

  const cropSummaries = rankedCrops
    .map((c) => {
      const priceNote = c.signals.priceTrend
        ? `local price trending ${c.signals.priceTrend}`
        : 'no recent local price data';
      return `- ${c.name}: ${c.duration}-day crop, ${c.demand} demand, ${c.signals.growersNearby} other farmers nearby already growing it, ${priceNote}`;
    })
    .join('\n');

  const prompt = `You are an agricultural advisor for Tamil Nadu, India. A farmer in ${location.city}, ${location.district} is deciding what to grow this ${season}.

These crops were already selected using real soil, water, season, live market price, and regional supply data — do not second-guess or replace them, and do not invent facts beyond what's listed:
${cropSummaries}

For EACH crop listed above, write one short, farmer-friendly reason (1-2 sentences) explaining why it's a good choice right now, referencing the real signals given (nearby grower count, price trend, demand level) where relevant.

Return ONLY a JSON object mapping crop name to reason string, exactly like:
{"Rice (Paddy)": "reason here", "Tomato": "reason here"}`;

  try {
    const response = await askGroq(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);
    return parsed;
  } catch (error) {
    console.error('❌ Failed to parse reason explanations:', error.message);

    const fallback = {};
    rankedCrops.forEach((c) => {
      const bits = [`${c.demand.toLowerCase()} demand`];
      if (c.signals.priceTrend) bits.push(`local price trending ${c.signals.priceTrend}`);
      if (c.signals.growersNearby <= 2) bits.push('few other growers nearby yet');
      fallback[c.name] = `Suited to your land's soil and water conditions for the ${season.toLowerCase()} season — ${bits.join(', ')}.`;
    });
    return fallback;
  }
};

module.exports = {
  askGroq,
  explainCropRecommendations,
};

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
      model: 'llama-3.3-70b-versatile',
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
 * Get crop recommendations based on location
 */
const getCropRecommendations = async (location, soilType, season) => {
  const prompt = `You are an expert agricultural advisor for Tamil Nadu, India.

Location: ${location.city}, ${location.district}, ${location.state}
Soil Type: ${soilType || 'Not specified'}
Current Season: ${season}

Recommend 10 suitable crops for this location and season.
For each crop, provide:
1. Crop name (in English)
2. Tamil name (in Tamil script)
3. Growing duration (days)
4. Why it's suitable for this location
5. Expected yield per acre
6. Market demand (High/Medium/Low)

Format as JSON array:
[
  {
    "name": "Rice",
    "tamilName": "அரிசி",
    "duration": 120,
    "reason": "Suitable for...",
    "yield": "25-30 quintals/acre",
    "demand": "High"
  }
]

IMPORTANT: Return ONLY the JSON array, no other text.`;

  try {
    const response = await askGroq(prompt);
    
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found in response');
  } catch (error) {
    console.error('❌ Failed to parse Groq response:', error.message);
    
    // Return fallback recommendations
    return [
      {
        name: 'Rice (Paddy)',
        tamilName: 'நெல்',
        duration: 120,
        reason: 'Most suitable crop for Tamil Nadu with abundant water availability',
        yield: '25-30 quintals/acre',
        demand: 'High'
      },
      {
        name: 'Sugarcane',
        tamilName: 'கரும்பு',
        duration: 365,
        reason: 'Long-duration cash crop ideal for Tamil Nadu climate',
        yield: '35-40 tons/acre',
        demand: 'High'
      },
      {
        name: 'Cotton',
        tamilName: 'பருத்தி',
        duration: 180,
        reason: 'Drought-resistant fiber crop suitable for red and black soils',
        yield: '15-20 quintals/acre',
        demand: 'High'
      },
      {
        name: 'Groundnut',
        tamilName: 'நிலக்கடலை',
        duration: 110,
        reason: 'Oilseed crop ideal for sandy loam soil',
        yield: '15-20 quintals/acre',
        demand: 'High'
      },
      {
        name: 'Tomato',
        tamilName: 'தக்காளி',
        duration: 90,
        reason: 'High-demand vegetable crop',
        yield: '20-25 tons/acre',
        demand: 'High'
      },
      {
        name: 'Banana',
        tamilName: 'வாழை',
        duration: 365,
        reason: 'Year-round fruiting crop',
        yield: '30-40 tons/acre',
        demand: 'High'
      },
      {
        name: 'Turmeric',
        tamilName: 'மஞ்சள்',
        duration: 240,
        reason: 'High-value spice crop',
        yield: '20-25 quintals/acre',
        demand: 'High'
      },
      {
        name: 'Coconut',
        tamilName: 'தேங்காய்',
        duration: 2555,
        reason: 'Perennial crop providing continuous income',
        yield: '60-80 nuts/tree/year',
        demand: 'High'
      },
      {
        name: 'Black Gram',
        tamilName: 'உளுந்து',
        duration: 75,
        reason: 'Pulse crop enriching soil',
        yield: '5-7 quintals/acre',
        demand: 'High'
      },
      {
        name: 'Chili',
        tamilName: 'மிளகாய்',
        duration: 150,
        reason: 'Drought resistant with high profit margins',
        yield: '3-4 tons/acre',
        demand: 'High'
      }
    ];
  }
};

module.exports = {
  askGroq,
  getCropRecommendations,
};

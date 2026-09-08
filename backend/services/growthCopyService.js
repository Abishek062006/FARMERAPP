// Bilingual phrasing layer for the day-by-day task engine — mirrors
// groqService.explainCropRecommendations exactly: the LLM only translates
// already-decided rule-based task text into Marathi, it never decides what
// the task is. A Groq failure (or missing key) must never block task
// creation, so this always falls back to the plain English text with an
// empty local-language field rather than throwing.

const { askGroq } = require('./groqService');

async function translateDailyTasks(taskSpecs) {
  if (!taskSpecs || taskSpecs.length === 0) return taskSpecs;

  const summaries = taskSpecs
    .map((t, i) => `${i}. [${t.taskType}] "${t.title}" — ${t.description}`)
    .join('\n');

  const prompt = `Translate ONLY the following farm task titles and descriptions into natural, farmer-friendly Marathi (देवनागरी script). Do not change their meaning, do not add new advice, just translate:
${summaries}

Return ONLY a JSON array, one object per task in the same order, like:
[{"titleLocal": "...", "descriptionLocal": "..."}]`;

  try {
    const response = await askGroq(prompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    const translations = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response);

    return taskSpecs.map((spec, i) => ({
      ...spec,
      titleLocal: translations[i]?.titleLocal || spec.titleLocal || '',
      descriptionLocal: translations[i]?.descriptionLocal || spec.descriptionLocal || '',
    }));
  } catch (error) {
    console.error('❌ Failed to translate daily tasks, using English-only fallback:', error.message);
    return taskSpecs;
  }
}

module.exports = { translateDailyTasks };

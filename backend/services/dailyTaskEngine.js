// Deterministic day-by-day task engine — decides what a farmer should do
// TODAY for a given crop. Everything here is rule-based, not LLM-generated:
// watering frequency/amount, fertilizer touchpoints, and pest-watch cadence
// all come from fixed tables keyed by crop category + growth stage, plus the
// crop's own real land/weather/disease data. This mirrors the same
// principle already established in cropRecommendationEngine.js — an LLM may
// phrase the output (see growthCopyService.js), but never decides it.
//
// Fertilizer amounts come from fertilizerRules.js — real crop-specific N:P:K
// where we have solid data, a clearly-labeled category average otherwise,
// scaled by the farmer's actual land/plot area or plant count (never a
// guessed number), converted to product quantities via fixed fertilizer
// chemistry. Real pesticide advice is only ever surfaced by referencing an
// actual Disease record the farmer already has, not invented fresh here.

const axios = require('axios');
const Disease = require('../models/Disease');
const { CROPS } = require('../data/agroZones');
const {
  PERENNIAL_DURATION_THRESHOLD_DAYS,
  getEstablishmentPhaseDays,
  computeStageRanges,
  isLongDurationCrop,
} = require('../data/growthStageRules');
const {
  PRODUCT_NUTRIENT_CONTENT,
  TOUCHPOINT_NUTRIENT_SPLIT,
  getFertilizerRequirement,
  acresFromAreaField,
} = require('../data/fertilizerRules');

const GENERIC_CROP_DEF = {
  name: 'Unknown crop',
  category: 'vegetable_fruiting',
  duration: 90,
};

function resolveCropDefinition(cropName) {
  const exact = CROPS.find((c) => c.name === cropName);
  if (exact) return exact;

  const loose = CROPS.find(
    (c) => c.name.toLowerCase().trim() === String(cropName || '').toLowerCase().trim()
  );
  if (loose) return loose;

  return { ...GENERIC_CROP_DEF, name: cropName || GENERIC_CROP_DEF.name };
}

// 1-indexed day number — matches the exact formula already established in
// TaskManagementScreen.jsx (Math.floor(diff/86400000) + 1, planting day = 1)
// so this screen's "Day N" never disagrees with an existing manually-created
// task's `day` field for the same date.
function computeDayNumber(plantingDate) {
  const diffMs = new Date() - new Date(plantingDate);
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
}

// Decides stage + phase for today. `duration` is the crop's own persisted
// value (Crop.duration), falling back to the catalog's duration if absent.
function computeDayAndStage({ plantingDate, duration, category }) {
  const dayNumber = computeDayNumber(plantingDate);
  const longDuration = isLongDurationCrop(duration);

  if (!longDuration) {
    const ranges = computeStageRanges(category, duration);
    const match = ranges.find((r) => dayNumber >= r.startDay && dayNumber <= r.endDay);
    return {
      dayNumber,
      stage: match ? match.stage : 'completed',
      phase: 'daily',
    };
  }

  const establishmentDays = getEstablishmentPhaseDays(category);
  if (dayNumber <= establishmentDays) {
    const ranges = computeStageRanges(category, establishmentDays);
    const match = ranges.find((r) => dayNumber >= r.startDay && dayNumber <= r.endDay);
    return {
      dayNumber,
      stage: match ? match.stage : 'vegetative',
      phase: 'daily',
    };
  }

  if (dayNumber > duration) {
    return { dayNumber, stage: 'completed', phase: 'maintenance' };
  }

  const maintenanceThreshold = Math.round(duration * 0.85);
  return {
    dayNumber,
    stage: dayNumber < maintenanceThreshold ? 'fruiting' : 'harvest',
    phase: 'maintenance',
  };
}

// Baseline days-between-waterings by {category, stage} — before any
// water-source/weather adjustment below.
const WATER_INTERVAL_DAYS = {
  cereal: { germination: 2, vegetative: 3, flowering: 2, fruiting: 3, harvest: 5 },
  pulse: { germination: 3, vegetative: 5, flowering: 4, fruiting: 5, harvest: 7 },
  oilseed: { germination: 3, vegetative: 5, flowering: 4, fruiting: 6, harvest: 8 },
  vegetable_fruiting: { germination: 2, vegetative: 3, flowering: 2, fruiting: 2, harvest: 3 },
  vegetable_leafy_root: { germination: 2, vegetative: 3, flowering: 3, fruiting: 3, harvest: 4 },
  spice: { germination: 3, vegetative: 4, flowering: 4, fruiting: 4, harvest: 6 },
  flower: { germination: 2, vegetative: 3, flowering: 2, fruiting: 3, harvest: 4 },
  plantation_perennial: { germination: 3, vegetative: 4, flowering: 4, fruiting: 4, harvest: 5 },
  fruit_tree: { germination: 3, vegetative: 4, flowering: 3, fruiting: 3, harvest: 5 },
};

const RAIN_KEYWORDS = ['rain', 'drizzle', 'thunderstorm', 'shower'];

function isRainy(weather) {
  if (!weather) return false;
  const haystack = `${weather.main || ''} ${weather.description || ''}`.toLowerCase();
  return RAIN_KEYWORDS.some((kw) => haystack.includes(kw));
}

// Paddy is flood-irrigated (standing water through most of its cycle), a
// completely different watering behavior than every other cereal in the
// `cereal` category (maize/millets are never flood-irrigated) — special-
// cased rather than folded into the category table, since it's the single
// most water-behaviorally distinct staple crop TN farmers grow.
const STANDING_WATER_SOURCES = ['canal', 'river', 'tank', 'pond', 'borewell'];

function isPaddy(cropDef) {
  return cropDef.mandiName === 'Paddy';
}

function buildWateringTask({ cropDef, stage, dayNumber, land, weather }) {
  if (stage === 'completed') return null;

  const waterSource = land?.waterSource;
  const rainToday = isRainy(weather);

  if (isPaddy(cropDef) && ['vegetative', 'flowering', 'fruiting'].includes(stage) &&
      STANDING_WATER_SOURCES.includes(waterSource)) {
    if (rainToday) {
      return {
        taskType: 'watering',
        title: 'Check standing water level',
        titleTamil: '',
        description:
          'Rain is expected/occurring today — check the field still has 2-3cm of standing water but avoid adding more; excess can be drained if needed.',
        descriptionTamil: '',
        priority: 'medium',
        weatherConsiderations: 'Rain detected today — watering reduced, standing water level only checked.',
      };
    }
    return {
      taskType: 'watering',
      title: 'Maintain standing water',
      titleTamil: '',
      description: 'Keep 2-3cm of standing water in the field — paddy needs continuous shallow flooding at this stage.',
      descriptionTamil: '',
      priority: 'high',
      weatherConsiderations: weather ? '' : 'Weather data unavailable — using standard schedule for this stage.',
    };
  }

  const intervalDays = WATER_INTERVAL_DAYS[cropDef.category]?.[stage] ?? 4;
  const isWateringDay = (dayNumber - 1) % intervalDays === 0;
  if (!isWateringDay) return null;

  if (rainToday) {
    return {
      taskType: 'watering',
      title: 'Skip watering — rain expected',
      titleTamil: '',
      description: `Rain is expected/occurring today, so today's scheduled watering can be skipped. Resume the regular ${intervalDays}-day schedule afterward.`,
      descriptionTamil: '',
      priority: 'low',
      weatherConsiderations: `Rain detected today — watering skipped, next check in ${intervalDays} days.`,
    };
  }

  let title;
  let description;
  if (waterSource === 'none' || waterSource === 'rainwater') {
    title = 'Check soil moisture';
    description = 'No dedicated irrigation source on this land — check if the topsoil is dry, and irrigate manually (or with stored rainwater) only if needed.';
  } else if (waterSource === 'drip') {
    title = 'Drip irrigation session';
    description = `Run a light drip irrigation session today — this stage typically needs water every ${intervalDays} days on drip.`;
  } else {
    title = 'Watering day';
    description = `Water the field today as part of the regular ${intervalDays}-day schedule for this stage.`;
  }

  return {
    taskType: 'watering',
    title,
    titleTamil: '',
    description,
    descriptionTamil: '',
    priority: stage === 'flowering' || stage === 'fruiting' ? 'high' : 'medium',
    weatherConsiderations: weather ? '' : 'Weather data unavailable — using standard schedule for this stage.',
  };
}

// Fixed touchpoints as fractions of the crop's own duration — basal dose,
// first top-dress, pre-flowering top-dress, fruit/grain-fill potash. Only
// generates a task on those exact days. The actual kg amounts come from
// fertilizerRules.js: real crop-specific N:P:K where we have it, a labeled
// category average otherwise, scaled by the farmer's real land/plot area
// (or plant count for trees) and split per TOUCHPOINT_NUTRIENT_SPLIT.
const TOUCHPOINT_FRACTIONS = [0.05, 0.30, 0.55, 0.75];
const TOUCHPOINT_LABELS = ['Basal fertilizer dose', 'First top-dressing', 'Pre-flowering top-dressing', 'Fruit/grain-fill top-dressing'];

function round(value) {
  return Math.round(value * 10) / 10;
}

function buildFertilizerTask({ cropDef, dayNumber, duration, land, plot, cropQuantity, cropUnit }) {
  const touchpointIndex = TOUCHPOINT_FRACTIONS.findIndex(
    (fraction) => Math.round(fraction * duration) === dayNumber
  );
  if (touchpointIndex === -1) return null;

  const requirement = getFertilizerRequirement(cropDef.name, cropDef.category);

  let multiplier = 1;
  let scaleNote;
  if (requirement.basis === 'plant') {
    if ((cropUnit === 'plants' || cropUnit === 'saplings') && cropQuantity > 0) {
      multiplier = cropQuantity;
      scaleNote = `for your ${cropQuantity} ${cropUnit}`;
    } else {
      scaleNote = 'per plant — set your planted count to scale this automatically';
    }
  } else {
    const acres = acresFromAreaField(plot?.area) ?? acresFromAreaField(land?.size);
    if (acres) {
      multiplier = acres;
      scaleNote = `for your ${round(acres)}-acre ${plot ? 'plot' : 'land'}`;
    } else {
      scaleNote = 'per acre — add your land size to scale this to your actual field';
    }
  }

  const split = TOUCHPOINT_NUTRIENT_SPLIT[touchpointIndex];
  const nKg = requirement.n * split.n * multiplier;
  const pKg = requirement.p * split.p * multiplier;
  const kKg = requirement.k * split.k * multiplier;

  const productLines = [];
  if (pKg > 0) productLines.push(`${round(pKg / PRODUCT_NUTRIENT_CONTENT.dap.percent)}kg DAP`);
  if (nKg > 0) productLines.push(`${round(nKg / PRODUCT_NUTRIENT_CONTENT.urea.percent)}kg Urea`);
  if (kKg > 0) productLines.push(`${round(kKg / PRODUCT_NUTRIENT_CONTENT.mop.percent)}kg MOP`);

  const specificityNote = requirement.isSpecific
    ? ''
    : ` (general estimate for ${cropDef.category.replace(/_/g, ' ')} crops — check TNAU's crop-specific package of practices or your Soil Health Card if available)`;

  const description = productLines.length
    ? `Approximately ${productLines.join(' + ')} ${scaleNote}${specificityNote}. If you use a blended NPK fertilizer instead, match the total nutrient content on the bag label.`
    : `No fertilizer needed at this touchpoint for this crop${specificityNote}.`;

  return {
    taskType: 'fertilizing',
    title: TOUCHPOINT_LABELS[touchpointIndex],
    titleTamil: '',
    description,
    descriptionTamil: '',
    priority: 'medium',
    weatherConsiderations: '',
  };
}

const OBSERVATION_INTERVAL_DAYS = 6;

async function buildPestTask({ cropId, dayNumber, stage }) {
  if (stage === 'completed') return null;

  const activeDisease = await Disease.findOne({ cropId, status: { $ne: 'resolved' } })
    .sort({ detectedDate: -1 })
    .lean();

  if (activeDisease) {
    return {
      taskType: 'pestControl',
      title: `Continue treatment: ${activeDisease.diseaseName}`,
      titleTamil: '',
      description: activeDisease.treatment
        ? activeDisease.treatment
        : `An active case of ${activeDisease.diseaseName} was detected on this crop — follow the recommended treatment until resolved.`,
      descriptionTamil: '',
      priority: 'high',
      weatherConsiderations: '',
    };
  }

  const isObservationDay = (dayNumber - 1) % OBSERVATION_INTERVAL_DAYS === 0;
  if (!isObservationDay) return null;

  return {
    taskType: 'observation',
    title: 'Check for pests or disease',
    titleTamil: '',
    description: 'Walk the field and check leaves/stems for early signs of pests or disease. If anything looks off, use Scan Plant Health to check.',
    descriptionTamil: '',
    priority: 'low',
    weatherConsiderations: '',
  };
}

async function fetchCurrentWeather(lat, lng) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || lat == null || lng == null) return null;

  try {
    const response = await axios.get('http://api.openweathermap.org/data/2.5/weather', {
      params: { lat: parseFloat(lat), lon: parseFloat(lng), appid: apiKey, units: 'metric' },
      timeout: 8000,
    });
    return {
      main: response.data.weather?.[0]?.main || '',
      description: response.data.weather?.[0]?.description || '',
    };
  } catch (err) {
    console.error('⚠️ Weather lookup failed for daily task engine:', err.message);
    return null;
  }
}

// Composes the day's task spec array (1-3 items). Pure except for the
// Disease lookup and the weather HTTP call, both already tolerant of
// failure (never throws, never blocks task generation).
async function buildDailyTasks({ crop, land, plot }) {
  const cropDef = resolveCropDefinition(crop.name);
  const duration = crop.duration || cropDef.duration;
  const { dayNumber, stage, phase } = computeDayAndStage({
    plantingDate: crop.plantingDate,
    duration,
    category: cropDef.category,
  });

  const weather = land?.location?.coordinates
    ? await fetchCurrentWeather(land.location.coordinates.lat, land.location.coordinates.lng)
    : null;

  const watering = buildWateringTask({ cropDef, stage, dayNumber, land, weather });
  const fertilizer =
    phase === 'daily'
      ? buildFertilizerTask({
          cropDef,
          dayNumber,
          duration,
          land,
          plot,
          cropQuantity: crop.quantity,
          cropUnit: crop.unit,
        })
      : null;
  const pest = await buildPestTask({ cropId: crop._id, dayNumber, stage });

  const tasks = [watering, fertilizer, pest].filter(Boolean);

  return {
    dayNumber,
    stage,
    phase,
    weatherUsed: weather ? { source: 'current', rainExpected: isRainy(weather) } : null,
    tasks,
  };
}

module.exports = {
  resolveCropDefinition,
  computeDayNumber,
  computeDayAndStage,
  buildWateringTask,
  buildFertilizerTask,
  buildPestTask,
  buildDailyTasks,
  PERENNIAL_DURATION_THRESHOLD_DAYS,
};

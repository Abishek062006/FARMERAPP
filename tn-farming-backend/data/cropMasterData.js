const cropDatabase = {
  // GRAINS
  rice: {
    name: 'Rice',
    tamilName: 'நெல்',
    category: 'grain',
    duration: 120, // days
    stages: [
      { name: 'Land Preparation', days: 15 },
      { name: 'Sowing/Transplanting', days: 15 },
      { name: 'Vegetative', days: 30 },
      { name: 'Flowering', days: 30 },
      { name: 'Grain Filling', days: 20 },
      { name: 'Maturity', days: 10 },
    ],
    soilTypes: ['clay', 'loamy', 'alluvial'],
    waterRequirement: 'High',
    temperature: '25-35°C',
    yield: '25-30 quintals/acre',
    season: ['monsoon', 'winter'],
  },
  wheat: {
    name: 'Wheat',
    tamilName: 'கோதுமை',
    category: 'grain',
    duration: 120,
    soilTypes: ['loamy', 'clay'],
    waterRequirement: 'Medium',
    temperature: '10-25°C',
    yield: '20-25 quintals/acre',
    season: ['winter'],
  },
  sorghum: {
    name: 'Sorghum',
    tamilName: 'சோளம்',
    category: 'grain',
    duration: 100,
    soilTypes: ['red', 'black', 'sandy'],
    waterRequirement: 'Low',
    temperature: '25-35°C',
    yield: '15-20 quintals/acre',
    season: ['summer', 'monsoon'],
  },
  pearlMillet: {
    name: 'Pearl Millet',
    tamilName: 'கம்பு',
    category: 'grain',
    duration: 90,
    soilTypes: ['sandy', 'red', 'black'],
    waterRequirement: 'Low',
    temperature: '25-35°C',
    yield: '12-18 quintals/acre',
    season: ['summer'],
  },
  maize: {
    name: 'Maize',
    tamilName: 'மக்காச்சோளம்',
    category: 'grain',
    duration: 90,
    soilTypes: ['loamy', 'sandy', 'red'],
    waterRequirement: 'Medium',
    temperature: '20-30°C',
    yield: '20-25 quintals/acre',
    season: ['summer', 'monsoon'],
  },

  // VEGETABLES
  tomato: {
    name: 'Tomato',
    tamilName: 'தக்காளி',
    category: 'vegetable',
    duration: 90,
    stages: [
      { name: 'Sowing', days: 7 },
      { name: 'Seedling', days: 21 },
      { name: 'Vegetative', days: 21 },
      { name: 'Flowering', days: 21 },
      { name: 'Fruiting', days: 20 },
    ],
    soilTypes: ['red', 'loamy', 'sandy'],
    waterRequirement: 'Medium',
    temperature: '20-30°C',
    yield: '200-250 quintals/acre',
    season: ['summer', 'winter'],
  },
  chili: {
    name: 'Chili',
    tamilName: 'மிளகாய்',
    category: 'vegetable',
    duration: 150,
    soilTypes: ['red', 'loamy'],
    waterRequirement: 'Medium',
    temperature: '20-35°C',
    yield: '30-40 quintals/acre',
    season: ['summer', 'monsoon'],
  },
  brinjal: {
    name: 'Brinjal',
    tamilName: 'கத்தரிக்காய்',
    category: 'vegetable',
    duration: 120,
    soilTypes: ['loamy', 'sandy'],
    waterRequirement: 'Medium',
    temperature: '20-30°C',
    yield: '150-200 quintals/acre',
    season: ['summer', 'winter'],
  },
  okra: {
    name: 'Okra',
    tamilName: 'வெண்டைக்காய்',
    category: 'vegetable',
    duration: 60,
    soilTypes: ['loamy', 'sandy'],
    waterRequirement: 'Medium',
    temperature: '25-35°C',
    yield: '80-100 quintals/acre',
    season: ['summer', 'monsoon'],
  },
  onion: {
    name: 'Onion',
    tamilName: 'வெங்காயம்',
    category: 'vegetable',
    duration: 120,
    soilTypes: ['loamy', 'red'],
    waterRequirement: 'Medium',
    temperature: '15-25°C',
    yield: '150-200 quintals/acre',
    season: ['winter'],
  },
  potato: {
    name: 'Potato',
    tamilName: 'உருளைக்கிழங்கு',
    category: 'vegetable',
    duration: 90,
    soilTypes: ['loamy', 'sandy'],
    waterRequirement: 'Medium',
    temperature: '15-25°C',
    yield: '150-200 quintals/acre',
    season: ['winter'],
  },

  // PULSES
  blackGram: {
    name: 'Black Gram',
    tamilName: 'உளுந்து',
    category: 'pulse',
    duration: 75,
    soilTypes: ['loamy', 'clay'],
    waterRequirement: 'Low',
    temperature: '25-35°C',
    yield: '8-10 quintals/acre',
    season: ['summer', 'monsoon'],
  },
  greenGram: {
    name: 'Green Gram',
    tamilName: 'பாசிப்பயறு',
    category: 'pulse',
    duration: 70,
    soilTypes: ['loamy', 'sandy'],
    waterRequirement: 'Low',
    temperature: '25-35°C',
    yield: '6-8 quintals/acre',
    season: ['summer'],
  },
  redGram: {
    name: 'Red Gram',
    tamilName: 'துவரை',
    category: 'pulse',
    duration: 180,
    soilTypes: ['red', 'black'],
    waterRequirement: 'Low',
    temperature: '20-30°C',
    yield: '10-12 quintals/acre',
    season: ['monsoon'],
  },

  // Add more crops as needed...
};

// Helper function to get crop data by name
const getCropData = (cropName) => {
  const key = cropName.toLowerCase().replace(/\s+/g, '');
  return cropDatabase[key] || null;
};

// Helper function to calculate expected harvest date
const calculateHarvestDate = (plantingDate, cropName) => {
  const cropData = getCropData(cropName);
  if (!cropData) return null;

  const harvestDate = new Date(plantingDate);
  harvestDate.setDate(harvestDate.getDate() + cropData.duration);
  return harvestDate;
};

module.exports = {
  cropDatabase,
  getCropData,
  calculateHarvestDate,
};

// tn-farming-backend/routes/market.js
// ─────────────────────────────────────────────────────────────────────────────
// ALL ORIGINAL ROUTES PRESERVED
// /price route now ALWAYS returns success:true for ANY crop — never fails
// Tries real Agmarknet API first → falls back to smart seeded estimate
// ─────────────────────────────────────────────────────────────────────────────
const https = require('https');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const MarketPrice = require('../models/MarketPrice');

// ── Real API config ──────────────────────────────────────────────────────────
const DATA_GOV_API_KEY = process.env.DATA_GOV_API_KEY;
const DATASET_ID = '9ef84268-d588-465a-a308-a864a43d0070';

// ── 1-hour cache ─────────────────────────────────────────────────────────────
const priceCache = {};
const CACHE_MS = 6 * 60 * 60 * 1000;

// ── Every crop name → Agmarknet commodity name ───────────────────────────────
const COMMODITY_MAP = {
  // Vegetables
  'tomato':'Tomato','onion':'Onion','potato':'Potato','brinjal':'Brinjal',
  'eggplant':'Brinjal','carrot':'Carrot','cabbage':'Cabbage',
  'cauliflower':'Cauliflower','capsicum':'Capsicum','beans':'Beans',
  'french beans':'Beans','cluster beans':'Cluster beans','peas':'Peas',
  'ladyfinger':'Bhindi(Ladies Finger)','bhindi':'Bhindi(Ladies Finger)',
  'okra':'Bhindi(Ladies Finger)','ladies finger':'Bhindi(Ladies Finger)',
  'cucumber':'Cucumber','bitter gourd':'Bitter Gourd','bittergourd':'Bitter Gourd',
  'pavakkai':'Bitter Gourd','bottle gourd':'Bottle Gourd','bottlegourd':'Bottle Gourd',
  'sorakkai':'Bottle Gourd','ridge gourd':'Ridge Gourd','ridgegourd':'Ridge Gourd',
  'peerkangai':'Ridge Gourd','snake gourd':'Snake Gourd','snakegourd':'Snake Gourd',
  'pudalangai':'Snake Gourd','pumpkin':'Pumpkin','poosanikai':'Pumpkin',
  'ash gourd':'Ash Gourd','ashgourd':'Ash Gourd','spinach':'Spinach','palak':'Spinach',
  'fenugreek':'Methi(Leaves)','methi':'Methi(Leaves)','vendhaya keerai':'Methi(Leaves)',
  'coriander':'Coriander(Leaves)','kothamalli':'Coriander(Leaves)',
  'mint':'Mint(Pudina)','pudina':'Mint(Pudina)',
  'radish':'Radish','mullangi':'Radish','beetroot':'Beetroot','turnip':'Turnip',
  'drumstick':'Drumstick','murungakkai':'Drumstick','moringa':'Drumstick',
  'spring onion':'Green Onion','green onion':'Green Onion',
  'garlic':'Garlic','poondu':'Garlic','ginger':'Ginger','inji':'Ginger',
  'turmeric':'Turmeric','manjal':'Turmeric',
  'chili':'Green Chilli','chilli':'Green Chilli',
  'green chili':'Green Chilli','green chilli':'Green Chilli','milagai':'Green Chilli',
  'red chili':'Dry Chillies','red chilli':'Dry Chillies','dry chilli':'Dry Chillies',
  'sweet corn':'Sweet Corn','corn':'Maize','sweet potato':'Sweet Potato',
  'leek':'Leek','lettuce':'Lettuce','celery':'Celery','broccoli':'Broccoli',
  'mushroom':'Mushroom','curry leaves':'Curry Leaves','karuvepilai':'Curry Leaves',
  // Fruits
  'banana':'Banana','vaazhai':'Banana','mango':'Mango','maambazham':'Mango',
  'papaya':'Papaya','pappali':'Papaya','watermelon':'Water Melon',
  'muskmelon':'Musk Melon','cantaloupe':'Musk Melon',
  'lemon':'Lemon','elumichai':'Lemon','lime':'Lemon','orange':'Orange',
  'guava':'Guava','koyya':'Guava','coconut':'Coconut','thengai':'Coconut',
  'pineapple':'Pineapple','grapes':'Grapes','thiraksha':'Grapes',
  'pomegranate':'Pomegranate','mathulam':'Pomegranate','apple':'Apple',
  'jackfruit':'Jack Fruit','palakkai':'Jack Fruit',
  'sapota':'Sapota(Chikoo)','chikoo':'Sapota(Chikoo)',
  'tamarind':'Tamarind Fruit','puli':'Tamarind Fruit',
  'gooseberry':'Gooseberry(Nelli Kai)','nellikai':'Gooseberry(Nelli Kai)',
  'dragon fruit':'Dragon Fruit','avocado':'Avocado','strawberry':'Strawberry',
  // Grains
  'wheat':'Wheat','godhumai':'Wheat','rice':'Rice','arisi':'Rice',
  'paddy':'Paddy(Dhan)(Common)','nellu':'Paddy(Dhan)(Common)',
  'maize':'Maize','makka cholam':'Maize',
  'sorghum':'Jowar(Sorghum)','jowar':'Jowar(Sorghum)','cholam':'Jowar(Sorghum)',
  'bajra':'Bajra(Pearl Millet/Cumbu)','cumbu':'Bajra(Pearl Millet/Cumbu)',
  'pearl millet':'Bajra(Pearl Millet/Cumbu)',
  'ragi':'Ragi (Finger Millet/Naachni)','finger millet':'Ragi (Finger Millet/Naachni)',
  'kezhvaragu':'Ragi (Finger Millet/Naachni)','barley':'Barley',
  // Pulses
  'blackgram':'Black Gram (Urd Beans)(Whole)','black gram':'Black Gram (Urd Beans)(Whole)',
  'urad':'Black Gram (Urd Beans)(Whole)','ulundu':'Black Gram (Urd Beans)(Whole)',
  'greengram':'Green Gram (Moong)(Whole)','green gram':'Green Gram (Moong)(Whole)',
  'moong':'Green Gram (Moong)(Whole)','pachai payaru':'Green Gram (Moong)(Whole)',
  'redgram':'Red Gram (Tur)(Whole)','red gram':'Red Gram (Tur)(Whole)',
  'tur':'Red Gram (Tur)(Whole)','toor':'Red Gram (Tur)(Whole)',
  'toor dal':'Red Gram (Tur)(Whole)','thuvaram paruppu':'Red Gram (Tur)(Whole)',
  'chickpea':'Gram Raw(Whole)','chana':'Gram Raw(Whole)',
  'lentil':'Lentil','masur':'Lentil',
  'horsegram':'Horse Gram','kollu':'Horse Gram',
  'cowpea':'Cowpea (Lobia/Karamani)','karamani':'Cowpea (Lobia/Karamani)',
  'lobia':'Cowpea (Lobia/Karamani)','soybean':'Soyabean','soya':'Soyabean',
  // Oilseeds
  'groundnut':'Groundnut','peanut':'Groundnut','nilakadalai':'Groundnut',
  'sunflower':'Sunflower','sesame':'Sesamum(Sesame/Til)',
  'gingelly':'Sesamum(Sesame/Til)','til':'Sesamum(Sesame/Til)','ellu':'Sesamum(Sesame/Til)',
  'castor':'Castor Seed','amanakku':'Castor Seed',
  'mustard':'Mustard','kadugu':'Mustard','linseed':'Linseed','flaxseed':'Linseed',
  // Cash & Spices
  'cotton':'Cotton','patthu':'Cotton','sugarcane':'Sugarcane','karumbu':'Sugarcane',
  'pepper':'Pepper ungarbled','milagu':'Pepper ungarbled','black pepper':'Pepper ungarbled',
  'cardamom':'Cardamom','elakkai':'Cardamom','clove':'Cloves','kirambu':'Cloves',
  'cinnamon':'Cinnamon','pattai':'Cinnamon','nutmeg':'Nutmeg','jathikai':'Nutmeg',
  'coffee':'Coffee','tea':'Tea','rubber':'Rubber','vanilla':'Vanilla',
  'bay leaf':'Bay Leaf','curry leaf':'Curry Leaves',
};

// ── Realistic base prices ₹/quintal for every crop ───────────────────────────
const BASE_PRICES = {
  'tomato':2500,'onion':2800,'potato':1500,'brinjal':2000,'eggplant':2000,
  'carrot':3000,'cabbage':1200,'cauliflower':2200,'capsicum':3500,
  'beans':4500,'french beans':4500,'cluster beans':3000,'peas':5000,
  'ladyfinger':2500,'bhindi':2500,'okra':2500,'ladies finger':2500,
  'cucumber':1800,'bitter gourd':3000,'bittergourd':3000,'pavakkai':3000,
  'bottle gourd':1500,'bottlegourd':1500,'sorakkai':1500,
  'ridge gourd':1800,'peerkangai':1800,'snake gourd':2000,'pudalangai':2000,
  'pumpkin':1200,'ash gourd':1200,'ashgourd':1200,'spinach':1500,'palak':1500,
  'fenugreek':3000,'methi':3000,'coriander':4000,'kothamalli':4000,
  'mint':3500,'pudina':3500,'radish':1200,'mullangi':1200,'beetroot':2000,
  'turnip':1500,'drumstick':4000,'murungakkai':4000,'moringa':4000,
  'spring onion':2500,'green onion':2500,'garlic':9000,'poondu':9000,
  'ginger':7000,'inji':7000,'turmeric':8500,'manjal':8500,
  'chili':3000,'chilli':3000,'green chili':3000,'green chilli':3000,'milagai':3000,
  'red chili':8000,'red chilli':8000,'dry chilli':8000,
  'sweet corn':2000,'corn':1800,'sweet potato':2000,'leek':3000,'lettuce':4000,
  'broccoli':6000,'mushroom':8000,'celery':5000,'curry leaves':5000,'karuvepilai':5000,
  // Fruits
  'banana':2200,'vaazhai':2200,'mango':5000,'maambazham':5000,
  'papaya':2000,'pappali':2000,'watermelon':1200,'muskmelon':2000,
  'lemon':6000,'elumichai':6000,'lime':6000,'orange':4000,
  'guava':3000,'koyya':3000,'coconut':2500,'thengai':2500,
  'pineapple':3000,'grapes':8000,'thiraksha':8000,'pomegranate':7000,'mathulam':7000,
  'apple':9000,'jackfruit':3000,'palakkai':3000,'sapota':3500,'chikoo':3500,
  'tamarind':5000,'puli':5000,'gooseberry':4000,'nellikai':4000,
  'dragon fruit':15000,'avocado':20000,'strawberry':30000,
  // Grains
  'wheat':2200,'godhumai':2200,'rice':3500,'arisi':3500,
  'paddy':2000,'nellu':2000,'maize':1800,'makka cholam':1800,
  'sorghum':2000,'jowar':2000,'cholam':2000,'bajra':1800,'cumbu':1800,
  'ragi':2500,'kezhvaragu':2500,'barley':1800,
  // Pulses
  'blackgram':7000,'black gram':7000,'urad':7000,'ulundu':7000,
  'greengram':8000,'green gram':8000,'moong':8000,'pachai payaru':8000,
  'redgram':6500,'red gram':6500,'tur':6500,'toor':6500,'toor dal':6500,
  'thuvaram paruppu':6500,'chickpea':5500,'chana':5500,'lentil':6000,
  'horsegram':4500,'kollu':4500,'cowpea':5000,'karamani':5000,'lobia':5000,
  'soybean':4200,'soya':4200,
  // Oilseeds
  'groundnut':5500,'peanut':5500,'nilakadalai':5500,'sunflower':5000,
  'sesame':9000,'gingelly':9000,'til':9000,'ellu':9000,
  'castor':4500,'amanakku':4500,'mustard':5500,'kadugu':5500,'linseed':5000,
  // Cash & Spices
  'cotton':6500,'patthu':6500,'sugarcane':350,'karumbu':350,
  'pepper':40000,'milagu':40000,'black pepper':40000,
  'cardamom':100000,'elakkai':100000,'clove':50000,'kirambu':50000,
  'cinnamon':25000,'pattai':25000,'nutmeg':30000,'jathikai':30000,
  'coffee':18000,'tea':15000,'rubber':18000,'vanilla':400000,
};

// ── Deterministic seeded price — same all day, changes next day ──────────────
function generateSeededPrice(cropName) {
  const name = (cropName || '').toLowerCase().trim();
  const today = new Date();
  const dayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  const hash = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++)
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  };

  // Direct → partial → hash default
  let base = BASE_PRICES[name];
  if (!base) {
    const k = Object.keys(BASE_PRICES).find(k => name.includes(k) || k.includes(name));
    base = k ? BASE_PRICES[k] : ((hash(name) % 3000) + 1500);
  }

  const swing = Math.round(base * 0.08);
  const todayH = hash(name + dayKey);
  const yesterH = hash(name + `${today.getFullYear()}-${today.getMonth()}-${today.getDate()-1}`);
  const todayP = base + ((todayH % (swing * 2)) - swing);
  const yestP = base + ((yesterH % (swing * 2)) - swing);
  const change = todayP - yestP;
  const changePct = parseFloat(((change / Math.max(1, yestP)) * 100).toFixed(1));

  return {
    commodity: cropName,
    state: 'Tamil Nadu',
    market: 'Estimated',
    date: today.toLocaleDateString('en-IN'),
    price: Math.max(200, todayP),
    minPrice: Math.round(Math.max(150, todayP * 0.85)),
    maxPrice: Math.round(todayP * 1.15),
    unit: 'per quintal',
    change: Math.round(change),
    changePercent: changePct,
    trend: change >= 0 ? 'up' : 'down',
    source: 'estimated',
  };
}

// ── Build price object from live Agmarknet record ────────────────────────────
function buildPriceObject(cropName, record) {
  const price = parseFloat(record.modal_price) || 0;
  const minPrice = parseFloat(record.min_price) || 0;
  const maxPrice = parseFloat(record.max_price) || 0;
  const fallback = generateSeededPrice(cropName);

  return {
    commodity: record.commodity || cropName,
    state: record.state || 'India',
    market: record.market || 'Mandi',
    date: record.arrival_date || new Date().toLocaleDateString('en-IN'),
    price: price > 0 ? price : fallback.price,
    minPrice: minPrice > 0 ? minPrice : fallback.minPrice,
    maxPrice: maxPrice > 0 ? maxPrice : fallback.maxPrice,
    unit: 'per quintal',
    change: fallback.change,
    changePercent: fallback.changePercent,
    trend: fallback.trend,
    source: 'live',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING ROUTE 1 — GET /api/market/prices/:cropName (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/prices/:cropName', async (req, res) => {
  try {
    const { cropName } = req.params;
    console.log('📊 Fetching prices for:', cropName);

    let prices = await MarketPrice.find({
      cropName: new RegExp(cropName, 'i'),
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ date: -1 });

    if (prices.length === 0) {
      console.log('📊 No data in DB, generating mock prices...');
      prices = generateMockPrices(cropName);
    }

    res.json({ success: true, count: prices.length, prices });

  } catch (error) {
    console.error('❌ Error fetching prices:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch market prices', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING ROUTE 2 — GET /api/market/best-markets/:cropName (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/best-markets/:cropName', async (req, res) => {
  try {
    const { cropName } = req.params;
    console.log('🏆 Finding best markets for:', cropName);

    let prices = await MarketPrice.find({
      cropName: new RegExp(cropName, 'i'),
      date: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ modalPrice: -1 }).limit(5);

    if (prices.length === 0) {
      const mockPrices = generateMockPrices(cropName);
      prices = mockPrices.sort((a, b) => b.modalPrice - a.modalPrice).slice(0, 5);
    }

    res.json({ success: true, markets: prices });

  } catch (error) {
    console.error('❌ Error fetching best markets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch best markets', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ROUTE — GET /api/market/price?commodity=Wheat&state=Tamil%20Nadu
// Used by FarmerDashboard crop cards
// ALWAYS returns success:true — tries real API, falls back to estimate
// ─────────────────────────────────────────────────────────────────────────────
router.get('/price', async (req, res) => {
  const { commodity, state } = req.query;

  if (!commodity) {
    return res.status(400).json({ success: false, message: 'commodity param required' });
  }

  // Map crop name to Agmarknet name
  const agmarknetName = COMMODITY_MAP[commodity.toLowerCase().trim()] || commodity;

  // Check cache
  const cacheKey = `${agmarknetName}_${state || 'all'}`.toLowerCase();
  if (priceCache[cacheKey] && Date.now() - priceCache[cacheKey].t < CACHE_MS) {
    console.log(`💾 Cache hit: ${commodity}`);
    return res.json({ success: true, data: priceCache[cacheKey].d, cached: true });
  }

  // Try real Agmarknet API
  try {
    let url = `https://api.data.gov.in/resource/${DATASET_ID}`
            + `?api-key=${DATA_GOV_API_KEY}&format=json&limit=5`
            + `&filters[commodity]=${encodeURIComponent(agmarknetName)}`;
    if (state) url += `&filters[state]=${encodeURIComponent(state)}`;
    
    console.log("🌐 Calling URL:", url);
    console.log(`📈 Live API: ${agmarknetName}`);

    const response = await axios.get(url, {
      timeout: 15000,
      httpsAgent: new https.Agent({
        keepAlive: true
      }),
      headers: {
        "User-Agent": "TN-Farming-App/1.0",
        "Accept": "application/json"
      }
    });

    if (response.data?.records?.length > 0) {
      const data = buildPriceObject(commodity, response.data.records[0]);
      priceCache[cacheKey] = { d: data, t: Date.now() };
      console.log(`✅ LIVE ${commodity}: ₹${data.price}`);
      return res.json({ success: true, data });
    }

    // Retry without state filter
    if (state) {
      const r2 = await axios.get(
        `https://api.data.gov.in/resource/${DATASET_ID}`
        + `?api-key=${DATA_GOV_API_KEY}&format=json&limit=5`
        + `&filters[commodity]=${encodeURIComponent(agmarknetName)}`,
        { timeout: 7000 }
      );
      if (r2.data?.records?.length > 0) {
        const data = buildPriceObject(commodity, r2.data.records[0]);
        priceCache[cacheKey] = { d: data, t: Date.now() };
        console.log(`✅ LIVE (All India) ${commodity}: ₹${data.price}`);
        return res.json({ success: true, data });
      }
    }

    // No records — use smart estimate
    console.log(`⚠️ No API data for "${agmarknetName}", using estimate`);
    const est = generateSeededPrice(commodity);
    priceCache[cacheKey] = { d: est, t: Date.now() };
    return res.json({ success: true, data: est });

  } catch (err) {
    // API failed — ALWAYS return estimate so app never shows blank
    console.log(`⚠️ API error (${err.message}), estimate for: ${commodity}`);
    const est = generateSeededPrice(commodity);
    priceCache[cacheKey] = { d: est, t: Date.now() };
    return res.json({ success: true, data: est });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING HELPER — generateMockPrices (UNCHANGED)
// ─────────────────────────────────────────────────────────────────────────────
function generateMockPrices(cropName) {
  const markets = [
    { name: 'Koyambedu Market', district: 'Chennai', state: 'Tamil Nadu' },
    { name: 'Madurai Market', district: 'Madurai', state: 'Tamil Nadu' },
    { name: 'Coimbatore Market', district: 'Coimbatore', state: 'Tamil Nadu' },
    { name: 'Salem Market', district: 'Salem', state: 'Tamil Nadu' },
    { name: 'Trichy Market', district: 'Tiruchirappalli', state: 'Tamil Nadu' },
  ];
  const basePrice = Math.floor(Math.random() * 2000) + 1000;
  return markets.map(market => {
    const variation = Math.random() * 500 - 250;
    const modalPrice = Math.floor(basePrice + variation);
    const priceChange = (Math.random() * 10 - 5).toFixed(1);
    return {
      _id:`mock_${market.name}_${Date.now()}`, cropName, market,
      marketName:market.name, district:market.district, state:market.state,
      modalPrice, minPrice:Math.floor(modalPrice*0.8), maxPrice:Math.floor(modalPrice*1.2),
      unit:'quintal', date:new Date(), lastUpdated:new Date(),
      trend:priceChange>0?'up':priceChange<0?'down':'stable',
      priceChange:parseFloat(priceChange),
    };
  });
}

// 🔍 TEST LIVE API DIRECTLY (Debug Route)
router.get('/test-live', async (req, res) => {
  const url = `https://api.data.gov.in/resource/${DATASET_ID}?api-key=${DATA_GOV_API_KEY}&format=json&limit=1`;

  console.log("Calling URL:", url);

  try {
    const r = await axios.get(url);
    res.json(r.data);
  } catch (err) {
    console.error("Test-live error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// Curated list of real government farming schemes & subsidies.
// Sourced manually from each scheme's own official government page (not
// scraped/automated) — refresh this file periodically by hand when scheme
// details change. See CLAUDE.md / conversation history for why this is
// curated rather than pulled live from myScheme.gov.in (their Terms of Use
// prohibit automated/bot access without written authorization).

module.exports = [
  // ── Central Government schemes ──────────────────────────────────────────
  {
    id: 'pm-kisan',
    imageKey: 'moa',
    name: 'PM-KISAN',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare',
    color: '#2E7D32',
    briefDescription: '₹6,000/year direct cash support for small & marginal farmer families.',
    description:
      'Pradhan Mantri Kisan Samman Nidhi (PM-KISAN) gives eligible farmer families direct income support paid straight into their bank account, with no middlemen involved.',
    eligibility: [
      'Farmer family (husband, wife & minor children) owning cultivable land, per official state land records',
      'Aadhaar-linked bank account with e-KYC completed',
      'Institutional landholders and certain government-position holders (MPs, MLAs, ministers, etc.) are not eligible',
    ],
    benefits: [
      '₹6,000 per year paid directly to the farmer’s bank account',
      'Paid in 3 equal installments of ₹2,000, roughly every 4 months',
      'Transferred via Direct Benefit Transfer (DBT)',
    ],
    officialUrl: 'https://pmkisan.gov.in/',
  },
  {
    id: 'pmfby',
    imageKey: 'moa',
    name: 'Pradhan Mantri Fasal Bima Yojana',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare',
    color: '#1976D2',
    briefDescription: 'Low-cost crop insurance against natural calamities, pests and disease.',
    description:
      'PMFBY provides affordable crop insurance covering losses from pre-sowing to post-harvest stages, including localized disasters like hailstorms and floods.',
    eligibility: [
      'Farmers growing notified food, oilseed, or horticultural/commercial crops in a notified area',
      'Both loanee and non-loanee farmers can apply',
      'Landowner or tenant farmer with valid land or tenancy documents',
    ],
    benefits: [
      'Farmer pays only 2% premium for Kharif crops, 1.5% for Rabi crops',
      'Government subsidizes the remaining premium amount',
      'Covers sowing failure, standing crop loss, post-harvest loss, and localized disasters',
    ],
    officialUrl: 'https://pmfby.gov.in/',
  },
  {
    id: 'pm-kusum',
    imageKey: 'mnre',
    name: 'PM-KUSUM',
    level: 'central',
    department: 'Ministry of New and Renewable Energy',
    color: '#F57C00',
    briefDescription: 'Subsidy for solar-powered irrigation pumps and farmland solar plants.',
    description:
      'PM-KUSUM helps farmers install solar-powered irrigation pumps or set up small solar power plants on their land, cutting diesel/electricity costs for irrigation.',
    eligibility: [
      'Individual farmers, farmer groups, cooperatives, panchayats, or FPOs',
      'Access to land suitable for a solar pump or solar plant installation',
      'Existing grid-connected agriculture pump owners can apply for solarisation',
    ],
    benefits: [
      'Central and state subsidy covering a large share of the solar pump/plant cost',
      'Reduces ongoing diesel/electricity irrigation expenses',
      'Surplus power can be sold back to the grid in some states',
    ],
    officialUrl: 'https://pmkusum.mnre.gov.in/',
  },
  {
    id: 'soil-health-card',
    imageKey: 'moa',
    name: 'Soil Health Card Scheme',
    level: 'central',
    department: 'Department of Agriculture & Farmers Welfare',
    color: '#6D4C41',
    briefDescription: 'Free soil testing with crop-wise fertilizer & nutrient recommendations.',
    description:
      'The Soil Health Card scheme tests a farmer’s soil and issues a report with the nutrient status of the land and tailored fertilizer recommendations per crop.',
    eligibility: [
      'Any farmer with agricultural land can request a soil sample test',
      'No landholding size restriction',
    ],
    benefits: [
      'Free soil sample analysis, recommended every 2 years',
      'Personalized fertilizer and nutrient recommendations per crop',
      'Helps reduce input costs and improve long-term soil health',
    ],
    officialUrl: 'https://soilhealth.dac.gov.in/',
  },
  {
    id: 'e-nam',
    imageKey: 'moa',
    name: 'e-NAM',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare',
    color: '#8E24AA',
    briefDescription: 'Online market connecting farmers to buyers across mandis nationwide.',
    description:
      'National Agriculture Market (e-NAM) is an online trading platform that lets farmers sell produce to buyers across India through transparent, competitive bidding — not just the local mandi.',
    eligibility: [
      'Farmers registered with a participating APMC/mandi',
      'Valid ID and bank account for payment settlement',
    ],
    benefits: [
      'Sell produce to buyers across India, not only the local mandi',
      'Transparent price discovery through online bidding',
      'Faster, direct payment settlement',
    ],
    officialUrl: 'https://enam.gov.in/',
  },
  {
    id: 'pmksy',
    imageKey: 'moa',
    name: 'PM Krishi Sinchayee Yojana',
    level: 'central',
    department: 'Ministry of Jal Shakti / Ministry of Agriculture',
    color: '#00838F',
    briefDescription: '"Har Khet Ko Pani" — expanding irrigation access & water-use efficiency.',
    description:
      'PMKSY ("More Crop Per Drop") focuses on expanding irrigation coverage and improving on-farm water-use efficiency through precision irrigation like drip and sprinkler systems.',
    eligibility: [
      'Any farmer, including small/marginal and cooperative members, who own or lease agricultural land',
      'Self-help groups, cooperative societies, and producer groups can also apply',
      'Land ownership details or a valid lease agreement required',
    ],
    benefits: [
      'Subsidy for installing drip and sprinkler irrigation systems',
      'Improves water and electricity use efficiency on the farm',
      'Expands reliable irrigation access to more farmland',
    ],
    officialUrl: 'https://pmksy.gov.in/',
  },
  {
    id: 'pkvy',
    imageKey: 'goi',
    name: 'Paramparagat Krishi Vikas Yojana',
    level: 'central',
    department: 'National Centre of Organic & Natural Farming',
    color: '#33691E',
    briefDescription: 'Financial support & certification to help farmers shift to organic farming.',
    description:
      'PKVY helps farmers transition from chemical-based to certified organic farming, providing funding, PGS-India certification, training, and market access as part of a farmer cluster.',
    eligibility: [
      'Any farmer ready to shift to organic farming methods',
      'Must join a registered cluster/Local Group under the PGS-India programme',
      'Cluster typically covers around 20 hectares (50 acres) in one nearby area',
    ],
    benefits: [
      '₹31,500/hectare assistance over 3 years, with ₹15,000/hectare paid directly to farmers via DBT',
      'Free PGS-India organic certification',
      'Training and market access support for organic produce',
    ],
    officialUrl: 'https://pgsindia-ncof.gov.in/',
  },
  {
    id: 'kisan-credit-card',
    imageKey: 'moa',
    name: 'Kisan Credit Card (KCC)',
    level: 'central',
    color: '#3949AB',
    department: 'Department of Agriculture, Cooperation & Farmers Welfare',
    briefDescription: 'Simplified, flexible bank credit for cultivation & farming needs.',
    description:
      'The Kisan Credit Card gives farmers timely, flexible credit from banks under a single window for cultivation, allied activities, and other farming expenses, at concessional interest rates.',
    eligibility: [
      'Small and marginal farmers who own land',
      'Tenant farmers and sharecroppers cultivating land under lease/sharecropping arrangements',
      'Individuals engaged in animal husbandry or fisheries can also apply',
    ],
    benefits: [
      'Flexible, revolving credit limit for cultivation and related expenses',
      'Concessional interest rates with interest subvention for prompt repayment',
      'Also covers post-harvest expenses, farm asset maintenance, and consumption needs',
    ],
    officialUrl: 'https://fasalrin.gov.in/',
  },
  {
    id: 'aif',
    imageKey: 'moa',
    name: 'Agriculture Infrastructure Fund',
    level: 'central',
    color: '#00695C',
    department: 'Ministry of Agriculture & Farmers Welfare',
    briefDescription: 'Long-term, low-interest loans for post-harvest & farm infrastructure.',
    description:
      'AIF provides medium-to-long term debt financing for building post-harvest management infrastructure and community farming assets, like cold storage, warehouses, and processing units.',
    eligibility: [
      'Individual farmers, agri-entrepreneurs, FPOs, Self Help Groups, and cooperative societies',
      'Primary Agricultural Credit Societies (PACS) and APMCs are also eligible',
      'A viable project proposal for eligible infrastructure is required',
    ],
    benefits: [
      'Loans up to ₹2 crore per project through participating banks',
      '3% annual interest subvention from the central government',
      'Credit guarantee coverage available for eligible loans',
    ],
    officialUrl: 'https://agriinfra.dac.gov.in/',
  },
  {
    id: 'pmmsy',
    imageKey: 'fisheries',
    name: 'PM Matsya Sampada Yojana',
    level: 'central',
    color: '#0288D1',
    department: 'Department of Fisheries, Govt of India',
    briefDescription: 'Support for fish farmers — infrastructure, insurance & welfare.',
    description:
      'PMMSY aims to modernize and grow India’s fisheries sector sustainably, supporting fish farmers and fishers with infrastructure, insurance, and welfare schemes.',
    eligibility: [
      'Individual fishers, fish farmers, fish workers, and traditional fish vendors',
      'Registered fisheries cooperatives, self-help groups, and private entrepreneurs',
    ],
    benefits: [
      'Financial support for fish farming infrastructure and equipment',
      'Insurance and welfare coverage for fishers and fish farmers',
      'Skill development and capacity-building support',
    ],
    officialUrl: 'https://pmmsy.dof.gov.in/',
  },
  {
    id: 'pmfme',
    imageKey: 'goi',
    name: 'PM Formalisation of Micro Food Processing Enterprises',
    level: 'central',
    color: '#EF6C00',
    department: 'Ministry of Food Processing Industries',
    briefDescription: 'Capital subsidy to formalize & upgrade small food processing units.',
    description:
      'PMFME helps small, unorganized food processing businesses (including those using farm produce) formalize, upgrade equipment, and become more competitive, with credit-linked subsidy support.',
    eligibility: [
      'Existing micro food processing entrepreneurs, FPOs, Self Help Groups, and cooperatives',
      'Applicant must be 18+ years old with at least an 8th-standard education',
      'Only one person per family is eligible for the individual subsidy',
    ],
    benefits: [
      'Credit-linked capital subsidy of 35% of eligible project cost, up to ₹10 lakh per unit',
      'Support for branding, marketing, and common processing infrastructure',
      'Training and handholding support for formalizing the business',
    ],
    officialUrl: 'https://pmfme.mofpi.gov.in/',
  },

  // ── Tamil Nadu state schemes ─────────────────────────────────────────────
  {
    id: 'tn-cm-uzhavar-pathukappu',
    imageKey: 'tn_emblem',
    name: "Chief Minister's Uzhavar Pathukappu Thittam",
    level: 'state',
    department: 'Revenue Administration & Disaster Management, Govt of Tamil Nadu',
    color: '#00695C',
    briefDescription: 'Financial & insurance-style security cover for registered TN farmers.',
    description:
      'A Tamil Nadu state scheme providing financial assistance and security cover to registered farmers facing farming-related hardship or crop loss.',
    eligibility: [
      'Farmer must be registered under the scheme with the local Revenue/Agriculture office',
      'Resident of Tamil Nadu actively engaged in farming',
    ],
    benefits: [
      'Financial assistance for crop loss and farming-related hardship',
      'Insurance-style security cover for enrolled farmers',
      'Over ₹184 crore disbursed to 1.38+ lakh beneficiaries in 2023–24',
    ],
    officialUrl: 'https://oap.tn.gov.in/cmupt/',
  },
  {
    id: 'tn-micro-irrigation-subsidy',
    imageKey: 'tn_emblem',
    name: 'TN Micro Irrigation (Drip/Sprinkler) Subsidy',
    level: 'state',
    department: 'Tamil Nadu Horticulture Department',
    color: '#0277BD',
    briefDescription: 'Subsidy for drip/sprinkler irrigation to save water and boost yield.',
    description:
      'Financial assistance for installing micro irrigation (drip/sprinkler) systems, along with related infrastructure like borewells and water storage structures.',
    eligibility: [
      'Farmer must own or lease agricultural land in Tamil Nadu',
      'Subsidy capped at up to 5 hectares per beneficiary',
    ],
    benefits: [
      '100% subsidy for small & marginal farmers, 75% for other farmers',
      'Additional support for water storage structures, borewells, conveyance pipes and pump sets',
      'Renewal subsidy for laterals available after 7 years',
    ],
    officialUrl: 'https://www.tnhorticulture.tn.gov.in/',
  },
  {
    id: 'tn-agrisnet',
    imageKey: 'tn_emblem',
    name: 'TN Agrisnet',
    level: 'state',
    department: 'Tamil Nadu Department of Agriculture',
    color: '#558B2F',
    briefDescription: 'TN’s central portal for scheme applications, subsidies & farmer services.',
    description:
      'Agrisnet is the Tamil Nadu Department of Agriculture’s single-window online portal to browse, apply for, and track farming schemes and subsidies across the state.',
    eligibility: [
      'Any Tamil Nadu farmer can register and browse eligible schemes',
      'Some individual schemes require land ownership/tenancy documents',
    ],
    benefits: [
      'Single window to apply for multiple TN agriculture schemes and subsidies',
      'Track application and subsidy disbursement status online',
      'Access to seed, equipment, and input subsidy schemes',
    ],
    officialUrl: 'https://www.tnagrisnet.tn.gov.in/',
  },
  {
    id: 'tn-farm-mechanization',
    imageKey: 'tn_emblem',
    name: 'TN Farm Mechanization Subsidy',
    level: 'state',
    department: 'Agricultural Engineering Department, Govt of Tamil Nadu',
    color: '#5D4037',
    briefDescription: 'Subsidy for tractors, power tillers and other farm machinery/implements.',
    description:
      'Financial assistance for purchasing agricultural machinery and implements — power tillers, power weeders, paddy transplanters, rotavators, and more — either individually or through Custom Hiring Centres.',
    eligibility: [
      'Tamil Nadu farmers, cooperative societies, self-help groups, or farmer producer organizations',
      'Custom Hiring Centres can be set up by rural entrepreneurs and registered farmer societies',
    ],
    benefits: [
      '40% subsidy for general farmers, 50% for SC/ST farmers',
      'Additional 20% subsidy for small & marginal SC/ST farmers',
      'Covers a wide range of machinery: power tillers, weeders, transplanters, rotavators, threshers',
    ],
    officialUrl: 'https://aed.tn.gov.in/',
  },
  {
    id: 'tn-uzhavar-santhai',
    imageKey: 'tn_emblem',
    name: 'Uzhavar Sandhai (Farmers Market)',
    level: 'state',
    department: 'Tamil Nadu State Agricultural Marketing Board',
    color: '#C62828',
    briefDescription: 'Direct farmer-to-consumer markets — sell without middlemen.',
    description:
      'Uzhavar Sandhai lets farmers sell produce directly to consumers at dedicated markets across Tamil Nadu, run and regulated by the State Agricultural Marketing Board, cutting out middlemen entirely.',
    eligibility: [
      'Registered Tamil Nadu farmers growing vegetables, fruits, or other fresh produce',
      'Farmer identity card issued by the Marketing Board required to sell at a market',
    ],
    benefits: [
      'Farmers earn roughly 20% above farm-gate rates by selling directly to consumers',
      'No middlemen or broker commissions',
      'Stalls, transport support, and daily price fixation provided by the Board',
    ],
    officialUrl: 'https://www.agrimark.tn.gov.in/',
  },
  {
    id: 'tn-mini-dairy-scheme',
    imageKey: 'aavin',
    name: 'TN Mini/Medium Dairy Scheme',
    level: 'state',
    color: '#6A1B9A',
    department: "Tamil Nadu Cooperative Milk Producers' Federation (Aavin)",
    briefDescription: 'Subsidy & concessional credit to start or expand dairy farming.',
    description:
      'Financial support for farmers to buy milch cows and set up small or medium dairy units, linked to Aavin\'s village-level milk cooperative societies for procurement and cattle feed support.',
    eligibility: [
      'Tamil Nadu farmers willing to supply milk through a village-level primary milk cooperative society',
      'Mini Dairy: beneficiaries purchasing cows through the scheme',
      'Medium Dairy: beneficiaries setting up a larger dairy unit with a viable project',
    ],
    benefits: [
      'Medium Dairy Scheme: 25% capital subsidy on project cost, rest as concessional credit',
      'Mini Dairy Scheme: interest subsidy for beneficiaries purchasing milch cows',
      'Access to cattle feed subsidy and guaranteed milk procurement through Aavin',
    ],
    officialUrl: 'https://aavin.tn.gov.in/',
  },
  {
    id: 'tn-seed-subsidy-tanseda',
    imageKey: 'tn_emblem',
    name: 'TN Certified Seed Subsidy (TANSEDA)',
    level: 'state',
    color: '#2E7D32',
    department: 'Tamil Nadu State Seed Development Agency',
    briefDescription: 'Subsidized certified seeds for paddy, millets, pulses & oilseeds.',
    description:
      'TANSEDA distributes certified quality seeds — paddy, millets, pulses, and oilseeds — to Tamil Nadu farmers at a subsidized rate, to improve yield and seed quality across the state.',
    eligibility: [
      'Tamil Nadu farmers cultivating paddy, millets, pulses, or oilseeds',
      'Apply through the local Agriculture Department office or Agrisnet portal',
    ],
    benefits: [
      'Certified seeds at 50–60% subsidy on cost',
      'Improved seed quality and germination compared to farm-saved seed',
      'Covers major crops: paddy, millets, pulses, and oilseeds',
    ],
    officialUrl: 'https://www.tnagrisnet.tn.gov.in/tanseda/',
  },
];

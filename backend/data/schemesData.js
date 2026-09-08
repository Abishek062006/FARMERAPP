// Curated list of real government farming schemes & subsidies available to
// Maharashtra farmers.
//
// SOURCE: "Agriculture / Crops — Key Schemes and Policies", Government of
// Maharashtra (Agriculture_Crops_Schemes+Reports_18thAugust.pdf, 13 pp.),
// which tabulates 18 schemes with their implementing department, level,
// target beneficiaries, geography and official link. Every entry below maps
// 1:1 to a row of that table; `department`, `level` and `officialUrl` are
// taken verbatim from it.
//
// `eligibility` and `benefits` are written from that table's own "Target
// Beneficiaries" and "Scheme Overview" columns. Where the source states a
// figure (₹6,000/year, ₹3,000/month pension, 0.20-6 ha holding, ₹1.50 lakh
// income ceiling, 2%/1.5% premium) it is reproduced; where it does not, the
// wording stays general rather than inventing subsidy percentages. Refresh
// this file by hand when scheme details change — myScheme.gov.in's Terms of
// Use prohibit automated access without written authorization, which is why
// this is curated rather than pulled live.
//
// Replaces the Tamil Nadu scheme list this file previously held.
//
// imageKey must name a PNG seeded by scripts/seedSchemeImages.js from
// backend/assets/scheme-logos/. Maharashtra's state departments have no
// dedicated logo asset yet, so they use the national emblem ('goi'); the
// frontend falls back to a ribbon icon if a key is missing.

module.exports = [
  // ── Central Government schemes ──────────────────────────────────────────
  {
    id: 'pm-kisan',
    imageKey: 'moa',
    name: 'PM-KISAN',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#2E7D32',
    briefDescription: '₹6,000/year direct cash support for landholding farmer families.',
    description:
      'Pradhan Mantri Kisan Samman Nidhi (PM-KISAN) augments the income of small and marginal farmers. Eligible farmer families receive direct income support paid straight into their Aadhaar-linked bank account, with no middlemen involved.',
    eligibility: [
      'All landholding farmers’ families — husband, wife and children below 18 years of age',
      'Aadhaar-linked bank account required for the transfer',
      'Available in all States and Union Territories',
    ],
    benefits: [
      '₹6,000 per year credited directly to the farmer’s bank account',
      'Paid in three equal installments of ₹2,000 each',
      'Credited directly to the Aadhaar-linked account (Direct Benefit Transfer)',
    ],
    officialUrl: 'https://www.pmkisan.gov.in/',
  },
  {
    id: 'pmfby',
    imageKey: 'moa',
    name: 'Pradhan Mantri Fasal Bima Yojana (PMFBY)',
    level: 'central',
    department:
      'Department of Agriculture, Cooperation & Farmers Welfare, Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#1976D2',
    briefDescription: 'Affordable crop insurance from pre-sowing to post-harvest.',
    description:
      'Launched from Kharif 2016, PMFBY supports agricultural production by providing an affordable crop insurance product giving comprehensive risk cover for farmers’ crops against all non-preventable natural risks, from the pre-sowing to the post-harvest stage.',
    eligibility: [
      'All farmers growing notified crops in a notified area during the season',
      'The farmer must have an insurable interest in the crop',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Comprehensive cover against non-preventable natural risks',
      'Cover runs from pre-sowing through to the post-harvest stage',
      'Farmer premium is capped at 2% for Kharif and 1.5% for Rabi food and oilseed crops',
    ],
    officialUrl: 'https://pmfby.gov.in/',
  },
  {
    id: 'kcc',
    imageKey: 'goi',
    name: 'Kisan Credit Card (KCC)',
    level: 'central',
    department: 'Reserve Bank of India / participating banks',
    color: '#00897B',
    briefDescription: 'Single-window, flexible crop credit from the banking system.',
    description:
      'The Kisan Credit Card scheme provides adequate and timely credit support from the banking system under a single window, with flexible and simplified procedures, for farmers’ cultivation and other needs.',
    eligibility: [
      'Farmers, tenant farmers, Self Help Groups and Joint Liability Groups',
      'Applied for through any participating bank branch',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Timely crop credit through a single window',
      'Simplified and flexible drawing procedure',
      'Covers cultivation costs and other farm needs',
    ],
    officialUrl:
      'https://www.rbi.org.in/commonman/Upload/English/Notification/PDFs/04MCKCC03072017.pdf',
  },
  {
    id: 'pm-kisan-maandhan',
    imageKey: 'moa',
    name: 'PM Kisan Maandhan Yojana',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#6A1B9A',
    briefDescription: '₹3,000/month pension for small & marginal farmers after 60.',
    description:
      'PMKMY is a voluntary, contribution-based pension scheme providing old-age protection and social security to small and marginal farmers.',
    eligibility: [
      'Small and marginal farmers with cultivable landholding up to 2 hectares',
      'Aged between 18 and 40 years at the time of joining',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Fixed pension of ₹3,000 per month on reaching pension age',
      'Voluntary and contribution-based',
      'Enrolment through Common Service Centres',
    ],
    officialUrl: 'https://maandhan.in/',
  },
  {
    id: 'enam',
    imageKey: 'goi',
    name: 'e-NAM (Electronic National Agriculture Market)',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#EF6C00',
    briefDescription: 'Online APMC trading — 118 mandis in Maharashtra are linked.',
    description:
      'e-NAM is a pan-India electronic trading portal launched in 2016 that directly connects APMC mandis online. It is a single-window service for APMC information and services — commodity arrivals and prices, buy and sell trade offers, and the ability to respond to trade offers — which reduces transaction costs and information asymmetry.',
    eligibility: [
      'Farmers, traders and buyers transacting through a linked APMC mandi',
      'All 118 APMCs included under e-NAM in Maharashtra',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Live commodity arrival and price information across linked mandis',
      'Buy and sell trade offers, with the ability to respond online',
      'Lower transaction costs and reduced information asymmetry',
    ],
    officialUrl: 'https://www.enam.gov.in/',
  },
  {
    id: 'mkisan',
    imageKey: 'moa',
    name: 'mKisan Portal',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#0277BD',
    briefDescription: 'Free SMS advisories on weather, pests, insurance and market price.',
    description:
      'The mKisan portal is a mobile-based service that lets farmers and other stakeholders receive advisories and information — agro-meteorological advisory, hurricane warnings, crop and pest infestation, crop insurance, market price and more — sent by experts and government organisations at different levels, free of cost.',
    eligibility: [
      'Any farmer who registers a mobile number on the portal',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Agro-meteorological and weather advisories',
      'Crop and pest infestation alerts',
      'Market price and crop insurance information, free of cost',
    ],
    officialUrl: 'https://mkisan.gov.in/',
  },
  {
    id: 'rkvy-raftaar',
    imageKey: 'moa',
    name: 'RKVY-RAFTAAR',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#5D4037',
    briefDescription: 'Umbrella fund for micro-irrigation, mechanisation and agri-business.',
    description:
      'Rashtriya Krishi Vikas Yojana was launched in 2007-08 for holistic development of agriculture and allied sectors, and since 2017-18 runs as RKVY-RAFTAAR to make farming remunerative through strengthening farmers’ efforts, risk mitigation and agri-business entrepreneurship. From 2022-23 it is implemented as RKVY-Cafeteria.',
    eligibility: [
      'Farmers and agri-entrepreneurs, through the State Annual Action Plan',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Annual Action Plan stream: Per Drop More Crop (micro-irrigation), farm mechanisation, rainfed area development, Soil Health Card, organic farming',
      'Detailed Project Report stream: 70% of the grant reserved for production, infrastructure and assets',
      '10% reserved for innovation and agri-entrepreneurship development projects',
    ],
    officialUrl: 'https://rkvy.da.gov.in/',
  },
  {
    id: 'soil-health-card',
    imageKey: 'moa',
    name: 'Soil Health Card (SHC) Scheme',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#795548',
    briefDescription: 'Free soil testing with crop-wise nutrient recommendations.',
    description:
      'Distribution of Soil Health Cards promotes integrated nutrient management for maintaining soil health and improving soil fertility. Cards are distributed to farmers in phases to create awareness of soil health status and to suggest measures to improve it.',
    eligibility: [
      'All farmers, in phases by village cluster',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Soil test report showing the field’s nutrient status',
      'Recommended nutrient and fertiliser doses for the next crop',
      'Demonstrations conducted under the scheme to show recommended practice',
    ],
    officialUrl: 'https://soilhealth.dac.gov.in/',
  },
  {
    id: 'pkvy',
    imageKey: 'moa',
    name: 'Paramparagat Krishi Vikas Yojana (PKVY)',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#388E3C',
    briefDescription: 'Support for cluster-based organic farming and direct marketing.',
    description:
      'PKVY aims to enhance soil fertility and produce healthy food through organic practices without chemicals, empower farmers through a cluster approach to farm practice management, assure quality, and enable direct marketing of agricultural produce through innovative means.',
    eligibility: [
      'Farmers organised into an organic cluster',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Support for chemical-free organic production practices',
      'Cluster-based training and farm practice management',
      'Quality assurance and support for direct marketing of produce',
    ],
    officialUrl: 'https://pgsindia-ncof.gov.in/pkvy/index.aspx',
  },
  {
    id: 'nfsm',
    imageKey: 'moa',
    name: 'National Food Security Mission (NFSM)',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#C62828',
    briefDescription: 'Area and productivity support for rice, wheat, pulses and millets.',
    description:
      'NFSM increases the production of rice, wheat, pulses, coarse cereals and nutri-cereals through area expansion and productivity enhancement in a sustainable manner, restoring soil fertility and productivity at the individual farm level and enhancing farm-level economy.',
    eligibility: [
      'Farmers growing rice, wheat, pulses, coarse cereals or nutri-cereals in identified districts',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Support for area expansion and productivity enhancement',
      'Interventions to restore soil fertility and productivity at farm level',
      'Focus on pulses and nutri-cereals alongside the major cereals',
    ],
    officialUrl: 'https://www.nfsm.gov.in/',
  },
  {
    id: 'rainfed-area-development',
    imageKey: 'moa',
    name: 'Rainfed Area Development Programme',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#F9A825',
    briefDescription: 'Risk reduction for rainfed farms through integrated farming systems.',
    description:
      'Rainfed agriculture is risk-prone because it depends on the climate. The programme minimises that risk by providing agriculture-based income-generating opportunities and sustaining rainfed agriculture through optimum use of natural resources and of resources created through various interventions.',
    eligibility: [
      'Farmers cultivating in rainfed areas',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Agriculture-based income-generating opportunities that spread risk',
      'Better use of existing natural resources on the farm',
      'Support for integrated farming systems in rainfed tracts',
    ],
    officialUrl:
      'https://agricoop.gov.in/sites/default/files/RAD_Operational_Guidelines.pdf',
  },
  {
    id: 'seed-village-programme',
    imageKey: 'moa',
    name: 'Seed Village Programme (Krishonnati Yojana)',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#7CB342',
    briefDescription: 'Certified seed production and better farm-saved seed quality.',
    description:
      'Under the Green Revolution – Krishonnati Yojana umbrella, the Sub-Mission on Seeds and Planting Material increases production of certified and quality seed, raises the Seed Replacement Rate, upgrades the quality of farm-saved seed, strengthens the seed multiplication chain, and promotes new technologies in seed production, processing and testing.',
    eligibility: [
      'Farmers participating in a designated seed village',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Training and inputs for producing certified quality seed',
      'Improved quality of farm-saved seed',
      'A stronger local seed multiplication chain',
    ],
    officialUrl: 'https://seednet.gov.in/',
  },
  {
    id: 'seed-processing-storage',
    imageKey: 'moa',
    name: 'Seed Processing Plant & Storage Godown (Krishonnati Yojana)',
    level: 'central',
    department: 'Ministry of Agriculture & Farmers Welfare, Government of India',
    color: '#8D6E63',
    briefDescription: 'Financial assistance for seed processing and storage infrastructure.',
    description:
      'Also under the Green Revolution – Krishonnati Yojana umbrella, this component gives financial assistance for seed production, seed certification, farmer training, seed processing, and seed storage godowns.',
    eligibility: [
      'Farmers and farmer organisations undertaking seed production',
      'Available in all States and Union Territories',
    ],
    benefits: [
      'Financial assistance towards seed processing facilities',
      'Financial assistance towards seed storage godowns',
      'Support for seed certification and farmer training',
    ],
    officialUrl: 'https://seednet.gov.in/',
  },

  // ── Maharashtra State schemes ───────────────────────────────────────────
  {
    id: 'pocra',
    imageKey: 'goi',
    name: 'Nanaji Deshmukh Krishi Sanjeevani Prakalp (POCRA)',
    level: 'state',
    department: 'Department of Agriculture, Government of Maharashtra',
    color: '#2E7D32',
    briefDescription:
      'World Bank-backed climate-resilience project across 15 districts of Marathwada & Vidarbha.',
    description:
      'The Project on Climate Resilient Agriculture is implemented by the Government of Maharashtra with World Bank assistance to raise the climate-resilience and profitability of smallholder farming systems in selected districts. It covers benefits to individual farmers, financial assistance to farmer producer companies, farmer groups and self-help groups, soil and water conservation works, farm schools, capacity building and agro-climatic advisory services.',
    eligibility: [
      'Individual farmers, Farmer Producer Organisations, Farmer Interest Groups and Self Help Groups',
      'Districts covered: Akola, Amravati, Chhatrapati Sambhajinagar, Beed, Buldhana, Hingoli, Jalgaon, Jalna, Latur, Nanded, Dharashiv, Parbhani, Wardha, Washim and Yavatmal',
    ],
    benefits: [
      'Direct benefits to individual farmers, and financial assistance to FPOs, farmer groups and SHGs',
      'Soil and water conservation works on the farm',
      'Farm schools, capacity building and agro-climatic advisory services',
    ],
    officialUrl: 'https://mahapocra.gov.in/',
  },
  {
    id: 'ambedkar-krishi-swavalamban',
    imageKey: 'goi',
    name: 'Dr. Babasaheb Ambedkar Krishi Swavalamban Yojana',
    level: 'state',
    department: 'Department of Agriculture, Government of Maharashtra',
    color: '#1565C0',
    briefDescription: '100% subsidy on irrigation assets for SC & Neo-Buddhist farmers.',
    description:
      'The scheme gives financial assistance as a 100 per cent subsidy to Scheduled Caste and Neo-Buddhist farmers in Maharashtra, with the objective of providing a sustainable irrigation facility on their land.',
    eligibility: [
      'Scheduled Caste and Neo-Buddhist farmers in Maharashtra (all districts)',
      'Landholding between 0.20 ha and 6 ha — a new well requires a minimum of 0.40 ha',
      'Annual income up to ₹1.50 lakh',
    ],
    benefits: [
      '100 per cent subsidy on the sanctioned irrigation asset',
      'Covers a new well, repair of an old well, farm pond lining, in-well boring and a pumpset',
      'Also covers electric connection charges and a micro-irrigation set',
    ],
    officialUrl: 'https://mahadbt.maharashtra.gov.in/Farmer/Login/Login',
  },
  {
    id: 'birsa-munda-krishi-kranti',
    imageKey: 'goi',
    name: 'Birsa Munda Krishi Kranti Yojana',
    level: 'state',
    department: 'Department of Agriculture, Government of Maharashtra',
    color: '#00695C',
    briefDescription: '100% subsidy on irrigation assets for Scheduled Tribe farmers.',
    description:
      'The scheme gives financial assistance as a 100 per cent subsidy to Scheduled Tribe farmers in Maharashtra, with the objective of providing a sustainable irrigation facility on their land.',
    eligibility: [
      'Scheduled Tribe farmers in Maharashtra (all districts)',
      'Landholding between 0.20 ha and 6 ha — a new well requires a minimum of 0.40 ha',
      'Annual income up to ₹1.50 lakh',
    ],
    benefits: [
      '100 per cent subsidy on the sanctioned irrigation asset',
      'Covers a new well, repair of an old well, farm pond lining, in-well boring and a pumpset',
      'Also covers electric connection charges, HDPE/PVC pipe, a micro-irrigation set and a kitchen garden',
    ],
    officialUrl: 'https://mahadbt.maharashtra.gov.in/Farmer/Login/Login',
  },
  {
    id: 'cropsap',
    imageKey: 'goi',
    name: 'Crop Pest Surveillance & Advisory Project (CROPSAP)',
    level: 'state',
    department: 'Department of Agriculture, Government of Maharashtra',
    color: '#AD1457',
    briefDescription: 'Real-time pest surveillance and advisories for eight major crops.',
    description:
      'CROPSAP is an online, real-time crop pest management advisory project run in collaboration with the Indian Council of Agricultural Research and the state agricultural universities.',
    eligibility: [
      'Farmers across Maharashtra',
      'Covers Paddy, Soyabean, Cotton, Tur, Gram, Maize, Sorghum and Sugarcane',
    ],
    benefits: [
      'Surveillance of pests and diseases of major crops, with management advisories',
      'Awareness building among farmers on pest and disease management',
      'Bio and chemical pesticides on a subsidy basis in critical situations',
    ],
    officialUrl: 'https://krishi.maharashtra.gov.in/',
  },
  {
    id: 'bhausaheb-fundkar-falbaug',
    imageKey: 'goi',
    name: 'Bhausaheb Fundkar Falbaug Lagwad Yojana',
    level: 'state',
    department: 'Department of Agriculture, Government of Maharashtra',
    color: '#EF6C00',
    briefDescription: '100% subsidy to plant an orchard — 16 perennial horticulture crops.',
    description:
      'Running since the Kharif season of 2018-19, this 100 per cent subsidy scheme aims to raise farmer incomes, create employment for young farmers, change the cropping pattern, create a sustainable source of income, and increase production of the raw materials agro-processing industries need. It covers the plantation of 16 perennial horticulture crops.',
    eligibility: [
      'Farmers in Maharashtra who are NOT registered under MGNREGA',
      'Farmers registered under MGNREGA are covered by the horticulture component of that scheme instead',
    ],
    benefits: [
      '100 per cent subsidy on establishing the orchard',
      'Covers 16 perennial horticulture crops',
      'Creates a long-term income source and supports on-farm employment',
    ],
    officialUrl: 'https://mahadbt.maharashtra.gov.in/Farmer/Login/Login',
  },
];

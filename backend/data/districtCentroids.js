// Approximate centroid (district HQ) for each of Maharashtra's 36 districts.
//
// Why this exists: the marketplace needs a canonical district per listing so a
// vendor can search "show me onion in Nashik". It cannot use the district
// string stored on Land — an audit of live data found only 3 of 11 distinct
// stored values were real districts; the rest were neighbourhood and town
// names the device geocoder returned. Land coordinates, by contrast, are
// required and map-picked, so they are trustworthy.
//
// LIMITATION: nearest-centroid is not the same as point-in-polygon. Near a
// district boundary a location can be assigned to a neighbouring district.
// That is acceptable here because the assignment is SELF-CONSISTENT: listings
// and the vendor's filter use the same function, so a search never silently
// misses a listing it labelled itself. Swap in real district polygons if label
// accuracy ever matters more than filter coherence.
//
// Replaces data/tnDistrictCentroids.js (Tamil Nadu's 38 districts).
const MH_DISTRICT_CENTROIDS = [
  { district: 'Ahilyanagar',                lat: 19.0948, lng: 74.7480 },
  { district: 'Akola',                      lat: 20.7002, lng: 77.0082 },
  { district: 'Amravati',                   lat: 20.9374, lng: 77.7796 },
  { district: 'Beed',                       lat: 18.9891, lng: 75.7601 },
  { district: 'Bhandara',                   lat: 21.1704, lng: 79.6526 },
  { district: 'Buldhana',                   lat: 20.5292, lng: 76.1806 },
  { district: 'Chandrapur',                 lat: 19.9615, lng: 79.2961 },
  { district: 'Chhatrapati Sambhajinagar',  lat: 19.8762, lng: 75.3433 },
  { district: 'Dhule',                      lat: 20.9042, lng: 74.7749 },
  { district: 'Dharashiv',                  lat: 18.1860, lng: 76.0419 },
  { district: 'Gadchiroli',                 lat: 20.1809, lng: 80.0034 },
  { district: 'Gondia',                     lat: 21.4602, lng: 80.1920 },
  { district: 'Hingoli',                    lat: 19.7173, lng: 77.1490 },
  { district: 'Jalgaon',                    lat: 21.0077, lng: 75.5626 },
  { district: 'Jalna',                      lat: 19.8410, lng: 75.8864 },
  { district: 'Kolhapur',                   lat: 16.7050, lng: 74.2433 },
  { district: 'Latur',                      lat: 18.4088, lng: 76.5604 },
  { district: 'Mumbai City',                lat: 18.9388, lng: 72.8354 },
  { district: 'Mumbai Suburban',            lat: 19.1136, lng: 72.8697 },
  { district: 'Nagpur',                     lat: 21.1458, lng: 79.0882 },
  { district: 'Nanded',                     lat: 19.1383, lng: 77.3210 },
  { district: 'Nandurbar',                  lat: 21.3667, lng: 74.2400 },
  { district: 'Nashik',                     lat: 19.9975, lng: 73.7898 },
  { district: 'Palghar',                    lat: 19.6967, lng: 72.7699 },
  { district: 'Parbhani',                   lat: 19.2704, lng: 76.7601 },
  { district: 'Pune',                       lat: 18.5204, lng: 73.8567 },
  { district: 'Raigad',                     lat: 18.6414, lng: 72.8722 },
  { district: 'Ratnagiri',                  lat: 16.9902, lng: 73.3120 },
  { district: 'Sangli',                     lat: 16.8524, lng: 74.5815 },
  { district: 'Satara',                     lat: 17.6805, lng: 74.0183 },
  { district: 'Sindhudurg',                 lat: 16.0333, lng: 73.6667 },
  { district: 'Solapur',                    lat: 17.6599, lng: 75.9064 },
  { district: 'Thane',                      lat: 19.2183, lng: 72.9781 },
  { district: 'Wardha',                     lat: 20.7453, lng: 78.6022 },
  { district: 'Washim',                     lat: 20.1097, lng: 77.1330 },
  { district: 'Yavatmal',                   lat: 20.3888, lng: 78.1204 },
];


// Secondary anchors: well-known towns that belong to a district but sit far
// from its HQ. Maharashtra needs more of these than Tamil Nadu did — several
// districts are very large (Ahilyanagar, Nashik, Pune, Gadchiroli, Chandrapur)
// or strung out along a coast (Ratnagiri, Raigad, Palghar), and pure nearest-HQ
// misassigns their far talukas. Each anchor is just another point that votes
// for its district, which recovers most of what point-in-polygon would give for
// a fraction of the data.
//
// Lasalgaon and Niphad matter most: they are Asia's largest onion market and
// its hinterland, they are the demo, and they sit 45-60 km from Nashik city.
//
// The `town` field is not decoration: agmarknetService.js builds its
// taluk->district resolver from these rows, so a town added here is
// immediately understood by both the coordinate lookup and the Agmarknet
// district lookup. Add towns here, not in a second map.
const MH_DISTRICT_ANCHORS = [
  // Nashik — the onion belt sits well east of the HQ
  { district: 'Nashik',                     lat: 20.1417, lng: 74.2417, town: 'Lasalgaon' },
  { district: 'Nashik',                     lat: 20.0800, lng: 74.1100, town: 'Niphad' },
  { district: 'Nashik',                     lat: 20.0424, lng: 74.4894, town: 'Yeola' },
  { district: 'Nashik',                     lat: 20.5537, lng: 74.5288, town: 'Malegaon' },
  { district: 'Nashik',                     lat: 19.8467, lng: 74.0000, town: 'Sinnar' },
  { district: 'Nashik',                     lat: 19.6947, lng: 73.5622, town: 'Igatpuri' },
  { district: 'Nashik',                     lat: 20.4900, lng: 74.0100, town: 'Kalwan' },
  // Pune
  { district: 'Pune',                       lat: 18.1514, lng: 74.5815, town: 'Baramati' },
  { district: 'Pune',                       lat: 19.2080, lng: 73.8750, town: 'Junnar' },
  { district: 'Pune',                       lat: 18.8280, lng: 74.3730, town: 'Shirur' },
  { district: 'Pune',                       lat: 18.1200, lng: 75.0200, town: 'Indapur' },
  { district: 'Pune',                       lat: 18.6298, lng: 73.7997, town: 'Pimpri-Chinchwad' },
  { district: 'Pune',                       lat: 18.1500, lng: 73.8400, town: 'Bhor' },
  // Ahilyanagar — the largest district in the state by area
  { district: 'Ahilyanagar',                lat: 19.5700, lng: 74.2100, town: 'Sangamner' },
  { district: 'Ahilyanagar',                lat: 19.6200, lng: 74.6600, town: 'Shrirampur' },
  { district: 'Ahilyanagar',                lat: 18.7300, lng: 75.3100, town: 'Jamkhed' },
  { district: 'Ahilyanagar',                lat: 19.3500, lng: 75.2300, town: 'Shevgaon' },
  // Konkan coast — long and thin, HQ near one end
  { district: 'Ratnagiri',                  lat: 17.5300, lng: 73.5200, town: 'Chiplun' },
  { district: 'Ratnagiri',                  lat: 17.7600, lng: 73.1900, town: 'Dapoli' },
  { district: 'Ratnagiri',                  lat: 16.6600, lng: 73.5200, town: 'Rajapur' },
  { district: 'Sindhudurg',                 lat: 16.0100, lng: 73.6900, town: 'Kudal' },
  { district: 'Sindhudurg',                 lat: 15.9000, lng: 73.8200, town: 'Sawantwadi' },
  { district: 'Sindhudurg',                 lat: 15.8600, lng: 73.6300, town: 'Vengurla' },
  { district: 'Raigad',                     lat: 18.9894, lng: 73.1175, town: 'Panvel' },
  { district: 'Raigad',                     lat: 18.7370, lng: 73.0960, town: 'Pen' },
  { district: 'Raigad',                     lat: 18.0800, lng: 73.4200, town: 'Mahad' },
  { district: 'Raigad',                     lat: 18.9100, lng: 73.3200, town: 'Karjat' },
  { district: 'Palghar',                    lat: 19.3900, lng: 72.8300, town: 'Vasai' },
  { district: 'Palghar',                    lat: 19.9700, lng: 72.7300, town: 'Dahanu' },
  { district: 'Palghar',                    lat: 19.9100, lng: 73.2300, town: 'Jawhar' },
  { district: 'Thane',                      lat: 19.2403, lng: 73.1305, town: 'Kalyan' },
  { district: 'Thane',                      lat: 19.3000, lng: 73.0600, town: 'Bhiwandi' },
  { district: 'Thane',                      lat: 19.2500, lng: 73.4000, town: 'Murbad' },
  { district: 'Thane',                      lat: 19.4500, lng: 73.3300, town: 'Shahapur' },
  // Western Maharashtra
  { district: 'Satara',                     lat: 17.2900, lng: 74.1800, town: 'Karad' },
  { district: 'Satara',                     lat: 17.9900, lng: 74.4300, town: 'Phaltan' },
  { district: 'Satara',                     lat: 17.9200, lng: 73.6600, town: 'Mahabaleshwar' },
  { district: 'Sangli',                     lat: 16.8300, lng: 74.6400, town: 'Miraj' },
  { district: 'Sangli',                     lat: 17.0500, lng: 75.2100, town: 'Jath' },
  { district: 'Sangli',                     lat: 17.0500, lng: 74.2600, town: 'Islampur' },
  { district: 'Kolhapur',                   lat: 16.6900, lng: 74.4600, town: 'Ichalkaranji' },
  { district: 'Kolhapur',                   lat: 16.2200, lng: 74.3500, town: 'Gadhinglaj' },
  { district: 'Solapur',                    lat: 17.6800, lng: 75.3300, town: 'Pandharpur' },
  { district: 'Solapur',                    lat: 17.5200, lng: 76.2100, town: 'Akkalkot' },
  { district: 'Solapur',                    lat: 18.2300, lng: 75.6900, town: 'Barshi' },
  // Khandesh
  { district: 'Jalgaon',                    lat: 21.0400, lng: 75.7900, town: 'Bhusawal' },
  { district: 'Jalgaon',                    lat: 20.4600, lng: 74.9900, town: 'Chalisgaon' },
  { district: 'Jalgaon',                    lat: 21.0400, lng: 75.0600, town: 'Amalner' },
  { district: 'Dhule',                      lat: 21.3500, lng: 74.8800, town: 'Shirpur' },
  { district: 'Dhule',                      lat: 20.9900, lng: 74.3200, town: 'Sakri' },
  { district: 'Nandurbar',                  lat: 21.5400, lng: 74.4700, town: 'Shahada' },
  { district: 'Nandurbar',                  lat: 21.5600, lng: 74.2100, town: 'Taloda' },
  // Marathwada
  { district: 'Chhatrapati Sambhajinagar',  lat: 19.9200, lng: 74.7300, town: 'Vaijapur' },
  { district: 'Chhatrapati Sambhajinagar',  lat: 19.4800, lng: 75.3800, town: 'Paithan' },
  { district: 'Chhatrapati Sambhajinagar',  lat: 20.3000, lng: 75.6500, town: 'Sillod' },
  { district: 'Jalna',                      lat: 19.6100, lng: 75.7900, town: 'Ambad' },
  { district: 'Jalna',                      lat: 19.5900, lng: 76.2100, town: 'Partur' },
  { district: 'Beed',                       lat: 18.7300, lng: 76.3900, town: 'Ambajogai' },
  { district: 'Beed',                       lat: 18.8500, lng: 76.5300, town: 'Parli' },
  { district: 'Latur',                      lat: 18.3900, lng: 77.1200, town: 'Udgir' },
  { district: 'Latur',                      lat: 18.2500, lng: 76.5000, town: 'Ausa' },
  { district: 'Dharashiv',                  lat: 18.0100, lng: 76.0700, town: 'Tuljapur' },
  { district: 'Dharashiv',                  lat: 17.8400, lng: 76.6200, town: 'Umarga' },
  { district: 'Dharashiv',                  lat: 17.7700, lng: 76.6500, town: 'Murum' },
  { district: 'Parbhani',                   lat: 18.9700, lng: 76.7500, town: 'Gangakhed' },
  { district: 'Parbhani',                   lat: 19.4500, lng: 76.4400, town: 'Selu' },
  { district: 'Hingoli',                    lat: 19.3200, lng: 77.1600, town: 'Basmath' },
  { district: 'Nanded',                     lat: 19.6200, lng: 78.2000, town: 'Kinwat' },
  { district: 'Nanded',                     lat: 18.5500, lng: 77.5800, town: 'Deglur' },
  // Vidarbha
  { district: 'Buldhana',                   lat: 20.7100, lng: 76.5700, town: 'Khamgaon' },
  { district: 'Buldhana',                   lat: 20.8900, lng: 76.2000, town: 'Malkapur' },
  { district: 'Buldhana',                   lat: 20.1500, lng: 76.5700, town: 'Mehkar' },
  { district: 'Akola',                      lat: 21.1000, lng: 77.0600, town: 'Akot' },
  { district: 'Akola',                      lat: 20.7300, lng: 77.3700, town: 'Murtizapur' },
  { district: 'Washim',                     lat: 20.4800, lng: 77.4900, town: 'Karanja' },
  { district: 'Amravati',                   lat: 21.2600, lng: 77.5100, town: 'Achalpur' },
  { district: 'Amravati',                   lat: 21.5300, lng: 77.1800, town: 'Dharni (Melghat)' },
  { district: 'Yavatmal',                   lat: 19.9100, lng: 77.5800, town: 'Pusad' },
  { district: 'Yavatmal',                   lat: 20.0600, lng: 78.9500, town: 'Wani' },
  { district: 'Wardha',                     lat: 20.5500, lng: 78.8400, town: 'Hinganghat' },
  { district: 'Wardha',                     lat: 20.9900, lng: 78.2300, town: 'Arvi' },
  { district: 'Nagpur',                     lat: 21.2700, lng: 78.5900, town: 'Katol' },
  { district: 'Nagpur',                     lat: 21.4000, lng: 79.3300, town: 'Ramtek' },
  { district: 'Nagpur',                     lat: 20.8500, lng: 79.3300, town: 'Umred' },
  { district: 'Bhandara',                   lat: 21.3800, lng: 79.7300, town: 'Tumsar' },
  { district: 'Gondia',                     lat: 21.0500, lng: 80.2200, town: 'Deori' },
  { district: 'Chandrapur',                 lat: 19.7800, lng: 79.3600, town: 'Rajura' },
  { district: 'Chandrapur',                 lat: 20.2300, lng: 79.0000, town: 'Warora' },
  { district: 'Gadchiroli',                 lat: 19.4200, lng: 80.0200, town: 'Aheri' },
  { district: 'Gadchiroli',                 lat: 18.8300, lng: 79.9600, town: 'Sironcha' },
];

const MH_DISTRICT_POINTS = [...MH_DISTRICT_CENTROIDS, ...MH_DISTRICT_ANCHORS];

const MH_DISTRICTS = MH_DISTRICT_CENTROIDS.map((d) => d.district);

module.exports = { MH_DISTRICT_CENTROIDS, MH_DISTRICT_ANCHORS, MH_DISTRICT_POINTS, MH_DISTRICTS };

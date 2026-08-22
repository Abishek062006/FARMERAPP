// Approximate centroid (district HQ) for each of Tamil Nadu's 38 districts.
//
// Why this exists: the marketplace needs a canonical district per listing so a
// vendor can search "show me groundnut in Erode". It cannot use the district
// string stored on Land — an audit of live data found only 3 of 11 distinct
// stored values were real districts; the rest were neighbourhood and town
// names the device geocoder returned ("Ellis Nagar", "Gandhiji Street",
// "Madurai Main"). Land coordinates, by contrast, are required and map-picked,
// so they are trustworthy.
//
// LIMITATION: nearest-centroid is not the same as point-in-polygon. Near a
// district boundary — and especially around Chennai, whose district is small
// but whose HQ point is prominent — a location can be assigned to a
// neighbouring district. That is acceptable here because the assignment is
// SELF-CONSISTENT: listings and the vendor's filter use the same function, so
// a search never silently misses a listing it labelled itself. Swap in real
// district polygons if label accuracy ever matters more than filter coherence.
const TN_DISTRICT_CENTROIDS = [
  { district: 'Ariyalur',        lat: 11.1401, lng: 79.0782 },
  { district: 'Chengalpattu',    lat: 12.6919, lng: 79.9760 },
  { district: 'Chennai',         lat: 13.0827, lng: 80.2707 },
  { district: 'Coimbatore',      lat: 11.0168, lng: 76.9558 },
  { district: 'Cuddalore',       lat: 11.7480, lng: 79.7714 },
  { district: 'Dharmapuri',      lat: 12.1277, lng: 78.1580 },
  { district: 'Dindigul',        lat: 10.3624, lng: 77.9695 },
  { district: 'Erode',           lat: 11.3410, lng: 77.7172 },
  { district: 'Kallakurichi',    lat: 11.7383, lng: 78.9570 },
  { district: 'Kanchipuram',     lat: 12.8342, lng: 79.7036 },
  { district: 'Kanyakumari',     lat: 8.1833,  lng: 77.4119 },
  { district: 'Karur',           lat: 10.9601, lng: 78.0766 },
  { district: 'Krishnagiri',     lat: 12.5186, lng: 78.2137 },
  { district: 'Madurai',         lat: 9.9252,  lng: 78.1198 },
  { district: 'Mayiladuthurai',  lat: 11.1018, lng: 79.6529 },
  { district: 'Nagapattinam',    lat: 10.7660, lng: 79.8424 },
  { district: 'Namakkal',        lat: 11.2189, lng: 78.1677 },
  { district: 'Nilgiris',        lat: 11.4102, lng: 76.6950 },
  { district: 'Perambalur',      lat: 11.2342, lng: 78.8808 },
  { district: 'Pudukkottai',     lat: 10.3833, lng: 78.8001 },
  { district: 'Ramanathapuram',  lat: 9.3639,  lng: 78.8395 },
  { district: 'Ranipet',         lat: 12.9249, lng: 79.3308 },
  { district: 'Salem',           lat: 11.6643, lng: 78.1460 },
  { district: 'Sivaganga',       lat: 9.8433,  lng: 78.4809 },
  { district: 'Tenkasi',         lat: 8.9594,  lng: 77.3152 },
  { district: 'Thanjavur',       lat: 10.7870, lng: 79.1378 },
  { district: 'Theni',           lat: 10.0104, lng: 77.4768 },
  { district: 'Thoothukudi',     lat: 8.7642,  lng: 78.1348 },
  { district: 'Tiruchirappalli', lat: 10.7905, lng: 78.7047 },
  { district: 'Tirunelveli',     lat: 8.7139,  lng: 77.7567 },
  { district: 'Tirupathur',      lat: 12.4950, lng: 78.5686 },
  { district: 'Tiruppur',        lat: 11.1085, lng: 77.3411 },
  { district: 'Tiruvallur',      lat: 13.1439, lng: 79.9094 },
  { district: 'Tiruvannamalai',  lat: 12.2253, lng: 79.0747 },
  { district: 'Tiruvarur',       lat: 10.7727, lng: 79.6368 },
  { district: 'Vellore',         lat: 12.9165, lng: 79.1325 },
  { district: 'Villupuram',      lat: 11.9401, lng: 79.4861 },
  { district: 'Virudhunagar',    lat: 9.5810,  lng: 77.9578 },
];


// Secondary anchors: well-known towns that belong to a district but sit far
// from its HQ. Pure nearest-HQ put Karaikkudi in Pudukkottai (it is Sivaganga,
// lost by 1 km) and Semmancheri in Chennai (it is Chengalpattu). Each anchor
// is just another point that votes for its district, which recovers most of
// what point-in-polygon would give for a fraction of the data.
const TN_DISTRICT_ANCHORS = [
  { district: 'Sivaganga',       lat: 10.0735, lng: 78.7739 }, // Karaikkudi
  { district: 'Sivaganga',       lat: 9.9475,  lng: 78.8231 }, // Devakottai
  { district: 'Sivaganga',       lat: 9.6772,  lng: 78.4692 }, // Manamadurai
  { district: 'Sivaganga',       lat: 9.8700,  lng: 78.2600 }, // Thiruppuvanam
  { district: 'Chengalpattu',    lat: 12.9010, lng: 80.2279 }, // Sholinganallur
  { district: 'Chengalpattu',    lat: 12.8700, lng: 80.2200 }, // Semmancheri
  { district: 'Chengalpattu',    lat: 12.9249, lng: 80.1000 }, // Tambaram
  { district: 'Chengalpattu',    lat: 12.6208, lng: 80.1945 }, // Mahabalipuram
  { district: 'Madurai',         lat: 9.8226,  lng: 77.9861 }, // Thirumangalam
  { district: 'Thanjavur',       lat: 10.9601, lng: 79.3788 }, // Kumbakonam
  { district: 'Tiruchirappalli', lat: 10.8624, lng: 78.6957 }, // Srirangam
  { district: 'Erode',           lat: 11.4550, lng: 77.4425 }, // Gobichettipalayam
  { district: 'Coimbatore',      lat: 10.6589, lng: 77.0085 }, // Pollachi
  { district: 'Tirunelveli',     lat: 8.7104,  lng: 77.4531 }, // Ambasamudram
  { district: 'Virudhunagar',    lat: 9.4533,  lng: 77.7987 }, // Sivakasi
  { district: 'Thoothukudi',     lat: 9.1712,  lng: 77.8683 }, // Kovilpatti
  { district: 'Nagapattinam',    lat: 10.6819, lng: 79.8503 }, // Velankanni
  { district: 'Villupuram',      lat: 12.2353, lng: 79.6533 }, // Tindivanam
  { district: 'Vellore',         lat: 12.9450, lng: 78.8700 }, // Gudiyatham
  { district: 'Salem',           lat: 11.7877, lng: 77.8010 }, // Mettur
  { district: 'Pudukkottai',     lat: 10.2400, lng: 78.9500 }, // Aranthangi side
  { district: 'Dindigul',        lat: 10.2381, lng: 77.4892 }, // Kodaikanal
];

const TN_DISTRICT_POINTS = [...TN_DISTRICT_CENTROIDS, ...TN_DISTRICT_ANCHORS];

const TN_DISTRICTS = TN_DISTRICT_CENTROIDS.map((d) => d.district);

module.exports = { TN_DISTRICT_CENTROIDS, TN_DISTRICT_ANCHORS, TN_DISTRICT_POINTS, TN_DISTRICTS };

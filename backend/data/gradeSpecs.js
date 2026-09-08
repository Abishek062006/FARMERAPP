// data/gradeSpecs.js
//
// GRADE CRITERIA, FROM THE OFFICIAL STANDARD.
//
// Source: AGMARK Standards for Fruits and Vegetables (Volume V), Directorate of
// Marketing and Inspection, Ministry of Agriculture and Farmers Welfare, under
// the Agricultural Produce (Grading and Marking) Act, 1937 — rules made up to
// 1 November 2025, grade designations amended to 5 February 2024.
//
// These replaced 8 hand-written specs. They are not our opinion of what a good
// onion looks like; they are the gazette-notified designations a Maharashtra
// APMC already grades against, which is why a farmer and a buyer can argue
// about them and both be referring to the same document.
//
// A / B / C ARE THIS APP'S CODES; the AGMARK names travel with them.
//   A = Extra Class · B = Class I · C = Class II
// The codes stay A/B/C because `CropListing.grade.code` is an enum, and every
// listing, offer and dispute already written uses them. `agmarkClass` carries
// the official designation so a screen can show "Grade A (AGMARK Extra Class)"
// without a migration.
//
// `tolerance` is AGMARK's own allowance — the share of a lot that may fall
// short and still carry the grade. It is quoted because a buyer disputing a
// lot is really arguing about the tolerance, not the criteria.
//
// ⚠️ STILL SELF-DECLARED. Having the real standard does not mean anyone checked
// this lot against it. `CropListing.grade.selfDeclared` stays true and the
// disclaimer below stays on screen. What the standard buys is a shared
// definition to argue against, plus — since G2 — a farmer reputation that makes
// mis-declaring cost something (see services/trustService.js forFarmer).
//
// Bump SPEC_VERSION when criteria change, so an old listing keeps meaning what
// it meant when it was posted.
const SPEC_VERSION = 2;

const AGMARK_SOURCE =
  'AGMARK Standards for Fruits and Vegetables (Vol. V), Directorate of Marketing '
  + 'and Inspection, under the Agricultural Produce (Grading and Marking) Act, 1937.';

const DISCLAIMER =
  'Grades are declared by the farmer against the AGMARK standard. Nobody has '
  + 'inspected this lot.';

// Written once so every commodity's grades read consistently.
const GRADE_LABELS = {
  A: 'Grade A',
  B: 'Grade B',
  C: 'Grade C',
};

const SPECS = {
  apple: {
    commodity: 'Apple',
    agmark: true,
    agmarkPage: 139,
    aliases: ['apple'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Apples in this class must be of superior quality',
        criteria: [
          'The flesh must be sound',
          '(five percent of the fruits may have the defects as given in Table A)',
        ],
        tolerance: 'Five percent by number or weight of apples not satisfying the requirements of the grade, but meeting those of Class-I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'AGMARK Class I',
        criteria: [
          '1 % 3% 5 %',
          'To reach the appropriate stage of physiological maturity corres',
        ],
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          '1 % 3% 5 %',
          'To reach the appropriate stage of physiological maturity corresponding',
        ],
      },
    },
  },
  banana: {
    commodity: 'Banana',
    agmark: true,
    agmarkPage: 47,
    aliases: ['banana', 'kela'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Bananas shall be of superior quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
        ],
        tolerance: '5% by number or weight of bananas not satisfying the requirements of the grade, but meeting those of for Class I grade or, exceptionally, coming within the tolerances for that clas',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Bananas shall be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'Slight defects in shape and colour',
          'Slight defects due to rubbing and other superficial defects not exceeding 2 sq.cm. of the total surface area. The defects must not affect the flesh of the fruit',
        ],
        tolerance: '10% number or weight of bananas not satisfying the requirements of the grade class, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This includes bananas which do not qualify for inclusion in the higher classes, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape and colour provided the product remains the normal characteristics of bananas',
          'Skin defects due to scrapping, scabs, rubbing, blemishes or other causes not exceeding 4 sq.cm. of the total surface area; The defects must not affect the flesh of the fruit',
        ],
        tolerance: '10% by number or weight of bananas not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  beans: {
    commodity: 'Beans',
    agmark: true,
    agmarkPage: 77,
    aliases: ['beans', 'cluster beans', 'gavar'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Beans must be of superior quality. In shape, development and colouring they must be characteristic of the variety /or commercial type',
        criteria: [
          'Turgid, easily snapped',
          'Very tender',
          'Stringless. Seeds, if present must be small and soft. However, needle beans must be seedless. They must be free from defects',
        ],
        tolerance: '5 % by number or weight of beans not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Beans must be of good quality. In shape, development and colouring, they must be characteristic of the variety /or commercial type. They must be',
        criteria: [
          'Young and tender',
          'Practically stringless except in the case of beans for slicing',
          'Seeds, if present, must be small and soft',
          'Slight defect in shape',
          'Slight defect in colouring',
        ],
        tolerance: '10 % by number or weight of beans not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This class includes beans which do not qualify for inclusion in the higher classes but satisfy the minimum requirements. They must be.-',
        criteria: [
          'Reasonably tender',
          'Free from rust spots in the case of needle beans',
          'Seeds, if present, should not be too large and must be reasonably soft',
          'Defects in shape',
          'Defects in colouring',
        ],
        tolerance: '10 % by number or weight of beans not satisfying the requirements of the grade but meeting with the minimum requirements. In addition, not more than a maximum of 30% by number or w',
      },
    },
  },
  cabbage: {
    commodity: 'Cabbage',
    agmark: true,
    agmarkPage: 164,
    aliases: ['cabbage', 'kobi'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Cabbage must be of superior quality. They must be characteristic of the variety or commercial type. It must be',
        criteria: [
          'Well formed, firm and compact',
          'Uniform in colour',
          'Free from any defects due to mechanical injuries, like torn leaves, bruises or other physical injuries',
        ],
        tolerance: '5 % by number or weight of Cabbage not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Cabbage must be of good quality. They must be characteristic of the variety and/or commercial type. The Cabbage must be',
        criteria: [
          'Firm, compact',
          'Have not more than 4 wrapper leaves',
          'Free from defects such as blemishes, diseases, traces of frost and bruising',
          'Slight defects in shape or development',
          'Slight defects in colour',
        ],
        tolerance: '10 % by number or weight of Cabbage not satisfying the requirements of the grade, but meeting those of Class II.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Cabbage which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Slightly deformed',
          'Yellowish in colour on outer leaves not to exceed one-tenth of the total surface area',
          'Slight traces of sun scorching',
          'Slight bruising not exceeding 4 sq.cm. of surface area',
        ],
        tolerance: '10 % by number or weight of Cabbage not satisfying the requirements of the grade but meeting with the minimum requirements and fit for human consumption.',
      },
    },
  },
  carrot: {
    commodity: 'Carrot',
    agmark: true,
    agmarkPage: 101,
    aliases: ['carrot', 'gajar'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Carrots must be of superior quality',
        criteria: [
          'They must be well developed and have all the characteristic and colouring typical of the variety',
          'Regular in shape',
          'Green or violet/purple tops are not allowed',
        ],
        tolerance: '5 % by weight of Carrots not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade. 5 % by weig',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Carrots must be of good quality',
        criteria: [
          'They must be well developed and have all the characteristic and colour typical of the variety',
          'Slight defects in shape',
          'Slight defects in colouring',
          'Slight healed cracks',
          'Slight cracks or fissures due to handling or washing. Green or violet/purple tops upto 1 cm. long for carrots not exceeding 10 cm. in length, and upto 2 cm. for other carrots are allowed',
        ],
        tolerance: '10 % by weight of Carrots not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade. However, broken',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Carrots which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Carrots may have the following defects, provided they retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape and colour',
          'Healed cracks not reaching the heart',
          'Cracks or fissures due to handling or washing Green or violet/purple tops upto 2 cm. long for carrots not exceeding 10 cm. in length and upto 3 cm. for other carrots, are allowed',
        ],
        tolerance: '10 % by weight of Carrots not meeting the requirements of the grade, but meeting the minimum requirements. In addition, not more than 25% by weight of broken carrots may be allowed',
      },
    },
  },
  cauliflower: {
    commodity: 'Cauliflower',
    agmark: true,
    agmarkPage: 80,
    aliases: ['cauliflower', 'phulkobi'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Cauliflowers must be of superior quality. They must be characteristic of the variety /or commercial type. The flower cluster must be',
        criteria: [
          'Well formed, firm and compact',
          'Of very close texture',
          'Uniformly white or slightly creamy in colour',
          'Free from any defects. If cauliflowers are "with leaves" or "trimmed" the leaves must have a fresh appearance',
        ],
        tolerance: '5 % by number of Cauliflowers not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Cauliflowers must be of good quality. They must be characteristic of the variety /or commercial type. The flower cluster must be',
        criteria: [
          'Of close texture',
          'White to ivory in colour',
          'Free from defects, such as blemishes, protruding leaves in the head, damage by animal parasites or diseases, traces of frost and bruising',
          'If cauliflowers are "with leaves" or "trimmed" the leaves must have a fresh appearance',
        ],
        tolerance: '10 % by number of Cauliflowers not satisfying the requirements of the grade, but meeting those of Class II.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes cauliflowers which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements. The flower clusters may be',
        criteria: [
          'Slightly deformed',
          'Slightly loose in texture',
          'Yellowish in colour. They may have',
          'Slight traces of sun scorching',
          'An excrescence of not more than five pale green leaves in the head',
        ],
        tolerance: '10 % by number of Cauliflowers not satisfying the requirements of the grade but meeting with the minimum requirements and fit for human consumption.',
      },
    },
  },
  chilli: {
    commodity: 'Chilli',
    agmark: true,
    agmarkPage: 83,
    aliases: ['chilli', 'chillies', 'mirchi'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Chillies must be of superior quality',
        criteria: [
          'They must be well developed and have all the characteristic and colouring typical of the variety',
          'They must be free of defects',
        ],
        tolerance: '5 % by number or weight of chillies not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Chillies must be of good quality',
        criteria: [
          'They must be characteristics of the variety /or commercial type',
          'Slight defects in shape',
          'Slight defects in colouring, including sunspots',
          'Slight skin defects (i.e. scratches, scars, scrapes and blemishes) not exceeding 2 % of the total surface area. The defects must not, in any case, affect the pericarp of the pods',
        ],
        tolerance: '10 % by number or weight of chillies not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'Chillies which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements specified in minimum requirements',
        criteria: [
          'Defects in shape',
          'Defects in colouring, including sunspots',
          'Skin defects (i.e. scratches, scars, scrapes, bruises and blemishes) not exceeding 5% of the total surface area. The defects must not, in any case, affect the pericarp of the pods',
        ],
        tolerance: '10 % by number or weight of chillies not satisfying the requirements of the grade but meeting the minimum requirements.',
      },
    },
  },
  cucumber: {
    commodity: 'Cucumber',
    agmark: true,
    agmarkPage: 156,
    aliases: ['cucumber', 'kakdi'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Cucumbers must be of superior quality',
        criteria: [
          'They must be characteristic of the variety and/or commercial type in shape, external appearance, development and colour',
          'Cucumbers must be uniform in colour',
          'Well developed',
          'Well-shaped and straight (maximum height of the arc: 10 mm per 10 cm of length of the cucumber)',
        ],
        tolerance: '5 % by number or weight of cucumbers not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Cucumbers must be of good quality. They must be characteristics of the variety and/or commercial type. They must be',
        criteria: [
          'Reasonably developed',
          'Reasonably well shaped and straight (maximum height of the arc: 10 mm per 10 cm of the length of cucumber)',
          'A slight deformation, but excluding that caused by seed formation',
          'A slight defect in colour especially the light coloured part of the cucumber where it touched the ground during growth',
          'The defect must not affect the pulp',
        ],
        tolerance: '10 % by number or weight of cucumbers not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'A slight deformation, but excluding that caused by seed',
          'A slight defect in colour especially the light coloured',
        ],
      },
    },
  },
  custardapple: {
    commodity: 'Custard apple',
    agmark: true,
    agmarkPage: 95,
    aliases: ['custard apple', 'sitaphal'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Custard apples must be of superior quality',
        criteria: [
          'They must be well developed and have all the characteristic and colouring typical of the variety',
          'Following slight defects may be there, provided they do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight skin defects (blemishes, scars, sunspots) not exceeding 2 % of the total surface area',
        ],
        tolerance: '5 % by number or weight of Custard apples not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that g',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Custard apples must be of good quality',
        criteria: [
          'They must be well developed and have all the characteristics and colour typical of the variety',
          'Following slight defects may be there, provided they do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight skin defects (blemishes, scars, scrapes, scratches, sunspots) not exceeding 5 % of the total surface area',
          'Slight defects in colour. The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of Custard apples not satisfying the requirements of the grade, but meeting those of Class II or exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Custard apples which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Custard apple may have the following defects, provided they retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape and colour',
          'Small healed surface scars, not likely to impair significantly the appearance or conservation of the fruit',
          'Skin defects (i.e. scratches, scars, scrapes bruises and blemishes) not exceeding 10 % of total surface area. The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of Custard apples not meeting the requirements of the grade, but meeting the minimum requirements. Within this tolerance, not more than 2% in total may con',
      },
    },
  },
  garlic: {
    commodity: 'Garlic',
    agmark: true,
    agmarkPage: 56,
    aliases: ['garlic', 'lasun'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Garlic shall be of superior quality. They shall be characteristic of the variety and /or commercial type. The bulbs shall be',
        criteria: [
          'Regular in shape',
          'Properly cleaned',
          'The cloves must be compact',
          'The roots of dry garlic must be cut off flush with the bulb',
        ],
        tolerance: '5% by weight of Garlic not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Garlic shall be of good quality. They shall be characteristics of the variety and/or commercial type. The bulbs shall be',
        criteria: [
          'Slight tears in the outer skin of the bulb',
          'Cloves must be reasonably compact',
        ],
        tolerance: '10% by weight of Garlic not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'Garlic which do not qualify for inclusion in the higher grade, but satisfy the minimum requirements',
        criteria: [
          'Tears in the outer skin or missing parts of the outer skin of the bulb',
          'Healed injuries',
          'Slight bruises',
          'Irregular shape',
          'Upto three cloves missing',
        ],
        tolerance: '10% by weight of Garlic not satisfying the requirements of the grade but meeting the minimum requirements.',
      },
    },
  },
  gherkin: {
    commodity: 'Gherkin',
    agmark: true,
    agmarkPage: 98,
    aliases: ['gherkin'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Gherkins must be of superior quality. They must be well developed and have all the characteristic and colouring typical of the variety. They must be free of def',
        criteria: [
          'Well developed',
          'Well shaped and practically straight',
        ],
        tolerance: '5 % by number or weight of Gherkins not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade w',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Gherkins must be of good quality',
        criteria: [
          'They must be characteristics of the variety',
          'Following slight defects may be there, provided they do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight deformation',
          'Slight defects in colour',
          'Slight skin defects (i.e. scratches, scars, scrapes and blemishes) not exceeding 2 % of the total surface area; The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of Gherkins not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Gherkins which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Gherkins may have the following defects, provided they retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape and colour',
          'Crooked and nubbed',
          'Slight skin defects (i.e. scratches, scars, scrapes bruises and blemishes) not exceeding 5% of the total surface area. The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of Gherkins not meeting the requirements of the grade, but meeting the minimum requirements. Within this tolerance, not more than 2% in total may consist o',
      },
    },
  },
  grapes: {
    commodity: 'Grapes',
    agmark: true,
    agmarkPage: 9,
    aliases: ['grape', 'grapes'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Grapes must be of superior quality and the bunches must be typical of variety in shape, development and coloring and have no defects',
        criteria: [
          'Berries must be firm, firmly attached to the stalk, evenly spaced along the stalk and have their bloom virtually intact',
        ],
        tolerance: 'As per Table B',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Grapes must be of good quality and the bunches must be typical of variety in shape, development and coloring',
        criteria: [
          'Berries must be firm, firmly attached to the stalk and, as far as possible, have their bloom intact',
          'They may, however, be less evenly spaced along the stalk than in the extra class',
        ],
        tolerance: '- do -',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'The bunches may show defects in shape, development and coloring provided these do not impair the essential characteristics of the variety',
          'The berries must be sufficiently firm and sufficiently attached to the stalk',
          'They may be less evenly spaced along the stalk than Class I grade',
        ],
        tolerance: '- do -',
      },
    },
  },
  guava: {
    commodity: 'Guava',
    agmark: true,
    agmarkPage: 24,
    aliases: ['guava', 'peru'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Guavas must be of superior quality',
        criteria: [
          'They must be characteristic of variety and/or commercial type',
          'They must be free of defects',
          'Very slight superficial defects may be there, provided these do not affect general appearance of the produce, the quality, the keeping quality and presentation in the package',
        ],
        tolerance: '5% by number or weight of guavas not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Guavas must be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'Following slight defects however, may be allowed, provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects in shape and colour',
          'Slight skin defects due to rubbing and other superficial defects such as sunburns, blemishes and scars not exceeding 5% of the total surface area, The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10% by number or weight of guavas not satisfying the requirements of the grade, but meeting those of class II grade or exceptionally, coming within the tolerance of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'This grade includes guavas which do not quality for inclusion in the higher grades, but satisfy the minimum requirements',
          'Following defects may be there, provided the guavas retain their essential characteristics as regards the general appearance, quality, the keeping quality and presentation',
          'Defects in shape and colour',
          'Skin defects due to rubbing and other defects such as sunburns, blemishes and scars not exceeding 10% of the total surface area. The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10% by number or weight of guavas not satisfying the requirements of the grade but meeting the minimum requirements with the exception of produce affected by rotting or any other d',
      },
    },
  },
  lemon: {
    commodity: 'Lemon',
    agmark: true,
    agmarkPage: 118,
    aliases: ['lemon'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Lemons shall be of superior quality',
        criteria: [
          'They shall be characteristic of the variety and/or commercial type in shape, external appearance, development and colouring',
          'Lemons must be uniform in colouring',
        ],
        tolerance: '5 % by number or weight of lemons not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Lemons shall be of good quality',
        criteria: [
          'They shall be characteristic of the variety and/or commercial type',
          'Following slight defects may be there, provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Lemons may have the following defects',
          'Slight defects in shape',
          'Slight defects in colouring',
        ],
        tolerance: '10 % by number or weight of lemons not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes lemons which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Following defects may be there, provided the lemons retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape',
          'Defects in colouring',
          'Skin defects not exceeding 2 sq.cm. The defects shall not, in any case, affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of lemons not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  lime: {
    commodity: 'Lime',
    agmark: true,
    agmarkPage: 115,
    aliases: ['lime', 'limbu'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Limes shall be of superior quality',
        criteria: [
          'They shall be characteristic of the variety and/or commercial type in shape, external appearance, development and coloring',
          'Limes shall be uniform in color and shall have the minimum diameter of 42 mm',
        ],
        tolerance: '5 % by number or weight of limes not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Limes shall be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'Following slight defects may be there, provided the limes retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Slight defects in shape',
          'Slight defects in coloring',
          'Slight skin defects not more than 1 sq.cm. The defects shall not, in any case, affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of limes not satisfying the requirements of the grade, but meeting those of Class II, or exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes limes which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Limes must meet the minimum requirements and minimum maturity requirements',
          'Following defects may be there, provided the limes retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape',
          'Defects in coloring',
          'Skin defects not more than 2 sq.cm',
        ],
        tolerance: '10 % by number or weight of limes not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  litchi: {
    commodity: 'Litchi',
    agmark: true,
    agmarkPage: 12,
    aliases: ['litchi', 'lychee'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Litchis must be of superior quality',
        criteria: [
          'They must have the shape, development and colouring that are typical of the variety and/or varietal type',
        ],
        tolerance: '5% by number or weight of Litchis not satisfying the requirements for the grade, but meeting those of Class I grade or exceptionally coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Litchis must be of good quality',
        criteria: [
          'They must be characteristic of the variety and/or commercial type',
          'Slight defects in shape',
          'Slight defects in colouring',
          'Slight skin defects Provided these do not exceed a total area of 0.25 sq.cm',
        ],
        tolerance: '10% by number or weight of Litchis not satisfying the requirements of the grade, but meeting those of Class II grade or, exceptionally coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'This grade includes Litchis which do not quality for inclusion in the higher grades, but satisfy the minimum requirements specified in general characteristics',
          'Defects in shape',
          'Defects in colouring',
          'Skin blemishes provided these do not exceed a total area of 0.5 sq. cm',
        ],
        tolerance: '10% by number or weight of Litchis not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  mandarin: {
    commodity: 'Mandarin',
    agmark: true,
    agmarkPage: 110,
    aliases: ['mandarin', 'nagpur santra'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Mandarins shall be of superior quality',
        criteria: [
          'They shall be characteristic of the variety and/or commercial type in shape, external appearance, development and colouring',
          'Mandarins must be uniform in colour',
        ],
        tolerance: '5 % by number or weight of Mandarins not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Mandarins shall be of good quality',
        criteria: [
          'They shall be characteristic of the variety and/or commercial type',
          'Following slight defects may be there, provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package.-',
          'Slight defects in shape',
          'Slight defects in colouring',
          'Slight skin defects occurring during the formation of the fruit, such as silver scurf, russets etc',
        ],
        tolerance: '10 % by number or weight of Mandarins not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Mandarins which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Following defects may be there, provided Mandarins retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape',
          'Defects in colouring',
          'Slight skin defects occurring during the formation of the fruit, such as silver scurf, russets etc',
          'Skin healed defects due to mechanical cause such as hail damage, rubbing',
        ],
        tolerance: '10 % by number or weight of Mandarins not satisfying the requirements of the grade, but meeting the minimum requirements. With in this tolerance, a maximum of 5 % may be fruits sho',
      },
    },
  },
  mango: {
    commodity: 'Mango',
    agmark: true,
    agmarkPage: 15,
    aliases: ['mango', 'hapus', 'alphonso'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Mangoes must be of superior quality',
        criteria: [
          'They must be characteristic of the variety',
        ],
        tolerance: '5% by number or weight of mangoes not satisfying the requirements for the grade, but meeting those of Class I or exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Mangoes must be of good quality',
        criteria: [
          'They must be characteristic of the variety',
          'Mangoes may have following slight defects, provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects in shape',
          'Slight skin defects due to rubbing or sunburn, suberized stains due to resin exudation (elongated trails included) and healed bruises not exceeding 2,3,4,5 sq',
          'For size groups A, B, C, D respectively',
        ],
        tolerance: '10% by number or weight of mangoes not satisfying the requirements for the grade, but meeting those of Class II grade or, exceptionally coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes mangoes which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Mangoes may have following defects, provided they retain their essential characteristics as regards the quality, keeping quality and presentation',
          'Defects in shape',
          'Slight skin defects due to rubbing or sunburn, suberized stains due to resin exudation (elongated trails included) and healed bruises not exceeding 4,5,6,7 sq',
          'For size groups A, B, C, D respectively',
        ],
        tolerance: '10% by number or weight of mangoes not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  melon: {
    commodity: 'Melon',
    agmark: true,
    agmarkPage: 71,
    aliases: ['melon', 'kharbuj'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Melons in this class must be of superior quality',
        criteria: [
          'They must be characteristic of the variety /or commercial type',
        ],
        tolerance: '5 % by number or weight of Melons not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Melons in this class must be of good quality',
        criteria: [
          'They must be characteristic of the variety and/or commercial type',
          'A slight defect in shape',
          'A slight defect in colouring (a pale colouring of the rind at the point where the fruit touched the ground while growing is not regarded as a defect)',
          'Slight skin blemishes due to rubbing or handling',
          'Slight healed cracks around the peduncle of less than 2 cm in length that do not reach the pulp',
        ],
        tolerance: '10 % by number or weight of Melons not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This class includes Melons which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape',
          'Defects in colouring (a pale colouring of the rind at the point where the fruit touched the ground while growing is not regarded as a defect)',
          'Slight bruising',
          'Slight cracks or deep scratches',
          'Slight blemishes due to rubbing or',
        ],
        tolerance: '10 % by number or weight of Melons not satisfying the requirements of the grade but meeting with the minimum requirements.',
      },
    },
  },
  okra: {
    commodity: 'Okra',
    agmark: true,
    agmarkPage: 89,
    aliases: ['okra', 'bhendi', 'ladies finger'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Okra must be of superior quality',
        criteria: [
          'They must be characteristic of the variety',
        ],
        tolerance: '5 % by number or weight of Okra not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Okra must be of good quality',
        criteria: [
          'They must be characteristics of the variety',
          'Okra may have following slight defects, provided they do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects in colour',
          'Slight skin defects (scar, blemishes, scratches, bruises, scraps) not to exceed 2 % of the total surface area',
        ],
        tolerance: '10 % by number or weight of Okra not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Okra which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Okra may have following defects, provided they retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in colour',
          'Defects in shape and development; defects in skin(scars, blemishes, scratches, bruises, scraps) not to exceed 5 % of the total surface area',
        ],
        tolerance: '10 % by number or weight of Okra not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  onion: {
    commodity: 'Onion',
    agmark: true,
    agmarkPage: 59,
    aliases: ['onion', 'kanda'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Onion shall be of superior quality. They shall be characteristic of the variety and /or commercial type. The bulbs shall be',
        criteria: [
          'Firm and compact',
          'Unsprouted (free from externally visible shoots)',
          'Properly cleaned',
          'Free from swelling caused by abnormal development',
          'Free of root tufts, however, onions harvested before complete maturity, root tufts are allowed',
        ],
        tolerance: '5% by number or weight of onion not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Onion shall be of good quality. They shall be characteristics of the variety and/or commercial type. The bulbs shall be',
        criteria: [
          'Firm and compact',
          'Unsprouted (free from externally visible shoots)',
          'Free from swelling caused by abnormal development',
          'Free of root tufts, however, onions harvested before complete maturity, root tufts are allowed',
          'A slight defect in shape',
        ],
        tolerance: '10% by number or weight of onion not satisfying the requirements of the grade, but meeting those of Class II grade or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'Onion which do not qualify for inclusion in the higher grade, but satisfy the minimum requirements',
        criteria: [
          'They shall be reasonably firm',
          'Defects in shape',
          'Defects in colouring',
          'Early signs of shoot growth visible from outside (not more than 10% by number or weight per unit of presentation)',
          'Traces of rubbing',
        ],
        tolerance: '10% by number or weight of onion not satisfying the requirements for the grade but meeting the minimum requirements.',
      },
    },
  },
  orange: {
    commodity: 'Orange',
    agmark: true,
    agmarkPage: 105,
    aliases: ['orange', 'santra'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Oranges shall be of superior quality',
        criteria: [
          'They shall be characteristic of the variety and/or commercial type in shape, external appearance, development and colouring',
          'Shall be uniform in colour',
          'Shall have minimum diameter of 70 mm',
        ],
        tolerance: '5 % by number or weight of Oranges not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Oranges shall be of good quality',
        criteria: [
          'They must be characteristic of the variety or commercial type (in shape, external appearance, development and colouring)',
          'Following slight defects may be there, provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects in colouring',
          'Slight defects in shape',
          'Slight skin defects occurring during the formation of the fruit, such as silver scurf, russeting etc',
        ],
        tolerance: '10 % by number or weight of Oranges not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Oranges which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Following defects may be there, provided the Oranges retain their essential characteristics as regards the quality, the keeping quality and presentation in the package',
          'Defects in shape',
          'Defects in colouring',
          'Skin defects occurring during the formation of the fruit, such as silver scruffs, russeting etc',
          'Skin defects, healed defects due to mechanical cause such as hail damage, rubbing, damage from handling',
        ],
        tolerance: '10 % by number or weight of Oranges not satisfying the requirements of the grade, but meeting the minimum requirements. Within this tolerance, a maximum of 5 % may be fruits showin',
      },
    },
  },
  papaya: {
    commodity: 'Papaya',
    agmark: true,
    agmarkPage: 53,
    aliases: ['papaya', 'papai'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Papayas in this class must be of superior quality',
        criteria: [
          'They must be characteristic of the variety and /or commercial type',
        ],
        tolerance: '5% by number or weight of Papayas not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Papayas in this class must be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'A slight defect in shape',
          'Slight skin defects',
          'The total area affected shall not exceed 10% of the total surface',
          'The defects, must not, in any case, affect the pulp of the fruit',
        ],
        tolerance: '10% by number or weight of Papayas not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This class includes papayas which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape',
          'Defects in colouring',
          'Skin defects(i.e. mechanical bruising, sunspots and latex burns). The total area affected should not exceed 15% of the total surface',
          'Slight marks caused by pests. The defects must not affect the pulp of the fruit',
        ],
        tolerance: '10% by number or weight of Papayas not satisfying the requirements of the grade but meeting the minimum requirements.',
      },
    },
  },
  pear: {
    commodity: 'Pear',
    agmark: true,
    agmarkPage: 68,
    aliases: ['pear'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Pears in this class must be of superior quality in shape, size and colouring',
        criteria: [
          'They must be characteristic of the variety and the stalk must be intact',
          'Pears must not be gritty',
        ],
        tolerance: '5 % by number or weight of pears not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Pears must be of good quality in shape, sizing and colouring',
        criteria: [
          'They must be characteristic of the variety / or commercial type',
          'The flesh must be perfectly sound',
          'Slight defect in shape and colour',
          'Slight defect in development',
          'Slight skin defects which must not be extended over more than',
        ],
        tolerance: '10 % by number or weight of pears not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This includes Pears which do not qualify for inclusion in the higher classes, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape and colour',
          'Skin defects in development',
          'Skin defects which must not extend over more than 4 cm in length for defects of elongated shape',
          'Of total surface area for other defects including slightly discoloured bruising with the exception of scab (venturia inaequalis) which must not extend over more than 1sqcm cumulative in area',
        ],
        tolerance: '10 % by number or weight of pears not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  pineapple: {
    commodity: 'Pineapple',
    agmark: true,
    agmarkPage: 21,
    aliases: ['pineapple', 'ananas'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Pineapples must be of superior quality',
        criteria: [
          'They must be characteristic of variety and/or commercial type',
          'They must be free of defects',
          'Very slight superficial defects may be there, provided these do not affect general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'The crown, if present, shall be simple and straight with no sprouts and shall be between 50 and 150% of the length of the fruit with trimmed or untrimmed* crowns',
        ],
        tolerance: '12',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Pineapples must be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'Slight defects in shape',
          'Slight defects in colouring; including sunspots',
          'Slight skin defects',
          'The defects must not, in any case, affect the pulp of the fruit',
        ],
        tolerance: '12',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'Pineapples which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape',
          'Defects in colouring; including sunspots',
          'Skin defects(scratches, scars, bruises and blemishes) not exceeding 8% of the total surface area',
          'The defects must not, in any case, affect the pulp of the fruit. The crown, if present, shall be simple or double and straight or slightly curved, with no sprouts',
        ],
        tolerance: '12',
      },
    },
  },
  plum: {
    commodity: 'Plum',
    agmark: true,
    agmarkPage: 50,
    aliases: ['plum'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Plums shall be of superior quality. They must have the shape, development and colouring typical of the variety. They must be',
        criteria: [
          'Free from defects',
          'Practically covered by bloom, according to the variety',
          'Of firm flesh',
        ],
        tolerance: '5% by number or weight of Plums not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances for that class.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Plums must be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'A slight defect in shape',
          'A slight defect in colouring',
          'A slight defect in development',
          'Skin defects of elongated shape that must not exceed in length one-third of the maximum diameter of the fruit',
        ],
        tolerance: '10% by number or weight of Plums not satisfying the requirements of the grade, but meeting those of Class II grade or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'Plums which do not qualify for inclusion in the higher classes, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape, development and colouring are allowed provided that the plums retain their characteristics',
          'Skin defects not liable to impair the external appearance of the fruits or its keeping quality are allowed provided that they do not exceed 10% of the whole surface',
        ],
        tolerance: '10% by number or weight of Plums not satisfying the requirements for the class but meeting the minimum requirements.',
      },
    },
  },
  pomegranate: {
    commodity: 'Pomegranate',
    agmark: true,
    agmarkPage: 18,
    aliases: ['pomegranate', 'dalimb', 'anar'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Pomegranates must be of superior quality',
        criteria: [
          'They must have the shape, development and colouring that are typical of the variety and/or commercial type',
        ],
        tolerance: '5% by number or weight of pomegranate not satisfying the requirements for the grade, but meeting those of Class I grade or exceptionally coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Pomegranates must be of good quality',
        criteria: [
          'They must be characteristics of the variety and/or commercial type',
          'Slight defects in shape',
          'Slight defects in colouring',
          'Slight skin defects (i.e. scratches, scars, scraps and blemishes) provided these do not exceed 5% of the total surface area',
        ],
        tolerance: '10% by number or weight of Pomegranate not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'This grade includes Pomegranates which do not quality for inclusion in the higher grades, but satisfy the minimum requirements',
          'Following defects may be there provided the Pomegranates retain their essential characteristics as regards the quality, the keeping quality and presentation',
          'Defects in shape',
          'Defects in colouring',
          'Skin defects(scratches, scars, scrapes and blemishes) provided these do not exceed 10% of total surface area',
        ],
        tolerance: '10% by number or weight of Pomegranates not satisfying the requirements of the grade, but meeting the minimum requirements.',
      },
    },
  },
  potato: {
    commodity: 'Potato',
    agmark: true,
    agmarkPage: 125,
    aliases: ['potato', 'batata'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Ware Potatoes shall be of superior quality',
        criteria: [
          'They must be well developed and have all the characteristics and colouring typical of the variety',
          'These shall be free from defects including bruises, cuts russet scab, rhizoctonia, green colorations and practically free from soil',
        ],
        tolerance: '5 % by number or weight of WarePotatoes not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that gra',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Ware Potatoes shall be of good quality',
        criteria: [
          'They must be characteristics of the variety',
          'Following defects may be there, provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects in shape and colour',
          'Slight skin defects',
          'They shall be free from green colour',
        ],
        tolerance: '10 % by number or weight of Ware Potatoes not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Ware Potatoes which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Following defects may be there, provided the Ware Potatoes retain their essential characteristics as regards the general appearance, quality, the keeping quality and presentation',
          'Defects in shape and colour',
          'Skin defects',
          'The soil and extraneous matter shall not exceed 0.5%',
          'Greening should not be on more than 1% by number and should not cover more than12.5 % of the surface area The defects shall not affect the pulp of fruit',
        ],
        tolerance: '10 % by number or weight of Ware Potatoes not meeting the requirements of the grade but meeting the minimum requirements.',
      },
    },
  },
  sapota: {
    commodity: 'Sapota',
    agmark: true,
    agmarkPage: 92,
    aliases: ['sapota', 'chikoo'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Sapota must be of superior quality',
        criteria: [
          'They must be well developed and have all the characteristics and colouring typical of the variety',
          'They must be free of defects',
        ],
        tolerance: '5 % by number or weight of Sapota not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Sapota must be of good quality',
        criteria: [
          'They must be characteristics of the variety',
          'Following defects may be there, provided they do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects in shape and colour',
          'Slight skin defects (i.e. scratches, scars, scrapes and blemishes) not exceeding 2% of the total surface area. The defects should not affect the pulp of fruit',
        ],
        tolerance: '10 % by number or weight of Sapota not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes Sapota which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Following defects may be there, provided the Sapota retain their essential characteristics as regards the general appearance, quality, the keeping quality and presentation',
          'Defects in shape and colour',
          'Skin defects (i.e. scratches, scars, scrapes bruises and blemishes) not exceeding 5% of the total surface area. The defects should not affect the pulp of fruit',
        ],
        tolerance: '10 % by number or weight of Sapota not meeting the requirements of the grade but meeting the minimum requirements.',
      },
    },
  },
  spinach: {
    commodity: 'Spinach',
    agmark: true,
    agmarkPage: 35,
    aliases: ['spinach', 'palak'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Spinach shall be of good quality. It may be in leaf or in heads. The leaves shall be',
        criteria: [
          'Normal in colour and appearance for the variety and time of harvest',
          'Free from damage by frost, animal parasites or diseases impairing appearance or edibility. In the case of leaf spinach, the leaf stem must not exceed 10 cm. in length',
        ],
        tolerance: 'Not require d',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Spinach shall be of good quality. The leaves shall be',
        criteria: [
          'Normal in colour and appearance for the variety and time of harvest',
          'Free from damage caused by frost, animal parasites or diseases impairing appearance or edibility. In the case of leaf spinach, the leaf stem must not exceed 10 cm. in length',
        ],
        tolerance: 'Not require d',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'Leaf spinach may have slight defects in colour and slight defects caused by frost',
        ],
        tolerance: 'Not require d',
      },
    },
  },
  spongegourd: {
    commodity: 'Sponge gourd',
    agmark: true,
    agmarkPage: 152,
    aliases: ['sponge gourd', 'ghosala'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Sponge gourd must be of superior quality',
        criteria: [
          'They must be characteristic of the variety or commercial type in shape, external appearance, development and colour',
          'Sponge gourd must be uniform in colour',
          'Well trimmed with neatly cut stem (Peduncle up to 5 cm)',
          'Well developed',
          'Well shaped and practically straight (maximum height of the arc: 10 mm per 20 cm of length of the sponge gourd)',
        ],
        tolerance: '5 % by number or weight of sponge gourd not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that gra',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'AGMARK Class I',
        criteria: [
          'Well developed; tolerances of that',
          'Free of defects including all deformations and particularly those',
          'I Sponge gourd must be of good quality. They must be characteristics of 10 % by number',
        ],
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'Slight deformation',
          'Slight defect in colour, slight pale especially the light coloured',
          'Slight skin blemishes due to rubbing and handling or',
          'Low temperatures not to exceed 5 percent of the total surface',
          'The defect must not affect the flesh',
        ],
      },
    },
  },
  strawberry: {
    commodity: 'Strawberry',
    agmark: true,
    agmarkPage: 62,
    aliases: ['strawberry'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Strawberries must be of superior quality',
        criteria: [
          'In colouring and shape, they must be typical of the variety and they must be uniform and regular with respect to degree of ripeness, colour and size',
          'They must be bright in appearance and must be free from soil',
        ],
        tolerance: '5 % by number or weight of strawberries not satisfying the requirements of the grade, but meeting those of Class I grade or, exceptionally, coming within the tolerances of that gra',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Strawberries must be of good quality',
        criteria: [
          'They must be characteristic of the variety /or commercial type',
          'Following slight defects may be allowed , provided they do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
          'Slight defects of shape',
          'Presence of a small white patch not exceeding 1/10th of the surface area of the fruit',
          'They may be less uniform in size They must be free from soil',
        ],
        tolerance: '10 % by number or weight of strawberries not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This grade includes strawberries which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Following defects may be allowed, provided the strawberries retain their essential characteristics as regards the general appearance, quality, the keeping quality and presentation in the package',
          'Defects of shape',
          'A white patch not exceeding 1/5th of the surface area of the fruit',
          'Slight bruising not likely to spread',
          'Slight traces of soil. The defects should not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of strawberries not satisfying the requirements of the grade but meeting the minimum requirements.',
      },
    },
  },
  tomato: {
    commodity: 'Tomato',
    agmark: true,
    agmarkPage: 43,
    aliases: ['tomato'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Tomatoes shall be of superior quality',
        criteria: [
          'They shall have firm fresh and must be characteristics of the variety as regards shape, appearance and development',
          'They must be free of green backs and other defects',
          'Very slight superficial defects may be there provided these do not affect the general appearance of the produce, the quality, the keeping quality and presentation in the package',
        ],
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Tomatoes shall be of good quality',
        criteria: [
          'They shall have reasonably firm flesh and shall be characteristics of the variety as regards shape, appearance and development',
          'They must be free of cracks and visible green back',
          'A slight defect in shape and development; a slight defect in colouring',
          'Slight skin defects',
          'Very slight bruises; ”Ribbed” tomatoes may show',
        ],
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'AGMARK Class Ii',
        criteria: [
          'A slight defect in shape and development; a',
          'Slight skin defects',
          'Healed cracks not more than 1 cm. long',
          'No excessive protuberances',
          'Small non lignified unbilical scars',
        ],
      },
    },
  },
  watermelon: {
    commodity: 'Watermelon',
    agmark: true,
    agmarkPage: 74,
    aliases: ['watermelon', 'kalingad'],
    grades: {
      A: {
        agmarkClass: 'Extra Class',
        summary: 'Watermelons in this class must be of superior quality',
        criteria: [
          'They must be characteristic of the variety /or commercial type',
        ],
        tolerance: '5 % by number or weight of Watermelons not satisfying the requirements of the grade, but meeting those of Class I or, exceptionally, coming within the tolerances of that grade.',
      },
      B: {
        agmarkClass: 'Class I',
        summary: 'Watermelons in this class must be of good quality. They must be characteristic of the variety and/or commercial type. They must be',
        criteria: [
          'Well formed',
          'Free of cracks and bruises',
          'A slight defect in shape',
          'A slight defect in colouring for the paler part of which has been in contact with the ground during the period of growth',
          'The stem must not exceed 5 cm. in length. The defects must not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of Watermelons not satisfying the requirements of the grade, but meeting those of Class II or, exceptionally, coming within the tolerances of that grade.',
      },
      C: {
        agmarkClass: 'Class II',
        summary: 'This class includes watermelons which do not qualify for inclusion in the higher grades, but satisfy the minimum requirements',
        criteria: [
          'Defects in shape',
          'Defects in colouring of the rind',
          'Slight bruising',
          'The defects must not affect the pulp of the fruit',
        ],
        tolerance: '10 % by number or weight of Watermelons not satisfying the requirements of the grade but meeting with the minimum requirements.',
      },
    },
  },

  // ── FOOD GRAINS & OILSEEDS, FROM THEIR OWN GAZETTE NOTIFICATIONS ──────
  // Not AGMARK Volume V (that book is fruit and veg only) — each commodity
  // below is grading under its OWN Grading and Marking Rules notification,
  // sourced from backend/data/sources_agmark/. Same table-extraction
  // discipline as Vol. V: pdfplumber, not pypdf/flat text, and the scanned
  // Soyabean PDF was OCR'd (tesseract) because it has no text layer at all.
  // See sources_agmark/README.md for what was extracted from where, and
  // what was looked at and rejected.
  //
  // These pulses/millets/soyabean notifications grade in THREE tiers named
  // "Special / Standard / General" rather than Vol. V's "Extra Class /
  // Class I / Class II" — mapped the same way: Special=A, Standard=B,
  // General=C. `agmarkClass` carries whichever the source document uses.
  wheat: {
    commodity: 'Wheat',
    agmark: true,
    agmarkSchedule: 'Cereals Grading Rules, 1966, Schedule XV (Wheat) — still the'
      + ' current grade table: the Cereals Grading and Marking Rules, 2000/2001 that'
      + ' superseded the 1966 rules apply only to Ragi, Jowar, Maize, Barley and'
      + ' Bajra (see rule 1(ii) of that notification), so Wheat was never re-notified'
      + ' and DMI’s own standards list (dmi.gov.in) still carries "Cereals, 1966"'
      + ' alongside "Cereals, 2000" rather than showing it as replaced. The 1966'
      + ' table has FOUR grades (I–IV); Grade IV (the lowest, sound-merchantable'
      + ' floor) is omitted here since this app only has three grade slots.',
    aliases: ['wheat', 'gahu'],
    grades: {
      A: {
        agmarkClass: 'Grade I',
        summary: 'Wheat Grade I — dry, clean, minimal admixture',
        criteria: [
          'Foreign matter up to 1.5% by weight',
          'Other food grains up to 1.6% by weight',
          'Other wheats (off-type/off-colour) up to 5.0% by weight',
          'Damaged grains up to 1.0%, slightly damaged up to 2.0%',
          'Immature/shrivelled grains up to 2.0%, broken grains up to 1.0%',
          'Moisture not exceeding 12%',
        ],
      },
      B: {
        agmarkClass: 'Grade II',
        summary: 'Wheat Grade II — sound, moderate admixture',
        criteria: [
          'Foreign matter up to 2.5% by weight',
          'Other food grains up to 3.0% by weight',
          'Other wheats up to 15.0% by weight',
          'Damaged grains up to 2.0%, slightly damaged up to 4.0%',
          'Immature/shrivelled grains up to 4.0%, broken grains up to 3.0%',
          'Moisture not exceeding 12%',
        ],
      },
      C: {
        agmarkClass: 'Grade III',
        summary: 'Wheat Grade III — visible admixture, still merchantable',
        criteria: [
          'Foreign matter up to 3.5% by weight',
          'Other food grains up to 6.0% by weight',
          'Other wheats up to 20.0% by weight',
          'Damaged grains up to 4.0%, slightly damaged up to 6.0%',
          'Immature/shrivelled grains up to 10.0%, broken grains up to 6.0%',
          'Moisture not exceeding 12%',
        ],
        tolerance: 'Below Grade III (the source’s Grade IV) is not carried in this'
          + ' app — it is the sound-merchantable floor, not a marketable grade tier.',
      },
    },
  },
  soyabean: {
    commodity: 'Soyabean',
    agmark: true,
    agmarkSchedule: 'Soyabean Grading and Marking Rules, 2012 (G.S.R. 41(E), dated'
      + ' 24 January 2012), Schedule II — OCR’d from a scanned gazette copy'
      + ' (tesseract, 300dpi grayscale); numbers cross-checked against a cropped'
      + ' zoom of the table image, see sources_agmark/README.md.',
    aliases: ['soyabean', 'soybean'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Soyabean Special — clean, low moisture, high oil',
        criteria: [
          'Extraneous matter: organic up to 0.10%, inorganic up to 0.10%',
          'Split or cracked seed up to 2.0%',
          'Immature, shrivelled and green seed up to 2.0%',
          'Damaged and weevilled seed: nil',
          'Other edible seeds: nil',
          'Moisture not exceeding 7.0%',
          'Oil content at least 20.0% on dry basis',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Soyabean Standard — sound, moderate admixture',
        criteria: [
          'Extraneous matter: organic up to 0.50%, inorganic up to 0.25%',
          'Split or cracked seed up to 3.0%',
          'Immature, shrivelled and green seed up to 3.0%',
          'Damaged and weevilled seed up to 0.5%',
          'Other edible seeds up to 0.5%',
          'Moisture not exceeding 9.0%',
          'Oil content at least 18.0% on dry basis',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Soyabean General — visible damage, still saleable',
        criteria: [
          'Extraneous matter: organic up to 0.75%, inorganic up to 0.25%',
          'Split or cracked seed up to 4.0%',
          'Immature, shrivelled and green seed up to 7.0%',
          'Damaged and weevilled seed up to 2.0%',
          'Other edible seeds up to 1.0%',
          'Moisture not exceeding 12.0%',
          'Oil content at least 15.0% on dry basis',
        ],
        tolerance: 'The total of extraneous matter, split/cracked, immature/shrivelled'
          + '/green, damaged/weevilled and other edible seed shall not exceed 11% in'
          + ' General grade.',
      },
    },
  },
  tur: {
    commodity: 'Tur (Pigeon Pea)',
    agmark: true,
    agmarkSchedule: 'Pulses Grading and Marking Rules, 2019, Schedule X (Arhar or'
      + ' Tur / Red gram, whole).',
    aliases: ['tur', 'arhar', 'pigeon pea', 'red gram', 'tur dal'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Tur Special — sweet, sound, clean',
        criteria: [
          'Moisture not exceeding 11.0%',
          'Foreign matter: organic up to 0.10%, inorganic up to 0.05%',
          'Other edible grains up to 0.2%',
          'Damaged grains up to 0.5%',
          'Weevilled grains up to 1.0% by count',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Tur Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Foreign matter: organic up to 0.30%, inorganic up to 0.15%',
          'Other edible grains up to 0.5%',
          'Damaged grains up to 1.50%',
          'Weevilled grains up to 3.0% by count',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Tur General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 16.0%',
          'Foreign matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 6.0%',
          'Damaged grains up to 5.0%',
          'Weevilled grains up to 10.0% by count',
        ],
        tolerance: 'The total of foreign matter, other edible grains and damaged'
          + ' grains shall not exceed 12% by weight in General grade.',
      },
    },
  },
  gram: {
    commodity: 'Gram (Harbhara)',
    agmark: true,
    agmarkSchedule: 'Pulses Grading and Marking Rules, 2019, Schedule XIII (Chana'
      + ' whole / Bengal gram). The Kabuli chana schedule (XII, bolder/lighter'
      + ' seed) sits right before it in the same document and is not the one'
      + ' used here — Maharashtra’s harbhara crop is desi/Bengal gram.',
    aliases: ['gram', 'chana', 'harbhara', 'bengal gram'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Gram Special — sweet, sound, clean',
        criteria: [
          'Moisture not exceeding 11.0%',
          'Foreign matter: organic up to 0.10%, inorganic up to 0.05%',
          'Other edible grains up to 0.2%',
          'Damaged grains up to 0.5%',
          'Weevilled grains up to 1.0% by count',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Gram Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Foreign matter: organic up to 0.10%, inorganic up to 0.10%',
          'Other edible grains up to 0.5%',
          'Damaged grains up to 1.0%',
          'Weevilled grains up to 3.0% by count',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Gram General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 16.0%',
          'Foreign matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 4.0%',
          'Damaged grains up to 5.0%',
          'Weevilled grains up to 10.0% by count',
        ],
        tolerance: 'The total of foreign matter, other edible grains and damaged'
          + ' grains shall not exceed 9% by weight in General grade.',
      },
    },
  },
  greenGram: {
    commodity: 'Green Gram (Moong)',
    agmark: true,
    agmarkSchedule: 'Pulses Grading and Marking Rules, 2019, Schedule V (Moong'
      + ' whole / Green gram).',
    aliases: ['green gram', 'moong', 'moong whole', 'green gram (moong)'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Green Gram Special — sweet, sound, clean',
        criteria: [
          'Moisture not exceeding 11.0%',
          'Foreign matter: organic up to 0.10%, inorganic up to 0.05%',
          'Other edible grains up to 0.2%',
          'Damaged grains up to 0.5%',
          'Broken and fragments grains up to 1.0%',
          'Weevilled grains absent',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Green Gram Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Foreign matter: organic up to 0.30%, inorganic up to 0.10%',
          'Other edible grains up to 0.5%',
          'Damaged grains up to 2.0%',
          'Broken and fragments grains up to 2.0%',
          'Weevilled grains up to 2.0% by count',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Green Gram General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 14.0%',
          'Foreign matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 4.0%',
          'Damaged grains up to 5.0%',
          'Broken and fragments grains up to 3.0%',
          'Weevilled grains up to 3.0% by count',
        ],
      },
    },
  },
  blackGram: {
    commodity: 'Black Gram (Udid)',
    agmark: true,
    agmarkSchedule: 'Pulses Grading and Marking Rules, 2019, Schedule II (Urd'
      + ' whole / Black gram).',
    aliases: ['black gram', 'urd', 'udid', 'urad', 'urd whole', 'black gram (udid)'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Black Gram Special — sweet, sound, clean',
        criteria: [
          'Moisture not exceeding 11.0%',
          'Foreign matter: organic up to 0.10%, inorganic up to 0.05%',
          'Other edible grains up to 0.2%',
          'Damaged grains up to 0.5%',
          'Weevilled grains absent',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Black Gram Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Foreign matter: organic up to 0.30%, inorganic up to 0.10%',
          'Other edible grains up to 0.5%',
          'Damaged grains up to 2.0%',
          'Weevilled grains up to 3.0% by count',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Black Gram General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 14.0%',
          'Foreign matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 4.0%',
          'Damaged grains up to 5.0%',
          'Weevilled grains up to 6.0% by count',
        ],
      },
    },
  },
  jowar: {
    commodity: 'Jowar (Sorghum)',
    agmark: true,
    agmarkSchedule: 'Millets Grading and Marking Rules, 2024, Schedule II (Sorghum)'
      + ' — the newest notification, supersedes the Jowar schedules of the older'
      + ' Cereals Grading and Marking Rules, 2000/2001 for this crop.',
    aliases: ['jowar', 'sorghum', 'jwari'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Jowar Special — dry, clean, minimal admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Extraneous matter: organic up to 0.15%, inorganic up to 0.10%',
          'Other edible grains up to 1.0%',
          'Damaged and shrivelled grains up to 0.25%',
          'Immature grains with serious defects up to 3.0%, with slight defects up to 2.0%',
          'Weevilled grains up to 1.0% by count',
          'Uric acid up to 100 mg/kg, total aflatoxin up to 15 µg/kg',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Jowar Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.50%, inorganic up to 0.25%',
          'Other edible grains up to 1.5%',
          'Damaged and shrivelled grains up to 0.5%',
          'Immature grains with serious defects up to 5.0%, with slight defects up to 3.0%',
          'Weevilled grains up to 2.0% by count',
          'Uric acid up to 100 mg/kg, total aflatoxin up to 15 µg/kg',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Jowar General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 2.0%',
          'Damaged and shrivelled grains up to 1.0%',
          'Immature grains with serious defects up to 7.0%, with slight defects up to 5.0%',
          'Weevilled grains up to 4.0% by count',
          'Uric acid up to 100 mg/kg, total aflatoxin up to 15 µg/kg',
        ],
        tolerance: 'In extraneous matter, impurities of animal origin shall not'
          + ' exceed 0.10% by weight.',
      },
    },
  },
  bajra: {
    commodity: 'Bajra (Pearl Millet)',
    agmark: true,
    agmarkSchedule: 'Millets Grading and Marking Rules, 2024, Schedule III (Pearl'
      + ' millet) — same tolerance table as Sorghum (Schedule II) and Finger'
      + ' millet (Schedule IV) in this notification.',
    aliases: ['bajra', 'pearl millet', 'bajri'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Bajra Special — dry, clean, minimal admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Extraneous matter: organic up to 0.15%, inorganic up to 0.10%',
          'Other edible grains up to 1.0%',
          'Damaged and shrivelled grains up to 0.25%',
          'Immature grains with serious defects up to 3.0%, with slight defects up to 2.0%',
          'Weevilled grains up to 1.0% by count',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Bajra Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.50%, inorganic up to 0.25%',
          'Other edible grains up to 1.5%',
          'Damaged and shrivelled grains up to 0.5%',
          'Immature grains with serious defects up to 5.0%, with slight defects up to 3.0%',
          'Weevilled grains up to 2.0% by count',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Bajra General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 2.0%',
          'Damaged and shrivelled grains up to 1.0%',
          'Immature grains with serious defects up to 7.0%, with slight defects up to 5.0%',
          'Weevilled grains up to 4.0% by count',
        ],
        tolerance: 'In extraneous matter, impurities of animal origin shall not'
          + ' exceed 0.10% by weight.',
      },
    },
  },
  ragi: {
    commodity: 'Ragi (Nachani)',
    agmark: true,
    agmarkSchedule: 'Millets Grading and Marking Rules, 2024, Schedule IV (Finger'
      + ' millet) — same tolerance table as Sorghum and Pearl millet in this'
      + ' notification.',
    aliases: ['ragi', 'nachani', 'finger millet'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Ragi Special — dry, clean, minimal admixture',
        criteria: [
          'Moisture not exceeding 12.0%',
          'Extraneous matter: organic up to 0.15%, inorganic up to 0.10%',
          'Other edible grains up to 1.0%',
          'Damaged and shrivelled grains up to 0.25%',
          'Immature grains with serious defects up to 3.0%, with slight defects up to 2.0%',
          'Weevilled grains up to 1.0% by count',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Ragi Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.50%, inorganic up to 0.25%',
          'Other edible grains up to 1.5%',
          'Damaged and shrivelled grains up to 0.5%',
          'Immature grains with serious defects up to 5.0%, with slight defects up to 3.0%',
          'Weevilled grains up to 2.0% by count',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'Ragi General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 2.0%',
          'Damaged and shrivelled grains up to 1.0%',
          'Immature grains with serious defects up to 7.0%, with slight defects up to 5.0%',
          'Weevilled grains up to 4.0% by count',
        ],
        tolerance: 'In extraneous matter, impurities of animal origin shall not'
          + ' exceed 0.10% by weight.',
      },
    },
  },
  maize: {
    commodity: 'Maize',
    agmark: true,
    agmarkSchedule: 'Cereals Grading and Marking Rules, 2000/2001, Schedule V'
      + ' (Maize) — this notification’s scope (rule 1(ii)) does cover Maize,'
      + ' unlike Wheat. Source has FOUR grades (I–IV); Grade IV omitted for the'
      + ' same reason as Wheat above.',
    aliases: ['maize', 'makka', 'corn'],
    grades: {
      A: {
        agmarkClass: 'Grade I',
        summary: 'Maize Grade I — dry, clean, minimal admixture',
        criteria: [
          'Moisture not exceeding 12.00%',
          'Foreign matter: organic up to 0.10%, inorganic: nil',
          'Other edible grains up to 0.50%',
          'Admixture of different varieties up to 5.00%',
          'Damaged grains up to 1.00%',
          'Immature/shrivelled grains up to 2.0%, weevilled grains up to 2.0% by count',
        ],
      },
      B: {
        agmarkClass: 'Grade II',
        summary: 'Maize Grade II — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 12.00%',
          'Foreign matter: organic up to 0.25%, inorganic up to 0.1%',
          'Other edible grains up to 1.00%',
          'Admixture of different varieties up to 10.00%',
          'Damaged grains up to 2.00%',
          'Immature/shrivelled grains up to 4.0%, weevilled grains up to 4.0% by count',
        ],
      },
      C: {
        agmarkClass: 'Grade III',
        summary: 'Maize Grade III — visible admixture, still merchantable',
        criteria: [
          'Moisture not exceeding 14.00%',
          'Foreign matter: organic up to 0.50%, inorganic up to 0.25%',
          'Other edible grains up to 2.00%',
          'Admixture of different varieties up to 15.00%',
          'Damaged grains up to 3.00%',
          'Immature/shrivelled grains up to 6.0%, weevilled grains up to 6.0% by count',
        ],
        tolerance: 'Below Grade III (the source’s Grade IV) is not carried in this'
          + ' app — it is the sound-merchantable floor, not a marketable grade tier.',
      },
    },
  },
  safflower: {
    commodity: 'Safflower (Karadi)',
    agmark: true,
    agmarkSchedule: 'Safflower Seeds (Grading and Marking) Rules, 1982, Schedule I'
      + ' — confirmed botanically correct (Carthamus tinctorius Linn, stated'
      + ' explicitly in the rule text), replacing an earlier placeholder that'
      + ' had used the Kusum Seed rules (Schleichera oleosa, a different tree'
      + ' oilseed) for lack of a better source at the time. The 1982 rules'
      + ' define only ONE quality tier — there is no official AGMARK B/C'
      + ' standard for safflower seed, unlike the three-tier schedules used'
      + ' elsewhere in this file. B and C below are NOT downgraded AGMARK'
      + ' tiers; they say so.',
    aliases: ['safflower', 'karadi'],
    grades: {
      A: {
        agmarkClass: 'AGMARK Schedule I (the only tier this rule defines)',
        summary: 'Meets the single published AGMARK standard',
        criteria: [
          'Moisture not exceeding 11.0%',
          'Foreign matter up to 1.0%',
          'Damaged and weevilled seed up to 3.0%',
          'Slightly damaged seed up to 6.0%',
          'Immature, shrivelled and dead seed up to 6.0%',
        ],
      },
      B: {
        agmarkClass: null,
        summary: 'Below the AGMARK standard — no official AGMARK grade exists here',
        criteria: [
          'Does not meet one or more of the AGMARK Schedule I limits above',
          'No published AGMARK B-tier exists for safflower seed — this is a'
            + ' self-declared "does not meet Schedule I" band, not an official grade',
        ],
      },
      C: {
        agmarkClass: null,
        summary: 'Visibly damaged — still saleable, self-declared only',
        criteria: [
          'Visible damage, high moisture, or heavy admixture',
          'No published AGMARK C-tier exists for safflower seed — this is a'
            + ' self-declared band, not an official grade',
        ],
      },
    },
  },

  groundnut: {
    commodity: 'Groundnut',
    agmark: true,
    agmarkSchedule: 'Hand Picked Selected Groundnuts (Grading and Marking)'
      + ' Rules, 1982, Schedule II (pods, "Peanuts" variety). Maharashtra'
      + ' grows mostly bold-seeded ("Bold/Coromandel") groundnut, covered by'
      + ' this same rule\'s Schedule I — but Schedule I\'s General-grade row'
      + ' is truncated/unreadable in the source PDF (only 2 of its 4 values'
      + ' render, even with word-position extraction and a zoomed re-read of'
      + ' the page image). Schedule II (Peanuts variety) is used instead'
      + ' because every value in it is complete and real, not because it is'
      + ' the closer botanical match — flagged rather than silently guessing'
      + ' the missing Schedule I cells. This rule grades PODS, not shelled'
      + ' kernels (Schedules IV–VI cover kernels, for the export/processing'
      + ' trade, and are not used here since farmers sell pods).',
    aliases: ['groundnut', 'peanut', 'moongphali', 'bhuimug'],
    grades: {
      A: {
        agmarkClass: 'Special',
        summary: 'Special — clean pods, high shelling percentage',
        criteria: [
          'Moisture not exceeding 8.0%',
          'Extraneous matter up to 0.5%',
          'Immature and shrivelled pods up to 2.0%',
          'Damaged and discoloured pods up to 0.5%',
          'Pods of other varieties up to 1.0%',
          'Shelling percentage at least 72%',
        ],
      },
      B: {
        agmarkClass: 'Standard',
        summary: 'Standard — sound, moderate admixture',
        criteria: [
          'Moisture not exceeding 8.0%',
          'Extraneous matter up to 1.0%',
          'Immature and shrivelled pods up to 3.0%',
          'Damaged and discoloured pods up to 1.0%',
          'Pods of other varieties up to 2.0%',
          'Shelling percentage at least 69%',
        ],
      },
      C: {
        agmarkClass: 'General',
        summary: 'General — visible damage, still saleable',
        criteria: [
          'Moisture not exceeding 8.0%',
          'Extraneous matter up to 2.0%',
          'Immature and shrivelled pods up to 4.0%',
          'Damaged and discoloured pods up to 2.0%',
          'Pods of other varieties up to 4.0%',
          'Shelling percentage at least 66%',
        ],
      },
    },
  },

  paddy: {
    commodity: 'Rice (Paddy)',
    agmark: false,
    agmarkSchedule: '⚠️ NOT AN AGMARK SCHEDULE. Estimated by analogy to related'
      + ' AGMARK cereal schedules (Jowar/Bajra/Maize in this same file) — no'
      + ' usable current AGMARK Paddy grading notification exists (see'
      + ' sources_agmark/README.md). Treat as indicative, not certified.',
    // ⚠️ BY ANALOGY, NOT TRANSCRIBED. Every other spec in this file quotes
    // real numbers from a real gazette schedule. This one does not — no
    // usable current AGMARK Paddy notification exists (see
    // sources_agmark/README.md: the only text India Code itself serves as
    // the current Rice Grading and Marking Rules is the 1939 version, which
    // grades obsolete named varieties like "Dehra Dun Basmati" tied to
    // defunct pre-independence districts, not a general modern Paddy
    // standard). Millets Grading and Marking Rules, 2024 — the newest
    // cereal-grading notification this app has, used for Jowar/Bajra/Ragi —
    // does NOT cover rice at all (checked: its 10 schedules are Sorghum,
    // Pearl millet, Finger millet, Foxtail millet, Kodo millet, Little
    // millet, Browntop millet, Barnyard millet, Proso millet, Amaranthus
    // seed, Buckwheat).
    // The bands below are INTERPOLATED from this file's own Jowar/Bajra/
    // Maize schedules (same tolerance magnitudes for extraneous matter,
    // other edible grains, damaged grain, weevilled grain — real AGMARK
    // cereal schedules, just not rice-specific), with the moisture ceiling
    // raised half a point above them (13/14/15% vs their 12/13/13%) because
    // raw unmilled paddy is conventionally accepted at a higher safe-storage
    // moisture than a milled or threshed grain — a defensible agronomic
    // judgement call, not a transcribed figure. `agmark: false` and
    // `disclaimer` below both say this is not an official AGMARK grade —
    // never rendered as one on any screen.
    aliases: ['rice', 'paddy', 'rice (paddy)', 'bhat'],
    grades: {
      A: {
        agmarkClass: null,
        summary: 'Dry, clean, minimal admixture (ESTIMATED — not an official AGMARK figure, see agmarkSchedule)',
        criteria: [
          'Moisture not exceeding 13.0%',
          'Extraneous matter: organic up to 0.15%, inorganic up to 0.10%',
          'Other edible grains up to 1.0%',
          'Damaged and discoloured grains up to 0.5%',
          'Weevilled grains up to 1.0% by count',
        ],
      },
      B: {
        agmarkClass: null,
        summary: 'Sound, moderate admixture (ESTIMATED — not an official AGMARK figure, see agmarkSchedule)',
        criteria: [
          'Moisture not exceeding 14.0%',
          'Extraneous matter: organic up to 0.50%, inorganic up to 0.25%',
          'Other edible grains up to 1.5%',
          'Damaged and discoloured grains up to 1.5%',
          'Weevilled grains up to 2.0% by count',
        ],
      },
      C: {
        agmarkClass: null,
        summary: 'Visible damage, still saleable (ESTIMATED — not an official AGMARK figure, see agmarkSchedule)',
        criteria: [
          'Moisture not exceeding 15.0%',
          'Extraneous matter: organic up to 0.75%, inorganic up to 0.25%',
          'Other edible grains up to 2.0%',
          'Damaged and discoloured grains up to 3.0%',
          'Weevilled grains up to 4.0% by count',
        ],
      },
    },
  },

  // ── STILL NO REAL PER-COMMODITY DATA ──────────────────────────────────
  // Sunflower and Sesamum/Linseed stay on this hand-written fallback —
  // graded under DMI's other oilseed rules, which were not among the
  // downloaded PDFs. "Oil seed.pdf" and "Englishvegoils.pdf"/
  // "MSEOGMRules.pdf" in sources_agmark/ turned out to be a Marathi
  // cultivation guide and processed/refined-oil rules respectively, not
  // raw-seed grading. See sources_agmark/README.md.
  grain: {
    commodity: 'Grain, pulses and oilseeds',
    headline: 'Moisture and admixture',
    appliesTo: ['Sunflower', 'Sesamum (Til)', 'Linseed (Jawas)'],
    grades: {
      A: {
        summary: 'Dry, clean, well-filled',
        criteria: [
          'Properly dried — no dampness in the hand',
          'Little or no foreign matter (stones, chaff, weed seed)',
          'Grain well filled and even',
          'No insect damage, no musty smell',
        ],
      },
      B: {
        summary: 'Sound, light admixture',
        criteria: [
          'Dry, may need a short further drying',
          'Small amount of foreign matter',
          'Some shrivelled or broken grain',
        ],
      },
      C: {
        summary: 'Damp, mixed or damaged',
        criteria: [
          'Noticeably damp, or drying incomplete',
          'Visible foreign matter',
          'Broken, shrivelled or insect-damaged grain present',
        ],
      },
    },
  },
  cotton: {
    commodity: 'Cotton',
    headline: 'Staple and trash',
    grades: {
      A: {
        summary: 'Clean, well-picked, bright',
        criteria: [
          'Bright white to creamy colour',
          'Little trash — leaf, bract or soil',
          'Even staple length',
          'Dry, no damp bales',
        ],
      },
      B: {
        summary: 'Sound, some trash',
        criteria: ['Slight discolouration acceptable', 'Some leaf and trash present', 'Reasonably even staple'],
      },
      C: {
        summary: 'Stained or trashy',
        criteria: ['Visible staining or yellowing', 'Noticeable trash content', 'Uneven staple; damp or weather-affected'],
      },
    },
  },

  // Hand-written fallback for anything AGMARK Vol. V does not cover —
  // field crops (wheat, soyabean, cotton, tur) live in other AGMARK volumes
  // we do not have yet, so they land here and are labelled generic.
  general: {
    commodity: 'General produce',
    headline: 'Overall condition',
    generic: true,
    grades: {
      A: {
        summary: 'Best of the harvest',
        criteria: ['Even size and colour', 'Firm and fresh', 'No visible damage, pest marks or disease'],
      },
      B: {
        summary: 'Good, ordinary market quality',
        criteria: ['Some variation in size or colour', 'Sound condition', 'Minor blemishes'],
      },
      C: {
        summary: 'Mixed or marked',
        criteria: ['Mixed sizes', 'Some damage or over-ripeness', 'Best sold locally or for processing'],
      },
    },
  },
};

// commodity name -> spec key.
//
// Reads BOTH `aliases` (the AGMARK-generated specs) and `appliesTo` (the
// hand-written grain/cotton specs, which cover many crops each). Reading only
// one of them silently dropped Wheat and Soyabean to the generic spec.
const BY_COMMODITY = {};
for (const [key, spec] of Object.entries(SPECS)) {
  if (spec.commodity) BY_COMMODITY[normalise(spec.commodity)] = key;
  for (const a of spec.aliases || []) BY_COMMODITY[normalise(a)] = key;
  for (const c of spec.appliesTo || []) BY_COMMODITY[normalise(c)] = key;
}

function normalise(name) {
  return String(name || '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function specForCrop(cropName) {
  const n = normalise(cropName);
  // BOTH sides must be long enough to mean something. Without the n.length
  // guard, `name.includes('')` is true for every spec, so an empty or junk
  // crop name matched whichever spec happened to be first — silently grading
  // an unknown crop against onion criteria.
  if (n.length < 4) return { key: 'general', ...SPECS.general, disclaimer: DISCLAIMER };
  if (BY_COMMODITY[n]) return { key: BY_COMMODITY[n], ...SPECS[BY_COMMODITY[n]], disclaimer: DISCLAIMER };

  for (const [name, key] of Object.entries(BY_COMMODITY)) {
    if (name.length >= 4 && (n.includes(name) || name.includes(n))) {
      return { key, ...SPECS[key], disclaimer: DISCLAIMER };
    }
  }
  return { key: 'general', ...SPECS.general, disclaimer: DISCLAIMER };
}

/** Is this a grade the given crop's spec actually defines? */
function isValidGrade(cropName, code) {
  if (!code) return true;                       // grading is optional
  const spec = specForCrop(cropName);
  return Object.keys(spec.grades).includes(String(code).toUpperCase());
}

module.exports = {
  SPECS, SPEC_VERSION, GRADE_LABELS, AGMARK_SOURCE, DISCLAIMER,
  specForCrop, isValidGrade,
};

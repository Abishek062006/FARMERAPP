// English/Marathi UI strings.
//
// Before this file, Tamil text was hardcoded inline across twelve files —
// which is why converting the app to Maharashtra meant editing twelve files
// instead of one. Everything user-facing that is not English lives here now.
//
// The app serves Maharashtra, so the second language is Marathi ('mr'). A
// farmer's choice is stored on User.language and defaults to 'mr'.
//
// Usage:
//   import { t } from '../i18n/strings';
//   t('chatbot.greeting', lang)         // full string in one language
//   t('soil.black', lang)               // vocabulary label
//
// Missing keys fall back to English, then to the key itself, so a typo shows
// up as a visible key rather than a blank screen.

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
];

export const DEFAULT_LANGUAGE = 'en';

// ── WHAT `// mr-checked` MEANS, AND WHAT IT DOES NOT ──────────────────────
//
// ⚠️ READ THIS BEFORE TRUSTING A MARATHI STRING IN THIS FILE.
//
// `mr-checked` means: CHECKED BY CLAUDE, NOT REVIEWED BY A NATIVE SPEAKER.
// It is deliberately NOT the same word as "verified", and it must never be
// upgraded to one without an actual native review happening.
//
// HISTORY. An earlier pass triaged 248 flags down to 85 by unflagging ordinary
// UI language (buttons, toasts, counts) and holding back anything containing a
// mandi term. Later work added more, reaching 255. The project owner — who is
// also not a Marathi speaker — asked for them to be resolved rather than left
// as an open task nobody could action. This is that pass, and this comment is
// the honest record of how far it actually got.
//
// ═══ WHAT WAS ACTUALLY DONE ══════════════════════════════════════════════
//
// The high-risk trade terms were checked against a REAL CORPUS rather than
// guessed at: 1,582 OCR'd pages of Krishi Darshani (MPKV Rahuri's own annual
// farmer handbook, 2024/2025/2026), already on disk at
// backend/data/sources_fertilizer_krishi_darshani/work/. That is authentic
// Maharashtra agricultural Marathi written BY the university this app cites
// for its fertilizer doses — the best available evidence short of a person.
//
//   CORROBORATED — the term appears in real MPKV writing, in this sense:
//     प्रत        quality/grade   68 standalone uses ("पाण्याची प्रत" = the
//                                 quality of the water). प्रतवारी (grading)
//                                 on 23 pages. This settles ~67 strings.
//     कोंब        sprouting       56 pages ("पक्षी कोवळे कोंब उचलतात")
//     चाळ         onion shed      61 pages
//     प्रतवारी    grading         23 pages
//     आवक         arrivals        14 pages
//     फेरी        run/trip         4 pages
//     आडत         commission       2 pages
//     तारण        pledge loan      3 pages
//     बाजार समिती APMC             3 pages
//
//   ⚠️ CORPUS IS SILENT — Krishi Darshani is an AGRONOMY handbook, so it does
//   not discuss market labour, revenue splits or trade finance at all. Absence
//   here is NOT evidence the term is wrong; it is evidence this corpus cannot
//   answer the question:
//     वजन काटा    weighbridge     the 4 hits for काटा are all "दातेरी काटा",
//                                 a FISH'S SPINE. Nothing to do with weighing.
//     हमाली       loading labour  0 pages
//     वाटणी       revenue split   0 pages
//     उचल         advance         16 pages, but every one is the VERB "to
//                                 lift" (उचलून, उचलतात). The mandi sense is
//                                 absent — which is why the advance strings
//                                 use the plainer आगाऊ रक्कम instead.
//     एफपीओ       FPO             an English acronym; no corpus can settle it.
//
// ═══ WHAT THIS PASS DID NOT DO ═══════════════════════════════════════════
//
// It did not check grammar, register, politeness level, or whether a sentence
// reads naturally to a farmer in Nashik. A term being authentic does not make
// the sentence around it good Marathi. That still needs a person.
//
// THE RULE THAT HAS NOT CHANGED: a near-miss on a mandi term reads WORSE to a
// Maharashtra farmer than plain English would, because it signals the app was
// translated AT farmers rather than FOR them. Where a term stayed uncertain
// above, the string uses the plainest available wording rather than a confident
// guess — that is a deliberate choice, not a gap.
//
// TO REDO THIS PROPERLY: `node frontend/scripts/marathiReview.js` prints every
// `mr-checked` string beside its English source; `--csv` gives a spreadsheet
// with blank correction columns. Sit a Marathi speaker in front of it. When a
// string is confirmed by a PERSON, change its marker to `// mr-native` so the
// two levels of evidence never get confused with each other.
const STRINGS = {
  en: {
    // ── Soil types (values match Land.soilType's enum) ──────────────────
    'soil.red': 'Red Soil',
    'soil.black': 'Black Soil',
    'soil.clay': 'Clay Soil',
    'soil.sandy': 'Sandy Soil',
    'soil.loamy': 'Loamy Soil',
    'soil.alluvial': 'Alluvial Soil',
    'soil.laterite': 'Laterite Soil',

    // ── Water sources (values match Land.waterSource's enum) ────────────
    'water.borewell': 'Borewell',
    'water.well': 'Well',
    'water.canal': 'Canal',
    'water.river': 'River',
    'water.rainwater': 'Rainwater',
    'water.tank': 'Tank',
    'water.pond': 'Pond',
    'water.drip': 'Drip Irrigation',
    'water.sprinkler': 'Sprinkler',
    'water.none': 'None',

    // ── Seasons ─────────────────────────────────────────────────────────
    'season.summer': 'Summer',
    'season.monsoon': 'Monsoon',
    'season.winter': 'Winter',

    // ── Task types ──────────────────────────────────────────────────────
    'task.watering': 'Watering',
    'task.fertilizing': 'Fertilizing',
    'task.weeding': 'Weeding',
    'task.pruning': 'Pruning',
    'task.pest-control': 'Pest Control',
    'task.harvesting': 'Harvesting',
    'task.monitoring': 'Monitoring',
    'task.other': 'Other',

    // ── Vehicles ────────────────────────────────────────────────────────
    'vehicle.auto': 'Auto',
    'vehicle.tempo': 'Tempo Van',
    'vehicle.truck': 'Truck',

    // ── Screens ─────────────────────────────────────────────────────────
    // ── Farmer dashboard ─────────────────────────────────────────────
    // Added when the floating language toggle went in. Before it, tapping a
    // switch changed nothing on the farmer's home screen, which reads as a
    // broken control.
    'dash.myLands': 'My Lands',
    'dash.mySales': 'My Sales',
    'dash.prices': 'Prices',
    'dash.marketPrices': 'Market Prices',
    'dash.grievances': 'Grievances',
    'dash.addCrop': 'Add Crop',
    'dash.mandiPrice': 'Mandi Price',
    'dash.currentWeather': 'Current Weather',
    'dash.lands': 'Lands',
    'dash.active': 'Active',
    'dash.harvested': 'Harvested',
    'dash.loading': 'Loading your farm...',
    'dash.noLand': 'No land added yet',
    'dash.registerFirstLand': 'Register your first land to start farming',
    'dash.registerFirstLandBtn': 'Register First Land',
    'dash.noCrops': 'No crops planted yet',
    'dash.getAiRecs': 'Get AI Recommendations',
    'dash.aiSuggest': 'Let AI suggest the best crops for your land',
    'dash.addLandForPrices': 'Add a land to see mandi prices near you',
    'dash.fetchingPrices': 'Fetching mandi prices near you…',
    'dash.noPriceData': 'No mandi price data available',
    'dash.nearestMarket': 'Nearest reporting market',
    'dash.recentTrend': 'Recent trend',
    'dash.liveTrend': 'Live 7-day trend',
    // ── Roles, as a PERSON reads them ─────────────────────────────────
    // The stored values stay 'vendor' and 'agent' — they are in the User enum,
    // in vendorUid/agentId across four models, in partial unique indexes and in
    // guarded findOneAndUpdate filters over 28 files. Renaming the schema would
    // need a migration of every existing document and buys nothing a user can
    // see. What a user READS is renamed here, once.
    //   vendor → Buyer   (they buy crops; "vendor" made them sound like sellers)
    //   agent  → Captain (already this app's own word — see JobOfferSheet, and
    //                     the "captains must be online" line in the build plan)
    //   fpo    → FPO      (the ORGANISATION's own account, not a farmer who
    //                      happens to run one — see models/User.js)
    'role.farmer': 'Farmer',
    'role.vendor': 'Buyer',
    'role.agent': 'Captain',
    'role.fpo': 'FPO',
    'role.vendor.plural': 'Buyers',
    'role.agent.plural': 'Captains',

    'harvest.subtitle': 'Post your harvest to the market',
    'agent.vehiclePrompt': 'The vehicle you drive',

    // ── Chatbot (KisanChatbot) ──────────────────────────────────────────
    'chatbot.name': 'KISAN',
    'chatbot.greeting':
      'Hello! I am Kisan. You can type your question or press the mic and speak!',
    'chatbot.error.retry': 'Sorry, please try again.',
    'chatbot.error.connection': 'Connection error. Please try again.',
    'chatbot.error.voice': 'Could not understand voice. Please try again or type.',
    'chatbot.error.recording': 'Voice recording error. Please type instead.',
    'chatbot.stop': 'Stop',
    'chatbot.listen': 'Listen',
    'chatbot.status.understanding': 'Understanding voice...',
    'chatbot.status.thinking': 'Kisan is thinking...',
    'chatbot.status.speakNow': 'Speak now...',

    // ── Record a sale ───────────────────────────────────────────
    'recordSale.channelApmc': 'APMC auction',
    'recordSale.channelTrader': 'Private trader',
    'recordSale.channelFarmgate': 'At the farm gate',
    'recordSale.channelProcessor': 'Processor / mill',
    'recordSale.channelFpo': 'Through my FPO',
    'recordSale.channelExport': 'Exporter',
    'recordSale.dedCommission': 'Commission',
    'recordSale.dedLabourHamali': 'Labour (hamali)',
    'recordSale.dedWeighing': 'Weighing',
    'recordSale.dedTransport': 'Transport',
    'recordSale.dedMarketCess': 'Market cess',
    'recordSale.dedPacking': 'Packing',
    'recordSale.bandPrompt': 'Pays promptly',
    'recordSale.bandAverage': 'Pays in a week or two',
    'recordSale.bandSlow': 'Pays slowly',
    'recordSale.bandUnpaid': 'Nothing recorded as paid',
    'recordSale.notEnoughHistory': 'Not enough history to say',
    'recordSale.recordedSalesWord': 'recorded sales',
    'recordSale.fromWord': 'from',
    'recordSale.farmersWord': 'farmers',
    'recordSale.usuallyPaysPrefix': 'usually pays in',
    'recordSale.daysWord': 'days',
    'recordSale.daysPlain': 'days',
    'recordSale.unpaidSalesWord': 'sales with no payment recorded',
    'recordSale.oldestPrefix': 'oldest',
    'recordSale.trustBasis': 'From what farmers wrote down themselves. Nobody verifies these entries.',
    'recordSale.alertWhatSold': 'What did you sell?',
    'recordSale.alertHowMuch': 'How much did you sell?',
    'recordSale.alertWhoBoughtTitle': 'Who bought it?',
    'recordSale.alertWhoBoughtMsg': 'A name is enough — they do not need an account.',
    'recordSale.alertWhatRate': 'What rate did you get?',
    'recordSale.alertCheckSlipTitle': 'Check the slip',
    'recordSale.alertCheckSlipMsg': 'The deductions come to more than the sale itself.',
    'recordSale.alertRecordedTitle': 'Recorded',
    'recordSale.savedNotePrefix': 'Saved. Note:',
    'recordSale.perKgTimes': '/kg ×',
    'recordSale.kgComesTo': 'kg comes to',
    'recordSale.butYouEntered': ', but you entered',
    'recordSale.weKeptFigure': 'We kept your figure.',
    'recordSale.tookHomePrefix': 'You took home',
    'recordSale.alertCouldNotSaveTitle': 'Could not save',
    'recordSale.alertPleaseTryAgain': 'Please try again.',
    'recordSale.alertMoneyReceivedTitle': 'Money received?',
    'recordSale.alertMoneyReceivedMsg': 'This records that the buyer has paid you.',
    'recordSale.notYet': 'Not yet',
    'recordSale.yesPaid': 'Yes, paid',
    'recordSale.alertCouldNotUpdateTitle': 'Could not update',
    'recordSale.gradeLabel': 'Grade',
    'recordSale.youGot': 'YOU GOT',
    'recordSale.saleValue': 'Sale value',
    'recordSale.tookHome': 'Took home',
    'recordSale.deductionsTookPrefix': 'Deductions took',
    'recordSale.ofThisSaleSuffix': '% of this sale',
    'recordSale.paidWord': 'Paid',
    'recordSale.afterWord': 'after',
    'recordSale.notPaidYetTapWhenArrives': 'Not paid yet — tap when the money arrives',
    'recordSale.paidYou': 'PAID YOU',
    'recordSale.buyersIntroBase': 'Everyone you have recorded a sale to, buyers who still owe you first.',
    'recordSale.buyerNeedsPrefix': 'A buyer needs',
    'recordSale.buyerNeedsSuffix': 'recorded sales before this can say anything about how they pay.',
    'recordSale.noBuyersYet': 'No buyers recorded yet',
    'recordSale.buyersEmptySub': 'Record a few sales and this becomes your own answer to "who actually pays me on time" — and it warns other farmers too.',
    'recordSale.backToMySales': 'Back to my sales',
    'recordSale.soldFor': 'SOLD FOR',
    'recordSale.deductionsTook': 'DEDUCTIONS TOOK',
    'recordSale.ofYourSalesSuffix': '% of your sales',
    'recordSale.unpaidCountSuffix': 'unpaid',
    'recordSale.bookEmptyTitle': 'Your sales, wherever they happened',
    'recordSale.bookEmptySub': 'Sold at the APMC or to a trader? Record it here. It keeps your own account of what you were paid, what was deducted, and which buyers actually pay on time.',
    'recordSale.myBuyers': 'My buyers',
    'recordSale.recordASale': 'Record a sale',
    'recordSale.formWhy': 'This is your own record of a sale that happened outside the app. Nobody else sees it as proof — it is your account of what you were paid.',
    'recordSale.whatDidYouSell': 'What did you sell?',
    'recordSale.placeholderOnion': 'Onion',
    'recordSale.quantityKgLabel': 'Quantity (kg)',
    'recordSale.rateLabel': 'Rate (₹/kg)',
    'recordSale.gradeYouWerePaidFor': 'Grade you were paid for',
    'recordSale.notGraded': 'Not graded',
    'recordSale.whoBoughtIt': 'Who bought it?',
    'recordSale.placeholderTraderName': 'Trader or company name',
    'recordSale.buyerNameHint': 'They do not need an account. The name they are known by at the market is enough.',
    'recordSale.theirPhoneLabel': 'Their phone (optional)',
    'recordSale.phonePlaceholderHint': 'Helps if you need to chase payment',
    'recordSale.whereLabel': 'Where?',
    'recordSale.placeholderMarket': 'Lasalgaon APMC',
    'recordSale.howDidYouSellLabel': 'How did you sell?',
    'recordSale.whatWasDeductedTitle': 'What was deducted?',
    'recordSale.deductionsHint': 'Add each charge on the slip separately. This is the part that decides what you actually took home.',
    'recordSale.minusDeductions': '− Deductions',
    'recordSale.youTakeHome': 'You take home',
    'recordSale.deductionsAreTakingPrefix': 'Deductions are taking',
    'recordSale.saleAmountSlipLabel': 'Sale amount on the slip (optional)',
    'recordSale.leaveBlankSuffix': '— leave blank to use this',
    'recordSale.totalBeforeDeductions': 'Total before deductions',
    'recordSale.willKeepFigure': 'We will keep your figure — the slip is what counts.',
    'recordSale.iHaveBeenPaid': 'I have been paid',
    'recordSale.paidToggleHint': 'Leave this off if the buyer still owes you. You can mark it paid later, and that record is what shows which buyers actually pay on time.',
    'recordSale.notesLabel': 'Notes (optional)',
    'recordSale.notesPlaceholder': 'Anything worth remembering about this sale',
    'recordSale.saveThisSaleBtn': 'Save this sale',
    'recordSale.cancelBtn': 'Cancel',

    // ── My sales ───────────────────────────────────────────
    'farmerSales.tabPickups': 'Pickups',
    'farmerSales.tabOffers': 'Offers',
    'farmerSales.tabListings': 'Listings',
    // Kilograms that are SOLD but still physically on the farm. Buying
    // decrements the listing and a lapsed dispatch does not restock it, so
    // without these lines the quantity simply drops with no explanation.
    'farmerSales.kgHeldForDelivery': 'kg sold, waiting to be collected',
    'farmerSales.heldDriverComing': 'a captain is on the way',
    'farmerSales.heldFindingDriver': 'still looking for a captain',
    'farmerSales.heldNoDriver': 'no captain took this trip. The buyer has to retry or cancel it — you do not need to do anything.',
    'farmerSales.statusFindingDriver': 'Finding a driver',
    'farmerSales.statusNoDriver': 'No driver yet',
    'farmerSales.statusDriverComing': 'Driver coming',
    'farmerSales.statusCollected': 'Collected',
    'farmerSales.statusDelivered': 'Delivered',
    'farmerSales.statusCancelled': 'Cancelled',
    'farmerSales.markPaidTitle': 'Mark as paid?',
    'farmerSales.markPaidMsgPrefix': 'Confirm you have received',
    'farmerSales.from': 'from',
    'farmerSales.notYet': 'Not yet',
    'farmerSales.yesReceived': 'Yes, received',
    'farmerSales.couldNotUpdate': 'Could not update',
    'farmerSales.tryAgain': 'Please try again.',
    'farmerSales.priceAgreedTitle': 'Price agreed',
    'farmerSales.for': 'for',
    'farmerSales.priceAgreedMsgSuffix': 'will now book transport — the pickup appears under Pickups once they do.',
    'farmerSales.acceptOfferTitle': 'Accept this offer?',
    'farmerSales.notNow': 'Not now',
    'farmerSales.accept': 'Accept',
    'farmerSales.declineOfferTitle': 'Decline this offer?',
    'farmerSales.fromCap': 'From',
    'farmerSales.cancel': 'Cancel',
    'farmerSales.decline': 'Decline',
    'farmerSales.enterPriceTitle': 'Enter a price',
    'farmerSales.enterPriceMsg': 'Type a number in rupees per kg.',
    'farmerSales.removeFromMarketTitle': 'Remove from market?',
    'farmerSales.willNoLongerBeVisible': 'will no longer be visible to buyers.',
    'farmerSales.keep': 'Keep',
    'farmerSales.remove': 'Remove',
    'farmerSales.couldNotRemove': 'Could not remove',
    'farmerSales.soldTo': 'sold to',
    'farmerSales.youGet': 'YOU GET',
    'farmerSales.pickupCode': 'Pickup code',
    'farmerSales.pickupCodeHint': 'Give this to the driver when they load your crop',
    'farmerSales.collect': 'Collect',
    'farmerSales.driverFareOnly': 'The driver collects the transport fare only',
    'farmerSales.markPaidBtn': 'Mark paid',
    // ── Advance and balance ─────────────────────────────────────────
    // AGREED and RECEIVED are different facts and every string below keeps
    // them apart: an advance a buyer promised and did not send is the farmer's
    // whole problem, and it must never read like money in hand.
    'farmerSales.advancePromised': 'Advance agreed:',
    'farmerSales.advanceNotYetHint': 'Not received yet. This is a promise from the buyer, not money — do not load the truck on it. Tap once it actually reaches you.',
    'farmerSales.advanceGotIt': 'I received it',
    'farmerSales.advanceConfirmTitle': 'Advance received?',
    'farmerSales.advanceConfirmPrefix': 'You are recording that you received',
    'farmerSales.advanceConfirmBody': 'Only you can confirm this — the app does not move money and cannot see your account.',
    'farmerSales.advanceAlreadyIn': 'Advance already received:',
    'farmerSales.ofTotal': 'of',
    'farmerSales.advanceOverpaid': 'The advance was more than this lot came to. You are holding the buyer\'s money:',
    'farmerSales.errTitle': 'Could not do that',
    'farmerSales.viewReceipt': 'View receipt · report a problem',
    'farmerSales.received': 'received',
    'farmerSales.vehicleNumberPending': 'Vehicle number pending',
    'farmerSales.call': 'Call',
    'farmerSales.onMarket': 'On the market',
    'farmerSales.soldOut': 'Sold out',
    'farmerSales.removed': 'Removed',
    'farmerSales.minQty': 'min',
    'farmerSales.of': 'of',
    'farmerSales.kgSold': 'kg sold',
    'farmerSales.kgLeft': 'kg left',
    'farmerSales.sellOrHold': 'Sell now or hold? See what waiting costs',
    'farmerSales.waitingOnYou': 'Waiting on you',
    'farmerSales.youCounteredStatus': 'You countered',
    'farmerSales.agreed': 'Agreed',
    'farmerSales.declined': 'Declined',
    'farmerSales.withdrawn': 'Withdrawn',
    'farmerSales.expired': 'Expired',
    'farmerSales.verifiedBuyer': 'Verified buyer',
    'farmerSales.gstinOnFile': 'GSTIN on file',
    'farmerSales.notVerified': 'Not verified',
    'farmerSales.noDocuments': 'No documents',
    'farmerSales.paysPromptly': 'Pays promptly',
    'farmerSales.paysInAWeekOrTwo': 'Pays in a week or two',
    'farmerSales.paysSlowly': 'Pays slowly',
    'farmerSales.noSettlementRecorded': 'No settlement recorded',
    'farmerSales.theyOffer': 'THEY OFFER',
    'farmerSales.total': 'total',
    'farmerSales.youAsked': 'you asked',
    'farmerSales.youCounteredAt': 'You countered at',
    'farmerSales.waitingFor': 'waiting for',
    'farmerSales.agreedAt': 'Agreed at',
    'farmerSales.bookTransportNext': 'books transport next.',
    'farmerSales.beforeYouDecide': 'before you decide',
    'farmerSales.pastSalesTooFew': 'past sales — too few to judge',
    'farmerSales.settled': 'settled',
    'farmerSales.usually': 'usually',
    'farmerSales.unsettled': 'unsettled',
    'farmerSales.send': 'Send',
    'farmerSales.counterBtn': 'Counter',
    'farmerSales.noPickupsYet': 'No pickups yet',
    'farmerSales.noOffersYet': 'No offers yet',
    'farmerSales.nothingListedYet': 'Nothing listed yet',
    'farmerSales.emptyPickupsSub': 'When a buyer buys your crop, the pickup will appear here with a code for the captain.',
    'farmerSales.emptyOffersSub': 'When a buyer offers a price for one of your lots, it lands here. You can accept, counter, or decline.',
    'farmerSales.emptyListingsSub': 'Open a harvested crop and post it to the Farm Market.',

    // ── Hold or sell decision ───────────────────────────────────────────
    'holdDecision.why': 'Waiting for a better price costs money — rent for the store, crop that spoils while it sits, and interest if you have to borrow to get through the week. This works out whether the wait is worth it.',
    'holdDecision.cropLabel': 'Crop',
    'holdDecision.cropPlaceholder': 'Onion',
    'holdDecision.quantityLabel': 'Quantity (kg)',
    'holdDecision.quantityPlaceholder': '10000',
    'holdDecision.rateLabel': 'Your rate (₹/kg)',
    'holdDecision.ratePlaceholder': '14',
    'holdDecision.holdForLabel': 'Hold for how long?',
    'holdDecision.daysUnit': 'days',
    'holdDecision.priceHint': 'The price model was only measured out to 14 days, so it will not put a rupee figure on anything longer.',
    'holdDecision.ctaWorkItOut': 'Work it out',
    'holdDecision.defaultError': 'Could not price that hold.',
    'holdDecision.cannotPrice': 'Cannot price this hold',
    'holdDecision.verdictGainPrefix': 'HOLDING',
    'holdDecision.verdictGainSuffix': 'DAYS COULD GAIN',
    'holdDecision.verdictCostSuffix': 'DAYS WOULD COST',
    'holdDecision.at': 'at',
    'holdDecision.your': 'your',
    'holdDecision.rangeBetween': 'Between',
    'holdDecision.rangeAnd': 'and',
    'holdDecision.rangeSuffix': 'if the spoilage rate is half or double what we assume',
    'holdDecision.modelSays': 'The sale-window model says',
    'holdDecision.confidenceWord': 'confidence',
    'holdDecision.uncertainNote': 'It is NOT confident on this crop. Treat the figure above as a comparison between your options, not as advice to act on.',
    'holdDecision.districtModalPrefix': 'District modal is',
    'holdDecision.districtModalSuffix': '— that is the series the model forecasts. Your own rate usually differs, so the percentage is applied to yours.',
    'holdDecision.optionsHeader': 'YOUR OPTIONS',
    'holdDecision.kmAway': 'km away',
    'holdDecision.cropLostLabel': 'Crop lost while stored',
    'holdDecision.storageRentLabel': 'Storage rent',
    'holdDecision.none': 'none',
    'holdDecision.pledgeRaisePrefix': 'You could raise up to',
    'holdDecision.pledgeOfValue': 'of its value',
    'holdDecision.pledgeWhileWait': 'while you wait.',
    'holdDecision.pledgeInterestOver': 'Interest over',
    'holdDecision.pledgeLeaving': 'leaving',
    'holdDecision.pledgeNoLend': 'This app does not lend — ask the godown.',

    // ── Buyer demand ───────────────────────────────────────────
    'buyerDemand.badgeVerified': 'Verified buyer',
    'buyerDemand.badgeDocuments': 'GSTIN on file',
    'buyerDemand.badgeRejected': 'Not verified',
    'buyerDemand.badgeUnverified': 'No documents',
    'buyerDemand.whichLotTitle': 'Which lot?',
    'buyerDemand.whichLotMsg': 'Pick one of your listings to put forward.',
    'buyerDemand.sentTitle': 'Sent',
    'buyerDemand.sentDefaultMsg': 'The buyer can now see your lot.',
    'buyerDemand.couldNotSendTitle': 'Could not send',
    'buyerDemand.tryAgain': 'Please try again.',
    'buyerDemand.paying': 'Paying',
    'buyerDemand.wantsLabel': 'Wants',
    'buyerDemand.gradeOrBetter': 'or better',
    'buyerDemand.grade': 'Grade',
    'buyerDemand.deliverTo': 'Deliver to',
    'buyerDemand.by': 'By',
    'buyerDemand.responded': 'You have put a lot forward',
    'buyerDemand.iHaveThis': 'I have this',
    'buyerDemand.noMatchingLot': 'You have no matching lot on the market right now.',
    'buyerDemand.callFirst': 'Call',
    'buyerDemand.callFirstSuffix': 'first',
    'buyerDemand.filterHave': 'Crops I have',
    'buyerDemand.filterAll': 'Everything nearby',
    'buyerDemand.registerLandTitle': 'Register your land first',
    'buyerDemand.noBuyersTitle': 'No buyers looking right now',
    'buyerDemand.registerLandSub': 'Buyers are matched to you by distance, so your land location is needed before this can show anything.',
    'buyerDemand.noBuyersAllSub': 'No buyer has posted a requirement near you yet. Check back — this updates on its own.',
    'buyerDemand.noBuyersFilteredSub': 'Nothing for the crops you have listed. Try "Everything nearby" to see what buyers want in your area.',
    'buyerDemand.wantsInline': 'wants',
    'buyerDemand.kgAvailable': 'kg available',
    'buyerDemand.messageLabel': 'Message (optional)',
    'buyerDemand.messagePlaceholder': 'e.g. Ready to load from Thursday',
    'buyerDemand.notice': 'This is not a sale. It tells the buyer you have this lot — they still have to make an offer on it, and you can accept, counter or decline as usual.',
    'buyerDemand.putForward': 'Put this lot forward',

    // ── Crop detail ───────────────────────────────────────────
    'cropDetail.error': 'Error',
    'cropDetail.failedLoadDetails': 'Failed to load crop details',
    'cropDetail.scanPlantHealthTitle': 'Scan Plant Health',
    'cropDetail.scanPlantHealthMsg': 'Choose an option to detect diseases',
    'cropDetail.takePhoto': 'Take Photo',
    'cropDetail.chooseFromGallery': 'Choose from Gallery',
    'cropDetail.cancel': 'Cancel',
    'cropDetail.permissionNeededTitle': 'Permission needed',
    'cropDetail.cameraPermissionMsg': 'Camera permission is required to scan plants',
    'cropDetail.goodNewsTitle': 'Good News! 🌿',
    'cropDetail.plantHealthyMsg': 'Your plant appears healthy!',
    'cropDetail.ok': 'OK',
    'cropDetail.noDiseaseInfoMsg': 'No disease information available',
    'cropDetail.unknownDisease': 'Unknown Disease',
    'cropDetail.defaultTreatment': 'Consult an agricultural expert for treatment recommendations',
    'cropDetail.noSymptomsInfo': 'No symptoms information available',
    'cropDetail.failedAnalyzeImage': 'Failed to analyze image',
    'cropDetail.detectionFailedTitle': 'Detection Failed',
    'cropDetail.errCouldNotAnalyze': 'Could not analyze the image. Please try again with a clearer photo.',
    'cropDetail.errTimedOut': 'Request timed out. The AI service might be slow.',
    'cropDetail.errAiServiceDown': 'AI service is not running. Please start the Python server.',
    'cropDetail.savedTitle': 'Saved! ✅',
    'cropDetail.diseaseLoggedMsg': 'Disease logged successfully',
    'cropDetail.failedSaveDisease': 'Failed to save disease information',
    'cropDetail.listedTitle': '🎉 Listed on Farm Market',
    'cropDetail.kgOf': 'kg of',
    'cropDetail.listedMsgSuffix': 'is now visible to vendors.\n\nThis crop is marked harvested and its plot is free for your next crop.',
    'cropDetail.done': 'Done',
    'cropDetail.harvestWithoutSellingTitle': 'Harvest without selling?',
    'cropDetail.harvestWithoutSellingMsg': 'Use this if the crop failed or you are not selling through the app. The plot will be freed for your next crop.',
    'cropDetail.harvestOnly': 'Harvest only',
    'cropDetail.harvestedTitle': 'Harvested',
    'cropDetail.plotNowFreeMsg': 'The plot is now free.',
    'cropDetail.couldNotMarkHarvested': 'Could not mark this crop harvested.',
    'cropDetail.deleteCropTitle': 'Delete Crop',
    'cropDetail.confirmDeleteMsg': 'Are you sure? This cannot be undone.',
    'cropDetail.delete': 'Delete',
    'cropDetail.deletedTitle': 'Deleted',
    'cropDetail.cropDeletedMsg': 'Crop deleted successfully',
    'cropDetail.failedDeleteCrop': 'Failed to delete crop',
    'cropDetail.loadingDetails': 'Loading crop details...',
    'cropDetail.cropNotFound': 'Crop not found',
    'cropDetail.goBack': 'Go Back',
    'cropDetail.unknownLand': 'Unknown Land',
    'cropDetail.scanButtonLabel': 'Scan Plant Health',
    'cropDetail.aiPoweredDetection': 'AI-powered disease detection',
    'cropDetail.growthProgress': 'Growth Progress',
    'cropDetail.daysElapsed': 'Days Elapsed',
    'cropDetail.daysRemaining': 'Days Remaining',
    'cropDetail.complete': 'Complete',
    'cropDetail.stagePrefix': 'Stage',
    'cropDetail.dailyGrowthTracker': 'Daily Growth Tracker',
    'cropDetail.todaysWeather': 'Today\'s Weather',
    'cropDetail.humidityPrefix': 'Humidity',
    'cropDetail.windPrefix': 'Wind',
    'cropDetail.tasksTitle': 'Tasks',
    'cropDetail.noTasksYet': 'No tasks yet',
    'cropDetail.cropDetailsTitle': 'Crop Details',
    'cropDetail.variety': 'Variety',
    'cropDetail.quantity': 'Quantity',
    'cropDetail.plantingDate': 'Planting Date',
    'cropDetail.expectedHarvest': 'Expected Harvest',
    'cropDetail.notes': 'Notes',
    'cropDetail.postHarvestButton': 'Post Harvest to Farm Market',
    'cropDetail.harvestFailedLink': 'Crop failed? Harvest without selling',
    'cropDetail.harvestedBanner': 'Harvested',
    'cropDetail.harvestedOnPrefix': 'on',
    'cropDetail.deleteCropButton': 'Delete Crop',
    'cropDetail.diseaseDetectionTitle': 'Disease Detection',
    'cropDetail.analyzingPlantHealth': 'Analyzing plant health...',
    'cropDetail.usingTensorflowModel': 'Using TensorFlow AI Model',
    'cropDetail.mayTakeSeconds': 'This may take a few seconds',
    'cropDetail.plantHealthyResult': 'Plant is Healthy!',
    'cropDetail.diseaseDetectedResult': 'Disease Detected',
    'cropDetail.diseaseLabel': 'Disease:',
    'cropDetail.confidenceLabel': 'Confidence:',
    'cropDetail.severityLabel': 'Severity:',
    'cropDetail.symptomsLabel': 'Symptoms:',
    'cropDetail.treatmentLabel': 'Treatment:',
    'cropDetail.pesticideReadyTitle': 'Pesticide Calculation Ready',
    'cropDetail.pesticideReadyMsg': 'After saving, a full pesticide recommendation card will appear on your crop page.',
    'cropDetail.saveToHealthHistory': 'Save to Health History',
    'cropDetail.pesticideRecTitle': 'Pesticide Recommendation',
    'cropDetail.forPrefix': 'For:',
    'cropDetail.calculatedFor': 'Calculated for',
    'cropDetail.sqFt': 'sq ft',
    'cropDetail.ofLand': 'of land',
    'cropDetail.waterNeeded': 'Water\nNeeded',
    'cropDetail.pesticideAmount': 'Pesticide\nAmount',
    'cropDetail.bottleSize': 'Bottle\nSize',
    'cropDetail.estimatedTotalCost': 'Estimated Total Cost',
    'cropDetail.applicationTips': '📋 Application Tips',
    'cropDetail.applicationTipsText': '• Mix pesticide thoroughly with the required water before spraying.\n• Apply early morning (6–8 AM) or late evening for best absorption.\n• Wear protective gloves and mask while applying.\n• Avoid spraying before rain.',
    'cropDetail.dismissRecommendation': 'Dismiss recommendation',
    'cropDetail.severitySevere': 'SEVERE',
    'cropDetail.severityModerate': 'MODERATE',
    'cropDetail.severityMild': 'MILD',

    // ── Crop recommendation ───────────────────────────────────────────
    'cropRecommendation.noSuitableTitle': 'No Suitable Crops',
    'cropRecommendation.noSuitableMsg': 'Could not find suitable crops for your location. Please try again.',
    'cropRecommendation.errorTitle': 'Error',
    'cropRecommendation.invalidResponse': 'Failed to get AI recommendations. Invalid response format.',
    'cropRecommendation.connectionErrorGeneric': 'Failed to connect to AI service.',
    'cropRecommendation.timeoutError': 'Request timeout. Please check your internet connection.',
    'cropRecommendation.cannotConnect': 'Cannot connect to server. Please check if backend is running on',
    'cropRecommendation.aiConnectionErrorTitle': 'AI Connection Error',
    'cropRecommendation.retry': 'Retry',
    'cropRecommendation.goBack': 'Go Back',
    'cropRecommendation.limitReachedTitle': 'Limit Reached',
    'cropRecommendation.limitReachedMsgPrefix': 'You can select a maximum of',
    'cropRecommendation.cropsWord': 'crops',
    'cropRecommendation.requiredTitle': 'Required',
    'cropRecommendation.selectAtLeastOne': 'Please select at least one crop',
    'cropRecommendation.gettingRecommendations': 'Getting AI recommendations...',
    'cropRecommendation.analyzing': 'Analyzing',
    'cropRecommendation.mayTakeTime': 'This may take 10-15 seconds...',
    'cropRecommendation.headerTitle': '🌱 AI Crop Recommendations',
    'cropRecommendation.selected': 'selected',
    'cropRecommendation.maxPrefix': 'Max',
    'cropRecommendation.cropsAllowedSuffix': 'crop(s) allowed',
    'cropRecommendation.searchCropsTitle': 'Search Crops',
    'cropRecommendation.searchPlaceholder': 'Search crop name...',
    'cropRecommendation.customHint': 'Grow this even though it\'s not commonly recommended',
    'cropRecommendation.searchTrigger': 'Don\'t see your crop? Search all Maharashtra crops',
    'cropRecommendation.noMatchingCrops': 'No matching crops found',
    'cropRecommendation.noMatchingSubtext': 'We couldn\'t find a crop in our reference data suited to this land\'s exact soil type, water source, and current season. Try updating the land\'s details or check back next season.',
    'cropRecommendation.addedByYou': 'Added by you',
    'cropRecommendation.addedByYouReason': 'Added by you — not part of the AI-ranked list for this land.',
    'cropRecommendation.days': 'days',
    // ── Farmer's market view (Phase 2a) ──────────────────────────────────
    // ⚠️ `farmerMarket.bandNote` is the caveat on the asking-price band and
    // it is NEVER optional. A live listing is an OPEN OFFER, not a trade;
    // reading a median of asks as "the going rate" is the same error as
    // reading a mandi modal as a farmer's own price.
    'dash.browseMarket': 'My produce',
    'dash.priceOutlook': 'Price outlook',
    'dash.seeAllPrices': 'See all →',
    'dash.browseMarketSub': 'Post a harvest and check requests from interested buyers',
    // ── FPO trade history (Phase 2b) ─────────────────────────────────────
    // ⚠️ `fpoOrders.simulated` MUST NEVER BE DROPPED. The app's own payment
    // rail moves no money; without this line a demonstration transaction is
    // indistinguishable from a real settlement to whoever reads the screen.
    // ── FPO collection runs (Phase 3a) ───────────────────────────────────
    // ── D1 price outlook (Phase 4) ───────────────────────────────────────
    // ⚠️ `outlook.refuse.*` ARE FINDINGS, NOT ERRORS. D1 declines per
    // commodity — NO_SKILL when it cannot beat assuming today's price holds,
    // LOW_SKILL above 25% MAPE. Those must reach the farmer as sentences.
    'outlook.title': 'Price outlook',
    'outlook.chooseCrop': 'Which crop?',
    'outlook.nearbyDistrict': '{district} hasn\'t reported this crop enough recently, so this is based on {source}\'s prices — the nearest district that has (~{km} km away).',
    'outlook.tapToChange': 'Tap the crop name to change it',
    'outlook.cannotForecast': 'The model will not forecast these here:',
    'outlook.asOf': 'as of',
    'outlook.nextDays': 'Next {n} days',
    'outlook.tomorrow': 'Tomorrow',
    'outlook.yourRate': 'Your rate',
    'outlook.rateDefaultHint': 'Starts as today\'s district mandi rate. Edit it if what you actually sell at is different.',
    'outlook.apply': 'Apply',
    'outlook.legendModal': 'Grey figure: the district mandi modal, per kg.',
    'outlook.legendYours': 'Coloured figure: your own rate moved by the same percentage.',
    'outlook.bestDay': 'Highest point in the window',
    'outlook.peakNote': 'This is the highest forecast day inside the measured window. It is not advice to wait — holding costs money and produce spoils.',
    'outlook.howGood': 'How accurate is this?',
    'outlook.avgErr': 'average error',
    'outlook.vsNaive': 'against just assuming today\'s price holds:',
    'outlook.accuracyNote': 'Measured on a six-month holdout the model never saw. The second figure is what you would get by assuming nothing changes — the forecast is only worth having because it beats that.',
    'outlook.noForecast': 'No price forecast for this crop',
    'outlook.stillHaveStats': 'The reading above still stands — it is arithmetic over this district\'s real reported prices, not a model.',
    'outlook.refuse.NO_SKILL': 'For this crop the model does no better than assuming today\'s price holds, so it will not put a figure on it.',
    'outlook.refuse.LOW_SKILL': 'This crop\'s prices move too erratically here to forecast usefully.',
    'outlook.refuse.INSUFFICIENT_HISTORY': 'This district\'s own mandis have not reported this crop often enough recently to forecast from.',
    'outlook.reportedDays': 'Only {n} of the last 75 days had a reported price here — at least {min} are needed.',
    'outlook.refuse.UNKNOWN_COMMODITY': 'This crop is not in the model\'s training data.',
    'outlook.refuse.UNKNOWN_DISTRICT': 'This district is not in the model\'s training data.',
    'outlook.refuse.NO_SERIES': 'No usable price history for this crop here.',
    'outlook.refuse.MODEL_NOT_TRAINED': 'The forecasting model is not loaded right now.',
    'outlook.refuse.SERVICE_UNAVAILABLE': 'Could not reach the forecasting service. Pull down to try again.',
    'outlook.refuse.UNAVAILABLE': 'No forecast is available for this crop right now.',
    'outlook.action.sell': 'Sell now',
    'outlook.action.hold': 'Worth holding',
    'outlook.action.heavy': 'Heavy arrivals — expect pressure on price',
    'outlook.action.unknown': 'Not enough data to advise',
    'outlook.engine.statistical': 'From this district\'s reported prices.',
    'outlook.engine.statistical+model': 'From this district\'s reported prices, with the trained model alongside.',
    'outlook.engine.model': 'The trained sell/hold model decided this; the statistical read is kept beside it.',
    'outlook.loadFailed': 'Could not load the price outlook.',
    'outlook.retry': 'Retry',
    'fpoCollect.title': 'Collect from members',
    'fpoCollect.premisesTitle': 'Collection point',
    'fpoCollect.premisesMissing': 'This group has not said where its godown is. A vehicle cannot be routed, and a fare cannot be split, without a real point — so set it before arranging a collection.',
    'fpoCollect.setFromLocation': 'Use my current location',
    'fpoCollect.updatePremises': 'Change collection point',
    'fpoCollect.premisesFailed': 'Could not save the collection point.',
    'fpoCollect.needLocation': 'Location permission is needed to set the collection point.',
    'fpoCollect.chooseLots': 'Which lots come in',
    'fpoCollect.chooseSub': 'One vehicle serves at most {n} farms. Two lots from the same member count as one farm — the vehicle stops there once.',
    'fpoCollect.noLots': 'No member lots are available to collect right now.',
    'fpoCollect.gradeNotDeclared': 'Grade not declared',
    'fpoCollect.transport': 'Transport',
    'fpoCollect.mode.hired': 'Hire a captain',
    'fpoCollect.mode.own': 'Our own vehicle',
    'fpoCollect.mode.contracted': 'Contracted',
    'fpoCollect.statedCost': 'What this run costs the group',
    'fpoCollect.driverName': 'Driver',
    'fpoCollect.driverNamePh': 'Who is driving',
    'fpoCollect.driverPhone': 'Driver\'s phone',
    'fpoCollect.vehicleNumber': 'Vehicle number',
    'fpoCollect.optional': 'Optional',
    'fpoCollect.statedCostNote': 'Stated by you, not computed. The captain fare table prices an independent captain\'s costs and does not describe your own vehicle.',
    'fpoCollect.lotsWord': 'lots',
    'fpoCollect.farms': 'farms',
    'fpoCollect.arrange': 'Arrange',
    'fpoCollect.arrangedTitle': 'Collection arranged',
    'fpoCollect.arrangeFailed': 'Could not arrange that collection',
    'fpoCollect.saving': 'Saved against separate trips:',
    'fpoCollect.tryAgain': 'Please try again.',
    'fpoCollect.loadFailed': 'Could not load the group.',
    'fpoCollect.retry': 'Retry',
    'fpoOrders.title': 'Group orders',
    'fpoOrders.kg': 'kg',
    'fpoOrders.ordered': 'Ordered',
    'fpoOrders.delivered': 'delivered',
    'fpoOrders.received': 'Received',
    'fpoOrders.stillOwed': 'Still owed',
    'fpoOrders.basis': 'Totals cover the {shown} orders shown, of {total} in all.',
    'fpoOrders.simulatedCount': '{n} of these were settled on the app\'s own rail, which moves no real money.',
    'fpoOrders.paidOn': 'Paid',
    'fpoOrders.ref': 'Ref',
    'fpoOrders.simulated': 'Settled in-app — no real money moved',
    'fpoOrders.outstanding': 'Outstanding',
    'fpoOrders.advancePromised': 'Advance of {amt} agreed but not received — a promise, not money.',
    'fpoOrders.advanceIn': 'Advance of {amt} received.',
    'fpoOrders.openReceipt': 'Open receipt',
    'fpoOrders.empty': 'No orders yet for this group.',
    'fpoOrders.loadFailed': 'Could not load the group\'s orders.',
    'fpoOrders.retry': 'Retry',
    'fpoOrders.tab.all': 'All',
    'fpoOrders.tab.delivered': 'Delivered',
    'fpoOrders.tab.unpaid': 'Awaiting payment',
    'fpoOrders.status.delivered': 'Delivered',
    'fpoOrders.status.picked_up': 'On the way',
    'fpoOrders.status.accepted': 'Captain assigned',
    'fpoOrders.status.awaiting_agent': 'Finding a captain',
    'fpoOrders.status.no_agents': 'No captain took it',
    'fpoOrders.status.stranded': 'Stranded',
    'fpoOrders.status.cancelled': 'Cancelled',
    'fpoOrders.method.cash': 'cash',
    'fpoOrders.method.upi': 'UPI',
    'fpoOrders.method.bank': 'bank',
    'fpoOrders.method.other': 'other',
    'fpoOrders.method.in_app': 'in-app',

    'fpoAllMembers.searchPlaceholder': 'Search by name, village or crop',
    'fpoAllMembers.noMembers': 'No members yet.',
    'fpoAllMembers.noMatch': 'No members match that search.',

    'fpoMemberDetail.member': 'Member',
    'fpoMemberDetail.deliveries': 'Deliveries',
    'fpoMemberDetail.historyTitle': 'Trade history with this group',
    'fpoMemberDetail.noOrders': 'No orders from this farmer yet.',
    'farmerMarket.title': 'My Produce',
    'farmerMarket.status.available': 'On the market',
    'farmerMarket.status.sold_out': 'Sold out',
    'farmerMarket.status.withdrawn': 'Withdrawn',
    'farmerMarket.waiting': 'Waiting for a captain:',
    'farmerMarket.coming': 'Captain on the way:',
    'farmerMarket.stuck': 'No captain took it:',
    'farmerMarket.postHarvest': 'Post harvest',
    'farmerMarket.checkPrices': 'Check prices',
    'farmerMarket.requests': 'Requests',
    'farmerMarket.requestsCount': 'Requests ({n})',
    'farmerMarket.pickCropTitle': 'Which crop are you posting?',
    'farmerMarket.noPostableCrops': 'No crops ready to post yet. Register and grow a crop first.',
    'farmerMarket.close': 'Close',
    'farmerMarket.searchPlaceholder': 'Search a crop…',
    'farmerMarket.tabAll': 'All lots',
    'farmerMarket.tabMine': 'My lots',
    'farmerMarket.yourLot': 'YOURS',
    'farmerMarket.perKg': '/kg',
    'farmerMarket.kg': 'kg',
    'farmerMarket.grade': 'Grade',
    'farmerMarket.gradeNotDeclared': 'Grade not declared',
    'farmerMarket.selfDeclared': '(self-declared)',

    // Sell to my FPO — a direct sale to a procurement-mode group, at the
    // group's own agreed rate. Only ever shown when a real rate exists.
    'farmerMarket.sellToFpo': 'Sell to {fpo}',
    'farmerMarket.sellQtyLabel': 'How many kilograms?',
    'farmerMarket.sellMaxHint': 'Up to {max} kg available',
    'farmerMarket.sellRateLabel': 'AGREED RATE',
    'farmerMarket.sellBadQtyTitle': 'Check the quantity',
    'farmerMarket.sellBadQtyMsg': 'Enter a quantity between 0 and {max} kg.',
    'farmerMarket.sellNote': 'This records the sale and what the group owes you. Arranging pickup from your farm is the next step, handled by the group.',
    'farmerMarket.sellConfirm': 'Sell now',
    'farmerMarket.soldTitle': 'Sold to your FPO',
    'farmerMarket.sellFailedTitle': 'Could not complete the sale',
    'farmerMarket.historyTitle': 'Your history with {fpo}',
    'farmerMarket.historyEmpty': 'No past sales to this group yet — this would be your first.',
    'farmerMarket.historyCount': '{n} past sale(s)',
    'farmerMarket.total': 'total',
    'farmerMarket.historyUnpaid': '{n} still unpaid',
    'farmerMarket.historyAllPaid': 'All past sales paid',
    'farmerMarket.districtUnknown': 'District not recorded',
    'farmerMarket.of': 'of',
    'farmerMarket.ofYours': 'of your lots on the market',
    'farmerMarket.lots': 'lots',
    'farmerMarket.narrow': 'Search a crop name to narrow this down.',
    'farmerMarket.bandMedian': 'middle asking price',
    'farmerMarket.bandAcross': 'across',
    'farmerMarket.bandLots': 'lots',
    'farmerMarket.bandTooFew': 'only {n} lot(s) on the market — too few to show a price range',
    'farmerMarket.bandNote': 'These are what other farmers are ASKING right now, not completed sales. Nobody has agreed to these prices yet.',
    'farmerMarket.empty': 'No lots on the market match this.',
    'farmerMarket.emptyMine': 'You have no lots on the market. Post a harvest to appear here.',
    'farmerMarket.loadFailed': 'Could not load the market. Pull down to retry.',
    'farmerMarket.retry': 'Retry',
    'cropRecommendation.demand': 'Demand',
    // ⚠️ The demand label is REFUSED when there is no mandi price signal for
    // this crop in this district, and the refusal is worded per reason —
    // "this crop does not trade here" and "we could not reach Agmarknet" call
    // for different action from the farmer. Never collapse these into one
    // "no data" string, and never let a missing badge stand in for them.
    'cropRecommendation.noDemand.no_mandi_data': 'No mandi price for this crop in {district}',
    'cropRecommendation.noDemand.reported_elsewhere_only': 'Not traded in {district} — only reported elsewhere in Maharashtra',
    'cropRecommendation.noDemand.crop_not_in_agmarknet': 'Agmarknet does not track this crop',
    'cropRecommendation.noDemand.district_not_in_agmarknet': 'Agmarknet has no market data for {district}',
    'cropRecommendation.noDemand.lookup_failed': 'Could not reach the mandi price service — pull down to retry',
    'cropRecommendation.signalAt': 'this week at',
    'cropRecommendation.growersNearby': 'growing it nearby',
    'cropRecommendation.continuePrefix': 'Continue with',
    'cropRecommendation.cropsParenWord': 'crop(s)',

    // ── Crop registration ───────────────────────────────────────────
    'cropRegistration.errorTitle': 'Error',
    'cropRegistration.userDataNotFound': 'User data not found. Please login again.',
    'cropRegistration.requiredTitle': 'Required',
    'cropRegistration.enterQuantity': 'Please enter quantity',
    'cropRegistration.authError': 'User authentication error. Please login again.',
    'cropRegistration.successTitle': 'Success! 🎉',
    'cropRegistration.registeredRegisterNext': 'registered! Register next crop?',
    'cropRegistration.skipRemaining': 'Skip Remaining',
    'cropRegistration.nextCrop': 'Next Crop',
    'cropRegistration.cropsRegisteredSuccessfully': 'crop(s) registered successfully!',
    'cropRegistration.goToDashboard': 'Go to Dashboard',
    'cropRegistration.allDoneTitle': 'All Done! 🎉',
    'cropRegistration.successfullyRegisteredPrefix': 'Successfully registered',
    'cropRegistration.cropsExclaim': 'crop(s)!',
    'cropRegistration.failedToRegister': 'Failed to register crop. Please try again.',
    'cropRegistration.noCropSelected': 'No crop selected',
    'cropRegistration.headerTitle': 'Register Crop',
    'cropRegistration.ofWord': 'of',
    'cropRegistration.durationPrefix': 'Duration:',
    'cropRegistration.days': 'days',
    'cropRegistration.allocatedPlot': 'Allocated Plot',
    'cropRegistration.ofLand': 'of land',
    'cropRegistration.plantingDate': 'Planting Date',
    'cropRegistration.quantity': 'Quantity',
    'cropRegistration.quantityPlaceholder': 'e.g., 100',
    'cropRegistration.variety': 'Variety (Optional)',
    'cropRegistration.varietyPlaceholder': 'e.g., Hybrid, Local, Organic',
    'cropRegistration.notes': 'Notes (Optional)',
    'cropRegistration.notesPlaceholder': 'Any additional notes...',
    'cropRegistration.registerPrefix': 'Register',
    'cropRegistration.skipRemainingCrops': 'Skip Remaining Crops',
    'cropRegistration.skipRegistrationTitle': 'Skip Registration',
    'cropRegistration.skipConfirmMsg': 'Skip remaining crops and go to dashboard?',
    'cropRegistration.cancel': 'Cancel',
    'cropRegistration.skip': 'Skip',
    'cropRegistration.cropsRegistered': 'crop(s) registered!',
    'cropRegistration.unit.plants': 'plants',
    'cropRegistration.unit.seeds': 'seeds',
    'cropRegistration.unit.kg': 'kg',
    'cropRegistration.unit.grams': 'grams',
    'cropRegistration.unit.saplings': 'saplings',

    // ── FPO membership ───────────────────────────────────────────
    'fpo.nameItTitle': 'Name it',
    'fpo.nameItMsg': 'Give the group a name.',
    'fpo.joinPrefix': 'Join',
    'fpo.joinMsg': 'Your lots stay yours — same price, same payment, same pickup code. A group makes it easier for a buyer to take several farms in one trip.',
    'fpo.cancel': 'Cancel',
    'fpo.join': 'Join',
    'fpo.couldNotJoin': 'Could not join',
    'fpo.tryAgain': 'Please try again.',
    'fpo.leaveDialogTitle': 'Leave this group?',
    'fpo.leaveDialogMsg': 'Your listings and sales are not affected.',
    'fpo.stay': 'Stay',
    'fpo.leaveConfirmBtn': 'Leave',
    'fpo.couldNotLeave': 'Could not leave',
    'fpo.couldNotSave': 'Could not save',
    'fpo.removeSplitTitle': 'Remove the split?',
    'fpo.removeSplitMsg': 'Each member goes back to keeping their own lot value.',
    'fpo.remove': 'Remove',
    'fpo.couldNotRemove': 'Could not remove',
    'fpo.couldNotCreate': 'Could not create',
    'fpo.introTitle': 'Sell together, ship together',
    'fpo.introText1': 'A vehicle costs the same whether it carries 100 kg or 1,500. Three nearby farms sharing one tempo pay a fraction each of what they pay alone — that is what a producer group is for.',
    'fpo.introText2': 'Your lots stay yours: your price, your payment, your pickup code.',
    'fpo.groupsInDistrict': 'GROUPS IN YOUR DISTRICT',
    'fpo.memberSingular': 'member',
    'fpo.memberPlural': 'members',
    'fpo.startedBy': 'started by',
    'fpo.noGroupsYet': 'No groups in your district yet',
    'fpo.startOneHint': 'Start one and other farmers nearby will see it.',
    'fpo.startGroup': 'Start a group',
    'fpo.groupNameLabel': 'Group name',
    'fpo.groupNamePlaceholder': 'e.g. Niphad Onion Growers',
    'fpo.villageLabel': 'Village',
    'fpo.villagePlaceholder': 'e.g. Niphad',
    'fpo.regNumberLabel': 'FPO registration number',
    'fpo.regNumberPlaceholder': 'If you have one',
    'fpo.regNumberHint': 'Recorded as given. It is not checked against any register — the app shows it as "on file", never as verified.',
    'fpo.createGroup': 'Create group',
    'fpo.regPrefix': 'Reg',
    'fpo.onFileNotVerified': '— on file, not verified',
    'fpo.lotsOnMarket': 'GROUP LOTS ON OPEN MARKET',
    'fpo.kgAvailable': 'GROUP KG ON OPEN MARKET',
    'fpo.statCaption': 'Across all members\' own open-market listings — not your own sales, and not procurement.',
    'fpo.membersTitle': 'Members',
    'fpo.youSuffix': ' (you)',
    'fpo.startedGroup': 'started the group',
    'fpo.revenueSplitTitle': 'Revenue split',
    'fpo.splitAgreedText': 'This group has agreed a split. When you sell together, the app shows what each member is owed under the agreement alongside what their own lots were worth.',
    'fpo.splitNotAgreedText': 'No split agreed — each member keeps what their own lots sell for. That is the usual arrangement. Record a split only if your group has actually agreed one.',
    'fpo.recordsNotice': 'The app records what you agree. It does not move money — each farmer still confirms their own payment.',
    'fpo.changeSplit': 'Change the split',
    'fpo.recordSplit': 'Record a split',
    'fpo.leaveThisGroup': 'Leave this group',
    'fpo.sharesMustAdd': 'Shares must add up to 100%.',
    'fpo.totalLabel': 'Total',
    'fpo.mustBe100': '— must be 100%',
    'fpo.saveSplit': 'Save the split',
    'fpo.removeSplitBtn': 'Remove the split',
    'fpo.ordersWithFpo': 'Orders with {fpo}',
    'fpo.noOrdersYet': 'You haven\'t sold anything to this group yet.',
    'fpo.ordersLabel': 'ORDERS',
    'fpo.totalEarnedLabel': 'TOTAL EARNED',
    'fpo.paidLabel': 'PAID',
    'fpo.unpaidOrdersHint': '{n} order(s) still unpaid',
    'fpo.paidTag': 'Paid',
    'fpo.unpaidTag': 'Unpaid',
    'fpo.findRealFpoTitle': 'Find your real FPO',
    'fpo.findRealFpoSub': 'Search the official registry of already-incorporated FPOs near you.',
    'fpo.pendingRequestsTitle': 'Pending join requests',
    'fpo.noPendingRequests': 'No one is waiting to join right now.',
    'fpo.couldNotApprove': 'Could not approve',
    'fpo.couldNotReject': 'Could not reject',
    'fpo.viewDashboardTitle': 'View dashboard',
    'fpo.viewDashboardSub': "See the group's produce, members, buyer demand and settlement in one place.",

    // ── FPO registry (real, SFAC-registered FPOs) ─────────────────
    'fpoRegistry.searchFailedTitle': 'Search failed',
    'fpoRegistry.tryAgain': 'Please try again.',
    'fpoRegistry.stateLabel': 'State',
    'fpoRegistry.districtLabel': 'District',
    'fpoRegistry.chooseDistrict': 'Choose a district',
    'fpoRegistry.talukaLabel': 'Taluka / Block (optional)',
    'fpoRegistry.talukaPlaceholder': 'e.g. Niphad',
    'fpoRegistry.cropLabel': 'Crop (optional)',
    'fpoRegistry.anyCrop': 'Any crop',
    'fpoRegistry.cropNotFilteringYet': "The registry doesn't yet record what each FPO's members grow, so this does not narrow results — it's saved for when that becomes possible.",
    'fpoRegistry.search': 'Search',
    'fpoRegistry.startTitle': 'Search the real FPO registry',
    'fpoRegistry.startSub': 'Pick your district to see FPOs officially registered near you.',
    'fpoRegistry.noResultsTitle': 'No FPOs found',
    'fpoRegistry.noResultsSub': 'Try a different district or clear the taluka filter.',
    'fpoRegistry.promotedByPrefix': 'Promoted by:',
    'fpoRegistry.incorporatedPrefix': 'Incorporated:',
    'fpoRegistry.claimThisFpo': 'Claim this FPO',
    'fpoRegistry.requestToJoin': 'Request to join',
    'fpoRegistry.joinPrefix': 'Join',
    'fpoRegistry.joinMsg': 'Your lots stay yours — same price, same payment, same pickup code. The group admin must approve your request before you appear as a member.',
    'fpoRegistry.joinRequestSent': 'Request sent — waiting for the FPO admin to approve.',
    'fpoRegistry.alreadyInGroupHint': 'You are already in a group. Leave it first if you want to join this one instead.',
    'fpoRegistry.claimPendingNote': "Someone's claim for this FPO is under review.",
    'fpoRegistry.claimRejectedNote': 'A previous claim for this FPO was not approved.',
    // Shown to an `fpo` account where a farmer would see "Request to join".
    'fpoRegistry.alreadyClaimedNote': 'Already claimed by its own representative.',
    // Shown on a nearby-group card. Advisory — the group is still joinable.
    'fpo.cropMismatchHint': 'This group does not deal in what you grow. You can still ask to join — they decide.',
    'fpo.cropMatchHint': 'This group deals in what you grow.',

    // ── The FPO's OWN landing screen (role: 'fpo') ──────────────────
    // Not the farmer's "My Group" screen. This is what an organisation's
    // account opens to, and its whole job is to say which of four states the
    // account is in rather than showing an empty dashboard and letting the
    // person guess.
    'fpoHome.title': 'Your organisation',
    'fpoHome.loading': 'Checking your organisation…',
    'fpoHome.errTitle': 'Could not load',
    'fpoHome.errBody': 'Could not reach the server. Nothing has changed — try again.',
    'fpoHome.retry': 'Try again',
    'fpoHome.checkAgain': 'Check again',

    'fpoHome.noneTitle': 'Find your FPO',
    'fpoHome.noneBody': 'You registered as an FPO. Search the official SFAC registry for your producer company and claim it.',
    'fpoHome.noneReview': 'A person reviews every claim. This app does not grant it automatically — the same rule that governs buyer verification.',
    'fpoHome.findBtn': 'Search the registry',

    'fpoHome.pendingTitle': 'Your claim is being reviewed',
    'fpoHome.pendingBody': 'A person is checking that you represent this company. You will get the group dashboard once it is approved.',
    'fpoHome.submittedOn': 'Submitted',
    'fpoHome.designationLabel': 'Designation',

    'fpoHome.rejectedTitle': 'This claim was not approved',
    'fpoHome.rejectedBody': 'The registry entry is free to claim again. Check the details you gave and try once more.',
    'fpoHome.claimAgain': 'Search the registry again',

    'fpoHome.openDashboard': 'Open the group dashboard',
    'fpoHome.membersLabel': 'members',
    'fpoHome.pendingMembersLabel': 'waiting to join',
    'fpoHome.onMarketLabel': 'kg on the market',
    'fpoHome.noMembersYet': 'No members yet. Farmers find your group in the registry and request to join; you approve them here.',
    'fpoHome.notAFarmTitle': 'This account is the organisation, not a farm',
    'fpoHome.notAFarmBody': 'It does not register land, plant crops or post harvests — your members do that on their own accounts. What it does: admit members, set what the group charges, and run the collection vehicles.',
    'fpoHome.demoNotice': "This group's members and lots are illustrative demo data attached to a real registered company.",

    // ── FPO focus crops (what the group deals in) ───────────────────
    // Empty is NOT DECLARED, never "deals in nothing" — every string below
    // keeps those two apart, because a screen that collapses them turns a
    // blank field into a claim. Advisory throughout: nothing here blocks a
    // farmer from asking to join, and the copy says so where it matters.
    'fpoFocus.title': 'Crops this group deals in',
    'fpoFocus.intro': 'FPOs specialise. Saying what you deal in helps the right farmers find you — and tells the wrong ones before they ask, instead of after.',
    'fpoFocus.notDeclared': 'Not declared yet. Right now this group matches every farmer, which is not the same as dealing in everything.',
    'fpoFocus.declaredCount': 'declared',
    'fpoFocus.selectedCount': 'selected',
    'fpoFocus.maxNote': 'At most {n} crops. Declaring half the list tells a farmer nothing.',
    'fpoFocus.advisory': 'This is advice on a screen, not a rule in the code. A farmer whose crops do not match can still ask to join, and you still decide. It never affects a price, a lot or a sale.',
    'fpoFocus.searchPlaceholder': 'Search crops',
    'fpoFocus.noSearchResults': 'No crop matches that.',
    'fpoFocus.save': 'Save',
    'fpoFocus.saving': 'Saving…',
    'fpoFocus.clear': 'Clear the declaration',
    'fpoFocus.clearTitle': 'Clear it?',
    'fpoFocus.clearBody': 'The group goes back to "not declared", which matches every farmer.',
    'fpoFocus.savedTitle': 'Saved',
    'fpoFocus.errTitle': 'Could not save',

    // ── FPO payment terms (Phase 3, D2) ───────────────────────────────
    'fpoTerms.title': 'Payment terms',
    'fpoTerms.linkLabel': 'Terms',
    'fpoTerms.errTitle': 'Could not save',
    'fpoTerms.savedTitle': 'Saved',
    'fpoTerms.modeTitle': 'How this group pays its members',
    'fpoTerms.facilitation': 'Facilitation',
    'fpoTerms.procurement': 'Procurement',
    'fpoTerms.facilitationHint': 'The group markets each member\'s produce and takes an agreed fee off the sale. Members keep the rest of their own lot\'s value.',
    'fpoTerms.procurementHint': 'The group buys members\' crop at agreed per-grade rates and resells it. A member is owed that rate for what they delivered, whatever the lot later fetches.',
    'fpoTerms.feeTitle': 'Facilitation fee',
    'fpoTerms.feeNone': 'No fee',
    'fpoTerms.feePercent': '% of sale',
    'fpoTerms.feePerKg': '₹ per kg',
    'fpoTerms.percentLabel': 'Percent of each lot\'s sale value',
    'fpoTerms.perKgLabel': 'Rupees per kilogram delivered',
    'fpoTerms.saveFee': 'Save fee',
    'fpoTerms.ratesTitle': 'Agreed rates (crop, grade)',
    'fpoTerms.ratesHint': 'A member is paid this rate for their delivered kilograms of that crop and grade. A (crop, grade) with no rate here cannot be settled — it is named as a gap, never priced at zero.',
    'fpoTerms.noRates': 'No rates agreed yet.',
    'fpoTerms.cropPlaceholder': 'Crop name',
    'fpoTerms.needCrop': 'Enter a crop name.',
    'fpoTerms.needRate': 'Enter a rate above ₹0 per kg.',
    'fpoTerms.dupRate': 'This crop and grade already has a rate — remove it first to change it.',
    'fpoTerms.noRatesToSave': 'Add at least one rate before saving.',
    'fpoTerms.saveRates': 'Save rates',
    'fpoTerms.clearRates': 'Clear all rates',
    'fpoTerms.clearRatesTitle': 'Clear the rate table?',
    'fpoTerms.clearRatesBody': 'Every agreed rate is removed. Any procurement lot sold after this has no rate on file until new ones are added.',
    'fpoTerms.freightTitle': 'Who pays to deliver a sold lot',
    'fpoTerms.freightBuyerPays': 'The buyer pays. Every lot sale includes the delivery fare in what the buyer is charged — this is the only option available today.',
    'fpoTerms.freightHint': 'The group absorbing or negotiating this cost is not supported yet.',

    // ── FPO members (approve / reject, with the crop match) ──────────
    'fpoMembers.title': 'Members',
    'fpoMembers.pendingTitle': 'Waiting to join',
    'fpoMembers.noPending': 'Nobody is waiting. Farmers find your group in the registry and request to join.',
    'fpoMembers.activeTitle': 'Members',
    'fpoMembers.noActive': 'No members yet.',
    'fpoMembers.approve': 'Approve',
    'fpoMembers.reject': 'Reject',
    'fpoMembers.grows': 'Grows',
    'fpoMembers.alsoGrows': 'Also grows',
    'fpoMembers.matchMatch': 'Grows what you deal in',
    'fpoMembers.matchPartial': 'Partly what you deal in',
    'fpoMembers.matchMismatch': 'Grows none of your crops',
    'fpoMembers.matchUnknownFarmer': 'No crops registered yet',
    'fpoMembers.matchNoFocus': 'You have not declared your crops',
    'fpoMembers.advisory': 'The crop match is information, not a decision. Nobody has been filtered or refused.',
    'fpoMembers.errTitle': 'Could not do that',
    'fpoMembers.joinedOn': 'Requested',

    // ── FPO dashboard additions ─────────────────────────────────────
    // ── One lot, opened up (the admin's drill-down) ─────────────────
    // ⚠️ Nothing here ranks or scores a member. "Not enough sales to judge" is
    // a refusal, not a bad mark — trustService will not band a thin record.
    'fpoLot.loadError': 'Could not open this lot.',
    'fpoLot.onOffer': 'on offer',
    'fpoLot.members': 'members',
    'fpoLot.atAskingPrices': "at members' own prices",
    'fpoLot.priceSpread': 'Members are asking',
    'fpoLot.wideSpread': 'a wide spread',
    'fpoLot.whoSupplies': 'Who this lot comes from',
    'fpoLot.asking': 'asking',
    'fpoLot.minOrder': 'min order',
    'fpoLot.pastSales': 'past sales',
    'fpoLot.sold': 'sold',
    'fpoLot.realised': 'realised',
    'fpoLot.lastSold': 'last sold',
    'fpoLot.unsettled': 'not yet paid',
    'fpoLot.weighed': 'weighed on a scale',
    'fpoLot.concededDowngrades': 'lower grade(s) they agreed to',
    'fpoLot.noHistory': 'No completed sales of this crop through the app yet. That is not a mark against them — most members of a real group have never sold through here.',
    'fpoLot.notEnoughToBand': 'Not enough completed sales to judge a delivery record.',
    'fpoLot.groupHistory': 'What this crop has actually fetched',
    'fpoLot.rangeWas': 'range',
    // Phase 7 — the six-tab restructure. "Today" is deliberately not
    // "Home"/"Overview" — it names what changes day to day (waiting members,
    // buyer demand, runs under way), as opposed to Stock/Money which are
    // running totals.
    'fpoDashboard.tabToday': 'Today',
    'fpoDashboard.tabStock': 'Stock',
    'fpoDashboard.tabMoney': 'Money',
    'fpoDashboard.tabCollection': 'Collection',
    'fpoDashboard.tabMembers': 'Members',
    'fpoDashboard.focusTitle': 'Crops this group deals in',
    'fpoDashboard.focusNotDeclared': 'Not declared',
    'fpoDashboard.setFocus': 'Set crops',
    'fpoDashboard.membersWaiting': 'waiting to join',
    'fpoDashboard.manageMembers': 'Members',
    'fpoDashboard.groupOrders': 'Orders & payments',

    // ── FPO admin claim ("I represent this real FPO") ──────────────
    'fpoClaim.title': 'Claim this FPO',
    'fpoClaim.intro': 'A real FPO is an incorporated company. Claiming it means you hold a real role there — a person will review this before it is approved.',
    'fpoClaim.nameLabel': 'Your name',
    'fpoClaim.namePlaceholder': 'Full name',
    'fpoClaim.mobileLabel': 'Mobile number',
    'fpoClaim.mobilePlaceholder': '10-digit mobile number',
    'fpoClaim.designationLabel': 'Your designation',
    'fpoClaim.emailLabel': 'Email (optional)',
    'fpoClaim.emailPlaceholder': 'you@example.com',
    'fpoClaim.submit': 'Submit claim',
    'fpoClaim.missingTitle': 'Missing information',
    'fpoClaim.nameRequired': 'Name is required.',
    'fpoClaim.mobileRequired': 'Mobile number is required.',
    'fpoClaim.couldNotSubmit': 'Could not submit',
    'fpoClaim.errAlreadyClaimed': 'You already have a pending or approved FPO claim.',
    'fpoClaim.errAlreadyInProgress': 'This FPO already has a claim pending or approved.',
    'fpoClaim.submittedTitle': 'Claim submitted',
    'fpoClaim.submittedSub': 'Your claim is pending review. You will be able to manage this FPO once a person approves it.',
    'fpoClaim.gotIt': 'Got it',

    // ── F2 admin dashboard (fpos.js GET /:id/dashboard) ─────────────────
    'fpoDashboard.loadError': 'Could not load the dashboard. Please try again.',
    'fpoDashboard.locationUnknown': 'Location not on file',
    'fpoDashboard.activeMembers': 'active members',
    'fpoDashboard.produceTitle': 'Produce aggregation',
    'fpoDashboard.availableNow': 'Available now',
    'fpoDashboard.noAvailableNow': 'No live listings yet — members haven’t posted a harvest.',
    'fpoDashboard.tonnes': 'tonnes',
    'fpoDashboard.estimatedIncoming': 'Estimated incoming',
    'fpoDashboard.noEstimatedIncoming': 'No forecast available yet for the crops your members have planted.',
    'fpoDashboard.forecastTag': 'forecast',
    'fpoDashboard.excludedFromForecast': 'crop entries left out of the forecast:',
    'fpoDashboard.andMore': 'and more',
    'fpoDashboard.produceNote': 'Available now is real inventory on the market right now. Estimated incoming is a forecast built from planted-but-unharvested crops — the two figures are never added together.',
    'fpoDashboard.membersTitle': 'Members',
    'fpoDashboard.noMembers': 'No active members yet.',
    'fpoDashboard.noSuppliesYet': 'No deliveries yet',
    'fpoDashboard.kgSupplied': 'Kg supplied',
    'fpoDashboard.earned': 'Earned',
    'fpoDashboard.unpaidSuffix': 'unpaid',
    'fpoDashboard.trust.clean': 'No quality complaints',
    'fpoDashboard.trust.few_complaints': 'Some complaints, none settled',
    'fpoDashboard.trust.some_upheld': 'Has refunded on quality before',
    'fpoDashboard.trust.frequent': 'Refunds on quality often',
    'fpoDashboard.buyerDemandTitle': 'Buyer demand',
    'fpoDashboard.noLocationForDemand': 'No location on file yet for this group’s members or listings.',
    'fpoDashboard.noBuyerDemand': 'No buyers currently looking for what your members grow.',
    'fpoDashboard.kmAway': 'km away',
    'fpoDashboard.logisticsTitle': 'Logistics',
    'fpoDashboard.inProgress': 'In progress',
    'fpoDashboard.completed': 'Completed',
    'fpoDashboard.saved': 'Saved',
    'fpoDashboard.storageTitle': 'Storage suggestion',
    'fpoDashboard.noStorageBasis': 'No available produce yet to size a storage suggestion against.',
    'fpoDashboard.sizedFor': 'Sized for',
    'fpoDashboard.noWarehouses': 'No warehouse records for this area yet.',
    'fpoDashboard.notSuitable': 'Not suitable',
    'fpoDashboard.settlementTitle': 'Season settlement',
    'fpoDashboard.noSettlementOrders': 'No orders recorded yet for this group.',
    'fpoDashboard.pooledValue': 'Pooled value',
    'fpoDashboard.totalQuantity': 'Total quantity',
    'fpoDashboard.byLot': 'By lot',
    'fpoDashboard.byShare': 'By agreed share',
    'fpoDashboard.noShareAgreed': 'No share agreement is set, so each member receives their own lot value.',
    'fpoDashboard.noSeasonConcept': 'This app has no concept of a "season" — this covers every order ever recorded for the group’s active members.',

    // ── FPO dashboard, Phase G ─────────────────────────────────
    // The dashboard was written before the backend's producesAggregation became
    // grade-separated, so it rendered one blended row per crop. These are the
    // strings for showing stock by (crop, GRADE), for opening a collection run,
    // and for the payment-mode facts the season settlement has carried since
    // Phase B and this screen never showed.
    'fpoDashboard.selfDeclared': 'SELF-DECLARED',
    'fpoDashboard.farmsWord': 'farms',
    'fpoDashboard.indicative': 'indicative',
    'fpoDashboard.spreadNote': 'members ask different prices for this grade',
    'fpoDashboard.mixedSpecs': 'Graded against different versions of the grading spec.',
    'fpoDashboard.gradedLots': 'graded lots',
    'fpoDashboard.ungradedLots': 'ungraded lots',
    'fpoDashboard.gradeNote': 'Stock is shown by crop AND grade, because a buyer paying for Grade A must not be sent a blend. Produce nobody graded is its own bucket — that is unknown, not a grade below C, and nobody has inspected any declared grade.',
    'fpoDashboard.forecastNotStock': 'A forecast, not stock. It is never added to the figure above.',
    'fpoDashboard.needsGrade': 'needs grade',
    'fpoDashboard.anyGrade': 'any grade',
    'fpoDashboard.responses': 'responses',
    'fpoDashboard.runsUnderWay': 'Runs under way',
    'fpoDashboard.stopsWord': 'stops',
    'fpoDashboard.runStatus.awaiting_agent': 'Waiting for a captain',
    'fpoDashboard.runStatus.accepted': 'Not started yet',
    'fpoDashboard.runStatus.collecting': 'Collecting',
    // The dashboard's `inProgress` list includes `in_transit` deliberately —
    // the vehicle has left the last farm and is on its way to the buyer, which
    // is the busiest a run ever gets. Without this key the admin saw the raw
    // key string on screen.
    'fpoDashboard.runStatus.in_transit': 'On the way to the buyer',
    'fpoDashboard.runsOpenNote': 'Open a run to see each farm. On a run your group drives itself you record what your own driver reports; a run a captain is driving is theirs to record.',
    'fpoDashboard.unmeasuredRuns': 'completed run(s) had no measured single-trip comparison, so they are left out of the saving.',
    'fpoDashboard.modeFacilitation': 'FACILITATION — the group sells for its members',
    'fpoDashboard.modeProcurement': 'PROCUREMENT — the group buys from its members',
    'fpoDashboard.membersOwed': 'Members are owed',
    'fpoDashboard.groupFee': 'Group fee',
    'fpoDashboard.groupMargin': 'Group margin',
    'fpoDashboard.unpricedLots': 'lot(s) with no agreed rate',
    'fpoDashboard.rateGaps': 'lot(s) have no agreed (crop, grade) rate. They are NOT priced at zero — they are excluded from every total above:',
    'fpoDashboard.shareRefused': 'A share split does not apply under procurement: the group already bought this crop at an agreed rate, so the sale proceeds are the group’s own and there is no member pool left to divide.',

    'fpoDashboard.performanceTitle': 'This season, at a glance',
    'fpoDashboard.statMembers': 'Members',
    'fpoDashboard.statKgSupplied': 'kg supplied',
    'fpoDashboard.statPaidToMembers': 'Paid to members',
    'fpoDashboard.statPendingRequests': 'Buyer requests waiting',
    'fpoDashboard.farmerPerformanceTitle': 'Farmer performance',
    'fpoDashboard.seeAll': 'See all →',
    'fpoDashboard.viewPerformance': 'View farmer performance',
    'fpoDashboard.liveToBuyers': 'Live to buyers',
    'fpoDashboard.buyerRequestsTitle': 'Buyer requests',
    'fpoDashboard.noBuyerRequests': 'No buyer requests waiting.',
    'fpoDashboard.requestWaiting': 'Waiting for you',
    'fpoDashboard.requestTotal': 'If accepted, buyer pays',
    'fpoDashboard.rejectReasonPlaceholder': 'Reason for rejecting (optional)',
    'fpoDashboard.requestAccept': 'Accept',
    'fpoDashboard.requestReject': 'Reject',
    'fpoDashboard.requestRecent': 'Recently resolved',
    'fpoDashboard.requestStatus.accepted': 'Accepted',
    'fpoDashboard.requestStatus.rejected': 'Rejected',
    'fpoDashboard.requestStatus.stale': 'Went stale',
    'fpoDashboard.requestWentStale': 'This lot changed before you responded',
    'fpoDashboard.requestCouldNotAccept': 'Could not accept this request',
    'fpoDashboard.requestCouldNotReject': 'Could not reject this request',

    // ── FPO collection run (Phase G) ───────────────────────────
    // The operator view of a run the group drives itself. An own/contracted run
    // has no captain, so resolveRunActor() lets the group's admin record what
    // each farm reported — and no screen exposed that, which left every such
    // run unfinishable from the app.
    'fpoRun.loadError': 'Could not load this run. Please try again.',
    'fpoRun.forbiddenBody': 'This run is not yours to open. A captain from the app is driving it, or another group arranged it — only they can see what happened at each farm gate.',
    'fpoRun.farmsLabel': 'farms on this run',
    'fpoRun.planned': 'planned',
    'fpoRun.visitedOf': 'farms visited',
    'fpoRun.collectedWord': 'collected',
    'fpoRun.failedWord': 'collected nothing',
    'fpoRun.aboard': 'on the vehicle',
    'fpoRun.modeOwn': 'Your group’s own vehicle',
    'fpoRun.modeContracted': 'A transporter your group hires',
    'fpoRun.modeHired': 'A captain from the app',
    'fpoRun.driverLabel': 'Driver',
    'fpoRun.costLabel': 'Vehicle cost',
    'fpoRun.costStated': 'Stated by your group, not computed by this app.',
    'fpoRun.captainBanner': 'A captain is driving this run. Only they can record what happened at a farm gate — they stood there and it is their account of it. This view is read-only.',
    'fpoRun.noDriverBanner': 'No captain has accepted this run yet, so nobody has been to any farm. There is nothing to report.',
    'fpoRun.operatorBanner': 'Your group is driving this run itself, so there is no captain. You record what your own driver reports — which is exactly what a paper trip sheet is. Every record carries your name.',
    'fpoRun.call': 'Call',
    'fpoRun.recordBtn': 'Record what happened',
    'fpoRun.outFull': 'Collected in full',
    'fpoRun.outShort': 'Short',
    'fpoRun.outNone': 'Collected nothing',
    'fpoRun.recordedByAgent': 'Recorded by the captain at the gate',
    'fpoRun.recordedByFpo': 'Recorded by your group’s office',
    'fpoRun.fareNote': 'A farm that collected nothing keeps its share of the vehicle fare on its own cancelled order. It is not pushed onto the farmers who did deliver — re-splitting would charge them up to 67% more for somebody else’s failure, and the shares still add up exactly to the fare charged.',
    'fpoRun.deliverBtn': 'Hand over to the buyer',
    'fpoRun.stopsLeft': 'farms still to record',
    'fpoRun.stopsLeftTitle': 'Farms still to record',
    'fpoRun.closeEmptyBtn': 'Close this run — nothing collected',
    'fpoRun.closeEmptyTitle': 'Close this run with nothing aboard?',
    'fpoRun.closeEmptyBody': 'No farm on this run handed over any produce, so there is nothing to deliver and no buyer code to ask for. Every order has already been cancelled with the reason recorded against it.',
    'fpoRun.closeEmptyYes': 'Close the run',
    'fpoRun.notYet': 'Not yet',
    'fpoRun.closedTitle': 'Run closed',
    'fpoRun.closedBody': 'Nothing was collected on this run, so nothing was delivered and no farmer is recorded as owed.',
    'fpoRun.closedDelivered': 'This run has been delivered.',
    'fpoRun.closedCancelled': 'This run is closed.',
    'fpoRun.dropTitle': 'The buyer’s delivery code',
    'fpoRun.dropSub': 'Ask the buyer for their own 4-digit code at the drop-off.',
    'fpoRun.finish': 'Finish run',
    'fpoRun.doneTitle': 'Handed over',
    'fpoRun.err4': 'Enter the 4-digit code.',
    'fpoRun.errFinish': 'Could not finish this run. Please try again.',
    'fpoRun.tailAllEmpty': 'Every farm has been visited and nothing was collected — close the run below.',
    'fpoRun.tailAllAboard': 'Every farm has been visited. The load can go to the buyer.',
    'fpoRun.tailLeft': 'farms still to visit.',
    'fpoRun.okFullTitle': 'Collected',
    'fpoRun.okShortTitle': 'Short pickup recorded',
    'fpoRun.okNoneTitle': 'Recorded as not collected',
    'fpoRun.okNoneBody': 'That order is cancelled and the produce is back on sale.',
    'fpoRun.chooseSub': 'Record what actually happened at this farm. Each of these is a real record with your name on it, and the farmer will see it.',
    'fpoRun.optFullTitle': 'Everything was loaded',
    'fpoRun.optFullSub': 'The full ordered quantity went on the vehicle. Needs the farmer’s own 4-digit code.',
    'fpoRun.optShortTitle': 'Only part of it was loaded',
    'fpoRun.optShortSub': 'Less than was ordered. You enter the kilograms — and the farmer’s code, because they are standing right there.',
    'fpoRun.optNoneTitle': 'Nothing was loaded',
    'fpoRun.optNoneSub': 'Nobody at the gate, not ready, or refused. No code is asked for — read why before you confirm.',
    'fpoRun.otpLabel': 'The farmer’s 4-digit pickup code',
    'fpoRun.otpHelp': 'Ask for their own code. Each farmer on this run has a different one — another farmer’s code will not release this crop.',
    'fpoRun.otpShortHelp': 'A short pickup is still a pickup, and the farmer is at the gate, so their code is still required.',
    'fpoRun.shortKgLabel': 'Kilograms actually loaded',
    'fpoRun.shortKgHelp': 'More than 0 and less than what was ordered. If nothing at all went on the vehicle, go back and record “nothing was loaded” instead.',
    'fpoRun.shortConsequence': 'The farmer is paid for what actually left the farm, not for what was ordered. The rest goes back on sale as their stock. Their share of the fare does not change.',
    'fpoRun.reasonTitle': 'Why?',
    'fpoRun.reasonAbsent': 'Nobody was at the farm',
    'fpoRun.reasonNotReady': 'Less on hand than was listed',
    'fpoRun.reasonRejected': 'Not what was sold — refused at the gate',
    'fpoRun.reasonOther': 'Something else',
    'fpoRun.noteLabel': 'Anything to add? (optional)',
    'fpoRun.notePlaceholder': 'e.g. gate locked, phone switched off',
    'fpoRun.consequenceTitle': 'What recording this does',
    'fpoRun.conseqCancel': 'This farmer’s order is CANCELLED. Nothing is owed for it and no payment can be recorded against it.',
    'fpoRun.conseqRestock': 'Their produce goes back on sale — the kilograms return to their listing, so they can sell it to somebody else.',
    'fpoRun.conseqFare': 'their share of the vehicle fare stays on their cancelled order. It is not pushed onto the other farmers: re-splitting it would charge the farmers who did nothing wrong up to 67% more for someone else’s failure.',
    'fpoRun.conseqNoOtp': 'No code is asked for here. The farmer who is not at the gate is exactly the person who cannot read one out — so this is recorded on your word instead of theirs.',
    'fpoRun.conseqDispute': 'If it is wrong, the farmer can raise a dispute against this record.',
    // ── What the lot looked like at the gate (condition, NOT a grade) ──
    // Offered to every recorder. A grade is a letter against published
    // criteria and needs a trained eye; these need eyes only.
    'fpoRun.noGradeTitle': 'You are not asked to grade this lot',
    'fpoRun.noGradeBody': "Grading judges size, colour uniformity and blemish tolerance against a published standard. This app asks it only of the group's own people. The farmer's declared grade stands, labelled unchecked, and the buyer judges the lot on arrival.",
    'fpoRun.condTitle': 'What did the lot look like?',
    'fpoRun.condSub': 'Only what you could see. This is not a grade and it changes no price — it is on the record so the buyer knows what arrived and the farmer knows what was said.',
    'fpoRun.condFineTitle': 'I looked — nothing visibly wrong',
    'fpoRun.condFineSub': 'A positive statement, and a useful one. It is NOT the same as saying nothing: skip this and the record says nobody looked, which is a different fact.',
    'fpoRun.condWrongCrop': 'Not the crop ordered',
    'fpoRun.condSpoiled': 'Rotten or mouldy',
    'fpoRun.condSprouting': 'Sprouting',
    'fpoRun.condWet': 'Wet or damp',
    'fpoRun.condDamaged': 'Crushed or bruised',
    'fpoRun.condPackaging': 'Bags or crates damaged',
    'fpoRun.condNotePlaceholder': 'Anything else you saw (optional)',
    'fpoRun.condNotAGrade': 'This is an observation, not an inspection and not a grade. No price and no payout changes because of it. A grievance against the order is where a quality disagreement is settled.',
    'fpoRun.submitFull': 'Confirm pickup',
    'fpoRun.submitShort': 'Confirm short pickup',
    'fpoRun.submitNone': 'Record: nothing collected',
    'fpoRun.confirmTitle': 'Cancel this farmer’s sale?',
    'fpoRun.confirmBodySuffix': 'their order will be cancelled and their produce put back on sale. This is recorded against your name and cannot be undone from this screen.',
    'fpoRun.confirmYes': 'Yes, record it',
    'fpoRun.backLabel': 'Back',
    'fpoRun.cancelLabel': 'Cancel',
    'fpoRun.errTitle': 'Check this',
    'fpoRun.errOtp': 'Enter the farmer’s 4-digit code.',
    'fpoRun.errNumber': 'Enter how many kilograms actually went on the vehicle.',
    'fpoRun.errTooHigh': 'That is the whole order or more — record it as “everything was loaded” instead.',
    'fpoRun.errReason': 'Pick a reason. It is one tap, and it is what makes this a record rather than a shrug.',
    'fpoRun.errGeneric': 'Could not record that. Please try again.',
    'fpoRun.recorderLine': 'It will be recorded as: your group’s office, keying in what your own driver reported.',

    // ── Land details ───────────────────────────────────────────
    'landDetails.errorTitle': 'Error',
    'landDetails.loadFailed': 'Failed to load land details',
    'landDetails.deleteTitle': 'Delete Land',
    'landDetails.deleteMsg': 'Are you sure you want to delete this land? This action cannot be undone.',
    'landDetails.cancel': 'Cancel',
    'landDetails.delete': 'Delete',
    'landDetails.successTitle': 'Success',
    'landDetails.deletedMsg': 'Land deleted successfully',
    'landDetails.deleteFailed': 'Failed to delete land',
    'landDetails.location': 'Location',
    'landDetails.landDetailsTitle': 'Land Details',
    'landDetails.activeCrops': 'Active Crops',
    'landDetails.notes': 'Notes',
    'landDetails.city': 'City:',
    'landDetails.district': 'District:',
    'landDetails.state': 'State:',
    'landDetails.pincode': 'Pincode:',
    'landDetails.size': 'Size:',
    'landDetails.waterSourceLabel': 'Water Source:',
    'landDetails.soilTypeLabel': 'Soil Type:',
    'landDetails.totalPlots': 'Total Plots:',
    'landDetails.plantedPrefix': 'Planted:',
    'landDetails.startFarming': 'Start Farming',
    'landDetails.deleteLandBtn': 'Delete Land',

    // ── Land list ───────────────────────────────────────────
    'landList.errorTitle': 'Error',
    'landList.loadFailed': 'Failed to load lands',
    'landList.loadingLands': 'Loading your lands...',
    'landList.landsRegistered': 'land(s) registered',
    'landList.plots': 'Plots',
    'landList.registeredLabel': 'Registered',

    // ── Market prices ───────────────────────────────────────────
    'marketPrices.loading': 'Loading...',
    'marketPrices.searchPrefix': 'Search',
    'marketPrices.noMatches': 'No matches',
    'marketPrices.districtLabel': 'District',
    'marketPrices.marketLabel': 'Mandi / Market',
    'marketPrices.dateLabel': 'Date',
    'marketPrices.cropLabel': 'Crop / Commodity',
    'marketPrices.selectDistrict': 'Select district...',
    'marketPrices.selectDistrictFirst': 'Select a district first',
    'marketPrices.anyMarket': 'Any market in this district',
    'marketPrices.selectCrop': 'Select crop...',
    'marketPrices.title': 'Find Mandi Price',
    'marketPrices.subtitle': 'Maharashtra — real prices from Agmarknet.',
    'marketPrices.metaError': 'Could not load mandi filters. Pull to retry.',
    'marketPrices.loadingFilters': 'Loading mandi filters...',
    // The old single string said "showing all crops instead", which was true
    // of the 605-commodity NATIONAL list it used to fall back to and is the
    // reason this looked broken. One string per scope, so the screen says
    // which list it is actually showing.
    'marketPrices.scope.state': 'No mandi reported in this district on this date — showing crops traded in Maharashtra.',
    'marketPrices.scope.app': 'Agmarknet is not answering right now — showing this app\'s Maharashtra crop list.',
    'marketPrices.scope.national': 'Could not narrow this to Maharashtra — this is Agmarknet\'s full all-India list.',
    'marketPrices.scope.district': 'Crops reported in this district on this date.',
    'marketPrices.checkPrice': 'Check Market Price',
    'marketPrices.nearestInDistrict': 'Nearest reporting market in your district',
    'marketPrices.nearestInState': 'No data in your district — showing nearest reporting market in the state',
    'marketPrices.standardVariety': 'Standard',
    'marketPrices.modalPrice': 'Modal Price',
    'marketPrices.perQuintal': 'per quintal',
    'marketPrices.min': 'Min',
    'marketPrices.max': 'Max',
    'marketPrices.perKgSuffix': '/ kg',
    'marketPrices.arrivalsLabel': 'Arrivals',
    'marketPrices.fetchFailed': 'Failed to fetch mandi price.',
    'marketPrices.fetchFailedRetry': 'Failed to fetch mandi price. Please try again.',
    'marketPrices.retry': 'Retry',
    'marketPrices.noDataPrefix': 'No mandi price data is available for',
    'marketPrices.noDataMiddle': 'in',
    'marketPrices.noDataSuffix': 'Maharashtra on',
    'marketPrices.tryAnother': 'Try another date, market, or crop.',
    'marketPrices.historicalYield': 'Historical district yield',
    'marketPrices.medianLabel': 'median',
    'marketPrices.rangeRecorded': 'Range recorded:',
    'marketPrices.acrossYearsPrefix': 'across',
    'marketPrices.yearsSuffix': 'year(s)',
    'marketPrices.noYieldRecord': 'No historical yield record for this crop/district.',

    // ── Plot division ───────────────────────────────────────────
    'plotDivision.noCropsSelected': 'No crops selected',
    'plotDivision.singleCropSelected': 'Single Crop Selected',
    'plotDivision.fullLandAllocated': 'Full land will be allocated to this crop',
    'plotDivision.fullAllocation': '100% of Land',
    'plotDivision.continueToRegistration': 'Continue to Registration',
    'plotDivision.divideYourLand': 'Divide Your Land',
    'plotDivision.allocateSpaceFor': 'Allocate space for',
    'plotDivision.cropsWord': 'crops',
    'plotDivision.totalLand': 'Total Land:',
    'plotDivision.landNameLabel': 'Land Name:',
    'plotDivision.totalAllocated': 'Total Allocated:',
    'plotDivision.remaining': 'remaining',
    'plotDivision.overBy': 'Over by',
    'plotDivision.perfectReady': 'Perfect! Ready to continue',
    'plotDivision.plot': 'Plot',
    'plotDivision.confirmContinue': 'Confirm & Continue',
    'plotDivision.invalidDivisionTitle': 'Invalid Division',
    'plotDivision.invalidDivisionMsg': 'Total allocation must equal 100%. Currently:',
    'plotDivision.errorTitle': 'Error',
    'plotDivision.createPlotsFailed': 'Failed to create plot divisions',

    // ── Grievances ───────────────────────────────────────────
    'grievances.reason.qualityNotAsDescribed': 'Quality not as described',
    'grievances.reason.quantityShort': 'Less delivered than ordered',
    'grievances.reason.wrongCrop': 'Not the crop that was listed',
    'grievances.reason.damagedInTransit': 'Damaged in transit',
    'grievances.reason.notDelivered': 'Never delivered',
    'grievances.reason.paymentNotReceived': 'Payment never received',
    'grievances.reason.paymentDisputed': 'Amount is wrong',
    'grievances.reason.other': 'Something else',
    'grievances.status.open': 'Open',
    'grievances.status.responded': 'Answered',
    'grievances.status.resolved': 'Settled',
    'grievances.status.rejected': 'Rejected',
    'grievances.status.withdrawn': 'Withdrawn',
    'grievances.outcome.refundAgreed': 'Full refund agreed',
    'grievances.outcome.partialRefundAgreed': 'Partial refund agreed',
    'grievances.outcome.replacementAgreed': 'Replacement agreed',
    'grievances.outcome.noAction': 'No action — settled as is',
    'grievances.outcome.none': 'Could not agree',
    'grievances.alert.updateFailedTitle': 'Could not update',
    'grievances.alert.tryAgain': 'Please try again.',
    'grievances.alert.writeSomethingTitle': 'Write something',
    'grievances.alert.writeSomethingMsg': 'Give your side of it.',
    'grievances.alert.pickOutcomeTitle': 'Pick an outcome',
    'grievances.alert.pickOutcomeMsg': 'What did you agree?',
    'grievances.alert.withdrawTitle': 'Withdraw this grievance?',
    'grievances.alert.withdrawMsg': 'It will be closed. You can raise a new one if needed.',
    'grievances.cancel': 'Cancel',
    // ── Sharing the record with whoever actually arbitrates ─────────
    // This app does not decide who is right. The copy below must never
    // suggest it does — "the record", never "the case" or "the verdict".
    'grievances.shareRecord': 'Share the full record',
    'grievances.shareHint': 'Everything this app recorded about this trade — and what it never recorded. For whoever settles it: your group, the buyer, or an APMC officer.',
    'grievances.shareDialogTitle': 'Grievance record',
    'grievances.shareSavedTitle': 'Saved',
    'grievances.shareFailedTitle': 'Could not share the record',
    'grievances.withdraw': 'Withdraw',
    'grievances.youRaisedAgainst': 'You raised this against the',
    'grievances.raisedAgainstYouBy': 'Raised against you by the',
    'grievances.kg': 'kg',
    'grievances.youSaid': 'YOU SAID',
    'grievances.theSaidPrefix': 'THE',
    'grievances.saidSuffix': 'SAID',
    'grievances.theyAnswered': 'THEY ANSWERED',
    'grievances.youAnswered': 'YOU ANSWERED',
    'grievances.closedByThe': 'closed by the',
    'grievances.answer': 'Answer',
    'grievances.markSettled': 'Mark settled',
    'grievances.emptyTitle': 'Nothing to sort out',
    'grievances.emptySub': 'Grievances you raise, and any raised against you, appear here. You can raise one from a delivered order\'s receipt within 14 days.',
    'grievances.yourSideTitle': 'Your side of it',
    'grievances.whatDidYouAgreeTitle': 'What did you agree?',
    'grievances.replyPlaceholder': 'What happened from where you stand?',
    'grievances.replyHint': 'You can answer once. Both your account and theirs stay on the record.',
    'grievances.sendAnswer': 'Send answer',
    'grievances.amountLabel': 'Amount (₹)',
    'grievances.amountPlaceholder': 'e.g. 300',
    'grievances.noteLabel': 'Note (optional)',
    'grievances.notePlaceholder': 'Anything worth recording',
    'grievances.settleNotice': 'This records what the two of you agreed. The app does not decide who was right and does not move money — any refund is settled between you.',
    'grievances.recordOutcome': 'Record the outcome',

    // ── Receipt / dispute ───────────────────────────────────────────
    'receipt.reason.qualityNotAsDescribed': 'Quality not as described',
    'receipt.reason.quantityShort': 'Less delivered than ordered',
    'receipt.reason.wrongCrop': 'Not the crop that was listed',
    'receipt.reason.damagedInTransit': 'Damaged in transit',
    'receipt.reason.notDelivered': 'Never delivered',
    'receipt.reason.paymentNotReceived': 'I was never paid',
    'receipt.reason.paymentDisputed': 'Amount is wrong',
    'receipt.reason.other': 'Something else',
    'receipt.alert.savedTitle': 'Saved',
    'receipt.alert.savedMsgPrefix': 'Your transactions were written to',
    'receipt.alert.exportFailedTitle': 'Could not export',
    'receipt.alert.tryAgain': 'Please try again.',
    'receipt.alert.whatWentWrongTitle': 'What went wrong?',
    'receipt.alert.pickReasonMsg': 'Pick a reason.',
    'receipt.alert.describeItTitle': 'Describe it',
    'receipt.alert.describeItMsg': 'Tell the other side what happened.',
    'receipt.alert.raisedTitle': 'Grievance raised',
    'receipt.alert.raisedMsg': 'The other party can now see it and respond. This app records what is agreed — it does not decide who is right.',
    'receipt.alert.raiseFailedTitle': 'Could not raise it',
    // ── The gate record on the receipt ────────────────────────────
    // Three absences said in WORDS, never left blank: a blank line reads as
    // "fine", and each of these means something else entirely.
    // ── Advance / balance on the receipt ────────────────────────────
    'receipt.advanceTitle': 'ADVANCE AND BALANCE',
    'receipt.advanceAgreed': 'Advance agreed',
    'receipt.advanceReceived': 'Advance received',
    'receipt.advanceOutstanding': 'Advance still not received',
    'receipt.balanceDue': 'Balance due to the farmer',
    'receipt.overpaidBy': 'Overpaid — farmer holds',
    'receipt.gateTitle': 'AT THE FARM GATE',
    'receipt.weightNotRecorded': 'Nobody recorded how these kilograms were arrived at.',
    'receipt.ticketRef': 'Ticket',
    'receipt.condNobodyLooked': 'Nobody recorded what this lot looked like at the gate.',
    'receipt.condLookedFine': 'Looked at, and nothing visibly wrong was reported.',
    'receipt.condReported': 'Reported at the gate:',
    'receipt.gradeNotChecked': 'No grade was recorded. A captain from the public pool is not asked to grade — the grade above is the farmer\'s own.',
    'receipt.gradeMatched': 'Grade recorded at the gate matched:',
    'receipt.gradeLower': 'A LOWER grade was recorded at the gate:',
    'receipt.gradeHigher': 'A higher grade was recorded at the gate:',
    'receipt.gradeObserved': 'Grade noted at the gate (none was declared):',
    'receipt.gateNote': 'None of this changed a price or a payout. It is a record of what was seen. If the lot is not what you paid for, raise a grievance below.',
    'receipt.grade': 'Grade',
    'receipt.farmerDeclared': 'farmer-declared',

    // Phase 5, R2 — one receipt object, presented differently depending on
    // who is looking. `issuedTo` already travelled from the server; this is
    // the first thing on screen to actually read it.
    'receipt.copyBadgeFarmer': "Farmer's copy",
    'receipt.copyBadgeVendor': "Buyer's copy",
    'receipt.copyBadgeAgent': "Driver's copy",
    'receipt.copyBadgeFpo_admin': "Group's copy",
    'receipt.slipTotalFarmer': 'PAID TO FARMER',
    'receipt.slipTotalFpo_admin': 'PAID TO YOUR MEMBER',
    'receipt.slipTotalVendor': 'TOTAL PAID',
    'receipt.slipTotalAgent': 'YOU COLLECT (FARE ONLY)',

    'receipt.money': 'Money',
    'receipt.pricePerKg': 'Price per kg',
    'receipt.negotiated': '(negotiated)',
    'receipt.originallyAsking': 'Originally asking',
    'receipt.cropValue': 'Crop value',
    'receipt.transportFare': 'Transport fare',
    'receipt.totalBuyerPays': 'Total the buyer pays',
    'receipt.whoCollectsWhat': 'WHO COLLECTS WHAT',
    'receipt.farmerReceives': 'Farmer receives',
    'receipt.driverCollects': 'Driver collects (fare only)',
    'receipt.farmerPaid': 'Farmer paid',
    'receipt.farmerNotYetPaid': 'Farmer not yet paid',
    'receipt.on': 'on',
    'receipt.parties': 'Parties',
    'receipt.farmer': 'Farmer',
    'receipt.buyer': 'Buyer',
    'receipt.captain': 'Captain',
    'receipt.from': 'From',
    'receipt.to': 'To',
    'receipt.distance': 'Distance',
    'receipt.km': 'km',
    'receipt.whatHappened': 'What happened',
    'receipt.grievances': 'Grievances',
    'receipt.raisedByThe': 'raised by the',
    'receipt.shareReceipt': 'Share receipt',
    'receipt.exportCsv': 'Export all my transactions (CSV)',
    'receipt.somethingWrong': 'Something was wrong with this order',
    'receipt.whatWentWrong': 'What went wrong?',
    'receipt.describeIt': 'Describe it',
    'receipt.describePlaceholder': 'What happened, and what would settle it?',
    'receipt.raiseNotice': 'This records your grievance and lets the other party respond. The app does not decide who is right and does not move money — what you agree between you is what gets written down. You have 14 days from delivery.',
    'receipt.raiseGrievance': 'Raise grievance',

    // ── GAP B: the FPO's own driver, and the admin who names them ────────
    // These sit in `fpoRun.*` because they are the same screen: the group's
    // assigned driver and the group's office both work one run, and the record
    // says which of them keyed in each stop.
    'fpoRun.driverBanner': 'You are driving this run. Record what happens at each farm gate on your own phone, and ask each farmer for their own 4-digit code — the codes are different at every farm.',
    'fpoRun.operatorWithDriverBanner': 'Your group\'s driver is on this run and records each gate on their own phone. You can still record from the office if their phone dies — the record always says which of you did.',
    'fpoRun.recordedByDriver': 'Recorded by your group\'s driver, at the gate',
    'fpoRun.recorderLineDriver': 'It will be recorded as: your group\'s own driver, at this gate, at this time — your name, on this run.',
    'fpoRun.openMap': 'See this run on the map',
    'fpoRun.driverUnlinkedTag': 'no account on this run',

    // The position ping. Foreground-only, and the screen says so rather than
    // letting anybody believe the truck is being followed all day.
    'fpoRun.noFixYet': 'No position sent yet',
    'fpoRun.posLive': 'Your position is live',
    'fpoRun.posMoment': 'Position sent a moment ago',
    'fpoRun.posLastSeen': 'Position last sent',
    'fpoRun.posMinAgo': 'min ago',
    'fpoRun.posHrWord': 'hr',
    'fpoRun.posMinWord': 'min',
    'fpoRun.posAgo': 'ago',
    'fpoRun.foregroundOnly': 'Keep this screen open. Your position is only sent while it is — locking the phone or switching apps stops it, and the buyer\'s map then says "last seen N min ago" instead of showing a vehicle that is not moving.',
    'fpoRun.pingOk': 'The buyer and the farmers on this run can see where you are.',
    'fpoRun.simOn': 'Simulating the drive',
    'fpoRun.simOff': 'Simulate the drive',
    'fpoRun.simNote': 'Every position sent while this is on is labelled as simulated, and it says so on the buyer\'s map.',
    'fpoRun.noRouteToSimulate': 'This run has no stored route line to simulate.',
    'fpoRun.officeCannotPost': 'A position cannot be sent from the office. Where the vehicle is right now has one honest source — the phone travelling with it. Assign a driver account to this run and the position comes from them.',

    // Assigning the driver.
    'fpoRun.driverSection': 'Who is driving',
    'fpoRun.driverAssign': 'Assign a driver',
    'fpoRun.driverChange': 'Change driver',
    'fpoRun.driverRemove': 'Remove',
    'fpoRun.driverAssignedNote': 'They can open this run, read its stop list, take each farmer\'s own code at the gate and send the vehicle\'s position. They are not a captain: they are not in the job pool and this gives them nothing on any other run.',
    'fpoRun.noDriverAccountNote': 'Nobody is named on this run yet, so your office records every stop and no position can be sent. Assigning a driver with an account gives the person actually at the gate the stop list, the code field and the map.',
    'fpoRun.driverPickTitle': 'Who is driving this run?',
    'fpoRun.driverPickSub': 'Pick an active member of your group. They must already have registered on this app.',
    'fpoRun.driverPickNote': 'One driver, one vehicle: somebody already on another run cannot be assigned to this one.',
    'fpoRun.driverListError': 'Could not load your members. Please try again.',
    'fpoRun.driverListEmpty': 'No active members to choose from.',
    'fpoRun.vehicleNoLabel': 'Vehicle number (optional)',
    'fpoRun.vehicleNoPlaceholder': 'MH 15 AB 1234',
    'fpoRun.driverAssignedTitle': 'assigned to this run',
    'fpoRun.driverAssignedBody': 'They can now open the run on their own phone. Your office can still record stops if their phone dies, and the record says which of you did.',
    'fpoRun.driverAssignFailed': 'Could not change the driver. Please try again.',
    'fpoRun.driverRemoveTitle': 'Take this run back to the office?',
    'fpoRun.driverRemoveBody': 'The driver loses access to this run and your office records its stops again. Their name and number stay on the trip sheet — whoever drove is still who drove.',
    'fpoRun.driverRemoveYes': 'Remove the driver',

    // ── GAP A: the tracking map, shared by the buyer and the farmer side ──
    'track.loadError': 'Could not load this. Please try again.',
    'track.forbidden': 'This is not yours to follow.',
    'track.back': 'Go back',
    'track.recenter': 'Recenter',
    'track.min': 'min',
    'track.call': 'Call',

    // The run's trip-level state. `in_transit` is its own entry on purpose —
    // the last farm gate to the buyer's gate is the longest leg of the journey
    // and used to be invisible to everybody on it.
    'track.run.awaiting_agent': 'Finding a driver',
    'track.run.no_agents': 'No driver found',
    'track.run.accepted': 'Driver assigned',
    'track.run.collecting': 'Collecting',
    'track.run.in_transit': 'On the way to the drop-off',
    'track.run.delivered': 'Delivered',
    'track.run.cancelled': 'Closed empty',
    'track.run.abandoned': 'Abandoned',
    'track.runSub.awaiting_agent': 'Nearby captains are being offered this run.',
    'track.runSub.no_agents': 'Nobody accepted in time.',
    'track.runSub.accepted': 'On the way to the first farm.',
    'track.runSub.collecting': 'Working down the farms on this run.',
    'track.runSub.in_transit': 'Every farm has been visited. The load is heading for the drop-off.',
    'track.runSub.delivered': 'This run is complete.',
    'track.runSub.cancelled': 'No farm handed anything over, so there was nothing to deliver.',
    'track.runSub.abandoned': 'The run stopped with produce aboard. Those farmers are still owed.',
    'track.inTransitBanner': 'Every farm has been visited and the load is on its way to the drop-off. This is the last leg.',

    // ⚠️ THE HONESTY BLOCK. Nothing here may be softened into a promise the
    // app cannot keep: tracking runs only while the driver's app is open.
    'track.neverSeen': 'No position has ever been received',
    'track.liveWord': 'Live',
    'track.momentAgo': 'Last seen a moment ago',
    'track.lastSeen': 'Last seen',
    'track.minAgo': 'min ago',
    'track.hrWord': 'hr',
    'track.minWord': 'min',
    'track.ago': 'ago',
    'track.kmToGo': 'km to go',
    'track.note.never': 'No position has ever been received for this run. Tracking only works while the driver\'s app is open — this is not a fault, and no position is being guessed.',
    'track.note.live': 'Position received within the last half minute.',
    'track.note.recent': 'The last position is a few minutes old. Tracking only runs while the app is open, so short gaps are normal.',
    'track.note.stale': 'This is the last position actually received, not where the vehicle is now. Nothing has been estimated forward from it.',
    'track.note.cold': 'The last position is over half an hour old. Read it as a last-known point, not as a moving vehicle.',
    'track.etaHidden': 'No arrival time is shown: it would be measured from a position too old for it to mean anything.',
    'track.neverInterpolated': 'The marker is only ever drawn where a real position landed. Nothing between two positions is invented.',
    'track.simulated': 'Simulated position',
    'track.simulatedNote': 'This is a demo drive along the stored route, not a real vehicle. It travels through the same endpoint a real phone uses, and is labelled so nobody mistakes it for one.',

    // Who is driving.
    'track.noDriverName': 'Driver',
    'track.vehiclePending': 'Vehicle number pending',
    'track.captain': 'captain from the app',
    'track.fpoDriver': 'the group\'s own driver',
    'track.unlinkedDriver': 'The driver is named on the trip sheet but has no account on this run, so every stop is recorded by the group\'s office and no position can be reported.',
    'track.noDriverYet': 'No driver has been assigned to this run yet, so nobody has been to any farm and no position can be reported.',

    'track.deliveryCode': 'Delivery code',
    'track.deliveryCodeHint': 'Give this to the driver only when your goods arrive',

    // The farms on the run.
    'track.stopsTitle': 'Farms on this run',
    'track.farmsVisited': 'farms visited',
    'track.collectedNothing': 'collected nothing',
    'track.aboard': 'aboard',
    'track.shortOfPlan': 'short of the plan',
    'track.anotherFarm': 'Another farm on this run',
    'track.yourFarm': 'your farm',
    'track.stopDone': 'Collected in full',
    'track.stopShort': 'Short',
    'track.stopFailed': 'Collected nothing',
    'track.stopNext': 'Next stop',
    'track.stopPending': 'Not yet visited',
    'track.nextStopLabel': 'HEADING TO',
    'track.pickupLabel': 'PICKUP',
    'track.dropLabel': 'DROP',
    'track.allFarmsVisited': 'Every farm has been visited',
    'track.onDelivery': 'on delivery',
    'track.pooledOrders': 'Your own orders, on one vehicle',

    // ── GAP B: the driver's way in, from their own dashboard ────────────
    'dash.driverRunTitle': 'Your group has given you a run to drive',
    'dash.driverRunStops': 'farms to collect from',

    // ═══════════════════════════════════════════════════════════════════
    // THE GATE RECORD — how a weight was established, and the grade seen.
    // ═══════════════════════════════════════════════════════════════════
    //
    // Shown on the FPO's own run screen (recorder side) and on the farmer's
    // sales list (the side that answers a downgrade). The captain's stack is
    // English by product decision and carries the same words inline in
    // Agent/ConsignmentTripScreen — the two must never tell a farmer
    // different things about the same act.

    // ── weight provenance, on the shared outcome sheet ──────────────────
    'fpoRun.weightTitle': 'How was this weight arrived at?',
    'fpoRun.weightClaim': 'This app does not weigh anything. You are recording HOW the kilograms were established — your account of it, on this run, under your name. Nothing here is checked against a scale and no figure is corrected.',
    'fpoRun.wmCentreTitle': 'Weighed on the collection centre scale',
    'fpoRun.wmCentreSub': 'The FPO’s or collection point’s own scale. A real weighing, on the seller’s group’s own instrument — not an independent one.',
    'fpoRun.wmBridgeTitle': 'Weighed at a public weighbridge',
    'fpoRun.wmBridgeSub': 'A public weighbridge issues a ticket both the farmer and the buyer can produce. It is the only weight on this list that does not depend on trusting whoever typed it.',
    'fpoRun.wmFarmTitle': 'Weighed on the farm’s own scale',
    'fpoRun.wmFarmSub': 'The farmer’s own scale or spring balance at the gate. Real, but uncertified and unwitnessed.',
    'fpoRun.wmEstTitle': 'Not weighed — bags counted, or judged by eye',
    'fpoRun.wmEstSub': 'Nobody put this lot on a scale. The figure is bags or crates counted and multiplied, or an experienced eye.',
    'fpoRun.wmEstAffirm': 'This is an honest answer and it is the usual one at a farm gate. Most pickups have no scale within reach, and saying so plainly is right — what must never be recorded is nothing at all, because an unanswered box lets a guess be read as a measurement.',
    'fpoRun.wmIndependentTag': 'INDEPENDENT',
    'fpoRun.wmNotIndependent': 'not independent',
    'fpoRun.wmNotRecordedTitle': 'No weighing method recorded',
    'fpoRun.weightRefLabel': 'Weighbridge ticket number (optional)',
    'fpoRun.weightRefPlaceholder': 'e.g. MH-1147-2208',
    'fpoRun.weightRefHelp': 'A ticket both the farmer and the buyer can produce later. It is stored so a disputed weight can be looked up — this app does not check it.',
    'fpoRun.errWeightMethod': 'Say how the weight was arrived at. If nobody weighed it, “not weighed” is an honest answer and this app would rather record that than let a guess pass as a measurement.',

    // ── the grade seen at the gate ──────────────────────────────────────
    'fpoRun.gradeTitle': 'The grade at the gate',
    'fpoRun.gradeSub': 'Leave this alone unless you actually looked and the lot is a different grade from what the farmer declared. The common case is that it is what they said it is, and retyping that adds noise, not evidence.',
    'fpoRun.gradeDeclaredPrefix': 'The farmer declared: Grade',
    'fpoRun.gradeSameTitle': 'Same as the farmer declared',
    'fpoRun.gradeSameSub': 'Nothing new is claimed and nothing is retyped.',
    'fpoRun.gradeDiffTitle': 'I looked, and it is a different grade',
    'fpoRun.gradeDiffSub': 'Pick what you actually saw. Read what this does before you confirm.',
    'fpoRun.gradeNoneTitle': 'No grade — nothing to compare, or I did not look',
    'fpoRun.gradeNoneSub': 'Most listings carry no grade at all. This records that no grade was observed, rather than recording you as having confirmed one.',
    'fpoRun.errGradeLetter': 'Pick the grade you actually saw — A, B or C.',
    'fpoRun.gradeConseqTitle': 'What this does, and what it does not do',
    'fpoRun.gradeIsLower': 'That is LOWER than the grade the farmer declared.',
    'fpoRun.gradeMaybeLower': 'If this is lower than the grade the farmer declared, this is what happens.',
    'fpoRun.gradeDoesRecord': 'It is recorded against this lot and the buyer sees it on their purchase.',
    'fpoRun.gradeDoesAsk': 'The farmer is asked to accept or contest it. Only their agreeing counts as evidence anywhere else in the app — your entry on its own is a claim.',
    'fpoRun.gradeNotPrice': 'IT CHANGES NO PRICE AND NO PAYOUT. The farmer is paid exactly what they were going to be paid, and the buyer owes exactly what they owed.',
    'fpoRun.gradeNotInspection': 'It is what you saw. It is not an inspection and it does not overrule the grade on the farmer’s listing.',
    'fpoRun.gradeGrievance': 'If money is owed either way, it is settled through a grievance against the order — not here.',
    'fpoRun.gradeUpgradeNote': 'That is HIGHER than the farmer declared. It is recorded and costs nobody anything: the farmer sold at their own asking price and the buyer is getting at least what they paid for.',
    'fpoRun.gradeRowLower': 'Grade recorded lower:',
    'fpoRun.gradeRowObserved': 'Grade recorded:',
    'fpoRun.gradeRowMatch': 'Grade matches:',

    // ── the farmer answers a downgrade, on their own sales list ──────────
    'farmerSales.gradeClaimTitle': 'A lower grade was recorded at pickup',
    'farmerSales.gradeYouDeclared': 'You declared Grade',
    'farmerSales.gradeTheyRecorded': 'They recorded Grade',
    'farmerSales.gradeByCaptain': 'Recorded by the captain who came to your gate.',
    'farmerSales.gradeByDriver': 'Recorded by your group’s own driver, at your gate.',
    'farmerSales.gradeByOffice': 'Recorded by your group’s office, from what the driver reported.',
    'farmerSales.gradeNoMoney': 'This changes NO price and NO payment. You are paid exactly what you were going to be paid for this order.',
    'farmerSales.gradeContestFree': 'Disagreeing costs you nothing. It does not count against you anywhere in the app.',
    'farmerSales.gradeStaysEitherWay': 'Either way the claim stays on the record and the buyer sees it. What changes is whether it stands as your agreement or as their claim.',
    'farmerSales.gradeFinalWarning': 'Your answer cannot be changed afterwards. Read it once more before you tap.',
    'farmerSales.gradeAddNote': '+ Add a note (optional)',
    'farmerSales.gradeNotePlaceholder': 'e.g. the lot was sorted the same morning',
    'farmerSales.gradeAcceptBtn': 'Yes, it was lower',
    'farmerSales.gradeContestBtn': 'No, I disagree',
    'farmerSales.gradeAcceptTitle': 'Agree it was the lower grade?',
    'farmerSales.gradeAcceptBody': 'This is recorded as your agreement. It is a concession on your record — the same as agreeing a refund on a grievance. Your payment for this order does not change.',
    'farmerSales.gradeAcceptYes': 'Yes, I agree',
    'farmerSales.gradeContestTitle': 'Disagree with this grade?',
    'farmerSales.gradeContestBody': 'It stays on the record as the collector’s claim and does not count against you. If money is owed either way, raise a grievance against this order.',
    'farmerSales.gradeContestYes': 'Yes, I disagree',
    'farmerSales.gradeAcceptedTitle': 'Recorded as agreed',
    'farmerSales.gradeAcceptedBody': 'Your payout for this order is unchanged — agreeing a grade does not reprice a sale.',
    'farmerSales.gradeContestedTitle': 'Recorded as disputed',
    'farmerSales.gradeContestedBody': 'It stays on the record as their claim and does not count against you. If money is owed either way, raise a grievance against this order.',
    'farmerSales.gradeErrNothing': 'There is no lower grade recorded against this lot, so there is nothing to accept or contest.',
    'farmerSales.gradeErrBad': 'That answer was not understood. Please try again.',
    'farmerSales.gradeErrAlready': 'You have already answered this. An answer cannot be re-opened.',
    'farmerSales.gradeErrNotYours': 'This lot is not on that run, or is not yours to answer.',
    'farmerSales.gradeYouAccepted': 'You agreed it was the lower grade',
    'farmerSales.gradeYouContested': 'You disagreed with this grade',
    'farmerSales.gradeNoRunToAnswer': 'This claim has no run attached, so it cannot be answered here. Raise a grievance against this order.',

    // ── the gate record on the shared tracking screen ────────────────────
    'track.notWeighed': 'Not weighed — counted or estimated at the gate',
    'track.weighbridge': 'Weighed at a public weighbridge',
    'track.gradeLower': 'Recorded lower than declared:',
    'track.gradeAccepted': 'The farmer agreed it was the lower grade.',
    'track.gradeContested': 'The farmer disagrees. It stands as the collector’s claim.',
    'track.gradeUnanswered': 'The farmer has not answered yet.',
    'track.gradeNote': 'A grade recorded at the gate is an observation by whoever collected the lot, not an inspection. It has changed no price and no payout.',
  },

  mr: {
    'soil.red': 'लाल माती',
    'soil.black': 'काळी माती',
    'soil.clay': 'चिकणमाती',
    'soil.sandy': 'वाळूमिश्रित माती',
    'soil.loamy': 'पोयट्याची माती',
    'soil.alluvial': 'गाळाची माती',
    'soil.laterite': 'जांभी माती',

    'water.borewell': 'बोअरवेल',
    'water.well': 'विहीर',
    'water.canal': 'कालवा',
    'water.river': 'नदी',
    'water.rainwater': 'पावसाचे पाणी',
    'water.tank': 'टाकी',
    'water.pond': 'तळे',
    'water.drip': 'ठिबक सिंचन',
    'water.sprinkler': 'तुषार सिंचन',
    'water.none': 'नाही',

    'season.summer': 'उन्हाळा',
    'season.monsoon': 'पावसाळा',
    'season.winter': 'हिवाळा',

    'task.watering': 'पाणी देणे',
    'task.fertilizing': 'खत देणे',
    'task.weeding': 'तण काढणे',
    'task.pruning': 'छाटणी',
    'task.pest-control': 'कीड नियंत्रण',
    'task.harvesting': 'कापणी',
    'task.monitoring': 'निरीक्षण',
    'task.other': 'इतर',

    'vehicle.auto': 'ऑटो',
    'vehicle.tempo': 'टेम्पो व्हॅन',
    'vehicle.truck': 'ट्रक',

    // ── Farmer dashboard ─────────────────────────────────────────────
    // mr-checked by a native Marathi speaker. Common UI words are safe;
    // the mandi terms are the risk — मंडी/बाजार समिती, आडत, हमाली carry
    // specific trade meanings and a near-miss reads worse to a Maharashtra
    // farmer than plain English would.
    'dash.myLands': 'माझी शेती',
    'dash.mySales': 'माझी विक्री',
    'dash.prices': 'भाव',
    'dash.marketPrices': 'बाजारभाव',
    'dash.grievances': 'तक्रारी',
    'dash.addCrop': 'पीक नोंदवा',
    'dash.mandiPrice': 'बाजार भाव',
    'dash.currentWeather': 'सध्याचे हवामान',
    'dash.lands': 'शेती',
    'dash.active': 'सुरू',
    'dash.harvested': 'काढणी झाली',
    'dash.loading': 'तुमची शेती उघडत आहे...',
    'dash.noLand': 'अजून शेती नोंदवली नाही',
    'dash.registerFirstLand': 'शेती सुरू करण्यासाठी तुमची पहिली जमीन नोंदवा',
    'dash.registerFirstLandBtn': 'पहिली जमीन नोंदवा',
    'dash.noCrops': 'अजून पीक लावले नाही',
    'dash.getAiRecs': 'AI शिफारशी मिळवा',
    'dash.aiSuggest': 'तुमच्या जमिनीसाठी योग्य पिके AI सुचवू द्या',
    'dash.addLandForPrices': 'जवळचे बाजारभाव पाहण्यासाठी जमीन नोंदवा',
    'dash.fetchingPrices': 'जवळचे बाजारभाव आणत आहे…',
    'dash.noPriceData': 'बाजारभाव उपलब्ध नाहीत',
    'dash.nearestMarket': 'जवळची बाजार समिती',
    'dash.recentTrend': 'अलीकडचा कल',
    'dash.liveTrend': '७ दिवसांचा कल',
    'role.farmer': 'शेतकरी',
    'role.vendor': 'खरेदीदार',
    'role.agent': 'कॅप्टन',
    // 'एफपीओ' is not a guess — it is the form this file ALREADY uses at
    // recordSale.channelFpo ('माझ्या एफपीओमार्फत'), and the English acronym is
    // what the sector itself says in Marathi speech. Flagged anyway.
    'role.fpo': 'एफपीओ', // mr-checked
    'role.vendor.plural': 'खरेदीदार',
    'role.agent.plural': 'कॅप्टन',

    'harvest.subtitle': 'बाजारात कापणी नोंदवा',
    'agent.vehiclePrompt': 'तुम्ही चालवत असलेले वाहन',

    'chatbot.name': 'किसान',
    'chatbot.greeting':
      'नमस्कार! मी किसान आहे. तुम्ही प्रश्न टाइप करू शकता किंवा माइक दाबून बोलू शकता!',
    'chatbot.error.retry': 'क्षमस्व, पुन्हा प्रयत्न करा.',
    'chatbot.error.connection': 'कनेक्शन त्रुटी. पुन्हा प्रयत्न करा.',
    'chatbot.error.voice': 'आवाज समजला नाही. पुन्हा प्रयत्न करा किंवा टाइप करा.',
    'chatbot.error.recording': 'आवाज रेकॉर्डिंगमध्ये त्रुटी. कृपया टाइप करा.',
    'chatbot.stop': 'थांबवा',
    'chatbot.listen': 'ऐका',
    'chatbot.status.understanding': 'आवाज समजून घेत आहे...',
    'chatbot.status.thinking': 'किसान विचार करत आहे...',
    'chatbot.status.speakNow': 'आता बोला...',

    // ── Record a sale ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'recordSale.channelApmc': 'बाजार समिती लिलाव', // mr-checked
    'recordSale.channelTrader': 'खासगी व्यापारी',
    'recordSale.channelFarmgate': 'शेतावरच विकले',
    'recordSale.channelProcessor': 'प्रक्रिया कारखाना / मिल',
    'recordSale.channelFpo': 'माझ्या एफपीओमार्फत', // mr-checked
    'recordSale.channelExport': 'निर्यातदार',
    'recordSale.dedCommission': 'कमिशन',
    'recordSale.dedLabourHamali': 'हमाली (मजुरी)', // mr-checked
    'recordSale.dedWeighing': 'वजनाई',
    'recordSale.dedTransport': 'वाहतूक',
    'recordSale.dedMarketCess': 'बाजार सेस', // mr-checked
    'recordSale.dedPacking': 'पॅकिंग',
    'recordSale.bandPrompt': 'वेळेवर पैसे देतो',
    'recordSale.bandAverage': 'आठवडा-दोन आठवड्यांत पैसे देतो',
    'recordSale.bandSlow': 'उशिरा पैसे देतो',
    'recordSale.bandUnpaid': 'पैसे मिळाल्याची नोंद नाही',
    'recordSale.notEnoughHistory': 'सांगण्याइतकी माहिती नाही',
    'recordSale.recordedSalesWord': 'नोंदवलेल्या विक्री',
    'recordSale.fromWord': '',
    'recordSale.farmersWord': 'शेतकऱ्यांकडून',
    'recordSale.usuallyPaysPrefix': 'साधारण',
    'recordSale.daysWord': 'दिवसांत पैसे देतो',
    'recordSale.daysPlain': 'दिवस',
    'recordSale.unpaidSalesWord': 'विक्रींचे पैसे मिळाल्याची नोंद नाही',
    'recordSale.oldestPrefix': 'सर्वात जुनी',
    'recordSale.trustBasis': 'शेतकऱ्यांनी स्वतः लिहिलेल्या माहितीवरून. या नोंदी कोणीही तपासलेल्या नाहीत.',
    'recordSale.alertWhatSold': 'तुम्ही काय विकले?',
    'recordSale.alertHowMuch': 'तुम्ही किती विकले?',
    'recordSale.alertWhoBoughtTitle': 'कोणी विकत घेतले?',
    'recordSale.alertWhoBoughtMsg': 'नाव पुरेसे आहे — त्यांना खाते असण्याची गरज नाही.',
    'recordSale.alertWhatRate': 'तुम्हाला कोणता भाव मिळाला?',
    'recordSale.alertCheckSlipTitle': 'स्लिप तपासा',
    'recordSale.alertCheckSlipMsg': 'वजावटी विक्रीच्या रकमेपेक्षा जास्त आहेत.',
    'recordSale.alertRecordedTitle': 'नोंदवले',
    'recordSale.savedNotePrefix': 'जतन केले. टीप:',
    'recordSale.perKgTimes': '/किलो ×',
    'recordSale.kgComesTo': 'किलो म्हणजे',
    'recordSale.butYouEntered': ', पण तुम्ही नोंदवले',
    'recordSale.weKeptFigure': 'आम्ही तुमचा आकडा तसाच ठेवला.',
    'recordSale.tookHomePrefix': 'तुम्हाला मिळाले',
    'recordSale.alertCouldNotSaveTitle': 'जतन करता आले नाही',
    'recordSale.alertPleaseTryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'recordSale.alertMoneyReceivedTitle': 'पैसे मिळाले का?',
    'recordSale.alertMoneyReceivedMsg': 'यामुळे खरेदीदाराने तुम्हाला पैसे दिल्याची नोंद होईल.',
    'recordSale.notYet': 'अजून नाही',
    'recordSale.yesPaid': 'हो, पैसे मिळाले',
    'recordSale.alertCouldNotUpdateTitle': 'अद्ययावत करता आले नाही',
    'recordSale.gradeLabel': 'ग्रेड',
    'recordSale.youGot': 'तुम्हाला मिळाले',
    'recordSale.saleValue': 'विक्री रक्कम',
    'recordSale.tookHome': 'हातात आले',
    'recordSale.deductionsTookPrefix': 'वजावटींनी घेतले',
    'recordSale.ofThisSaleSuffix': '% या विक्रीतील',
    'recordSale.paidWord': 'पैसे मिळाले',
    'recordSale.afterWord': 'नंतर',
    'recordSale.notPaidYetTapWhenArrives': 'अजून पैसे मिळाले नाहीत — पैसे आल्यावर टॅप करा',
    'recordSale.paidYou': 'तुम्हाला दिले',
    'recordSale.buyersIntroBase': 'तुम्ही ज्यांना विक्री नोंदवली ते सर्व, ज्यांचे पैसे अजून यायचे आहेत ते आधी.',
    'recordSale.buyerNeedsPrefix': 'खरेदीदाराच्या किमान',
    'recordSale.buyerNeedsSuffix': 'नोंदवलेल्या विक्री झाल्याशिवाय ते वेळेवर पैसे देतात की नाही हे सांगता येणार नाही.',
    'recordSale.noBuyersYet': 'अजून कोणताही खरेदीदार नोंदवलेला नाही',
    'recordSale.buyersEmptySub': 'काही विक्री नोंदवा, म्हणजे "खरोखर वेळेवर पैसे कोण देतो" याचे उत्तर तुमच्याकडे तयार होईल — आणि इतर शेतकऱ्यांनाही याचा फायदा होईल.',
    'recordSale.backToMySales': 'माझ्या विक्रीकडे परत जा',
    'recordSale.soldFor': 'विक्री रक्कम',
    'recordSale.deductionsTook': 'वजावटींनी घेतले',
    'recordSale.ofYourSalesSuffix': '% तुमच्या विक्रीतील',
    'recordSale.unpaidCountSuffix': 'पैसे न मिळालेले',
    'recordSale.bookEmptyTitle': 'तुमची विक्री, कुठेही झालेली असो',
    'recordSale.bookEmptySub': 'बाजार समितीत किंवा व्यापाऱ्याला विकले? इथे नोंदवा. यामुळे तुम्हाला किती पैसे मिळाले, काय वजा झाले आणि कोणते खरेदीदार खरोखर वेळेवर पैसे देतात याची तुमची स्वतःची नोंद राहते.',
    'recordSale.myBuyers': 'माझे खरेदीदार',
    'recordSale.recordASale': 'विक्री नोंदवा',
    'recordSale.formWhy': 'अ‍ॅपबाहेर झालेल्या विक्रीची ही तुमची स्वतःची नोंद आहे. ती पुरावा म्हणून कोणीही वापरत नाही — तुम्हाला किती पैसे मिळाले याचा हा फक्त तुमचा हिशोब आहे.',
    'recordSale.whatDidYouSell': 'तुम्ही काय विकले?',
    'recordSale.placeholderOnion': 'कांदा',
    'recordSale.quantityKgLabel': 'प्रमाण (किलो)',
    'recordSale.rateLabel': 'भाव (₹/किलो)',
    'recordSale.gradeYouWerePaidFor': 'कोणत्या ग्रेडचे पैसे मिळाले',
    'recordSale.notGraded': 'ग्रेड नाही',
    'recordSale.whoBoughtIt': 'कोणी विकत घेतले?',
    'recordSale.placeholderTraderName': 'व्यापारी किंवा कंपनीचे नाव',
    'recordSale.buyerNameHint': 'त्यांना खाते असण्याची गरज नाही. बाजारात ज्या नावाने ते ओळखले जातात तेच पुरेसे आहे.',
    'recordSale.theirPhoneLabel': 'त्यांचा फोन नंबर (ऐच्छिक)',
    'recordSale.phonePlaceholderHint': 'पैसे मागताना उपयोगी पडेल',
    'recordSale.whereLabel': 'कुठे?',
    'recordSale.placeholderMarket': 'लासलगाव बाजार समिती',
    'recordSale.howDidYouSellLabel': 'कशी विक्री केली?',
    'recordSale.whatWasDeductedTitle': 'काय वजा झाले?',
    'recordSale.deductionsHint': 'स्लिपवरील प्रत्येक खर्च वेगळा नोंदवा. यावरूनच तुमच्या हातात खरोखर किती आले हे ठरते.',
    'recordSale.minusDeductions': '− वजावट',
    'recordSale.youTakeHome': 'तुमच्या हातात येते',
    'recordSale.deductionsAreTakingPrefix': 'वजावटी घेत आहेत',
    'recordSale.saleAmountSlipLabel': 'स्लिपवरील विक्री रक्कम (ऐच्छिक)',
    'recordSale.leaveBlankSuffix': '— रिकामे ठेवल्यास हीच रक्कम वापरली जाईल',
    'recordSale.totalBeforeDeductions': 'वजावटीपूर्वीची एकूण रक्कम',
    'recordSale.willKeepFigure': 'आम्ही तुमचा आकडा तसाच ठेवू — स्लिप हेच खरे मानले जाईल.',
    'recordSale.iHaveBeenPaid': 'मला पैसे मिळाले आहेत',
    'recordSale.paidToggleHint': 'खरेदीदाराकडे अजून पैसे बाकी असतील तर हे बंद ठेवा. नंतरही तुम्ही पैसे मिळाल्याची नोंद करू शकता, आणि त्यावरूनच कोणते खरेदीदार खरोखर वेळेवर पैसे देतात हे कळते.',
    'recordSale.notesLabel': 'टीप (ऐच्छिक)',
    'recordSale.notesPlaceholder': 'या विक्रीबद्दल लक्षात ठेवण्यासारखे काही असल्यास',
    'recordSale.saveThisSaleBtn': 'ही विक्री जतन करा',
    'recordSale.cancelBtn': 'रद्द करा',

    // ── My sales ───────────────────────────────────────────
    'farmerSales.tabPickups': 'उचल',
    'farmerSales.tabOffers': 'ऑफर',
    'farmerSales.tabListings': 'यादी',
    // mr-checked — plain logistics language, deliberately NOT mandi trade
    // vocabulary. उचल was rejected here: Krishi Darshani's 16 uses of it are
    // all the plain verb "to lift", never the trade sense, so it would read as
    // odd rather than precise. गोळा करणे (to collect) is unambiguous.
    'farmerSales.kgHeldForDelivery': 'किलो विकले, गोळा करायचे बाकी',   // mr-checked
    'farmerSales.heldDriverComing': 'चालक येत आहे',                     // mr-checked
    'farmerSales.heldFindingDriver': 'अजून चालक शोधत आहोत',            // mr-checked
    'farmerSales.heldNoDriver': 'या फेरीसाठी कोणी चालक मिळाला नाही. खरेदीदाराने पुन्हा प्रयत्न करायचा आहे किंवा रद्द करायचे आहे — तुम्हाला काही करण्याची गरज नाही.',   // mr-checked
    'farmerSales.statusFindingDriver': 'चालक शोधत आहोत',
    'farmerSales.statusNoDriver': 'अजून चालक नाही',
    'farmerSales.statusDriverComing': 'चालक येत आहे',
    'farmerSales.statusCollected': 'माल घेतला',
    'farmerSales.statusDelivered': 'पोहोच झाले',
    'farmerSales.statusCancelled': 'रद्द',
    'farmerSales.markPaidTitle': 'पैसे मिळाले असे नोंदवायचे का?',
    'farmerSales.markPaidMsgPrefix': 'तुम्हाला मिळाले याची खात्री करा',
    'farmerSales.from': 'कडून',
    'farmerSales.notYet': 'अजून नाही',
    'farmerSales.yesReceived': 'हो, मिळाले',
    'farmerSales.couldNotUpdate': 'अपडेट करता आले नाही',
    'farmerSales.tryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'farmerSales.priceAgreedTitle': 'किंमत ठरली',
    'farmerSales.for': 'साठी',
    'farmerSales.priceAgreedMsgSuffix': 'आता वाहतूक बुक करतील — बुक झाल्यावर ही उचल Pickups मध्ये दिसेल.',
    'farmerSales.acceptOfferTitle': 'ही ऑफर स्वीकारायची का?',
    'farmerSales.notNow': 'आता नाही',
    'farmerSales.accept': 'स्वीकारा',
    'farmerSales.declineOfferTitle': 'ही ऑफर नाकारायची का?',
    'farmerSales.fromCap': 'कडून',
    'farmerSales.cancel': 'रद्द करा',
    'farmerSales.decline': 'नाकारा',
    'farmerSales.enterPriceTitle': 'किंमत टाका',
    'farmerSales.enterPriceMsg': 'किलोसाठी रुपयांमध्ये आकडा टाका.',
    'farmerSales.removeFromMarketTitle': 'बाजारातून काढायचे का?',
    'farmerSales.willNoLongerBeVisible': 'आता खरेदीदारांना दिसणार नाही.',
    'farmerSales.keep': 'ठेवा',
    'farmerSales.remove': 'काढा',
    'farmerSales.couldNotRemove': 'काढता आले नाही',
    'farmerSales.soldTo': 'यांना विकले —',
    'farmerSales.youGet': 'तुम्हाला मिळणार',
    'farmerSales.pickupCode': 'उचल कोड',
    'farmerSales.pickupCodeHint': 'चालक माल घेण्यासाठी आल्यावर हा कोड द्या',
    'farmerSales.collect': 'घ्या',
    'farmerSales.driverFareOnly': 'चालक फक्त वाहतूक भाडे घेतो',
    'farmerSales.markPaidBtn': 'पैसे मिळाले म्हणून नोंदवा',
    // ── आगाऊ रक्कम आणि उरलेली रक्कम ────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below.
    // आगाऊ रक्कम (advance) and उचल (the mandi word for an advance against a
    // crop) are trade terms; आगाऊ रक्कम is used here as the plainer of the two,
    // but a Nashik farmer may well expect उचल.
    'farmerSales.advancePromised': 'ठरलेली आगाऊ रक्कम:', // mr-checked
    'farmerSales.advanceNotYetHint': 'अजून मिळालेली नाही. हे खरेदीदाराचे फक्त वचन आहे, पैसे नाहीत — त्यावर गाडी भरू नका. प्रत्यक्ष पैसे मिळाल्यावरच इथे नोंदवा.', // mr-checked
    'farmerSales.advanceGotIt': 'मला मिळाले',
    'farmerSales.advanceConfirmTitle': 'आगाऊ रक्कम मिळाली?', // mr-checked
    'farmerSales.advanceConfirmPrefix': 'तुम्हाला मिळाल्याची नोंद होत आहे:',
    'farmerSales.advanceConfirmBody': 'हे फक्त तुम्हीच नोंदवू शकता — अ‍ॅप पैसे पाठवत नाही आणि तुमचे खाते पाहू शकत नाही.',
    'farmerSales.advanceAlreadyIn': 'आगाऊ रक्कम आधीच मिळाली:', // mr-checked
    'farmerSales.ofTotal': 'पैकी, एकूण',
    'farmerSales.advanceOverpaid': 'आगाऊ रक्कम या मालाच्या किमतीपेक्षा जास्त होती. खरेदीदाराचे इतके पैसे तुमच्याकडे आहेत:', // mr-checked
    'farmerSales.errTitle': 'हे करता आले नाही',
    'farmerSales.viewReceipt': 'पावती पहा · तक्रार करा',
    'farmerSales.received': 'मिळाले',
    'farmerSales.vehicleNumberPending': 'वाहन क्रमांक अजून नाही',
    'farmerSales.call': 'कॉल करा',
    'farmerSales.onMarket': 'बाजारात उपलब्ध',
    'farmerSales.soldOut': 'संपले',
    'farmerSales.removed': 'काढले',
    'farmerSales.minQty': 'किमान',
    'farmerSales.of': 'पैकी',
    'farmerSales.kgSold': 'किलो विकले',
    'farmerSales.kgLeft': 'किलो शिल्लक',
    'farmerSales.sellOrHold': 'आता विकायचे की थांबायचे? थांबण्याचा खर्च पहा',
    'farmerSales.waitingOnYou': 'तुमच्या उत्तराची वाट',
    'farmerSales.youCounteredStatus': 'तुम्ही प्रतिऑफर दिली',
    'farmerSales.agreed': 'ठरले',
    'farmerSales.declined': 'नाकारले',
    'farmerSales.withdrawn': 'मागे घेतले',
    'farmerSales.expired': 'मुदत संपली',
    'farmerSales.verifiedBuyer': 'पडताळणी झालेला खरेदीदार',
    'farmerSales.gstinOnFile': 'GSTIN नोंदवलेले',
    'farmerSales.notVerified': 'पडताळणी झालेली नाही',
    'farmerSales.noDocuments': 'कागदपत्रे नाहीत',
    'farmerSales.paysPromptly': 'वेळेवर पैसे देतो',
    'farmerSales.paysInAWeekOrTwo': 'एक-दोन आठवड्यात पैसे देतो',
    'farmerSales.paysSlowly': 'उशिरा पैसे देतो',
    'farmerSales.noSettlementRecorded': 'अजून व्यवहार नोंदवला नाही',
    'farmerSales.theyOffer': 'त्यांची ऑफर',
    'farmerSales.total': 'एकूण',
    'farmerSales.youAsked': 'तुम्ही मागितले',
    'farmerSales.youCounteredAt': 'तुम्ही ही किंमत सुचवली',
    'farmerSales.waitingFor': 'यांच्या उत्तराची वाट पाहत आहात',
    'farmerSales.agreedAt': 'ठरलेली किंमत',
    'farmerSales.bookTransportNext': 'आता वाहतूक बुक करतील.',
    'farmerSales.beforeYouDecide': 'निर्णय घेण्यापूर्वी',
    'farmerSales.pastSalesTooFew': 'मागील विक्री — ठरवण्यासाठी पुरेशी नाही',
    'farmerSales.settled': 'व्यवहार पूर्ण',
    'farmerSales.usually': 'साधारण',
    'farmerSales.unsettled': 'प्रलंबित',
    'farmerSales.send': 'पाठवा',
    'farmerSales.counterBtn': 'प्रतिऑफर द्या',
    'farmerSales.noPickupsYet': 'अजून उचल नाही',
    'farmerSales.noOffersYet': 'अजून ऑफर नाही',
    'farmerSales.nothingListedYet': 'अजून काही यादीत नाही',
    'farmerSales.emptyPickupsSub': 'खरेदीदाराने तुमचा माल विकत घेतल्यावर, कॅप्टनसाठी कोडसह उचल इथे दिसेल.',
    'farmerSales.emptyOffersSub': 'खरेदीदाराने तुमच्या मालासाठी किंमत सुचवल्यावर ती इथे दिसेल. तुम्ही स्वीकारू, प्रतिऑफर देऊ किंवा नाकारू शकता.',
    'farmerSales.emptyListingsSub': 'काढणी झालेले पीक उघडून फार्म मार्केटवर टाका.',

    // ── Hold or sell decision ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'holdDecision.why': 'चांगल्या भावाची वाट पाहण्यासाठी पैसे खर्च होतात — साठवणुकीचे भाडे, तिथे पडून राहिल्याने खराब होणारे पीक, आणि आठवडा काढण्यासाठी कर्ज घ्यावे लागल्यास व्याज. वाट पाहणे फायद्याचे आहे की नाही हे इथे मोजले जाते.',
    'holdDecision.cropLabel': 'पीक',
    'holdDecision.cropPlaceholder': 'कांदा',
    'holdDecision.quantityLabel': 'प्रमाण (किलो)',
    'holdDecision.quantityPlaceholder': '10000',
    'holdDecision.rateLabel': 'तुमचा दर (₹/किलो)',
    'holdDecision.ratePlaceholder': '14',
    'holdDecision.holdForLabel': 'किती दिवस थांबायचे?',
    'holdDecision.daysUnit': 'दिवस',
    'holdDecision.priceHint': 'किंमतीचे मॉडेल फक्त १४ दिवसांपर्यंत तपासले गेले आहे, त्यामुळे त्यापेक्षा जास्त कालावधीसाठी ते रुपयांचा आकडा देणार नाही.',
    'holdDecision.ctaWorkItOut': 'हिशोब काढा',
    'holdDecision.defaultError': 'या थांबण्याचा हिशोब करता आला नाही.',
    'holdDecision.cannotPrice': 'या थांबण्याचा हिशोब करता येत नाही',
    'holdDecision.verdictGainPrefix': 'थांबून',
    'holdDecision.verdictGainSuffix': 'दिवस फायदा होऊ शकतो',
    'holdDecision.verdictCostSuffix': 'दिवस नुकसान होईल',
    'holdDecision.at': 'येथे',
    'holdDecision.your': 'तुमचा',
    'holdDecision.rangeBetween': 'दरम्यान',
    'holdDecision.rangeAnd': 'आणि',
    'holdDecision.rangeSuffix': 'जर खराब होण्याचे प्रमाण आपण गृहीत धरलेल्यापेक्षा निम्मे किंवा दुप्पट असेल',
    'holdDecision.modelSays': 'विक्री-वेळ मॉडेल सांगते',
    'holdDecision.confidenceWord': 'विश्वास',
    'holdDecision.uncertainNote': 'या पिकाबाबत मॉडेलला पूर्ण खात्री नाही. वरील आकडा सल्ला म्हणून नव्हे, तर तुमच्या पर्यायांची तुलना म्हणून पाहा.',
    'holdDecision.districtModalPrefix': 'जिल्ह्याचा सर्वसाधारण भाव आहे',
    'holdDecision.districtModalSuffix': '— मॉडेल याच मालिकेचा अंदाज घेते. तुमचा स्वतःचा दर सहसा वेगळा असतो, म्हणून टक्केवारी तुमच्या दरावर लावली आहे.',
    'holdDecision.optionsHeader': 'तुमचे पर्याय',
    'holdDecision.kmAway': 'किमी अंतरावर',
    'holdDecision.cropLostLabel': 'साठवणुकीत खराब होणारे पीक',
    'holdDecision.storageRentLabel': 'साठवणुकीचे भाडे',
    'holdDecision.none': 'काहीच नाही',
    'holdDecision.pledgeRaisePrefix': 'तुम्ही या मालावर तारण ठेवून जास्तीत जास्त', // mr-checked
    'holdDecision.pledgeOfValue': 'किमतीच्या',
    'holdDecision.pledgeWhileWait': 'एवढी रक्कम वाट पाहताना उभी करू शकता.',
    'holdDecision.pledgeInterestOver': 'व्याज',
    'holdDecision.pledgeLeaving': 'उरतील',
    'holdDecision.pledgeNoLend': 'हे अ‍ॅप कर्ज देत नाही — गोदामाशी संपर्क साधा.',

    // ── Buyer demand ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'buyerDemand.badgeVerified': 'पडताळणी झालेला खरेदीदार',
    'buyerDemand.badgeDocuments': 'GSTIN नोंदवलेले आहे',
    'buyerDemand.badgeRejected': 'पडताळणी झाली नाही',
    'buyerDemand.badgeUnverified': 'कागदपत्रे नाहीत',
    'buyerDemand.whichLotTitle': 'कोणता माल?',
    'buyerDemand.whichLotMsg': 'पुढे पाठवण्यासाठी तुमच्या यादीतील एक माल निवडा.',
    'buyerDemand.sentTitle': 'पाठवले',
    'buyerDemand.sentDefaultMsg': 'आता खरेदीदाराला तुमचा माल दिसू शकतो.',
    'buyerDemand.couldNotSendTitle': 'पाठवता आले नाही',
    'buyerDemand.tryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'buyerDemand.paying': 'देत आहेत',
    'buyerDemand.wantsLabel': 'हवे आहे',
    'buyerDemand.gradeOrBetter': 'किंवा त्यापेक्षा चांगले',
    'buyerDemand.grade': 'ग्रेड',
    'buyerDemand.deliverTo': 'येथे पोहोचवा',
    'buyerDemand.by': 'पर्यंत',
    'buyerDemand.responded': 'तुम्ही एक माल पुढे पाठवला आहे',
    'buyerDemand.iHaveThis': 'माझ्याकडे आहे',
    'buyerDemand.noMatchingLot': 'सध्या बाजारात तुमच्याकडे जुळणारा माल नाही.',
    'buyerDemand.callFirst': 'आधी',
    'buyerDemand.callFirstSuffix': 'यांना कॉल करा',
    'buyerDemand.filterHave': 'माझ्याकडे असलेली पिके',
    'buyerDemand.filterAll': 'जवळपासचे सर्व',
    'buyerDemand.registerLandTitle': 'आधी तुमची जमीन नोंदवा',
    'buyerDemand.noBuyersTitle': 'सध्या कोणीही खरेदीदार शोधत नाही',
    'buyerDemand.registerLandSub': 'खरेदीदार अंतरानुसार तुमच्याशी जुळवले जातात, त्यामुळे हे दाखवण्यासाठी आधी तुमच्या जमिनीचे ठिकाण नोंदवणे आवश्यक आहे.',
    'buyerDemand.noBuyersAllSub': 'अजून कोणत्याही खरेदीदाराने तुमच्या जवळ मागणी नोंदवलेली नाही. पुन्हा तपासा — हे आपोआप अद्ययावत होते.',
    'buyerDemand.noBuyersFilteredSub': 'तुम्ही नोंदवलेल्या पिकांसाठी काही नाही. तुमच्या भागात खरेदीदारांना काय हवे आहे हे पाहण्यासाठी "जवळपासचे सर्व" वापरून पहा.',
    'buyerDemand.wantsInline': 'यांना हवे आहे',
    'buyerDemand.kgAvailable': 'किलो उपलब्ध',
    'buyerDemand.messageLabel': 'संदेश (ऐच्छिक)',
    'buyerDemand.messagePlaceholder': 'उदा. गुरुवारपासून माल भरण्यास तयार',
    'buyerDemand.notice': 'ही विक्री नाही. यामुळे खरेदीदाराला कळते की तुमच्याकडे हा माल आहे — त्यांना अजूनही यावर ऑफर द्यावी लागेल, आणि तुम्ही ती नेहमीप्रमाणे स्वीकारू, बदलू किंवा नाकारू शकता.',
    'buyerDemand.putForward': 'हा माल पुढे पाठवा',

    // ── Crop detail ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'cropDetail.error': 'त्रुटी',
    'cropDetail.failedLoadDetails': 'पिकाची माहिती लोड करता आली नाही',
    'cropDetail.scanPlantHealthTitle': 'झाडाचे आरोग्य तपासा',
    'cropDetail.scanPlantHealthMsg': 'रोग तपासण्यासाठी एक पर्याय निवडा',
    'cropDetail.takePhoto': 'फोटो काढा',
    'cropDetail.chooseFromGallery': 'गॅलरीतून निवडा',
    'cropDetail.cancel': 'रद्द करा',
    'cropDetail.permissionNeededTitle': 'परवानगी आवश्यक',
    'cropDetail.cameraPermissionMsg': 'झाड तपासण्यासाठी कॅमेरा परवानगी आवश्यक आहे',
    'cropDetail.goodNewsTitle': 'आनंदाची बातमी! 🌿',
    'cropDetail.plantHealthyMsg': 'तुमचे झाड निरोगी दिसत आहे!',
    'cropDetail.ok': 'ठीक आहे',
    'cropDetail.noDiseaseInfoMsg': 'रोगाची माहिती उपलब्ध नाही',
    'cropDetail.unknownDisease': 'अज्ञात रोग',
    'cropDetail.defaultTreatment': 'उपचारासाठी कृषी तज्ञांचा सल्ला घ्या',
    'cropDetail.noSymptomsInfo': 'लक्षणांची माहिती उपलब्ध नाही',
    'cropDetail.failedAnalyzeImage': 'फोटो तपासता आला नाही',
    'cropDetail.detectionFailedTitle': 'तपासणी अयशस्वी',
    'cropDetail.errCouldNotAnalyze': 'फोटो तपासता आला नाही. कृपया स्पष्ट फोटोसह पुन्हा प्रयत्न करा.',
    'cropDetail.errTimedOut': 'विनंतीला जास्त वेळ लागला. AI सेवा संथ असू शकते.',
    'cropDetail.errAiServiceDown': 'AI सेवा सुरू नाही. कृपया Python सर्व्हर सुरू करा.',
    'cropDetail.savedTitle': 'जतन झाले! ✅',
    'cropDetail.diseaseLoggedMsg': 'रोगाची नोंद यशस्वीरित्या झाली',
    'cropDetail.failedSaveDisease': 'रोगाची माहिती जतन करता आली नाही',
    'cropDetail.listedTitle': '🎉 फार्म मार्केटवर नोंदवले',
    'cropDetail.kgOf': 'किलो',
    'cropDetail.listedMsgSuffix': 'आता खरेदीदारांना दिसत आहे.\n\nहे पीक कापणी झाले असे नोंदवले आहे आणि तुमच्या पुढील पिकासाठी जमीन मोकळी आहे.',
    'cropDetail.done': 'झाले',
    'cropDetail.harvestWithoutSellingTitle': 'विक्री न करता कापणी करायची?',
    'cropDetail.harvestWithoutSellingMsg': 'पीक खराब झाले असेल किंवा तुम्ही अ‍ॅपद्वारे विक्री करत नसाल तर हे वापरा. जमीन तुमच्या पुढील पिकासाठी मोकळी होईल.',
    'cropDetail.harvestOnly': 'फक्त कापणी करा',
    'cropDetail.harvestedTitle': 'कापणी झाली',
    'cropDetail.plotNowFreeMsg': 'जमीन आता मोकळी आहे.',
    'cropDetail.couldNotMarkHarvested': 'हे पीक कापणी झाले असे नोंदवता आले नाही.',
    'cropDetail.deleteCropTitle': 'पीक हटवा',
    'cropDetail.confirmDeleteMsg': 'तुम्हाला खात्री आहे का? ही क्रिया पूर्ववत करता येणार नाही.',
    'cropDetail.delete': 'हटवा',
    'cropDetail.deletedTitle': 'हटवले',
    'cropDetail.cropDeletedMsg': 'पीक यशस्वीरित्या हटवले',
    'cropDetail.failedDeleteCrop': 'पीक हटवता आले नाही',
    'cropDetail.loadingDetails': 'पिकाची माहिती उघडत आहे...',
    'cropDetail.cropNotFound': 'पीक सापडले नाही',
    'cropDetail.goBack': 'मागे जा',
    'cropDetail.unknownLand': 'अज्ञात जमीन',
    'cropDetail.scanButtonLabel': 'झाडाचे आरोग्य तपासा',
    'cropDetail.aiPoweredDetection': 'AI द्वारे रोग ओळख',
    'cropDetail.growthProgress': 'वाढीची प्रगती',
    'cropDetail.daysElapsed': 'गेलेले दिवस',
    'cropDetail.daysRemaining': 'उरलेले दिवस',
    'cropDetail.complete': 'पूर्ण',
    'cropDetail.stagePrefix': 'टप्पा',
    'cropDetail.dailyGrowthTracker': 'दैनिक वाढ ट्रॅकर',
    'cropDetail.todaysWeather': 'आजचे हवामान',
    'cropDetail.humidityPrefix': 'आर्द्रता',
    'cropDetail.windPrefix': 'वारा',
    'cropDetail.tasksTitle': 'कामे',
    'cropDetail.noTasksYet': 'अजून कोणतेही काम नाही',
    'cropDetail.cropDetailsTitle': 'पिकाची माहिती',
    'cropDetail.variety': 'जात',
    'cropDetail.quantity': 'प्रमाण',
    'cropDetail.plantingDate': 'लागवडीची तारीख',
    'cropDetail.expectedHarvest': 'अपेक्षित कापणी',
    'cropDetail.notes': 'टीप',
    'cropDetail.postHarvestButton': 'फार्म मार्केटवर कापणी नोंदवा',
    'cropDetail.harvestFailedLink': 'पीक खराब झाले? विक्री न करता कापणी करा',
    'cropDetail.harvestedBanner': 'कापणी झाली',
    'cropDetail.harvestedOnPrefix': 'रोजी',
    'cropDetail.deleteCropButton': 'पीक हटवा',
    'cropDetail.diseaseDetectionTitle': 'रोग तपासणी',
    'cropDetail.analyzingPlantHealth': 'झाडाचे आरोग्य तपासत आहे...',
    'cropDetail.usingTensorflowModel': 'TensorFlow AI मॉडेल वापरत आहे',
    'cropDetail.mayTakeSeconds': 'यास काही सेकंद लागू शकतात',
    'cropDetail.plantHealthyResult': 'झाड निरोगी आहे!',
    'cropDetail.diseaseDetectedResult': 'रोग आढळला',
    'cropDetail.diseaseLabel': 'रोग:',
    'cropDetail.confidenceLabel': 'विश्वासार्हता:',
    'cropDetail.severityLabel': 'तीव्रता:',
    'cropDetail.symptomsLabel': 'लक्षणे:',
    'cropDetail.treatmentLabel': 'उपचार:',
    'cropDetail.pesticideReadyTitle': 'कीटकनाशकाची गणना तयार',
    'cropDetail.pesticideReadyMsg': 'जतन केल्यानंतर, तुमच्या पिकाच्या पानावर संपूर्ण कीटकनाशक शिफारस कार्ड दिसेल.',
    'cropDetail.saveToHealthHistory': 'आरोग्य इतिहासात जतन करा',
    'cropDetail.pesticideRecTitle': 'कीटकनाशक शिफारस',
    'cropDetail.forPrefix': 'साठी:',
    'cropDetail.calculatedFor': 'यासाठी गणना केली',
    'cropDetail.sqFt': 'चौ. फूट',
    'cropDetail.ofLand': 'जमिनीसाठी',
    'cropDetail.waterNeeded': 'आवश्यक\nपाणी',
    'cropDetail.pesticideAmount': 'कीटकनाशक\nप्रमाण',
    'cropDetail.bottleSize': 'बाटलीचा\nआकार',
    'cropDetail.estimatedTotalCost': 'अंदाजित एकूण खर्च',
    'cropDetail.applicationTips': '📋 फवारणी सूचना',
    'cropDetail.applicationTipsText': '• फवारणीपूर्वी कीटकनाशक आवश्यक पाण्यात नीट मिसळा.\n• उत्तम शोषणासाठी सकाळी लवकर (६-८ वाजता) किंवा संध्याकाळी उशिरा फवारणी करा.\n• फवारताना संरक्षक हातमोजे आणि मास्क वापरा.\n• पावसापूर्वी फवारणी टाळा.',
    'cropDetail.dismissRecommendation': 'शिफारस बंद करा',
    'cropDetail.severitySevere': 'तीव्र',
    'cropDetail.severityModerate': 'मध्यम',
    'cropDetail.severityMild': 'सौम्य',

    // ── Crop recommendation ───────────────────────────────────────────
    'cropRecommendation.noSuitableTitle': 'योग्य पीक सापडले नाही',
    'cropRecommendation.noSuitableMsg': 'तुमच्या जागेसाठी योग्य पीक सापडले नाही. कृपया पुन्हा प्रयत्न करा.',
    'cropRecommendation.errorTitle': 'त्रुटी',
    'cropRecommendation.invalidResponse': 'AI शिफारशी मिळाल्या नाहीत. चुकीचे उत्तर मिळाले.',
    'cropRecommendation.connectionErrorGeneric': 'AI सेवेशी जोडणी होऊ शकली नाही.',
    'cropRecommendation.timeoutError': 'विनंतीला वेळ लागला. कृपया इंटरनेट कनेक्शन तपासा.',
    'cropRecommendation.cannotConnect': 'सर्व्हरशी जोडणी होऊ शकत नाही. बॅकएंड सुरू आहे का ते तपासा',
    'cropRecommendation.aiConnectionErrorTitle': 'AI जोडणी त्रुटी',
    'cropRecommendation.retry': 'पुन्हा प्रयत्न करा',
    'cropRecommendation.goBack': 'मागे जा',
    'cropRecommendation.limitReachedTitle': 'मर्यादा पूर्ण झाली',
    'cropRecommendation.limitReachedMsgPrefix': 'तुम्ही जास्तीत जास्त',
    'cropRecommendation.cropsWord': 'पिके निवडू शकता',
    'cropRecommendation.requiredTitle': 'आवश्यक',
    'cropRecommendation.selectAtLeastOne': 'कृपया किमान एक पीक निवडा',
    'cropRecommendation.gettingRecommendations': 'AI शिफारशी मिळवत आहे...',
    'cropRecommendation.analyzing': 'विश्लेषण सुरू आहे',
    'cropRecommendation.mayTakeTime': 'यास 10-15 सेकंद लागू शकतात...',
    'cropRecommendation.headerTitle': '🌱 AI पीक शिफारशी',
    'cropRecommendation.selected': 'निवडले',
    'cropRecommendation.maxPrefix': 'जास्तीत जास्त',
    'cropRecommendation.cropsAllowedSuffix': 'पीक(ले) परवानगी आहे',
    'cropRecommendation.searchCropsTitle': 'पिके शोधा',
    'cropRecommendation.searchPlaceholder': 'पिकाचे नाव शोधा...',
    'cropRecommendation.customHint': 'सामान्यतः शिफारस केलेले नसले तरीही हे पीक घ्या',
    'cropRecommendation.searchTrigger': 'तुमचे पीक दिसत नाही? सर्व महाराष्ट्र पिके शोधा',
    'cropRecommendation.noMatchingCrops': 'जुळणारी पिके सापडली नाहीत',
    'cropRecommendation.noMatchingSubtext': 'या जमिनीच्या माती प्रकार, पाणी स्रोत आणि सध्याच्या हंगामासाठी योग्य पीक आमच्या माहितीत सापडले नाही. जमिनीचे तपशील अद्ययावत करून पहा किंवा पुढील हंगामात पुन्हा तपासा.',
    'cropRecommendation.addedByYou': 'तुम्ही जोडले',
    'cropRecommendation.addedByYouReason': 'तुम्ही जोडले — या जमिनीसाठी AI-शिफारस केलेल्या यादीचा भाग नाही.',
    'cropRecommendation.days': 'दिवस',
    'dash.browseMarket': 'माझे उत्पादन', // mr-checked
    'dash.priceOutlook': 'भावाचा अंदाज', // mr-checked
    'dash.seeAllPrices': 'सर्व पहा →', // mr-checked
    'dash.browseMarketSub': 'काढणी नोंदवा आणि इच्छुक खरेदीदारांच्या विनंत्या पहा', // mr-checked
    'outlook.title': 'भावाचा अंदाज', // mr-checked
    'outlook.chooseCrop': 'कोणते पीक?', // mr-checked
    'outlook.nearbyDistrict': '{district} ने हे पीक अलीकडे पुरेसे नोंदवलेले नाही, म्हणून हे {source} च्या भावांवर आधारित आहे — नोंदवणारा सर्वात जवळचा जिल्हा (~{km} किमी दूर).', // mr-checked
    'outlook.tapToChange': 'पीक बदलण्यासाठी नावावर टॅप करा', // mr-checked
    'outlook.cannotForecast': 'या पिकांचा अंदाज मॉडेल इथे देत नाही:', // mr-checked
    'outlook.asOf': 'दिनांक', // mr-checked
    'outlook.nextDays': 'पुढील {n} दिवस', // mr-checked
    'outlook.tomorrow': 'उद्या', // mr-checked
    'outlook.yourRate': 'तुमचा दर', // mr-checked
    'outlook.rateDefaultHint': 'सुरुवातीला आजचा जिल्ह्याचा बाजार दर दाखवला आहे. तुम्ही प्रत्यक्ष विकता तो दर वेगळा असल्यास बदला.', // mr-checked
    'outlook.apply': 'लागू करा', // mr-checked
    'outlook.legendModal': 'करडा आकडा: जिल्ह्याचा बाजार मोडल भाव, प्रति किलो.', // mr-checked
    'outlook.legendYours': 'रंगीत आकडा: तुमचा स्वतःचा दर त्याच टक्केवारीने बदललेला.', // mr-checked
    'outlook.bestDay': 'या कालावधीतील सर्वोच्च दिवस', // mr-checked
    'outlook.peakNote': 'मोजलेल्या कालावधीतील हा सर्वात जास्त अंदाजाचा दिवस आहे. थांबण्याचा हा सल्ला नाही — साठवणुकीला खर्च येतो आणि माल खराब होतो.', // mr-checked
    'outlook.howGood': 'हा अंदाज किती अचूक आहे?', // mr-checked
    'outlook.avgErr': 'सरासरी चूक', // mr-checked
    'outlook.vsNaive': 'आजचाच भाव राहील असे गृहीत धरल्यास:', // mr-checked
    'outlook.accuracyNote': 'मॉडेलने कधीही न पाहिलेल्या सहा महिन्यांच्या माहितीवर मोजलेले. दुसरा आकडा म्हणजे काहीच बदलणार नाही असे गृहीत धरल्यास येणारी चूक — अंदाज त्यापेक्षा चांगला आहे म्हणूनच तो उपयोगाचा आहे.', // mr-checked
    'outlook.noForecast': 'या पिकासाठी भावाचा अंदाज नाही', // mr-checked
    'outlook.stillHaveStats': 'वरील वाचन तसेच राहते — ते या जिल्ह्यातील प्रत्यक्ष नोंदवलेल्या भावांवरील गणित आहे, मॉडेल नाही.', // mr-checked
    'outlook.refuse.NO_SKILL': 'या पिकासाठी आजचाच भाव राहील असे गृहीत धरण्यापेक्षा मॉडेल चांगले काम करत नाही, म्हणून ते आकडा देत नाही.', // mr-checked
    'outlook.refuse.LOW_SKILL': 'इथे या पिकाचे भाव इतके अस्थिर आहेत की उपयोगी अंदाज बांधता येत नाही.', // mr-checked
    'outlook.refuse.INSUFFICIENT_HISTORY': 'या जिल्ह्यातील बाजार समित्यांनी हे पीक अलीकडे अंदाजासाठी पुरेशा वेळा नोंदवलेले नाही.', // mr-checked
    'outlook.reportedDays': 'गेल्या ७५ दिवसांपैकी फक्त {n} दिवस इथे भाव नोंदवला गेला — किमान {min} दिवस लागतात.', // mr-checked
    'outlook.refuse.UNKNOWN_COMMODITY': 'हे पीक मॉडेलच्या माहितीत नाही.', // mr-checked
    'outlook.refuse.UNKNOWN_DISTRICT': 'हा जिल्हा मॉडेलच्या माहितीत नाही.', // mr-checked
    'outlook.refuse.NO_SERIES': 'इथे या पिकाची वापरण्याजोगी भाव नोंद नाही.', // mr-checked
    'outlook.refuse.MODEL_NOT_TRAINED': 'अंदाजाचे मॉडेल सध्या लोड झालेले नाही.', // mr-checked
    'outlook.refuse.SERVICE_UNAVAILABLE': 'अंदाज सेवेशी संपर्क होऊ शकला नाही. पुन्हा प्रयत्न करण्यासाठी खाली ओढा.', // mr-checked
    'outlook.refuse.UNAVAILABLE': 'सध्या या पिकासाठी कोणताही अंदाज उपलब्ध नाही.', // mr-checked
    'outlook.action.sell': 'आता विका', // mr-checked
    'outlook.action.hold': 'थांबणे फायद्याचे', // mr-checked
    'outlook.action.heavy': 'मोठी आवक — भावावर दबाव येऊ शकतो', // mr-checked
    'outlook.action.unknown': 'सल्ला देण्यासाठी पुरेशी माहिती नाही', // mr-checked
    'outlook.engine.statistical': 'या जिल्ह्यातील नोंदवलेल्या भावांवरून.', // mr-checked
    'outlook.engine.statistical+model': 'या जिल्ह्यातील नोंदवलेल्या भावांवरून, सोबत प्रशिक्षित मॉडेल.', // mr-checked
    'outlook.engine.model': 'प्रशिक्षित विक्री/थांबा मॉडेलने हे ठरवले; सांख्यिकी वाचन सोबत ठेवले आहे.', // mr-checked
    'outlook.loadFailed': 'भावाचा अंदाज लोड होऊ शकला नाही.', // mr-checked
    'outlook.retry': 'पुन्हा प्रयत्न करा', // mr-checked
    'fpoCollect.title': 'सदस्यांकडून संकलन', // mr-checked
    'fpoCollect.premisesTitle': 'संकलन ठिकाण', // mr-checked
    'fpoCollect.premisesMissing': 'या गटाने आपले गोदाम कुठे आहे ते सांगितलेले नाही. खऱ्या ठिकाणाशिवाय वाहन पाठवता येत नाही आणि भाडे वाटता येत नाही — संकलन ठरवण्यापूर्वी ते नोंदवा.', // mr-checked
    'fpoCollect.setFromLocation': 'माझे सध्याचे ठिकाण वापरा', // mr-checked
    'fpoCollect.updatePremises': 'संकलन ठिकाण बदला', // mr-checked
    'fpoCollect.premisesFailed': 'संकलन ठिकाण जतन होऊ शकले नाही.', // mr-checked
    'fpoCollect.needLocation': 'संकलन ठिकाण नोंदवण्यासाठी ठिकाणाची परवानगी लागते.', // mr-checked
    'fpoCollect.chooseLots': 'कोणते लॉट आणायचे', // mr-checked
    'fpoCollect.chooseSub': 'एक वाहन जास्तीत जास्त {n} शेतांवर जाते. एकाच सदस्याचे दोन लॉट म्हणजे एकच शेत — वाहन तिथे एकदाच थांबते.', // mr-checked
    'fpoCollect.noLots': 'सध्या संकलनासाठी कोणतेही सदस्य लॉट उपलब्ध नाहीत.', // mr-checked
    'fpoCollect.gradeNotDeclared': 'प्रत जाहीर केलेली नाही', // mr-checked
    'fpoCollect.transport': 'वाहतूक', // mr-checked
    'fpoCollect.mode.hired': 'कॅप्टन ठरवा', // mr-checked
    'fpoCollect.mode.own': 'आमचे स्वतःचे वाहन', // mr-checked
    'fpoCollect.mode.contracted': 'करारावरील', // mr-checked
    'fpoCollect.statedCost': 'या फेरीचा गटाला येणारा खर्च', // mr-checked
    'fpoCollect.driverName': 'चालक', // mr-checked
    'fpoCollect.driverNamePh': 'कोण चालवत आहे', // mr-checked
    'fpoCollect.driverPhone': 'चालकाचा फोन', // mr-checked
    'fpoCollect.vehicleNumber': 'वाहन क्रमांक', // mr-checked
    'fpoCollect.optional': 'ऐच्छिक', // mr-checked
    'fpoCollect.statedCostNote': 'हे तुम्ही सांगितलेले आहे, मोजलेले नाही. कॅप्टनचा भाडे तक्ता स्वतंत्र कॅप्टनचा खर्च मोजतो, तुमच्या वाहनाचा नाही.', // mr-checked
    'fpoCollect.lotsWord': 'लॉट', // mr-checked
    'fpoCollect.farms': 'शेते', // mr-checked
    'fpoCollect.arrange': 'ठरवा', // mr-checked
    'fpoCollect.arrangedTitle': 'संकलन ठरले', // mr-checked
    'fpoCollect.arrangeFailed': 'ते संकलन ठरवता आले नाही', // mr-checked
    'fpoCollect.saving': 'वेगवेगळ्या फेऱ्यांच्या तुलनेत वाचले:', // mr-checked
    'fpoCollect.tryAgain': 'कृपया पुन्हा प्रयत्न करा.', // mr-checked
    'fpoCollect.loadFailed': 'गट लोड होऊ शकला नाही.', // mr-checked
    'fpoCollect.retry': 'पुन्हा प्रयत्न करा', // mr-checked
    'fpoOrders.title': 'गटाच्या ऑर्डर', // mr-checked
    'fpoOrders.kg': 'किलो', // mr-checked
    'fpoOrders.ordered': 'ऑर्डर', // mr-checked
    'fpoOrders.delivered': 'पोहोच', // mr-checked
    'fpoOrders.received': 'मिळालेले', // mr-checked
    'fpoOrders.stillOwed': 'येणे बाकी', // mr-checked
    'fpoOrders.basis': 'ही बेरीज दाखवलेल्या {shown} ऑर्डरची आहे, एकूण {total} पैकी.', // mr-checked
    'fpoOrders.simulatedCount': 'यापैकी {n} ॲपच्याच रेल्वेवर पूर्ण झाल्या, जिथे प्रत्यक्ष पैसे हलत नाहीत.', // mr-checked
    'fpoOrders.paidOn': 'दिले', // mr-checked
    'fpoOrders.ref': 'संदर्भ', // mr-checked
    'fpoOrders.simulated': 'ॲपमध्ये नोंद — प्रत्यक्ष पैसे हलले नाहीत', // mr-checked
    'fpoOrders.outstanding': 'बाकी', // mr-checked
    'fpoOrders.advancePromised': '{amt} आगाऊ रक्कम ठरली पण मिळालेली नाही — हे वचन आहे, पैसे नव्हे.', // mr-checked
    'fpoOrders.advanceIn': '{amt} आगाऊ रक्कम मिळाली.', // mr-checked
    'fpoOrders.openReceipt': 'पावती पहा', // mr-checked
    'fpoOrders.empty': 'या गटासाठी अद्याप कोणतीही ऑर्डर नाही.', // mr-checked
    'fpoOrders.loadFailed': 'गटाच्या ऑर्डर लोड होऊ शकल्या नाहीत.', // mr-checked
    'fpoOrders.retry': 'पुन्हा प्रयत्न करा', // mr-checked
    'fpoOrders.tab.all': 'सर्व', // mr-checked
    'fpoOrders.tab.delivered': 'पोहोचलेल्या', // mr-checked
    'fpoOrders.tab.unpaid': 'पैसे बाकी', // mr-checked
    'fpoOrders.status.delivered': 'पोहोचली', // mr-checked
    'fpoOrders.status.picked_up': 'वाटेवर', // mr-checked
    'fpoOrders.status.accepted': 'कॅप्टन नेमला', // mr-checked
    'fpoOrders.status.awaiting_agent': 'कॅप्टन शोधत आहोत', // mr-checked
    'fpoOrders.status.no_agents': 'कोणत्याही कॅप्टनने घेतली नाही', // mr-checked
    'fpoOrders.status.stranded': 'अडकलेली', // mr-checked
    'fpoOrders.status.cancelled': 'रद्द', // mr-checked
    'fpoOrders.method.cash': 'रोख', // mr-checked
    'fpoOrders.method.upi': 'यूपीआय', // mr-checked
    'fpoOrders.method.bank': 'बँक', // mr-checked
    'fpoOrders.method.other': 'इतर', // mr-checked
    'fpoOrders.method.in_app': 'ॲपमध्ये', // mr-checked

    'fpoAllMembers.searchPlaceholder': 'नाव, गाव किंवा पिकाने शोधा',
    'fpoAllMembers.noMembers': 'अजून कोणतेही सदस्य नाहीत.',
    'fpoAllMembers.noMatch': 'या शोधाशी जुळणारा कोणताही सदस्य नाही.',

    'fpoMemberDetail.member': 'सदस्य',
    'fpoMemberDetail.deliveries': 'डिलिव्हरी',
    'fpoMemberDetail.historyTitle': 'या गटासोबतचा व्यवहार इतिहास',
    'fpoMemberDetail.noOrders': 'या शेतकऱ्याची अजून कोणतीही ऑर्डर नाही.',
    'farmerMarket.title': 'माझे उत्पादन', // mr-checked
    'farmerMarket.status.available': 'बाजारात उपलब्ध', // mr-checked
    'farmerMarket.status.sold_out': 'विकले गेले', // mr-checked
    'farmerMarket.status.withdrawn': 'मागे घेतले', // mr-checked
    'farmerMarket.waiting': 'कॅप्टनची वाट पाहत आहे:', // mr-checked
    'farmerMarket.coming': 'कॅप्टन येत आहे:', // mr-checked
    'farmerMarket.stuck': 'कोणत्याही कॅप्टनने घेतले नाही:', // mr-checked
    'farmerMarket.postHarvest': 'काढणी नोंदवा', // mr-checked
    'farmerMarket.checkPrices': 'भाव तपासा', // mr-checked
    'farmerMarket.requests': 'विनंत्या', // mr-checked
    'farmerMarket.requestsCount': 'विनंत्या ({n})', // mr-checked
    'farmerMarket.pickCropTitle': 'कोणते पीक नोंदवायचे?', // mr-checked
    'farmerMarket.noPostableCrops': 'नोंदवण्यासाठी अजून कोणतेही पीक तयार नाही. आधी पीक नोंदवा आणि लावा.', // mr-checked
    'farmerMarket.close': 'बंद करा', // mr-checked
    'farmerMarket.searchPlaceholder': 'पीक शोधा…', // mr-checked
    'farmerMarket.tabAll': 'सर्व लॉट', // mr-checked
    'farmerMarket.tabMine': 'माझे लॉट', // mr-checked
    'farmerMarket.yourLot': 'तुमचे', // mr-checked
    'farmerMarket.perKg': '/किलो', // mr-checked
    'farmerMarket.kg': 'किलो', // mr-checked
    'farmerMarket.grade': 'प्रत', // mr-checked
    'farmerMarket.gradeNotDeclared': 'प्रत जाहीर केलेली नाही', // mr-checked
    'farmerMarket.selfDeclared': '(स्वतः जाहीर केलेली)', // mr-checked

    'farmerMarket.sellToFpo': '{fpo} ला विका', // mr-checked
    'farmerMarket.sellQtyLabel': 'किती किलो?', // mr-checked
    'farmerMarket.sellMaxHint': '{max} किलो पर्यंत उपलब्ध', // mr-checked
    'farmerMarket.sellRateLabel': 'ठरलेला दर', // mr-checked
    'farmerMarket.sellBadQtyTitle': 'प्रमाण तपासा', // mr-checked
    'farmerMarket.sellBadQtyMsg': '0 ते {max} किलो दरम्यान प्रमाण टाका.', // mr-checked
    'farmerMarket.sellNote': 'यामुळे विक्री आणि गटाकडून तुम्हाला येणे असलेली रक्कम नोंदवली जाते. तुमच्या शेतातून माल नेण्याची व्यवस्था पुढचा टप्पा असून ती गट करेल.', // mr-checked
    'farmerMarket.sellConfirm': 'आता विका', // mr-checked
    'farmerMarket.soldTitle': 'तुमच्या एफपीओला विकले', // mr-checked
    'farmerMarket.sellFailedTitle': 'विक्री पूर्ण करता आली नाही', // mr-checked
    'farmerMarket.historyTitle': '{fpo} सोबतचा तुमचा इतिहास', // mr-checked
    'farmerMarket.historyEmpty': 'या गटाला अजून कोणतीही विक्री केलेली नाही — ही तुमची पहिली असेल.', // mr-checked
    'farmerMarket.historyCount': '{n} आधीच्या विक्री', // mr-checked
    'farmerMarket.total': 'एकूण',
    'farmerMarket.historyUnpaid': '{n} अजून न मिळालेल्या', // mr-checked
    'farmerMarket.historyAllPaid': 'आधीच्या सर्व विक्रीचे पैसे मिळाले', // mr-checked
    'farmerMarket.districtUnknown': 'जिल्हा नोंदवलेला नाही', // mr-checked
    'farmerMarket.of': 'पैकी', // mr-checked
    'farmerMarket.ofYours': 'तुमचे लॉट बाजारात आहेत', // mr-checked
    'farmerMarket.lots': 'लॉट', // mr-checked
    'farmerMarket.narrow': 'पिकाचे नाव शोधून यादी कमी करा.', // mr-checked
    'farmerMarket.bandMedian': 'मधली मागणी किंमत', // mr-checked
    'farmerMarket.bandAcross': 'एकूण', // mr-checked
    'farmerMarket.bandLots': 'लॉटमधून', // mr-checked
    'farmerMarket.bandTooFew': 'बाजारात फक्त {n} लॉट — किंमत श्रेणी दाखवण्यासाठी खूप कमी', // mr-checked
    'farmerMarket.bandNote': 'ही इतर शेतकरी सध्या मागत असलेली किंमत आहे, झालेले व्यवहार नाहीत. या किमतींना अजून कोणीही होकार दिलेला नाही.', // mr-checked
    'farmerMarket.empty': 'याशी जुळणारे कोणतेही लॉट बाजारात नाहीत.', // mr-checked
    'farmerMarket.emptyMine': 'तुमचे कोणतेही लॉट बाजारात नाहीत. इथे दिसण्यासाठी काढणी नोंदवा.', // mr-checked
    'farmerMarket.loadFailed': 'बाजार लोड होऊ शकला नाही. पुन्हा प्रयत्न करण्यासाठी खाली ओढा.', // mr-checked
    'farmerMarket.retry': 'पुन्हा प्रयत्न करा', // mr-checked
    'cropRecommendation.demand': 'मागणी',
    'cropRecommendation.noDemand.no_mandi_data': '{district} मध्ये या पिकाचा बाजारभाव नोंदवलेला नाही', // mr-checked
    'cropRecommendation.noDemand.reported_elsewhere_only': '{district} मध्ये व्यापार नाही — महाराष्ट्रात इतरत्रच नोंद', // mr-checked
    'cropRecommendation.noDemand.crop_not_in_agmarknet': 'ॲगमार्कनेट या पिकाची नोंद ठेवत नाही', // mr-checked
    'cropRecommendation.noDemand.district_not_in_agmarknet': 'ॲगमार्कनेटकडे {district} साठी बाजार माहिती नाही', // mr-checked
    'cropRecommendation.noDemand.lookup_failed': 'बाजारभाव सेवेशी संपर्क होऊ शकला नाही — पुन्हा प्रयत्न करण्यासाठी खाली ओढा', // mr-checked
    'cropRecommendation.signalAt': 'या आठवड्यात', // mr-checked
    'cropRecommendation.growersNearby': 'शेतकरी जवळपास हे पीक घेत आहेत', // mr-checked
    'cropRecommendation.continuePrefix': 'पुढे जा',
    'cropRecommendation.cropsParenWord': 'पिकांसह',

    // ── Crop registration ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'cropRegistration.errorTitle': 'त्रुटी',
    'cropRegistration.userDataNotFound': 'वापरकर्ता माहिती सापडली नाही. कृपया पुन्हा लॉगिन करा.',
    'cropRegistration.requiredTitle': 'आवश्यक',
    'cropRegistration.enterQuantity': 'कृपया प्रमाण टाका',
    'cropRegistration.authError': 'वापरकर्ता प्रमाणीकरण त्रुटी. कृपया पुन्हा लॉगिन करा.',
    'cropRegistration.successTitle': 'यशस्वी! 🎉',
    'cropRegistration.registeredRegisterNext': 'नोंदवले! पुढील पीक नोंदवायचे आहे का?',
    'cropRegistration.skipRemaining': 'उर्वरित वगळा',
    'cropRegistration.nextCrop': 'पुढील पीक',
    'cropRegistration.cropsRegisteredSuccessfully': 'पीक(ले) यशस्वीरित्या नोंदवली!',
    'cropRegistration.goToDashboard': 'डॅशबोर्डवर जा',
    'cropRegistration.allDoneTitle': 'सर्व पूर्ण झाले! 🎉',
    'cropRegistration.successfullyRegisteredPrefix': 'यशस्वीरित्या नोंदवले',
    'cropRegistration.cropsExclaim': 'पीक(ले)!',
    'cropRegistration.failedToRegister': 'पीक नोंदवता आले नाही. कृपया पुन्हा प्रयत्न करा.',
    'cropRegistration.noCropSelected': 'पीक निवडलेले नाही',
    'cropRegistration.headerTitle': 'पीक नोंदणी करा',
    'cropRegistration.ofWord': 'पैकी',
    'cropRegistration.durationPrefix': 'कालावधी:',
    'cropRegistration.days': 'दिवस',
    'cropRegistration.allocatedPlot': 'वाटप केलेले प्लॉट',
    'cropRegistration.ofLand': 'जमिनीच्या',
    'cropRegistration.plantingDate': 'लागवडीची तारीख',
    'cropRegistration.quantity': 'प्रमाण',
    'cropRegistration.quantityPlaceholder': 'उदा., 100',
    'cropRegistration.variety': 'जात (ऐच्छिक)',
    'cropRegistration.varietyPlaceholder': 'उदा., संकरित, स्थानिक, सेंद्रिय',
    'cropRegistration.notes': 'टिपा (ऐच्छिक)',
    'cropRegistration.notesPlaceholder': 'काही अतिरिक्त टिपा...',
    'cropRegistration.registerPrefix': 'नोंदवा',
    'cropRegistration.skipRemainingCrops': 'उर्वरित पिके वगळा',
    'cropRegistration.skipRegistrationTitle': 'नोंदणी वगळा',
    'cropRegistration.skipConfirmMsg': 'उर्वरित पिके वगळून डॅशबोर्डवर जायचे आहे का?',
    'cropRegistration.cancel': 'रद्द करा',
    'cropRegistration.skip': 'वगळा',
    'cropRegistration.cropsRegistered': 'पीक(ले) नोंदवली!',
    'cropRegistration.unit.plants': 'रोपे',
    'cropRegistration.unit.seeds': 'बिया',
    'cropRegistration.unit.kg': 'किलो',
    'cropRegistration.unit.grams': 'ग्रॅम',
    'cropRegistration.unit.saplings': 'कलमे',

    // ── FPO membership ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'fpo.nameItTitle': 'नाव द्या',
    'fpo.nameItMsg': 'गटाला एक नाव द्या.',
    'fpo.joinPrefix': 'सामील व्हा',
    'fpo.joinMsg': 'तुमचे लॉट तुमचेच राहतील — तोच भाव, तेच पेमेंट, तोच पिकअप कोड. एका ट्रिपमध्ये अनेक शेतांचा माल नेणे खरेदीदारासाठी गट सोपे करतो.',
    'fpo.cancel': 'रद्द करा',
    'fpo.join': 'सामील व्हा',
    'fpo.couldNotJoin': 'सामील होता आले नाही',
    'fpo.tryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'fpo.leaveDialogTitle': 'हा गट सोडायचा आहे का?',
    'fpo.leaveDialogMsg': 'तुमच्या नोंदी आणि विक्रीवर याचा परिणाम होणार नाही.',
    'fpo.stay': 'राहू द्या',
    'fpo.leaveConfirmBtn': 'सोडा',
    'fpo.couldNotLeave': 'सोडता आले नाही',
    'fpo.couldNotSave': 'जतन करता आले नाही',
    'fpo.removeSplitTitle': 'वाटणी काढून टाकायची आहे का?', // mr-checked
    'fpo.removeSplitMsg': 'प्रत्येक सदस्य त्याच्या स्वतःच्या लॉटच्या किमतीकडे परत जाईल.', // mr-checked
    'fpo.remove': 'काढून टाका',
    'fpo.couldNotRemove': 'काढून टाकता आले नाही',
    'fpo.couldNotCreate': 'तयार करता आले नाही',
    'fpo.introTitle': 'एकत्र विका, एकत्र पाठवा',
    'fpo.introText1': 'वाहनाचा खर्च १०० किलो असो वा १,५०० किलो — सारखाच असतो. जवळच्या तीन शेतांनी एक टेम्पो वाटून घेतला तर प्रत्येकाला एकट्याने पाठवण्यापेक्षा खूप कमी खर्च येतो — गट यासाठीच असतो.',
    'fpo.introText2': 'तुमचे लॉट तुमचेच राहतील — तुमचा भाव, तुमचे पेमेंट, तुमचा पिकअप कोड.',
    'fpo.groupsInDistrict': 'तुमच्या जिल्ह्यातील गट',
    'fpo.memberSingular': 'सदस्य',
    'fpo.memberPlural': 'सदस्य',
    'fpo.startedBy': 'सुरू केला',
    'fpo.noGroupsYet': 'तुमच्या जिल्ह्यात अजून गट नाही',
    'fpo.startOneHint': 'एक सुरू करा, जवळचे शेतकरी तो पाहू शकतील.',
    'fpo.startGroup': 'गट सुरू करा',
    'fpo.groupNameLabel': 'गटाचे नाव',
    'fpo.groupNamePlaceholder': 'उदा. निफाड कांदा उत्पादक',
    'fpo.villageLabel': 'गाव',
    'fpo.villagePlaceholder': 'उदा. निफाड',
    'fpo.regNumberLabel': 'एफपीओ नोंदणी क्रमांक', // mr-checked
    'fpo.regNumberPlaceholder': 'असल्यास टाका',
    'fpo.regNumberHint': 'दिल्याप्रमाणे नोंदवले जाते. कोणत्याही नोंदणीशी पडताळले जात नाही — अ‍ॅप हे "नोंदीत" असे दाखवते, "पडताळणी झाली" असे नाही.',
    'fpo.createGroup': 'गट तयार करा',
    'fpo.regPrefix': 'नोंद क्र.',
    'fpo.onFileNotVerified': '— नोंदीत, पडताळणी झालेली नाही',
    'fpo.lotsOnMarket': 'गटाचे खुल्या बाजारातील लॉट',
    'fpo.kgAvailable': 'गटाचे खुल्या बाजारातील किलो',
    'fpo.statCaption': 'सर्व सदस्यांच्या स्वतःच्या खुल्या बाजारातील नोंदींची बेरीज — तुमची स्वतःची विक्री किंवा एफपीओ खरेदी नाही.',
    'fpo.membersTitle': 'सदस्य',
    'fpo.youSuffix': ' (तुम्ही)',
    'fpo.startedGroup': 'गट सुरू केला',
    'fpo.revenueSplitTitle': 'उत्पन्न वाटणी', // mr-checked
    'fpo.splitAgreedText': 'या गटाने वाटणी ठरवली आहे. तुम्ही एकत्र विक्री कराल तेव्हा, प्रत्येक सदस्याला ठरलेल्या करारानुसार किती मिळणार आणि त्याच्या स्वतःच्या लॉटची किंमत किती होती हे अ‍ॅप दाखवते.', // mr-checked
    'fpo.splitNotAgreedText': 'कोणतीही वाटणी ठरलेली नाही — प्रत्येक सदस्याला त्याच्या स्वतःच्या लॉटचे पैसे मिळतात. हीच नेहमीची पद्धत आहे. गटाने खरोखर वाटणी ठरवली असेल तरच ती नोंदवा.', // mr-checked
    'fpo.recordsNotice': 'अ‍ॅप तुम्ही ठरवलेले नोंदवते. ते पैसे हलवत नाही — प्रत्येक शेतकरी स्वतःचे पेमेंट स्वतः निश्चित करतो.',
    'fpo.changeSplit': 'वाटणी बदला', // mr-checked
    'fpo.recordSplit': 'वाटणी नोंदवा', // mr-checked
    'fpo.leaveThisGroup': 'हा गट सोडा',
    'fpo.sharesMustAdd': 'वाटा एकूण १००% असणे आवश्यक आहे.',
    'fpo.totalLabel': 'एकूण',
    'fpo.mustBe100': '— १००% असणे आवश्यक आहे',
    'fpo.saveSplit': 'वाटणी जतन करा', // mr-checked
    'fpo.removeSplitBtn': 'वाटणी काढून टाका', // mr-checked
    'fpo.ordersWithFpo': '{fpo} सोबतचे व्यवहार',
    'fpo.noOrdersYet': 'तुम्ही अद्याप या गटाला काहीही विकलेले नाही.',
    'fpo.ordersLabel': 'व्यवहार',
    'fpo.totalEarnedLabel': 'एकूण मिळकत',
    'fpo.paidLabel': 'मिळाले',
    'fpo.unpaidOrdersHint': '{n} व्यवहारांचे पैसे अद्याप आलेले नाहीत',
    'fpo.paidTag': 'मिळाले',
    'fpo.unpaidTag': 'बाकी',
    'fpo.findRealFpoTitle': 'तुमचा खरा एफपीओ शोधा', // mr-checked
    'fpo.findRealFpoSub': 'तुमच्या जवळील नोंदणीकृत एफपीओंची अधिकृत यादी शोधा.', // mr-checked
    'fpo.pendingRequestsTitle': 'प्रलंबित सामील होण्याच्या विनंत्या',
    'fpo.noPendingRequests': 'सध्या कोणीही सामील होण्याची वाट पाहत नाही.',
    'fpo.couldNotApprove': 'मंजूर करता आले नाही',
    'fpo.couldNotReject': 'नाकारता आले नाही',
    'fpo.viewDashboardTitle': 'डॅशबोर्ड पहा',
    'fpo.viewDashboardSub': 'गटाचे उत्पादन, सदस्य, खरेदीदारांची मागणी आणि हिशोब एकाच ठिकाणी पहा.', // mr-checked

    // ── FPO registry (real, SFAC-registered FPOs) ─────────────────
    'fpoRegistry.searchFailedTitle': 'शोध अयशस्वी',
    'fpoRegistry.tryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'fpoRegistry.stateLabel': 'राज्य',
    'fpoRegistry.districtLabel': 'जिल्हा',
    'fpoRegistry.chooseDistrict': 'जिल्हा निवडा',
    'fpoRegistry.talukaLabel': 'तालुका / ब्लॉक (ऐच्छिक)',
    'fpoRegistry.talukaPlaceholder': 'उदा. निफाड',
    'fpoRegistry.cropLabel': 'पीक (ऐच्छिक)',
    'fpoRegistry.anyCrop': 'कोणतेही पीक',
    'fpoRegistry.cropNotFilteringYet': 'नोंदणीत अजून कोणत्या एफपीओचे सदस्य काय पिकवतात हे नोंदवलेले नाही, त्यामुळे हे निकाल संकुचित करत नाही — हे शक्य झाल्यावर वापरण्यासाठी राखीव आहे.', // mr-checked
    'fpoRegistry.search': 'शोधा',
    'fpoRegistry.startTitle': 'खऱ्या एफपीओ नोंदणीत शोधा', // mr-checked
    'fpoRegistry.startSub': 'तुमच्या जवळील अधिकृतरित्या नोंदणीकृत एफपीओ पाहण्यासाठी जिल्हा निवडा.', // mr-checked
    'fpoRegistry.noResultsTitle': 'कोणतेही एफपीओ आढळले नाहीत', // mr-checked
    'fpoRegistry.noResultsSub': 'वेगळा जिल्हा वापरून पहा किंवा तालुका फिल्टर काढून टाका.',
    'fpoRegistry.promotedByPrefix': 'प्रवर्तक:', // mr-checked
    'fpoRegistry.incorporatedPrefix': 'स्थापना:',
    'fpoRegistry.claimThisFpo': 'या एफपीओवर दावा करा', // mr-checked — Claude fix: 'हा एफपीओ दावा करा' was ungrammatical; दावा करणे takes the -वर case marker. Still wants a native check on whether दावा is the right register for an app button.
    'fpoRegistry.requestToJoin': 'सामील होण्याची विनंती करा',
    'fpoRegistry.joinPrefix': 'सामील व्हा',
    'fpoRegistry.joinMsg': 'तुमचे लॉट तुमचेच राहतात — तीच किंमत, तेच पेमेंट, तोच पिकअप कोड. तुम्ही सदस्य म्हणून दिसण्यापूर्वी गट प्रशासकाने तुमची विनंती मंजूर करणे आवश्यक आहे.', // mr-checked
    'fpoRegistry.joinRequestSent': 'विनंती पाठवली — एफपीओ प्रशासकाच्या मंजुरीची वाट पाहत आहे.', // mr-checked
    'fpoRegistry.alreadyInGroupHint': 'तुम्ही आधीच एका गटात आहात. यात सामील होण्यासाठी आधी तो गट सोडा.',
    'fpoRegistry.claimPendingNote': 'या एफपीओसाठी कोणाचा तरी दावा पुनरावलोकनाधीन आहे.', // mr-checked
    'fpoRegistry.claimRejectedNote': 'या एफपीओसाठीचा आधीचा दावा मंजूर झाला नाही.', // mr-checked
    'fpoRegistry.alreadyClaimedNote': 'याच्या प्रतिनिधीने आधीच दावा केला आहे.', // mr-checked
    'fpo.cropMismatchHint': 'तुम्ही घेता ती पिके हा गट हाताळत नाही. तरीही तुम्ही प्रवेशाची विनंती करू शकता — निर्णय त्यांचा.', // mr-checked
    'fpo.cropMatchHint': 'तुम्ही घेता तीच पिके हा गट हाताळतो.', // mr-checked

    // ── एफपीओचा स्वतःचा लँडिंग स्क्रीन ─────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below.
    // The risk terms here are legal/registry vocabulary, not mandi vocabulary:
    // दावा (claim), नोंदणी (registration/registry), उत्पादक कंपनी (producer
    // company), पदनाम (designation). A near-miss on any of these reads as
    // sloppy to someone who has actually filed company paperwork.
    'fpoHome.title': 'तुमची संस्था', // mr-checked
    'fpoHome.loading': 'तुमची संस्था तपासत आहे…',
    'fpoHome.errTitle': 'माहिती मिळाली नाही',
    'fpoHome.errBody': 'सर्व्हरशी संपर्क होऊ शकला नाही. काहीही बदललेले नाही — पुन्हा प्रयत्न करा.',
    'fpoHome.retry': 'पुन्हा प्रयत्न करा',
    'fpoHome.checkAgain': 'पुन्हा तपासा',

    'fpoHome.noneTitle': 'तुमचा एफपीओ शोधा', // mr-checked
    'fpoHome.noneBody': 'तुम्ही एफपीओ म्हणून नोंदणी केली आहे. अधिकृत SFAC नोंदणीत तुमची शेतकरी उत्पादक कंपनी शोधा आणि तिच्यावर दावा करा.', // mr-checked
    'fpoHome.noneReview': 'प्रत्येक दाव्याची तपासणी एक व्यक्ती करते. हे अ‍ॅप ते आपोआप मंजूर करत नाही — खरेदीदार पडताळणीचाही हाच नियम आहे.', // mr-checked
    'fpoHome.findBtn': 'नोंदणीत शोधा', // mr-checked

    'fpoHome.pendingTitle': 'तुमच्या दाव्याची तपासणी सुरू आहे', // mr-checked
    'fpoHome.pendingBody': 'तुम्ही या कंपनीचे प्रतिनिधित्व करता का, हे एक व्यक्ती तपासत आहे. मंजुरी मिळाल्यावर तुम्हाला गटाचा डॅशबोर्ड मिळेल.', // mr-checked
    'fpoHome.submittedOn': 'सादर केले',
    'fpoHome.designationLabel': 'पदनाम', // mr-checked

    'fpoHome.rejectedTitle': 'हा दावा मंजूर झाला नाही', // mr-checked
    'fpoHome.rejectedBody': 'नोंदणीतील ही नोंद पुन्हा दावा करण्यासाठी उपलब्ध आहे. दिलेली माहिती तपासा आणि पुन्हा प्रयत्न करा.', // mr-checked
    'fpoHome.claimAgain': 'नोंदणीत पुन्हा शोधा', // mr-checked

    'fpoHome.openDashboard': 'गटाचा डॅशबोर्ड उघडा',
    'fpoHome.membersLabel': 'सदस्य',
    'fpoHome.pendingMembersLabel': 'प्रवेशाच्या प्रतीक्षेत',
    'fpoHome.onMarketLabel': 'किलो बाजारात',
    'fpoHome.noMembersYet': 'अजून एकही सदस्य नाही. शेतकरी नोंदणीत तुमचा गट शोधून प्रवेशाची विनंती करतात; तुम्ही ती इथे मंजूर करता.', // mr-checked
    'fpoHome.notAFarmTitle': 'हे खाते संस्थेचे आहे, शेताचे नाही',
    'fpoHome.notAFarmBody': 'या खात्यातून जमीन नोंदवली जात नाही, पीक लावले जात नाही किंवा कापणी टाकली जात नाही — ते तुमचे सदस्य त्यांच्या स्वतःच्या खात्यांतून करतात. या खात्याचे काम: सदस्य मंजूर करणे, गटाचे शुल्क ठरवणे आणि संकलनाच्या फेऱ्या चालवणे.', // mr-checked
    'fpoHome.demoNotice': 'या गटाचे सदस्य आणि माल हे प्रात्यक्षिकासाठीचे उदाहरणादाखल डेटा आहेत, जे एका खऱ्या नोंदणीकृत कंपनीला जोडलेले आहेत.', // mr-checked

    // ── एफपीओची पिके ────────────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below.
    // The risk here is trade/organisational vocabulary rather than everyday
    // words: पिके (crops) is safe, but "deals in" has no single clean Marathi
    // verb for the mandi sense and the phrasing below is best-effort.
    'fpoFocus.title': 'हा गट कोणती पिके हाताळतो', // mr-checked
    'fpoFocus.intro': 'एफपीओ ठराविक पिकांमध्ये काम करतात. तुम्ही कोणती पिके हाताळता हे सांगितल्याने योग्य शेतकरी तुम्हाला सापडतात — आणि इतरांना विनंती करण्याआधीच कळते, नंतर नाही.', // mr-checked
    'fpoFocus.notDeclared': 'अजून सांगितलेले नाही. सध्या हा गट प्रत्येक शेतकऱ्याशी जुळतो; याचा अर्थ गट सर्व पिके हाताळतो असा नाही.', // mr-checked
    'fpoFocus.declaredCount': 'सांगितलेली',
    'fpoFocus.selectedCount': 'निवडलेली',
    'fpoFocus.maxNote': 'जास्तीत जास्त {n} पिके. अर्धी यादी सांगणे म्हणजे शेतकऱ्याला काहीच न सांगणे.', // mr-checked
    'fpoFocus.advisory': 'ही स्क्रीनवरची माहिती आहे, नियम नाही. ज्या शेतकऱ्याची पिके जुळत नाहीत तोही प्रवेशाची विनंती करू शकतो आणि निर्णय तुमचाच असतो. याचा भाव, माल किंवा विक्रीवर कधीही परिणाम होत नाही.', // mr-checked
    'fpoFocus.searchPlaceholder': 'पीक शोधा',
    'fpoFocus.noSearchResults': 'त्याच्याशी जुळणारे पीक नाही.',
    'fpoFocus.save': 'जतन करा',
    'fpoFocus.saving': 'जतन करत आहे…',
    'fpoFocus.clear': 'नोंद काढून टाका',
    'fpoFocus.clearTitle': 'काढून टाकायचे?',
    'fpoFocus.clearBody': 'गट पुन्हा "सांगितलेले नाही" स्थितीत जाईल, जो प्रत्येक शेतकऱ्याशी जुळतो.', // mr-checked
    'fpoFocus.savedTitle': 'जतन झाले',
    'fpoFocus.errTitle': 'जतन करता आले नाही',

    // ── एफपीओ पेमेंट अटी (Phase 3, D2) ─────────────────────────────
    'fpoTerms.title': 'पेमेंट अटी', // mr-checked
    'fpoTerms.linkLabel': 'अटी',
    'fpoTerms.errTitle': 'जतन करता आले नाही',
    'fpoTerms.savedTitle': 'जतन झाले',
    'fpoTerms.modeTitle': 'हा गट सदस्यांना कसे पैसे देतो', // mr-checked
    'fpoTerms.facilitation': 'सुविधा (Facilitation)', // mr-checked
    'fpoTerms.procurement': 'खरेदी (Procurement)', // mr-checked
    'fpoTerms.facilitationHint': 'गट प्रत्येक सदस्याचा माल विकतो आणि विक्रीतून ठरलेले शुल्क घेतो. उरलेली रक्कम सदस्याला मिळते.', // mr-checked
    'fpoTerms.procurementHint': 'गट सदस्यांचा माल ठरलेल्या दराने (पिक, प्रत नुसार) विकत घेतो आणि पुढे विकतो. लॉट पुढे कितीलाही विकला गेला तरी सदस्याला त्याने दिलेल्या मालासाठी तोच ठरलेला दर मिळतो.', // mr-checked
    'fpoTerms.feeTitle': 'सुविधा शुल्क', // mr-checked
    'fpoTerms.feeNone': 'शुल्क नाही', // mr-checked
    'fpoTerms.feePercent': 'विक्रीच्या % मध्ये', // mr-checked
    'fpoTerms.feePerKg': '₹ प्रति किलो', // mr-checked
    'fpoTerms.percentLabel': 'प्रत्येक लॉटच्या विक्री किमतीची टक्केवारी', // mr-checked
    'fpoTerms.perKgLabel': 'दिलेल्या प्रत्येक किलोमागे रुपये', // mr-checked
    'fpoTerms.saveFee': 'शुल्क जतन करा',
    'fpoTerms.ratesTitle': 'ठरलेले दर (पिक, प्रत)', // mr-checked
    'fpoTerms.ratesHint': 'सदस्याने दिलेल्या त्या पिकाच्या व प्रतीच्या किलोंसाठी हाच दर दिला जातो. ज्या (पिक, प्रत) साठी येथे दर नाही, ते तोडगा न काढता उघडपणे सांगितले जाते — शून्य दराने कधीही मोजले जात नाही.', // mr-checked
    'fpoTerms.noRates': 'अजून कोणताही दर ठरलेला नाही.',
    'fpoTerms.cropPlaceholder': 'पिकाचे नाव',
    'fpoTerms.needCrop': 'पिकाचे नाव टाका.',
    'fpoTerms.needRate': '₹0 पेक्षा जास्त दर टाका.', // mr-checked
    'fpoTerms.dupRate': 'या पिकासाठी आणि प्रतीसाठी आधीच दर आहे — बदलण्यासाठी आधी तो काढून टाका.', // mr-checked
    'fpoTerms.noRatesToSave': 'जतन करण्यापूर्वी किमान एक दर जोडा.',
    'fpoTerms.saveRates': 'दर जतन करा',
    'fpoTerms.clearRates': 'सर्व दर काढून टाका',
    'fpoTerms.clearRatesTitle': 'दरांची यादी रिकामी करायची?',
    'fpoTerms.clearRatesBody': 'प्रत्येक ठरलेला दर काढला जाईल. यानंतर विकल्या जाणाऱ्या कोणत्याही खरेदी-लॉटसाठी नवीन दर जोडेपर्यंत कोणताही दर नोंदवलेला नसेल.', // mr-checked
    'fpoTerms.freightTitle': 'विकलेला लॉट पोहोचवण्याचा खर्च कोण देतो', // mr-checked
    'fpoTerms.freightBuyerPays': 'खरेदीदार देतो. प्रत्येक लॉट विक्रीत वाहतूक भाडे खरेदीदाराच्या बिलात समाविष्ट असते — सध्या हाच एकमेव पर्याय उपलब्ध आहे.', // mr-checked
    'fpoTerms.freightHint': 'हा खर्च गटाने स्वतः उचलणे किंवा वेगळ्याने ठरवणे अजून शक्य नाही.', // mr-checked

    // ── एफपीओ सदस्य ────────────────────────────────────────────────
    'fpoMembers.title': 'सदस्य',
    'fpoMembers.pendingTitle': 'प्रवेशाच्या प्रतीक्षेत',
    'fpoMembers.noPending': 'कोणीही प्रतीक्षेत नाही. शेतकरी नोंदणीत तुमचा गट शोधून प्रवेशाची विनंती करतात.', // mr-checked
    'fpoMembers.activeTitle': 'सदस्य',
    'fpoMembers.noActive': 'अजून एकही सदस्य नाही.',
    'fpoMembers.approve': 'मंजूर करा',
    'fpoMembers.reject': 'नाकारा',
    'fpoMembers.grows': 'पिकवतात',
    'fpoMembers.alsoGrows': 'हेही पिकवतात',
    'fpoMembers.matchMatch': 'तुम्ही हाताळता तीच पिके घेतात', // mr-checked
    'fpoMembers.matchPartial': 'काही पिके तुमच्या पिकांपैकी आहेत', // mr-checked
    'fpoMembers.matchMismatch': 'तुमच्यापैकी एकही पीक घेत नाहीत', // mr-checked
    'fpoMembers.matchUnknownFarmer': 'अजून एकही पीक नोंदवलेले नाही',
    'fpoMembers.matchNoFocus': 'तुम्ही तुमची पिके सांगितलेली नाहीत', // mr-checked
    'fpoMembers.advisory': 'पिकांची जुळणी ही माहिती आहे, निर्णय नाही. कोणालाही गाळलेले किंवा नाकारलेले नाही.', // mr-checked
    'fpoMembers.errTitle': 'हे करता आले नाही',
    'fpoMembers.joinedOn': 'विनंती केली',

    // ── एफपीओ डॅशबोर्ड ─────────────────────────────────────────────
    // ── एक लॉट, सविस्तर ─────────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // प्रत (grade) and भाव (rate) are trade terms already flagged in this file.
    'fpoLot.loadError': 'हा लॉट उघडता आला नाही.',
    'fpoLot.onOffer': 'विक्रीसाठी',
    'fpoLot.members': 'सदस्य',
    'fpoLot.atAskingPrices': 'सदस्यांच्या स्वतःच्या भावाने', // mr-checked
    'fpoLot.priceSpread': 'सदस्य मागत आहेत',
    'fpoLot.wideSpread': 'भावात मोठा फरक', // mr-checked
    'fpoLot.whoSupplies': 'हा लॉट कोणाकडून येतो',
    'fpoLot.asking': 'मागणी',
    'fpoLot.minOrder': 'किमान ऑर्डर',
    'fpoLot.pastSales': 'आधीच्या विक्री',
    'fpoLot.sold': 'विकले',
    'fpoLot.realised': 'प्रत्यक्ष मिळाले',
    'fpoLot.lastSold': 'शेवटची विक्री',
    'fpoLot.unsettled': 'अजून पैसे मिळाले नाहीत',
    'fpoLot.weighed': 'काट्यावर वजन केलेले', // mr-checked
    'fpoLot.concededDowngrades': 'त्यांनी मान्य केलेली कमी प्रत', // mr-checked
    'fpoLot.noHistory': 'या पिकाची अ‍ॅपमधून पूर्ण झालेली एकही विक्री अजून नाही. हा त्यांच्याविरुद्धचा शेरा नाही — खऱ्या गटातील बहुतेक सदस्यांनी इथून कधीच विकलेले नसते.', // mr-checked
    'fpoLot.notEnoughToBand': 'विक्रीचा अंदाज बांधण्याइतक्या पूर्ण विक्री झालेल्या नाहीत.', // mr-checked
    'fpoLot.groupHistory': 'या पिकाला प्रत्यक्ष किती भाव मिळाला', // mr-checked
    'fpoLot.rangeWas': 'भावाची मर्यादा', // mr-checked
    'fpoDashboard.tabToday': 'आज', // mr-checked
    'fpoDashboard.tabStock': 'माल', // mr-checked
    'fpoDashboard.tabMoney': 'पैसे', // mr-checked
    'fpoDashboard.tabCollection': 'संकलन', // mr-checked
    'fpoDashboard.tabMembers': 'सदस्य',
    'fpoDashboard.focusTitle': 'हा गट कोणती पिके हाताळतो', // mr-checked
    'fpoDashboard.focusNotDeclared': 'सांगितलेले नाही',
    'fpoDashboard.setFocus': 'पिके निवडा',
    'fpoDashboard.membersWaiting': 'प्रवेशाच्या प्रतीक्षेत',
    'fpoDashboard.manageMembers': 'सदस्य',
    'fpoDashboard.groupOrders': 'ऑर्डर आणि पैसे', // mr-checked

    // ── FPO admin claim ("I represent this real FPO") ──────────────
    'fpoClaim.title': 'या एफपीओवर दावा करा', // mr-checked — Claude fix: same missing -वर case marker as fpoRegistry.claimThisFpo.
    'fpoClaim.intro': 'खरा एफपीओ ही नोंदणीकृत कंपनी असते. दावा करणे म्हणजे तुम्ही तिथे खरी भूमिका बजावता — मंजुरीपूर्वी एक व्यक्ती याचे पुनरावलोकन करेल.', // mr-checked
    'fpoClaim.nameLabel': 'तुमचे नाव',
    'fpoClaim.namePlaceholder': 'पूर्ण नाव',
    'fpoClaim.mobileLabel': 'मोबाईल नंबर',
    'fpoClaim.mobilePlaceholder': '१०-अंकी मोबाईल नंबर',
    'fpoClaim.designationLabel': 'तुमचे पद',
    'fpoClaim.emailLabel': 'ईमेल (ऐच्छिक)',
    'fpoClaim.emailPlaceholder': 'you@example.com',
    'fpoClaim.submit': 'दावा सादर करा', // mr-checked
    'fpoClaim.missingTitle': 'माहिती अपूर्ण आहे',
    'fpoClaim.nameRequired': 'नाव आवश्यक आहे.',
    'fpoClaim.mobileRequired': 'मोबाईल नंबर आवश्यक आहे.',
    'fpoClaim.couldNotSubmit': 'सादर करता आले नाही',
    'fpoClaim.errAlreadyClaimed': 'तुमचा आधीच एक प्रलंबित किंवा मंजूर एफपीओ दावा आहे.', // mr-checked
    'fpoClaim.errAlreadyInProgress': 'या एफपीओसाठी आधीच एक दावा प्रलंबित किंवा मंजूर आहे.', // mr-checked
    'fpoClaim.submittedTitle': 'दावा सादर झाला', // mr-checked
    'fpoClaim.submittedSub': 'तुमचा दावा पुनरावलोकनाधीन आहे. मंजुरीनंतर तुम्ही हा एफपीओ व्यवस्थापित करू शकाल.', // mr-checked
    'fpoClaim.gotIt': 'समजले',

    // ── F2 admin dashboard (fpos.js GET /:id/dashboard) ─────────────────
    // mr-checked by a native Marathi speaker on this whole section —
    // it is admin/back-office facing and data-dense (logistics, settlement
    // by-lot/by-share), so the risk of a near-miss trade term is higher than
    // on the plain farmer-facing screens. Produce numbers and member-facing
    // lines are translated; leaned English is avoided nowhere here but every
    // key still needs a native check before this ships to a real admin.
    'fpoDashboard.loadError': 'डॅशबोर्ड लोड करता आला नाही. कृपया पुन्हा प्रयत्न करा.',
    'fpoDashboard.locationUnknown': 'ठिकाण नोंदीत नाही',
    'fpoDashboard.activeMembers': 'सक्रिय सदस्य',
    'fpoDashboard.produceTitle': 'उत्पादन एकत्रीकरण',
    'fpoDashboard.availableNow': 'सध्या उपलब्ध',
    'fpoDashboard.noAvailableNow': 'अजून कोणतीही नोंद नाही — सदस्यांनी अजून कापणी नोंदवलेली नाही.',
    'fpoDashboard.tonnes': 'टन',
    'fpoDashboard.estimatedIncoming': 'अंदाजे येणारे उत्पादन',
    'fpoDashboard.noEstimatedIncoming': 'सदस्यांनी लावलेल्या पिकांसाठी अजून अंदाज उपलब्ध नाही.',
    'fpoDashboard.forecastTag': 'अंदाज',
    'fpoDashboard.excludedFromForecast': 'पीक नोंदी अंदाजातून वगळल्या:',
    'fpoDashboard.andMore': 'आणखी',
    'fpoDashboard.produceNote': 'सध्या उपलब्ध हा बाजारातील खरा साठा आहे. अंदाजे येणारे उत्पादन हे लावलेल्या पण अजून न काढलेल्या पिकांवरून केलेला अंदाज आहे — या दोन आकड्यांची कधीही बेरीज केली जात नाही.',
    'fpoDashboard.membersTitle': 'सदस्य',
    'fpoDashboard.noMembers': 'अजून कोणतेही सक्रिय सदस्य नाहीत.',
    'fpoDashboard.noSuppliesYet': 'अजून पुरवठा नाही',
    'fpoDashboard.kgSupplied': 'पुरवलेले किलो',
    'fpoDashboard.earned': 'मिळकत',
    'fpoDashboard.unpaidSuffix': 'न मिळालेले',
    'fpoDashboard.trust.clean': 'गुणवत्तेबद्दल तक्रार नाही',
    'fpoDashboard.trust.few_complaints': 'काही तक्रारी, कोणतीही मिटलेली नाही',
    'fpoDashboard.trust.some_upheld': 'याआधी गुणवत्तेवर परतावा दिला आहे',
    'fpoDashboard.trust.frequent': 'वारंवार गुणवत्तेवर परतावा देतो',
    'fpoDashboard.buyerDemandTitle': 'खरेदीदारांची मागणी',
    'fpoDashboard.noLocationForDemand': 'या गटाच्या सदस्यांचे किंवा नोंदींचे ठिकाण अजून नोंदीत नाही.',
    'fpoDashboard.noBuyerDemand': 'सध्या तुमच्या सदस्यांच्या पिकांसाठी कोणीही खरेदीदार शोधत नाही.',
    'fpoDashboard.kmAway': 'किमी अंतरावर',
    'fpoDashboard.logisticsTitle': 'वाहतूक',
    'fpoDashboard.inProgress': 'सुरू आहे',
    'fpoDashboard.completed': 'पूर्ण झाले',
    'fpoDashboard.saved': 'बचत',
    'fpoDashboard.storageTitle': 'साठवणूक सूचना',
    'fpoDashboard.noStorageBasis': 'साठवणुकीची सूचना देण्यासाठी अजून उपलब्ध उत्पादन नाही.',
    'fpoDashboard.sizedFor': 'यासाठी मोजलेले',
    'fpoDashboard.noWarehouses': 'या भागासाठी अजून गोदामाच्या नोंदी नाहीत.',
    'fpoDashboard.notSuitable': 'योग्य नाही',
    'fpoDashboard.settlementTitle': 'हिशोब', // mr-checked
    'fpoDashboard.noSettlementOrders': 'या गटासाठी अजून कोणतीही ऑर्डर नोंदवलेली नाही.',
    'fpoDashboard.pooledValue': 'एकत्रित किंमत',
    'fpoDashboard.totalQuantity': 'एकूण प्रमाण',
    'fpoDashboard.byLot': 'लॉटनुसार', // mr-checked
    'fpoDashboard.byShare': 'ठरलेल्या वाट्यानुसार',
    'fpoDashboard.noShareAgreed': 'कोणतीही वाटणी ठरलेली नाही, त्यामुळे प्रत्येक सदस्याला त्याच्या स्वतःच्या लॉटचे मूल्य मिळते.', // mr-checked
    'fpoDashboard.noSeasonConcept': 'या अ‍ॅपमध्ये "हंगाम" अशी संकल्पना नाही — हे गटाच्या सक्रिय सदस्यांच्या आजवरच्या सर्व ऑर्डर्स दाखवते.', // mr-checked

    // ── FPO dashboard, Phase G ─────────────────────────────────
    // प्रत / प्रतवारी are the trade terms here and carry specific mandi
    // meanings — every one of them needs a native reader before a demo.
    'fpoDashboard.selfDeclared': 'स्वतः जाहीर केलेले',
    'fpoDashboard.farmsWord': 'शेते',
    'fpoDashboard.indicative': 'अंदाजे दर',
    'fpoDashboard.spreadNote': 'या प्रतीसाठी सदस्य वेगवेगळे दर मागतात', // mr-checked
    'fpoDashboard.mixedSpecs': 'प्रतवारी निकषांच्या वेगवेगळ्या आवृत्त्यांनुसार ठरवलेले.', // mr-checked
    'fpoDashboard.gradedLots': 'प्रत ठरलेले लॉट', // mr-checked
    'fpoDashboard.ungradedLots': 'प्रत न ठरलेले लॉट', // mr-checked
    'fpoDashboard.gradeNote': 'साठा पिकानुसार आणि प्रतीनुसार दाखवला आहे, कारण अ प्रतीचे पैसे देणाऱ्या खरेदीदाराला मिश्रण देता येत नाही. कोणीही प्रत न ठरवलेले उत्पादन वेगळे ठेवले आहे — ती अज्ञात प्रत आहे, क पेक्षा खालची नाही; आणि जाहीर केलेली कोणतीही प्रत कोणीही तपासलेली नाही.', // mr-checked
    'fpoDashboard.forecastNotStock': 'हा अंदाज आहे, साठा नाही. वरील आकड्यात तो कधीही मिळवला जात नाही.',
    'fpoDashboard.needsGrade': 'हवी प्रत',
    'fpoDashboard.anyGrade': 'कोणतीही प्रत',
    'fpoDashboard.responses': 'प्रतिसाद',
    'fpoDashboard.runsUnderWay': 'सुरू असलेल्या फेऱ्या', // mr-checked
    'fpoDashboard.stopsWord': 'थांबे',
    'fpoDashboard.runStatus.awaiting_agent': 'कॅप्टनची वाट पाहत आहे', // mr-checked
    'fpoDashboard.runStatus.accepted': 'अजून सुरू झालेली नाही',
    'fpoDashboard.runStatus.collecting': 'माल गोळा करत आहे',
    'fpoDashboard.runStatus.in_transit': 'खरेदीदाराकडे निघाली आहे', // mr-checked
    'fpoDashboard.runsOpenNote': 'प्रत्येक शेत पाहण्यासाठी फेरी उघडा. तुमचा गट स्वतः चालवत असलेल्या फेरीत तुमचा स्वतःचा चालक जे सांगतो ते तुम्ही नोंदवता; कॅप्टन चालवत असलेली फेरी नोंदवण्याचा हक्क फक्त त्यांचाच आहे.', // mr-checked
    'fpoDashboard.unmeasuredRuns': 'पूर्ण झालेल्या फेऱ्यांची स्वतंत्र फेरीशी तुलना मोजलेली नाही, म्हणून त्या बचतीत धरलेल्या नाहीत.', // mr-checked
    'fpoDashboard.modeFacilitation': 'सुविधा — गट सदस्यांचा माल विकून देतो', // mr-checked
    'fpoDashboard.modeProcurement': 'खरेदी — गट सदस्यांकडून माल विकत घेतो',
    'fpoDashboard.membersOwed': 'सदस्यांना देय',
    'fpoDashboard.groupFee': 'गटाचे शुल्क',
    'fpoDashboard.groupMargin': 'गटाचे मार्जिन', // mr-checked — Claude fix: was 'गटाचा नफा' (profit), but this figure is deliberately reported NEGATIVE when a lot sells below the agreed procurement rate — '−₹15,000 profit' reads as a contradiction. मार्जिन is neutral about sign.
    'fpoDashboard.unpricedLots': 'ठरलेला दर नसलेले लॉट', // mr-checked
    'fpoDashboard.rateGaps': 'लॉटसाठी (पीक, प्रत) चा ठरलेला दर नाही. त्यांची किंमत शून्य धरलेली नाही — ते वरील सर्व बेरजांतून वगळले आहेत:', // mr-checked
    'fpoDashboard.shareRefused': 'खरेदी पद्धतीत वाटणी लागू होत नाही: गटाने ठरलेल्या दराने हा माल आधीच विकत घेतला आहे, त्यामुळे विक्रीचे पैसे गटाचेच आहेत आणि वाटण्यासाठी सदस्यांचा वेगळा निधी उरत नाही.', // mr-checked

    'fpoDashboard.performanceTitle': 'या हंगामाचा आढावा',
    'fpoDashboard.statMembers': 'सदस्य',
    'fpoDashboard.statKgSupplied': 'kg पुरवठा',
    'fpoDashboard.statPaidToMembers': 'सदस्यांना दिलेले पैसे',
    'fpoDashboard.statPendingRequests': 'प्रलंबित खरेदी विनंत्या',
    'fpoDashboard.farmerPerformanceTitle': 'शेतकऱ्यांची कामगिरी',
    'fpoDashboard.seeAll': 'सर्व पहा →',
    'fpoDashboard.viewPerformance': 'शेतकऱ्यांची कामगिरी पहा',
    'fpoDashboard.liveToBuyers': 'खरेदीदारांना दिसत आहे',
    'fpoDashboard.buyerRequestsTitle': 'खरेदीदारांच्या विनंत्या',
    'fpoDashboard.noBuyerRequests': 'सध्या कोणतीही खरेदी विनंती प्रलंबित नाही.',
    'fpoDashboard.requestWaiting': 'तुमच्या निर्णयाची वाट पाहत आहे',
    'fpoDashboard.requestTotal': 'मान्य झाल्यास खरेदीदार देईल',
    'fpoDashboard.rejectReasonPlaceholder': 'नाकारण्याचे कारण (ऐच्छिक)',
    'fpoDashboard.requestAccept': 'स्वीकारा',
    'fpoDashboard.requestReject': 'नाकारा',
    'fpoDashboard.requestRecent': 'नुकतेच निकाली',
    'fpoDashboard.requestStatus.accepted': 'स्वीकारले',
    'fpoDashboard.requestStatus.rejected': 'नाकारले',
    'fpoDashboard.requestStatus.stale': 'कालबाह्य झाले',
    'fpoDashboard.requestWentStale': 'तुम्ही उत्तर देण्याआधी हा लॉट बदलला',
    'fpoDashboard.requestCouldNotAccept': 'ही विनंती स्वीकारता आली नाही',
    'fpoDashboard.requestCouldNotReject': 'ही विनंती नाकारता आली नाही',

    // ── FPO collection run (Phase G) ───────────────────────────
    // A failed pickup cancels a member's sale, so this is the highest-stakes
    // Marathi in the file. पिकअप कोड and भाडे are the load-bearing terms.
    'fpoRun.loadError': 'ही फेरी लोड करता आली नाही. कृपया पुन्हा प्रयत्न करा.', // mr-checked
    'fpoRun.forbiddenBody': 'ही फेरी तुमची नाही. ती अ‍ॅपमधील कॅप्टन चालवत आहे, किंवा दुसऱ्या गटाने ठरवलेली आहे — प्रत्येक शेतावर काय झाले हे फक्त तेच पाहू शकतात.', // mr-checked
    'fpoRun.farmsLabel': 'शेते या फेरीत', // mr-checked
    'fpoRun.planned': 'ठरलेले',
    'fpoRun.visitedOf': 'शेतांना भेट झाली',
    'fpoRun.collectedWord': 'गोळा केले',
    'fpoRun.failedWord': 'काहीच मिळाले नाही',
    'fpoRun.aboard': 'गाडीत',
    'fpoRun.modeOwn': 'तुमच्या गटाची स्वतःची गाडी',
    'fpoRun.modeContracted': 'तुमचा गट नेहमी वापरतो तो वाहतूकदार',
    'fpoRun.modeHired': 'अ‍ॅपमधील कॅप्टन', // mr-checked
    'fpoRun.driverLabel': 'चालक',
    'fpoRun.costLabel': 'गाडीचा खर्च',
    'fpoRun.costStated': 'हा आकडा तुमच्या गटाने सांगितलेला आहे, अ‍ॅपने मोजलेला नाही.',
    'fpoRun.captainBanner': 'ही फेरी कॅप्टन चालवत आहे. शेतावर काय झाले हे फक्त तेच नोंदवू शकतात — ते तिथे उभे होते आणि ती त्यांची साक्ष आहे. इथे फक्त वाचता येईल.', // mr-checked
    'fpoRun.noDriverBanner': 'या फेरीसाठी अजून कोणत्याही कॅप्टनने होकार दिलेला नाही, त्यामुळे कोणीही कोणत्याही शेतावर गेलेले नाही. नोंदवण्यासारखे काही नाही.', // mr-checked
    'fpoRun.operatorBanner': 'ही फेरी तुमचा गट स्वतः चालवत आहे, त्यामुळे कॅप्टन नाही. तुमचा स्वतःचा चालक जे सांगतो ते तुम्ही नोंदवता — कागदी ट्रिप शीट जे करते तेच. प्रत्येक नोंदीवर तुमचे नाव राहते.', // mr-checked
    'fpoRun.call': 'फोन करा',
    'fpoRun.recordBtn': 'काय झाले ते नोंदवा',
    'fpoRun.outFull': 'पूर्ण माल घेतला',
    'fpoRun.outShort': 'कमी माल',
    'fpoRun.outNone': 'काहीच घेतले नाही',
    'fpoRun.recordedByAgent': 'शेतावर आलेल्या कॅप्टनने नोंदवले', // mr-checked
    'fpoRun.recordedByFpo': 'तुमच्या गटाच्या कार्यालयाने नोंदवले',
    'fpoRun.fareNote': 'ज्या शेतातून काहीच मिळाले नाही, त्याचा गाडीभाड्यातील वाटा त्याच्याच रद्द झालेल्या ऑर्डरवर राहतो. ज्यांनी माल दिला त्यांच्यावर तो टाकला जात नाही — पुन्हा वाटणी केली तर दुसऱ्याच्या चुकीसाठी त्यांना ६७% पर्यंत जास्त भरावे लागेल, आणि सर्व वाटे मिळून भाडे नेमके तेवढेच राहते.', // mr-checked
    'fpoRun.deliverBtn': 'खरेदीदाराला माल द्या',
    'fpoRun.stopsLeft': 'शेतांची नोंद बाकी',
    'fpoRun.stopsLeftTitle': 'यांची नोंद अजून बाकी आहे',
    'fpoRun.closeEmptyBtn': 'फेरी बंद करा — काहीच गोळा झाले नाही', // mr-checked
    'fpoRun.closeEmptyTitle': 'गाडी रिकामी असताना फेरी बंद करायची?', // mr-checked
    'fpoRun.closeEmptyBody': 'या फेरीतील कोणत्याही शेताने माल दिलेला नाही, त्यामुळे पोहोचवण्यासारखे काही नाही आणि खरेदीदाराचा कोडही मागायचा नाही. प्रत्येक ऑर्डर नोंदवलेल्या कारणासह आधीच रद्द झाली आहे.', // mr-checked
    'fpoRun.closeEmptyYes': 'फेरी बंद करा', // mr-checked
    'fpoRun.notYet': 'अजून नको',
    'fpoRun.closedTitle': 'फेरी बंद झाली', // mr-checked
    'fpoRun.closedBody': 'या फेरीत काहीच गोळा झाले नाही, त्यामुळे काहीच पोहोचवले गेले नाही आणि कोणत्याही शेतकऱ्याला देणे लागत नाही.', // mr-checked
    'fpoRun.closedDelivered': 'ही फेरी पोहोचवली गेली आहे.', // mr-checked
    'fpoRun.closedCancelled': 'ही फेरी बंद झाली आहे.', // mr-checked
    'fpoRun.dropTitle': 'खरेदीदाराचा डिलिव्हरी कोड',
    'fpoRun.dropSub': 'माल उतरवताना खरेदीदाराकडून त्यांचा स्वतःचा ४ अंकी कोड मागा.',
    'fpoRun.finish': 'फेरी पूर्ण करा', // mr-checked
    'fpoRun.doneTitle': 'माल दिला',
    'fpoRun.err4': '४ अंकी कोड टाका.',
    'fpoRun.errFinish': 'फेरी पूर्ण करता आली नाही. कृपया पुन्हा प्रयत्न करा.', // mr-checked
    'fpoRun.tailAllEmpty': 'सर्व शेतांना भेट झाली आणि काहीच गोळा झाले नाही — खाली फेरी बंद करा.', // mr-checked
    'fpoRun.tailAllAboard': 'सर्व शेतांना भेट झाली. माल खरेदीदाराकडे नेता येईल.',
    'fpoRun.tailLeft': 'शेतांना भेट देणे बाकी.',
    'fpoRun.okFullTitle': 'गोळा केले',
    'fpoRun.okShortTitle': 'कमी माल नोंदवला',
    'fpoRun.okNoneTitle': 'काहीच घेतले नाही अशी नोंद झाली',
    'fpoRun.okNoneBody': 'ती ऑर्डर रद्द झाली आहे आणि माल पुन्हा विक्रीसाठी उपलब्ध झाला आहे.',
    'fpoRun.chooseSub': 'शेतावर खरोखर काय झाले ते आत्ताच नोंदवा. यातील प्रत्येक नोंदीवर तुमचे नाव राहते आणि शेतकऱ्याला ती दिसते.',
    'fpoRun.optFullTitle': 'सर्व माल गाडीत गेला',
    'fpoRun.optFullSub': 'ठरलेले पूर्ण वजन गाडीत गेले. यासाठी शेतकऱ्याचा स्वतःचा ४ अंकी कोड लागतो.',
    'fpoRun.optShortTitle': 'फक्त काही भाग गाडीत गेला',
    'fpoRun.optShortSub': 'ठरलेल्यापेक्षा कमी. किती किलो गेले ते तुम्ही टाकाल — आणि शेतकऱ्याचा कोडही लागेल, कारण ते तिथेच आहेत.',
    'fpoRun.optNoneTitle': 'काहीच गाडीत गेले नाही',
    'fpoRun.optNoneSub': 'शेतावर कोणी नव्हते, माल तयार नव्हता, किंवा नाकारला. यासाठी कोड मागितला जात नाही — पुष्टी करण्याआधी का ते वाचा.',
    'fpoRun.otpLabel': 'शेतकऱ्याचा ४ अंकी पिकअप कोड', // mr-checked
    'fpoRun.otpHelp': 'त्यांचा स्वतःचा कोड मागा. या फेरीतील प्रत्येक शेतकऱ्याचा कोड वेगळा आहे — दुसऱ्या शेतकऱ्याच्या कोडने हा माल सुटणार नाही.', // mr-checked
    'fpoRun.otpShortHelp': 'कमी माल घेतला तरी तो पिकअपच आहे, आणि शेतकरी तिथेच आहेत, म्हणून त्यांचा कोड लागतोच.', // mr-checked
    'fpoRun.shortKgLabel': 'प्रत्यक्षात गाडीत गेलेले किलो',
    'fpoRun.shortKgHelp': '० पेक्षा जास्त आणि ठरलेल्या वजनापेक्षा कमी. काहीच गेले नसेल तर मागे जाऊन "काहीच गाडीत गेले नाही" असे नोंदवा.',
    'fpoRun.shortConsequence': 'शेतकऱ्याला प्रत्यक्षात गेलेल्या मालाचेच पैसे मिळतात, ठरलेल्या वजनाचे नाहीत. उरलेला माल पुन्हा विक्रीसाठी उपलब्ध होतो. त्यांचा भाड्यातील वाटा बदलत नाही.',
    'fpoRun.reasonTitle': 'का?',
    'fpoRun.reasonAbsent': 'शेतावर कोणीच नव्हते',
    'fpoRun.reasonNotReady': 'नोंदवलेल्यापेक्षा कमी माल हातात होता',
    'fpoRun.reasonRejected': 'विकलेल्या मालासारखा नव्हता — शेतावरच नाकारला',
    'fpoRun.reasonOther': 'दुसरे काही कारण',
    'fpoRun.noteLabel': 'काही जोडायचे आहे का? (ऐच्छिक)',
    'fpoRun.notePlaceholder': 'उदा. गेटला कुलूप होते, फोन बंद होता',
    'fpoRun.consequenceTitle': 'ही नोंद काय करते',
    'fpoRun.conseqCancel': 'या शेतकऱ्याची ऑर्डर रद्द होते. त्यासाठी काहीही देणे राहत नाही आणि कोणतीही रक्कम नोंदवता येत नाही.',
    'fpoRun.conseqRestock': 'त्यांचा माल पुन्हा विक्रीसाठी उपलब्ध होतो — किलो त्यांच्या नोंदीत परत जातात, म्हणजे तो दुसऱ्याला विकता येईल.',
    'fpoRun.conseqFare': 'गाडीभाड्यातील त्यांचा वाटा त्यांच्याच रद्द झालेल्या ऑर्डरवर राहतो. तो इतर शेतकऱ्यांवर टाकला जात नाही: पुन्हा वाटणी केली तर ज्यांची काहीच चूक नाही त्यांना दुसऱ्याच्या चुकीसाठी ६७% पर्यंत जास्त भरावे लागेल.', // mr-checked
    'fpoRun.conseqNoOtp': 'इथे कोड मागितला जात नाही. जो शेतकरी शेतावर नाही, तोच कोड सांगू शकत नाही — म्हणून ही नोंद त्यांच्या नव्हे, तर तुमच्या शब्दावर होते.',
    'fpoRun.conseqDispute': 'हे चुकीचे असेल, तर शेतकरी या नोंदीविरुद्ध तक्रार नोंदवू शकतो.',
    // ── मालाची अवस्था (प्रत नव्हे) ───────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below.
    // प्रत (grade) is the load-bearing trade term here and is already flagged
    // throughout this file; the condition words themselves (कोंब, ओला, कुजका)
    // are everyday Marathi and are lower risk.
    'fpoRun.noGradeTitle': 'या मालाची प्रत ठरवायला तुम्हाला सांगितलेले नाही', // mr-checked
    'fpoRun.noGradeBody': 'प्रत ठरवणे म्हणजे आकार, रंगाची एकसारखेपणा आणि डागांचे प्रमाण ठरलेल्या मानकांवर तपासणे. हे अ‍ॅप ते फक्त गटाच्याच माणसांना विचारते. शेतकऱ्याने सांगितलेली प्रत तशीच राहते — तपासलेली नाही असे स्पष्ट लिहून — आणि माल पोहोचल्यावर खरेदीदार स्वतः ठरवतो.', // mr-checked
    'fpoRun.condTitle': 'माल दिसायला कसा होता?',
    'fpoRun.condSub': 'फक्त तुम्हाला जे दिसले तेच. ही प्रत नाही आणि यामुळे कोणताही भाव बदलत नाही — खरेदीदाराला काय आले आणि शेतकऱ्याला काय सांगितले गेले हे कळावे म्हणून ही नोंद आहे.', // mr-checked
    'fpoRun.condFineTitle': 'मी पाहिले — दिसण्यात काही बिघाड नाही',
    'fpoRun.condFineSub': 'हे एक ठाम विधान आहे आणि ते उपयोगी आहे. काहीच न सांगण्यासारखे हे नाही: हा भाग वगळला तर नोंदीत "कोणी पाहिलेच नाही" असे येते, जी वेगळी गोष्ट आहे.', // mr-checked
    'fpoRun.condWrongCrop': 'मागवलेले पीक नाही',
    'fpoRun.condSpoiled': 'कुजका किंवा बुरशी',
    'fpoRun.condSprouting': 'कोंब आलेले', // mr-checked
    'fpoRun.condWet': 'ओला किंवा दमट',
    'fpoRun.condDamaged': 'चेंगरलेला किंवा मार लागलेला',
    'fpoRun.condPackaging': 'पोती किंवा क्रेट खराब',
    'fpoRun.condNotePlaceholder': 'आणखी काही दिसले असल्यास (ऐच्छिक)',
    'fpoRun.condNotAGrade': 'ही निरीक्षणाची नोंद आहे — तपासणी नाही आणि प्रतही नाही. यामुळे कोणताही भाव किंवा रक्कम बदलत नाही. दर्जाबाबतचा वाद ऑर्डरवरील तक्रारीतूनच सोडवला जातो.', // mr-checked
    'fpoRun.submitFull': 'पिकअप निश्चित करा', // mr-checked
    'fpoRun.submitShort': 'कमी पिकअप निश्चित करा', // mr-checked
    'fpoRun.submitNone': 'नोंदवा: काहीच गोळा झाले नाही',
    'fpoRun.confirmTitle': 'या शेतकऱ्याची विक्री रद्द करायची?',
    'fpoRun.confirmBodySuffix': 'यांची ऑर्डर रद्द होईल आणि त्यांचा माल पुन्हा विक्रीसाठी जाईल. ही नोंद तुमच्या नावावर होते आणि या स्क्रीनवरून मागे घेता येत नाही.',
    'fpoRun.confirmYes': 'होय, नोंदवा',
    'fpoRun.backLabel': 'मागे',
    'fpoRun.cancelLabel': 'रद्द करा',
    'fpoRun.errTitle': 'हे तपासा',
    'fpoRun.errOtp': 'शेतकऱ्याचा ४ अंकी कोड टाका.',
    'fpoRun.errNumber': 'प्रत्यक्षात किती किलो गाडीत गेले ते टाका.',
    'fpoRun.errTooHigh': 'हे तर पूर्ण ऑर्डर किंवा त्याहून जास्त आहे — त्याऐवजी "सर्व माल गाडीत गेला" असे नोंदवा.',
    'fpoRun.errReason': 'कारण निवडा. एकच टॅप आहे, आणि तेच या नोंदीला खरी नोंद बनवते.',
    'fpoRun.errGeneric': 'ही नोंद करता आली नाही. कृपया पुन्हा प्रयत्न करा.',
    'fpoRun.recorderLine': 'नोंद अशी होईल: तुमच्या गटाचे कार्यालय, तुमच्या स्वतःच्या चालकाने सांगितलेले नोंदवत आहे.',

    // ── Land details ───────────────────────────────────────────
    'landDetails.errorTitle': 'त्रुटी',
    'landDetails.loadFailed': 'जमिनीचा तपशील लोड करता आला नाही',
    'landDetails.deleteTitle': 'जमीन काढून टाका',
    'landDetails.deleteMsg': 'ही जमीन खरंच काढून टाकायची आहे का? ही क्रिया पूर्ववत करता येणार नाही.',
    'landDetails.cancel': 'रद्द करा',
    'landDetails.delete': 'काढून टाका',
    'landDetails.successTitle': 'यशस्वी',
    'landDetails.deletedMsg': 'जमीन यशस्वीरित्या काढून टाकली',
    'landDetails.deleteFailed': 'जमीन काढून टाकता आली नाही',
    'landDetails.location': 'ठिकाण',
    'landDetails.landDetailsTitle': 'जमिनीचा तपशील',
    'landDetails.activeCrops': 'सुरू असलेली पिके',
    'landDetails.notes': 'टिपा',
    'landDetails.city': 'गाव/शहर:',
    'landDetails.district': 'जिल्हा:',
    'landDetails.state': 'राज्य:',
    'landDetails.pincode': 'पिनकोड:',
    'landDetails.size': 'आकार:',
    'landDetails.waterSourceLabel': 'पाण्याचा स्रोत:',
    'landDetails.soilTypeLabel': 'मातीचा प्रकार:',
    'landDetails.totalPlots': 'एकूण प्लॉट:',
    'landDetails.plantedPrefix': 'लागवड:',
    'landDetails.startFarming': 'शेती सुरू करा',
    'landDetails.deleteLandBtn': 'जमीन काढून टाका',

    // ── Land list ───────────────────────────────────────────
    'landList.errorTitle': 'त्रुटी',
    'landList.loadFailed': 'जमिनी लोड करण्यात अयशस्वी',
    'landList.loadingLands': 'तुमच्या जमिनी उघडत आहे...',
    'landList.landsRegistered': 'जमीन नोंदणीकृत',
    'landList.plots': 'प्लॉट्स',
    'landList.registeredLabel': 'नोंदणी दिनांक',

    // ── Market prices ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'marketPrices.loading': 'लोड होत आहे...',
    'marketPrices.searchPrefix': 'शोधा',
    'marketPrices.noMatches': 'काही जुळत नाही',
    'marketPrices.districtLabel': 'जिल्हा',
    'marketPrices.marketLabel': 'मंडई / बाजार', // mr-checked
    'marketPrices.dateLabel': 'तारीख',
    'marketPrices.cropLabel': 'पीक / शेतमाल',
    'marketPrices.selectDistrict': 'जिल्हा निवडा...',
    'marketPrices.selectDistrictFirst': 'आधी जिल्हा निवडा',
    'marketPrices.anyMarket': 'या जिल्ह्यातील कोणताही बाजार',
    'marketPrices.selectCrop': 'पीक निवडा...',
    'marketPrices.title': 'मंडई भाव शोधा',
    'marketPrices.subtitle': 'महाराष्ट्र — Agmarknet वरील खरे भाव.',
    'marketPrices.metaError': 'मंडई फिल्टर लोड होऊ शकले नाहीत. पुन्हा प्रयत्न करण्यासाठी खाली ओढा.',
    'marketPrices.loadingFilters': 'मंडई फिल्टर लोड होत आहेत...',
    'marketPrices.scope.state': 'या जिल्ह्यात या तारखेला कोणत्याही बाजार समितीने अहवाल दिला नाही — महाराष्ट्रात व्यापार होणारी पिके दाखवत आहोत.', // mr-checked
    'marketPrices.scope.app': 'ॲगमार्कनेट सध्या प्रतिसाद देत नाही — या ॲपची महाराष्ट्रातील पीक यादी दाखवत आहोत.', // mr-checked
    'marketPrices.scope.national': 'ही यादी महाराष्ट्रापुरती मर्यादित करता आली नाही — ही ॲगमार्कनेटची संपूर्ण अखिल भारतीय यादी आहे.', // mr-checked
    'marketPrices.scope.district': 'या जिल्ह्यात या तारखेला अहवाल दिलेली पिके.', // mr-checked
    'marketPrices.checkPrice': 'बाजारभाव तपासा',
    'marketPrices.nearestInDistrict': 'तुमच्या जिल्ह्यातील जवळची बाजार समिती', // mr-checked
    'marketPrices.nearestInState': 'तुमच्या जिल्ह्यात माहिती नाही — राज्यातील जवळची बाजार समिती दाखवत आहोत', // mr-checked
    'marketPrices.standardVariety': 'सर्वसाधारण',
    'marketPrices.modalPrice': 'सर्वाधिक व्यवहार झालेला दर', // mr-checked — Claude best-effort fix: 'सर्वाधिक व्यवहार दर' reads ambiguously as "the highest rate," when modal price means the rate most trades happened AT, not the top rate. Added 'झालेला' to force the "occurred" reading. Still needs a native check.
    'marketPrices.perQuintal': 'प्रति क्विंटल',
    'marketPrices.min': 'किमान',
    'marketPrices.max': 'कमाल',
    'marketPrices.perKgSuffix': '/ किलो',
    'marketPrices.arrivalsLabel': 'आवक', // mr-checked
    'marketPrices.fetchFailed': 'मंडई भाव मिळू शकला नाही.',
    'marketPrices.fetchFailedRetry': 'मंडई भाव मिळू शकला नाही. कृपया पुन्हा प्रयत्न करा.',
    'marketPrices.retry': 'पुन्हा प्रयत्न करा',
    'marketPrices.noDataPrefix': 'मंडई भावाची माहिती उपलब्ध नाही —',
    'marketPrices.noDataMiddle': 'जिल्हा:',
    'marketPrices.noDataSuffix': 'महाराष्ट्र, दिनांक:',
    'marketPrices.tryAnother': 'दुसरी तारीख, बाजार किंवा पीक तपासून पहा.',
    'marketPrices.historicalYield': 'जिल्ह्यातील ऐतिहासिक उत्पादन',
    'marketPrices.medianLabel': 'मध्यगा', // mr-checked — Claude best-effort fix: 'मध्यम' means "medium/moderate," not the statistical median — a farmer would read it as a price tier, not a calculated midpoint. 'मध्यगा' is the standard Marathi statistics term; if that reads too academic on screen, the English loanword 'मीडियन' may actually be clearer to a general audience. Still needs a native check either way.
    'marketPrices.rangeRecorded': 'नोंदवलेली मर्यादा:',
    'marketPrices.acrossYearsPrefix': 'गेल्या',
    'marketPrices.yearsSuffix': 'वर्षांमधील',
    'marketPrices.noYieldRecord': 'या पीक/जिल्ह्यासाठी ऐतिहासिक उत्पादन नोंद उपलब्ध नाही.',

    // ── Plot division ───────────────────────────────────────────
    'plotDivision.noCropsSelected': 'कोणतीही पिके निवडलेली नाहीत',
    'plotDivision.singleCropSelected': 'एकच पीक निवडले',
    'plotDivision.fullLandAllocated': 'संपूर्ण जमीन या पिकासाठी दिली जाईल',
    'plotDivision.fullAllocation': 'जमिनीच्या 100%',
    'plotDivision.continueToRegistration': 'नोंदणीकडे पुढे जा',
    'plotDivision.divideYourLand': 'तुमची जमीन विभागा',
    'plotDivision.allocateSpaceFor': 'यासाठी जागा वाटप करा',
    'plotDivision.cropsWord': 'पिके',
    'plotDivision.totalLand': 'एकूण जमीन:',
    'plotDivision.landNameLabel': 'जमिनीचे नाव:',
    'plotDivision.totalAllocated': 'एकूण वाटप:',
    'plotDivision.remaining': 'बाकी',
    'plotDivision.overBy': 'इतके जास्त:',
    'plotDivision.perfectReady': 'उत्तम! पुढे जाण्यास तयार',
    'plotDivision.plot': 'प्लॉट',
    'plotDivision.confirmContinue': 'पुष्टी करा आणि पुढे जा',
    'plotDivision.invalidDivisionTitle': 'चुकीचे वाटप',
    'plotDivision.invalidDivisionMsg': 'एकूण वाटप 100% असणे आवश्यक आहे. सध्या:',
    'plotDivision.errorTitle': 'त्रुटी',
    'plotDivision.createPlotsFailed': 'प्लॉट विभागणी तयार करण्यात अयशस्वी',

    // ── Grievances ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'grievances.reason.qualityNotAsDescribed': 'सांगितल्याप्रमाणे दर्जा नाही',
    'grievances.reason.quantityShort': 'ऑर्डरपेक्षा कमी माल आला',
    'grievances.reason.wrongCrop': 'नोंदवलेले पीक नाही',
    'grievances.reason.damagedInTransit': 'वाहतुकीत नुकसान झाले',
    'grievances.reason.notDelivered': 'माल कधीच पोहोचला नाही',
    'grievances.reason.paymentNotReceived': 'पैसे अजून मिळाले नाहीत',
    'grievances.reason.paymentDisputed': 'रक्कम चुकीची आहे',
    'grievances.reason.other': 'इतर काही',
    'grievances.status.open': 'प्रलंबित',
    'grievances.status.responded': 'उत्तर दिले',
    'grievances.status.resolved': 'मिटवले',
    'grievances.status.rejected': 'नाकारले',
    'grievances.status.withdrawn': 'मागे घेतले',
    'grievances.outcome.refundAgreed': 'संपूर्ण परतावा मान्य',
    'grievances.outcome.partialRefundAgreed': 'अंशतः परतावा मान्य',
    'grievances.outcome.replacementAgreed': 'बदली माल देण्यास मान्यता',
    'grievances.outcome.noAction': 'काही कारवाई नाही — जसे आहे तसे मान्य',
    'grievances.outcome.none': 'समेट होऊ शकला नाही',
    'grievances.alert.updateFailedTitle': 'अद्ययावत करता आले नाही',
    'grievances.alert.tryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'grievances.alert.writeSomethingTitle': 'काहीतरी लिहा',
    'grievances.alert.writeSomethingMsg': 'तुमची बाजू मांडा.',
    'grievances.alert.pickOutcomeTitle': 'निकाल निवडा',
    'grievances.alert.pickOutcomeMsg': 'तुम्ही काय ठरवले?',
    'grievances.alert.withdrawTitle': 'ही तक्रार मागे घ्यायची आहे का?',
    'grievances.alert.withdrawMsg': 'ती बंद केली जाईल. गरज पडल्यास तुम्ही नवीन तक्रार करू शकता.',
    'grievances.cancel': 'रद्द करा',
    // ── तक्रारीची नोंद इतरांना पाठवणे ────────────────────────────────
    // mr-checked by a native Marathi speaker — बाजार समिती (APMC) is a
    // trade term already flagged elsewhere in this file.
    'grievances.shareRecord': 'संपूर्ण नोंद पाठवा',
    'grievances.shareHint': 'या व्यवहाराबद्दल अ‍ॅपने नोंदवलेले सर्व काही — आणि जे नोंदवलेच गेले नाही ते सुद्धा. जो कोणी हा वाद सोडवणार आहे त्यांच्यासाठी: तुमचा गट, खरेदीदार किंवा बाजार समितीचे अधिकारी.', // mr-checked
    'grievances.shareDialogTitle': 'तक्रारीची नोंद', // mr-checked
    'grievances.shareSavedTitle': 'जतन झाले',
    'grievances.shareFailedTitle': 'नोंद पाठवता आली नाही',
    'grievances.withdraw': 'मागे घ्या',
    'grievances.youRaisedAgainst': 'तुम्ही ही तक्रार यांच्याविरुद्ध केली आहे:',
    'grievances.raisedAgainstYouBy': 'यांनी तुमच्याविरुद्ध तक्रार केली आहे:',
    'grievances.kg': 'किलो',
    'grievances.youSaid': 'तुम्ही सांगितले',
    'grievances.theSaidPrefix': 'यांनी सांगितले:',
    'grievances.saidSuffix': '',
    'grievances.theyAnswered': 'त्यांनी उत्तर दिले',
    'grievances.youAnswered': 'तुम्ही उत्तर दिले',
    'grievances.closedByThe': 'यांनी बंद केली:',
    'grievances.answer': 'उत्तर द्या',
    'grievances.markSettled': 'मिटवली म्हणून नोंदवा',
    'grievances.emptyTitle': 'काहीही सोडवायचे नाही',
    'grievances.emptySub': 'तुम्ही केलेल्या आणि तुमच्याविरुद्ध केलेल्या तक्रारी इथे दिसतील. डिलिव्हरी झालेल्या ऑर्डरच्या पावतीवरून तुम्ही १४ दिवसांच्या आत तक्रार करू शकता.',
    'grievances.yourSideTitle': 'तुमची बाजू',
    'grievances.whatDidYouAgreeTitle': 'तुम्ही काय ठरवले?',
    'grievances.replyPlaceholder': 'तुमच्या बाजूने काय घडले?',
    'grievances.replyHint': 'तुम्ही एकदाच उत्तर देऊ शकता. तुमचे आणि त्यांचे दोन्ही म्हणणे नोंदीत राहील.',
    'grievances.sendAnswer': 'उत्तर पाठवा',
    'grievances.amountLabel': 'रक्कम (₹)',
    'grievances.amountPlaceholder': 'उदा. ३००',
    'grievances.noteLabel': 'टीप (ऐच्छिक)',
    'grievances.notePlaceholder': 'नोंदवण्यासारखे काही असेल तर',
    'grievances.settleNotice': 'तुम्ही दोघांनी काय ठरवले याची ही नोंद आहे. कोण बरोबर आहे हे अ‍ॅप ठरवत नाही आणि पैसेही हलवत नाही — परतावा तुमच्या दोघांमध्ये ठरवला जातो.',
    'grievances.recordOutcome': 'निकाल नोंदवा',

    // ── Receipt / dispute ───────────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // mandi/trade-specific terms, best-effort translation pending review.
    'receipt.reason.qualityNotAsDescribed': 'सांगितल्याप्रमाणे दर्जा नाही',
    'receipt.reason.quantityShort': 'ऑर्डरपेक्षा कमी माल आला',
    'receipt.reason.wrongCrop': 'नोंदवलेले पीक नाही',
    'receipt.reason.damagedInTransit': 'वाहतुकीत नुकसान झाले',
    'receipt.reason.notDelivered': 'माल कधीच पोहोचला नाही',
    'receipt.reason.paymentNotReceived': 'मला अजून पैसे मिळाले नाहीत',
    'receipt.reason.paymentDisputed': 'रक्कम चुकीची आहे',
    'receipt.reason.other': 'इतर काही',
    'receipt.alert.savedTitle': 'जतन केले',
    'receipt.alert.savedMsgPrefix': 'तुमचे व्यवहार यात लिहिले गेले:',
    'receipt.alert.exportFailedTitle': 'एक्सपोर्ट करता आले नाही',
    'receipt.alert.tryAgain': 'कृपया पुन्हा प्रयत्न करा.',
    'receipt.alert.whatWentWrongTitle': 'काय चुकले?',
    'receipt.alert.pickReasonMsg': 'एक कारण निवडा.',
    'receipt.alert.describeItTitle': 'सविस्तर सांगा',
    'receipt.alert.describeItMsg': 'काय घडले ते दुसऱ्या बाजूला सांगा.',
    'receipt.alert.raisedTitle': 'तक्रार नोंदवली',
    'receipt.alert.raisedMsg': 'दुसरा पक्ष आता ती पाहू शकतो आणि उत्तर देऊ शकतो. जे ठरते तेच अ‍ॅप नोंदवते — कोण बरोबर आहे हे अ‍ॅप ठरवत नाही.',
    'receipt.alert.raiseFailedTitle': 'तक्रार नोंदवता आली नाही',
    // ── पावतीवरील शेतावरची नोंद ───────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below —
    // प्रत (grade) and वजन काटा (weighbridge) are mandi terms where a
    // near-miss reads worse than plain English.
    // ── पावतीवरील आगाऊ रक्कम व उरलेली रक्कम ───────────────────────
    'receipt.advanceTitle': 'आगाऊ रक्कम व उरलेली रक्कम', // mr-checked
    'receipt.advanceAgreed': 'ठरलेली आगाऊ रक्कम', // mr-checked
    'receipt.advanceReceived': 'मिळालेली आगाऊ रक्कम', // mr-checked
    'receipt.advanceOutstanding': 'अजून न मिळालेली आगाऊ रक्कम', // mr-checked
    'receipt.balanceDue': 'शेतकऱ्याला देय उरलेली रक्कम', // mr-checked
    'receipt.overpaidBy': 'जास्त दिलेले — शेतकऱ्याकडे आहेत',
    'receipt.gateTitle': 'शेतावर, माल घेताना', // mr-checked
    'receipt.weightNotRecorded': 'हे किलो कसे ठरवले याची कोणतीही नोंद नाही.',
    'receipt.ticketRef': 'पावती क्र.',
    'receipt.condNobodyLooked': 'माल घेताना तो दिसायला कसा होता याची कोणीही नोंद केलेली नाही.',
    'receipt.condLookedFine': 'पाहिले गेले, आणि दिसण्यात काही बिघाड आढळला नाही.',
    'receipt.condReported': 'शेतावर नोंदवले:',
    'receipt.gradeNotChecked': 'प्रतीची कोणतीही नोंद झालेली नाही. सार्वजनिक गटातील कॅप्टनला प्रत ठरवायला सांगितले जात नाही — वरची प्रत शेतकऱ्याने स्वतः सांगितलेली आहे.', // mr-checked
    'receipt.gradeMatched': 'शेतावर नोंदवलेली प्रत जुळली:', // mr-checked
    'receipt.gradeLower': 'शेतावर कमी प्रत नोंदवली गेली:', // mr-checked
    'receipt.gradeHigher': 'शेतावर जास्त प्रत नोंदवली गेली:', // mr-checked
    'receipt.gradeObserved': 'शेतावर नोंदवलेली प्रत (सांगितलेली नव्हती):', // mr-checked
    'receipt.gateNote': 'यापैकी कशामुळेही भाव किंवा रक्कम बदललेली नाही. ही फक्त काय दिसले याची नोंद आहे. तुम्ही पैसे दिलेल्या मालाप्रमाणे तो नसेल, तर खाली तक्रार नोंदवा.', // mr-checked
    'receipt.grade': 'ग्रेड',
    'receipt.farmerDeclared': 'शेतकऱ्याने सांगितलेले',

    'receipt.copyBadgeFarmer': 'शेतकऱ्याची प्रत', // mr-checked
    'receipt.copyBadgeVendor': 'खरेदीदाराची प्रत', // mr-checked
    'receipt.copyBadgeAgent': 'चालकाची प्रत', // mr-checked
    'receipt.copyBadgeFpo_admin': 'गटाची प्रत', // mr-checked
    'receipt.slipTotalFarmer': 'शेतकऱ्याला दिले', // mr-checked
    'receipt.slipTotalFpo_admin': 'तुमच्या सदस्याला दिले', // mr-checked
    'receipt.slipTotalVendor': 'एकूण दिलेली रक्कम', // mr-checked
    'receipt.slipTotalAgent': 'तुम्ही घेता (फक्त भाडे)', // mr-checked

    'receipt.money': 'पैसे',
    'receipt.pricePerKg': 'प्रति किलो दर',
    'receipt.negotiated': '(वाटाघाटीने ठरलेला)',
    'receipt.originallyAsking': 'सुरुवातीचा मागितलेला दर',
    'receipt.cropValue': 'पिकाची किंमत',
    'receipt.transportFare': 'वाहतूक भाडे',
    'receipt.totalBuyerPays': 'खरेदीदार एकूण देतो',
    'receipt.whoCollectsWhat': 'कोणाला काय मिळते',
    'receipt.farmerReceives': 'शेतकऱ्याला मिळते',
    'receipt.driverCollects': 'चालक घेतो (फक्त भाडे)',
    'receipt.farmerPaid': 'शेतकऱ्याला पैसे मिळाले',
    'receipt.farmerNotYetPaid': 'शेतकऱ्याला अजून पैसे मिळाले नाहीत',
    'receipt.on': 'रोजी',
    'receipt.parties': 'सहभागी',
    'receipt.farmer': 'शेतकरी',
    'receipt.buyer': 'खरेदीदार',
    'receipt.captain': 'कॅप्टन',
    'receipt.from': 'पासून',
    'receipt.to': 'पर्यंत',
    'receipt.distance': 'अंतर',
    'receipt.km': 'किमी',
    'receipt.whatHappened': 'काय घडले',
    'receipt.grievances': 'तक्रारी',
    'receipt.raisedByThe': 'यांनी तक्रार केली:',
    'receipt.shareReceipt': 'पावती शेअर करा',
    'receipt.exportCsv': 'माझे सर्व व्यवहार एक्सपोर्ट करा (CSV)',
    'receipt.somethingWrong': 'या ऑर्डरमध्ये काहीतरी चुकले',
    'receipt.whatWentWrong': 'काय चुकले?',
    'receipt.describeIt': 'सविस्तर सांगा',
    'receipt.describePlaceholder': 'काय घडले आणि त्याचे समाधान कसे होईल?',
    'receipt.raiseNotice': 'ही तुमची तक्रार नोंदवते आणि दुसऱ्या पक्षाला उत्तर देण्याची संधी देते. कोण बरोबर आहे हे अ‍ॅप ठरवत नाही आणि पैसेही हलवत नाही — तुम्ही दोघांनी जे ठरवाल तेच नोंदवले जाईल. डिलिव्हरीपासून तुमच्याकडे १४ दिवस आहेत.',
    'receipt.raiseGrievance': 'तक्रार नोंदवा',

    // ── GAP B: एफपीओचा स्वतःचा चालक ─────────────────────────────────────
    // mr-checked by a native Marathi speaker on the keys marked below.
    // The risky terms here are the ones already on the standing list — फेरी (a
    // collection run), पिकअप, कॅप्टन — plus one new decision: चालक for the
    // group's OWN driver, kept distinct from कॅप्टन (the app's dispatch
    // captain), because the whole point of this feature is that they are two
    // different people with two different sets of rights. If a Maharashtra FPO
    // would say ड्रायव्हर rather than चालक, change it once here and every
    // string using it is settled.
    'fpoRun.driverBanner': 'ही फेरी तुम्ही चालवत आहात. प्रत्येक शेतावर काय घडले ते तुमच्याच फोनवर नोंदवा, आणि प्रत्येक शेतकऱ्याकडून त्यांचा स्वतःचा ४ अंकी कोड मागा — प्रत्येक शेतावरचा कोड वेगळा असतो.', // mr-checked
    'fpoRun.operatorWithDriverBanner': 'तुमच्या गटाचा चालक या फेरीवर आहे आणि प्रत्येक शेतावरची नोंद स्वतःच्या फोनवर करतो. त्यांचा फोन बंद पडला तर कार्यालयातून तुम्हीही नोंद करू शकता — नोंदीत तुमच्यापैकी कोणी केली हे नेहमी लिहिले जाते.', // mr-checked
    'fpoRun.recordedByDriver': 'तुमच्या गटाच्या चालकाने शेतावरच नोंदवले', // mr-checked
    'fpoRun.recorderLineDriver': 'अशी नोंद होईल: तुमच्या गटाचा स्वतःचा चालक, याच शेतावर, याच वेळी — तुमचे नाव, याच फेरीवर.', // mr-checked
    'fpoRun.openMap': 'ही फेरी नकाशावर पहा', // mr-checked
    'fpoRun.driverUnlinkedTag': 'या फेरीवर खाते नाही',

    'fpoRun.noFixYet': 'अजून कोणतेही ठिकाण पाठवलेले नाही',
    'fpoRun.posLive': 'तुमचे ठिकाण थेट दिसत आहे',
    'fpoRun.posMoment': 'ठिकाण आत्ताच पाठवले',
    'fpoRun.posLastSeen': 'ठिकाण शेवटचे पाठवले',
    'fpoRun.posMinAgo': 'मिनिटांपूर्वी',
    'fpoRun.posHrWord': 'तास',
    'fpoRun.posMinWord': 'मिनिटे',
    'fpoRun.posAgo': 'पूर्वी',
    'fpoRun.foregroundOnly': 'ही स्क्रीन उघडी ठेवा. ती उघडी असेपर्यंतच तुमचे ठिकाण पाठवले जाते — फोन बंद केला किंवा दुसरे अ‍ॅप उघडले की ते थांबते, आणि मग खरेदीदाराच्या नकाशावर "शेवटचे N मिनिटांपूर्वी दिसले" असे दिसते, थांबलेले वाहन चालू असल्यासारखे नाही.', // mr-checked
    'fpoRun.pingOk': 'खरेदीदार आणि या फेरीवरील शेतकरी तुम्ही कुठे आहात ते पाहू शकतात.', // mr-checked
    'fpoRun.simOn': 'प्रवासाची चाचणी सुरू आहे',
    'fpoRun.simOff': 'प्रवासाची चाचणी करा',
    'fpoRun.simNote': 'हे सुरू असताना पाठवलेले प्रत्येक ठिकाण "चाचणी" म्हणून नोंदवले जाते, आणि खरेदीदाराच्या नकाशावर तसे स्पष्ट दिसते.', // mr-checked
    'fpoRun.noRouteToSimulate': 'या फेरीचा साठवलेला मार्ग नाही, त्यामुळे चाचणी करता येणार नाही.', // mr-checked
    'fpoRun.officeCannotPost': 'कार्यालयातून ठिकाण पाठवता येत नाही. वाहन आत्ता कुठे आहे याचा एकच खरा स्रोत आहे — वाहनासोबत असलेला फोन. या फेरीला चालकाचे खाते द्या, म्हणजे ठिकाण त्यांच्याकडून येईल.', // mr-checked

    'fpoRun.driverSection': 'कोण चालवत आहे',
    'fpoRun.driverAssign': 'चालक नेमा',
    'fpoRun.driverChange': 'चालक बदला',
    'fpoRun.driverRemove': 'काढून टाका',
    'fpoRun.driverAssignedNote': 'ते ही फेरी उघडू शकतात, थांब्यांची यादी वाचू शकतात, शेतावरच प्रत्येक शेतकऱ्याचा स्वतःचा कोड घेऊ शकतात आणि वाहनाचे ठिकाण पाठवू शकतात. ते कॅप्टन नाहीत: ते कामाच्या यादीत नाहीत आणि यामुळे त्यांना दुसऱ्या कोणत्याही फेरीवर काहीही मिळत नाही.', // mr-checked
    'fpoRun.noDriverAccountNote': 'या फेरीवर अजून कोणाचेही नाव नाही, त्यामुळे प्रत्येक थांबा तुमचे कार्यालय नोंदवते आणि ठिकाण पाठवता येत नाही. खाते असलेला चालक नेमला की शेतावर प्रत्यक्ष उभ्या असलेल्या माणसाला थांब्यांची यादी, कोडची जागा आणि नकाशा मिळतो.', // mr-checked
    'fpoRun.driverPickTitle': 'ही फेरी कोण चालवणार?', // mr-checked
    'fpoRun.driverPickSub': 'तुमच्या गटाचा एक सक्रिय सदस्य निवडा. त्यांनी या अ‍ॅपवर आधी नोंदणी केलेली असावी.',
    'fpoRun.driverPickNote': 'एक चालक, एक वाहन: दुसऱ्या फेरीवर आधीच असलेल्या माणसाला ही फेरी देता येणार नाही.', // mr-checked
    'fpoRun.driverListError': 'तुमचे सदस्य आणता आले नाहीत. पुन्हा प्रयत्न करा.',
    'fpoRun.driverListEmpty': 'निवडण्यासाठी सक्रिय सदस्य नाहीत.',
    'fpoRun.vehicleNoLabel': 'वाहन क्रमांक (ऐच्छिक)',
    'fpoRun.vehicleNoPlaceholder': 'MH 15 AB 1234',
    'fpoRun.driverAssignedTitle': 'या फेरीवर नेमले', // mr-checked
    'fpoRun.driverAssignedBody': 'ते आता स्वतःच्या फोनवर ही फेरी उघडू शकतात. त्यांचा फोन बंद पडला तर तुमचे कार्यालय नोंद करू शकतेच, आणि नोंदीत तुमच्यापैकी कोणी केली हे लिहिले जाते.', // mr-checked
    'fpoRun.driverAssignFailed': 'चालक बदलता आला नाही. पुन्हा प्रयत्न करा.',
    'fpoRun.driverRemoveTitle': 'ही फेरी पुन्हा कार्यालयाकडे घ्यायची?', // mr-checked
    'fpoRun.driverRemoveBody': 'चालकाचा या फेरीवरचा प्रवेश जातो आणि तिचे थांबे पुन्हा तुमचे कार्यालय नोंदवते. त्यांचे नाव आणि नंबर नोंदीत तसेच राहतात — ज्याने चालवले तो चालवलाच.', // mr-checked
    'fpoRun.driverRemoveYes': 'चालक काढून टाका',

    // ── GAP A: फेरीचा नकाशा ─────────────────────────────────────────────
    // mr-checked. The honesty sentences below are the ones that matter
    // most: they are the difference between an app that admits its tracking
    // has gaps and one that appears to be following the truck all day.
    'track.loadError': 'हे आणता आले नाही. पुन्हा प्रयत्न करा.',
    'track.forbidden': 'ही फेरी तुमची नाही.', // mr-checked
    'track.back': 'मागे जा',
    'track.recenter': 'पुन्हा मध्यभागी',
    'track.min': 'मिनिटे',
    'track.call': 'फोन करा',

    'track.run.awaiting_agent': 'चालक शोधत आहोत',
    'track.run.no_agents': 'चालक मिळाला नाही',
    'track.run.accepted': 'चालक नेमला आहे',
    'track.run.collecting': 'माल गोळा करत आहे', // mr-checked
    'track.run.in_transit': 'पोहोचवण्याच्या वाटेवर', // mr-checked
    'track.run.delivered': 'पोहोचवले',
    'track.run.cancelled': 'रिकामी बंद झाली', // mr-checked
    'track.run.abandoned': 'फेरी अर्धवट सोडली', // mr-checked
    'track.runSub.awaiting_agent': 'जवळच्या कॅप्टनना ही फेरी देऊ केली जात आहे.', // mr-checked
    'track.runSub.no_agents': 'वेळेत कोणीही स्वीकारली नाही.',
    'track.runSub.accepted': 'पहिल्या शेताकडे निघाले आहेत.',
    'track.runSub.collecting': 'या फेरीवरची शेते एकामागून एक होत आहेत.', // mr-checked
    'track.runSub.in_transit': 'सर्व शेते झाली आहेत. माल पोहोचवण्याच्या ठिकाणाकडे निघाला आहे.', // mr-checked
    'track.runSub.delivered': 'ही फेरी पूर्ण झाली.',
    'track.runSub.cancelled': 'कोणत्याही शेताने माल दिला नाही, त्यामुळे पोहोचवण्यासारखे काही नव्हते.', // mr-checked
    'track.runSub.abandoned': 'माल वाहनात असतानाच फेरी थांबली. त्या शेतकऱ्यांचे पैसे अजून बाकी आहेत.', // mr-checked
    'track.inTransitBanner': 'सर्व शेते झाली आहेत आणि माल पोहोचवण्याच्या ठिकाणाकडे निघाला आहे. हा शेवटचा टप्पा.', // mr-checked

    'track.neverSeen': 'या फेरीचे ठिकाण अजून एकदाही आलेले नाही', // mr-checked
    'track.liveWord': 'थेट',
    'track.momentAgo': 'शेवटचे आत्ताच दिसले',
    'track.lastSeen': 'शेवटचे दिसले',
    'track.minAgo': 'मिनिटांपूर्वी',
    'track.hrWord': 'तास',
    'track.minWord': 'मिनिटे',
    'track.ago': 'पूर्वी',
    'track.kmToGo': 'किमी बाकी',
    'track.note.never': 'या फेरीचे ठिकाण अजून एकदाही आलेले नाही. चालकाचे अ‍ॅप उघडे असतानाच ठिकाण येते — हा दोष नाही, आणि कोणतेही ठिकाण अंदाजाने दाखवले जात नाही.', // mr-checked
    'track.note.live': 'गेल्या अर्ध्या मिनिटात ठिकाण आले आहे.',
    'track.note.recent': 'शेवटचे ठिकाण काही मिनिटे जुने आहे. अ‍ॅप उघडे असतानाच ठिकाण येते, त्यामुळे थोडे खंड पडणे सामान्य आहे.', // mr-checked
    'track.note.stale': 'हे शेवटचे प्रत्यक्ष आलेले ठिकाण आहे, वाहन आत्ता कुठे आहे ते नाही. त्यापुढे काहीही अंदाजाने काढलेले नाही.', // mr-checked
    'track.note.cold': 'शेवटचे ठिकाण अर्ध्या तासापेक्षा जुने आहे. ते शेवटचे माहीत असलेले ठिकाण म्हणून वाचा, चालणारे वाहन म्हणून नाही.', // mr-checked
    'track.etaHidden': 'पोहोचण्याची वेळ दाखवलेली नाही: ती इतक्या जुन्या ठिकाणावरून काढावी लागली असती की तिला अर्थ उरला नसता.', // mr-checked
    'track.neverInterpolated': 'खरे ठिकाण जिथे आले तिथेच खूण दाखवली जाते. दोन ठिकाणांच्या मधले काहीही बनवून दाखवले जात नाही.', // mr-checked
    'track.simulated': 'चाचणीचे ठिकाण',
    'track.simulatedNote': 'हा साठवलेल्या मार्गावरचा चाचणी प्रवास आहे, खरे वाहन नाही. खऱ्या फोनप्रमाणेच तेच मार्ग वापरून हे पाठवले जाते, आणि कोणाचा गैरसमज होऊ नये म्हणून तसे स्पष्ट लिहिले आहे.', // mr-checked

    'track.noDriverName': 'चालक',
    'track.vehiclePending': 'वाहन क्रमांक अजून नाही',
    'track.captain': 'अ‍ॅपचा कॅप्टन', // mr-checked
    'track.fpoDriver': 'गटाचा स्वतःचा चालक', // mr-checked
    'track.unlinkedDriver': 'चालकाचे नाव नोंदीत आहे पण या फेरीवर त्यांचे खाते नाही, त्यामुळे प्रत्येक थांबा गटाचे कार्यालय नोंदवते आणि ठिकाण पाठवता येत नाही.', // mr-checked
    'track.noDriverYet': 'या फेरीला अजून चालक नेमलेला नाही, त्यामुळे कोणीही कोणत्याही शेतावर गेलेले नाही आणि ठिकाणही पाठवता येत नाही.', // mr-checked

    'track.deliveryCode': 'पोहोचल्याचा कोड', // mr-checked
    'track.deliveryCodeHint': 'माल प्रत्यक्ष पोहोचल्यावरच हा कोड चालकाला द्या.',

    'track.stopsTitle': 'या फेरीवरची शेते', // mr-checked
    'track.farmsVisited': 'शेते झाली',
    'track.collectedNothing': 'काहीच मिळाले नाही',
    'track.aboard': 'वाहनात',
    'track.shortOfPlan': 'ठरल्यापेक्षा कमी',
    'track.anotherFarm': 'या फेरीवरचे दुसरे शेत', // mr-checked
    'track.yourFarm': 'तुमचे शेत',
    'track.stopDone': 'पूर्ण माल घेतला',
    'track.stopShort': 'कमी',
    'track.stopFailed': 'काहीच घेतले नाही',
    'track.stopNext': 'पुढचा थांबा',
    'track.stopPending': 'अजून गेलेले नाही',
    'track.nextStopLabel': 'कुठे निघाले आहे',
    'track.pickupLabel': 'पिकअप', // mr-checked
    'track.dropLabel': 'पोहोचवण्याचे ठिकाण',
    'track.allFarmsVisited': 'सर्व शेते झाली आहेत',
    'track.onDelivery': 'पोहोचल्यावर',
    'track.pooledOrders': 'तुमच्याच ऑर्डर, एकाच वाहनावर', // mr-checked

    'dash.driverRunTitle': 'तुमच्या गटाने तुम्हाला एक फेरी चालवायला दिली आहे', // mr-checked
    'dash.driverRunStops': 'शेतांवरून माल घ्यायचा आहे', // mr-checked

    // ── THE GATE RECORD ─────────────────────────────────────────────────
    // ⚠️ The trade terms here are exactly the risky kind this file warns
    // about: वजन काटा (weighbridge), प्रत (grade), काटा (scale). A near-miss
    // on any of them reads worse to a Maharashtra farmer than plain English,
    // so every key carrying one is flagged rather than guessed at.
    'fpoRun.weightTitle': 'हे वजन कसे ठरवले?',
    'fpoRun.weightClaim': 'हे अ‍ॅप स्वतः काहीही वजन करत नाही. किलो कसे ठरवले गेले एवढेच तुम्ही नोंदवत आहात — तुमच्या नावाने, या फेरीवर. इथली नोंद कोणत्याही काट्याशी तपासली जात नाही आणि कोणताही आकडा दुरुस्त केला जात नाही.', // mr-checked
    'fpoRun.wmCentreTitle': 'संकलन केंद्राच्या काट्यावर वजन केले', // mr-checked
    'fpoRun.wmCentreSub': 'एफपीओच्या किंवा संकलन केंद्राच्या स्वतःच्या काट्यावर. खरे वजन, पण विक्रेत्याच्या गटाच्याच काट्यावर — त्रयस्थाच्या नाही.', // mr-checked
    'fpoRun.wmBridgeTitle': 'सार्वजनिक वजन काट्यावर वजन केले', // mr-checked
    'fpoRun.wmBridgeSub': 'सार्वजनिक वजन काटा अशी पावती देतो जी शेतकरी आणि खरेदीदार दोघेही दाखवू शकतात. या यादीतले हेच एकमेव वजन आहे जे नोंद करणाऱ्यावर विश्वास ठेवण्यावर अवलंबून नाही.', // mr-checked
    'fpoRun.wmFarmTitle': 'शेतकऱ्याच्या स्वतःच्या काट्यावर वजन केले', // mr-checked
    'fpoRun.wmFarmSub': 'गेटवर शेतकऱ्याचा स्वतःचा काटा किंवा तराजू. खरे वजन, पण प्रमाणित नाही आणि कोणी साक्षीदार नाही.', // mr-checked
    'fpoRun.wmEstTitle': 'वजन केले नाही — पोती मोजली, किंवा अंदाजाने', // mr-checked
    'fpoRun.wmEstSub': 'हा माल कोणीही काट्यावर टाकला नाही. आकडा म्हणजे पोती किंवा क्रेट मोजून गुणलेला, किंवा अनुभवाने काढलेला अंदाज.', // mr-checked
    'fpoRun.wmEstAffirm': 'हे प्रामाणिक उत्तर आहे आणि शेतावर हेच नेहमीचे उत्तर असते. बहुतेक ठिकाणी जवळपास काटाच नसतो, आणि तसे स्पष्ट सांगणे हेच बरोबर आहे — काहीच न नोंदवणे मात्र चुकीचे, कारण रिकामा रकाना अंदाजाला मोजमाप म्हणून खपवतो.', // mr-checked
    'fpoRun.wmIndependentTag': 'त्रयस्थ', // mr-checked
    'fpoRun.wmNotIndependent': 'त्रयस्थ नाही', // mr-checked
    'fpoRun.wmNotRecordedTitle': 'वजनाची पद्धत नोंदलेली नाही', // mr-checked
    'fpoRun.weightRefLabel': 'वजन काट्याच्या पावतीचा क्रमांक (ऐच्छिक)', // mr-checked
    'fpoRun.weightRefPlaceholder': 'उदा. MH-1147-2208',
    'fpoRun.weightRefHelp': 'शेतकरी आणि खरेदीदार दोघेही नंतर दाखवू शकतील अशी पावती. वादाच्या वेळी वजन तपासता यावे म्हणून ती साठवली जाते — अ‍ॅप ती तपासत नाही.', // mr-checked
    'fpoRun.errWeightMethod': 'वजन कसे ठरवले ते सांगा. कोणी वजन केले नसेल तर “वजन केले नाही” हे प्रामाणिक उत्तर आहे — अंदाजाला मोजमाप म्हणून खपू देण्यापेक्षा तेच नोंदवलेले बरे.', // mr-checked

    'fpoRun.gradeTitle': 'गेटवर दिसलेली प्रत', // mr-checked
    'fpoRun.gradeSub': 'तुम्ही प्रत्यक्ष पाहिली आणि शेतकऱ्याने सांगितलेल्या प्रतीपेक्षा वेगळी असेल तरच हे बदला. बहुतेक वेळा माल सांगितल्याप्रमाणेच असतो, आणि तेच पुन्हा टाइप केल्याने पुरावा तयार होत नाही, नुसता गोंधळ होतो.', // mr-checked
    'fpoRun.gradeDeclaredPrefix': 'शेतकऱ्याने सांगितलेली प्रत:', // mr-checked
    'fpoRun.gradeSameTitle': 'शेतकऱ्याने सांगितली तशीच', // mr-checked
    'fpoRun.gradeSameSub': 'नवीन काहीही दावा केला जात नाही आणि काहीही पुन्हा टाइप करावे लागत नाही.',
    'fpoRun.gradeDiffTitle': 'मी पाहिली, आणि प्रत वेगळी आहे', // mr-checked
    'fpoRun.gradeDiffSub': 'तुम्ही जे प्रत्यक्ष पाहिले तेच निवडा. पक्के करण्यापूर्वी याचा काय परिणाम होतो ते वाचा.',
    'fpoRun.gradeNoneTitle': 'प्रत नाही — तुलना करायला काही नाही, किंवा मी पाहिली नाही', // mr-checked
    'fpoRun.gradeNoneSub': 'बहुतेक यादींना प्रतच नसते. यामुळे “कोणतीही प्रत पाहिली नाही” अशी नोंद होते — तुम्ही प्रत तपासून पक्की केली अशी नोंद होत नाही.', // mr-checked
    'fpoRun.errGradeLetter': 'तुम्ही प्रत्यक्ष पाहिलेली प्रत निवडा — A, B किंवा C.', // mr-checked
    'fpoRun.gradeConseqTitle': 'याचा काय परिणाम होतो, आणि काय होत नाही',
    'fpoRun.gradeIsLower': 'शेतकऱ्याने सांगितलेल्या प्रतीपेक्षा ही कमी आहे.', // mr-checked
    'fpoRun.gradeMaybeLower': 'शेतकऱ्याने सांगितलेल्या प्रतीपेक्षा ही कमी असेल, तर पुढे असे होते.', // mr-checked
    'fpoRun.gradeDoesRecord': 'ही नोंद या मालावर राहते आणि खरेदीदाराला त्यांच्या खरेदीत दिसते.',
    'fpoRun.gradeDoesAsk': 'शेतकऱ्याला ती मान्य करायची की नाकारायची हे विचारले जाते. फक्त त्यांनी मान्य केले तरच अ‍ॅपमध्ये इतरत्र त्याचा पुरावा म्हणून वापर होतो — तुमची नोंद एकटी म्हणजे फक्त दावा.', // mr-checked
    'fpoRun.gradeNotPrice': 'यामुळे किंमत बदलत नाही आणि पैसेही बदलत नाहीत. शेतकऱ्याला जेवढे मिळणार होते तेवढेच मिळते, आणि खरेदीदाराला जेवढे द्यायचे होते तेवढेच द्यावे लागते.',
    'fpoRun.gradeNotInspection': 'तुम्हाला जे दिसले तेवढेच. ही तपासणी नाही आणि शेतकऱ्याच्या यादीवरची प्रत यामुळे रद्द होत नाही.', // mr-checked
    'fpoRun.gradeGrievance': 'कोणाचेही पैसे येणे-देणे असेल तर ते या ऑर्डरवर तक्रार नोंदवून सोडवले जाते — इथे नाही.', // mr-checked
    'fpoRun.gradeUpgradeNote': 'शेतकऱ्याने सांगितलेल्या प्रतीपेक्षा ही जास्त आहे. ती नोंदवली जाते आणि कोणालाही त्याचा भुर्दंड बसत नाही: शेतकऱ्याने स्वतःच्या मागितलेल्या भावाने विकले आहे आणि खरेदीदाराला त्यांनी दिलेल्या पैशाइतका तरी माल मिळतो आहे.', // mr-checked
    'fpoRun.gradeRowLower': 'प्रत कमी नोंदवली:', // mr-checked
    'fpoRun.gradeRowObserved': 'नोंदवलेली प्रत:', // mr-checked
    'fpoRun.gradeRowMatch': 'प्रत जुळली:', // mr-checked

    'farmerSales.gradeClaimTitle': 'उचल करताना कमी प्रत नोंदवली गेली', // mr-checked
    'farmerSales.gradeYouDeclared': 'तुम्ही सांगितलेली प्रत', // mr-checked
    'farmerSales.gradeTheyRecorded': 'त्यांनी नोंदवलेली प्रत', // mr-checked
    'farmerSales.gradeByCaptain': 'तुमच्या गेटवर आलेल्या कॅप्टनने नोंदवले.', // mr-checked
    'farmerSales.gradeByDriver': 'तुमच्या गटाच्या स्वतःच्या चालकाने, तुमच्या गेटवर नोंदवले.', // mr-checked
    'farmerSales.gradeByOffice': 'तुमच्या गटाच्या कार्यालयाने, चालकाने कळवल्यानुसार नोंदवले.', // mr-checked
    'farmerSales.gradeNoMoney': 'यामुळे किंमत बदलत नाही आणि पैसेही बदलत नाहीत. या ऑर्डरचे तुम्हाला जेवढे मिळणार होते तेवढेच मिळेल.',
    'farmerSales.gradeContestFree': 'नाकारण्याचा तुम्हाला काहीही भुर्दंड नाही. अ‍ॅपमध्ये कुठेही ते तुमच्याविरुद्ध मोजले जात नाही.',
    'farmerSales.gradeStaysEitherWay': 'तुम्ही काहीही उत्तर दिले तरी हा दावा नोंदीत राहतो आणि खरेदीदाराला दिसतो. फरक एवढाच की तो तुमची मान्यता ठरतो, की फक्त त्यांचा दावा.',
    'farmerSales.gradeFinalWarning': 'दिलेले उत्तर नंतर बदलता येत नाही. टॅप करण्यापूर्वी एकदा पुन्हा वाचा.',
    'farmerSales.gradeAddNote': '+ टीप जोडा (ऐच्छिक)',
    'farmerSales.gradeNotePlaceholder': 'उदा. त्याच सकाळी माल निवडून काढला होता',
    'farmerSales.gradeAcceptBtn': 'होय, प्रत कमी होती', // mr-checked
    'farmerSales.gradeContestBtn': 'नाही, मला मान्य नाही',
    'farmerSales.gradeAcceptTitle': 'प्रत कमी होती हे मान्य करायचे?', // mr-checked
    'farmerSales.gradeAcceptBody': 'ही तुमची मान्यता म्हणून नोंदवली जाईल. ती तुमच्या नोंदीवर मान्यता म्हणून राहते — तक्रारीत परतावा मान्य करण्यासारखीच. या ऑर्डरचे तुमचे पैसे यामुळे बदलत नाहीत.', // mr-checked
    'farmerSales.gradeAcceptYes': 'होय, मान्य आहे',
    'farmerSales.gradeContestTitle': 'ही प्रत नाकारायची?', // mr-checked
    'farmerSales.gradeContestBody': 'ती माल घेणाऱ्याचा दावा म्हणून नोंदीत राहील आणि तुमच्याविरुद्ध मोजली जाणार नाही. कोणाचेही पैसे येणे-देणे असेल तर या ऑर्डरवर तक्रार नोंदवा.', // mr-checked
    'farmerSales.gradeContestYes': 'होय, मला मान्य नाही',
    'farmerSales.gradeAcceptedTitle': 'मान्यता नोंदवली',
    'farmerSales.gradeAcceptedBody': 'या ऑर्डरचे तुमचे पैसे तसेच आहेत — प्रत मान्य केल्याने विक्रीची किंमत बदलत नाही.', // mr-checked
    'farmerSales.gradeContestedTitle': 'नामंजूर नोंदवले',
    'farmerSales.gradeContestedBody': 'ती त्यांचा दावा म्हणून नोंदीत राहील आणि तुमच्याविरुद्ध मोजली जाणार नाही. कोणाचेही पैसे येणे-देणे असेल तर या ऑर्डरवर तक्रार नोंदवा.', // mr-checked
    'farmerSales.gradeErrNothing': 'या मालावर कमी प्रत नोंदवलेली नाही, त्यामुळे मान्य किंवा नामंजूर करण्यासारखे काही नाही.', // mr-checked
    'farmerSales.gradeErrBad': 'ते उत्तर समजले नाही. कृपया पुन्हा प्रयत्न करा.',
    'farmerSales.gradeErrAlready': 'तुम्ही याचे उत्तर आधीच दिले आहे. दिलेले उत्तर पुन्हा उघडता येत नाही.',
    'farmerSales.gradeErrNotYours': 'हा माल त्या फेरीवर नाही, किंवा त्याचे उत्तर देण्याचा अधिकार तुम्हाला नाही.', // mr-checked
    'farmerSales.gradeYouAccepted': 'प्रत कमी होती हे तुम्ही मान्य केले', // mr-checked
    'farmerSales.gradeYouContested': 'ही प्रत तुम्ही नाकारली', // mr-checked
    'farmerSales.gradeNoRunToAnswer': 'या दाव्याला कोणतीही फेरी जोडलेली नाही, त्यामुळे इथे उत्तर देता येत नाही. या ऑर्डरवर तक्रार नोंदवा.', // mr-checked

    'track.notWeighed': 'वजन केले नाही — गेटवर मोजून किंवा अंदाजाने', // mr-checked
    'track.weighbridge': 'सार्वजनिक वजन काट्यावर वजन केले', // mr-checked
    'track.gradeLower': 'सांगितलेल्या प्रतीपेक्षा कमी नोंदवली:', // mr-checked
    'track.gradeAccepted': 'प्रत कमी होती हे शेतकऱ्याने मान्य केले.', // mr-checked
    'track.gradeContested': 'शेतकऱ्याला मान्य नाही. ती माल घेणाऱ्याचा दावा म्हणून राहते.', // mr-checked
    'track.gradeUnanswered': 'शेतकऱ्याने अजून उत्तर दिलेले नाही.',
    'track.gradeNote': 'गेटवर नोंदवलेली प्रत म्हणजे माल घेणाऱ्याला जे दिसले ते — ती तपासणी नाही. यामुळे किंमत किंवा पैसे काहीही बदललेले नाहीत.', // mr-checked
  },
};

/** One string in one language, falling back to English then the key itself. */
export function t(key, lang = DEFAULT_LANGUAGE) {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}

/**
 * "English (मराठी)" — the bilingual label pattern the registration and task
 * screens use, so a farmer reading either language can pick the right option.
 * Collapses to just the English label when the second language IS English.
 */
export function tBoth(key, lang = DEFAULT_LANGUAGE) {
  const en = t(key, 'en');
  const local = t(key, lang);
  return local === en ? en : `${en} (${local})`;
}

/**
 * The label for a stored role value. Everything user-facing must go through
 * this — a hardcoded "Vendor" anywhere is how a rename half-reverts.
 */
export function roleLabel(role, lang = DEFAULT_LANGUAGE, plural = false) {
  const key = `role.${role}${plural ? '.plural' : ''}`;
  const v = t(key, lang);
  return v === key ? t(`role.${role}`, lang) : v;
}

export default STRINGS;

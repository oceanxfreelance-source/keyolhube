// Template generator: original professional layouts × topics × photos × palettes × font pairings.
// Every template is an ordinary editable design (photos, text, shapes), built on CC0 stock photos.
import { newDoc, solid } from "../doc/factory";
import type { DesignDoc, DesignNode, Fill, FontRef } from "../doc/types";
import { PRESETS } from "../presets";
import type { Template } from "./builtin";
import { box, lin, photo, T } from "./pro";
import { CHARS, WIDTHS } from "./metrics";
import { STOCK } from "./stock";

// ---------------- text measurement (real font metrics) ----------------
const tables = new Map<string, Map<string, number>>();
function table(font: string, weight: number) {
  const key = `${font}|${weight}`;
  let t = tables.get(key);
  if (!t) {
    const keys = Object.keys(WIDTHS).filter((k) => k.startsWith(font + "|"));
    const best = keys.sort((a, b) => Math.abs(+a.split("|")[1] - weight) - Math.abs(+b.split("|")[1] - weight))[0] ?? "Inter|400";
    const ws = WIDTHS[best].split(",").map(Number);
    t = new Map([...CHARS].map((c, i) => [c, ws[i]]));
    tables.set(key, t);
  }
  return t;
}
/** Width of one line of text in pixels. */
function textW(font: string, weight: number, text: string, size: number, ls = 0) {
  const t = table(font, weight); let w = 0;
  for (const ch of text) w += t.get(ch) ?? t.get("M")!;
  return (w * size) / 100 + ls * text.length;
}
/** Number of lines after word wrapping. */
function wrapLines(font: string, weight: number, text: string, size: number, width: number) {
  let n = 0;
  for (const para of text.split("\n")) {
    let line = ""; n++;
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && textW(font, weight, next, size) > width) { n++; line = word; } else line = next;
    }
  }
  return n;
}

// ---------------- font pairings ----------------
type Style = { head: string; headW: number; body: string; k: number; upper?: boolean; lh: number; italic?: boolean };
const STYLES = {
  modern: { head: "Montserrat", headW: 800, body: "Inter", k: 0.66, lh: 1.05 },
  editorial: { head: "Playfair Display", headW: 700, body: "Inter", k: 0.54, lh: 1.05 },
  condensed: { head: "Bebas Neue", headW: 400, body: "Inter", k: 0.42, upper: true, lh: 0.95 },
  elegant: { head: "Cormorant Garamond", headW: 600, body: "Montserrat", k: 0.47, lh: 1.0 },
  bold: { head: "Archivo Black", headW: 400, body: "DM Sans", k: 0.7, lh: 1.02 },
  serif: { head: "DM Serif Display", headW: 400, body: "DM Sans", k: 0.52, lh: 1.05 },
  grotesk: { head: "Space Grotesk", headW: 700, body: "Space Grotesk", k: 0.6, lh: 1.02 },
  anton: { head: "Anton", headW: 400, body: "Roboto", k: 0.48, upper: true, lh: 1.0 },
  fraunces: { head: "Fraunces", headW: 700, body: "Outfit", k: 0.58, lh: 1.02 },
  syne: { head: "Syne", headW: 800, body: "Manrope", k: 0.72, lh: 1.02 },
  poppins: { head: "Poppins", headW: 700, body: "Poppins", k: 0.64, lh: 1.08 },
  oswald: { head: "Oswald", headW: 700, body: "Roboto", k: 0.5, upper: true, lh: 1.0 },
} satisfies Record<string, Style>;
type StyleKey = keyof typeof STYLES;

const GOOGLE: Record<string, number[]> = {
  "Cormorant Garamond": [400, 600], "Archivo Black": [400], "DM Serif Display": [400], "DM Sans": [400, 500, 700],
  "Space Grotesk": [400, 500, 700], Anton: [400], Fraunces: [400, 700], Outfit: [400, 500, 600], Syne: [700, 800], Manrope: [400, 500, 700],
};

// ---------------- palettes ----------------
type Palette = { dark: string; light: string; accent: string; ink: string; soft: string };
const P = (dark: string, light: string, accent: string, ink: string, soft: string): Palette => ({ dark, light, accent, ink, soft });
const PAL = {
  navy: P("#0b1726", "#f5f1ea", "#f4b740", "#0b1726", "#c9d4e3"),
  ocean: P("#06283d", "#eef7f9", "#2dd4bf", "#06283d", "#b6dbe6"),
  coral: P("#1f1414", "#fff4ee", "#ff6b4a", "#ffffff", "#f3c9bd"),
  forest: P("#10231b", "#f1f5ee", "#9bd16a", "#10231b", "#c6d8c0"),
  wine: P("#2a0f1a", "#fbf2f0", "#e9b872", "#2a0f1a", "#e3c3c6"),
  mono: P("#111111", "#f6f6f4", "#111111", "#ffffff", "#c8c8c8"),
  violet: P("#1a1033", "#f5f2ff", "#a78bfa", "#1a1033", "#cfc5f2"),
  sunset: P("#2b1220", "#fff6ed", "#ff8a3d", "#2b1220", "#f6cfb4"),
  blush: P("#3b2a2f", "#fbf1ef", "#d98c8c", "#ffffff", "#ead2cf"),
  lime: P("#0f1a0a", "#f8fbef", "#c6f432", "#0f1a0a", "#d5e3b8"),
  royal: P("#0a1a4a", "#f2f5ff", "#3b82f6", "#ffffff", "#c3cff0"),
  gold: P("#1b1712", "#faf6ee", "#c9a45c", "#1b1712", "#e2d6bd"),
  red: P("#170b0b", "#fff5f3", "#ef3b2d", "#ffffff", "#f0c6c0"),
  teal: P("#062a2a", "#effaf8", "#14b8a6", "#ffffff", "#bfe3dd"),
  sand: P("#2c2418", "#f7f0e4", "#d97941", "#ffffff", "#e6d6bd"),
  pink: P("#2a0b22", "#fff0f8", "#ff4fa3", "#ffffff", "#f5c3dd"),
} satisfies Record<string, Palette>;
type PalKey = keyof typeof PAL;

// ---------------- topics ----------------
type Copy = { kicker: string; head: string; sub: string; cta: string; info: string; badge?: string };
type Topic = { id: string; name: string; category: string; tags: string[]; photos: string[]; pals: PalKey[]; styles: StyleKey[]; copy: Copy[] };
const C = (kicker: string, head: string, sub: string, cta: string, info: string, badge?: string): Copy => ({ kicker, head, sub, cta, info, badge });

const TOPICS: Topic[] = [
  { id: "resort", name: "Resort", category: "Travel", tags: ["resort", "hotel", "maldives", "holiday", "beach"], photos: ["maldives-overwater", "island-resort", "resort-loungers", "palm-beach-path"], pals: ["ocean", "navy", "teal"], styles: ["editorial", "elegant", "serif"],
    copy: [C("MALDIVES · ALL INCLUSIVE", "Your island\nescape", "Overwater villas, private beach and sunset cruises.", "Book now", "From $1,290 per person", "-30%"), C("SUMMER COLLECTION", "Stay longer,\npay less", "Seven nights for the price of five, breakfast included.", "Reserve", "Offer ends 31 August", "7=5")] },
  { id: "travel-agency", name: "Travel agency", category: "Travel", tags: ["travel", "tour", "trip", "agency", "adventure"], photos: ["plane-wing", "wing-sunset", "airplane", "tropical-island", "aerial-lagoon"], pals: ["royal", "sunset", "ocean"], styles: ["bold", "modern", "anton"],
    copy: [C("TRAVEL DEALS", "Explore the\nworld", "Flights, hotels and tours in one simple package.", "Plan your trip", "www.yourtravel.com", "SALE"), C("LIMITED SEATS", "Fly away\nthis summer", "Return flights from $399 with free checked bag.", "Book today", "Call +960 300 0000", "$399")] },
  { id: "diving", name: "Dive centre", category: "Travel", tags: ["diving", "scuba", "snorkel", "ocean", "reef", "maldives"], photos: ["diver-blue", "diver-reef", "freediver", "clownfish", "reef-shallow"], pals: ["ocean", "teal", "royal"], styles: ["condensed", "grotesk", "anton"],
    copy: [C("PADI DIVE CENTRE", "Dive into\nthe blue", "Reef dives, night dives and courses for every level.", "Book a dive", "Daily trips · 8:00 and 14:00", "NEW"), C("OPEN WATER COURSE", "Learn to\ndive", "Three days, certified instructors, all gear included.", "Sign up", "Small groups of four", "$450")] },
  { id: "excursion", name: "Excursion", category: "Travel", tags: ["excursion", "tour", "snorkeling", "boat", "dolphin", "sunset"], photos: ["dolphin-jump", "sea-sunset", "dhoni-boat", "kayak-sunset", "blue-sail"], pals: ["sunset", "ocean", "navy"], styles: ["fraunces", "modern", "editorial"],
    copy: [C("SUNSET CRUISE", "Dolphins at\nsunset", "Two hours on a traditional dhoni with drinks on board.", "Join the trip", "Departs 17:00 daily", "$65"), C("HALF-DAY TRIP", "Sandbank\npicnic", "Snorkelling, lunch on the sand and a boat ride home.", "Book now", "Pick-up from your hotel", "$90")] },
  { id: "adventure", name: "Adventure", category: "Travel", tags: ["hiking", "mountain", "camping", "outdoor", "nature"], photos: ["tent-view", "camp-mountain", "alpenglow", "hike-dog", "forest-trail", "emerald-falls"], pals: ["forest", "sand", "mono"], styles: ["anton", "grotesk", "condensed"],
    copy: [C("WEEKEND TRIP", "Into the\nwild", "Guided hikes, mountain camps and starry nights.", "Join us", "Every Saturday · 6:00", "NEW"), C("OUTDOOR CLUB", "Find your\ntrail", "Routes for beginners and experienced hikers.", "Sign up", "Free first walk", "FREE")] },
  { id: "restaurant", name: "Restaurant", category: "Food", tags: ["restaurant", "dinner", "menu", "food", "chef"], photos: ["fine-dining", "steak-plate", "gourmet-plate", "chef-plating", "restaurant-dinner"], pals: ["wine", "gold", "mono"], styles: ["editorial", "elegant", "serif"],
    copy: [C("CHEF'S TABLE", "A taste of\nsomething new", "Seasonal tasting menu, seven courses, paired wines optional.", "Reserve a table", "Thursday to Sunday · from 19:00", "NEW"), C("DINNER FOR TWO", "Date night\nmenu", "Three courses and a dessert to share.", "Book now", "MVR 650 for two", "2 FOR 1")] },
  { id: "pizza", name: "Pizza", category: "Food", tags: ["pizza", "italian", "fast food", "delivery", "restaurant"], photos: ["pizza-whole", "pizza-slice"], pals: ["red", "sand", "mono"], styles: ["anton", "bold", "condensed"],
    copy: [C("WOOD-FIRED", "Pizza\nnight", "Hand-stretched dough, San Marzano tomatoes, fresh basil.", "Order now", "Free delivery over MVR 200", "-20%"), C("FAMILY DEAL", "Two large\npizzas", "Plus garlic bread and a bottle of soda.", "Order online", "Every Friday and Saturday", "MVR 249")] },
  { id: "sushi", name: "Sushi", category: "Food", tags: ["sushi", "japanese", "asian", "restaurant", "seafood"], photos: ["sushi-platter", "sushi-set"], pals: ["mono", "red", "navy"], styles: ["grotesk", "editorial", "condensed"],
    copy: [C("FRESH DAILY", "Sushi\nplatters", "Nigiri, maki and sashimi made to order.", "Order now", "Lunch set from MVR 180", "NEW"), C("ALL YOU CAN EAT", "Sushi\nsunday", "Unlimited rolls and miso soup, every Sunday.", "Book a table", "12:00 to 16:00", "MVR 299")] },
  { id: "cafe", name: "Café", category: "Food", tags: ["coffee", "cafe", "breakfast", "drinks", "bakery"], photos: ["coffee-cup-beans", "coffee-beans", "beans-light", "brunch-table", "laptop-coffee"], pals: ["sand", "gold", "forest"], styles: ["fraunces", "serif", "poppins"],
    copy: [C("FRESHLY ROASTED", "Good coffee,\ngood mood", "Single origin beans roasted in small batches.", "Visit us", "Open daily 7:00 to 22:00", "NEW"), C("MORNING DEAL", "Coffee and\na pastry", "Any coffee plus a croissant before 10 am.", "Come by", "Only MVR 55", "MVR 55")] },
  { id: "juice", name: "Juice bar", category: "Food", tags: ["smoothie", "juice", "healthy", "drinks", "vegan"], photos: ["green-smoothie", "smoothie-glass", "berry-smoothie", "mangoes"], pals: ["lime", "coral", "forest"], styles: ["poppins", "syne", "modern"],
    copy: [C("100% NATURAL", "Fresh\nsmoothies", "Cold-pressed fruit and greens, no added sugar.", "Order now", "Buy 2, get 1 free", "2+1"), C("SUMMER MENU", "Drink your\ngreens", "Kale, apple, ginger and lime. Feel the difference.", "Try it", "New flavours every week", "NEW")] },
  { id: "bar", name: "Cocktail bar", category: "Food", tags: ["cocktail", "bar", "drinks", "nightlife", "happy hour"], photos: ["cocktail-bar", "red-cocktail", "orange-cocktail", "iced-tea"], pals: ["violet", "pink", "wine"], styles: ["anton", "editorial", "syne"],
    copy: [C("HAPPY HOUR", "Mocktail\nnight", "Signature mocktails at half price from 6 to 8 pm.", "See menu", "Every Thursday", "-50%"), C("NEW MENU", "Shake it\nup", "Twelve new signature drinks by our mixologists.", "Visit us", "Rooftop lounge · from 18:00", "NEW")] },
  { id: "bakery", name: "Bakery", category: "Food", tags: ["bakery", "cake", "dessert", "sweets", "pastry"], photos: ["chocolate-cake", "cupcakes", "brownies", "birthday-candles"], pals: ["blush", "sand", "pink"], styles: ["fraunces", "serif", "elegant"],
    copy: [C("HOMEMADE", "Sweet\nmoments", "Cakes, cupcakes and brownies baked fresh every morning.", "Order a cake", "Custom cakes in 48 hours", "NEW"), C("WEEKEND TREAT", "Cupcake\nbox of six", "Mix and match your favourite flavours.", "Order now", "MVR 120 per box", "MVR 120")] },
  { id: "healthy", name: "Healthy food", category: "Food", tags: ["healthy", "salad", "vegan", "organic", "vegetables"], photos: ["salad-bowl", "salad-mix", "vegetables", "market-veg"], pals: ["forest", "lime", "sand"], styles: ["poppins", "fraunces", "grotesk"],
    copy: [C("FARM TO TABLE", "Eat fresh,\nfeel good", "Organic bowls packed with seasonal vegetables.", "Order now", "Delivery in 30 minutes", "NEW"), C("MEAL PLANS", "Healthy\nweek", "Five days of balanced meals, delivered.", "Subscribe", "From MVR 450 per week", "-15%")] },
  { id: "fashion", name: "Fashion", category: "Business", tags: ["fashion", "clothing", "store", "style", "sale"], photos: ["fashion-store", "sunglasses-girl", "beach-girl", "rattan-bags", "sneakers-field"], pals: ["mono", "blush", "sand"], styles: ["elegant", "condensed", "syne"],
    copy: [C("NEW SEASON", "The summer\nedit", "Linen, light colours and easy shapes for warm days.", "Shop now", "Online and in store", "NEW"), C("END OF SEASON", "Up to 50%\noff", "Selected styles for women and men.", "Shop the sale", "This weekend only", "-50%")] },
  { id: "beauty", name: "Beauty", category: "Business", tags: ["beauty", "makeup", "cosmetics", "salon", "skincare"], photos: ["makeup-eye", "lipstick", "eyeshadow", "makeup-brushes"], pals: ["blush", "pink", "gold"], styles: ["elegant", "serif", "fraunces"],
    copy: [C("BEAUTY STUDIO", "Glow\nup", "Bridal, party and everyday make-up by our artists.", "Book now", "Call +960 777 0000", "NEW"), C("NEW ARRIVAL", "Colour\nyour day", "Twelve new shades, long lasting and cruelty free.", "Shop now", "Free gift over MVR 500", "-20%")] },
  { id: "spa", name: "Spa", category: "Business", tags: ["spa", "massage", "wellness", "relax", "salon"], photos: ["spa-facial", "candle", "leaves-dew", "hosta-leaves"], pals: ["sand", "forest", "gold"], styles: ["elegant", "editorial", "serif"],
    copy: [C("WELLNESS RETREAT", "Relax and\nrecharge", "Massages, facials and body treatments.", "Book a treatment", "Open daily 10:00 to 21:00", "-25%"), C("COUPLES PACKAGE", "Time for\nyou two", "Ninety minutes side by side with herbal tea.", "Reserve", "MVR 1,200 per couple", "NEW")] },
  { id: "fitness", name: "Fitness", category: "Sports", tags: ["gym", "fitness", "workout", "training", "health"], photos: ["gym-back", "yoga-studio", "yoga-silhouette"], pals: ["mono", "lime", "red"], styles: ["anton", "condensed", "bold"],
    copy: [C("JOIN THE CLUB", "Stronger\nevery day", "Personal training, classes and open gym.", "Start today", "First week free", "FREE"), C("NEW CLASSES", "Yoga at\nsunrise", "Morning flow for all levels, mats provided.", "Book a class", "Mon, Wed, Fri · 6:30", "NEW")] },
  { id: "sports", name: "Sports", category: "Sports", tags: ["sports", "tournament", "match", "football", "tennis", "surf"], photos: ["football-stadium", "surfer-wave", "tennis-balls", "city-cycling", "surfboards"], pals: ["royal", "lime", "red"], styles: ["anton", "bold", "condensed"],
    copy: [C("TOURNAMENT", "Game\non", "Teams from across the islands compete for the cup.", "Register", "Registration closes 15 May", "VS"), C("SURF SCHOOL", "Catch the\nwave", "Lessons for beginners, boards and rash guards included.", "Book a lesson", "Daily at high tide", "NEW")] },
  { id: "realestate", name: "Real estate", category: "Business", tags: ["real estate", "property", "home", "rent", "apartment"], photos: ["modern-kitchen", "white-kitchen", "hotel-room", "resort-pool", "resort-loungers"], pals: ["navy", "gold", "teal"], styles: ["modern", "serif", "grotesk"],
    copy: [C("JUST LISTED", "Your new\nhome", "Three bedrooms, open kitchen and sea view balcony.", "Book a viewing", "Hulhumalé Phase 2", "NEW"), C("FOR RENT", "Modern\nliving", "Fully furnished apartment close to the beach.", "Contact us", "MVR 18,000 per month", "RENT")] },
  { id: "corporate", name: "Business", category: "Business", tags: ["business", "corporate", "company", "marketing", "office"], photos: ["laptop-wood", "laptop-dark", "desk-phone", "office-desk", "city-skyline", "white-arch"], pals: ["royal", "navy", "mono"], styles: ["modern", "grotesk", "poppins"],
    copy: [C("WE ARE HIRING", "Join our\nteam", "Designers, developers and marketers wanted.", "Apply now", "careers@yourcompany.com", "HIRING"), C("DIGITAL AGENCY", "Grow your\nbusiness", "Websites, branding and social media that sell.", "Get a quote", "www.yourcompany.com", "NEW")] },
  { id: "tech", name: "Technology", category: "Business", tags: ["technology", "app", "phone", "gadget", "startup"], photos: ["phone-desk", "phone-white", "phone-coffee", "laptop-linen", "watch-face"], pals: ["violet", "royal", "mono"], styles: ["syne", "grotesk", "modern"],
    copy: [C("NOW AVAILABLE", "The app\nyou need", "Manage bookings, payments and customers in one place.", "Download", "Free on iOS and Android", "NEW"), C("TECH SALE", "Smart deals\nweek", "Phones, watches and accessories at the best prices.", "Shop now", "While stock lasts", "-40%")] },
  { id: "event", name: "Event", category: "Events", tags: ["event", "party", "festival", "celebration", "night"], photos: ["concert-crowd", "fireworks-gold", "fireworks-city", "bokeh-lights", "balloons"], pals: ["violet", "pink", "navy"], styles: ["anton", "syne", "condensed"],
    copy: [C("SATURDAY · 20:00", "Summer\nfestival", "Live music, food trucks and fireworks by the sea.", "Get tickets", "Artificial Beach, Malé", "LIVE"), C("NEW YEAR'S EVE", "Countdown\nparty", "Music, dinner and the best view of the fireworks.", "Reserve", "31 December · from 21:00", "2027")] },
  { id: "music", name: "Music", category: "Events", tags: ["music", "concert", "live", "band", "acoustic"], photos: ["guitar-play", "guitar-dark", "studio-mic", "concert-crowd"], pals: ["mono", "sunset", "violet"], styles: ["condensed", "editorial", "anton"],
    copy: [C("LIVE AND ACOUSTIC", "Unplugged\nnight", "Local artists, candle light and good company.", "Get tickets", "Friday · 21:00 · Free entry", "LIVE"), C("NEW PODCAST", "Listen\nnow", "Stories, interviews and music from the islands.", "Subscribe", "New episode every Monday", "EP 12")] },
  { id: "wedding", name: "Wedding", category: "Events", tags: ["wedding", "invitation", "save the date", "bride", "love"], photos: ["wedding-rings", "wedding-hands", "bride-bouquet", "wedding-aisle", "roses-pastel"], pals: ["gold", "blush", "sand"], styles: ["elegant", "editorial", "serif"],
    copy: [C("SAVE THE DATE", "Aisha &\nIbrahim", "Together with their families invite you to celebrate their wedding.", "RSVP", "14 February 2027 · Malé", "♥"), C("WEDDING PLANNER", "Your perfect\nday", "Venues, flowers, photography and catering, all arranged.", "Plan with us", "Free first consultation", "NEW")] },
  { id: "birthday", name: "Birthday", category: "Events", tags: ["birthday", "party", "invitation", "kids", "celebration"], photos: ["birthday-candles", "balloons", "cupcakes", "chocolate-cake"], pals: ["pink", "violet", "coral"], styles: ["poppins", "fraunces", "syne"],
    copy: [C("YOU'RE INVITED", "Maryam\nturns 7", "Games, cake and lots of fun. Come and celebrate!", "RSVP", "Saturday 3 pm · 12 Orchid Magu", "7"), C("PARTY PACKAGES", "Birthday\nparties", "Decorations, cake and entertainment for kids.", "Book now", "From MVR 2,500", "NEW")] },
  { id: "cinema", name: "Cinema", category: "Events", tags: ["movie", "cinema", "film", "night", "popcorn"], photos: ["cinema", "popcorn"], pals: ["red", "mono", "violet"], styles: ["anton", "condensed", "bold"],
    copy: [C("OPEN AIR", "Movie\nnight", "Bring a blanket. Popcorn and drinks on sale.", "Free entry", "Friday · 20:30 · Rasfannu", "FREE"), C("NOW SHOWING", "Film\nclub", "A classic film every week, followed by discussion.", "Join us", "Wednesdays at 19:00", "NEW")] },
  { id: "education", name: "Education", category: "Education", tags: ["education", "school", "course", "learning", "workshop"], photos: ["bookshelf", "library", "old-books", "art-craft", "laptop-coffee"], pals: ["royal", "navy", "forest"], styles: ["modern", "fraunces", "poppins"],
    copy: [C("ENROL NOW", "Learn new\nskills", "Short courses in design, coding and languages.", "Register", "Classes start 1 June", "NEW"), C("FREE WORKSHOP", "Design\nbasics", "Two hours, hands-on, for complete beginners.", "Save a seat", "Saturday · 10:00", "FREE")] },
  { id: "medical", name: "Clinic", category: "Business", tags: ["clinic", "dental", "doctor", "health", "medical"], photos: ["dental-chair", "leaves-dew", "white-arch"], pals: ["teal", "royal", "ocean"], styles: ["modern", "poppins", "grotesk"],
    copy: [C("DENTAL CLINIC", "Smile with\nconfidence", "Check-ups, whitening and braces by expert dentists.", "Book now", "Call +960 333 0000", "-20%"), C("FREE CHECK-UP", "Your health\nfirst", "General consultation for new patients this month.", "Book a visit", "Open daily 8:00 to 20:00", "FREE")] },
  { id: "pets", name: "Pets", category: "Business", tags: ["pets", "dog", "cat", "vet", "grooming"], photos: ["happy-dog", "tabby-cat", "hike-dog"], pals: ["sand", "coral", "lime"], styles: ["poppins", "fraunces", "bold"],
    copy: [C("PET GROOMING", "Happy pets,\nhappy you", "Bath, trim and nails by gentle professionals.", "Book now", "Pick-up and drop-off", "-15%"), C("ADOPT, DON'T SHOP", "Find a\nfriend", "Dogs and cats waiting for a loving home.", "Meet them", "Open day this Saturday", "♥")] },
  { id: "auto", name: "Automotive", category: "Business", tags: ["car", "motorbike", "garage", "service", "automotive"], photos: ["motorbike", "moto-gauges", "street-night"], pals: ["mono", "red", "navy"], styles: ["anton", "bold", "condensed"],
    copy: [C("SERVICE CENTRE", "Ride\nsafe", "Full service, new tyres and checks while you wait.", "Book a service", "Open 8:00 to 18:00", "-10%"), C("NEW ARRIVALS", "Built for\nthe road", "Scooters and bikes with easy monthly payments.", "Visit showroom", "Majeedhee Magu, Malé", "NEW")] },
  { id: "photography", name: "Photography", category: "Business", tags: ["photography", "camera", "studio", "portrait", "creative"], photos: ["retro-camera", "camera-wood", "lens-detail"], pals: ["mono", "gold", "sand"], styles: ["editorial", "syne", "grotesk"],
    copy: [C("PHOTO STUDIO", "Capture\nthe moment", "Portraits, weddings, products and events.", "Book a shoot", "www.yourstudio.com", "NEW"), C("PHOTO WALK", "Learn\nphotography", "A morning workshop around the old town.", "Join us", "Sunday · 7:00", "FREE")] },
  { id: "jewellery", name: "Jewellery", category: "Business", tags: ["jewellery", "watch", "luxury", "gift", "gold"], photos: ["watch-wood", "watch-face", "wedding-rings"], pals: ["gold", "mono", "wine"], styles: ["elegant", "serif", "editorial"],
    copy: [C("FINE JEWELLERY", "Timeless\nelegance", "Hand-finished pieces in gold and silver.", "Discover", "Free engraving", "NEW"), C("GIFT SEASON", "A gift to\nremember", "Watches and jewellery for every occasion.", "Shop gifts", "Gift wrapping included", "-20%")] },
  { id: "nature", name: "Nature", category: "Social media", tags: ["nature", "quote", "inspiration", "landscape", "calm"], photos: ["green-falls", "waterfall-pool", "dunes", "dark-peak", "milky-way", "star-trails", "pink-sunset", "golden-sea"], pals: ["mono", "forest", "navy"], styles: ["elegant", "editorial", "serif"],
    copy: [C("MONDAY MOTIVATION", "Slow down\nand breathe", "Small steps every day add up to big changes.", "@yourbrand", "Share with someone who needs this", "“"), C("QUOTE OF THE DAY", "Stay wild,\nstay kind", "Nature does not hurry, yet everything is accomplished.", "@yourbrand", "Double tap if you agree", "“")] },
  { id: "eco", name: "Environment", category: "Social media", tags: ["environment", "eco", "climate", "ocean", "charity", "awareness"], photos: ["reef-fish", "green-leaves", "palm-light", "rocky-coast", "farm-aerial"], pals: ["forest", "ocean", "teal"], styles: ["grotesk", "poppins", "bold"],
    copy: [C("WORLD OCEANS DAY", "Protect\nour reefs", "Join the clean-up and help keep our oceans alive.", "Volunteer", "Saturday 8 June · 7:30", "8 JUN"), C("GO GREEN", "Plant a\ntree", "One tree for every sign-up. Let's grow together.", "Join us", "www.yourcause.org", "GO")] },
  { id: "ramadan", name: "Festive", category: "Events", tags: ["ramadan", "eid", "festive", "greeting", "celebration"], photos: ["mosque-gold", "mosque-lagoon", "bokeh-lights", "candle"], pals: ["gold", "navy", "teal"], styles: ["elegant", "serif", "editorial"],
    copy: [C("SEASON'S GREETINGS", "Eid\nMubarak", "Wishing you and your family joy, peace and blessings.", "From all of us", "Your company name", "✦"), C("IFTAR SPECIAL", "Iftar\nbuffet", "A generous spread of local and international dishes.", "Reserve", "Daily at sunset · MVR 350", "NEW")] },
  { id: "harbour", name: "Coastal", category: "Travel", tags: ["coast", "lighthouse", "harbour", "city", "travel"], photos: ["lighthouse-red", "lighthouse-dusk", "harbour-town", "fog-bridge", "night-bridge", "city-bridge"], pals: ["navy", "red", "sand"], styles: ["serif", "condensed", "grotesk"],
    copy: [C("CITY GUIDE", "48 hours\nin the city", "Where to eat, stay and explore on a short break.", "Read the guide", "New on the blog", "NEW"), C("PHOTO TOUR", "Golden hour\nwalk", "Lighthouses, harbours and the best viewpoints.", "Book a spot", "Every evening · 17:30", "$35")] },
  { id: "kayak", name: "Water sports", category: "Sports", tags: ["kayak", "water sports", "sailing", "paddle", "ocean"], photos: ["kayak-yellow", "kayak-red", "kayak-sunset", "old-sailboat", "blue-sail"], pals: ["sunset", "ocean", "coral"], styles: ["bold", "anton", "modern"],
    copy: [C("WATER SPORTS", "Paddle\nout", "Kayaks, paddle boards and sailing lessons.", "Rent now", "From $20 per hour", "-20%"), C("SAILING SCHOOL", "Learn to\nsail", "Five lessons with certified instructors.", "Sign up", "Ages 10 and up", "NEW")] },
  { id: "family", name: "Family", category: "Social media", tags: ["family", "love", "kids", "home", "weekend"], photos: ["family-walk", "beach-girl", "woman-wheat", "woman-forest"], pals: ["sand", "blush", "forest"], styles: ["fraunces", "elegant", "poppins"],
    copy: [C("FAMILY WEEKEND", "Little\nadventures", "Make memories that last a lifetime.", "Plan yours", "@yourbrand", "♥"), C("LIFESTYLE BLOG", "Simple\nliving", "Ideas for slower, calmer and happier days.", "Read more", "New post every Friday", "NEW")] },
  { id: "flowers", name: "Florist", category: "Business", tags: ["flowers", "florist", "bouquet", "gift", "valentine"], photos: ["blue-flowers", "purple-flowers", "yellow-flowers", "roses-pastel", "bed-flatlay"], pals: ["blush", "violet", "forest"], styles: ["elegant", "fraunces", "serif"],
    copy: [C("FRESH FLOWERS", "Say it with\nflowers", "Hand-tied bouquets delivered the same day.", "Order now", "Free delivery in Malé", "-15%"), C("VALENTINE'S DAY", "Love in\nbloom", "Roses, tulips and custom arrangements.", "Pre-order", "Order before 12 February", "♥")] },
];

// ---------------- format sizes ----------------
type Fmt = { preset: string; label: string };
const PORTRAIT: Fmt[] = [{ preset: "ig-post", label: "Instagram post" }, { preset: "story", label: "Story" }, { preset: "ig-square", label: "Square post" }, { preset: "a4", label: "A4 flyer" }];
const LANDSCAPE: Fmt[] = [{ preset: "yt-thumb", label: "YouTube thumbnail" }, { preset: "fb-post", label: "Facebook post" }, { preset: "pres", label: "Presentation" }, { preset: "fb-cover", label: "Facebook cover" }];

const F = Object.fromEntries([...PORTRAIT, ...LANDSCAPE].map((f) => [f.preset, f]));
const SEQUENCE: Fmt[] = ["ig-post", "story", "ig-square", "a4", "yt-thumb", "ig-post", "story", "fb-post", "ig-post", "a4", "pres", "story", "ig-square", "fb-cover", "ig-post", "story"].map((id) => F[id]);

// ---------------- layout engine ----------------
type Ctx = { W: number; H: number; u: number; m: number; p: Palette; s: Style; c: Copy; ph: string[]; land: boolean; hs: number };

const up = (s: Style, t: string) => (s.upper ? t.toUpperCase() : t);
/** Headline size that fits the longest line into the width. */
function fitSize(s: Style, text: string, w: number, max: number) {
  const widest = Math.max(...up(s, text).split("\n").map((l) => textW(s.head, s.headW, l, 100)));
  return Math.floor(Math.min(max, (w * 0.96 * 100) / widest));
}

type Block = { node: DesignNode[]; h: number; gap: number };
function head(ctx: Ctx, x: number, w: number, max: number, color: string, align: "left" | "center" | "right" = "left", text = ctx.c.head): Block {
  const { s } = ctx; const size = fitSize(s, text, w, max * ctx.hs); const t = up(s, text);
  const n = T(x, 0, w, t, size, { font: s.head, weight: s.headW, color, align, lh: s.lh, name: "Headline" });
  return { node: [n], h: t.split("\n").length * size * s.lh, gap: 0 };
}
function kicker(ctx: Ctx, x: number, w: number, color: string, align: "left" | "center" | "right" = "left", size = 26 * ctx.u): Block {
  const k = ctx.c.kicker; const per = textW(ctx.s.body, 700, k, 1) + 0.22 * k.length;
  const sz = Math.round(Math.min(size, (w * 0.96) / per));
  return { node: [T(x, 0, w, ctx.c.kicker, sz, { font: ctx.s.body, weight: 700, color, align, ls: sz * 0.22, name: "Kicker" })], h: sz * 1.25, gap: 0 };
}
function body(ctx: Ctx, x: number, w: number, color: string, align: "left" | "center" | "right" = "left", text = ctx.c.sub, size = 30 * ctx.u): Block {
  const sz = Math.round(size);
  return { node: [T(x, 0, w, text, sz, { font: ctx.s.body, color, align, lh: 1.4, name: "Body text" })], h: wrapLines(ctx.s.body, 400, text, sz, w) * sz * 1.4, gap: 0 };
}
function button(ctx: Ctx, x: number, fill: string, color: string, align: "left" | "center" | "right" = "left", areaW = 0, outline = false): Block {
  const sz = Math.round(28 * ctx.u), h = Math.round(sz * 2.9), w = Math.round(textW(ctx.s.body, 700, ctx.c.cta, sz) + sz * 3.2);
  const bx = align === "center" ? x + (areaW - w) / 2 : align === "right" ? x + areaW - w : x;
  const r = box(bx, 0, w, h, outline ? { type: "none" } as Fill : solid(fill), { cornerRadius: h / 2, name: "Button", stroke: outline ? { color: fill, width: Math.max(2, 3 * ctx.u) } : null });
  const t = T(bx, (h - sz * 1.2) / 2, w, ctx.c.cta, sz, { font: ctx.s.body, weight: 700, color, align: "center", name: "Button label" });
  return { node: [r, t], h, gap: 0 };
}
/** Place blocks top-down from y (gaps between) and return the nodes. */
function stackDown(blocks: Block[], y: number, gaps: number[]): DesignNode[] {
  const out: DesignNode[] = [];
  blocks.forEach((b, i) => {
    const base = b.node[0].y; // button label carries its offset relative to the box
    for (const n of b.node) { n.y = y + (n.y - base); out.push(n); }
    y += b.h + (gaps[i] ?? 0);
  });
  return out;
}
const total = (blocks: Block[], gaps: number[]) => blocks.reduce((a, b, i) => a + b.h + (i < blocks.length - 1 ? gaps[i] ?? 0 : 0), 0);
function stackUp(blocks: Block[], bottom: number, gaps: number[]) { return stackDown(blocks, bottom - total(blocks, gaps), gaps); }
function badge(ctx: Ctx, cx: number, cy: number, d: number, fill: string, color: string): DesignNode[] {
  if (!ctx.c.badge) return [];
  const e = { ...box(0, 0, 0, 0, solid(fill)), type: "ellipse" as const, x: cx - d / 2, y: cy - d / 2, width: d, height: d, name: "Badge" };
  delete (e as { cornerRadius?: number }).cornerRadius;
  const t = ctx.c.badge, sz = Math.round(Math.min(d * 0.36, (d * 0.7) / (textW(ctx.s.head, ctx.s.headW, ctx.s.upper ? t.toUpperCase() : t, 1) || 1)));
  return [e as DesignNode, T(cx - d / 2, cy - sz * 0.62, d, t, sz, { font: ctx.s.head, weight: ctx.s.headW, color, align: "center", lh: 1.2, name: "Badge text" })];
}
const shade = (W: number, y: number, h: number, c: string, dir: "down" | "up" = "down", strength = 0.92) =>
  box(0, y, W, h, lin(dir === "down" ? 90 : 270, [[0, c + "00"], [0.5, c + hex(strength * 0.7)], [1, c + hex(strength)]]), { name: "Shade" });
function hex(a: number) { return Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0"); }
const adj = { vibrance: 12, contrast: 6 };

type Layout = { id: string; land: boolean; portrait: boolean; square?: boolean; fmts: string[]; build: (ctx: Ctx) => { bg: Fill; nodes: DesignNode[] } };
const LAYOUTS: Layout[] = [
  { id: "overlay", land: true, portrait: true, square: true, fmts: ["ig-post", "story", "ig-square", "a4", "yt-thumb", "fb-post", "pres", "fb-cover"], build: (x) => {
    const { W, H, m, p } = x; const tw = x.land ? W * 0.58 : W - 2 * m;
    const blocks = [kicker(x, m, tw, p.accent), head(x, m, tw, (x.land ? H * 0.2 : W * 0.15), "#ffffff"), body(x, m, Math.min(tw, W * 0.75), "#e5e7eb"), button(x, m, p.accent, p.ink)];
    const gaps = [m * 0.25, m * 0.35, m * 0.5];
    return { bg: solid(p.dark), nodes: [photo(x.ph[0], 0, 0, W, H, { adjust: adj }), x.land ? box(0, 0, W * 0.75, H, lin(0, [[0, p.dark + "f0"], [0.6, p.dark + "aa"], [1, p.dark + "00"]]), { name: "Shade" }) : shade(W, H * 0.35, H * 0.65, p.dark), ...stackUp(blocks, H - m, gaps)] };
  } },
  { id: "center", land: true, portrait: true, square: true, fmts: ["ig-post", "story", "ig-square", "a4", "yt-thumb", "fb-post", "pres", "fb-cover"], build: (x) => {
    const { W, H, m, p } = x; const tw = W - 2 * m;
    const blocks = [kicker(x, m, tw, "#ffffff", "center"), head(x, m, tw, x.land ? H * 0.24 : W * 0.2, "#ffffff", "center"), body(x, m + tw * 0.12, tw * 0.76, "#f3f4f6", "center")];
    const gaps = [m * 0.35, m * 0.4]; const y = (H - total(blocks, gaps)) / 2;
    const line = box(W / 2 - 40 * x.u, y - m * 0.6, 80 * x.u, 4 * x.u, solid(p.accent), { name: "Accent line" });
    return { bg: solid(p.dark), nodes: [photo(x.ph[0], 0, 0, W, H, { adjust: { ...adj, brightness: -8 } }), box(0, 0, W, H, solid(p.dark + "8c"), { name: "Tint" }), line, ...stackDown(blocks, y, gaps),
      ...stackUp([body(x, m, tw, "#ffffff", "center", x.c.info, 24 * x.u)], H - m * 0.8, [])] };
  } },
  { id: "split", land: true, portrait: true, fmts: ["ig-post", "story", "a4", "yt-thumb", "fb-post", "pres"], build: (x) => {
    const { W, H, m, p } = x;
    if (x.land) {
      const pw = W * 0.5, tw = W - pw - 2 * m;
      const blocks = [kicker(x, m, tw, p.accent === p.dark ? p.dark : p.accent), head(x, m, tw, H * 0.17, p.dark), body(x, m, tw, p.dark + "b3"), button(x, m, p.dark, p.light)];
      const gaps = [m * 0.25, m * 0.35, m * 0.5];
      return { bg: solid(p.light), nodes: [photo(x.ph[0], W - pw, 0, pw, H, { adjust: adj }), ...stackDown(blocks, (H - total(blocks, gaps)) / 2, gaps)] };
    }
    const ph = Math.round(H * 0.56); const tw = W - 2 * m;
    const blocks = [kicker(x, m, tw, p.accent === p.light ? p.dark : p.accent), head(x, m, tw, W * 0.13, p.light), body(x, m, tw * 0.85, p.soft)];
    const gaps = [m * 0.25, m * 0.35];
    return { bg: solid(p.dark), nodes: [photo(x.ph[0], 0, 0, W, ph, { adjust: adj }), box(0, ph, W, H - ph, solid(p.dark), { name: "Panel" }),
      ...badge(x, W - m - 80 * x.u, ph, 170 * x.u, p.accent, p.ink),
      ...stackDown(blocks, ph + m * 0.9, gaps), ...stackUp([body(x, m, tw, p.light, "left", x.c.info, 26 * x.u)], H - m * 0.7, [])] };
  } },
  { id: "card", land: false, portrait: true, fmts: ["ig-post", "a4"], build: (x) => {
    const { W, H, m, p } = x; const tw = W - 2 * m; const ph = Math.round(H * 0.5);
    const tagSz = Math.round(24 * x.u), tagW = textW(x.s.body, 700, x.c.kicker, tagSz, tagSz * 0.12) + tagSz * 2, tagH = tagSz * 2.4;
    const blocks = [head(x, m, tw, W * 0.12, p.dark), body(x, m, tw * 0.9, p.dark + "b3"), button(x, m, p.dark, p.light)];
    const gaps = [m * 0.35, m * 0.55];
    return { bg: solid(p.light), nodes: [photo(x.ph[0], m, m, tw, ph, { radius: 28 * x.u, adjust: adj }),
      box(m * 1.5, m + ph - tagH / 2, tagW, tagH, solid(p.accent === p.light ? p.dark : p.accent), { cornerRadius: tagH / 2, name: "Tag" }),
      T(m * 1.5, m + ph - tagSz * 0.6, tagW, x.c.kicker, tagSz, { font: x.s.body, weight: 700, color: p.accent === p.light ? p.light : p.ink, align: "center", ls: tagSz * 0.12, name: "Tag label" }),
      ...stackDown(blocks, m + ph + m * 1.0, gaps), ...stackUp([body(x, m, tw, p.dark + "99", "left", x.c.info, 24 * x.u)], H - m * 0.8, [])] };
  } },
  { id: "frame", land: false, portrait: true, square: true, fmts: ["ig-post", "story", "ig-square", "a4"], build: (x) => {
    const { W, H, m, p } = x; const inset = m * 0.55; const tw = W - 2 * m;
    const blocks = [head(x, m, tw, W * 0.15, "#ffffff"), body(x, m, tw * 0.8, "#f1f5f9")];
    return { bg: solid(p.dark), nodes: [photo(x.ph[0], 0, 0, W, H, { adjust: adj }), shade(W, H * 0.45, H * 0.55, "#000000", "down", 0.8), shade(W, 0, H * 0.25, "#000000", "up", 0.55),
      box(inset, inset, W - 2 * inset, H - 2 * inset, { type: "none" }, { name: "Frame", stroke: { color: "#ffffff", width: Math.max(2, 3 * x.u) } }),
      ...stackDown([kicker(x, m, tw, "#ffffff", "center")], m * 0.95, []), ...stackUp(blocks, H - m * 1.1, [m * 0.35])] };
  } },
  { id: "magazine", land: false, portrait: true, square: true, fmts: ["ig-post", "story", "a4"], build: (x) => {
    const { W, H, m, p } = x; const tw = W - 2 * m;
    const top = [kicker(x, m, tw, p.accent), head(x, m, tw, W * 0.16, p.light)];
    const used = total(top, [m * 0.25]); const py = m + used + m * 0.7; const pb = H - m * 2.2;
    const off = 24 * x.u;
    return { bg: solid(p.dark), nodes: [...stackDown(top, m, [m * 0.25]),
      box(m + off, py + off, tw, pb - py, solid(p.accent), { name: "Accent block" }), photo(x.ph[0], m, py, tw - off, pb - py - off, { adjust: adj }),
      ...stackUp([body(x, m, tw * 0.7, p.soft, "left", x.c.info, 26 * x.u)], H - m * 0.75, []),
      ...badge(x, W - m - 90 * x.u, py + 10 * x.u, 180 * x.u, p.light, p.dark)] };
  } },
  { id: "circle", land: false, portrait: true, fmts: ["ig-post", "a4"], build: (x) => {
    const { W, H, m, p } = x; const tw = W - 2 * m; const d = Math.min(W * 0.66, H * 0.44); const cy = m * 1.2;
    const ring = { ...box(0, 0, 0, 0, { type: "none" }), type: "ellipse" as const, x: (W - d) / 2 - 14 * x.u, y: cy - 14 * x.u, width: d + 28 * x.u, height: d + 28 * x.u, name: "Ring", stroke: { color: p.accent, width: 4 * x.u } };
    delete (ring as { cornerRadius?: number }).cornerRadius;
    const blocks = [kicker(x, m, tw, p.accent, "center"), head(x, m, tw, W * 0.13, p.light, "center"), body(x, m + tw * 0.1, tw * 0.8, p.soft, "center"), button(x, m, p.accent, p.ink, "center", tw)];
    const gaps = [m * 0.25, m * 0.35, m * 0.5];
    return { bg: lin(90, [[0, p.dark], [1, shadeHex(p.dark, 18)]]), nodes: [ring as DesignNode, photo(x.ph[0], (W - d) / 2, cy, d, d, { radius: d / 2, adjust: adj }), ...stackDown(blocks, cy + d + m * 0.9, gaps)] };
  } },
  { id: "offer", land: true, portrait: true, square: true, fmts: ["ig-post", "story", "ig-square", "a4", "yt-thumb", "fb-post", "pres"], build: (x) => {
    const { W, H, m, p } = x;
    if (x.land) {
      const tw = W * 0.5;
      const blocks = [head(x, m, tw, H * 0.22, p.dark), body(x, m, tw * 0.9, p.dark + "cc"), button(x, m, p.dark, p.light)];
      const gaps = [m * 0.35, m * 0.5];
      return { bg: solid(p.accent === p.dark ? p.light : p.accent), nodes: [photo(x.ph[0], W * 0.56, 0, W * 0.44, H, { adjust: adj }), ...stackDown(blocks, (H - total(blocks, gaps)) / 2, gaps), ...badge(x, W * 0.56, H * 0.5, H * 0.34, p.dark, p.light)] };
    }
    const ph = Math.round(H * 0.62); const tw = W - 2 * m; const bg = p.accent === p.dark ? p.light : p.accent; const ink = p.accent === p.dark ? p.dark : p.ink;
    const blocks = [head(x, m, tw, W * 0.14, ink), body(x, m, tw * 0.8, ink + "cc")];
    return { bg: solid(bg), nodes: [photo(x.ph[0], 0, 0, W, ph, { adjust: adj }), box(0, ph, W, H - ph, solid(bg), { name: "Panel" }),
      ...badge(x, W - m - 110 * x.u, ph - 30 * x.u, 230 * x.u, p.dark, p.light),
      ...stackDown(blocks, ph + m * 0.8, [m * 0.3]), ...stackUp([body(x, m, tw, ink, "left", x.c.info, 26 * x.u)], H - m * 0.7, [])] };
  } },
  { id: "type", land: true, portrait: true, fmts: ["ig-post", "story", "a4", "yt-thumb", "fb-post", "pres"], build: (x) => {
    const { W, H, m, p } = x;
    if (x.land) {
      const tw = W * 0.55;
      const blocks = [kicker(x, m, tw, p.accent), head(x, m, tw, H * 0.24, p.light), body(x, m, tw * 0.9, p.soft)];
      const gaps = [m * 0.3, m * 0.4]; const pw = W - tw - 3 * m;
      return { bg: lin(135, [[0, p.dark], [1, shadeHex(p.dark, 22)]]), nodes: [...stackDown(blocks, (H - total(blocks, gaps)) / 2, gaps), photo(x.ph[0], W - m - pw, m, pw, H - 2 * m, { radius: 24 * x.u, adjust: adj })] };
    }
    const tw = W - 2 * m;
    const blocks = [kicker(x, m, tw, p.accent), head(x, m, tw, W * 0.2, p.light)];
    const used = total(blocks, [m * 0.3]); const py = m + used + m * 0.8; const ph = H - py - m * 2.4;
    return { bg: lin(150, [[0, p.dark], [1, shadeHex(p.dark, 22)]]), nodes: [...stackDown(blocks, m, [m * 0.3]),
      photo(x.ph[0], m, py, tw, Math.max(ph, H * 0.2), { radius: 24 * x.u, adjust: adj }),
      ...stackUp([body(x, m, tw * 0.62, p.soft, "left", x.c.sub, 26 * x.u)], H - m * 0.75, []),
      ...stackUp([button(x, m, p.accent, p.ink, "right", tw)], H - m * 0.75, [])] };
  } },
  { id: "collage", land: true, portrait: true, fmts: ["ig-post", "a4", "yt-thumb", "fb-post", "pres"], build: (x) => {
    const { W, H, m, p } = x; const g = 16 * x.u; const ph2 = x.ph[1] ?? x.ph[0], ph3 = x.ph[2] ?? x.ph[0];
    if (x.land) {
      const cw = W * 0.5 - m; const tw = W * 0.5 - 2 * m;
      const blocks = [kicker(x, m, tw, p.accent === p.light ? p.dark : p.accent), head(x, m, tw, H * 0.17, p.dark), body(x, m, tw, p.dark + "b3")];
      const gaps = [m * 0.3, m * 0.35]; const cx = W * 0.5;
      return { bg: solid(p.light), nodes: [...stackDown(blocks, (H - total(blocks, gaps)) / 2, gaps),
        photo(x.ph[0], cx, m, cw, (H - 2 * m - g) * 0.6, { radius: 16 * x.u, adjust: adj }),
        photo(ph2, cx, m + (H - 2 * m - g) * 0.6 + g, (cw - g) / 2, (H - 2 * m - g) * 0.4, { radius: 16 * x.u, adjust: adj }),
        photo(ph3, cx + (cw + g) / 2, m + (H - 2 * m - g) * 0.6 + g, (cw - g) / 2, (H - 2 * m - g) * 0.4, { radius: 16 * x.u, adjust: adj })] };
    }
    const tw = W - 2 * m; const gh = H * 0.56; const a = (tw - g) * 0.58;
    const blocks = [kicker(x, m, tw, p.accent === p.light ? p.dark : p.accent), head(x, m, tw, W * 0.12, p.dark), body(x, m, tw * 0.85, p.dark + "b3")];
    return { bg: solid(p.light), nodes: [photo(x.ph[0], m, m, a, gh, { radius: 18 * x.u, adjust: adj }),
      photo(ph2, m + a + g, m, tw - a - g, (gh - g) / 2, { radius: 18 * x.u, adjust: adj }),
      photo(ph3, m + a + g, m + (gh + g) / 2, tw - a - g, (gh - g) / 2, { radius: 18 * x.u, adjust: adj }),
      ...stackDown(blocks, m + gh + m * 0.8, [m * 0.25, m * 0.35]), ...stackUp([body(x, m, tw, p.dark + "99", "left", x.c.info, 24 * x.u)], H - m * 0.7, [])] };
  } },
  { id: "arch", land: false, portrait: true, fmts: ["ig-post", "a4"], build: (x) => {
    const { W, H, m, p } = x; const tw = W - 2 * m; const aw = W * 0.62; const ah = H * 0.55;
    const blocks = [kicker(x, m, tw, p.accent === p.light ? p.dark : p.accent, "center"), head(x, m, tw, W * 0.13, p.dark, "center"), body(x, m + tw * 0.1, tw * 0.8, p.dark + "b3", "center")];
    return { bg: solid(p.light), nodes: [box((W - aw) / 2 - 18 * x.u, m - 18 * x.u, aw + 36 * x.u, ah + 36 * x.u, { type: "none" }, { cornerRadius: (aw + 36 * x.u) / 2, name: "Outline", stroke: { color: p.dark + "55", width: 2 * x.u } }),
      photo(x.ph[0], (W - aw) / 2, m, aw, ah, { radius: aw / 2, adjust: adj }),
      ...stackDown(blocks, m + ah + m * 0.9, [m * 0.25, m * 0.35]), ...stackUp([body(x, m, tw, p.dark + "99", "center", x.c.info, 24 * x.u)], H - m * 0.7, [])] };
  } },
];

type Box = { x: number; y: number; w: number; h: number };
function boxes(nodes: DesignNode[]): Box[] {
  const out: Box[] = [];
  for (const n of nodes) {
    if (n.type === "text" && n.name !== "Button label" && n.name !== "Badge text" && n.name !== "Tag label") {
      const lw = n.text.split("\n").map((l) => textW(n.fontFamily, n.fontWeight, l, n.fontSize, n.letterSpacing));
      const lines = wrapLines(n.fontFamily, n.fontWeight, n.text, n.fontSize, n.width);
      const used = Math.min(n.width, Math.max(...lw));
      const x = n.align === "center" ? n.x + (n.width - used) / 2 : n.align === "right" ? n.x + n.width - used : n.x;
      out.push({ x, y: n.y, w: used, h: lines * n.fontSize * n.lineHeight });
    } else if (n.type === "rect" && n.name === "Button") out.push({ x: n.x, y: n.y, w: n.width, h: n.height });
  }
  return out;
}
function collides(nodes: DesignNode[]) {
  const b = boxes(nodes);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const p = b[i], q = b[j];
    if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h - 2 && q.y < p.y + p.h - 2) return true;
  }
  return false;
}

function shadeHex(c: string, amt: number) {
  const n = parseInt(c.slice(1, 7), 16); const f = (v: number) => Math.max(0, Math.min(255, v + amt));
  return "#" + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function build(fmt: Fmt, layout: Layout, topic: Topic, ph: string[], pal: Palette, style: Style, copy: Copy): DesignDoc {
  const pr = PRESETS.find((x) => x.id === fmt.preset)!;
  const W = pr.width, H = pr.height, land = W > H * 1.15;
  const u = (land ? H * 1.5 : W * (H / W > 1.6 ? 1.12 : 1)) / 1080;
  const ctx: Ctx = { W, H, u, m: Math.round(Math.min(W, H) * (land ? 0.08 : 0.075)), p: pal, s: style, c: copy, ph, land, hs: 1 };
  let out = layout.build(ctx);
  // Shrink the headline until no two text blocks (or a text block and a button) collide.
  for (let i = 0; i < 10 && collides(out.nodes); i++) { ctx.hs *= 0.9; out = layout.build(ctx); }
  const { bg, nodes } = out;
  const d = newDoc(pr.width, pr.height, pr.dpi, pr.unit);
  d.pages[0].background = bg;
  d.pages[0].children = nodes;
  const fams = new Set([style.head, style.body].filter((f) => GOOGLE[f]));
  if (fams.size) d.fonts = [...fams].map((family): FontRef => ({ source: "google", family, weights: GOOGLE[family], italics: [] }));
  return d;
}

/** Deterministic set: every topic in many layouts, sizes, photos, palettes and font pairings. */
function generate(): Template[] {
  const out: Template[] = [];
  const PER_TOPIC = 12;
  TOPICS.forEach((tp, ti) => {
    const photos = tp.photos.filter((s) => STOCK[s]);
    if (!photos.length) return;
    for (let i = 0; i < PER_TOPIC; i++) {
      const fmt = SEQUENCE[(i + ti * 5) % SEQUENCE.length];
      const pool = LAYOUTS.filter((l) => l.fmts.includes(fmt.preset));
      const layout = pool[(ti * 3 + i * 5) % pool.length];
      const k = (ti + i) % photos.length;
      const ph = [photos[k], photos[(k + 1) % photos.length], photos[(k + 2) % photos.length]];
      const pal = PAL[tp.pals[(i + ti) % tp.pals.length]];
      const style = STYLES[tp.styles[(i * 2 + ti) % tp.styles.length]];
      const copy = tp.copy[i % tp.copy.length];
      const title = copy.head.replace(/\n/g, " ");
      out.push({
        id: `gen-${tp.id}-${i}`, title: `${title}`, category: tp.category,
        tags: [...tp.tags, tp.name.toLowerCase(), fmt.label.toLowerCase(), layout.id],
        format: fmt.label,
        build: () => build(fmt, layout, tp, ph, pal, style, copy),
      } as Template);
    }
  });
  return out;
}

export const GENERATED_TEMPLATES: Template[] = generate();
export { collides as templateTextCollides };

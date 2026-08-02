/* Compiles a large local food/grocery database into ../data/foods.js.
   Source: a curated bilingual (English/Hebrew) grocery list grouped by the
   app's categories, plus the food/drink emoji set. No network.
   Each entry: { name (EN), emoji, category, he (Hebrew, optional) }.
   Tuples are [englishName, emoji|'', hebrew|''] — an empty emoji falls back to
   a category-representative emoji so every item gets a sensible icon.
   Run: node tools/generate-foods.js */
const fs = require('fs');
const path = require('path');

// Category-representative fallback emojis.
const GENERIC = {
  produce: '🥬',
  fruit: '🍎',
  dairy: '🥛',
  meat: '🍖',
  bakery: '🍞',
  dry: '🥫',
  frozen: '🧊',
  drinks: '🥤',
  snacks: '🍿',
  condiments: '🧂',
  other: '🍽️',
};

// Default unit per category (used to prefill the form when a catalog item is
// selected). Individual items can override via UNIT_OVERRIDE below.
const UNIT_BY_CAT = {
  produce: 'pcs',
  fruit: 'pcs',
  dairy: 'pack',
  meat: 'kg',
  bakery: 'pcs',
  dry: 'pack',
  frozen: 'pack',
  drinks: 'L',
  snacks: 'pack',
  condiments: 'pcs',
  other: 'pcs',
};

// Per-item default-unit overrides (English name → unit).
const UNIT_OVERRIDE = {
  Milk: 'L', 'Low-fat milk': 'L', 'Soy milk': 'L', 'Almond milk': 'L',
  'Oat milk': 'L', 'Chocolate milk': 'L', Cream: 'ml', 'Sour cream': 'ml',
  'Whipping cream': 'ml', Yogurt: 'pcs', 'Greek yogurt': 'pcs', Eggs: 'pack',
  Water: 'L', 'Sparkling water': 'L', 'Mineral water': 'L', Cola: 'L',
  Soda: 'L', 'Orange juice': 'L', 'Apple juice': 'L', 'Grape juice': 'L',
  Juice: 'L', Lemonade: 'L', Coffee: 'g', Tea: 'box',
  Flour: 'kg', Sugar: 'kg', 'Brown sugar': 'kg', Rice: 'kg', Salt: 'pack',
  Oats: 'kg', Potato: 'kg', 'Sweet potato': 'kg', Onion: 'kg', 'Red onion': 'kg',
  Carrot: 'kg', Cucumber: 'kg', Tomato: 'kg', 'Cherry tomato': 'pack',
  Banana: 'kg', Apple: 'kg', 'Green apple': 'kg', Orange: 'kg', Grapes: 'kg',
  Chicken: 'kg', 'Chicken breast': 'kg', 'Chicken thigh': 'kg', Beef: 'kg',
  'Ground beef': 'kg', 'Ground chicken': 'kg', Steak: 'kg', Fish: 'kg',
  Salmon: 'kg', Tuna: 'kg', 'Olive oil': 'ml', 'Vegetable oil': 'ml',
  'Canola oil': 'ml', Vinegar: 'ml', Honey: 'g', Beer: 'pcs', Wine: 'pcs',
};

// Curated bilingual synonyms/plurals (English name → extra search terms).
const ALIAS_OVERRIDE = {
  Tomato: ['tomatoes', 'עגבניות'],
  'Cherry tomato': ['cherry tomatoes', 'עגבניות שרי'],
  Cucumber: ['cucumbers', 'מלפפונים'],
  Onion: ['onions', 'בצלים'],
  Potato: ['potatoes', 'תפוחי אדמה', 'תפוא'],
  'Sweet potato': ['sweet potatoes', 'בטטות'],
  Carrot: ['carrots', 'גזרים'],
  Apple: ['apples', 'תפוחים'],
  Banana: ['bananas', 'בננות'],
  Orange: ['oranges', 'תפוזים'],
  Egg: ['eggs', 'ביצה'],
  Eggs: ['egg', 'ביצה'],
  Milk: ['חלב', 'milks'],
  Bread: ['breads', 'לחמים'],
  Cheese: ['cheeses', 'גבינות'],
  Yogurt: ['yoghurt', 'yogurts', 'יוגורטים'],
  Chicken: ['chickens', 'עוף'],
  Cola: ['coke', 'coca cola', 'קוקה קולה', 'קולה'],
  Chocolate: ['chocolates', 'שוקולדים'],
  Cookies: ['cookie', 'biscuits', 'עוגייה'],
  Pepper: ['black pepper', 'פלפל'],
  'Bell pepper': ['peppers', 'פלפלים', 'גמבה'],
  Grapes: ['grape', 'ענב'],
  Strawberry: ['strawberries', 'תותים'],
  Pasta: ['pastas', 'פסטות'],
  'Green onion': ['scallion', 'scallions', 'בצל ירוק'],
  Lemon: ['lemons', 'לימונים'],
};

const groups = {
  fruit: [
    ['Apple', '🍎', 'תפוח'],
    ['Green apple', '🍏', 'תפוח ירוק'],
    ['Pear', '🍐', 'אגס'],
    ['Orange', '🍊', 'תפוז'],
    ['Clementine', '🍊', 'קלמנטינה'],
    ['Mandarin', '🍊', 'מנדרינה'],
    ['Lemon', '🍋', 'לימון'],
    ['Lime', '🍋', 'ליים'],
    ['Banana', '🍌', 'בננה'],
    ['Watermelon', '🍉', 'אבטיח'],
    ['Melon', '🍈', 'מלון'],
    ['Grapes', '🍇', 'ענבים'],
    ['Strawberry', '🍓', 'תות שדה'],
    ['Blueberry', '🫐', 'אוכמניות'],
    ['Raspberry', '🍓', 'פטל'],
    ['Blackberry', '🫐', 'פטל שחור'],
    ['Cherry', '🍒', 'דובדבן'],
    ['Peach', '🍑', 'אפרסק'],
    ['Nectarine', '🍑', 'נקטרינה'],
    ['Apricot', '🍑', 'משמש'],
    ['Plum', '🍑', 'שזיף'],
    ['Mango', '🥭', 'מנגו'],
    ['Pineapple', '🍍', 'אננס'],
    ['Coconut', '🥥', 'קוקוס'],
    ['Kiwi', '🥝', 'קיווי'],
    ['Pomegranate', '🍎', 'רימון'],
    ['Fig', '🟤', 'תאנה'],
    ['Date', '🟤', 'תמר'],
    ['Persimmon', '🍅', 'אפרסמון'],
    ['Grapefruit', '🍊', 'אשכולית'],
    ['Papaya', '🥭', 'פפאיה'],
    ['Passion fruit', '🍈', 'פסיפלורה'],
    ['Guava', '🍈', 'גויאבה'],
    ['Lychee', '🍈', 'ליצ׳י'],
    ['Cranberry', '🍒', 'חמוצית'],
    ['Raisins', '🍇', 'צימוקים'],
    ['Dried apricot', '🍑', 'משמש מיובש'],
    ['Prune', '🍑', 'שזיף מיובש'],
  ],
  produce: [
    ['Tomato', '🍅', 'עגבנייה'],
    ['Cherry tomato', '🍅', 'עגבניית שרי'],
    ['Cucumber', '🥒', 'מלפפון'],
    ['Carrot', '🥕', 'גזר'],
    ['Potato', '🥔', 'תפוח אדמה'],
    ['Sweet potato', '🍠', 'בטטה'],
    ['Onion', '🧅', 'בצל'],
    ['Red onion', '🧅', 'בצל סגול'],
    ['Green onion', '🧅', 'בצל ירוק'],
    ['Garlic', '🧄', 'שום'],
    ['Bell pepper', '🫑', 'פלפל'],
    ['Red pepper', '🫑', 'פלפל אדום'],
    ['Chili pepper', '🌶️', 'פלפל חריף'],
    ['Broccoli', '🥦', 'ברוקולי'],
    ['Cauliflower', '🥦', 'כרובית'],
    ['Lettuce', '🥬', 'חסה'],
    ['Cabbage', '🥬', 'כרוב'],
    ['Spinach', '🥬', 'תרד'],
    ['Kale', '🥬', 'קייל'],
    ['Arugula', '🥬', 'רוקט'],
    ['Parsley', '🌿', 'פטרוזיליה'],
    ['Cilantro', '🌿', 'כוסברה'],
    ['Dill', '🌿', 'שמיר'],
    ['Basil', '🌿', 'בזיליקום'],
    ['Mint', '🌿', 'נענע'],
    ['Corn', '🌽', 'תירס'],
    ['Eggplant', '🍆', 'חציל'],
    ['Mushroom', '🍄', 'פטריות'],
    ['Peas', '🫛', 'אפונה'],
    ['Green beans', '🫛', 'שעועית ירוקה'],
    ['Zucchini', '🥒', 'קישוא'],
    ['Pumpkin', '🎃', 'דלעת'],
    ['Squash', '🎃', 'דלורית'],
    ['Beet', '🍠', 'סלק'],
    ['Radish', '🥬', 'צנון'],
    ['Celery', '🥬', 'סלרי'],
    ['Asparagus', '🥬', 'אספרגוס'],
    ['Ginger', '🫚', 'ג׳ינג׳ר'],
    ['Turnip', '🥔', 'לפת'],
    ['Leek', '🧅', 'כרישה'],
    ['Avocado', '🥑', 'אבוקדו'],
    ['Olives', '🫒', 'זיתים'],
    ['Sprouts', '🌱', 'נבטים'],
    ['Artichoke', '🥬', 'ארטישוק'],
    ['Okra', '🫛', 'במיה'],
    ['Fennel', '🥬', 'שומר'],
  ],
  dairy: [
    ['Milk', '🥛', 'חלב'],
    ['Low-fat milk', '🥛', 'חלב דל שומן'],
    ['Soy milk', '🥛', 'חלב סויה'],
    ['Almond milk', '🥛', 'חלב שקדים'],
    ['Oat milk', '🥛', 'חלב שיבולת שועל'],
    ['Cheese', '🧀', 'גבינה'],
    ['Yellow cheese', '🧀', 'גבינה צהובה'],
    ['White cheese', '🧀', 'גבינה לבנה'],
    ['Cottage cheese', '🧀', 'קוטג׳'],
    ['Cream cheese', '🧀', 'גבינת שמנת'],
    ['Feta cheese', '🧀', 'גבינת פטה'],
    ['Mozzarella', '🧀', 'מוצרלה'],
    ['Parmesan', '🧀', 'פרמזן'],
    ['Yogurt', '🥛', 'יוגורט'],
    ['Greek yogurt', '🥛', 'יוגורט יווני'],
    ['Butter', '🧈', 'חמאה'],
    ['Margarine', '🧈', 'מרגרינה'],
    ['Cream', '🥛', 'שמנת'],
    ['Sour cream', '🥛', 'שמנת חמוצה'],
    ['Whipping cream', '🥛', 'שמנת מתוקה'],
    ['Eggs', '🥚', 'ביצים'],
    ['Pudding', '🍮', 'מעדן'],
    ['Ice cream', '🍨', 'גלידה'],
  ],
  meat: [
    ['Chicken', '🍗', 'עוף'],
    ['Chicken breast', '🍗', 'חזה עוף'],
    ['Chicken thigh', '🍗', 'שוקיים'],
    ['Ground chicken', '🍗', 'טחון עוף'],
    ['Turkey', '🦃', 'הודו'],
    ['Beef', '🥩', 'בקר'],
    ['Ground beef', '🥩', 'בשר טחון'],
    ['Steak', '🥩', 'סטייק'],
    ['Lamb', '🍖', 'כבש'],
    ['Veal', '🥩', 'עגל'],
    ['Pork', '🥓', 'חזיר'],
    ['Bacon', '🥓', 'בייקון'],
    ['Sausage', '🌭', 'נקניקיה'],
    ['Salami', '🍖', 'סלמי'],
    ['Pastrami', '🍖', 'פסטרמה'],
    ['Fish', '🐟', 'דג'],
    ['Salmon', '🐟', 'סלמון'],
    ['Tuna', '🐟', 'טונה'],
    ['Tilapia', '🐟', 'אמנון'],
    ['Shrimp', '🦐', 'שרימפס'],
    ['Schnitzel', '🍗', 'שניצל'],
    ['Hot dog', '🌭', 'נקניקיית פרנקפורטר'],
    ['Meatballs', '🍖', 'קציצות'],
  ],
  bakery: [
    ['Bread', '🍞', 'לחם'],
    ['Whole wheat bread', '🍞', 'לחם מלא'],
    ['White bread', '🍞', 'לחם לבן'],
    ['Baguette', '🥖', 'באגט'],
    ['Pita', '🫓', 'פיתה'],
    ['Roll', '🥐', 'לחמנייה'],
    ['Bun', '🍔', 'לחמנייה להמבורגר'],
    ['Croissant', '🥐', 'קרואסון'],
    ['Bagel', '🥯', 'בייגל'],
    ['Challah', '🍞', 'חלה'],
    ['Tortilla', '🫓', 'טורטייה'],
    ['Cake', '🍰', 'עוגה'],
    ['Cookies', '🍪', 'עוגיות'],
    ['Muffin', '🧁', 'מאפין'],
    ['Donut', '🍩', 'סופגנייה'],
    ['Crackers', '🍘', 'קרקרים'],
    ['Pretzel', '🥨', 'בייגלה'],
    ['Pancakes', '🥞', 'פנקייק'],
    ['Waffles', '🧇', 'ופלים'],
    ['Pizza', '🍕', 'פיצה'],
  ],
  dry: [
    ['Rice', '🍚', 'אורז'],
    ['Pasta', '🍝', 'פסטה'],
    ['Spaghetti', '🍝', 'ספגטי'],
    ['Noodles', '🍜', 'אטריות'],
    ['Couscous', '🍚', 'קוסקוס'],
    ['Flour', '🌾', 'קמח'],
    ['Sugar', '🍬', 'סוכר'],
    ['Brown sugar', '🍬', 'סוכר חום'],
    ['Salt', '🧂', 'מלח'],
    ['Oats', '🌾', 'שיבולת שועל'],
    ['Cereal', '🥣', 'דגני בוקר'],
    ['Granola', '🥣', 'גרנולה'],
    ['Cornflakes', '🥣', 'קורנפלקס'],
    ['Lentils', '🫘', 'עדשים'],
    ['Chickpeas', '🫘', 'חומוס גרגירים'],
    ['Beans', '🫘', 'שעועית'],
    ['Black beans', '🫘', 'שעועית שחורה'],
    ['Quinoa', '🌾', 'קינואה'],
    ['Bulgur', '🌾', 'בורגול'],
    ['Canned tomatoes', '🥫', 'רסק עגבניות'],
    ['Canned corn', '🥫', 'תירס משומר'],
    ['Canned tuna', '🥫', 'טונה בקופסה'],
    ['Tomato paste', '🥫', 'רסק עגבניות'],
    ['Peanut butter', '🥜', 'חמאת בוטנים'],
    ['Tahini', '🥫', 'טחינה'],
    ['Honey', '🍯', 'דבש'],
    ['Jam', '🍓', 'ריבה'],
    ['Nutella', '🍫', 'ממרח שוקולד'],
    ['Baking powder', '🥫', 'אבקת אפייה'],
    ['Yeast', '🥫', 'שמרים'],
    ['Cocoa powder', '🍫', 'אבקת קקאו'],
    ['Breadcrumbs', '🍞', 'פירורי לחם'],
    ['Soup mix', '🥣', 'אבקת מרק'],
    ['Almonds', '🌰', 'שקדים'],
    ['Walnuts', '🌰', 'אגוזי מלך'],
    ['Cashews', '🌰', 'קשיו'],
    ['Peanuts', '🥜', 'בוטנים'],
    ['Pistachios', '🌰', 'פיסטוקים'],
    ['Sunflower seeds', '🌻', 'גרעיני חמנייה'],
    ['Pumpkin seeds', '🎃', 'גרעיני דלעת'],
  ],
  condiments: [
    ['Olive oil', '🫒', 'שמן זית'],
    ['Vegetable oil', '🛢️', 'שמן'],
    ['Canola oil', '🛢️', 'שמן קנולה'],
    ['Vinegar', '🍶', 'חומץ'],
    ['Ketchup', '🍅', 'קטשופ'],
    ['Mayonnaise', '🥫', 'מיונז'],
    ['Mustard', '🌭', 'חרדל'],
    ['Soy sauce', '🍶', 'רוטב סויה'],
    ['Hot sauce', '🌶️', 'רוטב חריף'],
    ['BBQ sauce', '🥫', 'רוטב ברביקיו'],
    ['Pesto', '🌿', 'פסטו'],
    ['Hummus', '🥫', 'חומוס'],
    ['Pepper', '🧂', 'פלפל שחור'],
    ['Paprika', '🌶️', 'פפריקה'],
    ['Cumin', '🧂', 'כמון'],
    ['Turmeric', '🧂', 'כורכום'],
    ['Cinnamon', '🧂', 'קינמון'],
    ['Oregano', '🌿', 'אורגנו'],
    ['Curry', '🧂', 'קארי'],
    ['Garlic powder', '🧄', 'אבקת שום'],
    ['Bay leaves', '🌿', 'עלי דפנה'],
    ['Vanilla', '🍶', 'תמצית וניל'],
    ['Sesame', '🥫', 'שומשום'],
    ['Silan', '🍯', 'סילאן'],
  ],
  drinks: [
    ['Water', '💧', 'מים'],
    ['Sparkling water', '🫧', 'סודה'],
    ['Mineral water', '💧', 'מים מינרליים'],
    ['Cola', '🥤', 'קולה'],
    ['Soda', '🥤', 'משקה מוגז'],
    ['Orange juice', '🧃', 'מיץ תפוזים'],
    ['Apple juice', '🧃', 'מיץ תפוחים'],
    ['Grape juice', '🧃', 'מיץ ענבים'],
    ['Juice', '🧃', 'מיץ'],
    ['Coffee', '☕', 'קפה'],
    ['Instant coffee', '☕', 'קפה נמס'],
    ['Tea', '🍵', 'תה'],
    ['Green tea', '🍵', 'תה ירוק'],
    ['Beer', '🍺', 'בירה'],
    ['Wine', '🍷', 'יין'],
    ['Red wine', '🍷', 'יין אדום'],
    ['White wine', '🥂', 'יין לבן'],
    ['Vodka', '🍸', 'וודקה'],
    ['Whiskey', '🥃', 'ויסקי'],
    ['Milkshake', '🥤', 'מילקשייק'],
    ['Energy drink', '🥤', 'משקה אנרגיה'],
    ['Lemonade', '🍋', 'לימונדה'],
    ['Chocolate milk', '🥛', 'שוקו'],
  ],
  snacks: [
    ['Chips', '🍟', 'חטיף תפוצ׳יפס'],
    ['Potato chips', '🥔', 'צ׳יפס תפוחי אדמה'],
    ['Popcorn', '🍿', 'פופקורן'],
    ['Chocolate', '🍫', 'שוקולד'],
    ['Chocolate bar', '🍫', 'חטיף שוקולד'],
    ['Candy', '🍬', 'סוכריות'],
    ['Lollipop', '🍭', 'סוכריה על מקל'],
    ['Gum', '🍬', 'מסטיק'],
    ['Wafers', '🍫', 'ופלים'],
    ['Bamba', '🥜', 'במבה'],
    ['Bissli', '🥨', 'ביסלי'],
    ['Nuts mix', '🌰', 'תערובת אגוזים'],
    ['Granola bar', '🍫', 'חטיף גרנולה'],
    ['Rice cakes', '🍘', 'פריכיות אורז'],
    ['Dried fruit', '🍇', 'פירות יבשים'],
    ['Jelly', '🍬', 'סוכריות גומי'],
  ],
  frozen: [
    ['Frozen pizza', '🍕', 'פיצה קפואה'],
    ['Frozen vegetables', '🥦', 'ירקות קפואים'],
    ['Frozen peas', '🫛', 'אפונה קפואה'],
    ['Frozen corn', '🌽', 'תירס קפוא'],
    ['Frozen fries', '🍟', 'צ׳יפס קפוא'],
    ['Frozen fish', '🐟', 'דג קפוא'],
    ['Ice cream', '🍨', 'גלידה'],
    ['Popsicle', '🍦', 'ארטיק'],
    ['Frozen berries', '🫐', 'פירות יער קפואים'],
    ['Frozen dough', '🥐', 'בצק קפוא'],
    ['Ice', '🧊', 'קרח'],
  ],
  other: [
    ['Baby food', '🍼', 'מזון תינוקות'],
    ['Dog food', '🦴', 'אוכל לכלב'],
    ['Cat food', '🐟', 'אוכל לחתול'],
    ['Napkins', '🧻', 'מפיות'],
    ['Paper towels', '🧻', 'מגבות נייר'],
    ['Toilet paper', '🧻', 'נייר טואלט'],
    ['Dish soap', '🧴', 'סבון כלים'],
    ['Laundry detergent', '🧴', 'אבקת כביסה'],
    ['Aluminum foil', '📦', 'נייר כסף'],
    ['Trash bags', '🗑️', 'שקיות אשפה'],
    ['Matches', '🔥', 'גפרורים'],
    ['Candles', '🕯️', 'נרות'],
  ],
};

// Build the alias list for an entry: curated synonyms + auto EN plural/singular.
function buildAliases(name, he) {
  var set = {};
  var add = function (s) {
    if (!s) return;
    s = String(s).trim().toLowerCase();
    if (s) set[s] = true;
  };
  (ALIAS_OVERRIDE[name] || []).forEach(add);
  var lower = name.toLowerCase();
  if (lower.slice(-1) === 's') add(lower.slice(0, -1));
  else add(lower + 's');
  // Drop aliases identical to the canonical name / Hebrew name (already indexed).
  delete set[lower];
  if (he) delete set[he.toLowerCase()];
  return Object.keys(set);
}

var out = [];
var seen = {};
Object.keys(groups).forEach(function (cat) {
  groups[cat].forEach(function (tuple) {
    var name = tuple[0];
    var emoji = tuple[1] || GENERIC[cat];
    var he = tuple[2] || '';
    var key = name.toLowerCase();
    if (seen[key]) return; // dedupe by English name
    seen[key] = true;
    out.push({
      name: name,
      he: he,
      emoji: emoji,
      category: cat,
      unit: UNIT_OVERRIDE[name] || UNIT_BY_CAT[cat] || 'pcs',
      aliases: buildAliases(name, he),
    });
  });
});

out.sort(function (a, b) {
  return a.name.localeCompare(b.name);
});

var header =
  '/* Auto-generated by tools/generate-foods.js — DO NOT edit by hand.\n' +
  '   Local food/grocery database (English + Hebrew) with emoji + category.\n' +
  '   Exposed as global `FOODS`. ' +
  out.length +
  ' entries. */\n';
var body = 'self.FOODS = ' + JSON.stringify(out) + ';\n';

var outPath = path.join(__dirname, '..', 'data', 'foods.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body);
console.log('wrote', outPath, '-', out.length, 'entries,', body.length, 'bytes');

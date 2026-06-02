export type FoodCategory = 'vegetable' | 'cooked' | 'dairy' | 'grain' | 'unknown';

export type AdaptiveQuestionsResult = {
  category: FoodCategory;
  shouldAsk: boolean;
  questions: string[];
};

const CATEGORY_KEYWORDS: Array<{ category: FoodCategory; keywords: string[] }> = [
  {
    category: 'vegetable',
    keywords: ['vegetable', 'salad', 'lettuce', 'spinach', 'tomato', 'cucumber', 'carrot', 'greens', 'broccoli'],
  },
  {
    category: 'dairy',
    keywords: ['milk', 'yogurt', 'cheese', 'paneer', 'cream', 'butter', 'dairy'],
  },
  {
    category: 'grain',
    keywords: ['rice', 'bread', 'roti', 'chapati', 'pasta', 'noodles', 'grain', 'cereal'],
  },
  {
    category: 'cooked',
    keywords: ['cooked', 'curry', 'stew', 'soup', 'biryani', 'dal', 'fried', 'grilled', 'baked'],
  },
];

export function categorizeFood(foodType: string): FoodCategory {
  const name = (foodType ?? '').toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((k) => name.includes(k))) return entry.category;
  }
  return 'unknown';
}

function baseQuestionsFor(category: FoodCategory): { adaptive2: string[]; detailed4: string[] } {
  switch (category) {
    case 'vegetable':
      return {
        adaptive2: [
          'Is it cut/washed and exposed to air, or whole and uncut?',
          'How is it stored right now? (room / fridge / freezer)',
        ],
        detailed4: [
          'Is it cut/washed and exposed to air, or whole and uncut?',
          'How is it stored right now? (room / fridge / freezer)',
          'When was it purchased or prepared? (approx time)',
          'Any visible moisture/slime or off smell?',
        ],
      };
    case 'dairy':
      return {
        adaptive2: [
          'Is the package opened or unopened?',
          'How is it stored right now? (fridge / freezer / room)',
        ],
        detailed4: [
          'Is the package opened or unopened?',
          'How is it stored right now? (fridge / freezer / room)',
          'When was it opened or prepared? (approx time)',
          'Any sour smell, curdling, or unusual texture?',
        ],
      };
    case 'grain':
      return {
        adaptive2: [
          'Is it cooked (leftover) or dry/packaged?',
          'How is it stored right now? (room / fridge / freezer)',
        ],
        detailed4: [
          'Is it cooked (leftover) or dry/packaged?',
          'How is it stored right now? (room / fridge / freezer)',
          'When was it cooked/opened? (approx time)',
          'Is it covered/sealed or left open?',
        ],
      };
    case 'cooked':
      return {
        adaptive2: [
          'Roughly when was it cooked? (approx time)',
          'How is it stored right now? (room / fridge / freezer)',
        ],
        detailed4: [
          'Roughly when was it cooked? (approx time)',
          'How is it stored right now? (room / fridge / freezer)',
          'Was it cooled quickly after cooking or left out for a while?',
          'Any off smell, sourness, or visible mold?',
        ],
      };
    default:
      return {
        adaptive2: [
          'How is it stored right now? (room / fridge / freezer)',
          'When was it prepared or opened? (approx time)',
        ],
        detailed4: [
          'How is it stored right now? (room / fridge / freezer)',
          'When was it prepared or opened? (approx time)',
          'What is the current temperature near the food (°C, if known)?',
          'Is it cooked, raw, or packaged/processed?',
        ],
      };
  }
}

export function getAdaptiveQuestions(foodType: string, confidence: number): AdaptiveQuestionsResult {
  const category = categorizeFood(foodType);

  if (confidence > 90) {
    return { category, shouldAsk: false, questions: [] };
  }

  const isMid = confidence >= 60;
  const q = baseQuestionsFor(category);
  return {
    category,
    shouldAsk: true,
    questions: isMid ? q.adaptive2 : q.detailed4,
  };
}

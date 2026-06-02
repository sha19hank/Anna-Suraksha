import { categorizeFood, getAdaptiveQuestions } from '../../src/domain/hybrid';

describe('categorizeFood', () => {
  test.each([
    ['tomato',    'vegetable'],
    ['Lettuce',   'vegetable'],
    ['SPINACH',   'vegetable'],
    ['milk',      'dairy'],
    ['Paneer',    'dairy'],
    ['yogurt',    'dairy'],
    ['rice',      'grain'],
    ['Roti',      'grain'],
    ['bread',     'grain'],
    ['curry',     'cooked'],
    ['Dal',       'cooked'],
    ['biryani',   'cooked'],
    ['widget',    'unknown'],
    ['',          'unknown'],
  ])('"%s" → %s', (input, expected) => {
    expect(categorizeFood(input)).toBe(expected);
  });
});

describe('getAdaptiveQuestions', () => {
  test('confidence > 90 → no questions', () => {
    const r = getAdaptiveQuestions('milk', 95);
    expect(r.shouldAsk).toBe(false);
    expect(r.questions).toHaveLength(0);
  });

  test('confidence 60–90 → 2 questions', () => {
    const r = getAdaptiveQuestions('milk', 75);
    expect(r.shouldAsk).toBe(true);
    expect(r.questions).toHaveLength(2);
  });

  test('confidence < 60 → 4 questions', () => {
    const r = getAdaptiveQuestions('milk', 40);
    expect(r.shouldAsk).toBe(true);
    expect(r.questions).toHaveLength(4);
  });

  test('returns correct category for known food', () => {
    const r = getAdaptiveQuestions('tomato', 50);
    expect(r.category).toBe('vegetable');
  });

  test('returns unknown category for unrecognised food', () => {
    const r = getAdaptiveQuestions('mystery-food', 50);
    expect(r.category).toBe('unknown');
  });

  test('unknown category still has questions at low confidence', () => {
    const r = getAdaptiveQuestions('xyz', 30);
    expect(r.questions.length).toBeGreaterThan(0);
  });
});

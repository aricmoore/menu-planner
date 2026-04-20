import { describe, it, expect } from 'vitest';
import { isRecipeIncomplete, getIncompleteReasons } from '../utils/recipeUtils.js';

const completeRecipe = {
  name: 'Roast Chicken',
  instructions: 'Roast at 425°F for 45 minutes.',
  ingredients: [
    { name: 'chicken thighs', quantity: '8', unit: 'oz', cost: '3.50' },
    { name: 'olive oil',      quantity: '1', unit: 'tbsp', cost: '0.25' },
  ],
};

// ─── isRecipeIncomplete ───────────────────────────────────────────────────────

describe('isRecipeIncomplete', () => {
  it('returns false for a fully complete recipe', () => {
    expect(isRecipeIncomplete(completeRecipe)).toBe(false);
  });

  it('returns true when there are no ingredients', () => {
    expect(isRecipeIncomplete({ ...completeRecipe, ingredients: [] })).toBe(true);
    expect(isRecipeIncomplete({ ...completeRecipe, ingredients: undefined })).toBe(true);
  });

  it('returns true when instructions are missing', () => {
    expect(isRecipeIncomplete({ ...completeRecipe, instructions: '' })).toBe(true);
    expect(isRecipeIncomplete({ ...completeRecipe, instructions: '   ' })).toBe(true);
    expect(isRecipeIncomplete({ ...completeRecipe, instructions: undefined })).toBe(true);
  });

  it('returns true when any ingredient has no cost', () => {
    const ingredients = [
      { name: 'chicken thighs', cost: '3.50' },
      { name: 'salt',           cost: '' },       // missing
    ];
    expect(isRecipeIncomplete({ ...completeRecipe, ingredients })).toBe(true);
  });

  it('returns true when any ingredient cost is zero', () => {
    const ingredients = [{ name: 'olive oil', cost: '0' }];
    expect(isRecipeIncomplete({ ...completeRecipe, ingredients })).toBe(true);
  });

  it('returns true when any ingredient cost is the number 0', () => {
    const ingredients = [{ name: 'olive oil', cost: 0 }];
    expect(isRecipeIncomplete({ ...completeRecipe, ingredients })).toBe(true);
  });

  it('returns true when multiple things are missing', () => {
    expect(isRecipeIncomplete({ name: 'Draft', instructions: '', ingredients: [] })).toBe(true);
  });
});

// ─── getIncompleteReasons ─────────────────────────────────────────────────────

describe('getIncompleteReasons', () => {
  it('returns empty string for a complete recipe', () => {
    expect(getIncompleteReasons(completeRecipe)).toBe('');
  });

  it('reports no ingredients', () => {
    const result = getIncompleteReasons({ ...completeRecipe, ingredients: [] });
    expect(result).toContain('no ingredients');
  });

  it('reports no instructions', () => {
    const result = getIncompleteReasons({ ...completeRecipe, instructions: '' });
    expect(result).toContain('no instructions');
  });

  it('reports missing costs', () => {
    const ingredients = [{ name: 'salt', cost: '' }];
    const result = getIncompleteReasons({ ...completeRecipe, ingredients });
    expect(result).toContain('missing costs');
  });

  it('reports multiple reasons separated by commas', () => {
    const result = getIncompleteReasons({ name: 'Draft', instructions: '', ingredients: [] });
    expect(result).toContain('no ingredients');
    expect(result).toContain('no instructions');
    expect(result.split(', ').length).toBeGreaterThanOrEqual(2);
  });
});

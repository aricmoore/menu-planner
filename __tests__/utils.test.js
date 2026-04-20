import { describe, it, expect } from 'vitest';
import { normalizeName, similarity, categorizeIngredient } from '../utils/index.js';

// ─── normalizeName ────────────────────────────────────────────────────────────

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Chicken  ')).toBe('chicken');
  });

  it('removes trailing s (simple plural)', () => {
    expect(normalizeName('carrots')).toBe('carrot');
    expect(normalizeName('apples')).toBe('apple');
  });

  it('removes non-alphanumeric characters', () => {
    expect(normalizeName("bell pepper")).toBe('bellpepper');
    expect(normalizeName("extra-virgin olive oil")).toBe('extravirginoliveoil');
  });

  it('returns the same string when already normalized', () => {
    expect(normalizeName('chicken')).toBe('chicken');
    expect(normalizeName('rice')).toBe('rice');
  });

  it('handles empty string', () => {
    expect(normalizeName('')).toBe('');
  });

  // Documents a known limitation: chained regex stripping does not correctly
  // handle all plural forms (e.g. 'berries' ≠ 'berry' after normalization).
  it('documents plural stripping limitation for -ies words', () => {
    // "berries" → "berrie" → "berri" (not "berry") — known behaviour
    expect(normalizeName('berries')).not.toBe(normalizeName('berry'));
  });
});

// ─── similarity ───────────────────────────────────────────────────────────────

describe('similarity', () => {
  it('returns 1 for identical strings', () => {
    expect(similarity('chicken', 'chicken')).toBe(1);
  });

  it('returns 1 for strings that normalize to the same value', () => {
    expect(similarity('Chicken', 'chicken')).toBe(1);
    expect(similarity('  rice  ', 'rice')).toBe(1);
  });

  it('returns 0.9 when one normalized string contains the other', () => {
    expect(similarity('chicken thigh', 'chicken')).toBe(0.9);
    expect(similarity('olive oil', 'oil')).toBe(0.9);
  });

  it('returns a value between 0 and 1 for similar strings', () => {
    const score = similarity('salmon', 'salmonella');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns a low score for completely different strings', () => {
    const score = similarity('chicken', 'zucchini');
    expect(score).toBeLessThan(0.5);
  });

  it('returns 1 for two empty strings', () => {
    expect(similarity('', '')).toBe(1);
  });
});

// ─── categorizeIngredient ─────────────────────────────────────────────────────

describe('categorizeIngredient', () => {
  it('categorizes produce', () => {
    expect(categorizeIngredient('spinach')).toBe('Produce');
    expect(categorizeIngredient('cherry tomatoes')).toBe('Produce');
    expect(categorizeIngredient('garlic cloves')).toBe('Produce');
    expect(categorizeIngredient('lemon')).toBe('Produce');
  });

  it('categorizes meat and seafood', () => {
    expect(categorizeIngredient('chicken thighs')).toBe('Meat & Seafood');
    expect(categorizeIngredient('ground beef')).toBe('Meat & Seafood');
    expect(categorizeIngredient('Atlantic salmon')).toBe('Meat & Seafood');
    expect(categorizeIngredient('jumbo shrimp')).toBe('Meat & Seafood');
  });

  it('categorizes dairy and eggs', () => {
    expect(categorizeIngredient('whole milk')).toBe('Dairy & Eggs');
    expect(categorizeIngredient('cheddar cheese')).toBe('Dairy & Eggs');
    expect(categorizeIngredient('unsalted butter')).toBe('Dairy & Eggs');
    expect(categorizeIngredient('eggs')).toBe('Dairy & Eggs');
  });

  it('categorizes spices and seasonings', () => {
    expect(categorizeIngredient('kosher salt')).toBe('Spices & Seasonings');
    expect(categorizeIngredient('black pepper')).toBe('Spices & Seasonings');
    expect(categorizeIngredient('smoked paprika')).toBe('Spices & Seasonings');
    expect(categorizeIngredient('ground cumin')).toBe('Spices & Seasonings');
  });

  it('categorizes pantry and dry goods', () => {
    expect(categorizeIngredient('olive oil')).toBe('Pantry & Dry Goods');
    expect(categorizeIngredient('jasmine rice')).toBe('Pantry & Dry Goods');
    expect(categorizeIngredient('chicken broth')).toBe('Pantry & Dry Goods');
    expect(categorizeIngredient('balsamic vinegar')).toBe('Pantry & Dry Goods');
  });

  it('returns Other for unrecognized ingredients', () => {
    expect(categorizeIngredient('kombucha')).toBe('Other');
    expect(categorizeIngredient('dragon fruit')).toBe('Other');
    expect(categorizeIngredient('')).toBe('Other');
  });

  it('is case-insensitive', () => {
    expect(categorizeIngredient('CHICKEN')).toBe('Meat & Seafood');
    expect(categorizeIngredient('Butter')).toBe('Dairy & Eggs');
  });
});

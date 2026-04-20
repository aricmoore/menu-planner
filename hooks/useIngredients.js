import { useState, useCallback } from 'react';
import { normalizeName, similarity } from '../utils';
import { DEFAULT_NEW_INGREDIENT, DEFAULT_UNITS } from '../constants';
import { useNotification } from '../components/NotificationContext';

/**
 * Manages master ingredients, duplicate detection, unit list, and recipe-ingredient sync.
 *
 * @param {Object} recipes    - Current recipe state (needed for sync + merge operations)
 * @param {Function} setRecipes - Setter for recipe state
 */
export function useIngredients(recipes, setRecipes) {
  const { toast } = useNotification();
  const [masterIngredients, setMasterIngredients] = useState([]);
  const [newIngredient, setNewIngredient] = useState(DEFAULT_NEW_INGREDIENT);
  const [editingIngredientId, setEditingIngredientId] = useState(null);
  const [editingIngredientData, setEditingIngredientData] = useState(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const [units, setUnits] = useState(DEFAULT_UNITS);

  const findExactMatch = useCallback((name) => {
    return masterIngredients.find(mi => normalizeName(mi.name) === normalizeName(name));
  }, [masterIngredients]);

  const findSimilarIngredients = useCallback((name) => {
    if (!name || name.length < 2) return [];
    return masterIngredients.filter(mi => {
      const sim = similarity(name, mi.name);
      return sim > 0.7 && sim < 1;
    });
  }, [masterIngredients]);

  const getUniqueVendors = useCallback(() => {
    const vendors = new Set();
    masterIngredients.forEach(mi => {
      if (mi.source && mi.source.trim()) vendors.add(mi.source.trim());
    });
    return Array.from(vendors).sort();
  }, [masterIngredients]);

  const addUnit = useCallback((newUnit) => {
    if (!newUnit || newUnit.trim() === '') return;
    const trimmed = newUnit.trim().toLowerCase();
    setUnits(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed].sort()));
  }, []);

  const addToMasterIngredients = useCallback((ingredient) => {
    if (!ingredient.name) return;
    setMasterIngredients(prev => {
      const exactMatch = prev.find(mi => normalizeName(mi.name) === normalizeName(ingredient.name));
      if (exactMatch) {
        if (ingredient.cost || ingredient.source || ingredient.section !== 'Other') {
          return prev.map(mi =>
            mi.id === exactMatch.id
              ? {
                  ...mi,
                  cost: ingredient.cost || mi.cost,
                  source: ingredient.source || mi.source,
                  section: ingredient.section !== 'Other' ? ingredient.section : mi.section,
                }
              : mi
          );
        }
        return prev;
      }
      return [
        ...prev,
        {
          id: Date.now() + Math.random(),
          name: ingredient.name,
          cost: ingredient.cost || '',
          unit: ingredient.unit || 'oz',
          source: ingredient.source || '',
          section: ingredient.section || 'Other',
        },
      ];
    });
  }, []);

  const updateMasterIngredientCost = useCallback((ingredientName, newCost) => {
    if (!newCost) return false;
    setMasterIngredients(prev => {
      const match = prev.find(mi => normalizeName(mi.name) === normalizeName(ingredientName));
      if (!match) return prev;
      return prev.map(mi => (mi.id === match.id ? { ...mi, cost: newCost } : mi));
    });
    return true;
  }, []);

  const getRecipeCost = useCallback((recipe) => {
    if (!recipe?.ingredients) return 0;
    return recipe.ingredients.reduce((total, ing) => {
      const masterIng = masterIngredients.find(mi => normalizeName(mi.name) === normalizeName(ing.name));
      const costPerUnit = parseFloat(masterIng?.cost || ing.cost || 0);
      const quantity = parseFloat(ing.quantity || 0);
      return total + costPerUnit * quantity;
    }, 0);
  }, [masterIngredients]);

  const syncRecipeIngredientsFromMaster = useCallback(() => {
    let ingredientsAdded = 0;
    let costsUpdated = 0;

    const updatedRecipes = { ...recipes };
    Object.keys(updatedRecipes).forEach(category => {
      updatedRecipes[category] = updatedRecipes[category].map(recipe => {
        const updatedIngredients = recipe.ingredients.map(ing => {
          const masterIng = masterIngredients.find(
            mi => normalizeName(mi.name) === normalizeName(ing.name)
          );
          if (!masterIng) {
            if (ing.name) ingredientsAdded++;
            return ing;
          }
          const updated = { ...ing };
          if (masterIng.cost && masterIng.cost !== ing.cost) { updated.cost = masterIng.cost; costsUpdated++; }
          if (masterIng.source && masterIng.source !== ing.source) updated.source = masterIng.source;
          if (masterIng.section && masterIng.section !== 'Other' && masterIng.section !== ing.section) updated.section = masterIng.section;
          if (masterIng.unit && masterIng.unit !== ing.unit) updated.unit = masterIng.unit;
          return updated;
        });
        return { ...recipe, ingredients: updatedIngredients };
      });
    });

    // Add any new ingredients discovered in recipes to the master list
    Object.values(updatedRecipes).forEach(categoryRecipes => {
      categoryRecipes.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
          if (ing.name) addToMasterIngredients(ing);
        });
      });
    });

    setRecipes(updatedRecipes);
    return { ingredientsAdded, costsUpdated };
  }, [recipes, masterIngredients, setRecipes, addToMasterIngredients]);

  const mergeIngredients = useCallback((keepId, removeId) => {
    const keep = masterIngredients.find(i => i.id === keepId);
    const remove = masterIngredients.find(i => i.id === removeId);
    if (!keep || !remove) return;

    setRecipes(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(category => {
        updated[category] = updated[category].map(recipe => ({
          ...recipe,
          ingredients: recipe.ingredients.map(ing =>
            normalizeName(ing.name) === normalizeName(remove.name)
              ? { ...ing, name: keep.name }
              : ing
          ),
        }));
      });
      return updated;
    });

    setMasterIngredients(prev => prev.filter(i => i.id !== removeId));
    setDuplicateWarnings(prev =>
      prev.filter(d => d.ing1.id !== removeId && d.ing2.id !== removeId)
    );
    toast(`Merged "${remove.name}" into "${keep.name}"`, 'success');
  }, [masterIngredients, setRecipes, toast]);

  const scanForDuplicates = useCallback(() => {
    const found = [];
    const checked = new Set();
    masterIngredients.forEach((ing1, i) => {
      masterIngredients.forEach((ing2, j) => {
        if (i >= j) return;
        const key = [ing1.id, ing2.id].sort().join('-');
        if (checked.has(key)) return;
        checked.add(key);
        const sim = similarity(ing1.name, ing2.name);
        if (sim > 0.7 && sim < 1) found.push({ ing1, ing2, similarity: sim });
      });
    });
    setDuplicateWarnings(found);
    if (found.length === 0) toast('No duplicate ingredients found', 'info');
  }, [masterIngredients, toast]);

  return {
    masterIngredients, setMasterIngredients,
    newIngredient, setNewIngredient,
    editingIngredientId, setEditingIngredientId,
    editingIngredientData, setEditingIngredientData,
    duplicateWarnings, setDuplicateWarnings,
    units, addUnit,
    findExactMatch,
    findSimilarIngredients,
    getUniqueVendors,
    addToMasterIngredients,
    updateMasterIngredientCost,
    getRecipeCost,
    syncRecipeIngredientsFromMaster,
    mergeIngredients,
    scanForDuplicates,
  };
}

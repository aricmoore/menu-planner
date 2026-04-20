/**
 * Returns true if the recipe is missing ingredients, instructions, or any ingredient cost.
 * Used to surface incomplete recipes in the UI before they go into production use.
 */
export function isRecipeIncomplete(recipe) {
  const hasNoIngredients = !recipe.ingredients || recipe.ingredients.length === 0;
  const missingInstructions = !recipe.instructions || recipe.instructions.trim() === '';
  const missingCosts = recipe.ingredients?.some(
    ing => !ing.cost || ing.cost === '' || parseFloat(ing.cost) === 0
  );
  return hasNoIngredients || missingInstructions || missingCosts;
}

/**
 * Returns a human-readable comma-separated list of reasons a recipe is incomplete.
 * Returns an empty string if the recipe is complete.
 */
export function getIncompleteReasons(recipe) {
  const reasons = [];
  if (!recipe.ingredients || recipe.ingredients.length === 0) reasons.push('no ingredients');
  if (!recipe.instructions || recipe.instructions.trim() === '') reasons.push('no instructions');
  if (recipe.ingredients?.some(ing => !ing.cost || ing.cost === '' || parseFloat(ing.cost) === 0)) {
    reasons.push('missing costs');
  }
  return reasons.join(', ');
}

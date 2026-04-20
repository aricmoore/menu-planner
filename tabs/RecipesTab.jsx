import React, { useState } from 'react';
import { useNotification } from '../components/NotificationContext';
import { Upload, Download, Save, X, Edit2, Check, Trash2, AlertCircle, RefreshCw, AlertTriangle, Copy } from 'lucide-react';
import { STORE_SECTIONS, RECIPE_CATEGORIES } from '../constants';
import { normalizeName } from '../utils';
import { isRecipeIncomplete, getIncompleteReasons } from '../utils/recipeUtils';

export default function RecipesTab(props) {
  const { toast } = useNotification();

  // Destructure after logging
  const {
    recipes,
    newRecipe,
    setNewRecipe,
    editingRecipe,
    setEditingRecipe,
    masterIngredients,
    recipesFileRef,
    findExactMatch,
    findSimilarIngredients,
    getRecipeCost,
    getRecipeCounts,
    saveRecipe,
    deleteRecipe,
    startEditingRecipe,
    saveEditingRecipe,
    updateEditingIngredient,
    addEditingIngredient,
    removeEditingIngredient,
    exportRecipesCSV,
    getUniqueVendors,
    updateMasterIngredientCost,
    syncRecipeIngredientsFromMaster,
    units = ['oz', 'lb', 'each', 'bunch', 'cup', 'tbsp', 'tsp'],
    addUnit,
    duplicateRecipe
  } = props;

  const [showNewVendorInput, setShowNewVendorInput] = useState({});
  const [editShowNewVendorInput, setEditShowNewVendorInput] = useState({});
  const [showNewUnitInput, setShowNewUnitInput] = useState({});
  const [editShowNewUnitInput, setEditShowNewUnitInput] = useState({});

  const recipeCounts = getRecipeCounts();
  const uniqueVendors = getUniqueVendors ? getUniqueVendors() : [];


  // Count incomplete recipes
  const getIncompleteCount = () => {
    let count = 0;
    Object.values(recipes).forEach(categoryRecipes => {
      categoryRecipes.forEach(recipe => {
        if (isRecipeIncomplete(recipe)) count++;
      });
    });
    return count;
  };

  const incompleteCount = getIncompleteCount();

  const addIngredient = () => setNewRecipe({
    ...newRecipe,
    ingredients: [...newRecipe.ingredients, { ingredient_id: null, name: '', quantity: '', unit: 'oz', cost: '', source: '', section: 'Other' }]
  });

  const updateIngredient = (index, field, value) => {
    const updated = [...newRecipe.ingredients];
    updated[index][field] = value;

    // Auto-fill from master when ingredient name changes
    if (field === 'name' && value.length > 2) {
      const masterIng = findExactMatch(value);
      if (masterIng) {
        updated[index] = {
          ...updated[index],
          ingredient_id: masterIng.id, // Store master ingredient UUID
          name: value,
          cost: masterIng.cost || updated[index].cost,
          source: masterIng.source || updated[index].source,
          section: masterIng.section || updated[index].section,
          unit: masterIng.unit || updated[index].unit
        };
      } else {
        // Clear ingredient_id if name doesn't match master
        updated[index].ingredient_id = null;
      }
    }

    // Sync cost back to master when cost changes
    if (field === 'cost' && value && updated[index].name && updateMasterIngredientCost) {
      updateMasterIngredientCost(updated[index].name, value);
    }

    setNewRecipe({ ...newRecipe, ingredients: updated });
  };

  const removeIngredient = (index) => setNewRecipe({
    ...newRecipe,
    ingredients: newRecipe.ingredients.filter((_, i) => i !== index)
  });

  const autoFillIngredient = (index, masterIng) => {
    const updated = [...newRecipe.ingredients];
    updated[index] = {
      ...updated[index],
      ingredient_id: masterIng.id, // Store master ingredient UUID
      name: masterIng.name,
      cost: masterIng.cost,
      source: masterIng.source,
      section: masterIng.section,
      unit: masterIng.unit
    };
    setNewRecipe({ ...newRecipe, ingredients: updated });
  };

  // Handle sync button click
  const handleSync = () => {
    if (!syncRecipeIngredientsFromMaster) return;
    const result = syncRecipeIngredientsFromMaster();
    toast(`Sync complete: ${result.ingredientsAdded} ingredient(s) added, ${result.costsUpdated} cost(s) updated`, 'success');
  };

  // Vendor dropdown with "Add new" option
  const VendorSelect = ({ value, onChange, index, isEditing = false }) => {
    const showNew = isEditing ? editShowNewVendorInput[index] : showNewVendorInput[index];
    const setShowNew = isEditing
      ? (val) => setEditShowNewVendorInput(prev => ({ ...prev, [index]: val }))
      : (val) => setShowNewVendorInput(prev => ({ ...prev, [index]: val }));

    if (showNew) {
      return (
        <div className="flex gap-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="New vendor"
            className={isEditing ? "w-16 p-1 border rounded text-sm" : "w-20 p-2 border-2 rounded-lg"}
            style={isEditing ? {} : { borderColor: '#ebb582' }}
            autoFocus
          />
          <button
            onClick={() => setShowNew(false)}
            className="text-gray-500 hover:text-gray-700"
            type="button"
          >
            <X size={isEditing ? 14 : 16} />
          </button>
        </div>
      );
    }

    return (
      <select
        value={uniqueVendors.includes(value) ? value : ''}
        onChange={(e) => {
          if (e.target.value === '__new__') {
            setShowNew(true);
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
        className={isEditing ? "w-20 p-1 border rounded text-sm" : "w-24 p-2 border-2 rounded-lg"}
        style={isEditing ? {} : { borderColor: '#ebb582' }}
      >
        <option value="">Vendor</option>
        {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
        <option value="__new__">+ Add new...</option>
      </select>
    );
  };

  // Unit dropdown with "Add new" option
  const UnitSelect = ({ value, onChange, index, isEditing = false }) => {
    const showNew = isEditing ? editShowNewUnitInput[index] : showNewUnitInput[index];
    const setShowNew = isEditing
      ? (val) => setEditShowNewUnitInput(prev => ({ ...prev, [index]: val }))
      : (val) => setShowNewUnitInput(prev => ({ ...prev, [index]: val }));

    if (showNew) {
      return (
        <div className="flex gap-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              // Add the new unit when user leaves the field
              if (value && addUnit) {
                addUnit(value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (value && addUnit) {
                  addUnit(value);
                }
                setShowNew(false);
              }
            }}
            placeholder="New unit"
            className={isEditing ? "w-14 p-1 border rounded text-sm" : "w-16 p-2 border-2 rounded-lg"}
            style={isEditing ? {} : { borderColor: '#ebb582' }}
            autoFocus
          />
          <button
            onClick={() => {
              if (value && addUnit) {
                addUnit(value);
              }
              setShowNew(false);
            }}
            className="text-green-600 hover:text-green-700"
            type="button"
            title="Save unit"
          >
            <Check size={isEditing ? 14 : 16} />
          </button>
          <button
            onClick={() => {
              onChange('oz');
              setShowNew(false);
            }}
            className="text-gray-500 hover:text-gray-700"
            type="button"
            title="Cancel"
          >
            <X size={isEditing ? 14 : 16} />
          </button>
        </div>
      );
    }

    return (
      <select
        value={units.includes(value) ? value : (value || 'oz')}
        onChange={(e) => {
          if (e.target.value === '__new__') {
            setShowNew(true);
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
        className={isEditing ? "w-16 p-1 border rounded text-sm" : "w-20 p-2 border-2 rounded-lg"}
        style={isEditing ? {} : { borderColor: '#ebb582' }}
      >
        {units.map(u => <option key={u} value={u}>{u}</option>)}
        <option value="__new__">+ New...</option>
      </select>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#3d59ab' }}>Recipes</h2>
            <p className="text-sm">
              {incompleteCount > 0 ? (
                <span className="text-amber-600 font-medium">
                  <AlertTriangle size={14} className="inline mr-1" />
                  {incompleteCount} recipe{incompleteCount !== 1 ? 's' : ''} incomplete
                </span>
              ) : (
                <span className="text-green-600 font-medium">
                  <Check size={14} className="inline mr-1" />
                  All recipes complete
                </span>
              )}
              <span className="text-gray-500 ml-2">({recipeCounts.total} total)</span>
            </p>
          </div>
          <div className="flex gap-2">
            {syncRecipeIngredientsFromMaster && (
              <button
                onClick={handleSync}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-green-500 text-green-600 hover:bg-green-50"
              >
                <RefreshCw size={18} />Sync Ingredients
              </button>
            )}
            <button
              onClick={() => recipesFileRef.current.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2"
              style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
            >
              <Upload size={18} />Import
            </button>
            <button
              onClick={exportRecipesCSV}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: '#3d59ab' }}
            >
              <Download size={18} />Export
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <select
              value={newRecipe.category}
              onChange={(e) => setNewRecipe({ ...newRecipe, category: e.target.value })}
              className="p-2 border-2 rounded-lg"
              style={{ borderColor: '#ebb582' }}
            >
              {RECIPE_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
              ))}
            </select>
            <input
              type="text"
              value={newRecipe.name}
              onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })}
              placeholder="Recipe name"
              className="p-2 border-2 rounded-lg"
              style={{ borderColor: '#ebb582' }}
            />
          </div>
          <textarea
            value={newRecipe.instructions}
            onChange={(e) => setNewRecipe({ ...newRecipe, instructions: e.target.value })}
            placeholder="Cooking instructions..."
            className="w-full p-2 border-2 rounded-lg"
            style={{ borderColor: '#ebb582' }}
            rows="2"
          />
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#423d3c' }}>Ingredients</label>
            {newRecipe.ingredients.map((ing, index) => {
              const exactMatch = ing.name.length > 2 ? findExactMatch(ing.name) : null;
              const similarIngs = ing.name.length > 2 && !exactMatch ? findSimilarIngredients(ing.name) : [];
              // Check if ingredient has valid master ingredient_id (UUID format)
              const hasValidIngredientId = ing.ingredient_id && typeof ing.ingredient_id === 'string' && ing.ingredient_id.includes('-');
              const isInMasterList = hasValidIngredientId || exactMatch;
              const showNotInMasterWarning = ing.name.length > 2 && !isInMasterList && similarIngs.length === 0;
              return (
                <div key={index} className="mb-2">
                  <div className="flex flex-wrap gap-2 p-2 rounded" style={{ backgroundColor: showNotInMasterWarning ? '#fef2f2' : '#f9f9ed' }}>
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                      placeholder="Ingredient"
                      className="flex-1 min-w-[120px] p-2 border-2 rounded-lg"
                      style={{ borderColor: '#ebb582' }}
                      list={`ing-${index}`}
                    />
                    <datalist id={`ing-${index}`}>
                      {masterIngredients.map((mi, i) => <option key={i} value={mi.name} />)}
                    </datalist>
                    <input
                      type="text"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                      placeholder="Qty"
                      className="w-16 p-2 border-2 rounded-lg"
                      style={{ borderColor: '#ebb582' }}
                    />
                    <UnitSelect
                      value={ing.unit || 'oz'}
                      onChange={(val) => updateIngredient(index, 'unit', val)}
                      index={index}
                    />
                    <input
                      type="text"
                      value={ing.cost}
                      onChange={(e) => updateIngredient(index, 'cost', e.target.value)}
                      placeholder="$"
                      className="w-16 p-2 border-2 rounded-lg"
                      style={{ borderColor: '#ebb582' }}
                    />
                    <VendorSelect
                      value={ing.source}
                      onChange={(val) => updateIngredient(index, 'source', val)}
                      index={index}
                    />
                    <select
                      value={ing.section}
                      onChange={(e) => updateIngredient(index, 'section', e.target.value)}
                      className="w-28 p-2 border-2 rounded-lg"
                      style={{ borderColor: '#ebb582' }}
                    >
                      {STORE_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {newRecipe.ingredients.length > 1 && (
                      <button onClick={() => removeIngredient(index)} className="text-red-600 p-2">
                        <X size={20} />
                      </button>
                    )}
                  </div>
                  {exactMatch && (
                    <button
                      onClick={() => autoFillIngredient(index, exactMatch)}
                      className="mt-1 text-xs px-2 py-1 rounded bg-green-100 text-green-700"
                    >
                      Auto-fill "{exactMatch.name}"
                    </button>
                  )}
                  {similarIngs.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-xs text-orange-600">
                        <AlertCircle size={12} className="inline" /> Similar:
                      </span>
                      {similarIngs.slice(0, 3).map((si, i) => (
                        <button
                          key={i}
                          onClick={() => autoFillIngredient(index, si)}
                          className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700"
                        >
                          "{si.name}"
                        </button>
                      ))}
                    </div>
                  )}
                  {showNotInMasterWarning && (
                    <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} />
                      <span>Not in master list - add to Ingredients tab first</span>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={addIngredient}
              className="text-sm px-3 py-1 rounded"
              style={{ backgroundColor: '#ebb582' }}
            >
              + Add Ingredient
            </button>
          </div>
          <button
            onClick={() => {
              saveRecipe();
            }}
            className="px-6 py-2 rounded-lg text-white"
            style={{ backgroundColor: '#3d59ab' }}
          >
            <Save size={20} className="inline mr-2" />Save Recipe
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>Recipe Library</h2>
        {Object.entries(recipes).map(([category, items]) => items.length > 0 && (
          <div key={category} className="mb-6">
            <h3 className="text-lg font-bold capitalize mb-2" style={{ color: '#ebb582' }}>
              {category} ({items.length})
            </h3>
            <div className="space-y-2">
              {items.map((recipe, index) => {
                const cost = getRecipeCost(recipe);
                return (
                  <div key={index}>
                    {editingRecipe?.category === category && editingRecipe?.index === index ? (
                      <div className="p-4 rounded-lg border-2" style={{ borderColor: '#3d59ab', backgroundColor: '#f9f9ed' }}>
                        <input
                          type="text"
                          value={editingRecipe.recipe.name}
                          onChange={(e) => setEditingRecipe({
                            ...editingRecipe,
                            recipe: { ...editingRecipe.recipe, name: e.target.value }
                          })}
                          className="w-full p-2 border-2 rounded-lg mb-2 font-bold"
                          style={{ borderColor: '#ebb582' }}
                        />
                        <textarea
                          value={editingRecipe.recipe.instructions}
                          onChange={(e) => setEditingRecipe({
                            ...editingRecipe,
                            recipe: { ...editingRecipe.recipe, instructions: e.target.value }
                          })}
                          placeholder="Instructions..."
                          className="w-full p-2 border-2 rounded-lg mb-2"
                          style={{ borderColor: '#ebb582' }}
                          rows="2"
                        />
                        <p className="text-sm font-medium mb-2">Ingredients:</p>
                        {editingRecipe.recipe.ingredients.map((ing, ingIndex) => {
                          const masterIng = ing.name.length > 2 ? findExactMatch(ing.name) : null;
                          const hasValidIngredientId = ing.ingredient_id && typeof ing.ingredient_id === 'string' && ing.ingredient_id.includes('-');
                          const isInMasterList = hasValidIngredientId || masterIng;
                          const showNotInMasterWarning = ing.name.length > 2 && !isInMasterList;
                          return (
                            <div key={ingIndex} className="mb-2">
                              <div className={`flex flex-wrap gap-2 p-1 rounded ${showNotInMasterWarning ? 'bg-red-50' : ''}`}>
                                <input
                                  type="text"
                                  value={ing.name}
                                  onChange={(e) => {
                                    // updateEditingIngredient handles auto-fill including ingredient_id
                                    updateEditingIngredient(ingIndex, 'name', e.target.value);
                                  }}
                                  placeholder="Name"
                                  className="flex-1 min-w-[100px] p-1 border rounded text-sm"
                                  list={`edit-ing-${ingIndex}`}
                                />
                                <datalist id={`edit-ing-${ingIndex}`}>
                                  {masterIngredients.map((mi, i) => <option key={i} value={mi.name} />)}
                                </datalist>
                                <input
                                  type="text"
                                  value={ing.quantity}
                                  onChange={(e) => updateEditingIngredient(ingIndex, 'quantity', e.target.value)}
                                  placeholder="Qty"
                                  className="w-12 p-1 border rounded text-sm"
                                />
                                <UnitSelect
                                  value={ing.unit || 'oz'}
                                  onChange={(val) => updateEditingIngredient(ingIndex, 'unit', val)}
                                  index={ingIndex}
                                  isEditing={true}
                                />
                                <input
                                  type="text"
                                  value={ing.cost}
                                  onChange={(e) => {
                                    updateEditingIngredient(ingIndex, 'cost', e.target.value);
                                    // Sync cost back to master
                                    if (e.target.value && ing.name && updateMasterIngredientCost) {
                                      updateMasterIngredientCost(ing.name, e.target.value);
                                    }
                                  }}
                                  placeholder="$"
                                  className="w-12 p-1 border rounded text-sm"
                                />
                                <VendorSelect
                                  value={ing.source}
                                  onChange={(val) => updateEditingIngredient(ingIndex, 'source', val)}
                                  index={ingIndex}
                                  isEditing={true}
                                />
                                <select
                                  value={ing.section}
                                  onChange={(e) => updateEditingIngredient(ingIndex, 'section', e.target.value)}
                                  className="w-24 p-1 border rounded text-sm"
                                >
                                  {STORE_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <button onClick={() => removeEditingIngredient(ingIndex)} className="text-red-600">
                                  <X size={16} />
                                </button>
                              </div>
                              {masterIng && (
                                <div className="text-xs text-green-600 mt-1">
                                  {/* Debug: log if master match exists but ingredient_id is missing */}
                                  {!ing.ingredient_id && console.warn('[RecipesTab Edit] Master match found but ingredient_id missing:', { ingredient_name: ing.name, ingredient_id: ing.ingredient_id })}
                                  Master: ${masterIng.cost || '?'}/{masterIng.unit} • {masterIng.source || 'No vendor'} • {masterIng.section}
                                </div>
                              )}
                              {showNotInMasterWarning && (
                                <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                  <AlertCircle size={12} />
                                  <span>Not in master list - add to Ingredients tab first</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={addEditingIngredient}
                          className="text-sm px-2 py-1 rounded mb-2"
                          style={{ backgroundColor: '#ebb582' }}
                        >
                          + Add
                        </button>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => {
                              saveEditingRecipe();
                            }}
                            className="flex items-center gap-1 px-3 py-1 rounded text-white text-sm"
                            style={{ backgroundColor: '#3d59ab' }}
                          >
                            <Check size={16} />Save
                          </button>
                          <button
                            onClick={() => setEditingRecipe(null)}
                            className="px-3 py-1 rounded bg-gray-200 text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start p-3 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isRecipeIncomplete(recipe) && (
                              <AlertTriangle size={16} className="text-amber-500" title={`Incomplete: ${getIncompleteReasons(recipe)}`} />
                            )}
                            <p className="font-medium">{recipe.name}</p>
                            {cost > 0 && (
                              <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                                ${cost.toFixed(2)}/portion
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {recipe.ingredients?.map(i => `${i.name} (${i.quantity} ${i.unit || 'oz'})`).join(', ')}
                          </p>
                          {recipe.instructions && (
                            <p className="text-xs text-gray-500 mt-1">{recipe.instructions}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEditingRecipe(category, index)} className="text-blue-600" title="Edit">
                            <Edit2 size={18} />
                          </button>
                          {duplicateRecipe && (
                            <button onClick={() => duplicateRecipe(category, index)} className="text-green-600" title="Duplicate">
                              <Copy size={18} />
                            </button>
                          )}
                          <button onClick={() => deleteRecipe(category, index)} className="text-red-600" title="Delete">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {Object.values(recipes).flat().length === 0 && (
          <p className="text-gray-500">No recipes yet.</p>
        )}
      </div>
    </div>
  );
}

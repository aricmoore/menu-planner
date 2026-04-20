import React, { useRef, useState, useEffect } from 'react';
import { useNotification } from './components/NotificationContext';
import { Link, useNavigate } from 'react-router-dom';
import { ChefHat, Settings } from 'lucide-react';
import Papa from 'papaparse';
import Tabs from './components/Tabs';
import WorkflowStatus from './components/WorkflowStatus';
import WeekSelector from './components/WeekSelector';
import SyncStatus from './components/SyncStatus';
import { useAppData } from './hooks/useAppData';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './components/AuthContext';
// Direct imports to avoid barrel export initialization issues
import RecipesTab from './tabs/RecipesTab';
import KDSTab from './tabs/KDSTab';
import PrepTab from './tabs/PrepTab';
import DeliveriesTab from './tabs/DeliveriesTab';
import { getWeekId, getWeekIdFromDate } from './utils/weekUtils';
import {
  categorizeIngredient,
  exportClientsCSV,
  exportIngredientsCSV,
  exportRecipesCSV,
  parseClientsCSV,
  parseIngredientsCSV,
  parseRecipesCSV,
  downloadCSV
} from './utils';
import { DEFAULT_NEW_CLIENT, DEFAULT_NEW_RECIPE, DEFAULT_NEW_MENU_ITEM, DEFAULT_NEW_INGREDIENT } from './constants';
import { fetchKdsDishStatuses, setKdsDishDone, saveRecipeToSupabase, deleteRecipeFromSupabase, getUnapprovedMenuCountForWeek, approveAllMenusForWeek, fetchMenusByWeek, deleteClientFromSupabase } from './lib/database';
import { isSupabaseMode, getDataMode } from './lib/dataMode';
import { checkConnection, isConfigured } from './lib/supabase';

export default function App() {
  const { toast, confirm } = useNotification();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('kds');
  const {
    recipes, setRecipes,
    menuItems, setMenuItems,
    selectedClients, setSelectedClients,
    menuDate, setMenuDate,
    clients, setClients,
    newClient, setNewClient,
    newRecipe, setNewRecipe,
    newMenuItem, setNewMenuItem,
    masterIngredients, setMasterIngredients,
    newIngredient, setNewIngredient,
    editingRecipe, setEditingRecipe,
    editingIngredientId, setEditingIngredientId,
    editingIngredientData, setEditingIngredientData,
    duplicateWarnings, setDuplicateWarnings,
    completedDishes, setCompletedDishes,
    orderHistory, setOrderHistory,
    weeklyTasks, setWeeklyTasks,
    drivers, setDrivers,
    newDriver, setNewDriver,
    deliveryLog, setDeliveryLog,
    bagReminders, setBagReminders,
    readyForDelivery, setReadyForDelivery,
    clientPortalData, setClientPortalData,
    weeks, setWeeks,
    selectedWeekId, setSelectedWeekId,
    findSimilarIngredients,
    findExactMatch,
    addToMasterIngredients,
    updateMasterIngredientCost,
    syncRecipeIngredientsFromMaster,
    getUniqueVendors,
    mergeIngredients,
    scanForDuplicates,
    getRecipeCost,
    getRecipeCounts,
    getOrCreateWeek,
    getCurrentWeek,
    lockWeekAndSnapshot,
    unlockWeekById,
    updateWeekData,
    updateWeekKdsStatus,
    addReadyForDeliveryToWeek,
    addDeliveryLogToWeek,
    removeReadyForDeliveryFromWeek,
    isWeekReadOnly,
    getWeekIds,
    units, addUnit,
    // Sync state
    isOnline,
    isSyncing,
    lastSyncedAt,
    syncError,
    dataSource,
    isReadOnly,
    forceSync
  } = useAppData();

  const clientsFileRef = useRef();
  const recipesFileRef = useRef();
  const ingredientsFileRef = useRef();

  // KDS dish status state (persisted per week in Supabase)
  const [kdsDishStatuses, setKdsDishStatuses] = useState({});
  const [kdsStatusLoading, setKdsStatusLoading] = useState(false);

  // KDS loading/syncing state for visual feedback
  const [kdsLoading, setKdsLoading] = useState(true); // Initial load
  const [kdsLastRefresh, setKdsLastRefresh] = useState(null); // Timestamp of last successful fetch
  const [lastMenusApprovedAt, setLastMenusApprovedAt] = useState(null);

  // Unapproved menu warning state
  const [unapprovedMenuCount, setUnapprovedMenuCount] = useState(0);
  const [unapprovedByClient, setUnapprovedByClient] = useState({});

  // Listen for menu approval events (from MenuTab on /admin page)
  useEffect(() => {
    const handleMenusApproved = (e) => {
      const timestamp = e.detail?.timestamp || Date.now();
      setLastMenusApprovedAt(timestamp);
    };

    // Listen for custom event
    window.addEventListener('menusApproved', handleMenusApproved);

    return () => {
      window.removeEventListener('menusApproved', handleMenusApproved);
    };
  }, []);

  // Sync menuDate when selectedWeekId changes
  useEffect(() => {
    if (selectedWeekId) {
      // Set menuDate to the Monday of the selected week
      setMenuDate(selectedWeekId);
    }
  }, [selectedWeekId, setMenuDate]);

  // Fetch KDS dish statuses when week changes (Supabase mode)
  useEffect(() => {
    const loadKdsStatuses = async () => {
      if (!selectedWeekId) {
        setKdsLoading(false);
        return;
      }
      if (!isSupabaseMode()) {
        // In local mode, use completedDishes from useAppData
        setKdsLoading(false);
        setKdsLastRefresh(Date.now());
        return;
      }
      if (!isConfigured()) {
        setKdsLoading(false);
        return;
      }

      setKdsStatusLoading(true);
      setKdsLoading(true);
      try {
        const statuses = await fetchKdsDishStatuses(selectedWeekId);
        // Convert to completedDishes format: { dishName: true/false }
        const completed = {};
        Object.entries(statuses).forEach(([recipeName, status]) => {
          completed[recipeName] = status.done;
        });
        setKdsDishStatuses(statuses);
        setCompletedDishes(completed);
        setKdsLastRefresh(Date.now()); // Update last refresh timestamp
      } catch (err) {
        console.error('Failed to load KDS statuses:', err);
      }
      setKdsStatusLoading(false);
      setKdsLoading(false);
    };

    loadKdsStatuses();
  }, [selectedWeekId, setCompletedDishes]);

  // Fetch unapproved menu count for warning display
  useEffect(() => {
    const loadUnapprovedCount = async () => {
      if (!selectedWeekId || !isSupabaseMode() || !isConfigured()) {
        setUnapprovedMenuCount(0);
        setUnapprovedByClient({});
        return;
      }

      try {
        const result = await getUnapprovedMenuCountForWeek(selectedWeekId);
        setUnapprovedMenuCount(result.count);
        setUnapprovedByClient(result.byClient || {});
      } catch (err) {
        console.error('[APPROVAL WARNING] Failed to fetch unapproved count:', err);
      }
    };

    loadUnapprovedCount();
  }, [selectedWeekId, menuItems]); // Re-check when menuItems change (after approval)

  // Handle approve all menus from warning banner
  const handleApproveAllFromWarning = async () => {
    if (!selectedWeekId) return;

    try {
      await approveAllMenusForWeek(selectedWeekId);

      // Refetch menus to update UI
      const freshMenus = await fetchMenusByWeek(selectedWeekId, false);
      setMenuItems(freshMenus);

      // Clear the warning
      setUnapprovedMenuCount(0);
      setUnapprovedByClient({});

      // Dispatch event for other components
      window.dispatchEvent(new CustomEvent('menusApproved', { detail: { timestamp: Date.now() } }));
    } catch (err) {
      console.error('[APPROVAL WARNING] Failed to approve all:', err);
      toast('Failed to approve menus: ' + err.message, 'error');
    }
  };

  // CSV Import handlers
  const importClientsCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      parseClientsCSV(
        file,
        (imported) => {
          if (imported.length === 0) {
            toast('No subscriptions found in CSV. Check the file format.', 'error');
            return;
          }
          const totalContacts = imported.reduce((sum, sub) => sum + (sub.contacts?.length || 0), 0);
          setClients(imported);
          toast(`Import successful: ${imported.length} subscription(s), ${totalContacts} contact(s)`, 'success');
        },
        (err) => {
          console.error('CSV parse error:', err);
          toast('Error parsing CSV: ' + (err.message || err), 'error');
        }
      );
    } catch (err) {
      console.error('Import error:', err);
      toast('Error importing CSV: ' + err.message, 'error');
    }
    e.target.value = '';
  };

  const importIngredientsCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseIngredientsCSV(
      file,
      (imported) => {
        if (imported.length === 0) {
          toast('No ingredients found in CSV. Check the file format.', 'error');
          return;
        }
        setMasterIngredients(imported);
        toast(`Import successful: ${imported.length} ingredient(s)`, 'success');
      },
      (err) => toast('Error parsing CSV: ' + err.message, 'error')
    );
    e.target.value = '';
  };

  const importRecipesCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseRecipesCSV(
      file,
      (newRecipes, ingredientsToAdd) => {
        const recipeCount = Object.values(newRecipes).flat().length;
        if (recipeCount === 0) {
          toast('No recipes found in CSV. Check the file format.', 'error');
          return;
        }
        setRecipes(newRecipes);
        ingredientsToAdd.forEach(ing => addToMasterIngredients(ing));
        toast(`Import successful: ${recipeCount} recipe(s), ${ingredientsToAdd.length} ingredient(s) added`, 'success');
      },
      (err) => toast('Error parsing CSV: ' + err.message, 'error')
    );
    e.target.value = '';
  };

  // Helper to find duplicate ingredients (case-insensitive, trimmed)
  const findDuplicateIngredients = (ingredients) => {
    const seen = new Map();
    const duplicates = [];
    ingredients.forEach(ing => {
      const normalized = (ing.name || '').trim().toLowerCase();
      if (normalized && seen.has(normalized)) {
        if (!duplicates.includes(seen.get(normalized))) {
          duplicates.push(seen.get(normalized));
        }
      } else if (normalized) {
        seen.set(normalized, ing.name.trim());
      }
    });
    return duplicates;
  };

  // Recipe functions
  const saveRecipe = async () => {
    if (!newRecipe.name) { toast('Please enter a recipe name', 'warning'); return; }
    const validIngredients = newRecipe.ingredients.filter(ing => ing.name && ing.quantity);
    if (validIngredients.length === 0) { toast('Please add at least one ingredient with name and quantity', 'warning'); return; }

    // Check for duplicate ingredients
    const duplicates = findDuplicateIngredients(validIngredients);
    if (duplicates.length > 0) {
      toast(`Duplicate ingredient: ${duplicates.join(', ')}. Please combine or remove duplicates.`, 'warning');
      return;
    }

    validIngredients.forEach(ing => addToMasterIngredients(ing));

    const recipeToSave = {
      name: newRecipe.name,
      instructions: newRecipe.instructions,
      ingredients: validIngredients
    };

    if (isSupabaseMode()) {
      const result = await saveRecipeToSupabase(recipeToSave, newRecipe.category);
      if (result.success) {
        setRecipes(result.recipes);
        setNewRecipe(DEFAULT_NEW_RECIPE);
        toast('Recipe saved!', 'success');
      } else {
        toast(`Failed to save recipe: ${result.error}`, 'error');
      }
    } else {
      setRecipes({ ...recipes, [newRecipe.category]: [...recipes[newRecipe.category], recipeToSave] });
      setNewRecipe(DEFAULT_NEW_RECIPE);
      toast('Recipe saved (local only)!', 'success');
    }
  };

  const deleteRecipe = async (category, index) => {
    if (!(await confirm('Delete this recipe?'))) return;

    const recipe = recipes[category][index];

    if (isSupabaseMode()) {
      const result = await deleteRecipeFromSupabase(recipe.name, category);
      if (result.success) {
        setRecipes(result.recipes);
      } else {
        toast(`Failed to delete recipe: ${result.error}`, 'error');
      }
    } else {
      setRecipes({ ...recipes, [category]: recipes[category].filter((_, i) => i !== index) });
    }
  };

  const duplicateRecipe = (category, index) => {
    const recipe = recipes[category][index];
    const duplicated = {
      ...recipe,
      name: `${recipe.name} (Copy)`,
      ingredients: recipe.ingredients.map(ing => ({ ...ing })) // Deep copy ingredients
    };
    setRecipes({ ...recipes, [category]: [...recipes[category], duplicated] });
  };

  const startEditingRecipe = (category, index) => {
    const recipe = recipes[category][index];

    // Backfill ingredient_id from master list if missing but name matches
    const ingredientsWithIds = recipe.ingredients.map(ing => {
      let ingredientId = ing.ingredient_id || ing.id || null;

      // If no valid ingredient_id but name exists, try to find in master list
      if (!ingredientId && ing.name) {
        const normalizedName = (ing.name || '').trim().toLowerCase();
        const masterMatch = masterIngredients.find(m =>
          (m.name || '').trim().toLowerCase() === normalizedName
        );
        if (masterMatch && masterMatch.id) {
          ingredientId = masterMatch.id;
        }
      }

      return {
        ingredient_id: ingredientId,
        name: ing.name || '',
        quantity: ing.quantity || '',
        unit: ing.unit || 'oz',
        cost: ing.cost || '',
        source: ing.source || '',
        section: ing.section || 'Other'
      };
    });

    setEditingRecipe({
      category,
      index,
      recipe: {
        ...recipe,
        ingredients: ingredientsWithIds
      }
    });
  };

  const updateEditingIngredient = (index, field, value) => {
    const updated = [...editingRecipe.recipe.ingredients];
    updated[index][field] = value;

    // Auto-fill ingredient_id from master when name changes and matches
    if (field === 'name' && value.length > 2) {
      const masterIng = findExactMatch(value);
      if (masterIng && masterIng.id) {
        updated[index] = {
          ...updated[index],
          ingredient_id: masterIng.id, // Store master ingredient UUID
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

    setEditingRecipe({ ...editingRecipe, recipe: { ...editingRecipe.recipe, ingredients: updated } });
  };

  const addEditingIngredient = () => {
    setEditingRecipe({
      ...editingRecipe,
      recipe: {
        ...editingRecipe.recipe,
        ingredients: [...editingRecipe.recipe.ingredients, { ingredient_id: null, name: '', quantity: '', unit: 'oz', cost: '', source: '', section: 'Other' }]
      }
    });
  };

  const removeEditingIngredient = (index) => {
    setEditingRecipe({
      ...editingRecipe,
      recipe: {
        ...editingRecipe.recipe,
        ingredients: editingRecipe.recipe.ingredients.filter((_, i) => i !== index)
      }
    });
  };

  const saveEditingRecipe = async () => {
    const { category, index, recipe } = editingRecipe;
    const validIngredients = recipe.ingredients.filter(ing => ing.name && ing.quantity);

    // Check for duplicate ingredients
    const duplicates = findDuplicateIngredients(validIngredients);
    if (duplicates.length > 0) {
      toast(`Duplicate ingredient: ${duplicates.join(', ')}. Please combine or remove duplicates.`, 'warning');
      return;
    }

    validIngredients.forEach(ing => addToMasterIngredients(ing));

    const recipeToSave = { ...recipe, ingredients: validIngredients };

    if (isSupabaseMode()) {
      const result = await saveRecipeToSupabase(recipeToSave, category);
      if (result.success) {
        setRecipes(result.recipes);
        setEditingRecipe(null);
        toast('Recipe updated!', 'success');
      } else {
        toast(`Failed to update recipe: ${result.error}`, 'error');
      }
    } else {
      const updatedRecipes = { ...recipes };
      updatedRecipes[category][index] = recipeToSave;
      setRecipes(updatedRecipes);
      setEditingRecipe(null);
      toast('Recipe updated (local only)!', 'success');
    }
  };

  // Menu functions
  const addMenuItem = () => {
    if (!newMenuItem.protein && !newMenuItem.veg && !newMenuItem.starch && newMenuItem.extras.length === 0) {
      toast('Please select at least one dish', 'warning');
      return;
    }
    if (selectedClients.length === 0) {
      toast('Please select at least one client', 'warning');
      return;
    }
    const newItems = selectedClients.map(clientName => {
      const client = clients.find(c => c.name === clientName);
      if (!client?.id) {
        console.error('[addMenuItem] Client missing id:', { clientName, client });
        toast(`Cannot add menu for ${clientName}: client data is missing`, 'error');
        return null;
      }
      const clientPortions = client.portions || client.persons || 1;
      return {
        ...newMenuItem,
        clientId: client.id,      // REQUIRED: client UUID for database
        clientName: client.name,  // Use canonical name from client object
        date: menuDate,
        portions: clientPortions,
        id: Date.now() + Math.random(),
        approved: false
      };
    }).filter(Boolean); // Remove any null entries from failed lookups
    if (newItems.length > 0) {
      setMenuItems(prev => [...prev, ...newItems]);
    }
    setNewMenuItem(DEFAULT_NEW_MENU_ITEM);
  };

  const deleteMenuItem = (id) => setMenuItems(menuItems.filter(item => item.id !== id));

  const clearMenu = async () => {
    if (await confirm('Clear all menu items?')) {
      setMenuItems([]);
      setSelectedClients([]);
      setCompletedDishes({});
    }
  };

  const getOrdersByClient = () => {
    const grouped = {};
    menuItems.forEach(item => {
      if (!grouped[item.clientName]) grouped[item.clientName] = [];
      grouped[item.clientName].push(item);
    });
    return grouped;
  };

  // KDS functions - only show approved menus for selected week
  const getApprovedMenuItems = () => {
    return menuItems.filter(item => item.approved);
  };

  // Week-related helpers (moved here to be available for KDS functions)
  const currentWeek = weeks[selectedWeekId] || null;

  // Get data for selected week (from week record if locked, otherwise from global state)
  const getWeekMenuItems = () => {
    if (currentWeek?.status === 'locked' && currentWeek.snapshot?.menu) {
      // Reconstruct menu items from snapshot
      const items = [];
      Object.entries(currentWeek.snapshot.menu).forEach(([clientName, clientItems]) => {
        clientItems.forEach(item => {
          items.push({ ...item, clientName, approved: true });
        });
      });
      return items;
    }
    // Filter global menuItems to selected week — prefer stored week_id over date computation
    return menuItems.filter(item => {
      const storedWeekId = item.week_id || item.weekId;
      if (storedWeekId) return storedWeekId === selectedWeekId;
      return item.date ? getWeekIdFromDate(item.date) === selectedWeekId : false;
    });
  };

  // Get approved menu items filtered to selected week
  const getWeekApprovedMenuItems = () => {
    const weekItems = getWeekMenuItems();
    const approved = weekItems.filter(item => item.approved);
    return approved;
  };

  // Get production day from delivery date (Thursday = Thursday production, else Mon/Tue production)
  const getProductionDay = (dateStr) => {
    if (!dateStr) return 'monTue';
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();
    // Thursday = 4
    return dayOfWeek === 4 ? 'thursday' : 'monTue';
  };

  const getKDSView = () => {
    // Returns { monTue: { protein: {...}, veg: {...}, ... }, thursday: { protein: {...}, ... } }
    const kds = {
      monTue: { protein: {}, veg: {}, starch: {}, extras: {} },
      thursday: { protein: {}, veg: {}, starch: {}, extras: {} }
    };

    const approvedItems = getWeekApprovedMenuItems();

    approvedItems.forEach(item => {
      const productionDay = getProductionDay(item.date);

      ['protein', 'veg', 'starch'].forEach(type => {
        if (item[type]) {
          if (!kds[productionDay][type][item[type]]) {
            kds[productionDay][type][item[type]] = { totalPortions: 0, category: type, clients: [] };
          }
          kds[productionDay][type][item[type]].totalPortions += item.portions;
          kds[productionDay][type][item[type]].clients.push({ name: item.clientName, portions: item.portions, date: item.date });
        }
      });

      if (item.extras) {
        item.extras.forEach(extra => {
          const category = recipes.sauces?.find(r => r.name === extra) ? 'sauces'
            : recipes.breakfast?.find(r => r.name === extra) ? 'breakfast' : 'soups';
          if (!kds[productionDay].extras[extra]) {
            kds[productionDay].extras[extra] = { totalPortions: 0, category, clients: [] };
          }
          kds[productionDay].extras[extra].totalPortions += item.portions;
          kds[productionDay].extras[extra].clients.push({ name: item.clientName, portions: item.portions, date: item.date });
        });
      }
    });

    return kds;
  };

  const toggleDishComplete = async (dishName, recipeType = null) => {
    const newDoneState = !completedDishes[dishName];

    // In Supabase mode, persist to database
    if (isSupabaseMode()) {
      // Check if online first
      if (!isConfigured()) {
        toast('Cannot mark complete: database not configured', 'error');
        return;
      }

      const isOnlineNow = await checkConnection();
      if (!isOnlineNow) {
        toast('Cannot mark complete: database offline', 'error');
        return;
      }

      const result = await setKdsDishDone({
        week_id: selectedWeekId,
        recipe_name: dishName,
        recipe_type: recipeType,
        done: newDoneState
      });

      if (!result.success) {
        toast(`Cannot mark complete: ${result.error}`, 'error');
        return;
      }

      // Update local status map
      setKdsDishStatuses(prev => ({
        ...prev,
        [dishName]: {
          done: newDoneState,
          done_at: newDoneState ? new Date().toISOString() : null,
          recipe_type: recipeType
        }
      }));
    }

    // Update completedDishes state (both modes)
    setCompletedDishes(prev => ({ ...prev, [dishName]: newDoneState }));
  };

  const allDishesComplete = () => {
    const kds = getKDSView();
    const allDishNames = [];

    // Collect all dish names from both production days
    ['monTue', 'thursday'].forEach(prodDay => {
      ['protein', 'veg', 'starch', 'extras'].forEach(category => {
        Object.keys(kds[prodDay][category]).forEach(dishName => {
          allDishNames.push(dishName);
        });
      });
    });

    return allDishNames.length > 0 && allDishNames.every(name => completedDishes[name]);
  };

  const completeAllOrders = async () => {
    if (!(await confirm('Mark all orders complete and move to Ready for Delivery?'))) return;
    const ordersByClient = getOrdersByClient();
    const newReadyEntries = [];

    Object.entries(ordersByClient).forEach(([clientName, orders]) => {
      orders.forEach(order => {
        const dishes = [order.protein, order.veg, order.starch, ...(order.extras || [])].filter(Boolean);
        let totalCost = 0;
        dishes.forEach(dishName => {
          const category = ['protein', 'veg', 'starch', 'sauces', 'breakfast', 'soups'].find(cat => recipes[cat]?.find(r => r.name === dishName));
          const recipe = category ? recipes[category].find(r => r.name === dishName) : null;
          if (recipe) totalCost += getRecipeCost(recipe) * order.portions;
        });
        newReadyEntries.push({
          id: Date.now() + Math.random(),
          clientName,
          date: order.date || menuDate,
          dishes,
          portions: order.portions,
          cost: totalCost
        });
      });
    });

    // Group entries by week and add to respective weeks
    const entriesByWeek = {};
    newReadyEntries.forEach(entry => {
      const weekId = getWeekIdFromDate(entry.date);
      if (!entriesByWeek[weekId]) entriesByWeek[weekId] = [];
      entriesByWeek[weekId].push(entry);
    });

    // Add to week records
    Object.entries(entriesByWeek).forEach(([weekId, entries]) => {
      addReadyForDeliveryToWeek(weekId, entries);
    });

    // Also keep in global state for backwards compatibility
    setReadyForDelivery(prev => [...prev, ...newReadyEntries]);
    setMenuItems([]);
    setCompletedDishes({});
    setSelectedClients([]);
    toast('Orders ready for delivery!', 'success');
  };

  // Shopping list - grouped by shopping day based on client delivery days
  // Monday deliveries → Sunday shopping list
  // Tuesday deliveries → Tuesday shopping list
  // Thursday deliveries → Thursday shopping list
  const getShoppingListsByDay = () => {
    const shoppingLists = {
      Sunday: {},    // For Monday deliveries
      Tuesday: {},   // For Tuesday deliveries
      Thursday: {}   // For Thursday deliveries
    };

    const approvedItems = getWeekApprovedMenuItems();

    // Helper to normalize ingredient names for consolidation
    const normalizeIngredientName = (name) => {
      return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    };

    approvedItems.forEach(item => {
      // Find the client to get their delivery day
      const client = clients.find(c => c.name === item.clientName || c.displayName === item.clientName);
      const deliveryDay = client?.deliveryDay || '';

      // Determine shopping day based on delivery day
      let shopDay = 'Sunday'; // Default for Monday
      if (deliveryDay === 'Tuesday') {
        shopDay = 'Tuesday';
      } else if (deliveryDay === 'Thursday') {
        shopDay = 'Thursday';
      }

      // Get all dishes from this menu item
      const dishes = [item.protein, item.veg, item.starch, ...(item.extras || [])].filter(Boolean);

      dishes.forEach(dishName => {
        // Find the recipe
        const category = ['protein', 'veg', 'starch', 'sauces', 'breakfast', 'soups'].find(
          cat => recipes[cat]?.find(r => r.name === dishName)
        );
        const recipe = category ? recipes[category].find(r => r.name === dishName) : null;

        if (recipe?.ingredients) {
          recipe.ingredients.forEach(ing => {
            const masterIng = findExactMatch(ing.name);
            // Normalize unit for proper consolidation
            const unit = (ing.unit || 'oz').toLowerCase().trim();

            // FIXED: Use master ingredient ID as fallback when recipe ingredient_id is missing
            // Priority: ing.ingredient_id > masterIng.id > normalized name
            const ingredientKey = ing.ingredient_id
              ? String(ing.ingredient_id)
              : (masterIng?.id ? String(masterIng.id) : normalizeIngredientName(ing.name));
            const key = `${ingredientKey}|${unit}`;

            const portionMultiplier = item.portions || 1;
            const ingQuantity = parseFloat(ing.quantity || 0) * portionMultiplier;
            const unitCost = parseFloat(masterIng?.cost || ing.cost || 0);
            const ingCost = ingQuantity * unitCost;

            // Resolve the best ingredient_id to store
            const resolvedIngredientId = ing.ingredient_id || masterIng?.id || null;

            if (!shoppingLists[shopDay][key]) {
              shoppingLists[shopDay][key] = {
                name: ing.name.trim(), // Keep original display name (first occurrence)
                ingredient_id: resolvedIngredientId,
                quantity: 0,
                unit: unit,
                section: ing.section || masterIng?.section || categorizeIngredient(ing.name),
                cost: 0, // Will sum costs
                unitCost: unitCost, // Store for reference
                source: masterIng?.source || ing.source || '',
                recipes: [] // Track which recipes use this ingredient
              };
            }
            // Sum quantities and costs
            shoppingLists[shopDay][key].quantity += ingQuantity;
            shoppingLists[shopDay][key].cost += ingCost;
            // Track which recipes use this ingredient
            if (!shoppingLists[shopDay][key].recipes.includes(dishName)) {
              shoppingLists[shopDay][key].recipes.push(dishName);
            }
          });
        }
      });
    });

    // Convert to sorted arrays
    const sortIngredients = (ingredients) => {
      return Object.values(ingredients).sort((a, b) => {
        const sourceCompare = (a.source || 'ZZZ').localeCompare(b.source || 'ZZZ');
        if (sourceCompare !== 0) return sourceCompare;
        const sectionCompare = (a.section || 'ZZZ').localeCompare(b.section || 'ZZZ');
        if (sectionCompare !== 0) return sectionCompare;
        return a.name.localeCompare(b.name);
      });
    };

    return {
      Sunday: sortIngredients(shoppingLists.Sunday),
      Tuesday: sortIngredients(shoppingLists.Tuesday),
      Thursday: sortIngredients(shoppingLists.Thursday)
    };
  };

  // Week-view shopping list - aggregates ALL ingredients into one list (no day split)
  // Used for export and week-level shopping view
  const getShoppingListForWeek = () => {
    const shoppingList = {};
    const approvedItems = getWeekApprovedMenuItems();

    // Helper to normalize ingredient names for consolidation
    const normalizeIngredientName = (name) => {
      return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    };

    approvedItems.forEach(item => {
      // Get all dishes from this menu item
      const dishes = [item.protein, item.veg, item.starch, ...(item.extras || [])].filter(Boolean);

      dishes.forEach(dishName => {
        // Find the recipe
        const category = ['protein', 'veg', 'starch', 'sauces', 'breakfast', 'soups'].find(
          cat => recipes[cat]?.find(r => r.name === dishName)
        );
        const recipe = category ? recipes[category].find(r => r.name === dishName) : null;

        if (recipe?.ingredients) {
          recipe.ingredients.forEach(ing => {
            const masterIng = findExactMatch(ing.name);
            // Normalize unit for proper consolidation
            const unit = (ing.unit || 'oz').toLowerCase().trim();

            // FIXED: Use master ingredient ID as fallback when recipe ingredient_id is missing
            // Priority: ing.ingredient_id > masterIng.id > normalized name
            const ingredientKey = ing.ingredient_id
              ? String(ing.ingredient_id)
              : (masterIng?.id ? String(masterIng.id) : normalizeIngredientName(ing.name));
            const key = `${ingredientKey}|${unit}`;

            const portionMultiplier = item.portions || 1;
            const ingQuantity = parseFloat(ing.quantity || 0) * portionMultiplier;
            const unitCost = parseFloat(masterIng?.cost || ing.cost || 0);
            const ingCost = ingQuantity * unitCost;

            // Resolve the best ingredient_id to store
            const resolvedIngredientId = ing.ingredient_id || masterIng?.id || null;

            if (!shoppingList[key]) {
              shoppingList[key] = {
                name: ing.name.trim(),
                ingredient_id: resolvedIngredientId,
                quantity: 0,
                unit: unit,
                section: ing.section || masterIng?.section || categorizeIngredient(ing.name),
                cost: 0,
                unitCost: unitCost,
                source: masterIng?.source || ing.source || '',
                recipes: []
              };
            }
            // Sum quantities and costs
            shoppingList[key].quantity += ingQuantity;
            shoppingList[key].cost += ingCost;
            // Track which recipes use this ingredient
            if (!shoppingList[key].recipes.includes(dishName)) {
              shoppingList[key].recipes.push(dishName);
            }
          });
        }
      });
    });

    const result = Object.values(shoppingList).sort((a, b) => {
      const sourceCompare = (a.source || 'ZZZ').localeCompare(b.source || 'ZZZ');
      if (sourceCompare !== 0) return sourceCompare;
      const sectionCompare = (a.section || 'ZZZ').localeCompare(b.section || 'ZZZ');
      if (sectionCompare !== 0) return sectionCompare;
      return a.name.localeCompare(b.name);
    });

    return result;
  };

  // Legacy prep list (all items combined) - kept for backwards compatibility
  const getPrepList = () => {
    const lists = getShoppingListsByDay();
    return [...lists.Sunday, ...lists.Tuesday, ...lists.Thursday];
  };

  // Export uses WEEK aggregation (no duplicates across days)
  const exportPrepList = () => {
    const prepList = getShoppingListForWeek();
    downloadCSV(Papa.unparse(prepList.map(item => ({
      Source: item.source,
      Section: item.section,
      Ingredient: item.name,
      Quantity: item.quantity.toFixed(2),
      Unit: item.unit
    })), { columns: ['Source', 'Section', 'Ingredient', 'Quantity', 'Unit'] }), 'shopping-list.csv');
  };

  // History
  const getHistoryByClient = () => {
    const grouped = {};
    orderHistory.forEach(order => {
      if (!grouped[order.clientName]) grouped[order.clientName] = [];
      grouped[order.clientName].push(order);
    });
    Object.keys(grouped).forEach(client => {
      grouped[client].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    return grouped;
  };

  // Client functions
  const addClient = () => {
    if (!newClient.name) { toast('Please enter a client name', 'warning'); return; }
    setClients([...clients, { ...newClient }]);
    setNewClient(DEFAULT_NEW_CLIENT);
    toast('Client added!', 'success');
  };

  const deleteClient = async (index) => {
    const client = clients[index];
    if (!client) return;
    const clientLabel = client.displayName || client.name || 'this client';
    if (!(await confirm(`Delete ${clientLabel}? This will permanently remove their menus, tasks, and billing records.`))) return;

    if (isSupabaseMode() && client.id) {
      const result = await deleteClientFromSupabase(client.id, client.name);
      if (result.success) {
        setClients(result.clients);
      } else {
        toast(`Delete failed: ${result.error}`, 'error');
      }
    } else {
      setClients(clients.filter((_, i) => i !== index));
    }
  };

  // Ingredient functions
  const addMasterIngredient = async () => {
    if (!newIngredient.name) { toast('Please enter an ingredient name', 'warning'); return; }
    const similar = findSimilarIngredients(newIngredient.name);
    const exact = findExactMatch(newIngredient.name);
    if (exact) { toast(`"${newIngredient.name}" already exists as "${exact.name}"`, 'warning'); return; }
    if (similar.length > 0 && !(await confirm(`Similar ingredients found: ${similar.map(s => s.name).join(', ')}\n\nAdd "${newIngredient.name}" anyway?`))) return;
    setMasterIngredients([...masterIngredients, { ...newIngredient, id: Date.now() }]);
    setNewIngredient(DEFAULT_NEW_INGREDIENT);
    toast('Ingredient added!', 'success');
  };

  const deleteMasterIngredient = async (id) => {
    if (await confirm('Delete this ingredient?')) {
      setMasterIngredients(masterIngredients.filter(ing => ing.id !== id));
    }
  };

  const startEditingMasterIngredient = (ing) => {
    setEditingIngredientId(ing.id);
    setEditingIngredientData({ ...ing });
  };

  const saveEditingMasterIngredient = () => {
    setMasterIngredients(prev => prev.map(ing => ing.id === editingIngredientId ? { ...editingIngredientData } : ing));
    setEditingIngredientId(null);
    setEditingIngredientData(null);
  };

  const cancelEditingMasterIngredient = () => {
    setEditingIngredientId(null);
    setEditingIngredientData(null);
  };

  const prepList = getPrepList();

  // Additional week-related helpers
  const isCurrentWeekReadOnly = isWeekReadOnly(selectedWeekId);

  // Driver routes are now saved directly to Supabase by DeliveriesTab
  // This function is kept for backward compatibility but is a no-op
  const saveDriverRoutes = (routes) => {
    // Routes are saved to Supabase directly, no localStorage needed
  };

  const getWeekReadyForDelivery = () => {
    if (currentWeek?.readyForDelivery?.length > 0) {
      return currentWeek.readyForDelivery;
    }
    // Filter global readyForDelivery to selected week
    return readyForDelivery.filter(order => getWeekIdFromDate(order.date) === selectedWeekId);
  };

  const getWeekDeliveryLog = () => {
    if (currentWeek?.deliveryLog?.length > 0) {
      return currentWeek.deliveryLog;
    }
    // Filter global deliveryLog to selected week
    return deliveryLog.filter(entry => getWeekIdFromDate(entry.date) === selectedWeekId);
  };

  const getWeekKdsStatus = () => {
    return currentWeek?.kdsStatus || {};
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f9f9ed' }}>
      <input type="file" ref={clientsFileRef} onChange={importClientsCSV} accept=".csv" className="hidden" />
      <input type="file" ref={recipesFileRef} onChange={importRecipesCSV} accept=".csv" className="hidden" />
      <input type="file" ref={ingredientsFileRef} onChange={importIngredientsCSV} accept=".csv" className="hidden" />

      <header className="text-white p-4" style={{ backgroundColor: '#3d59ab' }}>
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <ChefHat size={32} style={{ color: '#ffd700' }} />
            <h1 className="text-2xl font-bold">Goldfinch Chef</h1>
          </div>
          <div className="flex items-center gap-3">
            <SyncStatus
              isOnline={isOnline}
              isSyncing={isSyncing}
              lastSyncedAt={lastSyncedAt}
              syncError={syncError}
              dataSource={dataSource}
              isReadOnly={isReadOnly}
              onForceSync={forceSync}
            />
            <Link
              to="/admin"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              <Settings size={20} />
              Admin
            </Link>
            {isConfigured() && (
              <button
                onClick={async () => { await signOut(); navigate('/login'); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-sm"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="bg-white shadow-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex overflow-x-auto">
          <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {['kds', 'deliveries'].includes(activeTab) && (
          <WeekSelector
            selectedWeekId={selectedWeekId}
            setSelectedWeekId={setSelectedWeekId}
            weeks={weeks}
            onLockWeek={lockWeekAndSnapshot}
            onUnlockWeek={unlockWeekById}
          />
        )}

        {['kds', 'deliveries'].includes(activeTab) && (
          <WorkflowStatus
            menuItems={getWeekMenuItems()}
            completedDishes={getWeekKdsStatus()}
            readyForDelivery={getWeekReadyForDelivery()}
            deliveryLog={getWeekDeliveryLog()}
            orderHistory={orderHistory}
            selectedDate={menuDate}
            onNavigate={setActiveTab}
          />
        )}

        {activeTab === 'recipes' && (
          <ErrorBoundary inline label="Recipes">
            <RecipesTab
              recipes={recipes}
              newRecipe={newRecipe}
              setNewRecipe={setNewRecipe}
              editingRecipe={editingRecipe}
              setEditingRecipe={setEditingRecipe}
              masterIngredients={masterIngredients}
              recipesFileRef={recipesFileRef}
              findExactMatch={findExactMatch}
              findSimilarIngredients={findSimilarIngredients}
              getRecipeCost={getRecipeCost}
              getRecipeCounts={getRecipeCounts}
              saveRecipe={saveRecipe}
              deleteRecipe={deleteRecipe}
              startEditingRecipe={startEditingRecipe}
              saveEditingRecipe={saveEditingRecipe}
              updateEditingIngredient={updateEditingIngredient}
              addEditingIngredient={addEditingIngredient}
              removeEditingIngredient={removeEditingIngredient}
              exportRecipesCSV={() => exportRecipesCSV(recipes)}
              getUniqueVendors={getUniqueVendors}
              updateMasterIngredientCost={updateMasterIngredientCost}
              syncRecipeIngredientsFromMaster={syncRecipeIngredientsFromMaster}
              units={units}
              addUnit={addUnit}
              duplicateRecipe={duplicateRecipe}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'kds' && (
          <ErrorBoundary inline label="Kitchen Display">
            <KDSTab
              menuItems={getApprovedMenuItems()}
              recipes={recipes}
              completedDishes={completedDishes}
              toggleDishComplete={toggleDishComplete}
              allDishesComplete={allDishesComplete}
              completeAllOrders={completeAllOrders}
              getKDSView={getKDSView}
              selectedWeekId={selectedWeekId}
              currentWeek={currentWeek}
              kdsLoading={kdsLoading}
              kdsLastRefresh={kdsLastRefresh}
              lastMenusApprovedAt={lastMenusApprovedAt}
              isSyncing={isSyncing}
              unapprovedMenuCount={unapprovedMenuCount}
              unapprovedByClient={unapprovedByClient}
              onApproveAll={handleApproveAllFromWarning}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'prep' && (
          <ErrorBoundary inline label="Prep">
            <PrepTab
              prepList={prepList}
              shoppingListsByDay={getShoppingListsByDay()}
              exportPrepList={exportPrepList}
              selectedWeekId={selectedWeekId}
              unapprovedMenuCount={unapprovedMenuCount}
              unapprovedByClient={unapprovedByClient}
            />
          </ErrorBoundary>
        )}

        {activeTab === 'deliveries' && (
          <ErrorBoundary inline label="Deliveries">
            <DeliveriesTab
              clients={clients}
              drivers={drivers}
              setDrivers={setDrivers}
              newDriver={newDriver}
              setNewDriver={setNewDriver}
              deliveryLog={getWeekDeliveryLog()}
              setDeliveryLog={setDeliveryLog}
              bagReminders={bagReminders}
              setBagReminders={setBagReminders}
              readyForDelivery={getWeekReadyForDelivery()}
              setReadyForDelivery={setReadyForDelivery}
              orderHistory={orderHistory}
              setOrderHistory={setOrderHistory}
              selectedWeekId={selectedWeekId}
              weeks={weeks}
              addDeliveryLogToWeek={addDeliveryLogToWeek}
              removeReadyForDeliveryFromWeek={removeReadyForDeliveryFromWeek}
              isReadOnly={isCurrentWeekReadOnly}
              menuItems={getWeekMenuItems()}
              clientPortalData={clientPortalData}
              saveDriverRoutes={saveDriverRoutes}
              unapprovedMenuCount={unapprovedMenuCount}
              unapprovedByClient={unapprovedByClient}
              onApproveAll={handleApproveAllFromWarning}
            />
          </ErrorBoundary>
        )}

      </div>
    </div>
  );
}

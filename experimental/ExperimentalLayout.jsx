/**
 * ExperimentalLayout.jsx
 *
 * Layout shell for experimental route-based navigation.
 * Single owner of useAppData state, provides context to child pages via Outlet.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNotification } from '../components/NotificationContext';
import { Outlet, Link } from 'react-router-dom';
import { ChefHat, ChevronLeft, ChevronRight, Settings } from 'lucide-react';

// Production data hook
import { useAppData } from '../hooks/useAppData';

// Experimental navigation components
import TopNav from './TopNav';
import SubNav from './SubNav';
import ExperimentalContext from './ExperimentalContext';

// Production utilities
import { getWeekId, getWeekIdFromDate, getWeekStartDate, getWeekEndDate, formatWeekRange, getAdjacentWeekId } from '../utils/weekUtils';
import { DEFAULT_NEW_RECIPE, DEFAULT_NEW_INGREDIENT } from '../constants';
import { exportRecipesCSV, exportIngredientsCSV, categorizeIngredient } from '../utils';
import { isSupabaseMode } from '../lib/dataMode';
import {
  saveRecipeToSupabase,
  deleteRecipeFromSupabase,
  setKdsDishDone,
  fetchBillingCycles,
  fetchApprovedMenusForBilling,
  updateBillingCycleInvoice,
  fetchMenusForWeekRange,
  fetchClientWeekStatuses,
  upsertClientWeekStatus,
  deleteClientWeekStatus,
  confirmClientWeek,
  deleteMenusForClientWeek
} from '../lib/database';
import { isConfigured, checkConnection } from '../lib/supabase';

// Grocery invoice configuration
const GROCERY_MARKUP_PERCENT = 15;

export default function ExperimentalLayout() {
  const { toast, confirm } = useNotification();
  // Production data hook - single source of truth
  const appData = useAppData();
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
    orderHistory,
    weeks,
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
    units, addUnit
  } = appData;

  // Local state for experimental TimelineView (delivery schedule)
  const [deliverySchedule, setDeliverySchedule] = useState({});

  // KDS state
  const [kdsLoading, setKdsLoading] = useState(false);
  const [kdsLastRefresh, setKdsLastRefresh] = useState(null);
  const [lastMenusApprovedAt, setLastMenusApprovedAt] = useState(null);
  const [unapprovedMenuCount, setUnapprovedMenuCount] = useState(0);
  const [unapprovedByClient, setUnapprovedByClient] = useState({});

  // Grocery invoice state
  const [groceryInvoices, setGroceryInvoices] = useState([]);

  // Billing cycle state - start loading=true to prevent empty flash
  const [billingCycles, setBillingCycles] = useState([]);
  const [billingCyclesLoading, setBillingCyclesLoading] = useState(true);
  const [billingCyclesError, setBillingCyclesError] = useState(null);

  // Schedule menus state (for TimelineView)
  const [scheduleMenus, setScheduleMenus] = useState([]);
  const [scheduleMenusLoading, setScheduleMenusLoading] = useState(false);

  // Client week status state (planning intent: unconfirmed, skipped)
  const [clientWeekStatuses, setClientWeekStatuses] = useState([]);

  // File refs for CSV imports
  const clientsFileRef = useRef();
  const recipesFileRef = useRef();
  const ingredientsFileRef = useRef();

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

  // ============ BILLING CYCLES ============

  // Fetch billing cycles and group with approved menus
  const loadBillingCycles = useCallback(async () => {
    if (!isSupabaseMode() || !isConfigured()) {
      return;
    }

    setBillingCyclesLoading(true);
    setBillingCyclesError(null);

    try {
      // Fetch billing cycles and approved menus in parallel
      const [cycles, approvedMenus] = await Promise.all([
        fetchBillingCycles(),
        fetchApprovedMenusForBilling()
      ]);

      // Group menus into billing cycles by date range
      const cyclesWithMenus = cycles.map(cycle => {
        const cycleMenus = approvedMenus.filter(menu =>
          menu.client_id === cycle.client_id &&
          menu.date >= cycle.start_date &&
          menu.date <= cycle.end_date
        );

        // Calculate costs for this cycle
        const markupMultiplier = 1 + (GROCERY_MARKUP_PERCENT / 100);
        let rawGroceryCost = 0;
        const lineItems = [];

        cycleMenus.forEach(menu => {
          let menuCostPerPortion = 0;
          const dishes = [];

          // Calculate cost for each dish type
          ['protein', 'veg', 'starch'].forEach(type => {
            if (menu[type]) {
              const recipe = recipes[type]?.find(r => r.name === menu[type]);
              const cost = recipe ? getRecipeCost(recipe) : 0;
              menuCostPerPortion += cost;
              dishes.push({ name: menu[type], type, cost });
            }
          });

          // Add extras
          const extras = menu.extras || [];
          extras.forEach(extra => {
            const category = ['sauces', 'breakfast', 'soups'].find(cat =>
              recipes[cat]?.find(r => r.name === extra)
            );
            const recipe = category ? recipes[category].find(r => r.name === extra) : null;
            const cost = recipe ? getRecipeCost(recipe) : 0;
            menuCostPerPortion += cost;
            dishes.push({ name: extra, type: 'extra', cost });
          });

          const portions = menu.portions || 1;
          const menuTotal = menuCostPerPortion * portions;
          rawGroceryCost += menuTotal;

          // Build line item
          const mainDishes = dishes.filter(d => d.type !== 'extra').map(d => d.name).join(' + ');
          const extraNames = dishes.filter(d => d.type === 'extra').map(d => d.name);
          const description = extraNames.length > 0
            ? `${mainDishes} (+ ${extraNames.join(', ')})`
            : mainDishes;

          lineItems.push({
            date: menu.date,
            description,
            portions,
            rateWithMarkup: menuCostPerPortion * markupMultiplier,
            lineTotal: menuTotal * markupMultiplier
          });
        });

        return {
          ...cycle,
          menus: cycleMenus,
          calculated: {
            rawGroceryCost,
            billableTotal: rawGroceryCost * markupMultiplier,
            menuCount: cycleMenus.length,
            totalPortions: cycleMenus.reduce((sum, m) => sum + (m.portions || 1), 0)
          },
          lineItems
        };
      });

      // Sort by start_date descending (newest first)
      cyclesWithMenus.sort((a, b) => b.start_date.localeCompare(a.start_date));

      setBillingCycles(cyclesWithMenus);
    } catch (err) {
      console.error('[BillingCycles] Error loading:', err);
      setBillingCyclesError(err.message);
    } finally {
      setBillingCyclesLoading(false);
    }
  }, [recipes, getRecipeCost]);

  // Generate invoice for a billing cycle
  const generateBillingCycleInvoice = async (cycleId) => {
    const cycle = billingCycles.find(c => c.id === cycleId);
    if (!cycle) {
      console.error('[BillingCycles] Cycle not found:', cycleId);
      return null;
    }

    try {
      // Update the billing cycle in Supabase
      const updatedCycle = await updateBillingCycleInvoice(cycleId, {
        groceryCost: cycle.calculated.rawGroceryCost,
        totalDue: cycle.calculated.billableTotal
      });

      // Update local state
      setBillingCycles(prev => prev.map(c =>
        c.id === cycleId
          ? { ...c, ...updatedCycle, status: 'invoiced' }
          : c
      ));

      // Return invoice object for preview
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      return {
        id: `INV-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'invoiced',
        cycleId: cycle.id,
        clientName: cycle.client_name,
        clientId: cycle.client_id,
        cycleNumber: cycle.cycle_number,
        startDate: cycle.start_date,
        endDate: cycle.end_date,
        dueDate: cycle.due_date || dueDate.toISOString().split('T')[0],
        rawGroceryCost: cycle.calculated.rawGroceryCost,
        markupPercent: GROCERY_MARKUP_PERCENT,
        billableTotal: cycle.calculated.billableTotal,
        lineItems: cycle.lineItems,
        invoiceDueDate: cycle.due_date || dueDate.toISOString().split('T')[0],
        honeybookUrl: ''
      };
    } catch (err) {
      console.error('[BillingCycles] Error generating invoice:', err);
      toast(`Failed to generate invoice: ${err.message}`, 'error');
      return null;
    }
  };

  // Load billing cycles on mount only (not on every loadBillingCycles recreation)
  // Manual refresh available via loadBillingCycles in context
  useEffect(() => {
    loadBillingCycles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============ SCHEDULE DATA (menus + client_week_status) ============

  // Load menus AND client_week_status for visible weeks
  const loadScheduleData = useCallback(async (weekIds) => {
    if (!isSupabaseMode() || !isConfigured() || !weekIds || weekIds.length === 0) {
      return;
    }

    setScheduleMenusLoading(true);
    try {
      // Fetch both in parallel
      const [menus, statuses] = await Promise.all([
        fetchMenusForWeekRange(weekIds),
        fetchClientWeekStatuses(weekIds)
      ]);
      setScheduleMenus(menus);
      setClientWeekStatuses(statuses);
    } catch (err) {
      console.error('[ScheduleData] Error loading:', err);
    } finally {
      setScheduleMenusLoading(false);
    }
  }, []);

  // Transition to Confirmed: create menu rows, delete client_week_status
  const transitionToConfirmed = useCallback(async (client, weekId, weekStartDate) => {
    if (!isSupabaseMode() || !isConfigured()) {
      return { success: false };
    }

    try {
      const result = await confirmClientWeek({
        client,
        weekId,
        weekStartDate
      });

      // Update local state: remove from statuses, add to menus
      setClientWeekStatuses(prev => prev.filter(
        s => !(s.client_id === client.id && s.week_id === weekId)
      ));

      if (result.created > 0) {
        // Refetch menus for this week to get the new rows
        const menus = await fetchMenusForWeekRange([weekId]);
        setScheduleMenus(prev => {
          // Remove old entries for this client/week and add new ones
          const filtered = prev.filter(m => !(m.client_id === client.id && m.week_id === weekId));
          const newMenus = menus.filter(m => m.client_id === client.id && m.week_id === weekId);
          return [...filtered, ...newMenus];
        });
      }

      return { success: true, created: result.created };
    } catch (err) {
      console.error('[Schedule] Error transitioning to confirmed:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Transition to Unconfirmed or Skipped: delete menu rows, upsert client_week_status
  const transitionToPlanning = useCallback(async (clientId, weekId, newStatus) => {
    if (!isSupabaseMode() || !isConfigured()) {
      return { success: false };
    }

    try {
      // Delete menu rows first
      await deleteMenusForClientWeek({ clientId, weekId });

      // Create/update planning status
      await upsertClientWeekStatus({ clientId, weekId, status: newStatus });

      // Update local state
      setScheduleMenus(prev => prev.filter(
        m => !(m.client_id === clientId && m.week_id === weekId)
      ));
      setClientWeekStatuses(prev => {
        const filtered = prev.filter(s => !(s.client_id === clientId && s.week_id === weekId));
        return [...filtered, { client_id: clientId, week_id: weekId, status: newStatus }];
      });

      return { success: true };
    } catch (err) {
      console.error('[Schedule] Error transitioning to planning:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Transition to Empty: delete everything for this client/week
  const transitionToEmpty = useCallback(async (clientId, weekId) => {
    if (!isSupabaseMode() || !isConfigured()) {
      return { success: false };
    }

    try {
      // Delete menu rows if any
      await deleteMenusForClientWeek({ clientId, weekId });

      // Delete planning status if any
      await deleteClientWeekStatus({ clientId, weekId });

      // Update local state
      setScheduleMenus(prev => prev.filter(
        m => !(m.client_id === clientId && m.week_id === weekId)
      ));
      setClientWeekStatuses(prev => prev.filter(
        s => !(s.client_id === clientId && s.week_id === weekId)
      ));

      return { success: true };
    } catch (err) {
      console.error('[Schedule] Error transitioning to empty:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Set planning status (unconfirmed or skipped) when no menus exist
  const setPlanningStatus = useCallback(async (clientId, weekId, newStatus) => {
    if (!isSupabaseMode() || !isConfigured()) {
      return { success: false };
    }

    try {
      await upsertClientWeekStatus({ clientId, weekId, status: newStatus });

      // Update local state
      setClientWeekStatuses(prev => {
        const filtered = prev.filter(s => !(s.client_id === clientId && s.week_id === weekId));
        return [...filtered, { client_id: clientId, week_id: weekId, status: newStatus }];
      });

      return { success: true };
    } catch (err) {
      console.error('[Schedule] Error setting planning status:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Get menu state for a client + week cell
  // Display states: empty, unconfirmed, confirmed, skipped
  // Logic:
  //   1. menus row exists → confirmed (row = date picked & paid)
  //   2. client_week_status.status = 'skipped' → skipped
  //   3. client_week_status.status = 'unconfirmed' → unconfirmed
  //   4. neither → empty
  const getScheduleCellState = useCallback((clientId, weekId) => {
    // Check menus first (source of truth for confirmed)
    const clientWeekMenus = scheduleMenus.filter(
      m => m.client_id === clientId && m.week_id === weekId
    );

    if (clientWeekMenus.length > 0) {
      const firstMenu = clientWeekMenus[0];
      return { status: 'confirmed', menu: firstMenu, hasRow: true, menus: clientWeekMenus };
    }

    // Check client_week_status for planning states
    const planningStatus = clientWeekStatuses.find(
      s => s.client_id === clientId && s.week_id === weekId
    );

    if (planningStatus) {
      if (planningStatus.status === 'skipped') {
        return { status: 'skipped', menu: null, hasRow: false, planningRow: true };
      }
      if (planningStatus.status === 'unconfirmed') {
        return { status: 'unconfirmed', menu: null, hasRow: false, planningRow: true };
      }
    }

    // No data in either table → empty
    return { status: 'empty', menu: null, hasRow: false, planningRow: false };
  }, [scheduleMenus, clientWeekStatuses]);

  // Build per-client grocery cost breakdown grouped by week
  const buildClientBreakdown = () => {
    const approvedItems = menuItems.filter(item => item.approved);
    const weekData = {};

    approvedItems.forEach(item => {
      const clientName = item.clientName || 'Unknown';
      const itemDate = item.date || new Date().toISOString().split('T')[0];
      const weekId = getWeekIdFromDate(itemDate);
      const label = formatWeekRange(weekId);

      if (!weekData[weekId]) {
        weekData[weekId] = {
          weekId,
          label,
          weekStart: getWeekStartDate(weekId),
          weekEnd: getWeekEndDate(weekId),
          clients: {}
        };
      }

      if (!weekData[weekId].clients[clientName]) {
        weekData[weekId].clients[clientName] = { meals: [], total: 0 };
      }

      const portions = item.portions || 1;
      const mealDishes = [];
      let mealCostPerPortion = 0;

      // Gather protein, veg, starch
      ['protein', 'veg', 'starch'].forEach(type => {
        if (item[type]) {
          const recipe = recipes[type]?.find(r => r.name === item[type]);
          const costPerPortion = recipe ? getRecipeCost(recipe) : 0;
          mealDishes.push({ name: item[type], type, costPerPortion });
          mealCostPerPortion += costPerPortion;
        }
      });

      // Add extras if any
      if (item.extras && item.extras.length > 0) {
        item.extras.forEach(extra => {
          const category = ['sauces', 'breakfast', 'soups'].find(cat =>
            recipes[cat]?.find(r => r.name === extra)
          );
          const recipe = category ? recipes[category].find(r => r.name === extra) : null;
          const costPerPortion = recipe ? getRecipeCost(recipe) : 0;
          mealDishes.push({ name: extra, type: 'extra', costPerPortion });
          mealCostPerPortion += costPerPortion;
        });
      }

      const mealTotal = mealCostPerPortion * portions;
      weekData[weekId].clients[clientName].meals.push({
        dishes: mealDishes,
        portions,
        costPerPortion: mealCostPerPortion,
        total: mealTotal,
        date: item.date
      });
      weekData[weekId].clients[clientName].total += mealTotal;
    });

    return weekData;
  };

  // Generate grocery invoice for a client-week
  const generateGroceryInvoice = (clientName, weekId, weekData) => {
    const weekInfo = weekData[weekId];
    const clientData = weekInfo.clients[clientName];
    const markupMultiplier = 1 + (GROCERY_MARKUP_PERCENT / 100);

    // Build line items from meals with marked-up rates
    const lineItems = clientData.meals.map(meal => {
      const mainDishes = meal.dishes.filter(d => d.type !== 'extra').map(d => d.name).join(' + ');
      const extras = meal.dishes.filter(d => d.type === 'extra').map(d => d.name);
      const description = extras.length > 0
        ? `${mainDishes} (+ ${extras.join(', ')})`
        : mainDishes;

      // Raw costs (internal)
      const rawCostPerPortion = meal.costPerPortion;
      const rawSubtotal = meal.total;

      // Marked-up costs (client-facing)
      const rateWithMarkup = rawCostPerPortion * markupMultiplier;
      const lineTotal = rawSubtotal * markupMultiplier;

      return {
        description,
        portions: meal.portions,
        date: meal.date,
        // Internal (raw costs)
        costPerPortion: rawCostPerPortion,
        subtotal: rawSubtotal,
        // Client-facing (marked up)
        rateWithMarkup,
        lineTotal
      };
    });

    // Build itemized description text (uses marked-up totals)
    const itemizedDescription = lineItems.map(item =>
      `${item.date}: ${item.description} × ${item.portions} portions = $${item.lineTotal.toFixed(2)}`
    ).join('\n');

    // Calculate financials (internal)
    const rawGroceryTotal = clientData.total;
    const markupAmount = rawGroceryTotal * (GROCERY_MARKUP_PERCENT / 100);
    const billableTotal = rawGroceryTotal + markupAmount;

    // Calculate due date (7 days from invoice creation)
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const invoice = {
      // Identity
      id: `INV-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'draft',

      // Client & Period
      clientName,
      weekId,
      weekLabel: weekInfo.label,
      weekStart: weekInfo.weekStart,
      weekEnd: weekInfo.weekEnd,

      // Financials
      rawGroceryTotal,
      markupPercent: GROCERY_MARKUP_PERCENT,
      markupAmount,
      billableTotal,

      // Line Items
      lineItems,
      itemizedDescription,

      // Billing fields (for future HoneyBook integration)
      invoiceDueDate: dueDate.toISOString().split('T')[0],
      honeybookUrl: '' // To be populated when sent to HoneyBook
    };

    // Add to invoices state
    setGroceryInvoices(prev => [...prev, invoice]);

    return invoice;
  };

  // Export invoice as JSON
  const exportInvoiceJSON = (invoice) => {
    const blob = new Blob([JSON.stringify(invoice, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${invoice.id}-${invoice.clientName.replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Current week reference
  const currentWeek = weeks[selectedWeekId] || null;

  // Week-filtered menu items
  const getWeekMenuItems = () => {
    if (currentWeek?.status === 'locked' && currentWeek.snapshot?.menu) {
      const items = [];
      Object.entries(currentWeek.snapshot.menu).forEach(([clientName, clientItems]) => {
        clientItems.forEach(item => {
          items.push({ ...item, clientName, approved: true });
        });
      });
      return items;
    }
    return menuItems.filter(item => getWeekIdFromDate(item.date) === selectedWeekId);
  };

  const getWeekApprovedMenuItems = () => {
    return getWeekMenuItems().filter(item => item.approved);
  };

  // Production day from delivery date
  const getProductionDay = (dateStr) => {
    if (!dateStr) return 'monTue';
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();
    return dayOfWeek === 4 ? 'thursday' : 'monTue';
  };

  // KDS view for Dish Totals
  const getKDSView = () => {
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

  // Toggle dish completion
  const toggleDishComplete = async (dishName, recipeType = null) => {
    const newDoneState = !completedDishes[dishName];

    if (isSupabaseMode() && isConfigured()) {
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
    }

    setCompletedDishes(prev => ({ ...prev, [dishName]: newDoneState }));
  };

  const allDishesComplete = () => {
    const kds = getKDSView();
    const allDishNames = [];
    ['monTue', 'thursday'].forEach(prodDay => {
      ['protein', 'veg', 'starch', 'extras'].forEach(category => {
        Object.keys(kds[prodDay][category]).forEach(dishName => {
          allDishNames.push(dishName);
        });
      });
    });
    return allDishNames.length > 0 && allDishNames.every(name => completedDishes[name]);
  };

  const completeAllOrders = () => {
    toast('Complete all orders - production behavior preserved', 'info');
  };

  // Shopping lists
  const getShoppingListsByDay = () => {
    const shoppingLists = { Sunday: {}, Tuesday: {}, Thursday: {} };
    const approvedItems = getWeekApprovedMenuItems();

    approvedItems.forEach(item => {
      const client = clients.find(c => c.name === item.clientName || c.displayName === item.clientName);
      const deliveryDay = client?.deliveryDay || '';
      let shopDay = 'Sunday';
      if (deliveryDay === 'Tuesday') shopDay = 'Tuesday';
      else if (deliveryDay === 'Thursday') shopDay = 'Thursday';

      const dishes = [item.protein, item.veg, item.starch, ...(item.extras || [])].filter(Boolean);

      dishes.forEach(dishName => {
        const category = ['protein', 'veg', 'starch', 'sauces', 'breakfast', 'soups'].find(
          cat => recipes[cat]?.find(r => r.name === dishName)
        );
        const recipe = category ? recipes[category].find(r => r.name === dishName) : null;

        if (recipe?.ingredients) {
          recipe.ingredients.forEach(ing => {
            const masterIng = findExactMatch(ing.name);
            const unit = (ing.unit || 'oz').toLowerCase().trim();
            const key = `${ing.name.toLowerCase().trim()}|${unit}`;
            const portionMultiplier = item.portions || 1;
            const ingQuantity = parseFloat(ing.quantity || 0) * portionMultiplier;
            const unitCost = parseFloat(masterIng?.cost || ing.cost || 0);

            if (!shoppingLists[shopDay][key]) {
              shoppingLists[shopDay][key] = {
                name: ing.name.trim(),
                quantity: 0,
                unit: unit,
                section: ing.section || masterIng?.section || categorizeIngredient(ing.name),
                cost: 0,
                unitCost: unitCost,
                source: masterIng?.source || ing.source || '',
                recipes: []
              };
            }
            shoppingLists[shopDay][key].quantity += ingQuantity;
            shoppingLists[shopDay][key].cost += ingQuantity * unitCost;
            if (!shoppingLists[shopDay][key].recipes.includes(dishName)) {
              shoppingLists[shopDay][key].recipes.push(dishName);
            }
          });
        }
      });
    });

    const sortIngredients = (ingredients) => {
      return Object.values(ingredients).sort((a, b) => {
        const sourceCompare = (a.source || 'ZZZ').localeCompare(b.source || 'ZZZ');
        if (sourceCompare !== 0) return sourceCompare;
        return (a.section || 'ZZZ').localeCompare(b.section || 'ZZZ');
      });
    };

    return {
      Sunday: sortIngredients(shoppingLists.Sunday),
      Tuesday: sortIngredients(shoppingLists.Tuesday),
      Thursday: sortIngredients(shoppingLists.Thursday)
    };
  };

  const getPrepList = () => {
    const lists = getShoppingListsByDay();
    return [...lists.Sunday, ...lists.Tuesday, ...lists.Thursday];
  };

  const exportPrepList = () => {
    toast('Export prep list - production behavior preserved', 'info');
  };

  // Recipe functions
  const saveRecipe = async () => {
    if (!newRecipe.name) { toast('Please enter a recipe name', 'warning'); return; }
    const validIngredients = newRecipe.ingredients.filter(ing => ing.name && ing.quantity);
    if (validIngredients.length === 0) { toast('Please add at least one ingredient', 'warning'); return; }

    validIngredients.forEach(ing => addToMasterIngredients(ing));
    const recipeToSave = { name: newRecipe.name, instructions: newRecipe.instructions, ingredients: validIngredients };

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
      toast('Recipe saved (local)!', 'success');
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
    const duplicated = { ...recipe, name: `${recipe.name} (Copy)`, ingredients: recipe.ingredients.map(ing => ({ ...ing })) };
    setRecipes({ ...recipes, [category]: [...recipes[category], duplicated] });
  };

  const startEditingRecipe = (category, index) => {
    const recipe = recipes[category][index];
    setEditingRecipe({
      category,
      index,
      recipe: {
        ...recipe,
        ingredients: recipe.ingredients.map(ing => ({
          name: ing.name || '',
          quantity: ing.quantity || '',
          unit: ing.unit || 'oz',
          cost: ing.cost || '',
          source: ing.source || '',
          section: ing.section || 'Other'
        }))
      }
    });
  };

  const updateEditingIngredient = (index, field, value) => {
    const updated = [...editingRecipe.recipe.ingredients];
    updated[index][field] = value;
    if (field === 'name' && value.length > 2) {
      const masterIng = findExactMatch(value);
      if (masterIng) {
        updated[index] = {
          ...updated[index],
          cost: masterIng.cost || updated[index].cost,
          source: masterIng.source || updated[index].source,
          section: masterIng.section || updated[index].section,
          unit: masterIng.unit || updated[index].unit
        };
      }
    }
    setEditingRecipe({ ...editingRecipe, recipe: { ...editingRecipe.recipe, ingredients: updated } });
  };

  const addEditingIngredient = () => {
    setEditingRecipe({
      ...editingRecipe,
      recipe: {
        ...editingRecipe.recipe,
        ingredients: [...editingRecipe.recipe.ingredients, { name: '', quantity: '', unit: 'oz', cost: '', source: '', section: 'Other' }]
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
      toast('Recipe updated (local)!', 'success');
    }
  };

  // Context value with all shared state and functions
  const contextValue = {
    // Data
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
    orderHistory,
    weeks,
    selectedWeekId, setSelectedWeekId,
    currentWeek,

    // Experimental state
    deliverySchedule, setDeliverySchedule,

    // KDS state
    kdsLoading, kdsLastRefresh, lastMenusApprovedAt,
    unapprovedMenuCount, unapprovedByClient,

    // File refs
    clientsFileRef, recipesFileRef, ingredientsFileRef,

    // Utility functions
    findSimilarIngredients,
    findExactMatch,
    addToMasterIngredients,
    updateMasterIngredientCost,
    syncRecipeIngredientsFromMaster,
    getUniqueVendors,
    getRecipeCost,
    getRecipeCounts,
    units, addUnit,

    // Computed functions
    getWeekMenuItems,
    getWeekApprovedMenuItems,
    getKDSView,
    getShoppingListsByDay,
    getPrepList,

    // Duplicate/merge functions
    scanForDuplicates,
    mergeIngredients,

    // Ingredient actions
    addMasterIngredient,
    deleteMasterIngredient,
    startEditingMasterIngredient,
    saveEditingMasterIngredient,
    cancelEditingMasterIngredient,
    exportIngredientsCSV: () => exportIngredientsCSV(masterIngredients),

    // Actions
    toggleDishComplete,
    allDishesComplete,
    completeAllOrders,
    exportPrepList,
    saveRecipe,
    deleteRecipe,
    duplicateRecipe,
    startEditingRecipe,
    updateEditingIngredient,
    addEditingIngredient,
    removeEditingIngredient,
    saveEditingRecipe,

    // Grocery billing (legacy week-based)
    groceryInvoices,
    buildClientBreakdown,
    generateGroceryInvoice,
    exportInvoiceJSON,
    GROCERY_MARKUP_PERCENT,

    // Billing cycles (database-backed)
    billingCycles,
    billingCyclesLoading,
    billingCyclesError,
    loadBillingCycles,
    generateBillingCycleInvoice,

    // Schedule data (for TimelineView)
    scheduleMenus,
    scheduleMenusLoading,
    clientWeekStatuses,
    loadScheduleData,
    transitionToConfirmed,
    transitionToPlanning,
    transitionToEmpty,
    setPlanningStatus,
    getScheduleCellState
  };

  return (
    <ExperimentalContext.Provider value={contextValue}>
      <div className="min-h-screen" style={{ backgroundColor: '#f9f9ed' }}>
        {/* Hidden file inputs */}
        <input type="file" ref={clientsFileRef} accept=".csv" className="hidden" />
        <input type="file" ref={recipesFileRef} accept=".csv" className="hidden" />
        <input type="file" ref={ingredientsFileRef} accept=".csv" className="hidden" />

        {/* Layer 1: Global Week Bar */}
        <div className="text-white px-4 py-1.5" style={{ backgroundColor: '#3d59ab' }}>
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            {/* Left: Logo */}
            <div className="flex items-center gap-2">
              <ChefHat size={18} style={{ color: '#ffd700' }} />
              <span className="font-bold text-sm">Goldfinch Chef</span>
              <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded ml-2">EXPERIMENTAL</span>
            </div>

            {/* Center: Week navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedWeekId(getAdjacentWeekId(selectedWeekId, -1))}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="font-medium text-sm min-w-[140px] text-center">
                {formatWeekRange(selectedWeekId)}
              </span>
              <button
                onClick={() => setSelectedWeekId(getAdjacentWeekId(selectedWeekId, 1))}
                className="p-1 rounded hover:bg-white/20 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
              <span className="text-xs opacity-75 ml-1">
                {selectedWeekId.split('-')[1]}
              </span>
            </div>

            {/* Right: Links */}
            <div className="flex items-center gap-2">
              <Link
                to="/"
                className="text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30"
              >
                Back to Production
              </Link>
              <Link
                to="/admin"
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/20 hover:bg-white/30"
              >
                <Settings size={14} />
                Admin
              </Link>
            </div>
          </div>
        </div>

        {/* Layer 2: Primary Navigation */}
        <nav className="bg-white shadow-sm sticky top-0 z-10">
          <div className="max-w-6xl mx-auto">
            <TopNav />
          </div>
        </nav>

        {/* Secondary Navigation (subviews) */}
        <SubNav />

        {/* Content Area - renders matched route */}
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <Outlet />
        </div>
      </div>
    </ExperimentalContext.Provider>
  );
}

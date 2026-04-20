import React, { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../components/NotificationContext';
import { useAuth } from '../components/AuthContext';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ChefHat, Home, Calendar, Truck, AlertTriangle, RefreshCw,
  Plus, Trash2, Edit2, Edit3, Check, X, Settings, ClipboardList,
  LayoutDashboard, Users, MapPin, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  Package, CreditCard, FileText, ShoppingBag, ShoppingCart, Eye, Utensils,
  ExternalLink, Copy, DollarSign, TrendingUp, Receipt, Database, Cloud, CloudOff, Upload
} from 'lucide-react';
import { runMigration, getMigrationStatus } from '../lib/migration';
import { isConfigured, checkConnection } from '../lib/supabase';
import { ZONES, DEFAULT_NEW_DRIVER, DEFAULT_NEW_MENU_ITEM, DEFAULT_NEW_INGREDIENT, DEFAULT_NEW_RECIPE, STORE_SECTIONS } from '../constants';
import SubscriptionsTab from '../tabs/SubscriptionsTab';
import MenuTab from '../tabs/MenuTab';
import RecipesTab from '../tabs/RecipesTab';
import IngredientsTab from '../tabs/IngredientsTab';
import ClientsTab from '../tabs/ClientsTab';
import SubscriptionDetailModal from '../components/SubscriptionDetailModal';
import DataModeToggle from '../components/DataModeToggle';
import { normalizeName, similarity, exportIngredientsCSV, exportRecipesCSV, parseIngredientsCSV, parseRecipesCSV, parseClientsCSV, categorizeIngredient } from '../utils';
import { getWeekIdFromDate, createWeekRecord, lockWeek } from '../utils/weekUtils';
import { getDataMode, isSupabaseMode } from '../lib/dataMode';
import {
  saveDriverToSupabase,
  deleteDriverFromSupabase,
  saveClientToSupabase,
  deleteClientFromSupabase,
  saveRecipeToSupabase,
  deleteRecipeFromSupabase,
  saveIngredientToSupabase,
  deleteIngredientFromSupabase,
  saveGroceryBillToSupabase,
  deleteGroceryBillFromSupabase,
  fetchGroceryBillsByWeek,
  fetchAllGroceryBills,
  updateClientDeliveryDates,
  fetchMenusByWeek,
  saveAllMenus,
  ensureWeeksExist
} from '../lib/database';
import { supabase } from '../lib/supabase';

// Custom hook for admin data
function useAdminData() {
  const { toast } = useNotification();
  const [clients, setClients] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [deliveryLog, setDeliveryLog] = useState([]);
  const [readyForDelivery, setReadyForDelivery] = useState([]);
  const [clientPortalData, setClientPortalData] = useState({});
  const [blockedDates, setBlockedDates] = useState([]);
  const [adminSettings, setAdminSettings] = useState({ routeStartAddress: '' });
  const [customTasks, setCustomTasks] = useState([]);
  const [weeklyTasks, setWeeklyTasks] = useState({});
  const [recipes, setRecipes] = useState({ protein: [], veg: [], starch: [], sauces: [], breakfast: [], soups: [] });
  const [masterIngredients, setMasterIngredients] = useState([]);

  const [groceryBills, setGroceryBills] = useState([]);
  const [weeks, setWeeks] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data from Supabase on mount
  useEffect(() => {
    const loadData = async () => {
      // NOTE: We always call loadFromSupabase - it handles mode detection internally
      // and falls back to localStorage if Supabase is unavailable
      try {
        // Import loadData from sync to get full data from Supabase
        const { loadData: loadFromSupabase } = await import('../lib/sync');
        const result = await loadFromSupabase();

        if (result.data) {
          if (result.data.clients) setClients(result.data.clients);
          if (result.data.drivers) setDrivers(result.data.drivers);
          if (result.data.menuItems) setMenuItems(result.data.menuItems);
          if (result.data.deliveryLog) setDeliveryLog(result.data.deliveryLog);
          if (result.data.readyForDelivery) setReadyForDelivery(result.data.readyForDelivery);
          if (result.data.clientPortalData) setClientPortalData(result.data.clientPortalData);
          if (result.data.blockedDates) setBlockedDates(result.data.blockedDates);
          if (result.data.adminSettings) setAdminSettings(result.data.adminSettings);
          if (result.data.customTasks) setCustomTasks(result.data.customTasks);
          if (result.data.weeklyTasks) setWeeklyTasks(result.data.weeklyTasks);
          if (result.data.recipes) setRecipes(result.data.recipes);
          if (result.data.masterIngredients) {
            setMasterIngredients(result.data.masterIngredients);
          }
          if (result.data.groceryBills) setGroceryBills(result.data.groceryBills);
          if (result.data.weeks) setWeeks(result.data.weeks);
        }
      } catch (e) {
        console.error('[AdminPage] Error loading data from Supabase:', e);
        toast(`Failed to load data: ${e.message}`, 'error');
      }

      setIsLoaded(true);
    };

    loadData();
  }, []);

  // Load grocery bills from Supabase when in Supabase mode
  useEffect(() => {
    const loadGroceryBillsFromSupabase = async () => {
      if (!isSupabaseMode()) return;

      try {
        const bills = await fetchAllGroceryBills();
        setGroceryBills(bills);
      } catch (err) {
        console.error('[loadGroceryBills] error:', err);
      }
    };

    if (isLoaded) {
      loadGroceryBillsFromSupabase();
    }
  }, [isLoaded]);

  // Save data to Supabase (no localStorage)
  const saveData = useCallback(async (updates) => {
    if (!isConfigured()) {
      return;
    }

    try {
      const { syncToSupabase } = await import('../lib/sync');
      const dataToSave = {
        clients,
        drivers,
        menuItems,
        deliveryLog,
        readyForDelivery,
        clientPortalData,
        blockedDates,
        adminSettings,
        customTasks,
        weeklyTasks,
        recipes,
        masterIngredients,
        groceryBills,
        weeks,
        ...updates,
        lastSaved: new Date().toISOString()
      };

      const result = await syncToSupabase(dataToSave);
      if (!result.success) {
        toast(`Failed to save: ${result.error}`, 'error');
      }
    } catch (e) {
      console.error('[AdminPage] Error saving to Supabase:', e);
      toast(`Failed to save: ${e.message}`, 'error');
    }
  }, [clients, drivers, menuItems, deliveryLog, readyForDelivery, clientPortalData, blockedDates, adminSettings, customTasks, weeklyTasks, recipes, masterIngredients, groceryBills, weeks]);

  const updateDrivers = useCallback((newDrivers) => {
    setDrivers(newDrivers);
    saveData({ drivers: newDrivers });
  }, [saveData]);

  const updateBlockedDates = useCallback((newBlockedDates) => {
    setBlockedDates(newBlockedDates);
    saveData({ blockedDates: newBlockedDates });
  }, [saveData]);

  const updateAdminSettings = useCallback((newSettings) => {
    setAdminSettings(newSettings);
    saveData({ adminSettings: newSettings });
  }, [saveData]);

  const updateCustomTasks = useCallback((newTasks) => {
    setCustomTasks(newTasks);
    saveData({ customTasks: newTasks });
  }, [saveData]);

  const updateMenuItems = useCallback(async (newMenuItemsOrFn) => {
    // Handle both direct values and functional updates
    let menuItemsToSave;
    if (typeof newMenuItemsOrFn === 'function') {
      // Get current value from localStorage to compute update
      const savedData = localStorage.getItem('goldfinchChefData');
      let currentItems = [];
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          currentItems = parsed.menuItems || [];
        } catch (e) {
          console.error('Error parsing saved data:', e);
        }
      }
      menuItemsToSave = newMenuItemsOrFn(currentItems);
      setMenuItems(menuItemsToSave);
    } else {
      menuItemsToSave = newMenuItemsOrFn;
      setMenuItems(newMenuItemsOrFn);
    }

    // Save menus directly to Supabase (not via sync which skips menus)
    if (isSupabaseMode() && menuItemsToSave && menuItemsToSave.length > 0) {
      try {
        // Ensure weeks exist first
        const weekIds = [...new Set(menuItemsToSave.map(item => {
          if (item.weekId) return item.weekId;
          return getWeekIdFromDate(item.date);
        }).filter(Boolean))];

        if (weekIds.length > 0) {
          await ensureWeeksExist(weekIds);
        }

        await saveAllMenus(menuItemsToSave);
      } catch (error) {
        console.error('[MENU SAVE] Error:', error);
      }
    }
  }, []);

  const updateWeeklyTasks = useCallback((newWeeklyTasks) => {
    setWeeklyTasks(newWeeklyTasks);
    saveData({ weeklyTasks: newWeeklyTasks });
  }, [saveData]);

  const updateRecipes = useCallback((newRecipes) => {
    setRecipes(newRecipes);
    saveData({ recipes: newRecipes });
  }, [saveData]);

  const updateMasterIngredients = useCallback((newMasterIngredients) => {
    setMasterIngredients(newMasterIngredients);
    saveData({ masterIngredients: newMasterIngredients });
  }, [saveData]);

  const updateClients = useCallback((newClients) => {
    setClients(newClients);
    saveData({ clients: newClients });
  }, [saveData]);

  const updateGroceryBills = useCallback((newGroceryBills) => {
    setGroceryBills(newGroceryBills);
    saveData({ groceryBills: newGroceryBills });
  }, [saveData]);

  const updateWeeks = useCallback((newWeeks) => {
    setWeeks(newWeeks);
    saveData({ weeks: newWeeks });
  }, [saveData]);

  // Lock a week and create snapshot
  const lockWeekWithSnapshot = useCallback((weekId) => {
    const week = weeks[weekId] || createWeekRecord(weekId);
    if (week.status === 'locked') return week;

    const lockedWeek = lockWeek(week, menuItems, clients);
    const newWeeks = { ...weeks, [weekId]: lockedWeek };
    setWeeks(newWeeks);
    saveData({ weeks: newWeeks });
    return lockedWeek;
  }, [weeks, menuItems, clients, saveData]);

  return {
    clients,
    drivers,
    menuItems,
    deliveryLog,
    readyForDelivery,
    clientPortalData,
    blockedDates,
    adminSettings,
    customTasks,
    weeklyTasks,
    recipes,
    masterIngredients,
    groceryBills,
    isLoaded,
    updateDrivers,
    updateBlockedDates,
    updateAdminSettings,
    updateMenuItems,
    updateWeeklyTasks,
    updateRecipes,
    updateMasterIngredients,
    updateCustomTasks,
    updateClients,
    updateGroceryBills,
    weeks,
    updateWeeks,
    lockWeekWithSnapshot
  };
}

// Helper components
const FormField = ({ label, children }) => (
  <div className="flex flex-col">
    <label className="text-sm font-medium mb-1" style={{ color: '#423d3c' }}>{label}</label>
    {children}
  </div>
);

const inputStyle = "p-2 border-2 rounded-lg";
const borderStyle = { borderColor: '#ebb582' };

// Safe date to ISO string helper
function safeToISODate(date) {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch (e) {
    return '';
  }
}

// Get week boundaries
function getWeekBounds(date = new Date()) {
  try {
    const start = new Date(date);
    if (isNaN(start.getTime())) {
      const now = new Date();
      start.setTime(now.getTime());
    }
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  } catch (e) {
    const now = new Date();
    return { start: now, end: now };
  }
}

function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Dashboard Section Component
function DashboardSection({
  weekStart,
  weekEnd,
  thisWeekDeliveries,
  thisWeekCompleted,
  renewalsThisWeek,
  problemsThisWeek,
  autoTasks,
  customTasks,
  updateCustomTasks,
  newTask,
  setNewTask,
  addCustomTask,
  toggleTaskComplete,
  deleteCustomTask,
  groceryBills,
  newGroceryBill,
  setNewGroceryBill,
  addGroceryBill,
  deleteGroceryBill,
  menuItems,
  recipes,
  getRecipeCost,
  clients,
  clientPortalData
}) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [showGroceryAnalysis, setShowGroceryAnalysis] = useState(false);
  const [showRecipeBreakdown, setShowRecipeBreakdown] = useState(() => {
    const saved = localStorage.getItem('groceryAnalysis_showRecipeBreakdown');
    return saved === 'true';
  });

  const toggleRecipeBreakdown = () => {
    setShowRecipeBreakdown(prev => {
      const newValue = !prev;
      localStorage.setItem('groceryAnalysis_showRecipeBreakdown', String(newValue));
      return newValue;
    });
  };

  // State for expanded clients (top-level, persisted to localStorage)
  const [expandedClients, setExpandedClients] = useState(() => {
    try {
      const saved = localStorage.getItem('groceryAnalysis_expandedClients');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleClientExpanded = (clientName) => {
    setExpandedClients(prev => {
      const newValue = { ...prev, [clientName]: !prev[clientName] };
      localStorage.setItem('groceryAnalysis_expandedClients', JSON.stringify(newValue));
      return newValue;
    });
  };

  // State for expanded client-week rows (persisted to localStorage)
  const [expandedClientWeeks, setExpandedClientWeeks] = useState(() => {
    try {
      const saved = localStorage.getItem('groceryAnalysis_expandedClientWeeks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleClientWeekExpanded = (key) => {
    setExpandedClientWeeks(prev => {
      const newValue = { ...prev, [key]: !prev[key] };
      localStorage.setItem('groceryAnalysis_expandedClientWeeks', JSON.stringify(newValue));
      return newValue;
    });
  };

  // Build aggregated cook list with costs (KDS-style: one entry per unique recipe)
  const buildCookListWithCosts = () => {
    const approvedItems = menuItems.filter(item => item.approved);
    const cookList = {};

    approvedItems.forEach(item => {
      const portions = item.portions || 1;

      ['protein', 'veg', 'starch'].forEach(type => {
        if (!item[type]) return;
        const dishName = item[type];
        const recipe = recipes[type]?.find(r => r.name === dishName);
        const key = dishName.toLowerCase().trim();

        if (!cookList[key]) {
          cookList[key] = {
            name: dishName,
            category: type,
            totalPortions: 0,
            costPerPortion: recipe ? getRecipeCost(recipe) : 0
          };
        }
        cookList[key].totalPortions += portions;
      });

      if (item.extras) {
        item.extras.forEach(extra => {
          const category = ['sauces', 'breakfast', 'soups'].find(cat =>
            recipes[cat]?.find(r => r.name === extra)
          );
          const recipe = category ? recipes[category].find(r => r.name === extra) : null;
          const key = extra.toLowerCase().trim();

          if (!cookList[key]) {
            cookList[key] = {
              name: extra,
              category: category || 'extras',
              totalPortions: 0,
              costPerPortion: recipe ? getRecipeCost(recipe) : 0
            };
          }
          cookList[key].totalPortions += portions;
        });
      }
    });

    const entries = Object.values(cookList).map(entry => ({
      ...entry,
      totalCost: entry.totalPortions * entry.costPerPortion
    }));

    const projectedTotal = entries.reduce((sum, e) => sum + e.totalCost, 0);

    return { entries, projectedTotal };
  };

  // Get this week's grocery spending
  const getThisWeekGrocerySpending = () => {
    const weekStartDate = new Date(weekStart);
    const weekEndDate = new Date(weekEnd);

    return groceryBills
      .filter(bill => {
        const billDate = new Date(bill.date);
        return billDate >= weekStartDate && billDate <= weekEndDate;
      })
      .reduce((sum, bill) => sum + (bill.amount || 0), 0);
  };

  // Get monthly grocery data for trend
  const getMonthlyGroceryData = () => {
    const months = {};
    groceryBills.forEach(bill => {
      const date = new Date(bill.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[monthKey]) {
        months[monthKey] = { spending: 0, calculated: 0 };
      }
      months[monthKey].spending += bill.amount || 0;
    });
    return months;
  };

  // Helper to get week info from a date
  const getWeekInfo = (dateStr) => {
    const date = new Date(dateStr + 'T12:00:00');
    const day = date.getDay();
    const diffToMonday = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekId = monday.toISOString().split('T')[0];
    return {
      weekId,
      weekStart: monday,
      weekEnd: sunday,
      label: `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    };
  };

  // Build per-client breakdown grouped by week for Grocery Analysis
  const buildClientBreakdown = () => {
    const approvedItems = menuItems.filter(item => item.approved);
    const weekData = {};

    approvedItems.forEach(item => {
      const clientName = item.clientName || 'Unknown';
      const itemDate = item.date || new Date().toISOString().split('T')[0];
      const weekInfo = getWeekInfo(itemDate);
      const { weekId, label } = weekInfo;

      if (!weekData[weekId]) {
        weekData[weekId] = {
          weekId,
          label,
          weekStart: weekInfo.weekStart,
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
        total: mealTotal
      });
      weekData[weekId].clients[clientName].total += mealTotal;
    });

    return weekData;
  };

  const { entries: cookListEntries, projectedTotal: weeklyFoodCost } = buildCookListWithCosts();
  const actualSpending = getThisWeekGrocerySpending();
  const difference = actualSpending - weeklyFoodCost;
  const wastePercent = weeklyFoodCost > 0 ? ((difference / weeklyFoodCost) * 100).toFixed(1) : 0;

  // Calculate due dates for this week (Wed, Thu, Sat)
  const getWeekDueDates = () => {
    if (!weekStart) {
      return { billing: '', menus: '', substitutions: '' };
    }
    try {
      const weekStartDate = new Date(weekStart + 'T12:00:00');
      if (isNaN(weekStartDate.getTime())) {
        return { billing: '', menus: '', substitutions: '' };
      }
      const wednesday = new Date(weekStartDate);
      wednesday.setDate(weekStartDate.getDate() + 2); // Mon + 2 = Wed
      const thursday = new Date(weekStartDate);
      thursday.setDate(weekStartDate.getDate() + 3); // Mon + 3 = Thu
      const saturday = new Date(weekStartDate);
      saturday.setDate(weekStartDate.getDate() + 5); // Mon + 5 = Sat
      return {
        billing: wednesday.toISOString().split('T')[0],
        menus: thursday.toISOString().split('T')[0],
        substitutions: saturday.toISOString().split('T')[0]
      };
    } catch (e) {
      console.error('Error calculating due dates:', e);
      return { billing: '', menus: '', substitutions: '' };
    }
  };

  const dueDates = getWeekDueDates();

  // Smart task generation - only show tasks that need action
  const getSmartTasksByClient = () => {
    const clientTasks = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Helper to add task to a client
    const addClientTask = (clientName, taskType, dueDate, priority = 'normal') => {
      if (!clientTasks[clientName]) {
        clientTasks[clientName] = [];
      }
      const taskId = `${clientName}-${taskType}`;
      // Check if already completed in customTasks
      const isCompleted = customTasks.some(t => t.id === taskId && t.completed);

      // Check if task already exists
      if (clientTasks[clientName].some(t => t.id === taskId)) return;

      clientTasks[clientName].push({
        id: taskId,
        clientName,
        type: taskType,
        dueDate,
        priority,
        completed: isCompleted
      });
    };

    // Calculate NEXT week's date range (menus are planned Thursday for next Mon/Tue)
    const nextWeekStart = new Date(weekStart + 'T12:00:00');
    nextWeekStart.setDate(nextWeekStart.getDate() + 7); // Next Monday
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6); // Next Sunday

    // Helper to check if client has menu for NEXT week (for menu planning tasks)
    const hasMenuNextWeek = (clientName) => {
      return menuItems.some(item => {
        const itemDate = new Date(item.date + 'T12:00:00');
        return (item.clientName === clientName) &&
               itemDate >= nextWeekStart && itemDate <= nextWeekEnd;
      });
    };

    // Helper to check if client delivers on Mon/Tue next week
    const deliversNextMonTue = (client) => {
      return client.deliveryDay === 'Monday' || client.deliveryDay === 'Tuesday';
    };

    // Process each active client
    clients.filter(c => c.status === 'active').forEach(client => {
      const clientName = client.displayName || client.name;
      const portalData = clientPortalData[clientName] || clientPortalData[client.name] || {};

      // 1. BILLING TASKS - Only for clients with bill due within 7 days (Week 4 clients)
      if (client.billDueDate) {
        const dueDate = new Date(client.billDueDate + 'T12:00:00');
        const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

        // Show billing tasks if due within 7 days (or overdue)
        if (daysUntilDue <= 7) {
          const isOverdue = daysUntilDue < 0;
          const priority = isOverdue ? 'urgent' : (daysUntilDue <= 3 ? 'high' : 'normal');

          // Create invoice task
          addClientTask(clientName, 'Create invoice', dueDates.billing, priority);

          // Paste Honeybook link (if no link yet)
          if (!client.honeyBookLink) {
            addClientTask(clientName, 'Paste Honeybook link', dueDates.billing, priority);
          }

          // Payment pending (if overdue)
          if (isOverdue) {
            addClientTask(clientName, `Payment pending (${Math.abs(daysUntilDue)}d overdue)`, dueDates.billing, 'urgent');
          }
        }
      }

      // Check if client needs delivery dates set
      if (client.deliveryDay && (!client.deliveryDates || client.deliveryDates.length === 0)) {
        const portalDates = portalData.selectedDates || [];
        if (portalDates.length === 0) {
          addClientTask(clientName, 'Set delivery dates', dueDates.billing, 'normal');
        }
      }

      // 2. MENU TASKS - Show for clients delivering NEXT week Mon/Tue who don't have menu yet
      // Menus are planned on Thursday for the following Monday/Tuesday deliveries
      if (client.deliveryDay && deliversNextMonTue(client) && !hasMenuNextWeek(clientName) && !hasMenuNextWeek(client.name)) {
        const deliveryDay = client.deliveryDay;
        addClientTask(clientName, `Plan menu (${deliveryDay} delivery)`, dueDates.menus, 'normal');
      }

      // 3. DISH PICKS - Only for non-Chef Choice clients who submitted picks for next week
      if (portalData.chefChoice === false && portalData.selectedIngredients && portalData.selectedIngredients.length > 0) {
        // Check if picks haven't been reviewed yet (no menu created for next week)
        if (deliversNextMonTue(client) && !hasMenuNextWeek(clientName) && !hasMenuNextWeek(client.name)) {
          addClientTask(clientName, 'Review dish picks', dueDates.menus, 'normal');
        }
      }

      // 4. SUBSTITUTION REQUESTS - Only if one was submitted
      if (portalData.substitutionRequest) {
        addClientTask(clientName, 'Review substitution request', dueDates.substitutions, 'high');
      }
    });

    // 5. BAGS REMINDER - Only for clients who didn't return bags from last delivery
    // Look at recent deliveries (within last 10 days) where bags weren't returned
    autoTasks.forEach(task => {
      if (task.category?.toLowerCase().includes('bags')) {
        (task.details || []).forEach(clientName => {
          addClientTask(clientName, 'Follow up on bags', null, 'low');
        });
      }
    });

    // Add custom tasks that have a client name
    customTasks.forEach(task => {
      if (task.clientName) {
        if (!clientTasks[task.clientName]) {
          clientTasks[task.clientName] = [];
        }
        clientTasks[task.clientName].push({
          id: task.id,
          clientName: task.clientName,
          type: task.title,
          completed: task.completed,
          isCustom: true,
          dueDate: null,
          priority: 'normal'
        });
      }
    });

    // Sort tasks within each client: incomplete first, then by priority, then by due date
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    Object.keys(clientTasks).forEach(clientName => {
      clientTasks[clientName].sort((a, b) => {
        // Completed tasks go to bottom
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        // Then by priority
        const priorityDiff = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        if (priorityDiff !== 0) return priorityDiff;
        // Then by due date
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return 0;
      });
    });

    return clientTasks;
  };

  // Get general tasks (not client-specific)
  const getGeneralTasks = () => {
    return customTasks.filter(t => !t.clientName).map(t => ({
      ...t,
      isCustom: true
    }));
  };

  // Helper to format due date display
  const formatDueDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    if (date < today) return { text: 'Overdue', color: 'text-red-600', bg: 'bg-red-100' };
    if (date.toDateString() === today.toDateString()) return { text: 'Today', color: 'text-orange-600', bg: 'bg-orange-100' };
    if (date.toDateString() === tomorrow.toDateString()) return { text: 'Tomorrow', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return {
      text: date.toLocaleDateString('en-US', { weekday: 'short' }),
      color: 'text-gray-600',
      bg: 'bg-gray-100'
    };
  };

  // Priority styling
  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'urgent': return { border: 'border-l-4 border-l-red-500', bg: 'bg-red-50' };
      case 'high': return { border: 'border-l-4 border-l-orange-500', bg: 'bg-orange-50' };
      case 'low': return { border: 'border-l-4 border-l-gray-300', bg: '' };
      default: return { border: '', bg: '' };
    }
  };

  const tasksByClient = getSmartTasksByClient();
  const generalTasks = getGeneralTasks();

  // Sort clients: those with incomplete tasks first, then alphabetically
  const sortedClientNames = Object.keys(tasksByClient).sort((a, b) => {
    const aHasIncomplete = tasksByClient[a].some(t => !t.completed);
    const bHasIncomplete = tasksByClient[b].some(t => !t.completed);
    if (aHasIncomplete !== bHasIncomplete) return aHasIncomplete ? -1 : 1;
    return a.localeCompare(b);
  });

  const hasAnyTasks = sortedClientNames.length > 0 || generalTasks.length > 0;
  const incompleteTaskCount = sortedClientNames.reduce((count, name) =>
    count + tasksByClient[name].filter(t => !t.completed).length, 0
  );

  return (
    <div className="space-y-6">
      {/* 1. This Week at a Glance - Financial Summary */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>
          This Week at a Glance
        </h2>
        <p className="text-gray-500 mb-6">
          {formatDate(weekStart)} - {formatDate(weekEnd)}
        </p>

        {(() => {
          // Get unique clients with menus scheduled this week
          const clientsWithMenus = [...new Set(
            menuItems
              .filter(item => {
                if (!item.date) return false;
                const itemDate = new Date(item.date + 'T12:00:00');
                const weekStartDate = new Date(weekStart + 'T00:00:00');
                const weekEndDate = new Date(weekEnd + 'T23:59:59');
                return itemDate >= weekStartDate && itemDate <= weekEndDate;
              })
              .map(item => item.clientName)
          )];

          // Calculate value of orders using menu pricing snapshot
          // For each client with a menu, use their stored pricing
          const valueOfOrders = clientsWithMenus.reduce((total, clientName) => {
            const client = clients.find(c => c.name === clientName || c.displayName === clientName);
            if (!client) return total;

            const planPrice = parseFloat(client.planPrice) || 0;
            const serviceFee = client.pickup ? 0 : (parseFloat(client.serviceFee) || 0);
            const subtotal = planPrice + serviceFee;
            const discount = client.prepayDiscount ? subtotal * 0.1 : 0;
            const clientTotal = subtotal - discount;

            return total + clientTotal;
          }, 0);

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Stops This Week */}
              <div className="p-6 rounded-lg" style={{ backgroundColor: '#dbeafe' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Truck size={28} style={{ color: '#3d59ab' }} />
                  <span className="text-lg font-medium text-gray-600">Stops this week</span>
                </div>
                <p className="text-5xl font-bold mb-2" style={{ color: '#3d59ab' }}>
                  {clientsWithMenus.length}
                </p>
                <p className="text-sm text-gray-500">unique client delivery addresses</p>
              </div>

              {/* Value of Orders */}
              <div className="p-6 rounded-lg" style={{ backgroundColor: '#dcfce7' }}>
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign size={28} className="text-green-600" />
                  <span className="text-lg font-medium text-gray-600">Value of orders this week</span>
                </div>
                <p className="text-5xl font-bold mb-2 text-green-600">
                  ${valueOfOrders.toFixed(2)}
                </p>
                <p className="text-sm text-gray-500">total from {clientsWithMenus.length} client{clientsWithMenus.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 2. Grocery Input & Weekly Food Cost */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Grocery Input */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#3d59ab' }}>
            <Receipt size={24} />
            Grocery Input
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={newGroceryBill.date}
                onChange={(e) => setNewGroceryBill({ ...newGroceryBill, date: e.target.value })}
                className="p-2 border-2 rounded-lg text-sm"
                style={{ borderColor: '#ebb582' }}
              />
              <input
                type="number"
                value={newGroceryBill.amount}
                onChange={(e) => setNewGroceryBill({ ...newGroceryBill, amount: e.target.value })}
                placeholder="Amount"
                className="p-2 border-2 rounded-lg text-sm"
                style={{ borderColor: '#ebb582' }}
              />
              <input
                type="text"
                value={newGroceryBill.store || ''}
                onChange={(e) => setNewGroceryBill({ ...newGroceryBill, store: e.target.value })}
                placeholder="Store"
                className="p-2 border-2 rounded-lg text-sm"
                style={{ borderColor: '#ebb582' }}
              />
            </div>
            <button
              onClick={addGroceryBill}
              className="w-full py-2 rounded-lg text-white"
              style={{ backgroundColor: '#3d59ab' }}
            >
              Add Bill
            </button>

            {/* Recent bills */}
            {groceryBills.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium text-gray-600 mb-2">Recent Bills</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {groceryBills.slice(-5).reverse().map(bill => (
                    <div key={bill.id} className="flex justify-between items-center text-sm p-2 rounded" style={{ backgroundColor: '#f9f9ed' }}>
                      <span>{formatDate(bill.date)} - {bill.store || 'N/A'}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${bill.amount?.toFixed(2)}</span>
                        <button
                          onClick={() => deleteGroceryBill(bill.id, bill.weekId)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Weekly Food Cost */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#3d59ab' }}>
            <DollarSign size={24} />
            Weekly Food Cost
          </h3>
          <div className="space-y-4">
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
              <p className="text-sm text-gray-600">Calculated from Menu</p>
              <p className="text-3xl font-bold" style={{ color: '#3d59ab' }}>
                ${weeklyFoodCost.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Based on approved menu items × portions
              </p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: actualSpending > 0 ? '#dcfce7' : '#f3f4f6' }}>
              <p className="text-sm text-gray-600">This Week's Spending</p>
              <p className={`text-3xl font-bold ${actualSpending > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                ${actualSpending.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Grocery Analysis (Collapsible) */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <button
          onClick={() => setShowGroceryAnalysis(!showGroceryAnalysis)}
          className="w-full p-4 flex justify-between items-center hover:bg-gray-50"
        >
          <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: '#3d59ab' }}>
            <TrendingUp size={24} />
            Grocery Analysis
          </h3>
          <span className="text-2xl text-gray-400">
            {showGroceryAnalysis ? '−' : '+'}
          </span>
        </button>

        {showGroceryAnalysis && (
          <div className="p-6 pt-0 border-t">
            <div className="grid md:grid-cols-4 gap-4 mb-6">
              {/* Actual vs Calculated */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <p className="text-sm text-gray-600">Actual Spending</p>
                <p className="text-2xl font-bold" style={{ color: '#3d59ab' }}>
                  ${actualSpending.toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <p className="text-sm text-gray-600">Calculated Cost</p>
                <p className="text-2xl font-bold" style={{ color: '#3d59ab' }}>
                  ${weeklyFoodCost.toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: difference > 0 ? '#fee2e2' : '#dcfce7' }}>
                <p className="text-sm text-gray-600">Difference</p>
                <p className={`text-2xl font-bold ${difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {difference > 0 ? '+' : ''}${difference.toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: parseFloat(wastePercent) > 10 ? '#fee2e2' : '#dcfce7' }}>
                <p className="text-sm text-gray-600">Waste %</p>
                <p className={`text-2xl font-bold ${parseFloat(wastePercent) > 10 ? 'text-red-600' : 'text-green-600'}`}>
                  {wastePercent}%
                </p>
              </div>
            </div>

            {/* Per-Recipe Breakdown */}
            {cookListEntries.length > 0 && (
              <div className="mb-6">
                <button
                  onClick={toggleRecipeBreakdown}
                  className="w-full flex justify-between items-center hover:opacity-80"
                >
                  <h4 className="font-bold" style={{ color: '#3d59ab' }}>Recipe Cost Breakdown</h4>
                  <span className="text-xl text-gray-400">{showRecipeBreakdown ? '▼' : '▶'}</span>
                </button>
                {showRecipeBreakdown && (
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2" style={{ borderColor: '#3d59ab' }}>
                        <th className="text-left py-2 px-2">Recipe</th>
                        <th className="text-left py-2 px-2">Category</th>
                        <th className="text-right py-2 px-2">Portions</th>
                        <th className="text-right py-2 px-2">Cost/Portion</th>
                        <th className="text-right py-2 px-2">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cookListEntries
                        .sort((a, b) => b.totalCost - a.totalCost)
                        .map((entry, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-1.5 px-2 font-medium">{entry.name}</td>
                            <td className="py-1.5 px-2 text-gray-500 capitalize">{entry.category}</td>
                            <td className="py-1.5 px-2 text-right">{entry.totalPortions}</td>
                            <td className="py-1.5 px-2 text-right">${entry.costPerPortion.toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-right font-medium">${entry.totalCost.toFixed(2)}</td>
                          </tr>
                        ))}
                      <tr className="border-t-2 font-bold" style={{ borderColor: '#3d59ab' }}>
                        <td className="py-2 px-2" colSpan={4}>Projected Total</td>
                        <td className="py-2 px-2 text-right">${weeklyFoodCost.toFixed(2)}</td>
                      </tr>
                      {actualSpending > 0 && (
                        <>
                          <tr className="text-gray-600">
                            <td className="py-1 px-2" colSpan={4}>Actual Spending</td>
                            <td className="py-1 px-2 text-right">${actualSpending.toFixed(2)}</td>
                          </tr>
                          <tr className={difference > 0 ? 'text-red-600' : 'text-green-600'}>
                            <td className="py-1 px-2" colSpan={4}>Variance (Actual − Projected)</td>
                            <td className="py-1 px-2 text-right font-medium">{difference > 0 ? '+' : ''}${difference.toFixed(2)}</td>
                          </tr>
                          <tr className={parseFloat(wastePercent) > 10 ? 'text-red-600' : 'text-green-600'}>
                            <td className="py-1 px-2" colSpan={4}>Waste %</td>
                            <td className="py-1 px-2 text-right font-medium">{wastePercent}%</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}

            {/* Monthly Trend */}
            <div>
              <h4 className="font-bold mb-3" style={{ color: '#3d59ab' }}>Monthly Trend</h4>
              <div className="space-y-2">
                {Object.entries(getMonthlyGroceryData())
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .slice(0, 6)
                  .map(([month, data]) => {
                    const monthDate = new Date(month + '-01');
                    const monthName = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    return (
                      <div key={month} className="flex items-center gap-4 p-2 rounded" style={{ backgroundColor: '#f9f9ed' }}>
                        <span className="w-24 text-sm font-medium">{monthName}</span>
                        <div className="flex-1 h-4 bg-gray-200 rounded overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${Math.min((data.spending / 1000) * 100, 100)}%`,
                              backgroundColor: '#3d59ab'
                            }}
                          />
                        </div>
                        <span className="w-24 text-right font-bold">${data.spending.toFixed(0)}</span>
                      </div>
                    );
                  })}
                {Object.keys(getMonthlyGroceryData()).length === 0 && (
                  <p className="text-gray-500 text-center py-4">No grocery data yet</p>
                )}
              </div>
            </div>

            {/* Client Costs by Week (grouped by client) */}
            {(() => {
              const weekData = buildClientBreakdown();
              const weekIds = Object.keys(weekData);
              if (weekIds.length === 0) return null;

              // Reorganize: group by client, then by week
              const clientData = {};
              weekIds.forEach(weekId => {
                const week = weekData[weekId];
                Object.entries(week.clients).forEach(([clientName, data]) => {
                  if (!clientData[clientName]) {
                    clientData[clientName] = { weeks: {}, total: 0 };
                  }
                  clientData[clientName].weeks[weekId] = {
                    ...data,
                    label: week.label,
                    weekStart: week.weekStart
                  };
                  clientData[clientName].total += data.total;
                });
              });

              const clientNames = Object.keys(clientData).sort();

              return (
                <div className="mt-6 pt-6 border-t-2" style={{ borderColor: '#ebb582' }}>
                  <h4 className="font-bold mb-4" style={{ color: '#3d59ab' }}>Client Costs by Week</h4>
                  <div className="space-y-2">
                    {clientNames.map(clientName => {
                      const client = clientData[clientName];
                      const isClientExpanded = expandedClients[clientName] || false;
                      const clientWeekIds = Object.keys(client.weeks).sort((a, b) => b.localeCompare(a)); // newest first

                      return (
                        <div key={clientName} className="border rounded-lg overflow-hidden" style={{ borderColor: '#3d59ab' }}>
                          {/* Client header */}
                          <button
                            onClick={() => toggleClientExpanded(clientName)}
                            className="w-full px-4 py-3 flex justify-between items-center hover:opacity-90"
                            style={{ backgroundColor: '#dbeafe' }}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-gray-500">{isClientExpanded ? '▼' : '▶'}</span>
                              <span className="font-bold text-lg" style={{ color: '#3d59ab' }}>{clientName}</span>
                              <span className="text-sm text-gray-500">({clientWeekIds.length} week{clientWeekIds.length !== 1 ? 's' : ''})</span>
                            </div>
                            <span className="font-bold text-lg" style={{ color: '#22c55e' }}>${client.total.toFixed(2)}</span>
                          </button>

                          {/* Weeks within client */}
                          {isClientExpanded && (
                            <div className="border-t" style={{ borderColor: '#3d59ab' }}>
                              {clientWeekIds.map(weekId => {
                                const weekInfo = client.weeks[weekId];
                                const rowKey = `${clientName}_${weekId}`;
                                const isWeekExpanded = expandedClientWeeks[rowKey] || false;

                                return (
                                  <div key={weekId} className="border-b last:border-b-0" style={{ borderColor: '#ebb582' }}>
                                    {/* Week header */}
                                    <button
                                      onClick={() => toggleClientWeekExpanded(rowKey)}
                                      className="w-full px-4 py-2 flex justify-between items-center hover:opacity-90"
                                      style={{ backgroundColor: '#f9f9ed' }}
                                    >
                                      <div className="flex items-center gap-3 pl-4">
                                        <span className="text-gray-400">{isWeekExpanded ? '▼' : '▶'}</span>
                                        <span className="text-sm font-medium text-gray-700">{weekInfo.label}</span>
                                      </div>
                                      <span className="font-bold" style={{ color: '#22c55e' }}>${weekInfo.total.toFixed(2)}</span>
                                    </button>

                                    {/* Meal details */}
                                    {isWeekExpanded && (
                                      <div className="p-3 pl-8 space-y-2 bg-white">
                                        {weekInfo.meals.map((meal, mealIdx) => (
                                          <div key={mealIdx} className="p-2 rounded text-sm" style={{ backgroundColor: '#fafafa' }}>
                                            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-1">
                                              {meal.dishes.filter(d => d.type !== 'extra').map((dish, i) => (
                                                <span key={i} className="inline-flex items-center gap-1">
                                                  <span className="font-medium">{dish.name}</span>
                                                  <span className="text-gray-500">(${dish.costPerPortion.toFixed(2)})</span>
                                                  {i < meal.dishes.filter(d => d.type !== 'extra').length - 1 && (
                                                    <span className="text-gray-300 ml-1">+</span>
                                                  )}
                                                </span>
                                              ))}
                                            </div>
                                            {meal.dishes.filter(d => d.type === 'extra').length > 0 && (
                                              <div className="text-gray-500 text-xs mb-1">
                                                Extras: {meal.dishes.filter(d => d.type === 'extra').map((d, i) => (
                                                  <span key={i}>{d.name} (${d.costPerPortion.toFixed(2)}){i < meal.dishes.filter(x => x.type === 'extra').length - 1 ? ', ' : ''}</span>
                                                ))}
                                              </div>
                                            )}
                                            <div className="flex justify-between items-center pt-1 border-t border-gray-200 mt-1">
                                              <span className="text-gray-600">
                                                ${meal.costPerPortion.toFixed(2)}/portion × {meal.portions}
                                              </span>
                                              <span className="font-medium" style={{ color: '#22c55e' }}>
                                                ${meal.total.toFixed(2)}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// Billing & Dates Section Component
function BillingDatesSection({ clients, updateClients, blockedDates, updateBlockedDates, saveDeliveryDatesToSupabase }) {
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const today = new Date();

  const activeClients = clients.filter(c => c.status === 'active');
  const pausedClients = clients.filter(c => c.status === 'paused');

  const updateClientField = (clientName, field, value) => {
    const updated = clients.map(c =>
      c.name === clientName ? { ...c, [field]: value } : c
    );
    updateClients(updated);
  };

  const updateDeliveryDate = async (clientName, index, value) => {
    const client = clients.find(c => c.name === clientName);
    if (!client) {
      console.error('[deliveryDates] client not found by name:', clientName);
      return;
    }

    const dates = [...(client.deliveryDates || ['', '', '', ''])];
    // Ensure we have 4 slots
    while (dates.length < 4) dates.push('');
    dates[index] = value;
    // Sort non-empty dates and filter out empty ones, then pad back to 4
    const sortedDates = dates.filter(d => d).sort();
    while (sortedDates.length < 4) sortedDates.push('');

    // Update local state
    updateClientField(clientName, 'deliveryDates', sortedDates);

    // Save to Supabase if available
    if (saveDeliveryDatesToSupabase && client.id) {
      await saveDeliveryDatesToSupabase(client.id, clientName, sortedDates);
    }
  };

  const handleInvoicePaid = (clientName, isPaid) => {
    const updated = clients.map(c => {
      if (c.name === clientName) {
        if (isPaid) {
          // When marking as paid, clear the honeybook link for next invoice
          return { ...c, invoicePaid: true, honeyBookLink: '' };
        } else {
          return { ...c, invoicePaid: false };
        }
      }
      return c;
    });
    updateClients(updated);
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const toggleBlockedDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    if (blockedDates.includes(dateStr)) {
      updateBlockedDates(blockedDates.filter(d => d !== dateStr));
    } else {
      updateBlockedDates([...blockedDates, dateStr]);
    }
  };

  const prevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* All Clients - Billing & Dates */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-2" style={{ color: '#3d59ab' }}>
          <Calendar className="inline mr-2" size={28} />
          Client Billing & Dates
        </h2>
        <p className="text-gray-600 mb-4">
          Set delivery dates, bill due dates, and invoice links for each client
        </p>

        {/* Cycle color legend */}
        <div className="mb-4 p-3 rounded-lg bg-gray-50 border">
          <p className="text-sm font-medium text-gray-700 mb-2">Billing Cycle Colors</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#dcfce7', border: '2px solid #22c55e' }}></span>
              Cycle 1
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#dbeafe', border: '2px solid #3b82f6' }}></span>
              Cycle 2
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#f3e8ff', border: '2px solid #a855f7' }}></span>
              Cycle 3
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 h-4 rounded" style={{ backgroundColor: '#fef3c7', border: '2px solid #f59e0b' }}></span>
              Cycle 4
            </span>
            <span className="text-gray-500 ml-2">Due date starts new cycle → 4 deliveries per cycle</span>
          </div>
        </div>

        <div className="space-y-4">
          {activeClients.map((client, idx) => {
            const deliveryDates = client.deliveryDates || ['', '', '', ''];
            // Ensure we have exactly 4 slots for display
            const displayDates = [...deliveryDates];
            while (displayDates.length < 4) displayDates.push('');

            // Calculate billing cycles for delivery dates
            // Cycle colors: green, blue, purple, amber (repeating)
            const cycleColors = [
              { bg: '#dcfce7', border: '#22c55e', text: '#166534' }, // Green - Cycle 1
              { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }, // Blue - Cycle 2
              { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' }, // Purple - Cycle 3
              { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }, // Amber - Cycle 4
            ];

            // Get cycle for a delivery date based on billDueDate
            const getDateCycle = (dateStr) => {
              if (!dateStr || !client.billDueDate) return null;
              const deliveryDate = new Date(dateStr + 'T12:00:00');
              const dueDate = new Date(client.billDueDate + 'T12:00:00');

              // If delivery is before due date, it's from a previous cycle
              if (deliveryDate < dueDate) {
                // Calculate how many 4-week cycles back
                const daysDiff = Math.floor((dueDate - deliveryDate) / (1000 * 60 * 60 * 24));
                const weeksBack = Math.ceil(daysDiff / 7);
                const cyclesBack = Math.ceil(weeksBack / 4);
                return ((4 - (cyclesBack % 4)) % 4); // Previous cycle
              }

              // Days since due date
              const daysSinceDue = Math.floor((deliveryDate - dueDate) / (1000 * 60 * 60 * 24));
              // Roughly 4 deliveries per cycle (weekly = 4 weeks = 28 days)
              const cycleNum = Math.floor(daysSinceDue / 28);
              return cycleNum % 4;
            };

            return (
              <div
                key={idx}
                className="p-4 rounded-lg border-2"
                style={{ borderColor: '#ebb582', backgroundColor: '#f9f9ed' }}
              >
                {/* Client Name Row */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg" style={{ color: '#3d59ab' }}>
                    {client.displayName || client.name}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {client.mealsPerWeek} meals/week • {client.portions || 1} portions
                  </span>
                </div>

                {/* Delivery Dates Row */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Next 4 Delivery Dates
                    {client.billDueDate && (
                      <span className="text-xs text-gray-500 ml-2">
                        (Cycle starts from due date: {new Date(client.billDueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {displayDates.slice(0, 4).map((date, i) => {
                      const cycleIdx = getDateCycle(date);
                      const cycleStyle = cycleIdx !== null ? cycleColors[cycleIdx] : null;

                      return (
                        <div key={i} className="relative">
                          <input
                            type="date"
                            value={date || ''}
                            onChange={(e) => updateDeliveryDate(client.name, i, e.target.value)}
                            className="w-full px-3 py-2 border-2 rounded-lg text-sm"
                            style={{
                              borderColor: cycleStyle ? cycleStyle.border : '#ebb582',
                              backgroundColor: cycleStyle ? cycleStyle.bg : 'white',
                              color: cycleStyle ? cycleStyle.text : 'inherit'
                            }}
                          />
                          {cycleStyle && (
                            <span
                              className="absolute -top-2 -right-2 text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: cycleStyle.border, color: 'white' }}
                            >
                              C{cycleIdx + 1}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bill Due Date & Invoice Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Bill Due Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Bill Due Date
                    </label>
                    <input
                      type="date"
                      value={client.billDueDate || ''}
                      onChange={(e) => updateClientField(client.name, 'billDueDate', e.target.value)}
                      className="w-full px-3 py-2 border-2 rounded-lg text-sm"
                      style={{ borderColor: '#ebb582' }}
                    />
                  </div>

                  {/* Honeybook Link */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Link (Honeybook)
                    </label>
                    <input
                      type="url"
                      value={client.honeyBookLink || ''}
                      onChange={(e) => updateClientField(client.name, 'honeyBookLink', e.target.value)}
                      placeholder="Paste invoice link..."
                      className="w-full px-3 py-2 border-2 rounded-lg text-sm"
                      style={{ borderColor: '#ebb582' }}
                    />
                  </div>

                  {/* Invoice Paid Checkbox */}
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white">
                      <input
                        type="checkbox"
                        checked={client.invoicePaid || false}
                        onChange={(e) => handleInvoicePaid(client.name, e.target.checked)}
                        className="w-5 h-5 rounded border-2"
                        style={{ accentColor: '#22c55e' }}
                      />
                      <span className="text-sm font-medium">
                        {client.invoicePaid ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <Check size={16} /> Invoice Paid
                          </span>
                        ) : (
                          <span className="text-gray-600">Mark as Paid</span>
                        )}
                      </span>
                    </label>
                  </div>
                </div>

                {/* Status indicators */}
                {client.billDueDate && new Date(client.billDueDate + 'T12:00:00') < today && !client.invoicePaid && (
                  <div className="mt-2 p-2 rounded bg-red-100 text-red-700 text-sm flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Invoice overdue!
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Paused Clients */}
      {pausedClients.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-2" style={{ color: '#3d59ab' }}>
            Paused Clients ({pausedClients.length})
          </h2>
          <div className="space-y-2">
            {pausedClients.map((client, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg flex items-center justify-between bg-gray-50 border border-gray-200"
              >
                <div>
                  <h3 className="font-medium">{client.displayName || client.name}</h3>
                  {client.pausedDate && (
                    <p className="text-sm text-gray-500">
                      Paused: {new Date(client.pausedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                  {client.billingNotes && (
                    <p className="text-sm text-gray-500">{client.billingNotes}</p>
                  )}
                </div>
                <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600">
                  Paused
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Availability Calendar - Collapsed */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Calendar size={24} style={{ color: '#3d59ab' }} />
            <span className="text-lg font-bold" style={{ color: '#3d59ab' }}>
              Availability Calendar
            </span>
            {blockedDates.length > 0 && (
              <span className="text-sm px-2 py-1 rounded bg-red-100 text-red-700">
                {blockedDates.length} blocked
              </span>
            )}
          </div>
          {showCalendar ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
        </button>

        {showCalendar && (
          <div className="p-6 border-t">
            <p className="text-gray-600 mb-4">
              Click dates to block them from client selection
            </p>

            {/* Calendar navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-2 rounded hover:bg-gray-100"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="font-bold">
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={nextMonth}
                className="p-2 rounded hover:bg-gray-100"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
              {getDaysInMonth(calendarMonth).map((date, idx) => {
                if (!date) return <div key={`empty-${idx}`} />;
                const dateStr = date.toISOString().split('T')[0];
                const isBlocked = blockedDates.includes(dateStr);
                const isPast = date < new Date(today.toISOString().split('T')[0]);
                const isToday = dateStr === today.toISOString().split('T')[0];

                return (
                  <button
                    key={dateStr}
                    onClick={() => !isPast && toggleBlockedDate(date)}
                    disabled={isPast}
                    className={`p-2 rounded-lg text-center transition-colors ${
                      isPast
                        ? 'text-gray-300 cursor-not-allowed'
                        : isBlocked
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : isToday
                        ? 'bg-blue-100 hover:bg-blue-200'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {/* Blocked dates list */}
            {blockedDates.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-medium text-red-700 mb-2">
                  {blockedDates.length} date{blockedDates.length > 1 ? 's' : ''} blocked:
                </p>
                <div className="flex flex-wrap gap-2">
                  {blockedDates.sort().map(date => (
                    <span
                      key={date}
                      className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 flex items-center gap-1"
                    >
                      {formatDate(date)}
                      <button onClick={() => updateBlockedDates(blockedDates.filter(d => d !== date))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Styled Menu Card Component - matches client portal
function StyledMenuCard({ client, date, menuItems }) {
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).toUpperCase();

  // Extract meals from menu items
  const meals = [];
  menuItems.forEach(item => {
    const meal = {
      protein: item.protein,
      sides: [item.veg, item.starch].filter(Boolean)
    };
    if (meal.protein || meal.sides.length > 0) {
      meals.push(meal);
    }
    if (item.extras) {
      item.extras.forEach(extra => {
        meals.push({ protein: extra, sides: [], isExtra: true });
      });
    }
  });

  const displayName = client.displayName || client.name;

  return (
    <div className="overflow-hidden shadow-lg" style={{ backgroundColor: '#fff' }}>
      {/* Header with pattern background */}
      <div
        className="relative px-4 pt-6 pb-8"
        style={{
          backgroundColor: '#f9f9ed',
          backgroundImage: 'url(/pattern4.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <p
          className="text-center mb-2"
          style={{
            fontFamily: '"Glacial Indifference", sans-serif',
            fontSize: '12px',
            letterSpacing: '0.3em',
            color: '#5a5a5a'
          }}
        >
          GOLDFINCH CHEF SERVICES
        </p>

        <h2
          className="text-center mb-3"
          style={{
            color: '#3d59ab',
            fontFamily: '"Poller One", cursive',
            fontSize: '18px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            textDecoration: 'underline',
            textDecorationColor: '#3d59ab',
            textUnderlineOffset: '4px'
          }}
        >
          {displayName}'s Menu
        </h2>

        <p
          className="text-center mb-4"
          style={{
            color: '#5a5a5a',
            fontFamily: '"Beth Ellen", cursive',
            fontSize: '12px'
          }}
        >
          here's what to expect on your plate!
        </p>

        <div className="flex items-center justify-center gap-3">
          <img
            src="/goldfinch5.png"
            alt="Goldfinch"
            className="w-12 h-12 object-contain"
          />
          <p
            style={{
              fontFamily: '"Glacial Indifference", sans-serif',
              fontSize: '14px',
              letterSpacing: '0.2em',
              color: '#5a5a5a'
            }}
          >
            {displayDate}
          </p>
        </div>
      </div>

      {/* Meals section */}
      <div
        className="px-6 py-8"
        style={{ backgroundColor: '#d9a87a' }}
      >
        <div className="space-y-8">
          {meals.map((meal, idx) => (
            <div key={idx} className="text-center">
              {meal.protein && (
                <h3
                  style={{
                    color: '#ffffff',
                    fontFamily: '"Glacial Indifference", sans-serif',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    marginBottom: meal.sides.length > 0 ? '0.5rem' : 0
                  }}
                >
                  {meal.protein}
                </h3>
              )}
              {meal.sides.length > 0 && (
                <p
                  style={{
                    color: '#f5e6d3',
                    fontFamily: '"Glacial Indifference", sans-serif',
                    fontSize: '0.85rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase'
                  }}
                >
                  {meal.sides.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        className="relative px-6 py-6"
        style={{
          backgroundColor: '#f9f9ed',
          fontFamily: '"Glacial Indifference", sans-serif'
        }}
      >
        <h4
          className="mb-3"
          style={{
            color: '#3d59ab',
            fontFamily: '"Poller One", cursive',
            fontSize: '1.1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}
        >
          Get Ready!
        </h4>
        <p
          className="mb-4 pr-20"
          style={{
            color: '#5a5a5a',
            fontSize: '0.9rem',
            lineHeight: '1.5'
          }}
        >
          Remember to put out bags, containers, and ice packs. And get excited – great food is on the way!
        </p>
        <img
          src="/stemflower.png"
          alt=""
          className="absolute right-4 bottom-4 h-20 object-contain"
        />
      </div>
    </div>
  );
}

// Menu Approval Section Component
function MenuApprovalSection({ clients, menuItems, updateMenuItems, lockWeekWithSnapshot, weeklyTasks = {}, clientPortalData = {}, recipes = {} }) {
  const { toast, confirm } = useNotification();
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  // State for meal pairing for clients who picked ingredients
  const [mealPairings, setMealPairings] = useState({});

  // Get the Monday of current week as the week identifier
  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  };

  const weekStart = getWeekStart();
  const tasks = weeklyTasks[weekStart] || {};

  // Check if a client's weekly tasks are complete
  const areClientTasksComplete = (clientName) => {
    const clientTasks = tasks[clientName] || {};
    return clientTasks.menusPlanned && clientTasks.menusSent;
  };

  // Get task status for display
  const getTaskStatus = (clientName) => {
    const clientTasks = tasks[clientName] || {};
    return {
      menusPlanned: !!clientTasks.menusPlanned,
      menusSent: !!clientTasks.menusSent,
      complete: clientTasks.menusPlanned && clientTasks.menusSent
    };
  };

  // Get client payment/subscription status
  // Returns: { status, daysOverdue, hasDates, canApprove, warning, blocked }
  const getClientPaymentStatus = (clientName) => {
    const client = clients.find(c => c.name === clientName);
    if (!client) {
      return { status: 'unknown', daysOverdue: 0, hasDates: false, canApprove: false, warning: null, blocked: true };
    }

    const hasDates = client.deliveryDates && client.deliveryDates.length > 0;

    // Check if explicitly paused
    if (client.status === 'paused') {
      return {
        status: 'paused',
        daysOverdue: 0,
        hasDates,
        canApprove: false,
        warning: null,
        blocked: true,
        message: 'Subscription paused — cannot send menu'
      };
    }

    // Calculate days overdue from billDueDate
    let daysOverdue = 0;
    if (client.billDueDate) {
      const dueDate = new Date(client.billDueDate + 'T12:00:00');
      const now = new Date();
      const diffTime = now - dueDate;
      daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    // 8+ days overdue = Paused (blocked)
    if (daysOverdue >= 8) {
      return {
        status: 'paused',
        daysOverdue,
        hasDates,
        canApprove: false,
        warning: null,
        blocked: true,
        message: 'Subscription paused — cannot send menu'
      };
    }

    // 1-7 days overdue = Grace Period (warning but allowed)
    if (daysOverdue >= 1) {
      return {
        status: 'grace',
        daysOverdue,
        hasDates,
        canApprove: true,
        warning: `Invoice overdue (${daysOverdue} day${daysOverdue > 1 ? 's' : ''})`,
        blocked: false
      };
    }

    // Active but no dates set (warning but allowed)
    if (!hasDates) {
      return {
        status: 'active',
        daysOverdue: 0,
        hasDates: false,
        canApprove: true,
        warning: 'Delivery dates not set',
        blocked: false
      };
    }

    // Active with dates set (all good)
    return {
      status: 'active',
      daysOverdue: 0,
      hasDates: true,
      canApprove: true,
      warning: null,
      blocked: false
    };
  };

  // Get clients with ingredient picks (chefChoice = false who submitted picks)
  const getClientsWithPicks = () => {
    return clients.filter(client => {
      if (client.status !== 'active' || client.chefChoice !== false) return false;
      const portalInfo = clientPortalData[client.name];
      return portalInfo?.ingredientPicks?.submittedAt;
    }).map(client => {
      const picks = clientPortalData[client.name]?.ingredientPicks || {};
      return {
        client,
        picks,
        mealsPerWeek: picks.mealsPerWeek || client.mealsPerWeek || 3
      };
    });
  };

  // Initialize meal pairing for a client
  const initializePairing = (clientName, mealsPerWeek) => {
    if (mealPairings[clientName]) return;
    const meals = Array(mealsPerWeek).fill(null).map(() => ({
      protein: '',
      veg: '',
      starch: ''
    }));
    setMealPairings(prev => ({ ...prev, [clientName]: meals }));
  };

  // Update a meal pairing
  const updateMealPairing = (clientName, mealIndex, field, value) => {
    setMealPairings(prev => {
      const meals = [...(prev[clientName] || [])];
      meals[mealIndex] = { ...meals[mealIndex], [field]: value };
      return { ...prev, [clientName]: meals };
    });
  };

  // Check if all meals are paired for a client
  const areAllMealsPaired = (clientName) => {
    const meals = mealPairings[clientName];
    if (!meals) return false;
    return meals.every(m => m.protein && m.veg && m.starch);
  };

  // Get available options for a field (items not yet used in other meals)
  const getAvailableOptions = (clientName, picks, field, currentMealIndex) => {
    const meals = mealPairings[clientName] || [];
    // Map field names to picks array names
    const fieldToPicksKey = {
      'protein': 'proteins',
      'veg': 'veggies',
      'veggie': 'veggies',
      'starch': 'starches'
    };
    const allOptions = picks[fieldToPicksKey[field]] || [];
    const usedInOtherMeals = meals
      .filter((_, idx) => idx !== currentMealIndex)
      .map(m => m[field === 'veggie' ? 'veg' : field])
      .filter(Boolean);
    return allOptions.filter(opt => !usedInOtherMeals.includes(opt));
  };

  // Convert paired meals to menu items
  const createMenuItemsFromPairing = (client, meals, date) => {
    const portions = client.portions || client.persons || 1;
    return meals.map((meal, idx) => ({
      id: `${client.name}-${date}-${idx}-${Date.now()}`,
      clientName: client.name,
      date,
      portions,
      protein: meal.protein,
      veg: meal.veg,
      starch: meal.starch,
      extras: [],
      approved: false,
      fromClientPicks: true
    }));
  };

  // Approve paired meals for a client
  const approvePairedMeals = (client) => {
    const meals = mealPairings[client.name];
    if (!meals || !areAllMealsPaired(client.name)) {
      toast('Please pair all meals before approving.', 'warning');
      return;
    }

    // Get the next delivery date for this client
    const portalDates = clientPortalData[client.name]?.selectedDates || [];
    const clientDates = portalDates.length > 0 ? portalDates : (client.deliveryDates || []);
    const nextDate = clientDates.find(d => d >= today);

    if (!nextDate) {
      toast('No upcoming delivery date found for this client.', 'warning');
      return;
    }

    const newItems = createMenuItemsFromPairing(client, meals, nextDate);
    updateMenuItems([...menuItems, ...newItems]);

    // Clear the pairing state for this client
    setMealPairings(prev => {
      const updated = { ...prev };
      delete updated[client.name];
      return updated;
    });

    toast(`Menu created for ${client.displayName || client.name}! It will appear in the approval queue below.`, 'success');
  };

  const clientsWithPicks = getClientsWithPicks();

  // Get unapproved menu items grouped by date, then by client
  const getUnapprovedMenus = () => {
    const unapproved = menuItems.filter(item => !item.approved && item.date >= today);
    const byDate = {};

    unapproved.forEach(item => {
      if (!byDate[item.date]) byDate[item.date] = {};
      if (!byDate[item.date][item.clientName]) {
        byDate[item.date][item.clientName] = [];
      }
      byDate[item.date][item.clientName].push(item);
    });

    // Convert to array sorted by date
    return Object.entries(byDate)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, clientMenus]) => ({
        date,
        weekId: getWeekIdFromDate(date),
        menus: Object.entries(clientMenus)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([clientName, items]) => ({
            clientName,
            items
          }))
      }));
  };

  // Approve a single client's menu
  const approveClientMenu = (clientName, date) => {
    const weekId = getWeekIdFromDate(date);

    const updated = menuItems.map(item => {
      if (item.clientName === clientName && item.date === date && !item.approved) {
        return { ...item, approved: true };
      }
      return item;
    });

    updateMenuItems(updated);
    lockWeekWithSnapshot(weekId);
  };

  // Approve all menus (only those with complete tasks AND valid payment status)
  const approveAndPushAll = async () => {
    const readyClients = [];
    const taskIncompleteClients = [];
    const pausedClients = [];
    const warningClients = [];

    unapprovedMenus.forEach(({ menus }) => {
      menus.forEach(({ clientName }) => {
        const paymentStatus = getClientPaymentStatus(clientName);
        const tasksComplete = areClientTasksComplete(clientName);

        if (paymentStatus.blocked) {
          pausedClients.push(clientName);
        } else if (!tasksComplete) {
          taskIncompleteClients.push(clientName);
        } else {
          readyClients.push(clientName);
          if (paymentStatus.warning) {
            warningClients.push({ clientName, warning: paymentStatus.warning });
          }
        }
      });
    });

    if (readyClients.length === 0) {
      let errorMsg = 'No menus ready to approve.';
      if (pausedClients.length > 0) {
        errorMsg += `\n\n${pausedClients.length} client(s) have paused subscriptions.`;
      }
      if (taskIncompleteClients.length > 0) {
        errorMsg += `\n\n${taskIncompleteClients.length} client(s) have incomplete tasks.`;
      }
      toast(errorMsg, 'warning');
      return;
    }

    let message = `Approve ${readyClients.length} menu(s) and push to client portals?\n\nThis will lock the week and menus will appear in KDS for cooking.`;

    if (warningClients.length > 0) {
      message += `\n\n⚠️ Warnings for ${warningClients.length} client(s):`;
      warningClients.slice(0, 3).forEach(({ clientName, warning }) => {
        message += `\n• ${clientName}: ${warning}`;
      });
      if (warningClients.length > 3) {
        message += `\n• ...and ${warningClients.length - 3} more`;
      }
    }

    if (taskIncompleteClients.length > 0 || pausedClients.length > 0) {
      message += '\n\nWill NOT be approved:';
      if (taskIncompleteClients.length > 0) {
        message += `\n• ${taskIncompleteClients.length} with incomplete tasks`;
      }
      if (pausedClients.length > 0) {
        message += `\n• ${pausedClients.length} with paused subscriptions`;
      }
    }

    if (!(await confirm(message))) {
      return;
    }

    // Get unique week IDs and approve only ready clients (tasks complete AND not blocked)
    const weekIds = new Set();
    const updated = menuItems.map(item => {
      if (!item.approved && item.date >= today) {
        const paymentStatus = getClientPaymentStatus(item.clientName);
        if (areClientTasksComplete(item.clientName) && paymentStatus.canApprove) {
          weekIds.add(getWeekIdFromDate(item.date));
          return { ...item, approved: true };
        }
      }
      return item;
    });

    updateMenuItems(updated);

    // Lock all affected weeks
    weekIds.forEach(weekId => {
      lockWeekWithSnapshot(weekId);
    });

    toast(`${readyClients.length} menu(s) approved and pushed to client portals!`, 'success');
  };

  // Send a client's menu back for editing (removes from approval queue)
  const sendBackForEdit = async (clientName, date) => {
    if (!(await confirm(`Send ${clientName}'s menu back for editing?\n\nThis will remove it from the approval queue. You can recreate it in Menu Planner.`))) {
      return;
    }

    // Remove menu items for this client on this date
    const updated = menuItems.filter(item =>
      !(item.clientName === clientName && item.date === date && !item.approved)
    );

    updateMenuItems(updated);

    // Navigate to menu planner
    navigate('/?tab=menu');
  };

  const unapprovedMenus = getUnapprovedMenus();
  const totalMenus = unapprovedMenus.reduce((sum, d) => sum + d.menus.length, 0);

  // Count ready menus (tasks complete AND payment allows approval)
  const readyMenus = unapprovedMenus.reduce((sum, d) =>
    sum + d.menus.filter(m => {
      const paymentStatus = getClientPaymentStatus(m.clientName);
      return areClientTasksComplete(m.clientName) && paymentStatus.canApprove;
    }).length, 0
  );

  // Count blocked menus (paused clients)
  const blockedMenus = unapprovedMenus.reduce((sum, d) =>
    sum + d.menus.filter(m => getClientPaymentStatus(m.clientName).blocked).length, 0
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#3d59ab' }}>
              Menu Approval
            </h2>
            <p className="text-gray-600">
              Review all menus before pushing to client portals. Approving will lock the week and send menus to KDS.
            </p>
          </div>
          {totalMenus > 0 && (
            <button
              onClick={approveAndPushAll}
              disabled={readyMenus === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-opacity ${
                readyMenus > 0 ? 'hover:opacity-90' : 'opacity-50 cursor-not-allowed'
              }`}
              style={{ backgroundColor: '#10b981' }}
              title={readyMenus === 0 ? 'Complete weekly tasks to enable approval' : ''}
            >
              <Check size={20} />
              Approve & Push Ready ({readyMenus}/{totalMenus})
            </button>
          )}
        </div>

        {unapprovedMenus.length === 0 && clientsWithPicks.length === 0 ? (
          <div className="text-center py-12">
            <Check size={48} className="mx-auto mb-4 text-green-500" />
            <p className="text-gray-600">All menus have been approved!</p>
            <p className="text-sm text-gray-400 mt-2">
              Create new menus in the Menu tab, then come back here to approve them.
            </p>
            <Link
              to="/?tab=menu"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg border-2 hover:bg-gray-50"
              style={{ borderColor: '#ebb582' }}
            >
              <Utensils size={18} />
              Go to Menu Planner
            </Link>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {totalMenus > 0 && `${totalMenus} menu${totalMenus > 1 ? 's' : ''} pending approval`}
            {totalMenus > 0 && clientsWithPicks.length > 0 && ' • '}
            {clientsWithPicks.length > 0 && `${clientsWithPicks.length} client${clientsWithPicks.length > 1 ? 's' : ''} with ingredient picks to pair`}
          </p>
        )}
      </div>

      {/* Client Ingredient Picks Section */}
      {clientsWithPicks.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2" style={{ color: '#3d59ab' }}>
            <ShoppingCart size={24} />
            Client Ingredient Picks
          </h3>
          <p className="text-gray-600 mb-6">
            These clients picked their ingredients. Pair them into meals, then create their menu.
          </p>

          <div className="space-y-6">
            {clientsWithPicks.map(({ client, picks, mealsPerWeek }) => {
              // Initialize pairing state if needed
              if (!mealPairings[client.name]) {
                initializePairing(client.name, mealsPerWeek);
              }
              const meals = mealPairings[client.name] || [];
              const allPaired = areAllMealsPaired(client.name);

              return (
                <div
                  key={client.name}
                  className="border-2 rounded-lg overflow-hidden"
                  style={{ borderColor: '#ebb582' }}
                >
                  {/* Client header */}
                  <div className="p-4" style={{ backgroundColor: '#f9f9ed' }}>
                    <h4 className="font-bold text-lg" style={{ color: '#3d59ab' }}>
                      {client.displayName || client.name}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {mealsPerWeek} meals • {client.portions || client.persons || 1} portions
                    </p>
                    {picks.notes && (
                      <p className="text-sm text-amber-700 mt-2 bg-amber-50 p-2 rounded">
                        Note: {picks.notes}
                      </p>
                    )}
                  </div>

                  {/* Client's picks summary */}
                  <div className="p-4 border-t grid grid-cols-3 gap-4 text-sm" style={{ borderColor: '#ebb582' }}>
                    <div>
                      <p className="font-medium text-red-600 mb-1">Proteins</p>
                      {picks.proteins?.map((p, i) => (
                        <p key={i} className="text-gray-700">{p}</p>
                      ))}
                    </div>
                    <div>
                      <p className="font-medium text-green-600 mb-1">Veggies</p>
                      {picks.veggies?.map((v, i) => (
                        <p key={i} className="text-gray-700">{v}</p>
                      ))}
                    </div>
                    <div>
                      <p className="font-medium text-amber-600 mb-1">Starches</p>
                      {picks.starches?.map((s, i) => (
                        <p key={i} className="text-gray-700">{s}</p>
                      ))}
                    </div>
                  </div>

                  {/* Meal pairing interface */}
                  <div className="p-4 border-t" style={{ borderColor: '#ebb582' }}>
                    <p className="font-medium mb-3" style={{ color: '#3d59ab' }}>Pair into Meals:</p>
                    <div className="space-y-3">
                      {meals.map((meal, mealIdx) => (
                        <div key={mealIdx} className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-500 w-16">Meal {mealIdx + 1}:</span>
                          <select
                            value={meal.protein}
                            onChange={(e) => updateMealPairing(client.name, mealIdx, 'protein', e.target.value)}
                            className="flex-1 min-w-[120px] p-2 border rounded text-sm"
                            style={{ borderColor: meal.protein ? '#22c55e' : '#ebb582' }}
                          >
                            <option value="">Protein</option>
                            {getAvailableOptions(client.name, picks, 'protein', mealIdx).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <select
                            value={meal.veg}
                            onChange={(e) => updateMealPairing(client.name, mealIdx, 'veg', e.target.value)}
                            className="flex-1 min-w-[120px] p-2 border rounded text-sm"
                            style={{ borderColor: meal.veg ? '#22c55e' : '#ebb582' }}
                          >
                            <option value="">Veggie</option>
                            {getAvailableOptions(client.name, picks, 'veggie', mealIdx).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          <select
                            value={meal.starch}
                            onChange={(e) => updateMealPairing(client.name, mealIdx, 'starch', e.target.value)}
                            className="flex-1 min-w-[120px] p-2 border rounded text-sm"
                            style={{ borderColor: meal.starch ? '#22c55e' : '#ebb582' }}
                          >
                            <option value="">Starch</option>
                            {getAvailableOptions(client.name, picks, 'starch', mealIdx).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Create menu button */}
                  <div className="p-4 border-t flex justify-end" style={{ borderColor: '#ebb582' }}>
                    <button
                      onClick={() => approvePairedMeals(client)}
                      disabled={!allPaired}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                        allPaired
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <Plus size={16} />
                      Create Menu
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Group by date */}
      {unapprovedMenus.map(({ date, weekId, menus }) => (
        <div key={date} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold" style={{ color: '#3d59ab' }}>
              {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </h3>
            <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
              Week {weekId}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menus.map(({ clientName, items }) => {
              const client = clients.find(c => c.name === clientName) || { name: clientName };
              const taskStatus = getTaskStatus(clientName);
              const paymentStatus = getClientPaymentStatus(clientName);
              const canApprove = taskStatus.complete && paymentStatus.canApprove;
              const isPaused = paymentStatus.blocked;

              return (
                <div
                  key={`${clientName}-${date}`}
                  className={`bg-white rounded-lg shadow-lg overflow-hidden ${isPaused ? 'opacity-60' : ''}`}
                >
                  <StyledMenuCard
                    client={client}
                    date={date}
                    menuItems={items}
                  />

                  {/* Payment/Subscription Status - show if warning or blocked */}
                  {(paymentStatus.warning || paymentStatus.blocked) && (
                    <div
                      className="px-3 py-2 border-t"
                      style={{
                        borderColor: '#ebb582',
                        backgroundColor: isPaused ? '#fef2f2' : paymentStatus.status === 'grace' ? '#fef3c7' : '#fffbeb'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className={isPaused ? 'text-red-600' : 'text-amber-600'} />
                        <span className={`text-xs font-medium ${isPaused ? 'text-red-700' : 'text-amber-700'}`}>
                          {paymentStatus.message || paymentStatus.warning}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Task Status */}
                  <div className="px-3 py-2 border-t" style={{ borderColor: '#ebb582', backgroundColor: taskStatus.complete ? '#f0fdf4' : '#fef3c7' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: taskStatus.complete ? '#15803d' : '#92400e' }}>
                        Weekly Tasks
                      </span>
                      {!taskStatus.complete && (
                        <Link
                          to="/admin?section=subscriptions"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          Complete Tasks
                          <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>
                    <div className="flex gap-3 mt-1">
                      <span className={`text-xs flex items-center gap-1 ${taskStatus.menusPlanned ? 'text-green-600' : 'text-gray-400'}`}>
                        {taskStatus.menusPlanned ? <Check size={12} /> : <X size={12} />}
                        Menu Planned
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${taskStatus.menusSent ? 'text-green-600' : 'text-gray-400'}`}>
                        {taskStatus.menusSent ? <Check size={12} /> : <X size={12} />}
                        Menu Sent
                      </span>
                    </div>
                  </div>

                  {/* Approve / Edit buttons */}
                  <div className="p-3 border-t flex justify-between gap-2" style={{ borderColor: '#ebb582' }}>
                    <button
                      onClick={() => sendBackForEdit(clientName, date)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border-2 hover:bg-red-50 transition-colors"
                      style={{ borderColor: '#dc2626', color: '#dc2626' }}
                    >
                      <Edit3 size={16} />
                      Edit
                    </button>
                    {isPaused ? (
                      <span className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-500">
                        <X size={16} />
                        Blocked
                      </span>
                    ) : (
                      <button
                        onClick={() => canApprove && approveClientMenu(clientName, date)}
                        disabled={!canApprove}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          canApprove
                            ? 'bg-green-500 text-white hover:bg-green-600'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                        title={
                          isPaused
                            ? 'Subscription paused'
                            : !taskStatus.complete
                            ? 'Complete weekly tasks first'
                            : 'Approve and push to client portal'
                        }
                      >
                        <Check size={16} />
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bottom approve button for convenience */}
      {totalMenus > 0 && readyMenus > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <button
            onClick={approveAndPushAll}
            className="flex items-center gap-2 px-8 py-4 rounded-lg text-white font-medium shadow-lg hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#10b981' }}
          >
            <Check size={24} />
            Approve & Push Ready Menus ({readyMenus}/{totalMenus})
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { toast, confirm } = useNotification();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const {
    clients,
    drivers,
    menuItems,
    deliveryLog,
    readyForDelivery,
    clientPortalData,
    blockedDates,
    adminSettings,
    customTasks,
    weeklyTasks,
    recipes,
    masterIngredients,
    groceryBills,
    isLoaded,
    updateDrivers,
    updateBlockedDates,
    updateAdminSettings,
    updateCustomTasks,
    updateMenuItems,
    updateWeeklyTasks,
    updateRecipes,
    updateMasterIngredients,
    updateClients,
    updateGroceryBills,
    weeks,
    updateWeeks,
    lockWeekWithSnapshot
  } = useAdminData();

  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState('overview');
  const [newDriver, setNewDriver] = useState(DEFAULT_NEW_DRIVER);

  // Handle URL section parameter
  useEffect(() => {
    const sectionFromUrl = searchParams.get('section');
    if (sectionFromUrl === 'menu-approval' || sectionFromUrl === 'approvals') {
      setActiveSection('overview');
    } else if (sectionFromUrl === 'dashboard' || sectionFromUrl === 'tasks') {
      setActiveSection('overview');
    } else if (sectionFromUrl) {
      setActiveSection(sectionFromUrl);
    }
  }, [searchParams]);
  const [editingDriverIndex, setEditingDriverIndex] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [newTask, setNewTask] = useState({ title: '', notes: '', dueDate: '' });

  // Menu planning state
  const [menuDate, setMenuDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClients, setSelectedClients] = useState([]);
  const [newMenuItem, setNewMenuItem] = useState(DEFAULT_NEW_MENU_ITEM);
  const [selectedWeekId, setSelectedWeekId] = useState(() => getWeekIdFromDate(new Date().toISOString().split('T')[0]));

  // Fetch menus from Supabase when selectedWeekId changes
  useEffect(() => {
    if (!selectedWeekId) {
      return;
    }

    if (!isSupabaseMode() || !isConfigured()) {
      return;
    }

    const loadMenusForWeek = async () => {
      try {
        const { data, error } = await supabase
          .from('menus')
          .select('*')
          .eq('week_id', selectedWeekId)
          .order('meal_index', { ascending: true });

        if (error) {
          console.error('[AdminPage] menu fetch error:', error);
          return;
        }

        // Transform to app format
        const menus = (data || []).map(m => ({
          id: m.id,
          clientName: m.client_name,
          weekId: m.week_id,
          date: m.date,
          mealIndex: m.meal_index || 1,
          protein: m.protein || '',
          veg: m.veg || '',
          starch: m.starch || '',
          extras: m.extras || [],
          portions: m.portions || 1,
          approved: m.approved || false
        }));

        updateMenuItems(menus);
      } catch (err) {
        console.error('[AdminPage] menu fetch exception:', err);
      }
    };

    loadMenusForWeek();
  }, [selectedWeekId, updateMenuItems]);

  // Database migration state
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationReport, setMigrationReport] = useState(null);
  const [supabaseConnected, setSupabaseConnected] = useState(false);

  // Check Supabase connection on mount
  useEffect(() => {
    const checkSupabase = async () => {
      if (isConfigured()) {
        try {
          const connected = await checkConnection();
          setSupabaseConnected(connected);
          if (connected) {
            const status = await getMigrationStatus();
            setMigrationStatus(status);
          }
        } catch (e) {
          console.error('Error checking Supabase:', e);
          setSupabaseConnected(false);
        }
      }
    };
    checkSupabase();
  }, []);

  // Handle migration
  const handleMigration = async () => {
    if (isMigrating) return;

    if (!(await confirm('This will import all localStorage data to Supabase.\n\nExisting records will be updated (not duplicated).\n\nProceed?'))) {
      return;
    }

    setIsMigrating(true);
    setMigrationReport(null);

    try {
      const report = await runMigration();
      setMigrationReport(report);

      // Refresh status
      const status = await getMigrationStatus();
      setMigrationStatus(status);
    } catch (e) {
      setMigrationReport({ success: false, errors: [e.message] });
    } finally {
      setIsMigrating(false);
    }
  };

  // Unlock week by ID
  const unlockWeekById = (weekId) => {
    if (!weeks[weekId]) return;
    const updated = { ...weeks[weekId], status: 'unlocked' };
    updateWeeks({ ...weeks, [weekId]: updated });
  };

  // Recipe editing state
  const [newRecipe, setNewRecipe] = useState(DEFAULT_NEW_RECIPE);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const recipesFileRef = React.useRef();

  // Ingredient editing state
  const [newIngredient, setNewIngredient] = useState(DEFAULT_NEW_INGREDIENT);
  const [editingIngredientId, setEditingIngredientId] = useState(null);
  const [editingIngredientData, setEditingIngredientData] = useState(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const ingredientsFileRef = React.useRef();

  // Import handler for ingredients
  const importIngredientsCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    parseIngredientsCSV(file, (imported) => {
      // Merge with existing, avoiding duplicates by name
      const existingNames = new Set(masterIngredients.map(i => i.name.toLowerCase()));
      const newIngredients = imported.filter(i => !existingNames.has(i.name.toLowerCase()));
      updateMasterIngredients([...masterIngredients, ...newIngredients]);
      toast(`Imported ${newIngredients.length} new ingredient(s). ${imported.length - newIngredients.length} duplicate(s) skipped.`, 'success');
    }, (err) => toast('Error parsing CSV: ' + err.message, 'error'));
    e.target.value = '';
  };

  // Client management state
  const clientsFileRef = React.useRef();
  const [selectedClientForDetail, setSelectedClientForDetail] = useState(null);
  const [newClient, setNewClient] = useState({
    name: '', displayName: '', persons: 1,
    contacts: [{ name: '', email: '', phone: '', address: '' }],
    notes: '', mealsPerWeek: 0, frequency: 'weekly', status: 'active',
    pausedDate: '', honeyBookLink: '', billingNotes: '', deliveryDay: '', zone: '',
    pickup: false, planPrice: 0, serviceFee: 0, prepayDiscount: false,
    newClientFeePaid: false, paysOwnGroceries: false
  });

  // Grocery tracking state
  const [newGroceryBill, setNewGroceryBill] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    store: '',
    notes: ''
  });

  const today = new Date();
  const { start: weekStart, end: weekEnd } = getWeekBounds(today);

  // Dashboard calculations
  const getThisWeekDeliveries = () => {
    return readyForDelivery.filter(order => {
      const orderDate = new Date(order.date + 'T12:00:00');
      return orderDate >= weekStart && orderDate <= weekEnd;
    });
  };

  const getThisWeekCompleted = () => {
    return deliveryLog.filter(entry => {
      const entryDate = new Date(entry.date + 'T12:00:00');
      return entryDate >= weekStart && entryDate <= weekEnd;
    });
  };

  const getProblemsThisWeek = () => {
    return deliveryLog.filter(entry => {
      const entryDate = new Date(entry.date + 'T12:00:00');
      return entryDate >= weekStart && entryDate <= weekEnd && entry.problem;
    });
  };

  const getRenewalsThisWeek = () => {
    const now = new Date();
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    return clients.filter(client => {
      if (client.status !== 'active') return false;

      // Only show clients with billDueDate set and within next 7 days
      if (!client.billDueDate) return false;
      const dueDate = new Date(client.billDueDate + 'T12:00:00');
      return dueDate <= sevenDaysFromNow;
    }).sort((a, b) => new Date(a.billDueDate) - new Date(b.billDueDate));
  };

  const getSubstitutionRequests = () => {
    return Object.entries(clientPortalData)
      .filter(([_, data]) => data.substitutionRequest)
      .map(([clientName, data]) => ({ clientName, ...data.substitutionRequest }));
  };

  const getClientsNeedingMenus = () => {
    const todayStr = today.toISOString().split('T')[0];
    return clients.filter(client => {
      if (client.status !== 'active') return false;
      // Check if client has delivery this week
      if (!client.deliveryDay) return false;
      const dayNum = { 'Monday': 1, 'Tuesday': 2, 'Thursday': 4 }[client.deliveryDay];
      if (!dayNum) return false;
      // Check each day this week
      for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === dayNum && d >= today) {
          const dateStr = d.toISOString().split('T')[0];
          const hasMenu = readyForDelivery.some(o => o.clientName === client.name && o.date === dateStr);
          if (!hasMenu) return true;
        }
      }
      return false;
    });
  };

  const getPendingApprovals = () => {
    const todayStr = today.toISOString().split('T')[0];
    const unapproved = menuItems.filter(item => !item.approved && item.date >= todayStr);
    const uniqueMenus = new Set(unapproved.map(item => `${item.clientName}-${item.date}`));
    return uniqueMenus.size;
  };

  const getBagFollowups = () => {
    // Clients who had delivery but haven't returned bags (flagged in deliveryLog)
    return deliveryLog.filter(entry => {
      const entryDate = new Date(entry.date + 'T12:00:00');
      const daysSince = (today - entryDate) / (1000 * 60 * 60 * 24);
      return daysSince >= 3 && daysSince <= 10 && !entry.bagsReturned;
    });
  };

  // Auto-generated tasks
  const getAutoTasks = () => {
    const tasks = [];
    const renewals = getRenewalsThisWeek();
    const needMenus = getClientsNeedingMenus();
    const subs = getSubstitutionRequests();
    const bagFollowups = getBagFollowups();
    const pendingDeliveries = getThisWeekDeliveries();

    if (renewals.length > 0) {
      tasks.push({
        id: 'renewals',
        category: 'Billing & Renewals',
        title: `${renewals.length} client${renewals.length > 1 ? 's' : ''} due for renewal`,
        details: renewals.map(c => c.displayName || c.name),
        icon: CreditCard,
        color: '#f59e0b'
      });
    }

    if (needMenus.length > 0) {
      tasks.push({
        id: 'menus',
        category: 'Menu Planning',
        title: `Plan menus for ${needMenus.length} client${needMenus.length > 1 ? 's' : ''}`,
        details: needMenus.map(c => c.displayName || c.name),
        icon: FileText,
        color: '#3d59ab'
      });
    }

    if (subs.length > 0) {
      tasks.push({
        id: 'substitutions',
        category: 'Substitution Requests',
        title: `${subs.length} substitution request${subs.length > 1 ? 's' : ''} to review`,
        details: subs.map(s => `${s.clientName}: ${s.originalDish} → ${s.requestedSubstitution}`),
        icon: RefreshCw,
        color: '#8b5cf6'
      });
    }

    if (pendingDeliveries.length > 0) {
      tasks.push({
        id: 'delivery-prep',
        category: 'Delivery Prep',
        title: `${pendingDeliveries.length} order${pendingDeliveries.length > 1 ? 's' : ''} ready for delivery`,
        details: pendingDeliveries.map(o => `${o.clientName} - ${formatDate(o.date)}`),
        icon: Package,
        color: '#10b981'
      });
    }

    if (bagFollowups.length > 0) {
      tasks.push({
        id: 'bags',
        category: 'Bags Follow-up',
        title: `Follow up on ${bagFollowups.length} bag return${bagFollowups.length > 1 ? 's' : ''}`,
        details: bagFollowups.map(b => b.clientName),
        icon: ShoppingBag,
        color: '#ec4899'
      });
    }

    // Clients who pay their own groceries and have deliveries this week
    const ownGroceryClients = clients.filter(c => c.paysOwnGroceries && c.status === 'active');
    const ownGroceryDeliveries = ownGroceryClients.filter(client => {
      return pendingDeliveries.some(d => d.clientName === client.name);
    });
    if (ownGroceryDeliveries.length > 0) {
      tasks.push({
        id: 'own-groceries',
        category: 'Grocery Costs',
        title: `Add grocery costs for ${ownGroceryDeliveries.length} client${ownGroceryDeliveries.length > 1 ? 's' : ''}`,
        details: ownGroceryDeliveries.map(c => c.displayName || c.name),
        icon: DollarSign,
        color: '#059669',
        action: 'groceries'
      });
    }

    // Clients who pick their own dishes (chefChoice = false) with pending picks
    const dishPickerClients = clients.filter(c => c.chefChoice === false && c.status === 'active');
    const clientsWithPicks = dishPickerClients.filter(client => {
      const portalData = clientPortalData[client.name];
      const hasPicks = portalData?.ingredientPicks || (portalData?.dateIngredientPicks && Object.keys(portalData.dateIngredientPicks).length > 0);
      // Check if client already has a menu this week
      const hasMenu = menuItems.some(item => item.clientName === (client.displayName || client.name));
      return hasPicks && !hasMenu;
    });

    if (clientsWithPicks.length > 0) {
      tasks.push({
        id: 'client-dish-picks',
        category: 'Client Dish Picks',
        title: `${clientsWithPicks.length} client${clientsWithPicks.length > 1 ? 's' : ''} submitted dish picks`,
        details: clientsWithPicks.map(c => c.displayName || c.name),
        icon: Users,
        color: '#8b5cf6'
      });
    }

    return tasks;
  };

  // Driver management
  const addDriver = async () => {
    if (!newDriver.name) {
      toast('Please enter a driver name', 'warning');
      return;
    }

    if (isSupabaseMode()) {
      // Supabase-first: save to Supabase, then refetch
      const result = await saveDriverToSupabase(newDriver);
      if (result.success) {
        setDrivers(result.drivers);
        setNewDriver(DEFAULT_NEW_DRIVER);
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      // Local mode: save to localStorage
      updateDrivers([...drivers, { ...newDriver, id: `temp-${Date.now()}` }]);
      setNewDriver(DEFAULT_NEW_DRIVER);
    }
  };

  const deleteDriverAtIndex = async (index) => {
    if (!(await confirm('Delete this driver?'))) return;

    const driver = drivers[index];

    if (isSupabaseMode() && driver.id && !driver.id.startsWith('temp-')) {
      // Supabase-first: delete from Supabase, then refetch
      const result = await deleteDriverFromSupabase(driver.id);
      if (result.success) {
        setDrivers(result.drivers);
      } else {
        toast(`Delete failed: ${result.error}`, 'error');
      }
    } else {
      // Local mode or temp driver: just remove from local state
      updateDrivers(drivers.filter((_, i) => i !== index));
    }
  };

  const startEditingDriver = (index) => {
    setEditingDriverIndex(index);
    setEditingDriver({ ...drivers[index] });
  };

  const saveEditingDriver = async () => {
    if (isSupabaseMode()) {
      // Supabase-first: save to Supabase, then refetch
      const result = await saveDriverToSupabase(editingDriver);
      if (result.success) {
        setDrivers(result.drivers);
        setEditingDriverIndex(null);
        setEditingDriver(null);
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      // Local mode: save to localStorage
      const updated = [...drivers];
      updated[editingDriverIndex] = editingDriver;
      updateDrivers(updated);
      setEditingDriverIndex(null);
      setEditingDriver(null);
    }
  };

  // Ingredient helper functions
  const findSimilarIngredients = (name) => {
    if (!name || name.length < 2) return [];
    return masterIngredients.filter(mi => {
      const sim = similarity(name, mi.name);
      return sim > 0.7 && sim < 1;
    });
  };

  const findExactMatch = (name) => masterIngredients.find(mi => normalizeName(mi.name) === normalizeName(name));

  // Get unique vendors/sources from master ingredients
  const getUniqueVendors = () => {
    const vendors = new Set();
    masterIngredients.forEach(mi => {
      if (mi.source && mi.source.trim()) {
        vendors.add(mi.source.trim());
      }
    });
    return Array.from(vendors).sort();
  };

  // Update master ingredient cost when changed in recipe
  const updateMasterIngredientCost = (ingredientName, newCost) => {
    const exactMatch = findExactMatch(ingredientName);
    if (exactMatch && newCost) {
      updateMasterIngredients(masterIngredients.map(mi =>
        mi.id === exactMatch.id ? { ...mi, cost: newCost } : mi
      ));
      return true;
    }
    return false;
  };

  // Sync all recipe ingredients from master ingredients data
  const syncRecipeIngredientsFromMaster = async () => {
    let ingredientsAdded = 0;
    let costsUpdated = 0;

    const updatedRecipes = { ...recipes };

    Object.keys(updatedRecipes).forEach(category => {
      updatedRecipes[category] = updatedRecipes[category].map(recipe => {
        const updatedIngredients = recipe.ingredients.map(ing => {
          const masterIng = findExactMatch(ing.name);
          if (masterIng) {
            const updated = { ...ing };
            if (masterIng.cost && masterIng.cost !== ing.cost) {
              updated.cost = masterIng.cost;
              costsUpdated++;
            }
            if (masterIng.source && masterIng.source !== ing.source) {
              updated.source = masterIng.source;
            }
            if (masterIng.section && masterIng.section !== 'Other' && masterIng.section !== ing.section) {
              updated.section = masterIng.section;
            }
            if (masterIng.unit && masterIng.unit !== ing.unit) {
              updated.unit = masterIng.unit;
            }
            return updated;
          } else if (ing.name) {
            ingredientsAdded++;
            return ing;
          }
          return ing;
        });
        return { ...recipe, ingredients: updatedIngredients };
      });
    });

    // Collect new ingredients to add to master list
    const ingredientsToAdd = [];
    Object.values(updatedRecipes).forEach(categoryRecipes => {
      categoryRecipes.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
          if (ing.name && !findExactMatch(ing.name)) {
            ingredientsToAdd.push(ing);
          }
        });
      });
    });

    // Add all new ingredients and await completion
    await Promise.all(ingredientsToAdd.map(ing => addToMasterIngredients(ing)));

    updateRecipes(updatedRecipes);

    return { ingredientsAdded, costsUpdated };
  };

  const addToMasterIngredients = async (ingredient) => {
    if (!ingredient.name) return;
    const exactMatch = findExactMatch(ingredient.name);

    if (isConfigured()) {
      // In Supabase mode, upsert ingredient to master list
      const ingredientToSave = exactMatch
        ? {
            ...exactMatch,
            cost: ingredient.cost || exactMatch.cost,
            source: ingredient.source || exactMatch.source,
            section: ingredient.section !== 'Other' ? ingredient.section : exactMatch.section
          }
        : {
            name: ingredient.name,
            cost: ingredient.cost || '',
            unit: ingredient.unit || 'oz',
            source: ingredient.source || '',
            section: ingredient.section || 'Other'
          };

      // Await the save and update state immediately
      try {
        const result = await saveIngredientToSupabase(ingredientToSave);
        if (result.success) {
          updateMasterIngredients(result.ingredients);
        }
      } catch (err) {
        console.error('[addToMasterIngredients] error', err);
      }
    } else {
      // Local mode
      if (exactMatch) {
        if (ingredient.cost || ingredient.source || ingredient.section !== 'Other') {
          updateMasterIngredients(masterIngredients.map(mi =>
            mi.id === exactMatch.id
              ? { ...mi, cost: ingredient.cost || mi.cost, source: ingredient.source || mi.source, section: ingredient.section !== 'Other' ? ingredient.section : mi.section }
              : mi
          ));
        }
        return;
      }
      updateMasterIngredients([...masterIngredients, {
        id: Date.now() + Math.random(),
        name: ingredient.name,
        cost: ingredient.cost || '',
        unit: ingredient.unit || 'oz',
        source: ingredient.source || '',
        section: ingredient.section || 'Other'
      }]);
    }
  };

  const getRecipeCost = (recipe) => {
    if (!recipe?.ingredients) return 0;
    return recipe.ingredients.reduce((total, ing) => {
      const masterIng = findExactMatch(ing.name);
      const costPerUnit = parseFloat(masterIng?.cost || ing.cost || 0);
      const quantity = parseFloat(ing.quantity || 0);
      return total + (costPerUnit * quantity);
    }, 0);
  };

  const getRecipeCounts = () => {
    const counts = {};
    let total = 0;
    Object.entries(recipes).forEach(([category, items]) => {
      counts[category] = items.length;
      total += items.length;
    });
    counts.total = total;
    return counts;
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
      updateMenuItems([...menuItems, ...newItems]);
    }
    setNewMenuItem(DEFAULT_NEW_MENU_ITEM);
  };

  const deleteMenuItem = (id) => updateMenuItems(menuItems.filter(item => item.id !== id));

  const clearMenu = async () => {
    if (await confirm('Clear all menu items?')) {
      updateMenuItems([]);
      setSelectedClients([]);
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

    // Save new ingredients to master list and await completion
    await Promise.all(validIngredients.map(ing => addToMasterIngredients(ing)));

    const recipeToSave = {
      name: newRecipe.name,
      instructions: newRecipe.instructions,
      ingredients: validIngredients
    };
    if (isConfigured()) {
      const result = await saveRecipeToSupabase(recipeToSave, newRecipe.category);
      if (result.success) {
        // Update both React state AND localStorage for persistence on refresh
        setRecipes(result.recipes);
        saveData({ recipes: result.recipes });
        setNewRecipe(DEFAULT_NEW_RECIPE);
        toast('Recipe saved!', 'success');
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      updateRecipes({ ...recipes, [newRecipe.category]: [...recipes[newRecipe.category], recipeToSave] });
      setNewRecipe(DEFAULT_NEW_RECIPE);
      toast('Recipe saved (local only)!', 'success');
    }
  };

  const deleteRecipe = async (category, index) => {
    if (!(await confirm('Delete this recipe?'))) return;

    const recipe = recipes[category][index];

    if (isConfigured()) {
      const result = await deleteRecipeFromSupabase(recipe.name, category);
      if (result.success) {
        // Update both React state AND localStorage for persistence on refresh
        setRecipes(result.recipes);
        saveData({ recipes: result.recipes });
      } else {
        toast(`Delete failed: ${result.error}`, 'error');
      }
    } else {
      updateRecipes({ ...recipes, [category]: recipes[category].filter((_, i) => i !== index) });
    }
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
      const normalizedName = value.trim().toLowerCase();
      const masterMatch = masterIngredients.find(m =>
        (m.name || '').trim().toLowerCase() === normalizedName
      );
      if (masterMatch && masterMatch.id) {
        updated[index] = {
          ...updated[index],
          ingredient_id: masterMatch.id,
          cost: masterMatch.cost || updated[index].cost,
          source: masterMatch.source || updated[index].source,
          section: masterMatch.section || updated[index].section,
          unit: masterMatch.unit || updated[index].unit
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

    // Save new ingredients to master list and await completion
    await Promise.all(validIngredients.map(ing => addToMasterIngredients(ing)));

    const recipeToSave = { ...recipe, ingredients: validIngredients };

    if (isConfigured()) {
      const result = await saveRecipeToSupabase(recipeToSave, category);
      if (result.success) {
        // Update both React state AND localStorage for persistence on refresh
        setRecipes(result.recipes);
        saveData({ recipes: result.recipes });
        setEditingRecipe(null);
        toast('Recipe updated!', 'success');
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      const updatedRecipes = { ...recipes };
      updatedRecipes[category][index] = recipeToSave;
      updateRecipes(updatedRecipes);
      setEditingRecipe(null);
      toast('Recipe updated (local only)!', 'success');
    }
  };

  // Ingredient management functions
  const addMasterIngredient = async () => {
    if (!newIngredient.name) { toast('Please enter an ingredient name', 'warning'); return; }
    const similar = findSimilarIngredients(newIngredient.name);
    const exact = findExactMatch(newIngredient.name);
    if (exact) { toast(`"${newIngredient.name}" already exists as "${exact.name}"`, 'warning'); return; }
    if (similar.length > 0 && !(await confirm(`Similar ingredients found: ${similar.map(s => s.name).join(', ')}\n\nAdd "${newIngredient.name}" anyway?`))) return;

    if (isConfigured()) {
      const result = await saveIngredientToSupabase(newIngredient);
      if (result.success) {
        updateMasterIngredients(result.ingredients);
        setNewIngredient(DEFAULT_NEW_INGREDIENT);
        toast('Ingredient added!', 'success');
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      updateMasterIngredients([...masterIngredients, { ...newIngredient, id: Date.now() }]);
      setNewIngredient(DEFAULT_NEW_INGREDIENT);
      toast('Ingredient added (local only)!', 'success');
    }
  };

  const deleteMasterIngredient = async (id) => {
    if (!(await confirm('Delete this ingredient?'))) return;

    if (isConfigured()) {
      const result = await deleteIngredientFromSupabase(id);
      if (result.success) {
        updateMasterIngredients(result.ingredients);
      } else {
        toast(`Delete failed: ${result.error}`, 'error');
      }
    } else {
      updateMasterIngredients(masterIngredients.filter(ing => ing.id !== id));
    }
  };

  const startEditingMasterIngredient = (ing) => {
    setEditingIngredientId(ing.id);
    setEditingIngredientData({ ...ing });
  };

  const saveEditingMasterIngredient = async () => {
    if (isConfigured()) {
      const result = await saveIngredientToSupabase(editingIngredientData);
      if (result.success) {
        updateMasterIngredients(result.ingredients);
        setEditingIngredientId(null);
        setEditingIngredientData(null);
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      updateMasterIngredients(masterIngredients.map(ing => ing.id === editingIngredientId ? { ...editingIngredientData } : ing));
      setEditingIngredientId(null);
      setEditingIngredientData(null);
    }
  };

  const cancelEditingMasterIngredient = () => {
    setEditingIngredientId(null);
    setEditingIngredientData(null);
  };

  const scanForDuplicates = () => {
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
  };

  const mergeIngredients = (keepId, removeId) => {
    const keep = masterIngredients.find(i => i.id === keepId);
    const remove = masterIngredients.find(i => i.id === removeId);
    if (!keep || !remove) return;
    const updatedRecipes = { ...recipes };
    Object.keys(updatedRecipes).forEach(category => {
      updatedRecipes[category] = updatedRecipes[category].map(recipe => ({
        ...recipe,
        ingredients: recipe.ingredients.map(ing =>
          normalizeName(ing.name) === normalizeName(remove.name) ? { ...ing, name: keep.name } : ing
        )
      }));
    });
    updateRecipes(updatedRecipes);
    updateMasterIngredients(masterIngredients.filter(i => i.id !== removeId));
    setDuplicateWarnings(duplicateWarnings.filter(d => d.ing1.id !== removeId && d.ing2.id !== removeId));
    toast(`Merged "${remove.name}" into "${keep.name}"`, 'success');
  };

  // Calendar functions
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Add empty slots for days before first of month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    // Add all days in month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }

    return days;
  };

  const toggleBlockedDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    if (blockedDates.includes(dateStr)) {
      updateBlockedDates(blockedDates.filter(d => d !== dateStr));
    } else {
      updateBlockedDates([...blockedDates, dateStr]);
    }
  };

  const prevMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  };

  // Custom tasks
  const addCustomTask = () => {
    if (!newTask.title) {
      toast('Please enter a task title', 'warning');
      return;
    }
    updateCustomTasks([...customTasks, { ...newTask, id: Date.now(), completed: false }]);
    setNewTask({ title: '', notes: '', dueDate: '' });
  };

  const toggleTaskComplete = (taskId) => {
    updateCustomTasks(customTasks.map(t =>
      t.id === taskId ? { ...t, completed: !t.completed } : t
    ));
  };

  const deleteCustomTask = (taskId) => {
    updateCustomTasks(customTasks.filter(t => t.id !== taskId));
  };

  // Client management functions
  const addClient = async () => {
    if (!newClient.name && !newClient.displayName) {
      toast('Please enter a client name', 'warning');
      return;
    }

    const clientToSave = {
      ...newClient,
      name: newClient.name || newClient.displayName,
      id: Date.now()
    };

    if (isSupabaseMode()) {
      const result = await saveClientToSupabase(clientToSave);
      if (result.success) {
        updateClients(result.clients);
        setNewClient({
          name: '', displayName: '', persons: 1,
          contacts: [{ name: '', email: '', phone: '', address: '' }],
          notes: '', mealsPerWeek: 0, frequency: 'weekly', status: 'active',
          pausedDate: '', honeyBookLink: '', billingNotes: '', deliveryDay: '', zone: '',
          pickup: false, planPrice: 0, serviceFee: 0, prepayDiscount: false,
          newClientFeePaid: false, paysOwnGroceries: false
        });
        toast('Client added!', 'success');
      } else {
        console.error('[CLIENT SAVE] failed', result.error);
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      updateClients([...clients, clientToSave]);
      setNewClient({
        name: '', displayName: '', persons: 1,
        contacts: [{ name: '', email: '', phone: '', address: '' }],
        notes: '', mealsPerWeek: 0, frequency: 'weekly', status: 'active',
        pausedDate: '', honeyBookLink: '', billingNotes: '', deliveryDay: '', zone: '',
        pickup: false, planPrice: 0, serviceFee: 0, prepayDiscount: false,
        newClientFeePaid: false, paysOwnGroceries: false
      });
      toast('Client added!', 'success');
    }
  };

  const deleteClient = async (index) => {
    if (!(await confirm('Delete this client?'))) return;

    const client = clients[index];

    if (isSupabaseMode()) {
      const clientName = client.name || client.displayName;
      const result = await deleteClientFromSupabase(clientName);
      if (result.success) {
        updateClients(result.clients);
      } else {
        console.error('[CLIENT DELETE] failed', result.error);
        toast(`Delete failed: ${result.error}`, 'error');
      }
    } else {
      updateClients(clients.filter((_, i) => i !== index));
    }
  };

  const exportClientsCSV = () => {
    const headers = ['name', 'displayName', 'persons', 'address', 'email', 'phone', 'mealsPerWeek', 'frequency', 'status', 'zone', 'deliveryDay', 'pickup', 'planPrice', 'serviceFee', 'prepayDiscount', 'newClientFeePaid', 'paysOwnGroceries', 'billingNotes'];
    const csvContent = [
      headers.join(','),
      ...clients.map(c => headers.map(h => `"${(c[h] || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clients.csv';
    a.click();
  };

  // Grocery tracking functions
  const addGroceryBill = async () => {
    // Validation
    if (!newGroceryBill.amount || parseFloat(newGroceryBill.amount) <= 0) {
      toast('Please enter a valid amount greater than 0', 'warning');
      return;
    }

    if (!newGroceryBill.date) {
      toast('Please enter a date', 'warning');
      return;
    }

    // Calculate week ID from the bill date
    const billWeekId = getWeekIdFromDate(newGroceryBill.date);

    if (!billWeekId) {
      toast('Could not determine week for this date', 'error');
      return;
    }

    if (isSupabaseMode()) {
      // Save to Supabase (only send: week_id, bill_date, store, amount)
      const result = await saveGroceryBillToSupabase({
        weekId: billWeekId,
        date: newGroceryBill.date,
        store: newGroceryBill.store || '',
        amount: parseFloat(newGroceryBill.amount)
      });

      if (result.success) {
        // Update local state with refetched bills
        if (result.bills) {
          // Merge with existing bills from other weeks
          const otherWeekBills = groceryBills.filter(b => b.weekId !== billWeekId);
          updateGroceryBills([...otherWeekBills, ...result.bills]);
        }
        setNewGroceryBill({ date: new Date().toISOString().split('T')[0], amount: '', store: '', notes: '' });
      } else {
        toast('Failed to save bill: ' + result.error, 'error');
      }
    } else {
      // Local storage mode
      updateGroceryBills([...groceryBills, {
        ...newGroceryBill,
        id: Date.now(),
        weekId: billWeekId,
        amount: parseFloat(newGroceryBill.amount)
      }]);
      setNewGroceryBill({ date: new Date().toISOString().split('T')[0], amount: '', store: '', notes: '' });
    }
  };

  const deleteGroceryBill = async (id, weekId) => {
    if (!(await confirm('Delete this bill?'))) return;

    if (isSupabaseMode()) {
      const result = await deleteGroceryBillFromSupabase(id, weekId);
      if (result.success) {
        // Update local state
        if (result.bills && weekId) {
          const otherWeekBills = groceryBills.filter(b => b.weekId !== weekId);
          updateGroceryBills([...otherWeekBills, ...result.bills]);
        } else {
          updateGroceryBills(groceryBills.filter(b => b.id !== id));
        }
      } else {
        toast('Failed to delete bill: ' + result.error, 'error');
      }
    } else {
      updateGroceryBills(groceryBills.filter(b => b.id !== id));
    }
  };

  // Analytics calculation functions
  const TAX_RATE = 0.11;

  const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const getMonthKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const calculateClientRevenue = (client) => {
    const basePlan = parseFloat(client.planPrice) || 0;
    const serviceFee = client.pickup ? 0 : (parseFloat(client.serviceFee) || 0);
    const subtotal = basePlan + serviceFee;
    const discount = client.prepayDiscount ? subtotal * 0.1 : 0;
    const afterDiscount = subtotal - discount;
    const tax = afterDiscount * TAX_RATE;
    return {
      basePlan,
      serviceFee,
      discount,
      tax,
      total: afterDiscount + tax
    };
  };

  const getGroceryTotals = (startDate, endDate) => {
    return groceryBills
      .filter(b => b.date >= startDate && b.date <= endDate)
      .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
  };

  const getClientPortions = (clientName, startDate, endDate) => {
    return deliveryLog
      .filter(d => d.clientName === clientName && d.date >= startDate && d.date <= endDate)
      .reduce((sum, d) => {
        const client = clients.find(c => c.name === clientName);
        return sum + (client?.persons || 1);
      }, 0);
  };

  const getTotalPortionsForGrocerySplit = (startDate, endDate) => {
    // Only count clients who don't pay their own groceries
    const eligibleClients = clients.filter(c => !c.paysOwnGroceries && c.status === 'active');
    return eligibleClients.reduce((sum, client) => {
      const deliveries = deliveryLog.filter(d => d.clientName === client.name && d.date >= startDate && d.date <= endDate);
      return sum + (deliveries.length * (client.portions || client.persons || 1));
    }, 0);
  };

  const getClientFoodCost = (clientName, startDate, endDate) => {
    const client = clients.find(c => c.name === clientName);
    if (!client || client.paysOwnGroceries) return 0;

    const totalGroceries = getGroceryTotals(startDate, endDate);
    const totalPortions = getTotalPortionsForGrocerySplit(startDate, endDate);
    if (totalPortions === 0) return 0;

    const clientPortions = getClientPortions(clientName, startDate, endDate);
    return (totalGroceries / totalPortions) * clientPortions;
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="text-center">
          <ChefHat size={48} className="mx-auto mb-4 animate-pulse" style={{ color: '#ffd700' }} />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const autoTasks = getAutoTasks();
  const thisWeekDeliveries = getThisWeekDeliveries();
  const thisWeekCompleted = getThisWeekCompleted();
  const problemsThisWeek = getProblemsThisWeek();
  const renewalsThisWeek = getRenewalsThisWeek();
  const pendingApprovals = getPendingApprovals();

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f9f9ed' }}>
      {/* Hidden file inputs */}
      <input type="file" ref={ingredientsFileRef} onChange={importIngredientsCSV} accept=".csv" className="hidden" />

      {/* Header */}
      <header className="text-white p-4" style={{ backgroundColor: '#3d59ab' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ChefHat size={32} style={{ color: '#ffd700' }} />
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-sm opacity-80">Goldfinch Chef</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DataModeToggle onModeChange={() => window.location.reload()} />
            <Link
              to="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            >
              <Home size={20} />
              Back to App
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

      <div className="max-w-6xl mx-auto p-4">
        {/* Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {[
            { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'menu', label: 'Menu Planner', icon: Utensils },
            { id: 'billing', label: 'Billing & Dates', icon: CreditCard },
            { id: 'clients', label: 'Clients', icon: Users },
            { id: 'ingredients', label: 'Ingredients', icon: Package }
          ].map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                activeSection === section.id
                  ? 'text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={activeSection === section.id ? { backgroundColor: '#3d59ab' } : {}}
            >
              <section.icon size={20} />
              {section.label}
            </button>
          ))}
        </div>

        {/* Dashboard Section */}
        {activeSection === 'overview' && (
          <DashboardSection
            weekStart={safeToISODate(weekStart)}
            weekEnd={safeToISODate(weekEnd)}
            thisWeekDeliveries={thisWeekDeliveries}
            thisWeekCompleted={thisWeekCompleted}
            renewalsThisWeek={renewalsThisWeek}
            problemsThisWeek={problemsThisWeek}
            autoTasks={autoTasks}
            customTasks={customTasks}
            updateCustomTasks={updateCustomTasks}
            newTask={newTask}
            setNewTask={setNewTask}
            addCustomTask={addCustomTask}
            toggleTaskComplete={toggleTaskComplete}
            deleteCustomTask={deleteCustomTask}
            groceryBills={groceryBills}
            newGroceryBill={newGroceryBill}
            setNewGroceryBill={setNewGroceryBill}
            addGroceryBill={addGroceryBill}
            deleteGroceryBill={deleteGroceryBill}
            menuItems={menuItems}
            recipes={recipes}
            getRecipeCost={getRecipeCost}
            clients={clients}
            clientPortalData={clientPortalData}
          />
        )}

        {/* Menu Planner Section */}
        {activeSection === 'menu' && (
          <MenuTab
            menuDate={menuDate}
            setMenuDate={setMenuDate}
            clients={clients.filter(c => c.status === 'active')}
            allClients={clients}
            selectedClients={selectedClients}
            setSelectedClients={setSelectedClients}
            recipes={recipes}
            newMenuItem={newMenuItem}
            setNewMenuItem={setNewMenuItem}
            menuItems={menuItems}
            setMenuItems={updateMenuItems}
            addMenuItem={addMenuItem}
            clearMenu={clearMenu}
            deleteMenuItem={deleteMenuItem}
            getOrdersByClient={getOrdersByClient}
            clientPortalData={clientPortalData}
            weeklyTasks={weeklyTasks}
            weeks={weeks}
            selectedWeekId={selectedWeekId}
            setSelectedWeekId={setSelectedWeekId}
            lockWeekAndSnapshot={lockWeekWithSnapshot}
            unlockWeekById={unlockWeekById}
          />
        )}

        {/* Menu Approval Section */}
        {activeSection === 'approvals' && (
          <MenuApprovalSection
            clients={clients}
            menuItems={menuItems}
            updateMenuItems={updateMenuItems}
            lockWeekWithSnapshot={lockWeekWithSnapshot}
            weeklyTasks={weeklyTasks}
            clientPortalData={clientPortalData}
            recipes={recipes}
          />
        )}

        {/* Recipes Section */}
        {activeSection === 'recipes' && (
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
          />
        )}

        {/* Ingredients Section */}
        {activeSection === 'ingredients' && (
          <IngredientsTab
            masterIngredients={masterIngredients}
            newIngredient={newIngredient}
            setNewIngredient={setNewIngredient}
            editingIngredientId={editingIngredientId}
            editingIngredientData={editingIngredientData}
            setEditingIngredientData={setEditingIngredientData}
            duplicateWarnings={duplicateWarnings}
            setDuplicateWarnings={setDuplicateWarnings}
            scanForDuplicates={scanForDuplicates}
            mergeIngredients={mergeIngredients}
            addMasterIngredient={addMasterIngredient}
            deleteMasterIngredient={deleteMasterIngredient}
            startEditingMasterIngredient={startEditingMasterIngredient}
            saveEditingMasterIngredient={saveEditingMasterIngredient}
            cancelEditingMasterIngredient={cancelEditingMasterIngredient}
            ingredientsFileRef={ingredientsFileRef}
            exportIngredientsCSV={() => exportIngredientsCSV(masterIngredients)}
          />
        )}

        {/* Clients Section */}
        {activeSection === 'clients' && (
          <ClientsTab
            clients={clients}
            newClient={newClient}
            setNewClient={setNewClient}
            addClient={addClient}
            deleteClient={deleteClient}
            clientsFileRef={clientsFileRef}
            exportClientsCSV={exportClientsCSV}
            setClients={updateClients}
          />
        )}

        {/* Billing & Dates Section */}
        {activeSection === 'billing' && (
          <BillingDatesSection
            clients={clients}
            updateClients={updateClients}
            blockedDates={blockedDates}
            updateBlockedDates={updateBlockedDates}
            saveDeliveryDatesToSupabase={isSupabaseMode() ? async (clientId, clientName, dates) => {
              const result = await updateClientDeliveryDates(clientId, clientName, dates);
              if (!result.success) {
                console.error('[deliveryDates] Failed to save:', result.error);
              }
              return result;
            } : null}
          />
        )}

        {/* Subscriptions Section - Removed, keeping for backwards compatibility */}
        {activeSection === 'subscriptions' && (
          <SubscriptionsTab
            clients={clients}
            weeklyTasks={weeklyTasks}
            setWeeklyTasks={updateWeeklyTasks}
            clientPortalData={clientPortalData}
          />
        )}

        {/* Grocery Tracking Section */}
        {activeSection === 'groceries' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#3d59ab' }}>
                <Receipt size={24} className="inline mr-2" />
                Grocery Tracking
              </h2>
              <p className="text-gray-600 mb-6">
                Track weekly grocery expenses for cost analysis.
              </p>

              {/* Add grocery bill form */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4 p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <FormField label="Date">
                  <input
                    type="date"
                    value={newGroceryBill.date}
                    onChange={(e) => setNewGroceryBill({ ...newGroceryBill, date: e.target.value })}
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Amount ($)">
                  <input
                    type="number"
                    step="0.01"
                    value={newGroceryBill.amount}
                    onChange={(e) => setNewGroceryBill({ ...newGroceryBill, amount: e.target.value })}
                    placeholder="0.00"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Store">
                  <input
                    type="text"
                    value={newGroceryBill.store}
                    onChange={(e) => setNewGroceryBill({ ...newGroceryBill, store: e.target.value })}
                    placeholder="Store name"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Notes">
                  <input
                    type="text"
                    value={newGroceryBill.notes}
                    onChange={(e) => setNewGroceryBill({ ...newGroceryBill, notes: e.target.value })}
                    placeholder="Optional notes"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
              </div>
              <button
                onClick={addGroceryBill}
                className="px-6 py-2 rounded-lg text-white"
                style={{ backgroundColor: '#3d59ab' }}
              >
                <Plus size={20} className="inline mr-2" />Add Bill
              </button>
            </div>

            {/* Grocery bills list */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                Recent Bills ({groceryBills.length})
              </h3>
              {groceryBills.length > 0 ? (
                <div className="space-y-2">
                  {groceryBills
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(bill => (
                      <div
                        key={bill.id}
                        className="flex items-center justify-between p-3 rounded-lg border-2"
                        style={{ borderColor: '#ebb582' }}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-lg" style={{ color: '#3d59ab' }}>
                              ${parseFloat(bill.amount).toFixed(2)}
                            </span>
                            <span className="text-gray-600">
                              {new Date(bill.date + 'T12:00:00').toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                            {bill.store && (
                              <span className="text-sm px-2 py-1 rounded bg-gray-100">
                                {bill.store}
                              </span>
                            )}
                          </div>
                          {bill.notes && (
                            <p className="text-sm text-gray-500 mt-1">{bill.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteGroceryBill(bill.id, bill.weekId)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No grocery bills recorded. Add your first bill above.
                </p>
              )}

              {/* Monthly totals */}
              {groceryBills.length > 0 && (
                <div className="mt-6 pt-6 border-t-2" style={{ borderColor: '#ebb582' }}>
                  <h4 className="font-bold mb-3">Monthly Totals</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(() => {
                      const monthlyTotals = {};
                      groceryBills.forEach(bill => {
                        const key = getMonthKey(bill.date);
                        monthlyTotals[key] = (monthlyTotals[key] || 0) + parseFloat(bill.amount);
                      });
                      return Object.entries(monthlyTotals)
                        .sort((a, b) => b[0].localeCompare(a[0]))
                        .slice(0, 4)
                        .map(([month, total]) => (
                          <div key={month} className="p-3 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                            <p className="text-sm text-gray-500">
                              {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                            </p>
                            <p className="font-bold text-lg" style={{ color: '#3d59ab' }}>
                              ${total.toFixed(2)}
                            </p>
                          </div>
                        ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analytics Section */}
        {activeSection === 'analytics' && (
          <div className="space-y-6">
            {/* Revenue Overview */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-2" style={{ color: '#3d59ab' }}>
                <TrendingUp size={24} className="inline mr-2" />
                Analytics Dashboard
              </h2>
              <p className="text-gray-600 mb-6">
                Revenue, costs, and margins at a glance. Tax rate: {(TAX_RATE * 100).toFixed(0)}%
              </p>

              {/* Weekly Summary */}
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>This Week</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(() => {
                    const weekGroceries = getGroceryTotals(weekStart, weekEnd);
                    const activeClients = clients.filter(c => c.status === 'active');
                    const weekRevenue = activeClients.reduce((sum, c) => sum + calculateClientRevenue(c).total, 0);
                    const weekProfit = weekRevenue - weekGroceries;

                    return (
                      <>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: '#dbeafe' }}>
                          <p className="text-sm text-gray-600 mb-1">Active Clients</p>
                          <p className="text-2xl font-bold" style={{ color: '#3d59ab' }}>
                            {activeClients.length}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: '#dcfce7' }}>
                          <p className="text-sm text-gray-600 mb-1">Weekly Revenue</p>
                          <p className="text-2xl font-bold text-green-600">
                            ${weekRevenue.toFixed(2)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: '#fef3c7' }}>
                          <p className="text-sm text-gray-600 mb-1">Weekly Groceries</p>
                          <p className="text-2xl font-bold text-amber-600">
                            ${weekGroceries.toFixed(2)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: weekProfit >= 0 ? '#dcfce7' : '#fee2e2' }}>
                          <p className="text-sm text-gray-600 mb-1">Weekly Margin</p>
                          <p className={`text-2xl font-bold ${weekProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${weekProfit.toFixed(2)}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Monthly Summary */}
              <div className="mb-8">
                <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>This Month</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {(() => {
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    const monthStartStr = monthStart.toISOString().split('T')[0];
                    const monthEndStr = monthEnd.toISOString().split('T')[0];
                    const monthGroceries = getGroceryTotals(monthStartStr, monthEndStr);
                    const activeClients = clients.filter(c => c.status === 'active');

                    // Estimate monthly revenue (4 weeks for weekly, 2 for biweekly)
                    const monthRevenue = activeClients.reduce((sum, c) => {
                      const weeklyRev = calculateClientRevenue(c).total;
                      const multiplier = c.frequency === 'biweekly' ? 2 : 4;
                      return sum + (weeklyRev * multiplier);
                    }, 0);
                    const monthProfit = monthRevenue - monthGroceries;
                    const marginPercent = monthRevenue > 0 ? ((monthProfit / monthRevenue) * 100) : 0;

                    return (
                      <>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: '#dcfce7' }}>
                          <p className="text-sm text-gray-600 mb-1">Monthly Revenue (Est.)</p>
                          <p className="text-2xl font-bold text-green-600">
                            ${monthRevenue.toFixed(2)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: '#fef3c7' }}>
                          <p className="text-sm text-gray-600 mb-1">Monthly Groceries</p>
                          <p className="text-2xl font-bold text-amber-600">
                            ${monthGroceries.toFixed(2)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: monthProfit >= 0 ? '#dcfce7' : '#fee2e2' }}>
                          <p className="text-sm text-gray-600 mb-1">Monthly Profit</p>
                          <p className={`text-2xl font-bold ${monthProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${monthProfit.toFixed(2)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg" style={{ backgroundColor: '#ede9fe' }}>
                          <p className="text-sm text-gray-600 mb-1">Profit Margin</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {marginPercent.toFixed(1)}%
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Per-Client Analysis */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                <Users size={20} className="inline mr-2" />
                Per-Client Analysis
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Revenue breakdown and food cost allocation per client.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2" style={{ borderColor: '#ebb582' }}>
                      <th className="text-left py-2 px-3">Client</th>
                      <th className="text-right py-2 px-3">Plan</th>
                      <th className="text-right py-2 px-3">Service</th>
                      <th className="text-right py-2 px-3">Discount</th>
                      <th className="text-right py-2 px-3">Tax</th>
                      <th className="text-right py-2 px-3">Total</th>
                      <th className="text-right py-2 px-3">Food Cost</th>
                      <th className="text-right py-2 px-3">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients
                      .filter(c => c.status === 'active')
                      .sort((a, b) => (b.planPrice || 0) - (a.planPrice || 0))
                      .map((client, idx) => {
                        const rev = calculateClientRevenue(client);
                        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                        const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                        const foodCost = getClientFoodCost(client.name, monthStart, monthEnd);
                        const margin = rev.total - foodCost;
                        const marginPercent = rev.total > 0 ? ((margin / rev.total) * 100) : 0;

                        return (
                          <tr
                            key={client.id || idx}
                            className="border-b hover:bg-gray-50"
                            style={{ borderColor: '#f0f0f0' }}
                          >
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{client.displayName || client.name}</span>
                                {client.paysOwnGroceries && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                    Own Groceries
                                  </span>
                                )}
                                {client.prepayDiscount && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">
                                    Prepay
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {client.portions || client.persons || 1} portions • {client.frequency}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right">${rev.basePlan.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right">${rev.serviceFee.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right text-green-600">
                              {rev.discount > 0 ? `-$${rev.discount.toFixed(2)}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right text-gray-500">${rev.tax.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right font-bold">${rev.total.toFixed(2)}</td>
                            <td className="py-2 px-3 text-right text-amber-600">
                              {client.paysOwnGroceries ? '-' : `$${foodCost.toFixed(2)}`}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <span className={`font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ${margin.toFixed(2)}
                              </span>
                              <span className="text-xs text-gray-400 ml-1">
                                ({marginPercent.toFixed(0)}%)
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold" style={{ borderColor: '#ebb582' }}>
                      <td className="py-2 px-3">Total ({clients.filter(c => c.status === 'active').length} active)</td>
                      <td className="py-2 px-3 text-right">
                        ${clients.filter(c => c.status === 'active').reduce((s, c) => s + calculateClientRevenue(c).basePlan, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        ${clients.filter(c => c.status === 'active').reduce((s, c) => s + calculateClientRevenue(c).serviceFee, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-green-600">
                        -${clients.filter(c => c.status === 'active').reduce((s, c) => s + calculateClientRevenue(c).discount, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-gray-500">
                        ${clients.filter(c => c.status === 'active').reduce((s, c) => s + calculateClientRevenue(c).tax, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right" style={{ color: '#3d59ab' }}>
                        ${clients.filter(c => c.status === 'active').reduce((s, c) => s + calculateClientRevenue(c).total, 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-600">
                        {(() => {
                          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                          return `$${getGroceryTotals(monthStart, monthEnd).toFixed(2)}`;
                        })()}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {(() => {
                          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                          const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                          const totalRev = clients.filter(c => c.status === 'active').reduce((s, c) => s + calculateClientRevenue(c).total, 0);
                          const totalCost = getGroceryTotals(monthStart, monthEnd);
                          const totalMargin = totalRev - totalCost;
                          return (
                            <span className={totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}>
                              ${totalMargin.toFixed(2)}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tasks Section */}
        {activeSection === 'tasks' && (
          <div className="space-y-6">
            {/* Auto-generated tasks */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                Weekly Tasks
              </h2>

              {autoTasks.length > 0 ? (
                <div className="space-y-4">
                  {autoTasks.map(task => (
                    <div
                      key={task.id}
                      className={`border-l-4 p-4 rounded-r-lg ${task.action ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                      style={{ borderColor: task.color, backgroundColor: '#f9f9ed' }}
                      onClick={() => task.action && setActiveSection(task.action)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <task.icon size={20} style={{ color: task.color }} />
                          <span className="text-xs font-medium px-2 py-1 rounded" style={{ backgroundColor: task.color + '20', color: task.color }}>
                            {task.category}
                          </span>
                        </div>
                        {task.action && (
                          <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600">
                            Click to add →
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold mb-2">{task.title}</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {task.details.slice(0, 5).map((detail, idx) => (
                          <li key={idx}>• {detail}</li>
                        ))}
                        {task.details.length > 5 && (
                          <li className="text-gray-400">...and {task.details.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Check size={48} className="mx-auto mb-4 text-green-500" />
                  <p>All caught up! No pending tasks this week.</p>
                </div>
              )}
            </div>

            {/* Custom tasks */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                Custom Tasks
              </h3>

              {/* Add task form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <FormField label="Task Title">
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    placeholder="Enter task title"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Notes (optional)">
                  <input
                    type="text"
                    value={newTask.notes}
                    onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                    placeholder="Additional notes"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Due Date (optional)">
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
              </div>
              <button
                onClick={addCustomTask}
                className="px-6 py-2 rounded-lg text-white mb-6"
                style={{ backgroundColor: '#3d59ab' }}
              >
                <Plus size={20} className="inline mr-2" />Add Task
              </button>

              {/* Custom tasks list */}
              {customTasks.length > 0 ? (
                <div className="space-y-2">
                  {customTasks.map(task => (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 ${
                        task.completed ? 'bg-gray-50 border-gray-200' : 'border-gray-200'
                      }`}
                    >
                      <button
                        onClick={() => toggleTaskComplete(task.id)}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          task.completed ? 'bg-green-500 border-green-500' : 'border-gray-300'
                        }`}
                      >
                        {task.completed && <Check size={14} className="text-white" />}
                      </button>
                      <div className="flex-1">
                        <p className={`font-medium ${task.completed ? 'line-through text-gray-400' : ''}`}>
                          {task.title}
                        </p>
                        {task.notes && (
                          <p className="text-sm text-gray-500">{task.notes}</p>
                        )}
                        {task.dueDate && (
                          <p className="text-xs text-gray-400 mt-1">
                            Due: {formatDate(task.dueDate)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteCustomTask(task.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">No custom tasks. Add one above.</p>
              )}
            </div>
          </div>
        )}

        {/* Settings Section */}
        {activeSection === 'settings' && (
          <div className="space-y-6">
            {/* Availability Calendar */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                <Calendar size={24} className="inline mr-2" />
                Availability Calendar
              </h2>
              <p className="text-gray-600 mb-4">
                Click dates to block them from client date selection.
              </p>

              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded">
                  <ChevronLeft size={24} />
                </button>
                <h3 className="text-lg font-bold">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded">
                  <ChevronRight size={24} />
                </button>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1 mb-4">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
                {getDaysInMonth(calendarMonth).map((date, idx) => {
                  if (!date) return <div key={`empty-${idx}`} />;
                  const dateStr = date.toISOString().split('T')[0];
                  const isBlocked = blockedDates.includes(dateStr);
                  const isPast = date < new Date(today.toISOString().split('T')[0]);
                  const isToday = dateStr === today.toISOString().split('T')[0];

                  return (
                    <button
                      key={dateStr}
                      onClick={() => !isPast && toggleBlockedDate(date)}
                      disabled={isPast}
                      className={`p-2 rounded-lg text-center transition-colors ${
                        isPast
                          ? 'text-gray-300 cursor-not-allowed'
                          : isBlocked
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : isToday
                          ? 'bg-blue-100 hover:bg-blue-200'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              {blockedDates.length > 0 && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm font-medium text-red-700 mb-2">
                    {blockedDates.length} date{blockedDates.length > 1 ? 's' : ''} blocked:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {blockedDates.sort().map(date => (
                      <span
                        key={date}
                        className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 flex items-center gap-1"
                      >
                        {formatDate(date)}
                        <button onClick={() => updateBlockedDates(blockedDates.filter(d => d !== date))}>
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Route Starting Address */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                <MapPin size={24} className="inline mr-2" />
                Route Starting Address
              </h2>
              <p className="text-gray-600 mb-4">
                Set the starting address for delivery route optimization.
              </p>
              <FormField label="Starting Address">
                <input
                  type="text"
                  value={adminSettings.routeStartAddress}
                  onChange={(e) => updateAdminSettings({ ...adminSettings, routeStartAddress: e.target.value })}
                  placeholder="Enter your starting address"
                  className={`${inputStyle} w-full`}
                  style={borderStyle}
                />
              </FormField>
            </div>

            {/* Drivers Management */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                <Users size={24} className="inline mr-2" />
                Drivers
              </h2>

              {/* Add driver form */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4 p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <FormField label="Driver Name">
                  <input
                    type="text"
                    value={newDriver.name}
                    onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                    placeholder="Enter driver name"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Phone">
                  <input
                    type="tel"
                    value={newDriver.phone}
                    onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                    placeholder="Phone number"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
                <FormField label="Zone">
                  <select
                    value={newDriver.zone}
                    onChange={(e) => setNewDriver({ ...newDriver, zone: e.target.value })}
                    className={inputStyle}
                    style={borderStyle}
                  >
                    <option value="">Unassigned</option>
                    {ZONES.map(z => <option key={z} value={z}>Zone {z}</option>)}
                  </select>
                </FormField>
                <FormField label="Access Code">
                  <input
                    type="text"
                    value={newDriver.accessCode}
                    onChange={(e) => setNewDriver({ ...newDriver, accessCode: e.target.value })}
                    placeholder="Access code"
                    className={inputStyle}
                    style={borderStyle}
                  />
                </FormField>
              </div>
              <button
                onClick={addDriver}
                className="px-6 py-2 rounded-lg text-white mb-6"
                style={{ backgroundColor: '#3d59ab' }}
              >
                <Plus size={20} className="inline mr-2" />Add Driver
              </button>

              {/* Drivers list */}
              {drivers.length > 0 ? (
                <div className="space-y-3">
                  {drivers.map((driver, i) => (
                    <div key={driver.id || i}>
                      {editingDriverIndex === i ? (
                        <div className="border-2 rounded-lg p-4" style={{ borderColor: '#3d59ab', backgroundColor: '#f9f9ed' }}>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <FormField label="Driver Name">
                              <input
                                type="text"
                                value={editingDriver.name}
                                onChange={(e) => setEditingDriver({ ...editingDriver, name: e.target.value })}
                                className={inputStyle}
                                style={borderStyle}
                              />
                            </FormField>
                            <FormField label="Phone">
                              <input
                                type="tel"
                                value={editingDriver.phone || ''}
                                onChange={(e) => setEditingDriver({ ...editingDriver, phone: e.target.value })}
                                className={inputStyle}
                                style={borderStyle}
                              />
                            </FormField>
                            <FormField label="Zone">
                              <select
                                value={editingDriver.zone || ''}
                                onChange={(e) => setEditingDriver({ ...editingDriver, zone: e.target.value })}
                                className={inputStyle}
                                style={borderStyle}
                              >
                                <option value="">Unassigned</option>
                                {ZONES.map(z => <option key={z} value={z}>Zone {z}</option>)}
                              </select>
                            </FormField>
                            <FormField label="Access Code">
                              <input
                                type="text"
                                value={editingDriver.accessCode || ''}
                                onChange={(e) => setEditingDriver({ ...editingDriver, accessCode: e.target.value })}
                                className={inputStyle}
                                style={borderStyle}
                              />
                            </FormField>
                          </div>
                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={saveEditingDriver}
                              className="flex items-center gap-1 px-4 py-2 rounded-lg text-white"
                              style={{ backgroundColor: '#3d59ab' }}
                            >
                              <Check size={18} />Save
                            </button>
                            <button
                              onClick={() => { setEditingDriverIndex(null); setEditingDriver(null); }}
                              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-200"
                            >
                              <X size={18} />Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="border-2 rounded-lg p-4" style={{ borderColor: '#ebb582' }}>
                          <div className="flex justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-lg">{driver.name}</h3>
                                {driver.zone && (
                                  <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                                    Zone {driver.zone}
                                  </span>
                                )}
                              </div>
                              {driver.phone && (
                                <p className="text-sm text-gray-600">Phone: {driver.phone}</p>
                              )}
                            </div>
                            <div className="flex gap-2 self-start ml-4">
                              <button onClick={() => startEditingDriver(i)} className="text-blue-600">
                                <Edit2 size={18} />
                              </button>
                              <button onClick={() => deleteDriverAtIndex(i)} className="text-red-600">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>

                          {/* Access Code */}
                          {driver.accessCode && (
                            <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                              <p className="text-xs text-gray-500 mb-1">Access Code</p>
                              <p className="font-mono font-bold text-lg" style={{ color: '#3d59ab' }}>
                                {driver.accessCode}
                              </p>
                            </div>
                          )}

                          {/* Action Buttons */}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => window.open(`/driver?admin_driver=${encodeURIComponent(driver.name)}`, '_blank')}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm"
                              style={{ backgroundColor: '#3d59ab' }}
                            >
                              <ExternalLink size={16} />
                              Preview Driver View
                            </button>
                            <button
                              onClick={() => {
                                const url = `${window.location.origin}/driver`;
                                navigator.clipboard.writeText(url);
                                toast('Driver login link copied to clipboard!', 'success');
                              }}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm"
                              style={{ borderColor: '#ebb582' }}
                            >
                              <Copy size={16} />
                              Copy Login Link
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No drivers yet. Add your first driver above.</p>
              )}
            </div>

            {/* Database / Supabase Section */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                <Database size={24} className="inline mr-2" />
                Database (Supabase)
              </h2>

              {/* Connection Status */}
              <div className="mb-6 p-4 rounded-lg border-2" style={{ borderColor: supabaseConnected ? '#22c55e' : '#f59e0b' }}>
                <div className="flex items-center gap-3">
                  {supabaseConnected ? (
                    <>
                      <Cloud size={24} className="text-green-500" />
                      <div>
                        <p className="font-medium text-green-700">Connected to Supabase</p>
                        {migrationStatus?.supabaseRecordCount !== undefined && (
                          <p className="text-sm text-gray-600">
                            {migrationStatus.supabaseRecordCount} client records in database
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <CloudOff size={24} className="text-amber-500" />
                      <div>
                        <p className="font-medium text-amber-700">
                          {isConfigured() ? 'Cannot connect to Supabase' : 'Supabase not configured'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {isConfigured()
                            ? 'Check your network connection and Supabase status'
                            : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Migration Section */}
              <div className="space-y-4">
                <h3 className="font-bold text-lg">Import localStorage to Supabase</h3>
                <p className="text-gray-600 text-sm">
                  Migrate all data from browser localStorage to Supabase cloud database.
                  This operation is safe to run multiple times (existing records will be updated, not duplicated).
                </p>

                {migrationStatus?.hasLocalData && (
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-sm text-blue-700">
                      localStorage data found and ready to import
                    </p>
                  </div>
                )}

                <button
                  onClick={handleMigration}
                  disabled={isMigrating || !supabaseConnected}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium ${
                    isMigrating || !supabaseConnected
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'hover:opacity-90'
                  }`}
                  style={{ backgroundColor: isMigrating || !supabaseConnected ? undefined : '#3d59ab' }}
                >
                  {isMigrating ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <Upload size={20} />
                      Import localStorage → Supabase
                    </>
                  )}
                </button>

                {/* Migration Report */}
                {migrationReport && (
                  <div className={`mt-4 p-4 rounded-lg border-2 ${
                    migrationReport.success ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
                  }`}>
                    <h4 className={`font-bold mb-2 ${migrationReport.success ? 'text-green-700' : 'text-red-700'}`}>
                      Migration {migrationReport.success ? 'Completed' : 'Completed with Errors'}
                    </h4>

                    {migrationReport.summary && (
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>Total Records: <span className="font-medium">{migrationReport.summary.totalRecords}</span></div>
                        <div>Inserted/Updated: <span className="font-medium text-green-600">{migrationReport.summary.inserted}</span></div>
                        <div>Skipped: <span className="font-medium text-amber-600">{migrationReport.summary.skipped}</span></div>
                        <div>Failed: <span className="font-medium text-red-600">{migrationReport.summary.failed}</span></div>
                      </div>
                    )}

                    {migrationReport.tables && Object.keys(migrationReport.tables).length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm font-medium mb-1">By Table:</p>
                        <div className="text-xs space-y-1">
                          {Object.entries(migrationReport.tables).map(([table, stats]) => (
                            <div key={table} className="flex justify-between">
                              <span>{table}:</span>
                              <span>
                                <span className="text-green-600">{stats.inserted} ok</span>
                                {stats.skipped > 0 && <span className="text-amber-600 ml-2">{stats.skipped} skipped</span>}
                                {stats.failed > 0 && <span className="text-red-600 ml-2">{stats.failed} failed</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {migrationReport.errors && migrationReport.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-red-700 mb-1">Errors:</p>
                        <ul className="text-xs text-red-600 list-disc list-inside max-h-32 overflow-y-auto">
                          {migrationReport.errors.slice(0, 10).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {migrationReport.errors.length > 10 && (
                            <li>...and {migrationReport.errors.length - 10} more (see console)</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {migrationReport.warnings && migrationReport.warnings.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-amber-700 mb-1">Warnings:</p>
                        <ul className="text-xs text-amber-600 list-disc list-inside">
                          {migrationReport.warnings.slice(0, 5).map((warn, i) => (
                            <li key={i}>{warn}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-2">
                  Check browser console for detailed migration log.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Subscription Detail Modal */}
      {selectedClientForDetail && (
        <SubscriptionDetailModal
          client={selectedClientForDetail}
          clientPortalData={clientPortalData}
          onSave={(updatedClient) => {
            const idx = clients.findIndex(c =>
              c.subscriptionId === updatedClient.subscriptionId ||
              c.name === updatedClient.name ||
              c.displayName === updatedClient.displayName
            );
            if (idx >= 0) {
              const updated = [...clients];
              updated[idx] = { ...updated[idx], ...updatedClient };
              updateClients(updated);
            }
          }}
          onClose={() => setSelectedClientForDetail(null)}
        />
      )}

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={clientsFileRef}
        accept=".csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          parseClientsCSV(
            file,
            (imported) => {
              if (imported.length === 0) {
                toast('No subscriptions found in CSV. Check the file format.', 'error');
                return;
              }
              const totalContacts = imported.reduce((sum, sub) => sum + (sub.contacts?.length || 0), 0);
              updateClients(imported);
              toast(`Import successful: ${imported.length} subscription(s), ${totalContacts} contact(s)`, 'success');
            },
            (err) => toast('Error parsing CSV: ' + (err.message || err), 'error')
          );
          e.target.value = '';
        }}
      />
    </div>
  );
}

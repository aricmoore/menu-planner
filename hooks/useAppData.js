import { useState, useEffect, useCallback, useRef } from 'react';
import { useNotification } from '../components/NotificationContext';
import { getWeekId } from '../utils/weekUtils';
import {
  DEFAULT_RECIPES,
  DEFAULT_CLIENTS,
  DEFAULT_NEW_CLIENT,
  DEFAULT_NEW_RECIPE,
  DEFAULT_NEW_MENU_ITEM,
  DEFAULT_NEW_DRIVER,
} from '../constants';
import {
  loadData,
  syncToSupabase,
  getSyncStatus,
  checkOnlineStatus,
  migrateLocalStorageToSupabase,
  loadPendingSaves,
} from '../lib/sync';
import { fetchMenusByWeek } from '../lib/database';
import { isConfigured } from '../lib/supabase';
import { useWeeks } from './useWeeks';
import { useIngredients } from './useIngredients';

export function useAppData() {
  const { toast } = useNotification();
  // ─── Core state ─────────────────────────────────────────────────────────────
  const [recipes, setRecipes] = useState(DEFAULT_RECIPES);
  const [menuItems, setMenuItems] = useState([]);
  const [clients, setClients] = useState(DEFAULT_CLIENTS);
  const [newClient, setNewClient] = useState(DEFAULT_NEW_CLIENT);
  const [newRecipe, setNewRecipe] = useState(DEFAULT_NEW_RECIPE);
  const [newMenuItem, setNewMenuItem] = useState(DEFAULT_NEW_MENU_ITEM);
  const [selectedClients, setSelectedClients] = useState([]);
  const [menuDate, setMenuDate] = useState(new Date().toISOString().split('T')[0]);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [completedDishes, setCompletedDishes] = useState({});
  const [orderHistory, setOrderHistory] = useState([]);
  const [weeklyTasks, setWeeklyTasks] = useState({});
  const [drivers, setDrivers] = useState([]);
  const [newDriver, setNewDriver] = useState(DEFAULT_NEW_DRIVER);
  const [deliveryLog, setDeliveryLog] = useState([]);
  const [bagReminders, setBagReminders] = useState({});
  const [readyForDelivery, setReadyForDelivery] = useState([]);
  const [clientPortalData, setClientPortalData] = useState({});
  const [blockedDates, setBlockedDates] = useState([]);
  const [adminSettings, setAdminSettings] = useState({ routeStartAddress: '' });
  const [customTasks, setCustomTasks] = useState([]);
  const [groceryBills, setGroceryBills] = useState([]);

  // ─── Sub-hooks ───────────────────────────────────────────────────────────────
  const weeksHook = useWeeks({ menuItems, clients });
  const ingredientsHook = useIngredients(recipes, setRecipes);

  // ─── Sync state ──────────────────────────────────────────────────────────────
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [dataSource, setDataSource] = useState('loading');
  const [isReadOnly, setIsReadOnly] = useState(false);

  const saveTimeoutRef = useRef(null);
  const isInitialLoadRef = useRef(true);

  // ─── Initial data load ───────────────────────────────────────────────────────
  useEffect(() => {
    const initializeData = async () => {
      setIsSyncing(true);
      try {
        loadPendingSaves();
        const result = await loadData();

        if (result.data) {
          if (result.data.recipes) setRecipes(result.data.recipes);
          if (result.data.clients) setClients(result.data.clients);
          if (result.data.menuItems) setMenuItems(result.data.menuItems);
          if (result.data.masterIngredients) ingredientsHook.setMasterIngredients(result.data.masterIngredients);
          if (result.data.orderHistory) setOrderHistory(result.data.orderHistory);
          if (result.data.weeklyTasks) setWeeklyTasks(result.data.weeklyTasks);
          setDrivers(Array.isArray(result.data.drivers) ? result.data.drivers : []);
          if (result.data.deliveryLog) setDeliveryLog(result.data.deliveryLog);
          if (result.data.bagReminders) setBagReminders(result.data.bagReminders);
          if (result.data.readyForDelivery) setReadyForDelivery(result.data.readyForDelivery);
          if (result.data.clientPortalData) setClientPortalData(result.data.clientPortalData);
          if (result.data.blockedDates) setBlockedDates(result.data.blockedDates);
          if (result.data.adminSettings) setAdminSettings(result.data.adminSettings);
          if (result.data.customTasks) setCustomTasks(result.data.customTasks);
          if (result.data.groceryBills) setGroceryBills(result.data.groceryBills);
          if (result.data.weeks) weeksHook.setWeeks(result.data.weeks);
          if (result.data.units) ingredientsHook.setUnits?.(result.data.units);

          setDataSource(result.source);
          setIsReadOnly(result.readOnly || false);
          setIsOnline(!result.readOnly);
        }

        const syncStatus = getSyncStatus();
        setLastSyncedAt(syncStatus.lastSyncedAt);

        const online = await checkOnlineStatus();
        setIsOnline(online);

        if (online && !syncStatus.migrationComplete) {
          await migrateLocalStorageToSupabase();
        }
      } catch (error) {
        console.error('[initializeData] Error:', error);
        setSyncError(error.message);
      } finally {
        setIsSyncing(false);
        isInitialLoadRef.current = false;
      }
    };

    initializeData();

    const onlineCheckInterval = setInterval(async () => {
      const online = await checkOnlineStatus();
      setIsOnline(online);
    }, 30000);

    return () => {
      clearInterval(onlineCheckInterval);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fetch menus when week changes ──────────────────────────────────────────
  useEffect(() => {
    if (!weeksHook.selectedWeekId || !isConfigured()) return;

    const loadMenus = async () => {
      const menus = await fetchMenusByWeek(weeksHook.selectedWeekId, false);
      setMenuItems(menus || []);
    };

    loadMenus();
  }, [weeksHook.selectedWeekId]);

  // ─── Auto-save (debounced, 2 s) ──────────────────────────────────────────────
  // menuItems and weeks are excluded: menus are saved per-mutation in MenuTab;
  // weeks are saved per-mutation in delivery/KDS tabs. Including them here would
  // re-fire on every menu keystroke and every KDS tap, hammering the API.
  useEffect(() => {
    if (isInitialLoadRef.current) return;

    const dataToSave = {
      recipes,
      clients,
      masterIngredients: ingredientsHook.masterIngredients,
      orderHistory,
      weeklyTasks,
      drivers,
      deliveryLog,
      bagReminders,
      readyForDelivery,
      clientPortalData,
      blockedDates,
      adminSettings,
      customTasks,
      groceryBills,
      units: ingredientsHook.units,
      lastSaved: new Date().toISOString(),
    };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const online = await checkOnlineStatus();
      setIsOnline(online);

      if (!online) {
        const msg = 'Cannot save: You are offline. Please check your internet connection.';
        setSyncError(msg);
        toast(msg, 'error');
        return;
      }

      setIsSyncing(true);
      setSyncError(null);

      try {
        const result = await syncToSupabase(dataToSave);
        if (result.success) {
          setLastSyncedAt(new Date().toISOString());
        } else {
          const msg = `Save failed: ${result.error}`;
          setSyncError(msg);
          toast(msg, 'error');
        }
      } catch (error) {
        const msg = `Save failed: ${error.message}`;
        setSyncError(msg);
        toast(msg, 'error');
      }

      setIsSyncing(false);
    }, 2000);
  }, [
    recipes,
    clients,
    ingredientsHook.masterIngredients,
    orderHistory,
    weeklyTasks,
    drivers,
    deliveryLog,
    bagReminders,
    readyForDelivery,
    clientPortalData,
    blockedDates,
    adminSettings,
    customTasks,
    groceryBills,
    ingredientsHook.units,
  ]);

  // ─── Manual sync ─────────────────────────────────────────────────────────────
  const forceSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);

    const dataToSave = {
      recipes,
      clients,
      menuItems,
      masterIngredients: ingredientsHook.masterIngredients,
      orderHistory,
      weeklyTasks,
      drivers,
      deliveryLog,
      bagReminders,
      readyForDelivery,
      clientPortalData,
      blockedDates,
      adminSettings,
      customTasks,
      groceryBills,
      weeks: weeksHook.weeks,
      units: ingredientsHook.units,
      lastSaved: new Date().toISOString(),
    };

    try {
      const result = await syncToSupabase(dataToSave);
      if (result.success) {
        setLastSyncedAt(new Date().toISOString());
        setIsOnline(true);
      } else {
        setSyncError(result.error);
      }
    } catch (error) {
      setSyncError(error.message);
    }

    setIsSyncing(false);
  }, [
    recipes, clients, menuItems,
    ingredientsHook.masterIngredients, ingredientsHook.units,
    orderHistory, weeklyTasks, drivers, deliveryLog, bagReminders,
    readyForDelivery, clientPortalData, blockedDates,
    adminSettings, customTasks, groceryBills, weeksHook.weeks,
  ]);

  const getRecipeCounts = useCallback(() => {
    const counts = {};
    let total = 0;
    Object.entries(recipes).forEach(([category, items]) => {
      counts[category] = items.length;
      total += items.length;
    });
    counts.total = total;
    return counts;
  }, [recipes]);

  // ─── Composed return (same public API as before) ─────────────────────────────
  return {
    // Core state
    recipes, setRecipes,
    menuItems, setMenuItems,
    selectedClients, setSelectedClients,
    menuDate, setMenuDate,
    clients, setClients,
    newClient, setNewClient,
    newRecipe, setNewRecipe,
    newMenuItem, setNewMenuItem,
    editingRecipe, setEditingRecipe,
    completedDishes, setCompletedDishes,
    orderHistory, setOrderHistory,
    weeklyTasks, setWeeklyTasks,
    drivers, setDrivers,
    newDriver, setNewDriver,
    deliveryLog, setDeliveryLog,
    bagReminders, setBagReminders,
    readyForDelivery, setReadyForDelivery,
    clientPortalData, setClientPortalData,
    blockedDates, setBlockedDates,
    adminSettings, setAdminSettings,
    customTasks, setCustomTasks,
    groceryBills, setGroceryBills,
    // Ingredients sub-hook (spread to preserve API)
    ...ingredientsHook,
    // Weeks sub-hook (spread to preserve API)
    ...weeksHook,
    // Sync state
    isOnline,
    isSyncing,
    lastSyncedAt,
    syncError,
    dataSource,
    isReadOnly,
    forceSync,
    // Recipe helpers
    getRecipeCounts,
  };
}

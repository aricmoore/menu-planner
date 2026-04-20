import { checkConnection, isConfigured } from './supabase';
import { isLocalMode, setDataMode, ensureSupabaseDefault } from './dataMode';
import {
  fetchClients,
  fetchRecipes,
  fetchIngredients,
  fetchMenus,
  fetchWeeks,
  fetchDrivers,
  fetchClientPortalData,
  fetchAppSettings,
  // saveAllClients - DISABLED: clients saved via explicit admin action only
  // saveAllRecipes - DISABLED: recipes saved via explicit admin action only
  // saveAllIngredients - DISABLED: ingredients saved via explicit admin action only
  // saveAllMenus - DISABLED: menus saved via explicit menu actions only
  saveAllWeeks,
  // saveAllDrivers - DISABLED: drivers saved via explicit admin action only
  saveAllClientPortalData,
  saveAppSetting
} from './database';

const STORAGE_KEY = 'goldfinchChefData';
const SYNC_STATUS_KEY = 'goldfinchSyncStatus';

// Get sync status from localStorage
export function getSyncStatus() {
  try {
    const status = localStorage.getItem(SYNC_STATUS_KEY);
    return status ? JSON.parse(status) : {
      lastSyncedAt: null,
      migrationComplete: false,
      isOnline: false
    };
  } catch (e) {
    return {
      lastSyncedAt: null,
      migrationComplete: false,
      isOnline: false
    };
  }
}

// Update sync status
export function updateSyncStatus(updates) {
  const current = getSyncStatus();
  const newStatus = { ...current, ...updates };
  localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(newStatus));
  return newStatus;
}

// Check if Supabase is available and update status
export async function checkOnlineStatus() {
  if (!isConfigured()) {
    updateSyncStatus({ isOnline: false });
    return false;
  }
  const isOnline = await checkConnection();
  updateSyncStatus({ isOnline });
  return isOnline;
}

// Fetch all data from Supabase
export async function syncFromSupabase() {
  if (!isConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const isOnline = await checkConnection();
  if (!isOnline) {
    return { success: false, error: 'Supabase not available' };
  }

  try {
    const [
      clients,
      recipes,
      masterIngredients,
      menuItems,
      weeks,
      drivers,
      clientPortalData,
      appSettings
    ] = await Promise.all([
      fetchClients(),
      fetchRecipes(),
      fetchIngredients(),
      fetchMenus(),
      fetchWeeks(),
      fetchDrivers(),
      fetchClientPortalData(),
      fetchAppSettings()
    ]);

    // Build the data object
    const data = {
      clients,
      recipes,
      masterIngredients,
      menuItems,
      weeks,
      drivers,
      clientPortalData,
      // Extract specific settings
      orderHistory: appSettings.orderHistory || [],
      weeklyTasks: appSettings.weeklyTasks || {},
      deliveryLog: appSettings.deliveryLog || [],
      bagReminders: appSettings.bagReminders || {},
      readyForDelivery: appSettings.readyForDelivery || [],
      blockedDates: appSettings.blockedDates || [],
      adminSettings: appSettings.adminSettings || { routeStartAddress: '' },
      customTasks: appSettings.customTasks || [],
      groceryBills: appSettings.groceryBills || [],
      units: appSettings.units || null,
      lastSaved: new Date().toISOString()
    };

    updateSyncStatus({
      lastSyncedAt: new Date().toISOString(),
      isOnline: true
    });

    return { success: true, data };
  } catch (error) {
    console.error('Error syncing from Supabase:', error);
    return { success: false, error: error.message };
  }
}

// Push all local data to Supabase
export async function syncToSupabase(localData) {
  if (!isConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const isOnline = await checkConnection();
  if (!isOnline) {
    return { success: false, error: 'Supabase not available' };
  }

  try {
    // NOTE: Core entities are NOT synced here - they are saved directly via explicit actions
    // This prevents duplicate writes, sync conflicts, and data corruption

    // Save only non-core entities
    await Promise.all([
      // DISABLED: saveAllClients - clients saved via explicit admin action only
      // DISABLED: saveAllRecipes - recipes saved via explicit admin action only
      // DISABLED: saveAllIngredients - ingredients saved via explicit admin action only
      // DISABLED: saveAllMenus - menus saved via explicit menu actions only
      localData.weeks && Object.keys(localData.weeks).length > 0 ? saveAllWeeks(localData.weeks) : Promise.resolve(),
      // DISABLED: saveAllDrivers - drivers saved via explicit admin action only
      localData.clientPortalData && Object.keys(localData.clientPortalData).length > 0 ? saveAllClientPortalData(localData.clientPortalData) : Promise.resolve()
    ]);

    // Save app settings
    const settingsToSave = {
      orderHistory: localData.orderHistory || [],
      weeklyTasks: localData.weeklyTasks || {},
      deliveryLog: localData.deliveryLog || [],
      bagReminders: localData.bagReminders || {},
      readyForDelivery: localData.readyForDelivery || [],
      blockedDates: localData.blockedDates || [],
      adminSettings: localData.adminSettings || { routeStartAddress: '' },
      customTasks: localData.customTasks || [],
      groceryBills: localData.groceryBills || [],
      units: localData.units || null
    };

    for (const [key, value] of Object.entries(settingsToSave)) {
      if (value !== null && value !== undefined) {
        await saveAppSetting(key, value);
      }
    }

    updateSyncStatus({
      lastSyncedAt: new Date().toISOString(),
      isOnline: true
    });

    return { success: true };
  } catch (error) {
    console.error('Error syncing to Supabase:', error);
    return { success: false, error: error.message };
  }
}

// One-time migration from localStorage to Supabase
// Note: For manual migration with reporting, use lib/migration.js runMigration() instead
export async function migrateLocalStorageToSupabase() {
  const syncStatus = getSyncStatus();

  // Check if already migrated
  if (syncStatus.migrationComplete) {
    console.log('Migration already complete');
    return { success: true, alreadyMigrated: true };
  }

  if (!isConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  // Check if online
  const isOnline = await checkConnection();
  if (!isOnline) {
    return { success: false, error: 'Supabase not available for migration' };
  }

  // Get local data
  const savedData = localStorage.getItem(STORAGE_KEY);
  if (!savedData) {
    updateSyncStatus({ migrationComplete: true });
    return { success: true, noDataToMigrate: true };
  }

  try {
    const localData = JSON.parse(savedData);

    // Perform the sync
    const result = await syncToSupabase(localData);

    if (result.success) {
      updateSyncStatus({
        migrationComplete: true,
        lastSyncedAt: new Date().toISOString()
      });
      console.log('Migration to Supabase complete!');
    }

    return result;
  } catch (error) {
    console.error('Migration error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Load data with Supabase-first, localStorage fallback
 *
 * ALWAYS attempts Supabase first (if configured), regardless of stored mode.
 * Falls back to localStorage only if Supabase is unavailable.
 *
 * Returns:
 * - source: 'supabase' | 'localStorage' | 'none'
 * - readOnly: true when falling back to localStorage (Supabase unavailable)
 * - offlineMode: true when using localStorage fallback
 * - data: the loaded data or null
 */
export async function loadData() {
  // Ensure default mode is supabase for fresh installs
  ensureSupabaseDefault();

  // ALWAYS try Supabase first if configured (regardless of stored mode)
  if (isConfigured()) {
    const isOnline = await checkConnection();

    if (isOnline) {
      const result = await syncFromSupabase();
      if (result.success && result.data) {
        // Success! Ensure mode is set to supabase
        setDataMode('supabase');
        return {
          data: result.data,
          source: 'supabase',
          readOnly: false,
          offlineMode: false
        };
      }
    }
  }

  // Supabase unavailable - fall back to localStorage
  console.warn('[loadData] Supabase unavailable, falling back to localStorage');
  setDataMode('local');

  const savedData = localStorage.getItem(STORAGE_KEY);
  if (savedData) {
    try {
      const data = JSON.parse(savedData);
      return {
        data,
        source: 'localStorage',
        readOnly: true,  // Read-only in fallback mode
        offlineMode: true
      };
    } catch (e) {
      console.error('Error parsing localStorage data:', e);
    }
  }

  // No data available anywhere
  return {
    data: null,
    source: 'none',
    readOnly: true,
    offlineMode: !isConfigured(),
    error: isConfigured()
      ? 'Cannot connect to database. Please check your internet connection.'
      : 'Database not configured.'
  };
}

// Queue for pending saves when offline
let pendingSaves = [];
const PENDING_SAVES_KEY = 'goldfinchPendingSaves';

// Load pending saves from localStorage
export function loadPendingSaves() {
  try {
    const saved = localStorage.getItem(PENDING_SAVES_KEY);
    pendingSaves = saved ? JSON.parse(saved) : [];
  } catch (e) {
    pendingSaves = [];
  }
}

// Save pending saves to localStorage
function savePendingSaves() {
  localStorage.setItem(PENDING_SAVES_KEY, JSON.stringify(pendingSaves));
}

// Add to pending saves queue
export function queueSave(data) {
  pendingSaves.push({
    data,
    timestamp: new Date().toISOString()
  });
  // Keep only last 10 pending saves to avoid localStorage bloat
  if (pendingSaves.length > 10) {
    pendingSaves = pendingSaves.slice(-10);
  }
  savePendingSaves();
}

// Get pending saves count
export function getPendingSavesCount() {
  return pendingSaves.length;
}

// Process pending saves when back online
export async function processPendingSaves() {
  if (pendingSaves.length === 0) return { success: true, processed: 0 };

  if (!isConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const isOnline = await checkConnection();
  if (!isOnline) {
    return { success: false, error: 'Still offline' };
  }

  let processed = 0;
  const errors = [];

  for (const pending of pendingSaves) {
    try {
      await syncToSupabase(pending.data);
      processed++;
    } catch (error) {
      errors.push(error.message);
    }
  }

  // Clear processed saves
  if (processed === pendingSaves.length) {
    pendingSaves = [];
    savePendingSaves();
  }

  return {
    success: errors.length === 0,
    processed,
    errors: errors.length > 0 ? errors : undefined
  };
}

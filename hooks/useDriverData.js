import { useState, useEffect, useCallback } from 'react';
import { isConfigured, checkConnection } from '../lib/supabase';
import {
  fetchDeliveryStopsFromView,
  fetchClients,
  fetchDrivers,
  fetchDeliveryRunsForWeek,
  saveDelivery,
  normalizeName
} from '../lib/database';

export function useDriverData() {
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);
  const [readyForDelivery, setReadyForDelivery] = useState([]);
  const [deliveryLog, setDeliveryLog] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]); // Array of saved routes from delivery_runs
  const [clientPortalData, setClientPortalData] = useState({});
  const [deliveryStops, setDeliveryStops] = useState([]); // Aggregated from approved menus
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [missingClients, setMissingClients] = useState([]); // Clients in menus but not in clients table
  const [driversFetchError, setDriversFetchError] = useState(null); // Track driver fetch errors

  // Load drivers and clients from Supabase on mount
  useEffect(() => {
    const loadData = async () => {
      // Always attempt Supabase if configured (mode is now automatic)
      if (!isConfigured()) {
        setDriversFetchError('Supabase not configured');
        setIsLoaded(true);
        return;
      }

      const online = await checkConnection();
      if (!online) {
        setDriversFetchError('Supabase connection failed');
        setIsLoaded(true);
        return;
      }

      try {
        const [fetchedDrivers, fetchedClients] = await Promise.all([
          fetchDrivers(),
          fetchClients()
        ]);
        setDrivers(fetchedDrivers);
        setClients(fetchedClients);
        setDriversFetchError(null); // Clear error on success
      } catch (err) {
        console.error('[useDriverData] fetch error:', err);
        setDriversFetchError(err.message || 'Unknown fetch error');
      }

      setIsLoaded(true);
    };

    loadData();
  }, []);

  // Fetch approved stops from menus view (fallback when no saved route)
  const fetchDeliveriesForWeek = useCallback(async (weekId, zone = null) => {
    if (!isConfigured()) {
      setIsLoadingDeliveries(false);
      return { stops: [], missingAddresses: [] };
    }

    const online = await checkConnection();
    if (!online) {
      setIsLoadingDeliveries(false);
      return { stops: [], missingAddresses: [] };
    }

    setIsLoadingDeliveries(true);

    try {
      const { stops, missingAddresses, stats } = await fetchDeliveryStopsFromView(weekId, zone);
      setDeliveryStops(stops);
      setMissingClients(missingAddresses.map(m => m.clientName));
      setIsLoadingDeliveries(false);
      return { stops, missingAddresses, stats };
    } catch (err) {
      console.error('[fetchDeliveriesForWeek]', err);
      setIsLoadingDeliveries(false);
      return { stops: [], missingAddresses: [], stats: {} };
    }
  }, []);

  // Fetch clients from Supabase (for driver portal to get addresses)
  const fetchClientsFromSupabase = useCallback(async () => {
    if (!isConfigured()) return;

    const online = await checkConnection();
    if (!online) return;

    try {
      const fetchedClients = await fetchClients();
      setClients(fetchedClients);
    } catch (err) {
      console.error('[DriverData] fetchClientsFromSupabase error:', err);
    }
  }, []);

  // Fetch saved routes from delivery_runs table for the week
  const fetchSavedRoutes = useCallback(async (weekId, zone = null) => {
    if (!isConfigured()) {
      return [];
    }

    const online = await checkConnection();
    if (!online) {
      return [];
    }

    setIsLoadingRoutes(true);

    try {
      // Fetch raw delivery_runs rows
      const runs = await fetchDeliveryRunsForWeek(weekId, zone);

      // Transform to internal format
      const routes = runs.map(run => ({
        id: run.id,
        weekId: run.week_id,
        date: run.date,
        zone: run.zone,
        driverName: run.driver_name,
        driverId: run.driver_id,
        status: run.status,
        totalStops: run.total_stops || 0,
        completedStops: run.completed_stops || 0,
        // Keep stops as-is from JSONB (already in correct format)
        stops: run.stops || [],
        savedAt: run.updated_at || run.created_at
      }));

      setSavedRoutes(routes);
      return routes;
    } catch (err) {
      console.error('[fetchSavedRoutes]', err);
      return [];
    } finally {
      setIsLoadingRoutes(false);
    }
  }, []);

  // Update delivery log - save to Supabase
  const updateDeliveryLog = useCallback(async (newLog) => {
    setDeliveryLog(newLog);

    // Find new entries to save to Supabase
    if (!isConfigured()) return;

    // For now, just update local state
    // The actual delivery completion is saved via saveDelivery in DriverView
  }, []);

  // Update ready for delivery - state only (KDS pushes this)
  const updateReadyForDelivery = useCallback((newReady) => {
    setReadyForDelivery(newReady);
    // readyForDelivery is managed by KDS, not driver portal
  }, []);

  // Update order history - state only
  const updateOrderHistory = useCallback((newHistory) => {
    setOrderHistory(newHistory);
  }, []);

  const authenticateDriver = useCallback((accessCode) => {
    return drivers.find(d => d.accessCode === accessCode);
  }, [drivers]);

  const getDriverByName = useCallback((name) => {
    return drivers.find(d => d.name === name);
  }, [drivers]);

  return {
    drivers,
    clients,
    readyForDelivery,
    deliveryLog,
    orderHistory,
    menuItems,
    savedRoutes,
    clientPortalData,
    deliveryStops,
    isLoaded,
    isLoadingDeliveries,
    isLoadingRoutes,
    missingClients,
    driversFetchError,
    updateDeliveryLog,
    updateReadyForDelivery,
    updateOrderHistory,
    authenticateDriver,
    getDriverByName,
    fetchDeliveriesForWeek,
    fetchSavedRoutes,
    fetchClientsFromSupabase,
    normalizeName
  };
}

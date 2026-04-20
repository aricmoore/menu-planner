import { useState, useEffect, useCallback } from 'react';
import { isConfigured, checkConnection } from '../lib/supabase';
import { fetchClients, saveClientPortalData as savePortalDataToSupabase } from '../lib/database';
import { useNotification } from '../components/NotificationContext';

export function useClientPortalData() {
  const { toast } = useNotification();
  const [clients, setClients] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [readyForDelivery, setReadyForDelivery] = useState([]);
  const [deliveryLog, setDeliveryLog] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [recipes, setRecipes] = useState({});
  const [clientPortalData, setClientPortalData] = useState({});
  const [blockedDates, setBlockedDates] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data from Supabase on mount
  useEffect(() => {
    const loadData = async () => {
      // Always attempt Supabase if configured (mode is now automatic)
      if (!isConfigured()) {
        setIsLoaded(true);
        return;
      }

      const online = await checkConnection();
      if (!online) {
        setIsLoaded(true);
        return;
      }

      try {
        // Import loadData from sync to get full data
        const { loadData: loadFromSupabase } = await import('../lib/sync');
        const result = await loadFromSupabase();

        if (result.data) {
          if (result.data.clients) setClients(result.data.clients);
          if (result.data.menuItems) setMenuItems(result.data.menuItems);
          if (result.data.readyForDelivery) setReadyForDelivery(result.data.readyForDelivery);
          if (result.data.deliveryLog) setDeliveryLog(result.data.deliveryLog);
          if (result.data.orderHistory) setOrderHistory(result.data.orderHistory);
          if (result.data.recipes) setRecipes(result.data.recipes);
          if (result.data.clientPortalData) setClientPortalData(result.data.clientPortalData);
          if (result.data.blockedDates) setBlockedDates(result.data.blockedDates);
        }
      } catch (e) {
        console.error('[ClientPortalData] Error loading data:', e);
      }

      setIsLoaded(true);
    };

    loadData();
  }, []);

  const updateClientPortalData = useCallback(async (clientId, data) => {
    const updated = {
      ...clientPortalData,
      [clientId]: {
        ...clientPortalData[clientId],
        ...data
      }
    };
    setClientPortalData(updated);

    // Save to Supabase if configured
    if (isConfigured()) {
      try {
        await savePortalDataToSupabase(clientId, updated[clientId]);
      } catch (err) {
        console.error('[ClientPortalData] Error saving to Supabase:', err);
        toast(`Failed to save: ${err.message}`, 'error');
      }
    }
  }, [clientPortalData]);

  // Convert name to URL-friendly slug (e.g., "Tim Brown" -> "tim-brown")
  const toUrlSlug = (name) => {
    if (!name) return '';
    return name.toLowerCase().replace(/\s+/g, '-');
  };

  const getClientById = useCallback((clientId) => {
    const slugId = clientId?.toLowerCase() || '';
    return clients.find(c => {
      // Match by explicit id
      if (c.id === clientId) return true;
      // Match by displayName slug (preferred)
      if (c.displayName && toUrlSlug(c.displayName) === slugId) return true;
      // Fallback: match by name slug
      if (toUrlSlug(c.name) === slugId) return true;
      return false;
    });
  }, [clients]);

  const getClientMenuItems = useCallback((clientName, date) => {
    return menuItems.filter(item =>
      item.clientName === clientName &&
      item.approved === true &&
      (!date || item.date === date)
    );
  }, [menuItems]);

  const getClientReadyOrders = useCallback((clientName, date) => {
    return readyForDelivery.filter(order =>
      order.clientName === clientName &&
      (!date || order.date === date)
    );
  }, [readyForDelivery]);

  const getClientDeliveryStatus = useCallback((clientName, date) => {
    return deliveryLog.find(entry =>
      entry.clientName === clientName &&
      entry.date === date
    );
  }, [deliveryLog]);

  const getClientHistory = useCallback((clientName) => {
    // Get order history and merge with delivery log for times/photos
    const history = orderHistory
      .filter(order => order.clientName === clientName)
      .map(order => {
        const logEntry = deliveryLog.find(
          log => log.clientName === clientName && log.date === order.date
        );
        return {
          ...order,
          completedAt: logEntry?.completedAt || order.completedAt,
          handoffType: logEntry?.handoffType || order.handoffType,
          photoData: logEntry?.photoData || order.photoData
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return history;
  }, [orderHistory, deliveryLog]);

  const getRecipeName = useCallback((dishName) => {
    for (const category of Object.keys(recipes)) {
      const recipe = recipes[category]?.find(r => r.name === dishName);
      if (recipe) return recipe;
    }
    return null;
  }, [recipes]);

  return {
    clients,
    menuItems,
    readyForDelivery,
    deliveryLog,
    orderHistory,
    recipes,
    clientPortalData,
    blockedDates,
    isLoaded,
    getClientById,
    getClientMenuItems,
    getClientReadyOrders,
    getClientDeliveryStatus,
    getClientHistory,
    getRecipeName,
    updateClientPortalData
  };
}

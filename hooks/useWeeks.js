import { useState, useCallback } from 'react';
import { getWeekId, createWeekRecord, lockWeek, unlockWeek } from '../utils/weekUtils';

/**
 * Manages week records, locking/unlocking, and all week-scoped operational data
 * (KDS status, delivery log, ready-for-delivery, grocery bills).
 *
 * @param {Object} deps.menuItems - Current menu items (needed for locking snapshot)
 * @param {Array}  deps.clients   - Current clients (needed for locking snapshot)
 */
export function useWeeks({ menuItems = [], clients = [] } = {}) {
  const [weeks, setWeeks] = useState({});
  const [selectedWeekId, setSelectedWeekId] = useState(getWeekId());

  const getOrCreateWeek = useCallback((weekId) => {
    if (weeks[weekId]) return weeks[weekId];
    const newWeek = createWeekRecord(weekId);
    setWeeks(prev => ({ ...prev, [weekId]: newWeek }));
    return newWeek;
  }, [weeks]);

  const getCurrentWeek = useCallback(() => {
    return getOrCreateWeek(selectedWeekId);
  }, [selectedWeekId, getOrCreateWeek]);

  const lockWeekAndSnapshot = useCallback((weekId) => {
    const week = weeks[weekId] || createWeekRecord(weekId);
    if (week.status === 'locked') return week;
    const lockedWeek = lockWeek(week, menuItems, clients);
    setWeeks(prev => ({ ...prev, [weekId]: lockedWeek }));
    return lockedWeek;
  }, [weeks, menuItems, clients]);

  const unlockWeekById = useCallback((weekId) => {
    const week = weeks[weekId];
    if (!week || week.status !== 'locked') return null;
    const unlockedWeek = unlockWeek(week);
    setWeeks(prev => ({ ...prev, [weekId]: unlockedWeek }));
    return unlockedWeek;
  }, [weeks]);

  const updateWeekData = useCallback((weekId, updates) => {
    setWeeks(prev => {
      const week = prev[weekId] || createWeekRecord(weekId);
      return { ...prev, [weekId]: { ...week, ...updates } };
    });
  }, []);

  const updateWeekKdsStatus = useCallback((weekId, dishName, status) => {
    setWeeks(prev => {
      const week = prev[weekId] || createWeekRecord(weekId);
      return {
        ...prev,
        [weekId]: {
          ...week,
          kdsStatus: {
            ...week.kdsStatus,
            [dishName]: {
              status,
              completedAt: status === 'complete' ? new Date().toISOString() : null,
            },
          },
        },
      };
    });
  }, []);

  const addReadyForDeliveryToWeek = useCallback((weekId, orders) => {
    setWeeks(prev => {
      const week = prev[weekId] || createWeekRecord(weekId);
      return { ...prev, [weekId]: { ...week, readyForDelivery: [...week.readyForDelivery, ...orders] } };
    });
  }, []);

  const removeReadyForDeliveryFromWeek = useCallback((weekId, orderId) => {
    setWeeks(prev => {
      const week = prev[weekId];
      if (!week) return prev;
      return { ...prev, [weekId]: { ...week, readyForDelivery: week.readyForDelivery.filter(o => o.id !== orderId) } };
    });
  }, []);

  const addDeliveryLogToWeek = useCallback((weekId, entry) => {
    setWeeks(prev => {
      const week = prev[weekId] || createWeekRecord(weekId);
      return { ...prev, [weekId]: { ...week, deliveryLog: [...week.deliveryLog, entry] } };
    });
  }, []);

  const addGroceryBillToWeek = useCallback((weekId, bill) => {
    setWeeks(prev => {
      const week = prev[weekId] || createWeekRecord(weekId);
      return { ...prev, [weekId]: { ...week, groceryBills: [...week.groceryBills, bill] } };
    });
  }, []);

  const isWeekReadOnly = useCallback((weekId) => {
    const week = weeks[weekId];
    if (!week || week.status !== 'locked') return false;
    return weekId < getWeekId();
  }, [weeks]);

  const getWeekIds = useCallback(() => {
    return Object.keys(weeks).sort().reverse();
  }, [weeks]);

  return {
    weeks, setWeeks,
    selectedWeekId, setSelectedWeekId,
    getOrCreateWeek,
    getCurrentWeek,
    lockWeekAndSnapshot,
    unlockWeekById,
    updateWeekData,
    updateWeekKdsStatus,
    addReadyForDeliveryToWeek,
    removeReadyForDeliveryFromWeek,
    addDeliveryLogToWeek,
    addGroceryBillToWeek,
    isWeekReadOnly,
    getWeekIds,
  };
}

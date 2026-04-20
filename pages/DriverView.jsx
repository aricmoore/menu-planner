import React, { useState, useRef, useEffect } from 'react';
import { useNotification } from '../components/NotificationContext';
import { useSearchParams } from 'react-router-dom';
import {
  Truck, MapPin, Camera, AlertTriangle, Check, ChevronLeft,
  ChevronRight, ChevronDown, ChevronUp, List, LogOut, Package, ShoppingBag, Home, User,
  Calendar, Eye, Clock, ChefHat, FileText, Utensils
} from 'lucide-react';
import { useDriverData } from '../hooks/useDriverData';
import { DELIVERY_PROBLEMS } from '../constants';
import { upsertDeliveryStop, insertDeliveryPhoto } from '../lib/database';
import { getDiagnostics } from '../lib/supabase';

const HANDOFF_TYPES = {
  HAND: 'hand',
  PORCH: 'porch'
};

// Normalize address for comparison (lowercase, trim, collapse whitespace)
const normalizeAddress = (address) => {
  if (!address) return '';
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
};

// Count unique delivery stops from a list of orders (by normalized address)
const countUniqueStops = (orders) => {
  if (!orders || orders.length === 0) return 0;
  const uniqueAddresses = new Set(
    orders.map(o => normalizeAddress(o.address)).filter(addr => addr !== '')
  );
  // If no addresses, fall back to counting by client name
  if (uniqueAddresses.size === 0) {
    return new Set(orders.map(o => o.clientName)).size;
  }
  return uniqueAddresses.size;
};

// Status definitions for driver view (simplified: only READY and DELIVERED)
const DELIVERY_STATUS = {
  DELIVERED: { key: 'delivered', label: 'Delivered', color: '#22c55e', icon: Check },
  READY: { key: 'ready', label: 'Ready', color: '#f59e0b', icon: Truck }
};

export default function DriverView() {
  const { toast } = useNotification();
  const [searchParams] = useSearchParams();
  const {
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
  } = useDriverData();

  // Check if drivers are loaded
  const driversLoaded = Array.isArray(drivers) && drivers.length > 0;

  // Debug mode (add ?debug=1 to URL)
  const showDebug = searchParams.get('debug') === '1';

  // Auth state
  const [accessCode, setAccessCode] = useState('');
  const [driver, setDriver] = useState(null);
  const [authError, setAuthError] = useState('');
  const [isAdminPreview, setIsAdminPreview] = useState(false);

  // Auto-login from admin preview
  useEffect(() => {
    if (isLoaded && !driver) {
      const adminDriver = searchParams.get('admin_driver');
      if (adminDriver) {
        const foundDriver = getDriverByName(adminDriver);
        if (foundDriver) {
          setDriver(foundDriver);
          setIsAdminPreview(true);
        }
      }
    }
  }, [isLoaded, searchParams, driver, getDriverByName]);

  // Get current week ID (ISO format: YYYY-Www)
  const getCurrentWeekId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const dayOfYear = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
    const weekNum = Math.ceil((dayOfYear + startOfYear.getDay()) / 7);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
  };

  const [currentWeekId, setCurrentWeekId] = useState(getCurrentWeekId);

  // Fetch saved routes and approved stops when driver is authenticated
  useEffect(() => {
    if (driver?.zone) {
      const weekId = getCurrentWeekId();
      setCurrentWeekId(weekId);
      // Fetch all data for the week: clients, saved routes, and approved stops
      fetchClientsFromSupabase();
      fetchSavedRoutes(weekId, driver.zone);
      fetchDeliveriesForWeek(weekId, driver.zone);
    }
  }, [driver?.zone, fetchClientsFromSupabase, fetchSavedRoutes, fetchDeliveriesForWeek]);


  // Delivery state
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [handoffType, setHandoffType] = useState(HANDOFF_TYPES.HAND);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [bagsReturned, setBagsReturned] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [selectedProblem, setSelectedProblem] = useState('');
  const [problemNote, setProblemNote] = useState('');
  const [showAllStops, setShowAllStops] = useState(false);
  const [showAllReady, setShowAllReady] = useState(false); // View all ready orders across dates
  const [completedStops, setCompletedStops] = useState([]);
  const [isComplete, setIsComplete] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // null = today
  const [activeOrder, setActiveOrder] = useState(null); // For delivering orders from any date
  const [showMealDetails, setShowMealDetails] = useState(false); // Expand/collapse meal list in main view

  const fileInputRef = useRef(null);
  const today = new Date().toISOString().split('T')[0];
  const viewingDate = selectedDate || today;
  const isViewingFuture = viewingDate !== today;

  // Get client delivery status (simplified: READY or DELIVERED only)
  const getClientStatus = (clientName, date) => {
    // Check if delivered
    if (deliveryLog.some(e => e.clientName === clientName && e.date === date)) {
      return DELIVERY_STATUS.DELIVERED;
    }
    // All scheduled stops are READY by default
    return DELIVERY_STATUS.READY;
  };

  // Get the day name from a date string
  const getDayName = (dateStr) => {
    const date = new Date(dateStr + 'T12:00:00');
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];
  };

  // Check if a client has a delivery scheduled for a specific date
  const isClientScheduledForDate = (client, dateStr) => {
    if (!client || client.status !== 'active' || client.pickup) return false;

    const dayName = getDayName(dateStr);

    // Check 1: Regular delivery day matches
    if (client.deliveryDay === dayName) return true;

    // Check 2: Admin-set specific delivery dates
    if (client.deliveryDates?.includes(dateStr)) return true;

    // Check 3: Client-set delivery dates from portal
    const portalData = clientPortalData[client.name];
    if (portalData?.selectedDates?.includes(dateStr)) return true;

    return false;
  };

  // Get upcoming delivery dates for this driver's zone
  // Priority: saved routes first, then approved stops from view
  const getUpcomingDeliveryDates = () => {
    if (!driver) return [];

    const today = new Date().toISOString().split('T')[0];
    const dateSet = new Set();

    // 1. Add dates from saved routes (these have been saved by admin)
    (savedRoutes || []).forEach(r => {
      if (r.date >= today) dateSet.add(r.date);
    });

    // 2. Also add dates from approved stops (from view) that aren't already in saved routes
    //    This shows upcoming work even before routes are saved
    (deliveryStops || []).forEach(stop => {
      if (stop.date >= today && stop.zone === driver.zone) {
        dateSet.add(stop.date);
      }
    });

    return [...dateSet].sort();
  };

  // Get ALL ready orders for this driver's zone (regardless of date)
  const getAllReadyOrders = () => {
    if (!driver) return [];

    return readyForDelivery
      .filter(order => {
        const client = clients.find(c => c.name === order.clientName);
        return client && client.zone === driver.zone && !client.pickup;
      })
      .map(order => {
        const client = clients.find(c => c.name === order.clientName);
        const isDelivered = deliveryLog.some(
          e => e.clientName === order.clientName && e.date === order.date
        );
        return {
          ...order,
          displayName: client?.displayName || order.clientName,
          address: client?.address || '',
          zone: client?.zone,
          isDelivered
        };
      })
      .filter(order => !order.isDelivered)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const upcomingDates = getUpcomingDeliveryDates();
  const allReadyOrders = getAllReadyOrders();

  // Check if a saved route exists for a date
  const hasSavedRoute = (date) => {
    return (savedRoutes || []).some(r => r.date === date);
  };

  // Get ALL scheduled stops for this driver's zone on a specific date
  // Priority: saved route stops (ordered) > approved stops from view (unordered)
  const getDriverStops = (date) => {
    if (!driver) return [];

    // Find the saved route for this date
    const route = (savedRoutes || []).find(r => r.date === date);

    // If we have a saved route, use its stops (ordered)
    if (route && route.stops && route.stops.length > 0) {
      return route.stops.map(stop => mapStopToDisplayFormat(stop, date, true));
    }

    // Fallback: use approved stops from the view (unordered)
    const approvedStops = (deliveryStops || [])
      .filter(stop => stop.date === date && stop.zone === driver.zone);

    return approvedStops.map(stop => mapStopToDisplayFormat(stop, date, false));
  };

  // Helper to map a stop to display format
  // Handles both snake_case (from JSONB) and camelCase (from view)
  const mapStopToDisplayFormat = (stop, date, isFromSavedRoute) => {
    // Handle both snake_case (JSONB) and camelCase (view) field names
    const clientName = stop.client_name || stop.clientName;
    const clientId = stop.client_id || stop.clientId;
    const displayName = stop.display_name || stop.displayName || clientName;
    const stopAddress = stop.address || '';
    const stopPhone = stop.phone || '';
    const isPickup = stop.pickup || false;

    const stopNormalizedName = normalizeName(clientName);

    const isDelivered = clientId
      ? deliveryLog.some(e => (e.clientId === clientId || normalizeName(e.clientName) === stopNormalizedName) && e.date === date)
      : deliveryLog.some(e => normalizeName(e.clientName) === stopNormalizedName && e.date === date);

    // Determine status (simplified: READY or DELIVERED only)
    const statusInfo = isDelivered ? DELIVERY_STATUS.DELIVERED : DELIVERY_STATUS.READY;

    // Get ready orders for this client
    const orders = clientId
      ? readyForDelivery.filter(o => (o.clientId === clientId || normalizeName(o.clientName) === stopNormalizedName) && o.date === date)
      : readyForDelivery.filter(o => normalizeName(o.clientName) === stopNormalizedName && o.date === date);

    // For address: show "Pickup" if pickup is true, otherwise show address
    const displayAddress = isPickup ? 'Pickup' : stopAddress;
    const hasAddress = !!stopAddress;
    const missingAddress = !isPickup && !hasAddress;

    return {
      clientName,
      clientId,
      displayName,
      address: displayAddress,
      phone: stopPhone,
      isPickup,
      missingAddress,
      isFromSavedRoute,
      hasAddress,
      orders,
      dishes: stop.dishes || [],
      portions: stop.portions || 0,
      zone: stop.zone,
      date,
      status: statusInfo.key,
      statusInfo,
      isReady: statusInfo.key === 'ready',
      isDelivered: statusInfo.key === 'delivered'
    };
  };

  // Get only READY stops (for the active delivery flow)
  const getReadyStops = (date) => {
    return getDriverStops(date).filter(s => s.isReady);
  };

  const allStops = getDriverStops(viewingDate);
  const readyStops = getReadyStops(viewingDate);
  const todayReadyStops = getReadyStops(today);
  const remainingReadyStops = readyStops.filter(s => !completedStops.includes(s.clientName) && !s.isDelivered);
  const currentStop = remainingReadyStops[currentStopIndex];

  // Check if already delivered today
  const isAlreadyDelivered = (clientName) => {
    return deliveryLog.some(
      entry => entry.date === today && entry.clientName === clientName
    );
  };

  // Filter out already delivered stops on mount (only for today)
  useEffect(() => {
    if (driver && isLoaded && !isViewingFuture) {
      const alreadyDeliveredToday = todayReadyStops
        .filter(s => isAlreadyDelivered(s.clientName))
        .map(s => s.clientName);
      setCompletedStops(alreadyDeliveredToday);
    }
  }, [driver, isLoaded, todayReadyStops.length, isViewingFuture]);

  // Check if all READY stops are done
  useEffect(() => {
    if (driver && readyStops.length > 0 && remainingReadyStops.length === 0) {
      setIsComplete(true);
    }
  }, [driver, readyStops.length, remainingReadyStops.length]);

  const handleLogin = (e) => {
    e.preventDefault();

    // Guard: don't attempt auth if drivers not loaded
    if (!driversLoaded) {
      setAuthError("Loading driver codes… try again in a moment.");
      return;
    }

    // Normalize input (trim whitespace, lowercase)
    const code = (accessCode || "").trim().toLowerCase();

    // Find driver with normalized matching
    const foundDriver = drivers.find(d => {
      const driverCode = (d.accessCode || d.access_code || "").trim().toLowerCase();
      return driverCode === code;
    });

    if (foundDriver) {
      setDriver(foundDriver);
      setAuthError('');
    } else {
      setAuthError('Invalid access code');
    }
  };

  const handleLogout = () => {
    setDriver(null);
    setAccessCode('');
    setCurrentStopIndex(0);
    setCompletedStops([]);
    setIsComplete(false);
    resetDeliveryForm();
  };

  const resetDeliveryForm = () => {
    setHandoffType(HANDOFF_TYPES.HAND);
    setPhoto(null);
    setPhotoPreview(null);
    setBagsReturned(false);
    setSelectedProblem('');
    setProblemNote('');
    setShowProblemModal(false);
    setShowMealDetails(false);
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCompleteDelivery = async (problem = null, note = '') => {
    // Use activeOrder if set (from All Ready view), otherwise use currentStop
    const stopToComplete = activeOrder || currentStop;
    if (!stopToComplete) return;

    // Get the delivery date from the order/stop
    const deliveryDate = stopToComplete.date || today;

    // Validate porch drop requires photo
    if (handoffType === HANDOFF_TYPES.PORCH && !photo && !problem) {
      toast('Photo is required for porch drops', 'warning');
      return;
    }

    // Validate "Other" problem requires note
    if (problem === 'Other' && !note.trim()) {
      toast('Please provide details for "Other" problem', 'warning');
      return;
    }

    const completedAt = new Date().toISOString();

    // ---- Write to Supabase delivery_stops ----
    const stopPayload = {
      client_id: stopToComplete.clientId || null,
      client_name: stopToComplete.clientName,
      address: stopToComplete.address || '',
      zone: driver?.zone || '',
      status: problem ? 'failed' : 'completed',
      handoff_type: handoffType,
      problem_type: problem || null,
      problem_notes: note || null,
      completed_at: completedAt,
      dishes: stopToComplete.dishes || [],
      portions: stopToComplete.portions || null
    };

    const stopResult = await upsertDeliveryStop(stopPayload);
    if (!stopResult.success) {
      toast(`Failed to save delivery: ${stopResult.error}`, 'error');
      return;
    }

    // ---- If porch drop, save photo to delivery_photos ----
    if (handoffType === HANDOFF_TYPES.PORCH && photoPreview) {
      const photoResult = await insertDeliveryPhoto({
        stop_id: stopResult.stopId,
        client_id: stopToComplete.clientId || null,
        client_name: stopToComplete.clientName,
        date: deliveryDate,
        photo_data: photoPreview
      });
      if (!photoResult.success) {
        console.error('[handleCompleteDelivery] Photo save failed:', photoResult.error);
        // Continue anyway - stop was saved
      }
    }

    // ---- Keep existing deliveryLog for UI compatibility ----
    const newEntry = {
      id: Date.now(),
      date: deliveryDate,
      clientName: stopToComplete.clientName,
      zone: driver.zone,
      driverName: driver.name,
      completedAt,
      handoffType,
      photoData: photoPreview,
      bagsReturned,
      problem,
      problemNote: note
    };

    // Update delivery log
    const newLog = [...deliveryLog, newEntry];
    updateDeliveryLog(newLog);

    // Move orders to history
    const clientOrders = readyForDelivery.filter(
      order => order.clientName === stopToComplete.clientName && order.date === deliveryDate
    );
    if (clientOrders.length > 0) {
      updateOrderHistory([...orderHistory, ...clientOrders]);
      updateReadyForDelivery(
        readyForDelivery.filter(
          order => !(order.clientName === stopToComplete.clientName && order.date === deliveryDate)
        )
      );
    }

    // Mark as completed and advance
    if (activeOrder) {
      // If completing from All Ready view, go back to that view
      setActiveOrder(null);
      setShowAllReady(true);
      resetDeliveryForm();
      setShowProblemModal(false);
    } else {
      setCompletedStops([...completedStops, stopToComplete.clientName]);
      resetDeliveryForm();
      setShowProblemModal(false);

      // Check if this was the last stop
      if (remainingReadyStops.length <= 1) {
        setIsComplete(true);
      }
    }
  };

  const handleProblemSubmit = () => {
    if (!selectedProblem) {
      toast('Please select a problem type', 'warning');
      return;
    }
    handleCompleteDelivery(selectedProblem, problemNote);
  };

  const handleBack = () => {
    if (currentStopIndex > 0) {
      // Just go back to view previous remaining stop
      setCurrentStopIndex(currentStopIndex - 1);
      resetDeliveryForm();
    } else if (completedStops.length > 0) {
      // Undo the last completed stop
      const lastCompleted = completedStops[completedStops.length - 1];

      // Remove from delivery log
      const updatedLog = deliveryLog.filter(
        entry => !(entry.date === today && entry.clientName === lastCompleted)
      );
      updateDeliveryLog(updatedLog);

      // Move orders back from history to ready
      const ordersToMove = orderHistory.filter(
        order => order.clientName === lastCompleted && order.date === today
      );
      if (ordersToMove.length > 0) {
        updateReadyForDelivery([...readyForDelivery, ...ordersToMove]);
        updateOrderHistory(
          orderHistory.filter(
            order => !(order.clientName === lastCompleted && order.date === today)
          )
        );
      }

      setCompletedStops(completedStops.slice(0, -1));
      setIsComplete(false);
      resetDeliveryForm();
    }
  };

  const openMaps = (address) => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`,
      '_blank'
    );
  };

  // Get summary stats
  const getSummary = () => {
    const todaysDeliveries = deliveryLog.filter(
      entry => entry.date === today && entry.driverName === driver?.name
    );
    return {
      completed: todaysDeliveries.length,
      problems: todaysDeliveries.filter(e => e.problem).length,
      bagsReturned: todaysDeliveries.filter(e => e.bagsReturned).length,
      porchDrops: todaysDeliveries.filter(e => e.handoffType === HANDOFF_TYPES.PORCH).length,
      handoffs: todaysDeliveries.filter(e => e.handoffType === HANDOFF_TYPES.HAND).length
    };
  };

  // Loading state
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="text-center">
          <Truck size={48} className="mx-auto mb-4 animate-pulse" style={{ color: '#3d59ab' }} />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Loading routes state (after auth)
  if (driver && isLoadingRoutes) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="text-center">
          <Truck size={48} className="mx-auto mb-4 animate-pulse" style={{ color: '#3d59ab' }} />
          <p className="text-gray-600">Loading routes...</p>
          <p className="text-sm text-gray-400 mt-2">Week {currentWeekId}</p>
        </div>
      </div>
    );
  }

  // Login screen
  if (!driver) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <Truck size={48} className="mx-auto mb-4" style={{ color: '#3d59ab' }} />
            <h1 className="text-2xl font-bold" style={{ color: '#3d59ab' }}>Driver Login</h1>
            <p className="text-gray-600 mt-2">Enter your access code to start deliveries</p>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              placeholder="Access Code"
              className="w-full p-4 text-center text-2xl border-2 rounded-lg mb-4 tracking-widest"
              style={{ borderColor: '#ebb582' }}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {authError && (
              <p className="text-red-600 text-center mb-4">{authError}</p>
            )}
            <button
              type="submit"
              className="w-full py-4 rounded-lg text-white font-bold text-lg disabled:opacity-50"
              style={{ backgroundColor: '#3d59ab' }}
              disabled={!driversLoaded}
            >
              {driversLoaded ? 'Start Deliveries' : 'Loading...'}
            </button>
          </form>

          {/* Debug panel (only when ?debug=1 in URL) */}
          {showDebug && (() => {
            const diag = getDiagnostics();
            return (
              <div className="mt-6 p-4 bg-gray-100 rounded-lg text-xs font-mono">
                <p className="font-bold mb-2 text-gray-700">Debug Info:</p>
                <p>driversLoaded: <span className={driversLoaded ? 'text-green-600' : 'text-red-600'}>{String(driversLoaded)}</span></p>
                <p>drivers.length: {drivers?.length ?? 'null'}</p>
                <p>isLoaded: {String(isLoaded)}</p>
                <p>driversFetchError: <span className={driversFetchError ? 'text-red-600' : 'text-green-600'}>{driversFetchError || 'none'}</span></p>
                <p>isSupabaseMode: {String(diag.isSupabaseMode)}</p>
                <p>supabaseHost: {diag.host || 'NOT_SET'}</p>
                <p>configError: {diag.configError || 'none'}</p>
                <p>clientCreated: {String(diag.clientCreated)}</p>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // View All Stops (shows all scheduled with status)
  if (showAllStops) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold" style={{ color: '#3d59ab' }}>All Scheduled</h2>
                <p className="text-sm text-gray-500">
                  {viewingDate === today ? 'Today' : new Date(viewingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => setShowAllStops(false)}
                className="px-4 py-2 rounded-lg bg-gray-200"
              >
                Back
              </button>
            </div>
          </div>

          {/* Status legend */}
          <div className="bg-white rounded-lg shadow p-3 mb-4">
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: DELIVERY_STATUS.READY.color }}></span>
                Ready
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: DELIVERY_STATUS.DELIVERED.color }}></span>
                Delivered
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {allStops.map((stop, index) => {
              const deliveryEntry = deliveryLog.find(
                e => e.date === viewingDate && e.clientName === stop.clientName
              );

              return (
                <StopCard
                  key={stop.clientName}
                  stop={stop}
                  index={index}
                  deliveryEntry={deliveryEntry}
                  onNavigate={openMaps}
                  onDeliver={(s) => {
                    setShowAllStops(false);
                    setActiveOrder({
                      clientName: s.clientName,
                      displayName: s.displayName,
                      address: s.address,
                      date: s.date || viewingDate,
                      orders: s.orders
                    });
                  }}
                />
              );
            })}
          </div>

          {allStops.length === 0 && (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <Package size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No deliveries scheduled for this date</p>
              <p className="text-xs text-gray-400 mt-2">Deliveries appear when routes are saved in the Admin Portal</p>
            </div>
          )}

          {/* Show indicator when stops exist but no saved route */}
          {allStops.length > 0 && !hasSavedRoute(viewingDate) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4 text-center">
              <p className="text-amber-700 text-sm">No saved route for this date yet</p>
              <p className="text-amber-600 text-xs mt-1">Showing approved menus (unordered). Admin can save a route to set delivery order.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // All Ready Orders view (orders ready across all dates)
  if (showAllReady && !activeOrder) {
    const formatDate = (dateStr) => {
      const date = new Date(dateStr + 'T12:00:00');
      const dayName = getDayName(dateStr);
      const month = date.toLocaleString('en-US', { month: 'short' });
      const day = date.getDate();
      const isToday = dateStr === today;
      return isToday ? `Today (${dayName})` : `${dayName}, ${month} ${day}`;
    };

    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold" style={{ color: '#3d59ab' }}>
                  All Ready Orders
                </h1>
                <p className="text-sm text-gray-500">
                  {countUniqueStops(allReadyOrders)} stop{countUniqueStops(allReadyOrders) !== 1 ? 's' : ''} • {allReadyOrders.length} meal{allReadyOrders.length !== 1 ? 's' : ''} ready
                </p>
              </div>
              <button
                onClick={() => setShowAllReady(false)}
                className="px-4 py-2 rounded-lg bg-gray-200"
              >
                Back
              </button>
            </div>
          </div>

          {/* Group orders by date, then by client */}
          {allReadyOrders.length > 0 ? (
            <div className="space-y-4">
              {/* Group by date first */}
              {Object.entries(
                allReadyOrders.reduce((groups, order) => {
                  const date = order.date;
                  if (!groups[date]) groups[date] = [];
                  groups[date].push(order);
                  return groups;
                }, {})
              ).map(([date, ordersForDate]) => {
                // Group by client within each date
                const clientGroups = ordersForDate.reduce((groups, order) => {
                  const clientKey = order.clientName;
                  if (!groups[clientKey]) {
                    groups[clientKey] = {
                      clientName: order.clientName,
                      displayName: order.displayName,
                      address: order.address,
                      date: order.date,
                      orders: [],
                      isReady: true,
                      statusInfo: DELIVERY_STATUS.READY
                    };
                  }
                  groups[clientKey].orders.push(order);
                  return groups;
                }, {});

                // Sort orders within each client by meal_index
                Object.values(clientGroups).forEach(group => {
                  group.orders.sort((a, b) => (a.meal_index ?? 0) - (b.meal_index ?? 0));
                });

                return (
                  <div key={date}>
                    <h3 className="text-sm font-bold mb-2 px-2" style={{ color: '#3d59ab' }}>
                      {formatDate(date)}
                    </h3>
                    <div className="space-y-2">
                      {Object.values(clientGroups).map((clientStop) => (
                        <StopCard
                          key={`${clientStop.clientName}-${date}`}
                          stop={clientStop}
                          onNavigate={openMaps}
                          onDeliver={(stop) => {
                            setShowAllReady(false);
                            setActiveOrder({
                              clientName: stop.clientName,
                              displayName: stop.displayName,
                              address: stop.address,
                              date: stop.date,
                              orders: stop.orders
                            });
                          }}
                          showDeliverButton={true}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <Package size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No ready orders at this time</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active order delivery (from All Ready view)
  if (activeOrder) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="max-w-lg mx-auto">
          {/* Header with back button */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setActiveOrder(null);
                  setShowAllReady(true);
                  resetDeliveryForm();
                }}
                className="flex items-center gap-2 text-gray-600"
              >
                <ChevronLeft size={20} />
                Back
              </button>
              <p className="text-sm text-gray-500">
                Delivering for {new Date(activeOrder.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Stop card */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
            <h2 className="text-2xl font-bold mb-1" style={{ color: '#3d59ab' }}>
              {activeOrder.displayName}
            </h2>
            <p className="text-gray-600 flex items-center gap-2">
              <MapPin size={16} />
              {activeOrder.address || 'No address'}
            </p>
            {activeOrder.orders?.[0] && (
              <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <p className="text-sm font-medium">
                  {activeOrder.orders[0].portions} portions: {activeOrder.orders[0].dishes?.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Handoff type */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <p className="font-medium mb-3" style={{ color: '#3d59ab' }}>Handoff Type</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setHandoffType(HANDOFF_TYPES.HAND)}
                className={`py-3 rounded-lg border-2 font-medium flex items-center justify-center gap-2 ${
                  handoffType === HANDOFF_TYPES.HAND
                    ? 'text-white'
                    : 'bg-white'
                }`}
                style={{
                  borderColor: '#3d59ab',
                  backgroundColor: handoffType === HANDOFF_TYPES.HAND ? '#3d59ab' : 'white',
                  color: handoffType === HANDOFF_TYPES.HAND ? 'white' : '#3d59ab'
                }}
              >
                <User size={18} />
                Hand to Client
              </button>
              <button
                onClick={() => setHandoffType(HANDOFF_TYPES.PORCH)}
                className={`py-3 rounded-lg border-2 font-medium flex items-center justify-center gap-2 ${
                  handoffType === HANDOFF_TYPES.PORCH
                    ? 'text-white'
                    : 'bg-white'
                }`}
                style={{
                  borderColor: '#3d59ab',
                  backgroundColor: handoffType === HANDOFF_TYPES.PORCH ? '#3d59ab' : 'white',
                  color: handoffType === HANDOFF_TYPES.PORCH ? 'white' : '#3d59ab'
                }}
              >
                <Home size={18} />
                Porch Drop
              </button>
            </div>
          </div>

          {/* Photo (for porch drops) */}
          {handoffType === HANDOFF_TYPES.PORCH && (
            <div className="bg-white rounded-lg shadow p-4 mb-4">
              <p className="font-medium mb-3" style={{ color: '#3d59ab' }}>Photo Proof (Required)</p>
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Delivery" className="w-full rounded-lg" />
                  <button
                    onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                    className="absolute top-2 right-2 p-2 rounded-full bg-red-500 text-white"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2"
                  style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
                >
                  <Camera size={32} />
                  <span>Take Photo</span>
                </button>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>
          )}

          {/* Bags returned */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={bagsReturned}
                onChange={(e) => setBagsReturned(e.target.checked)}
                className="w-5 h-5 rounded"
              />
              <span className="font-medium">Bags Returned</span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleCompleteDelivery()}
              className="w-full py-4 rounded-lg text-white font-bold text-lg flex items-center justify-center gap-2"
              style={{ backgroundColor: '#22c55e' }}
            >
              <Check size={24} />
              Complete Delivery
            </button>
            <button
              onClick={() => setShowProblemModal(true)}
              className="w-full py-3 rounded-lg border-2 font-medium flex items-center justify-center gap-2"
              style={{ borderColor: '#dc2626', color: '#dc2626' }}
            >
              <AlertTriangle size={18} />
              Report Problem
            </button>
          </div>
        </div>

        {/* Problem Modal */}
        {showProblemModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
              <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                Report Problem
              </h3>
              <div className="space-y-3 mb-4">
                {DELIVERY_PROBLEMS.map(problem => (
                  <button
                    key={problem}
                    onClick={() => setSelectedProblem(problem)}
                    className={`w-full py-3 px-4 rounded-lg text-left border-2 ${
                      selectedProblem === problem
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200'
                    }`}
                  >
                    {problem}
                  </button>
                ))}
              </div>
              {selectedProblem === 'Other' && (
                <textarea
                  value={problemNote}
                  onChange={(e) => setProblemNote(e.target.value)}
                  placeholder="Describe the problem..."
                  className="w-full p-3 border-2 rounded-lg mb-4"
                  rows={3}
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowProblemModal(false);
                    setSelectedProblem('');
                    setProblemNote('');
                  }}
                  className="flex-1 py-3 rounded-lg bg-gray-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProblemSubmit}
                  className="flex-1 py-3 rounded-lg text-white font-medium"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  Submit Problem
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Summary screen
  if (isComplete) {
    const summary = getSummary();
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="max-w-lg mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: '#22c55e' }}>
              <Check size={40} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: '#3d59ab' }}>
              All Deliveries Complete!
            </h1>
            <p className="text-gray-600 mb-6">Great job, {driver.name}!</p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <p className="text-3xl font-bold" style={{ color: '#3d59ab' }}>
                  {summary.completed}
                </p>
                <p className="text-sm text-gray-600">Deliveries</p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: summary.problems > 0 ? '#fef2f2' : '#f9f9ed' }}>
                <p className="text-3xl font-bold" style={{ color: summary.problems > 0 ? '#dc2626' : '#3d59ab' }}>
                  {summary.problems}
                </p>
                <p className="text-sm text-gray-600">Problems</p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <p className="text-3xl font-bold" style={{ color: '#3d59ab' }}>
                  {summary.bagsReturned}
                </p>
                <p className="text-sm text-gray-600">Bags Returned</p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                <p className="text-3xl font-bold" style={{ color: '#3d59ab' }}>
                  {summary.porchDrops}
                </p>
                <p className="text-sm text-gray-600">Porch Drops</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setShowAllStops(true)}
                className="w-full py-3 rounded-lg border-2 font-medium flex items-center justify-center gap-2"
                style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
              >
                <List size={20} />
                View All Stops
              </button>
              <button
                onClick={handleLogout}
                className="w-full py-3 rounded-lg bg-gray-200 font-medium flex items-center justify-center gap-2"
              >
                <LogOut size={20} />
                Log Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // No READY stops for today (but might have ready orders for other dates)
  if (remainingReadyStops.length === 0 && !isComplete && !showAllReady) {
    const scheduledCount = allStops.filter(s => !s.isDelivered).length;
    const readyOtherDates = countUniqueStops(allReadyOrders);

    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: '#f9f9ed' }}>
        <div className="max-w-lg mx-auto">
          <Header driver={driver} onLogout={handleLogout} onViewAll={() => setShowAllStops(true)} onViewReady={() => setShowAllReady(true)} readyCount={readyOtherDates} />
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-bold mb-2" style={{ color: '#3d59ab' }}>
              All Deliveries Complete
            </h2>
            {scheduledCount > 0 ? (
              <p className="text-gray-600 mb-4">
                {scheduledCount} delivery{scheduledCount !== 1 ? 'ies' : ''} ready for Zone {driver.zone} today.
              </p>
            ) : (
              <p className="text-gray-600">
                No deliveries scheduled for Zone {driver.zone} today.
              </p>
            )}

            {/* Show ready orders for other dates */}
            {readyOtherDates > 0 && (
              <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: '#fef3c7' }}>
                <p className="text-amber-800 font-medium">
                  <Truck size={16} className="inline mr-1" />
                  {readyOtherDates} stop{readyOtherDates !== 1 ? 's' : ''} ready for upcoming dates
                </p>
                <button
                  onClick={() => setShowAllReady(true)}
                  className="mt-2 px-4 py-2 rounded-lg text-white text-sm"
                  style={{ backgroundColor: '#f59e0b' }}
                >
                  View Ready Orders
                </button>
              </div>
            )}

            <button
              onClick={() => setShowAllStops(true)}
              className="mt-4 px-4 py-2 rounded-lg border-2"
              style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
            >
              View All Scheduled
            </button>
          </div>

          {/* Saved Routes Section */}
          {upcomingDates.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-4 mt-4">
              <h3 className="font-bold text-lg mb-3 flex items-center gap-2" style={{ color: '#3d59ab' }}>
                <Calendar size={20} />
                Upcoming Routes
              </h3>
              <div className="space-y-2">
                {upcomingDates.map(date => {
                  const isSaved = hasSavedRoute(date);
                  const stops = getDriverStops(date);
                  const readyCount = stops.filter(s => s.isReady).length;
                  const isToday = date === today;
                  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                  });

                  return (
                    <button
                      key={date}
                      onClick={() => setSelectedDate(date === today ? null : date)}
                      className={`w-full p-3 rounded-lg border-2 text-left flex items-center justify-between transition-colors ${
                        isToday ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div>
                        <span className="font-medium">{dateLabel}</span>
                        {isToday && <span className="ml-2 text-xs text-blue-600">(Today)</span>}
                        <div className="text-sm text-gray-500 mt-0.5">
                          {stops.length} stop{stops.length !== 1 ? 's' : ''}
                          {readyCount > 0 && (
                            <span className="text-amber-600 ml-2">• {readyCount} ready</span>
                          )}
                        </div>
                      </div>
                      {isSaved && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                          <Check size={12} /> Saved
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main delivery view
  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: '#f9f9ed' }}>
      <div className="max-w-lg mx-auto">
        <Header driver={driver} onLogout={handleLogout} onViewAll={() => setShowAllStops(true)} onViewReady={() => setShowAllReady(true)} readyCount={countUniqueStops(allReadyOrders)} />

        {/* Progress indicator */}
        <div className="bg-white rounded-lg shadow p-3 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              Stop {completedStops.length + 1} of {readyStops.length} ready
              {allStops.length > readyStops.length && (
                <span className="text-gray-400 ml-1">
                  ({allStops.length} scheduled)
                </span>
              )}
            </span>
            <span className="font-medium" style={{ color: '#3d59ab' }}>
              Zone {driver.zone}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${readyStops.length > 0 ? (completedStops.length / readyStops.length) * 100 : 0}%`,
                backgroundColor: '#3d59ab'
              }}
            />
          </div>

          {/* Quick date selector for saved routes */}
          {upcomingDates.length > 1 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {upcomingDates.slice(0, 5).map(date => {
                const isActive = date === viewingDate;
                const isSaved = hasSavedRoute(date);
                const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date === today ? null : date)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {dateLabel}
                    {isSaved && !isActive && <Check size={10} className="text-green-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Current stop card */}
        {currentStop && (() => {
          // Calculate meal summary
          let totalMeals = 0;
          let totalPortions = 0;
          const sortedMeals = [];

          currentStop.orders.forEach(order => {
            totalPortions += order.portions || 0;
            if (order.dishes) {
              order.dishes.forEach((dish, idx) => {
                totalMeals++;
                sortedMeals.push({
                  name: dish,
                  portions: order.portions,
                  mealIndex: order.meal_index ?? idx
                });
              });
            }
          });
          sortedMeals.sort((a, b) => a.mealIndex - b.mealIndex);

          return (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
            <div className="mb-4">
              <h2 className="text-2xl font-bold" style={{ color: '#3d59ab' }}>
                {currentStop.displayName}
              </h2>
              <p className="text-gray-600 mt-1 flex items-center gap-1">
                <MapPin size={16} className="shrink-0" />
                {currentStop.address}
              </p>

              {/* Meal summary with expand/collapse */}
              {totalMeals > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowMealDetails(!showMealDetails)}
                    className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors w-full justify-between"
                    style={{ backgroundColor: '#f9f9ed', color: '#3d59ab' }}
                  >
                    <span className="flex items-center gap-2">
                      <Utensils size={16} />
                      {totalMeals} meal{totalMeals !== 1 ? 's' : ''} • {totalPortions} portion{totalPortions !== 1 ? 's' : ''}
                    </span>
                    {showMealDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>

                  {showMealDetails && (
                    <div className="mt-2 pl-3 space-y-1 border-l-2" style={{ borderColor: '#3d59ab' }}>
                      {sortedMeals.map((meal, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 py-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                          <span>{meal.name}</span>
                          <span className="text-gray-400">({meal.portions}p)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Navigate button (hide for pickup clients) */}
            {!currentStop.isPickup && currentStop.address && (
              <button
                onClick={() => openMaps(currentStop.address)}
                className="w-full py-4 rounded-lg text-white font-bold text-lg flex items-center justify-center gap-2 mb-6"
                style={{ backgroundColor: '#27ae60' }}
              >
                <MapPin size={24} />
                Navigate in Maps
              </button>
            )}

            {/* Hand-off type toggle */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Delivery Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setHandoffType(HANDOFF_TYPES.HAND)}
                  className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                    handoffType === HANDOFF_TYPES.HAND ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <User size={24} style={{ color: handoffType === HANDOFF_TYPES.HAND ? '#3d59ab' : '#9ca3af' }} />
                  <span className={handoffType === HANDOFF_TYPES.HAND ? 'font-medium' : 'text-gray-500'}>
                    Hand-off
                  </span>
                </button>
                <button
                  onClick={() => setHandoffType(HANDOFF_TYPES.PORCH)}
                  className={`p-4 rounded-lg border-2 flex flex-col items-center gap-2 transition-all ${
                    handoffType === HANDOFF_TYPES.PORCH ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <Home size={24} style={{ color: handoffType === HANDOFF_TYPES.PORCH ? '#3d59ab' : '#9ca3af' }} />
                  <span className={handoffType === HANDOFF_TYPES.PORCH ? 'font-medium' : 'text-gray-500'}>
                    Porch Drop
                  </span>
                </button>
              </div>
            </div>

            {/* Photo upload (required for porch drops) */}
            {handoffType === HANDOFF_TYPES.PORCH && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Photo <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  ref={fileInputRef}
                  className="hidden"
                />
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Delivery photo"
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 px-3 py-1 rounded bg-white shadow text-sm"
                    >
                      Retake
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2"
                    style={{ borderColor: '#ebb582' }}
                  >
                    <Camera size={32} className="text-gray-400" />
                    <span className="text-gray-500">Take Photo</span>
                  </button>
                )}
              </div>
            )}

            {/* Bags returned toggle */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Bags Returned?</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setBagsReturned(true)}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${
                    bagsReturned ? 'border-green-500 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <ShoppingBag size={20} style={{ color: bagsReturned ? '#22c55e' : '#9ca3af' }} />
                  <span className={bagsReturned ? 'font-medium text-green-700' : 'text-gray-500'}>
                    Yes
                  </span>
                </button>
                <button
                  onClick={() => setBagsReturned(false)}
                  className={`p-3 rounded-lg border-2 flex items-center justify-center gap-2 ${
                    !bagsReturned ? 'border-amber-500 bg-amber-50' : 'border-gray-200'
                  }`}
                >
                  <ShoppingBag size={20} style={{ color: !bagsReturned ? '#f59e0b' : '#9ca3af' }} />
                  <span className={!bagsReturned ? 'font-medium text-amber-700' : 'text-gray-500'}>
                    No
                  </span>
                </button>
              </div>
            </div>

            {/* Problem button */}
            <button
              onClick={() => setShowProblemModal(true)}
              className="w-full py-3 rounded-lg border-2 border-red-300 text-red-600 font-medium flex items-center justify-center gap-2 mb-4"
            >
              <AlertTriangle size={20} />
              Problem with Delivery
            </button>

            {/* Navigation and Complete buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 py-4 rounded-lg bg-gray-200 font-medium flex items-center justify-center gap-2"
                disabled={currentStopIndex === 0 && completedStops.length === 0}
              >
                <ChevronLeft size={20} />
                Back
              </button>
              <button
                onClick={() => handleCompleteDelivery()}
                className="flex-[2] py-4 rounded-lg text-white font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: '#3d59ab' }}
              >
                Complete Delivery
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        );})()}

        {/* Problem Modal */}
        {showProblemModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold mb-4" style={{ color: '#3d59ab' }}>
                Report Problem
              </h3>
              <div className="space-y-3 mb-4">
                {DELIVERY_PROBLEMS.map(problem => (
                  <button
                    key={problem}
                    onClick={() => setSelectedProblem(problem)}
                    className={`w-full p-3 rounded-lg border-2 text-left ${
                      selectedProblem === problem
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200'
                    }`}
                  >
                    {problem}
                  </button>
                ))}
              </div>
              {selectedProblem === 'Other' && (
                <textarea
                  value={problemNote}
                  onChange={(e) => setProblemNote(e.target.value)}
                  placeholder="Please describe the problem..."
                  className="w-full p-3 border-2 rounded-lg mb-4"
                  style={{ borderColor: '#ebb582' }}
                  rows={3}
                />
              )}
              {selectedProblem && selectedProblem !== 'Other' && (
                <textarea
                  value={problemNote}
                  onChange={(e) => setProblemNote(e.target.value)}
                  placeholder="Additional notes (optional)"
                  className="w-full p-3 border-2 rounded-lg mb-4"
                  style={{ borderColor: '#ebb582' }}
                  rows={2}
                />
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowProblemModal(false);
                    setSelectedProblem('');
                    setProblemNote('');
                  }}
                  className="flex-1 py-3 rounded-lg bg-gray-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProblemSubmit}
                  className="flex-1 py-3 rounded-lg text-white font-medium"
                  style={{ backgroundColor: '#dc2626' }}
                >
                  Submit Problem
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Header component
function Header({ driver, onLogout, onViewAll, onViewReady, readyCount = 0 }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#3d59ab' }}>
            <Truck size={20} className="text-white" />
          </div>
          <div>
            <p className="font-bold" style={{ color: '#3d59ab' }}>{driver.name}</p>
            <p className="text-sm text-gray-500">Zone {driver.zone}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {onViewReady && readyCount > 0 && (
            <button
              onClick={onViewReady}
              className="relative p-2 rounded-lg"
              style={{ backgroundColor: '#fef3c7' }}
              title="View All Ready Orders"
            >
              <Package size={20} style={{ color: '#f59e0b' }} />
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs text-white flex items-center justify-center"
                style={{ backgroundColor: '#f59e0b' }}>
                {readyCount}
              </span>
            </button>
          )}
          <button
            onClick={onViewAll}
            className="p-2 rounded-lg bg-gray-100"
            title="View All Stops"
          >
            <List size={20} className="text-gray-600" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 rounded-lg bg-gray-100"
            title="Log Out"
          >
            <LogOut size={20} className="text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
}

// StopCard component - grouped by client with expandable meal list
function StopCard({
  stop,
  index,
  deliveryEntry,
  onNavigate,
  onDeliver,
  showDeliverButton = false,
  defaultExpanded = false
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const StatusIcon = stop.statusInfo?.icon || Package;

  // Calculate summary: total meals and total portions
  const getMealSummary = () => {
    if (!stop.orders || stop.orders.length === 0) return null;

    let totalMeals = 0;
    let totalPortions = 0;

    stop.orders.forEach(order => {
      totalPortions += order.portions || 0;
      // Count dishes as meals
      if (order.dishes) {
        totalMeals += order.dishes.length;
      }
    });

    return { totalMeals, totalPortions };
  };

  // Get all meals sorted by meal_index
  const getSortedMeals = () => {
    if (!stop.orders || stop.orders.length === 0) return [];

    const meals = [];
    stop.orders.forEach(order => {
      if (order.dishes) {
        order.dishes.forEach((dish, idx) => {
          meals.push({
            name: dish,
            portions: order.portions,
            mealIndex: order.meal_index ?? idx
          });
        });
      }
    });

    return meals.sort((a, b) => a.mealIndex - b.mealIndex);
  };

  const summary = getMealSummary();
  const sortedMeals = getSortedMeals();

  return (
    <div
      className={`bg-white rounded-lg shadow overflow-hidden border-l-4 ${
        stop.isDelivered ? 'opacity-60' : ''
      } ${onDeliver ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      style={{ borderLeftColor: stop.statusInfo?.color || '#3d59ab' }}
      onClick={onDeliver ? () => onDeliver(stop) : undefined}
    >
      {/* Main card header - always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {/* Client name - largest */}
            <div className="flex items-center gap-2 flex-wrap">
              {typeof index === 'number' && (
                <span className="font-bold text-lg" style={{ color: '#3d59ab' }}>
                  {index + 1}.
                </span>
              )}
              <h3 className="font-bold text-lg truncate">{stop.displayName}</h3>
              {stop.statusInfo && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                  style={{ backgroundColor: stop.statusInfo.color + '20', color: stop.statusInfo.color }}
                >
                  <StatusIcon size={12} />
                  {stop.statusInfo.label}
                </span>
              )}
              {stop.missingAddress && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1 shrink-0">
                  <AlertTriangle size={12} />
                  Missing address
                </span>
              )}
            </div>

            {/* Address - smaller */}
            {stop.address && !stop.missingAddress && (
              <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
                <MapPin size={14} className="shrink-0" />
                <span className="truncate">{stop.address}</span>
              </p>
            )}

            {/* Delivery type and time window */}
            {(stop.handoffType || stop.timeWindow) && (
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                {stop.handoffType && (
                  <span className="flex items-center gap-1">
                    {stop.handoffType === 'porch' ? <Home size={12} /> : <User size={12} />}
                    {stop.handoffType === 'porch' ? 'Porch' : 'Hand-off'}
                  </span>
                )}
                {stop.timeWindow && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {stop.timeWindow}
                  </span>
                )}
              </div>
            )}

            {/* Compact summary line */}
            {summary && stop.isReady && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="mt-2 flex items-center gap-2 text-sm font-medium px-2 py-1 rounded-lg transition-colors hover:bg-gray-100"
                style={{ color: '#3d59ab' }}
              >
                <Utensils size={14} />
                <span>{summary.totalMeals} meal{summary.totalMeals !== 1 ? 's' : ''} • {summary.totalPortions} portion{summary.totalPortions !== 1 ? 's' : ''}</span>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}

            {/* Problem indicator */}
            {deliveryEntry?.problem && (
              <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                <AlertTriangle size={14} />
                {deliveryEntry.problem}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 ml-2 shrink-0">
            {stop.address && !stop.isPickup && (
              <button
                onClick={(e) => { e.stopPropagation(); onNavigate(stop.address); }}
                className="p-2 rounded-lg text-white"
                style={{ backgroundColor: '#27ae60' }}
                title="Navigate"
              >
                <MapPin size={20} />
              </button>
            )}
            {showDeliverButton && onDeliver && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeliver(stop); }}
                className="p-2 rounded-lg text-white"
                style={{ backgroundColor: '#f59e0b' }}
                title="Deliver Now"
              >
                <Truck size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable meal list */}
      {expanded && sortedMeals.length > 0 && (
        <div className="px-4 pb-4 pt-0">
          <div className="border-t pt-3 space-y-1">
            {sortedMeals.map((meal, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 pl-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                <span className="truncate">{meal.name}</span>
                <span className="text-gray-400 shrink-0">({meal.portions}p)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

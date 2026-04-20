import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../components/NotificationContext';
import { Plus, Trash2, Check, AlertTriangle, Circle, Eye, X, ChevronDown, ChevronUp, Edit2, Printer, Calendar, Utensils } from 'lucide-react';
import WeekSelector from '../components/WeekSelector';
import { getWeekIdFromDate, getWeekStartDate, getWeekEndDate } from '../utils/weekUtils';
import { isSupabaseMode, isLocalMode } from '../lib/dataMode';
import { saveAllMenus, fetchMenus, ensureWeeksExist, syncDeliveryStopsForWeek, approveAllMenusForWeek, fetchMenusByWeek, deleteMenusForClientDate, createBlankMenusForClientDate, saveMenu, deleteMenuRow, fetchMenusForClientDate } from '../lib/database';
import { checkConnection } from '../lib/supabase';

// Styled Menu Card Component - matches client portal
function StyledMenuCard({ client, date, menuItems }) {
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).toUpperCase();

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
    <div className="overflow-hidden shadow-lg rounded-lg" style={{ backgroundColor: '#fff' }}>
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
          {meals.length === 0 && (
            <p className="text-center text-white/70 italic">No menu items yet</p>
          )}
        </div>
      </div>

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

export default function MenuTab({
  menuDate,
  setMenuDate,
  clients,
  allClients,
  selectedClients,
  setSelectedClients,
  recipes,
  newMenuItem,
  setNewMenuItem,
  menuItems,
  setMenuItems,
  addMenuItem,
  clearMenu,
  deleteMenuItem,
  getOrdersByClient,
  clientPortalData = {},
  weeklyTasks = {},
  weeks = {},
  selectedWeekId,
  setSelectedWeekId,
  lockWeekAndSnapshot,
  unlockWeekById
}) {
  // Track renders without selectedWeekId
  const renderCountWithoutWeekRef = useRef(0);
  if (!selectedWeekId) {
    renderCountWithoutWeekRef.current += 1;
  } else {
    renderCountWithoutWeekRef.current = 0;
  }
  const showWeekIdWarning = renderCountWithoutWeekRef.current > 1;

  const [previewClient, setPreviewClient] = useState(null);
  const [editingClientName, setEditingClientName] = useState(null);
  const [showMenuBuilder, setShowMenuBuilder] = useState(true);

  // New: State for the detailed edit modal
  const [editModal, setEditModal] = useState(null); // { client, date, menus, requiredMeals }
  const [editModalLoading, setEditModalLoading] = useState(false);

  // === AUTO-SAVE LOGIC ===
  const [isDirty, setIsDirty] = useState(false);
  const initialMountRef = useRef(true);
  const menuItemsRef = useRef(menuItems);
  const selectedWeekIdRef = useRef(selectedWeekId);

  // Keep refs in sync for beforeunload handler
  useEffect(() => {
    menuItemsRef.current = menuItems;
    selectedWeekIdRef.current = selectedWeekId;
  }, [menuItems, selectedWeekId]);

  // Track changes to menuItems (mark as dirty after initial mount)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (menuItems && menuItems.length >= 0) {
      setIsDirty(true);
    }
  }, [menuItems, selectedWeekId]);

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    const currentMenuItems = menuItemsRef.current;
    const currentWeekId = selectedWeekIdRef.current;

    if (!isSupabaseMode()) {
      return;
    }
    if (!currentWeekId) {
      return;
    }
    if (!currentMenuItems || currentMenuItems.length === 0) {
      return;
    }

    // Filter to items for the current week
    const weekItems = currentMenuItems.filter(item => {
      const itemWeekId = getWeekIdFromDate(item.date);
      return itemWeekId === currentWeekId;
    });

    if (weekItems.length === 0) {
      return;
    }

    try {
      // Ensure weeks exist first
      const weekIds = [...new Set(weekItems.map(item => {
        if (item.weekId) return item.weekId;
        return getWeekIdFromDate(item.date);
      }).filter(Boolean))];

      await ensureWeeksExist(weekIds);
      await saveAllMenus(weekItems);
    } catch (error) {
      console.error('[MenuAutoSave] failed:', error);
    }
  }, []);

  // Save on unmount (tab/route change)
  useEffect(() => {
    return () => {
      if (isDirty && isSupabaseMode() && selectedWeekIdRef.current) {
        performAutoSave();
      }
    };
  }, [isDirty, performAutoSave]);

  // Save on browser close/refresh (best-effort, fire-and-forget)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDirty && isSupabaseMode() && selectedWeekIdRef.current) {
        performAutoSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, performAutoSave]);
  // === END AUTO-SAVE LOGIC ===

  // Check if current week is locked
  const currentWeek = weeks?.[selectedWeekId];
  const isWeekLocked = currentWeek?.status === 'locked';

  // Get clients scheduled for this week based on delivery_dates
  // Filter to clients where ANY date in deliveryDates falls within the week range
  const activeClients = useMemo(() => {
    const allClientsList = allClients || clients || [];
    if (!selectedWeekId) return [];

    const weekStart = getWeekStartDate(selectedWeekId);
    const weekEnd = getWeekEndDate(selectedWeekId);

    return allClientsList.filter(client => {
      const dates = client.deliveryDates || client.delivery_dates || [];
      if (!Array.isArray(dates) || dates.length === 0) return false;

      // Check if any non-blank date falls within the week range
      return dates.some(dateStr => {
        if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') return false;
        // Compare as strings (YYYY-MM-DD format sorts correctly)
        return dateStr >= weekStart && dateStr <= weekEnd;
      });
    });
  }, [allClients, clients, selectedWeekId]);

  // Filter menu items to only show items for the selected week
  // Prefer stored week_id (from DB) over computing from date
  const weekMenuItems = menuItems.filter(item => {
    const storedWeekId = item.week_id || item.weekId;
    if (storedWeekId) return storedWeekId === selectedWeekId;
    const computedWeekId = item.date ? getWeekIdFromDate(item.date) : null;
    return computedWeekId === selectedWeekId;
  });

  // Clients that have menus for this week but no delivery date set — they won't appear
  // in activeClients and would otherwise be invisible to the admin.
  const orphanedMenuClients = useMemo(() => {
    const activeNames = new Set(activeClients.map(c => c.displayName || c.name));
    const seen = new Set();
    const orphaned = [];
    weekMenuItems.forEach(item => {
      if (!activeNames.has(item.clientName) && !seen.has(item.clientName)) {
        seen.add(item.clientName);
        const client = (allClients || clients || []).find(
          c => (c.displayName || c.name) === item.clientName
        );
        orphaned.push({ name: item.clientName, client });
      }
    });
    return orphaned;
  }, [weekMenuItems, activeClients, allClients, clients]);

  // Calculate delivery dates for the selected week
  const weekDeliveryDates = useMemo(() => {
    if (!selectedWeekId) return { Monday: '', Tuesday: '', Thursday: '' };
    try {
      const weekStart = getWeekStartDate(selectedWeekId);
      if (!weekStart) return { Monday: '', Tuesday: '', Thursday: '' };

      const monday = new Date(weekStart + 'T12:00:00');
      if (isNaN(monday.getTime())) return { Monday: '', Tuesday: '', Thursday: '' };

      const tuesday = new Date(monday);
      tuesday.setDate(monday.getDate() + 1);
      const thursday = new Date(monday);
      thursday.setDate(monday.getDate() + 3);
      return {
        Monday: monday.toISOString().split('T')[0],
        Tuesday: tuesday.toISOString().split('T')[0],
        Thursday: thursday.toISOString().split('T')[0]
      };
    } catch (e) {
      console.error('weekDeliveryDates error:', e);
      return { Monday: '', Tuesday: '', Thursday: '' };
    }
  }, [selectedWeekId]);

  // Get a client's scheduled delivery date for this week
  const getClientDeliveryDate = (client) => {
    const clientName = client.displayName || client.name;

    // Check 1: Client-selected dates from portal
    const portalDates = clientPortalData?.[clientName]?.selectedDates || [];
    const weekDatesArray = Object.values(weekDeliveryDates);
    const portalDateInWeek = portalDates.find(d => weekDatesArray.includes(d));
    if (portalDateInWeek) return portalDateInWeek;

    // Check 2: Admin-set specific deliveryDates
    const specificDates = client.deliveryDates || [];
    const specificDateInWeek = specificDates.find(d => weekDatesArray.includes(d));
    if (specificDateInWeek) return specificDateInWeek;

    // Check 3: Regular deliveryDay setting (Monday, Tuesday, Thursday)
    if (client.deliveryDay && weekDeliveryDates[client.deliveryDay]) {
      return weekDeliveryDates[client.deliveryDay];
    }

    return null;
  };

  // Get clients scheduled for delivery this week (based on their delivery settings)
  const scheduledClients = useMemo(() => {
    return activeClients.filter(client => getClientDeliveryDate(client) !== null);
  }, [activeClients, weekDeliveryDates, clientPortalData]);

  // Group scheduled clients by delivery day
  const clientsByDeliveryDay = useMemo(() => {
    const grouped = { Monday: [], Tuesday: [], Thursday: [] };
    scheduledClients.forEach(client => {
      const deliveryDate = getClientDeliveryDate(client);
      if (deliveryDate === weekDeliveryDates.Monday) grouped.Monday.push(client);
      else if (deliveryDate === weekDeliveryDates.Tuesday) grouped.Tuesday.push(client);
      else if (deliveryDate === weekDeliveryDates.Thursday) grouped.Thursday.push(client);
    });
    return grouped;
  }, [scheduledClients, weekDeliveryDates]);

  // Get week start date (Monday)
  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split('T')[0];
  };

  const weekStart = getWeekStart();
  const tasks = weeklyTasks[weekStart] || {};

  // Get client status (approved, warning, no menu) - filtered to selected week
  // Now includes required meals checking
  const getClientStatus = (client) => {
    const clientName = client.displayName || client.name;
    const clientMenuItems = weekMenuItems.filter(item => item.clientName === clientName);
    const hasMenu = clientMenuItems.length > 0;
    const allApproved = hasMenu && clientMenuItems.every(item => item.approved);

    // Check required meals
    const requiredMeals = client.mealsPerWeek || 1;
    const filledMeals = clientMenuItems.filter(m => m.protein || m.veg || m.starch).length;
    const requiredMealsFilled = filledMeals >= requiredMeals;

    // Check for payment issues
    let warning = null;
    if (client.billDueDate) {
      const dueDate = new Date(client.billDueDate + 'T12:00:00');
      const now = new Date();
      const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));
      if (daysOverdue >= 1) {
        warning = `Invoice overdue (${daysOverdue} day${daysOverdue > 1 ? 's' : ''})`;
      }
    }

    if (!client.deliveryDates || client.deliveryDates.length === 0) {
      warning = warning || 'Delivery dates not set';
    }

    // Add warning if required meals not filled
    if (hasMenu && !requiredMealsFilled && !allApproved) {
      warning = warning || `Only ${filledMeals}/${requiredMeals} required meals filled`;
    }

    if (!hasMenu) {
      return { status: 'none', icon: Circle, color: 'text-gray-400', bg: 'bg-gray-50', warning, requiredMeals, filledMeals };
    }

    if (allApproved) {
      return { status: 'approved', icon: Check, color: 'text-green-600', bg: 'bg-green-50', warning, requiredMeals, filledMeals };
    }

    if (warning) {
      return { status: 'warning', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', warning, requiredMeals, filledMeals };
    }

    return { status: 'pending', icon: Circle, color: 'text-blue-600', bg: 'bg-blue-50', warning, requiredMeals, filledMeals };
  };

  // Get clients delivering this week - filtered to selected week
  const getDeliveringThisWeek = () => {
    return activeClients.filter(c => {
      const hasMenuItems = weekMenuItems.some(item => {
        const clientName = c.displayName || c.name;
        return item.clientName === clientName;
      });
      return hasMenuItems;
    });
  };

  // Get orders grouped by client - filtered to selected week
  const getWeekOrdersByClient = () => {
    const grouped = {};
    weekMenuItems.forEach(item => {
      if (!grouped[item.clientName]) grouped[item.clientName] = [];
      grouped[item.clientName].push(item);
    });
    return grouped;
  };

  const { toast: showToast, confirm } = useNotification();

  // Approve menu for a client
  const approveClientMenu = async (clientName) => {
    // Get current menu items for this client
    const currentMenuItems = menuItems.filter(item => item.clientName === clientName);
    const approvedItems = currentMenuItems.map(item => ({ ...item, approved: true }));

    // Check if we should persist to Supabase BEFORE updating UI
    const supabaseMode = isSupabaseMode();

    if (supabaseMode) {
      const isOnline = await checkConnection();

      if (!isOnline) {
        console.error('[MenuTab] Cannot persist: database offline');
        showToast('Cannot approve: database offline or misconfigured. Check console for details.', 'error');
        return; // Don't update UI if we can't persist
      }

      try {
        // Extract week IDs from menu items and ensure weeks exist first
        const weekIds = approvedItems.map(item => {
          if (item.weekId) return item.weekId;
          if (!item.date) return null;
          // Calculate week ID from date
          const date = new Date(item.date + 'T12:00:00');
          const thursday = new Date(date);
          thursday.setDate(date.getDate() + (3 - ((date.getDay() + 6) % 7)));
          const year = thursday.getFullYear();
          const jan4 = new Date(year, 0, 4);
          const weekNum = 1 + Math.round(((thursday - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
          return `${year}-W${String(weekNum).padStart(2, '0')}`;
        }).filter(Boolean);

        const weeksResult = await ensureWeeksExist(weekIds);
        if (!weeksResult.success) {
          console.error('[MenuTab] ❌ Failed to create weeks:', weeksResult.errors);
          showToast(`Failed to create week records: ${weeksResult.errors.join(', ')}`, 'error');
          return;
        }

        const menuWeekId = approvedItems[0]?.weekId || getWeekIdFromDate(approvedItems[0]?.date);
        await saveAllMenus(approvedItems);

        // Sync delivery stops for this week (creates MENU_PLANNED stops)
        if (menuWeekId) {
          await syncDeliveryStopsForWeek(menuWeekId);
        }

        setIsDirty(false); // Reset dirty flag after successful save

        // Only update local state AFTER successful persistence
        setMenuItems(prev => {
          const updated = prev.map(item =>
            item.clientName === clientName ? { ...item, approved: true } : item
          );
          return updated;
        });

        // Refetch to sync state with DB
        try {
          const freshMenus = await fetchMenus();
          setMenuItems(prev => {
            const dbIds = new Set(freshMenus.map(m => `${m.clientName}-${m.date}`));
            const localOnly = prev.filter(item => !dbIds.has(`${item.clientName}-${item.date}`));
            return [...freshMenus, ...localOnly];
          });
        } catch (refetchError) {
          console.warn('[MenuTab] Refetch failed, using local state:', refetchError);
        }

        showToast(`Menu approved for ${clientName}`, 'success');

        // Signal to KDS that menus were just approved (for syncing indicator)
        window.dispatchEvent(new CustomEvent('menusApproved', { detail: { timestamp: Date.now() } }));
      } catch (error) {
        console.error('[MENU SAVE ERROR FULL]', error);
        console.error('[MENU SAVE ERROR MESSAGE]', error?.message);
        console.error('[MENU SAVE ERROR DETAILS]', error?.details);
        console.error('[MENU SAVE ERROR HINT]', error?.hint);
        console.error('[MENU SAVE ERROR CODE]', error?.code);
        showToast(`Failed to approve: ${error.message || 'Database error'}. Menu NOT saved.`, 'error');
        // Don't update local state - approval failed
      }
    } else {
      // Local mode - just update local state
      setMenuItems(prev => prev.map(item =>
        item.clientName === clientName ? { ...item, approved: true } : item
      ));

      // Signal to KDS that menus were just approved
      window.dispatchEvent(new CustomEvent('menusApproved', { detail: { timestamp: Date.now() } }));
      showToast(`Menu approved for ${clientName} (local only - not persisted)`, 'info');
    }
  };

  // Approve ALL menus for the week - database-driven, no UI filtering
  const approveAllReady = async () => {
    // Check Supabase connectivity
    if (isSupabaseMode()) {
      const isOnline = await checkConnection();
      if (!isOnline) {
        showToast('Cannot approve: database offline', 'error');
        return;
      }

      try {
        // Approve all unapproved menus for this week directly in database
        const result = await approveAllMenusForWeek(selectedWeekId);

        // Refetch menus from database to sync UI state
        const freshMenus = await fetchMenusByWeek(selectedWeekId, false);
        setMenuItems(freshMenus);

        if (result.updated > 0) {
          showToast(`Approved ${result.updated} menu(s)`, 'success');
        } else {
          showToast('All menus already approved', 'info');
        }
      } catch (err) {
        console.error('[MENU SAVE ERROR FULL]', err);
        console.error('[MENU SAVE ERROR MESSAGE]', err?.message);
        console.error('[MENU SAVE ERROR DETAILS]', err?.details);
        console.error('[MENU SAVE ERROR HINT]', err?.hint);
        console.error('[MENU SAVE ERROR CODE]', err?.code);
        showToast('Failed to approve menus: ' + err.message, 'error');
      }
    } else {
      // Local mode fallback - approve all unapproved items
      const unapprovedCount = weekMenuItems.filter(item => !item.approved).length;
      if (unapprovedCount === 0) {
        showToast('All menus already approved', 'info');
        return;
      }
      setMenuItems(prev => prev.map(item =>
        getWeekIdFromDate(item.date) === selectedWeekId
          ? { ...item, approved: true }
          : item
      ));
      showToast(`Approved ${unapprovedCount} menu(s)`, 'success');
    }
  };

  // Deny (remove) menu for a client
  const denyClientMenu = async (clientName) => {
    if (await confirm(`Remove all menu items for ${clientName}?`)) {
      setMenuItems(prev => prev.filter(item => item.clientName !== clientName));
      setPreviewClient(null);
    }
  };

  // Start editing a client's menu - opens the detailed edit modal
  const startEditingMenu = async (clientName, orders) => {
    const isApproved = orders.every(o => o.approved);

    // Check if approved and week is locked
    if (isApproved && isWeekLocked) {
      showToast('This menu is approved and the week is locked. Unlock the week first to make edits.', 'warning');
      return;
    }

    // Find the client
    const client = activeClients.find(c => (c.displayName || c.name) === clientName) ||
                   activeClients.find(c => c.name === clientName);

    if (!client) {
      showToast('Client not found', 'error');
      return;
    }

    const date = orders[0]?.date || menuDate;
    const requiredMeals = client.mealsPerWeek || 1;

    // Open the edit modal with current menus
    // Preserve clientId/clientName from database - do not overwrite with lookup
    setEditModal({
      client,
      date,
      menus: orders.map(o => ({ ...o })),
      requiredMeals
    });
  };

  // Handle Start Over - delete all menus for this client/date, create blank slots
  const handleStartOver = async () => {
    if (!editModal) return;

    const { client, date, requiredMeals } = editModal;

    if (!(await confirm(`This will delete ALL meals for ${client.displayName || client.name} on ${date} and create ${requiredMeals} blank slot(s). Continue?`))) {
      return;
    }

    setEditModalLoading(true);
    try {
      // Delete all existing menus
      await deleteMenusForClientDate({
        weekId: selectedWeekId,
        date,
        clientId: client.id
      });

      // Create blank slots
      await createBlankMenusForClientDate({
        weekId: selectedWeekId,
        date,
        clientId: client.id,
        clientName: client.name,
        requiredMeals,
        portions: client.portions || 1
      });

      // Refetch menus for this client/date
      const freshMenus = await fetchMenusForClientDate({
        clientId: client.id,
        date
      });

      setEditModal(prev => ({ ...prev, menus: freshMenus }));

      // Also refresh the main menu items list
      const allMenus = await fetchMenusByWeek(selectedWeekId, false);
      setMenuItems(allMenus);

      showToast(`Created ${requiredMeals} blank meal slot(s)`, 'success');
    } catch (err) {
      console.error('[MENU SAVE ERROR FULL]', err);
      console.error('[MENU SAVE ERROR MESSAGE]', err?.message);
      console.error('[MENU SAVE ERROR DETAILS]', err?.details);
      console.error('[MENU SAVE ERROR HINT]', err?.hint);
      console.error('[MENU SAVE ERROR CODE]', err?.code);
      showToast('Failed to reset menu: ' + err.message, 'error');
    } finally {
      setEditModalLoading(false);
    }
  };

  // Save a single meal row in the edit modal
  const handleSaveMealRow = async (menuRow) => {
    if (!editModal) return;

    const { client, date } = editModal;

    // Resolve clientId/clientName with fallback to menuRow values
    const resolvedClientId = client?.id || menuRow.clientId;
    const resolvedClientName = client?.name || menuRow.clientName;

    // Guard: ensure we have a valid clientId before saving
    if (!resolvedClientId) {
      console.error('[handleSaveMealRow] Cannot save: no client_id available', {
        clientId: client?.id,
        menuRowClientId: menuRow.clientId,
        clientName: resolvedClientName,
        menuRow
      });
      showToast('Cannot save: client data is missing', 'error');
      setEditModalLoading(false);
      return;
    }

    setEditModalLoading(true);
    try {
      await saveMenu({
        ...menuRow,
        clientId: resolvedClientId,
        clientName: resolvedClientName,
        date,
        weekId: selectedWeekId
      }, menuRow.mealIndex, selectedWeekId);

      // Refetch menus
      const freshMenus = await fetchMenusForClientDate({
        clientId: resolvedClientId,
        date
      });
      setEditModal(prev => ({ ...prev, menus: freshMenus }));

      // Also refresh the main menu items list
      const allMenus = await fetchMenusByWeek(selectedWeekId, false);
      setMenuItems(allMenus);

      showToast('Meal saved', 'success');
    } catch (err) {
      console.error('[MENU SAVE ERROR FULL]', err);
      console.error('[MENU SAVE ERROR MESSAGE]', err?.message);
      console.error('[MENU SAVE ERROR DETAILS]', err?.details);
      console.error('[MENU SAVE ERROR HINT]', err?.hint);
      console.error('[MENU SAVE ERROR CODE]', err?.code);
      showToast('Failed to save meal: ' + err.message, 'error');
    } finally {
      setEditModalLoading(false);
    }
  };

  // Add a bonus meal row
  const handleAddBonusMeal = async () => {
    if (!editModal) return;

    const { client, date, menus } = editModal;
    const nextIndex = menus.length > 0 ? Math.max(...menus.map(m => m.mealIndex)) + 1 : 1;

    setEditModalLoading(true);
    try {
      await saveMenu({
        clientId: client.id,
        clientName: client.name,
        date,
        weekId: selectedWeekId,
        protein: '',
        veg: '',
        starch: '',
        extras: [],
        portions: client.portions || 1,
        approved: false
      }, nextIndex, selectedWeekId);

      // Refetch menus
      const freshMenus = await fetchMenusForClientDate({
        clientId: client.id,
        date
      });
      setEditModal(prev => ({ ...prev, menus: freshMenus }));

      // Also refresh the main menu items list
      const allMenus = await fetchMenusByWeek(selectedWeekId, false);
      setMenuItems(allMenus);

      showToast('Bonus meal added', 'success');
    } catch (err) {
      console.error('[MENU SAVE ERROR FULL]', err);
      console.error('[MENU SAVE ERROR MESSAGE]', err?.message);
      console.error('[MENU SAVE ERROR DETAILS]', err?.details);
      console.error('[MENU SAVE ERROR HINT]', err?.hint);
      console.error('[MENU SAVE ERROR CODE]', err?.code);
      showToast('Failed to add bonus meal: ' + err.message, 'error');
    } finally {
      setEditModalLoading(false);
    }
  };

  // Delete a specific meal row (bonus meals only)
  const handleDeleteMealRow = async (menuRow) => {
    if (!editModal) return;

    const { client, date, requiredMeals } = editModal;

    // Only allow deleting bonus meals (mealIndex > requiredMeals)
    if (menuRow.mealIndex <= requiredMeals) {
      showToast('Cannot delete required meal slots. Use Start Over to reset.', 'error');
      return;
    }

    if (!(await confirm(`Delete bonus meal #${menuRow.mealIndex}?`))) {
      return;
    }

    setEditModalLoading(true);
    try {
      await deleteMenuRow({
        clientId: client.id,
        date,
        mealIndex: menuRow.mealIndex
      });

      // Refetch menus
      const freshMenus = await fetchMenusForClientDate({
        clientId: client.id,
        date
      });
      setEditModal(prev => ({ ...prev, menus: freshMenus }));

      // Also refresh the main menu items list
      const allMenus = await fetchMenusByWeek(selectedWeekId, false);
      setMenuItems(allMenus);

      showToast('Bonus meal deleted', 'success');
    } catch (err) {
      console.error('[MENU SAVE ERROR FULL]', err);
      console.error('[MENU SAVE ERROR MESSAGE]', err?.message);
      console.error('[MENU SAVE ERROR DETAILS]', err?.details);
      console.error('[MENU SAVE ERROR HINT]', err?.hint);
      console.error('[MENU SAVE ERROR CODE]', err?.code);
      showToast('Failed to delete meal: ' + err.message, 'error');
    } finally {
      setEditModalLoading(false);
    }
  };

  // Approve from edit modal - check required meals first
  const handleApproveFromModal = async () => {
    if (!editModal) return;

    const { client, date, menus, requiredMeals } = editModal;

    // Check if all required meal slots have at least one dish
    const filledRequired = menus.filter(m => {
      const hasDish = m.protein || m.veg || m.starch;
      return hasDish && m.mealIndex <= requiredMeals;
    }).length;

    if (filledRequired < requiredMeals) {
      showToast(`Cannot approve: only ${filledRequired}/${requiredMeals} required meals are filled`, 'error');
      return;
    }

    setEditModalLoading(true);
    try {
      // Save all menus as approved
      for (const menu of menus) {
        await saveMenu({
          ...menu,
          clientId: client.id,
          clientName: client.name,
          approved: true
        }, menu.mealIndex, selectedWeekId);
      }

      // Sync delivery stops
      await syncDeliveryStopsForWeek(selectedWeekId);

      // Refetch menus
      const allMenus = await fetchMenusByWeek(selectedWeekId, false);
      setMenuItems(allMenus);

      showToast(`Menu approved for ${client.displayName || client.name}`, 'success');
      setEditModal(null);
    } catch (err) {
      console.error('[MENU SAVE ERROR FULL]', err);
      console.error('[MENU SAVE ERROR MESSAGE]', err?.message);
      console.error('[MENU SAVE ERROR DETAILS]', err?.details);
      console.error('[MENU SAVE ERROR HINT]', err?.hint);
      console.error('[MENU SAVE ERROR CODE]', err?.code);
      showToast('Failed to approve menu: ' + err.message, 'error');
    } finally {
      setEditModalLoading(false);
    }
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditModal(null);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingClientName(null);
    setNewMenuItem({ protein: '', veg: '', starch: '', extras: [] });
    setSelectedClients([]);
  };

  // Get menu items for a specific client - filtered to selected week
  const getClientMenuItems = (clientName) => {
    return weekMenuItems.filter(item => item.clientName === clientName);
  };

  // Toggle extra dish selection
  const toggleExtra = (recipeName) => {
    setNewMenuItem(prev => ({
      ...prev,
      extras: prev.extras.includes(recipeName)
        ? prev.extras.filter(e => e !== recipeName)
        : [...prev.extras, recipeName]
    }));
  };

  const extraCategories = [...(recipes.sauces || []), ...(recipes.breakfast || []), ...(recipes.soups || [])];
  const weekOrdersByClient = getWeekOrdersByClient();
  const deliveringThisWeek = getDeliveringThisWeek();

  // Compute unapproved menu count for this week (for print gating)
  const unapprovedMenuItems = weekMenuItems.filter(item => !item.approved);
  const unapprovedCount = unapprovedMenuItems.length;
  const unapprovedByClientLocal = {};
  unapprovedMenuItems.forEach(item => {
    const name = item.clientName || 'Unknown';
    unapprovedByClientLocal[name] = (unapprovedByClientLocal[name] || 0) + 1;
  });

  // Print function for menu planner
  const printMenuPlanner = () => {
    // Block if unapproved menus exist
    if (unapprovedCount > 0) {
      const topClients = Object.entries(unapprovedByClientLocal).slice(0, 3).map(([name, count]) => `${name} (${count})`).join(', ');
      showToast(`Cannot print yet: ${unapprovedCount} unapproved menu(s). Clients: ${topClients}. Approve all menus first.`, 'warning');
      return;
    }

    const printWindow = window.open('', '_blank');

    let content = `
      <html>
      <head>
        <title>Menu Planner - Client Orders</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 15px;
            font-size: 11px;
            line-height: 1.3;
          }
          h1 {
            color: #3d59ab;
            margin-bottom: 3px;
            font-size: 18px;
          }
          .header {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #3d59ab;
          }
          .header p { margin: 0; color: #666; font-size: 10px; }
          .columns {
            column-count: 2;
            column-gap: 25px;
          }
          .client {
            break-inside: avoid;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 1px dotted #ccc;
          }
          .client-name {
            font-weight: bold;
            font-size: 12px;
            color: #3d59ab;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .portions {
            color: #888;
            font-size: 10px;
            font-weight: normal;
          }
          .status { font-size: 12px; }
          .approved { color: #22c55e; }
          .pending { color: #f59e0b; }
          .meals {
            margin-left: 4px;
          }
          .meal {
            margin-bottom: 6px;
          }
          .protein {
            font-weight: bold;
            font-size: 11px;
            color: #333;
            padding: 2px 0;
          }
          .protein:before {
            content: "•";
            margin-right: 6px;
            color: #3d59ab;
            font-weight: bold;
          }
          .sides {
            margin-left: 16px;
            color: #555;
            font-size: 10px;
          }
          .side {
            padding: 1px 0;
          }
          .side:before {
            content: "◦";
            margin-right: 5px;
            color: #999;
          }
          .extras {
            margin-left: 16px;
            margin-top: 2px;
          }
          .extra {
            color: #7c3aed;
            font-style: italic;
            font-size: 10px;
            padding: 1px 0;
          }
          .extra:before {
            content: "+";
            margin-right: 4px;
          }
          @media print {
            body { padding: 10px; }
            .columns { column-count: 2; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Client Orders</h1>
          <p>Week: ${selectedWeekId} | ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="columns">
    `;

    Object.entries(weekOrdersByClient).forEach(([clientName, orders]) => {
      const allApproved = orders.every(o => o.approved);
      const client = activeClients.find(c => (c.displayName || c.name) === clientName) ||
                     activeClients.find(c => c.name === clientName);
      const displayName = client?.displayName || clientName;
      const portions = orders[0]?.portions || 1;

      content += `<div class="client">`;
      content += `<div class="client-name">`;
      content += `<span>${displayName}</span>`;
      content += `<span class="portions">(${portions}p)</span>`;
      content += `<span class="status ${allApproved ? 'approved' : 'pending'}">${allApproved ? '✓' : '○'}</span>`;
      content += `</div>`;
      content += `<div class="meals">`;

      orders.forEach(order => {
        content += `<div class="meal">`;

        if (order.protein) {
          // Protein as main bullet
          content += `<div class="protein">${order.protein}</div>`;

          // Veg and starch as indented sub-bullets
          if (order.veg || order.starch) {
            content += `<div class="sides">`;
            if (order.veg) content += `<div class="side">${order.veg}</div>`;
            if (order.starch) content += `<div class="side">${order.starch}</div>`;
            content += `</div>`;
          }
        } else {
          // No protein - show veg/starch as main items
          if (order.veg) content += `<div class="protein">${order.veg}</div>`;
          if (order.starch) content += `<div class="protein">${order.starch}</div>`;
        }

        // Extras
        if (order.extras && order.extras.length > 0) {
          content += `<div class="extras">`;
          order.extras.forEach(extra => {
            content += `<div class="extra">${extra}</div>`;
          });
          content += `</div>`;
        }

        content += `</div>`;
      });

      content += `</div></div>`;
    });

    content += `</div></body></html>`;

    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  // Count status summary
  const statusSummary = {
    approved: activeClients.filter(c => getClientStatus(c).status === 'approved').length,
    pending: activeClients.filter(c => getClientStatus(c).status === 'pending').length,
    warning: activeClients.filter(c => getClientStatus(c).warning).length,
    noMenu: activeClients.filter(c => getClientStatus(c).status === 'none').length
  };

  return (
    <div className="space-y-6">
      {/* Warning banner if selectedWeekId is missing */}
      {showWeekIdWarning && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Warning:</strong> Week not selected (selectedWeekId missing) — menus cannot load.
        </div>
      )}

      {/* Week Selector */}
      {weeks && selectedWeekId && setSelectedWeekId && (
        <WeekSelector
          selectedWeekId={selectedWeekId}
          setSelectedWeekId={setSelectedWeekId}
          weeks={weeks}
          onLockWeek={lockWeekAndSnapshot}
          onUnlockWeek={unlockWeekById}
        />
      )}

      {/* Hidden clients warning — menus exist but client has no delivery date for this week */}
      {orphanedMenuClients.length > 0 && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">
              {orphanedMenuClients.length === 1
                ? '1 client has menus this week but no delivery date set'
                : `${orphanedMenuClients.length} clients have menus this week but no delivery date set`}
            </p>
            <p className="text-amber-700 text-xs mt-1">
              They won&apos;t appear in the schedule below until a delivery date is added in the Clients tab.
            </p>
            <ul className="mt-2 space-y-0.5">
              {orphanedMenuClients.map(({ name }) => (
                <li key={name} className="text-amber-800 text-xs font-medium">• {name}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 1. Delivering This Week - Clients grouped by delivery day */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#3d59ab' }}>Delivering This Week</h2>
            <p className="text-sm text-gray-500 mt-1">
              {scheduledClients.length} clients scheduled • Based on delivery settings in Billing & Dates
            </p>
          </div>
          {weekMenuItems.length > 0 && (
            <button
              onClick={approveAllReady}
              className="px-4 py-2 rounded-lg text-white font-medium text-sm"
              style={{ backgroundColor: '#10b981' }}
            >
              Approve All
            </button>
          )}
        </div>

        {scheduledClients.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['Monday', 'Tuesday', 'Thursday'].map(day => {
              const dayClients = clientsByDeliveryDay[day];
              const dayDate = weekDeliveryDates[day];
              const formattedDate = new Date(dayDate + 'T12:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              });

              return (
                <div key={day} className="rounded-lg p-3" style={{ backgroundColor: '#f9f9ed' }}>
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b" style={{ borderColor: '#ebb582' }}>
                    <Calendar size={16} style={{ color: '#3d59ab' }} />
                    <span className="font-bold text-sm" style={{ color: '#3d59ab' }}>{day}</span>
                    <span className="text-xs text-gray-500">{formattedDate}</span>
                  </div>
                  {dayClients.length > 0 ? (
                    <div className="space-y-1">
                      {dayClients.map((client, i) => {
                        const clientName = client.displayName || client.name;
                        const hasMenu = weekMenuItems.some(item => item.clientName === clientName);
                        const isApproved = hasMenu && weekMenuItems.filter(item => item.clientName === clientName).every(item => item.approved);

                        return (
                          <div key={i} className="flex items-center gap-1.5 text-sm">
                            {hasMenu ? (
                              <Check
                                size={14}
                                className={isApproved ? 'text-green-600' : 'text-blue-500'}
                              />
                            ) : (
                              <Circle size={14} className="text-gray-300" />
                            )}
                            <span className={
                              hasMenu
                                ? (isApproved ? 'text-green-700 font-medium' : 'text-blue-600')
                                : 'text-gray-600'
                            }>
                              {clientName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No deliveries</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
            <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-gray-500">No clients scheduled for this week</p>
            <p className="text-sm text-gray-400 mt-1">
              Set delivery days in Clients → Edit or Billing & Dates
            </p>
          </div>
        )}
      </div>

      {/* 2. Current Orders - Shows styled menu cards for approval */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold" style={{ color: '#3d59ab' }}>
            Current Orders ({weekMenuItems.length > 0 ? Object.keys(weekOrdersByClient).length + ' clients' : 'None'})
          </h2>
            <div className="flex items-center gap-2">
              <div className="relative group">
                <button
                  onClick={printMenuPlanner}
                  disabled={unapprovedCount > 0}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-sm ${
                    unapprovedCount > 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
                  title={unapprovedCount > 0 ? 'Approve all menus to enable printing' : 'Print menus'}
                >
                  <Printer size={16} /> Print
                </button>
                {unapprovedCount > 0 && (
                  <span className="absolute -bottom-5 left-0 text-xs text-amber-600 whitespace-nowrap">
                    Approve all menus to enable
                  </span>
                )}
              </div>
              {weekMenuItems.length > 0 && (
                <button
                  onClick={approveAllReady}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  <Check size={16} /> Approve All
                </button>
              )}
            </div>
          </div>

          {weekMenuItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(weekOrdersByClient).map(([clientName, orders]) => {
              const allApproved = orders.every(o => o.approved);
              const client = activeClients.find(c => (c.displayName || c.name) === clientName) ||
                             activeClients.find(c => c.name === clientName) ||
                             { name: clientName, displayName: clientName };

              return (
                <div key={clientName} className="flex flex-col">
                  {/* Styled Menu Card */}
                  <StyledMenuCard
                    client={client}
                    date={orders[0]?.date || menuDate}
                    menuItems={orders}
                  />

                  {/* Approval Controls */}
                  <div className="mt-3 flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                    <div className="flex items-center gap-2">
                      {allApproved ? (
                        <span className="text-sm text-green-700 flex items-center gap-1 font-medium">
                          <Check size={16} /> Approved
                        </span>
                      ) : (
                        <>
                          <span className="text-sm text-blue-600">Pending approval</span>
                          {(() => {
                            const requiredMeals = client.mealsPerWeek || 1;
                            const filledMeals = orders.filter(m => m.protein || m.veg || m.starch).length;
                            if (filledMeals < requiredMeals) {
                              return (
                                <span className="text-xs text-amber-600">
                                  ({filledMeals}/{requiredMeals} meals)
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!allApproved && (
                        <button
                          onClick={() => {
                            // Check required meals before approving
                            const requiredMeals = client.mealsPerWeek || 1;
                            const filledMeals = orders.filter(m => m.protein || m.veg || m.starch).length;
                            if (filledMeals < requiredMeals) {
                              showToast(`Cannot approve: only ${filledMeals}/${requiredMeals} required meals filled. Click Edit to fill remaining meals.`, 'error');
                              return;
                            }
                            approveClientMenu(clientName);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm text-white"
                          style={{ backgroundColor: '#22c55e' }}
                        >
                          <Check size={14} /> Approve
                        </button>
                      )}
                      <button
                        onClick={() => startEditingMenu(clientName, orders)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm ${
                          allApproved && isWeekLocked
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        }`}
                        title={allApproved && isWeekLocked ? 'Unlock week to edit approved menu' : 'Edit menu'}
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                      <button
                        onClick={() => denyClientMenu(clientName)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-red-100 text-red-700"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
            <Utensils size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-gray-500">No saved menus for this week yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Build a menu below and approve it to see it here
            </p>
          </div>
        )}
        </div>

      {/* 3. Build Menu Section */}
      <div className={`bg-white rounded-lg shadow-lg p-6 ${editingClientName ? 'ring-2 ring-blue-500' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold" style={{ color: '#3d59ab' }}>
              {editingClientName ? `Editing: ${editingClientName}` : 'Build Menu'}
            </h2>
            {editingClientName && (
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                Editing Mode
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editingClientName && (
              <button
                onClick={cancelEditing}
                className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                <X size={14} /> Cancel Edit
              </button>
            )}
            <button
              onClick={() => setShowMenuBuilder(!showMenuBuilder)}
              className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              {showMenuBuilder ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {showMenuBuilder ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {showMenuBuilder && (
          <>
            {/* Client Selection - grouped by delivery day */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2" style={{ color: '#423d3c' }}>
                Select Clients for Menu
              </label>
              {scheduledClients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['Monday', 'Tuesday', 'Thursday'].map(day => {
                    const dayClients = clientsByDeliveryDay[day];
                    const dayDate = weekDeliveryDates[day];
                    if (dayClients.length === 0) return null;

                    return (
                      <div key={day} className="rounded-lg p-3 border-2" style={{ borderColor: '#ebb582', backgroundColor: '#fefefe' }}>
                        <div className="flex items-center justify-between mb-2 pb-1 border-b" style={{ borderColor: '#f0d5bc' }}>
                          <span className="font-bold text-xs" style={{ color: '#3d59ab' }}>{day}</span>
                          <button
                            onClick={() => {
                              const dayClientNames = dayClients.map(c => c.name);
                              const allSelected = dayClientNames.every(n => selectedClients.includes(n));
                              if (allSelected) {
                                setSelectedClients(prev => prev.filter(n => !dayClientNames.includes(n)));
                              } else {
                                setSelectedClients(prev => [...new Set([...prev, ...dayClientNames])]);
                                setMenuDate(dayDate);
                              }
                            }}
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ backgroundColor: '#3d59ab', color: 'white' }}
                          >
                            {dayClients.every(c => selectedClients.includes(c.name)) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {dayClients.map((client, i) => {
                            const isSelected = selectedClients.includes(client.name);
                            const hasMenu = weekMenuItems.some(item => item.clientName === (client.displayName || client.name));

                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedClients(prev => prev.filter(c => c !== client.name));
                                  } else {
                                    setSelectedClients(prev => [...prev, client.name]);
                                    setMenuDate(dayDate); // Auto-set date based on client's delivery day
                                  }
                                }}
                                className={`px-2 py-1 rounded-full border text-xs transition-colors ${
                                  isSelected ? 'text-white' : 'bg-white'
                                }`}
                                style={isSelected
                                  ? { backgroundColor: '#3d59ab', borderColor: '#3d59ab' }
                                  : { borderColor: hasMenu ? '#22c55e' : '#ebb582', color: hasMenu ? '#22c55e' : '#423d3c' }}
                              >
                                {hasMenu && <Check size={10} className="inline mr-0.5" />}
                                {client.displayName || client.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
                  <p className="text-gray-500 text-sm">No clients scheduled for this week</p>
                  <p className="text-xs text-gray-400 mt-1">Set delivery days in Clients or Billing & Dates first</p>
                </div>
              )}

              {/* Show unscheduled active clients if any */}
              {activeClients.length > scheduledClients.length && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: '#ebb582' }}>
                  <p className="text-xs text-gray-500 mb-2">
                    Clients without scheduled delivery ({activeClients.length - scheduledClients.length}):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {activeClients
                      .filter(c => !scheduledClients.includes(c))
                      .map((client, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setSelectedClients(prev =>
                              prev.includes(client.name)
                                ? prev.filter(c => c !== client.name)
                                : [...prev, client.name]
                            );
                          }}
                          className={`px-2 py-1 rounded-full border text-xs transition-colors ${
                            selectedClients.includes(client.name) ? 'text-white' : 'bg-white'
                          }`}
                          style={selectedClients.includes(client.name)
                            ? { backgroundColor: '#9ca3af', borderColor: '#9ca3af' }
                            : { borderColor: '#d1d5db', color: '#6b7280' }}
                        >
                          {client.displayName || client.name}
                        </button>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Date - Auto-filled based on selected clients, but can be overridden */}
            {selectedClients.length > 0 && (
              <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#e8f4fd', border: '1px solid #3d59ab33' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} style={{ color: '#3d59ab' }} />
                    <span className="text-sm font-medium" style={{ color: '#3d59ab' }}>
                      Delivery Date:
                    </span>
                    <span className="font-bold" style={{ color: '#3d59ab' }}>
                      {new Date(menuDate + 'T12:00:00').toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <input
                    type="date"
                    value={menuDate}
                    onChange={(e) => setMenuDate(e.target.value)}
                    className="text-sm p-1.5 border rounded"
                    style={{ borderColor: '#3d59ab33' }}
                    title="Override delivery date if needed"
                  />
                </div>
              </div>
            )}

            {/* Show dietary restrictions for selected clients */}
            {selectedClients.length > 0 && (
              <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: '#fff8e7', border: '1px solid #ebb582' }}>
                <label className="block text-sm font-medium mb-2" style={{ color: '#423d3c' }}>
                  Dietary Restrictions
                </label>
                <div className="space-y-1">
                  {selectedClients.map(clientName => {
                    const client = activeClients.find(c => c.name === clientName);
                    const restrictions = client?.dietaryRestrictions;
                    if (!restrictions) return null;
                    return (
                      <div key={clientName} className="text-sm">
                        <span className="font-medium" style={{ color: '#3d59ab' }}>
                          {client.displayName || client.name}:
                        </span>{' '}
                        <span style={{ color: '#b45309' }}>{restrictions}</span>
                      </div>
                    );
                  })}
                  {selectedClients.every(clientName => {
                    const client = activeClients.find(c => c.name === clientName);
                    return !client?.dietaryRestrictions;
                  }) && (
                    <p className="text-sm text-gray-500 italic">No dietary restrictions noted</p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {['protein', 'veg', 'starch'].map(type => (
                <div key={type}>
                  <label className="block text-sm font-medium mb-2 capitalize" style={{ color: '#423d3c' }}>
                    {type === 'veg' ? 'Vegetable' : type}
                  </label>
                  <select
                    value={newMenuItem[type]}
                    onChange={(e) => setNewMenuItem({ ...newMenuItem, [type]: e.target.value })}
                    className="w-full p-2 border-2 rounded-lg"
                    style={{ borderColor: '#ebb582' }}
                  >
                    <option value="">Select...</option>
                    {(recipes[type] || []).map((r, i) => (
                      <option key={i} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {extraCategories.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#423d3c' }}>
                  Extras (Sauces, Breakfast, Soups)
                </label>
                <div className="flex flex-wrap gap-2">
                  {extraCategories.map((recipe, i) => (
                    <button
                      key={i}
                      onClick={() => toggleExtra(recipe.name)}
                      className={`px-3 py-1 rounded-full border-2 transition-colors text-sm ${
                        newMenuItem.extras.includes(recipe.name) ? 'text-white' : 'bg-white'
                      }`}
                      style={newMenuItem.extras.includes(recipe.name)
                        ? { backgroundColor: '#ebb582', borderColor: '#ebb582' }
                        : { borderColor: '#ebb582', color: '#423d3c' }}
                    >
                      {recipe.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  addMenuItem();
                  if (editingClientName) {
                    setEditingClientName(null);
                  }
                }}
                className="flex items-center gap-2 px-6 py-2 rounded-lg hover:opacity-90"
                style={{ backgroundColor: editingClientName ? '#3d59ab' : '#ffd700', color: editingClientName ? '#fff' : '#423d3c' }}
              >
                {editingClientName ? (
                  <>
                    <Check size={20} />Save Changes
                  </>
                ) : (
                  <>
                    <Plus size={20} />Add to Menu
                  </>
                )}
              </button>
              {editingClientName && (
                <button
                  onClick={cancelEditing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 text-gray-700"
                >
                  <X size={16} />Cancel
                </button>
              )}
              {!editingClientName && menuItems.length > 0 && (
                <button
                  onClick={clearMenu}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm"
                >
                  <Trash2 size={16} />Clear All
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Preview Modal */}
      {previewClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-bold" style={{ color: '#3d59ab' }}>
                Menu Preview
              </h3>
              <button
                onClick={() => setPreviewClient(null)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4">
              <StyledMenuCard
                client={previewClient}
                date={menuDate}
                menuItems={getClientMenuItems(previewClient.displayName || previewClient.name)}
              />
            </div>

            <div className="p-4 border-t flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                onClick={() => denyClientMenu(previewClient.displayName || previewClient.name)}
                className="px-4 py-2 rounded-lg bg-red-100 text-red-700"
              >
                Remove Menu
              </button>
              <button
                onClick={() => {
                  const clientName = previewClient.displayName || previewClient.name;
                  const orders = getClientMenuItems(clientName);
                  startEditingMenu(clientName, orders);
                  setPreviewClient(null);
                }}
                className="px-4 py-2 rounded-lg border-2 flex items-center gap-2"
                style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
              >
                <Edit2 size={18} /> Edit
              </button>
              <button
                onClick={() => {
                  approveClientMenu(previewClient.displayName || previewClient.name);
                  setPreviewClient(null);
                }}
                className="px-4 py-2 rounded-lg text-white flex items-center gap-2"
                style={{ backgroundColor: '#22c55e' }}
              >
                <Check size={18} /> Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Menu Modal - Detailed meal-by-meal editing */}
      {editModal && (
        <EditMenuModal
          editModal={editModal}
          setEditModal={setEditModal}
          editModalLoading={editModalLoading}
          recipes={recipes}
          onStartOver={handleStartOver}
          onSaveMealRow={handleSaveMealRow}
          onAddBonusMeal={handleAddBonusMeal}
          onDeleteMealRow={handleDeleteMealRow}
          onApprove={handleApproveFromModal}
          onClose={closeEditModal}
        />
      )}
    </div>
  );
}

// Edit Menu Modal Component - detailed meal-by-meal editing
function EditMenuModal({
  editModal,
  setEditModal,
  editModalLoading,
  recipes,
  onStartOver,
  onSaveMealRow,
  onAddBonusMeal,
  onDeleteMealRow,
  onApprove,
  onClose
}) {
  const { client, date, menus, requiredMeals } = editModal;
  const displayName = client.displayName || client.name;

  // Local state for editing each meal row
  const [editingRows, setEditingRows] = useState({});

  // Initialize editing state when menus change
  useEffect(() => {
    const rows = {};
    menus.forEach(m => {
      rows[m.mealIndex] = {
        protein: m.protein || '',
        veg: m.veg || '',
        starch: m.starch || '',
        extras: m.extras || [],
        dirty: false
      };
    });
    setEditingRows(rows);
  }, [menus]);

  const updateRow = (mealIndex, field, value) => {
    setEditingRows(prev => ({
      ...prev,
      [mealIndex]: {
        ...prev[mealIndex],
        [field]: value,
        dirty: true
      }
    }));
  };

  const saveRow = (menu) => {
    const editedRow = editingRows[menu.mealIndex];
    if (!editedRow) return;

    onSaveMealRow({
      ...menu,
      protein: editedRow.protein,
      veg: editedRow.veg,
      starch: editedRow.starch,
      extras: editedRow.extras
    });
  };

  // Check approval eligibility
  const filledRequired = menus.filter(m => {
    const row = editingRows[m.mealIndex];
    const hasDish = (row?.protein || m.protein) || (row?.veg || m.veg) || (row?.starch || m.starch);
    return hasDish && m.mealIndex <= requiredMeals;
  }).length;

  const canApprove = filledRequired >= requiredMeals;
  const isApproved = menus.length > 0 && menus.every(m => m.approved);

  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-bold" style={{ color: '#3d59ab' }}>
              Edit Menu: {displayName}
            </h3>
            <p className="text-sm text-gray-500">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-2">
            {isApproved && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                <Check size={12} /> Approved
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-100"
              disabled={editModalLoading}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Loading overlay */}
        {editModalLoading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
            <div className="text-gray-600">Saving...</div>
          </div>
        )}

        {/* Meal slots info */}
        <div className="p-4 bg-blue-50 border-b">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-blue-800">
                Required meals: {requiredMeals}
              </span>
              <span className="text-sm text-blue-600 ml-2">
                ({filledRequired}/{requiredMeals} filled)
              </span>
            </div>
            <button
              onClick={onStartOver}
              disabled={editModalLoading}
              className="text-sm px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
            >
              Start Over
            </button>
          </div>
        </div>

        {/* Meal rows */}
        <div className="p-4 space-y-4">
          {menus.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No meals yet.</p>
              <button
                onClick={onStartOver}
                disabled={editModalLoading}
                className="mt-2 text-sm px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Create {requiredMeals} Blank Slot(s)
              </button>
            </div>
          ) : (
            menus.map((menu) => {
              const isBonus = menu.mealIndex > requiredMeals;
              const row = editingRows[menu.mealIndex] || {};
              const hasDish = row.protein || row.veg || row.starch;

              return (
                <div
                  key={menu.mealIndex}
                  className={`p-3 rounded-lg border-2 ${
                    isBonus ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isBonus ? 'text-purple-700' : 'text-gray-700'}`}>
                        Meal #{menu.mealIndex}
                      </span>
                      {isBonus && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-200 text-purple-700">
                          Bonus
                        </span>
                      )}
                      {!hasDish && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Empty
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {row.dirty && (
                        <button
                          onClick={() => saveRow(menu)}
                          disabled={editModalLoading}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                      )}
                      {isBonus && (
                        <button
                          onClick={() => onDeleteMealRow(menu)}
                          disabled={editModalLoading}
                          className="text-xs p-1 rounded hover:bg-red-100 text-red-600 disabled:opacity-50"
                          title="Delete bonus meal"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Protein</label>
                      <select
                        value={row.protein || ''}
                        onChange={(e) => updateRow(menu.mealIndex, 'protein', e.target.value)}
                        className="w-full p-1.5 text-sm border rounded"
                        disabled={editModalLoading}
                      >
                        <option value="">Select...</option>
                        {(recipes.protein || []).map((r, i) => (
                          <option key={i} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Vegetable</label>
                      <select
                        value={row.veg || ''}
                        onChange={(e) => updateRow(menu.mealIndex, 'veg', e.target.value)}
                        className="w-full p-1.5 text-sm border rounded"
                        disabled={editModalLoading}
                      >
                        <option value="">Select...</option>
                        {(recipes.veg || []).map((r, i) => (
                          <option key={i} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Starch</label>
                      <select
                        value={row.starch || ''}
                        onChange={(e) => updateRow(menu.mealIndex, 'starch', e.target.value)}
                        className="w-full p-1.5 text-sm border rounded"
                        disabled={editModalLoading}
                      >
                        <option value="">Select...</option>
                        {(recipes.starch || []).map((r, i) => (
                          <option key={i} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Add bonus meal button */}
          {menus.length > 0 && (
            <button
              onClick={onAddBonusMeal}
              disabled={editModalLoading}
              className="w-full py-2 text-sm text-purple-700 border-2 border-dashed border-purple-300 rounded-lg hover:bg-purple-50 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Plus size={16} />
              Add Bonus Meal
            </button>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t flex justify-between items-center sticky bottom-0 bg-white">
          <div className="text-sm text-gray-500">
            {canApprove ? (
              <span className="text-green-600">Ready to approve</span>
            ) : (
              <span className="text-amber-600">Fill all {requiredMeals} required meal(s) to approve</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={editModalLoading}
              className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Close
            </button>
            {!isApproved && (
              <button
                onClick={onApprove}
                disabled={editModalLoading || !canApprove}
                className={`px-4 py-2 rounded-lg text-white flex items-center gap-2 ${
                  canApprove ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'
                } disabled:opacity-50`}
              >
                <Check size={16} /> Approve Menu
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

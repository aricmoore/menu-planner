import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNotification } from '../components/NotificationContext';
import { Download, Trash2, Check, Plus, ChevronRight, X, RefreshCw, MoveRight, FolderOpen, GripVertical } from 'lucide-react';
import { isSupabaseMode } from '../lib/dataMode';
import { saveAppSetting } from '../lib/database';

const SHOP_DAYS = ['Sunday', 'Tuesday', 'Thursday'];

// Standard sections for organizing items
const STANDARD_SECTIONS = [
  'Produce',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry',
  'Frozen',
  'Bakery',
  'Beverages',
  'Spices & Seasonings',
  'Oils & Vinegars',
  'Canned Goods',
  'Grains & Pasta',
  'Other'
];

// Common store/vendor sources
const STANDARD_SOURCES = [
  'Grocery Store',
  'Costco',
  'Restaurant Depot',
  'Farmers Market',
  'Specialty Store',
  'Online',
  'Other'
];

export default function PrepTab({ prepList, shoppingListsByDay = {}, exportPrepList, selectedWeekId, unapprovedMenuCount = 0, unapprovedByClient = {} }) {
  const { toast, confirm } = useNotification();
  // Shopping list state (loaded from Supabase, saved on change)
  const [checkedItems, setCheckedItems] = useState({});
  const [manualItems, setManualItems] = useState({ Sunday: [], Tuesday: [], Thursday: [] });
  const [itemOverrides, setItemOverrides] = useState({});
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);

  const [newItemText, setNewItemText] = useState('');
  const [addingToDay, setAddingToDay] = useState(null);
  const [movingItem, setMovingItem] = useState(null); // { day, item }

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState(null); // { day, item }
  const [dragOverDay, setDragOverDay] = useState(null);

  // Normalize name for ID generation
  const normalizeNameForStorage = (name) => (name || '').toLowerCase().trim().replace(/\s+/g, ' ');

  // Load shopping list state from Supabase on week change
  useEffect(() => {
    const loadState = async () => {
      if (!isSupabaseMode() || !selectedWeekId) {
        setIsLoaded(true);
        return;
      }

      try {
        const { fetchShoppingListState } = await import('../lib/database');
        const state = await fetchShoppingListState(selectedWeekId);
        setCheckedItems(state.checkedItems || {});
        setManualItems(state.manualItems || { Sunday: [], Tuesday: [], Thursday: [] });
        setItemOverrides(state.itemOverrides || {});
      } catch (err) {
        console.error('[PrepTab] Failed to load shopping list state:', err);
      }
      setIsLoaded(true);
    };

    loadState();
  }, [selectedWeekId]);

  // Save shopping list state to Supabase (debounced)
  const saveState = useCallback(async () => {
    if (!isSupabaseMode() || !selectedWeekId || !isLoaded) return;

    try {
      const { saveShoppingListState } = await import('../lib/database');
      await saveShoppingListState(selectedWeekId, {
        checkedItems,
        manualItems,
        itemOverrides
      });
    } catch (err) {
      console.error('[PrepTab] Failed to save shopping list state:', err);
      toast(`Failed to save shopping list: ${err.message}`, 'error');
    }
  }, [selectedWeekId, checkedItems, manualItems, itemOverrides, isLoaded]);

  // Debounced save effect
  useEffect(() => {
    if (!isLoaded) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveState();
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [checkedItems, manualItems, itemOverrides, saveState, isLoaded]);

  // Generate day-specific ID for checked state
  const getDayItemId = (day, itemId) => `${day}-${itemId}`;

  // Normalize name for consistent ID generation (matches App.jsx consolidation)
  const normalizeForId = (name) => (name || '').toLowerCase().trim().replace(/\s+/g, ' ');

  // Get combined list for a day (auto-generated + manual) with overrides applied
  const getItemsForDay = (day) => {
    const autoItems = (shoppingListsByDay[day] || []).map(item => {
      // Use ingredient_id if present, otherwise normalized name (matches App.jsx aggregation)
      const ingredientKey = item.ingredient_id
        ? String(item.ingredient_id)
        : normalizeForId(item.name);
      const normalizedUnit = (item.unit || 'oz').toLowerCase().trim();
      const baseId = `auto-${ingredientKey}|${normalizedUnit}`;
      const dayItemId = getDayItemId(day, baseId);
      const override = itemOverrides[dayItemId] || {};
      return {
        ...item,
        id: baseId,
        dayItemId,
        manual: false,
        checked: checkedItems[dayItemId] || false,
        // Apply overrides
        section: override.section || item.section,
        source: override.source || item.source,
        originalSection: item.section,
        originalSource: item.source,
        hasOverride: !!(override.section || override.source)
      };
    });
    const manualItemsForDay = (manualItems[day] || []).map(item => {
      const dayItemId = getDayItemId(day, item.id);
      const override = itemOverrides[dayItemId] || {};
      return {
        ...item,
        dayItemId,
        checked: checkedItems[dayItemId] || false,
        // Apply overrides (or use item's own values)
        section: override.section || item.section,
        source: override.source || item.source,
        originalSection: item.section,
        originalSource: item.source,
        hasOverride: !!(override.section || override.source)
      };
    });
    return [...autoItems, ...manualItemsForDay];
  };

  // Change item's section within the same day
  const changeItemSection = (day, item, newSection) => {
    const dayItemId = getDayItemId(day, item.id);
    setItemOverrides(prev => ({
      ...prev,
      [dayItemId]: {
        ...prev[dayItemId],
        section: newSection
      }
    }));
  };

  // Change item's source/vendor within the same day
  const changeItemSource = (day, item, newSource) => {
    const dayItemId = getDayItemId(day, item.id);
    setItemOverrides(prev => ({
      ...prev,
      [dayItemId]: {
        ...prev[dayItemId],
        source: newSource
      }
    }));
  };

  // Reset item's section/source to original
  const resetItemOverride = (day, item) => {
    const dayItemId = getDayItemId(day, item.id);
    setItemOverrides(prev => {
      const updated = { ...prev };
      delete updated[dayItemId];
      return updated;
    });
  };

  // Get all unique sections for a day (including overrides and standards)
  const getAllSections = (day) => {
    const items = getItemsForDay(day);
    const usedSections = new Set(items.map(i => i.section).filter(Boolean));
    const allSections = new Set([...STANDARD_SECTIONS, ...usedSections]);
    return Array.from(allSections).sort();
  };

  // Get all unique sources for a day (including overrides and standards)
  const getAllSources = (day) => {
    const items = getItemsForDay(day);
    const usedSources = new Set(items.map(i => i.source).filter(Boolean));
    const allSources = new Set([...STANDARD_SOURCES, ...usedSources]);
    return Array.from(allSources).sort();
  };

  const toggleItem = (dayItemId) => {
    setCheckedItems(prev => ({
      ...prev,
      [dayItemId]: !prev[dayItemId]
    }));
  };

  const addManualItem = (day) => {
    if (!newItemText.trim()) return;

    const newItem = {
      id: `manual-${Date.now()}-${Math.random()}`,
      name: newItemText.trim(),
      quantity: null,
      unit: '',
      section: 'Manual Items',
      source: '',
      manual: true
    };

    setManualItems(prev => ({
      ...prev,
      [day]: [...(prev[day] || []), newItem]
    }));
    setNewItemText('');
    setAddingToDay(null);
  };

  const removeManualItem = (day, itemId) => {
    setManualItems(prev => ({
      ...prev,
      [day]: (prev[day] || []).filter(item => item.id !== itemId)
    }));
    // Also remove from checked
    const dayItemId = getDayItemId(day, itemId);
    setCheckedItems(prev => {
      const updated = { ...prev };
      delete updated[dayItemId];
      return updated;
    });
  };

  // Move item to another day
  const moveItemToDay = (fromDay, item, toDay) => {
    if (fromDay === toDay) return;

    // For manual items, move the item itself
    if (item.manual) {
      setManualItems(prev => ({
        ...prev,
        [fromDay]: (prev[fromDay] || []).filter(i => i.id !== item.id),
        [toDay]: [...(prev[toDay] || []), item]
      }));

      // Move checked state
      const fromDayItemId = getDayItemId(fromDay, item.id);
      const toDayItemId = getDayItemId(toDay, item.id);
      setCheckedItems(prev => {
        const updated = { ...prev };
        if (updated[fromDayItemId]) {
          updated[toDayItemId] = true;
          delete updated[fromDayItemId];
        }
        return updated;
      });
    } else {
      // For auto items, we add a manual copy to the target day
      // and mark the original as "moved" (checked off)
      const newManualItem = {
        id: `manual-moved-${Date.now()}-${Math.random()}`,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        section: item.section,
        source: item.source || 'Moved',
        manual: true
      };

      setManualItems(prev => ({
        ...prev,
        [toDay]: [...(prev[toDay] || []), newManualItem]
      }));

      // Check off the original item
      const fromDayItemId = getDayItemId(fromDay, item.id);
      setCheckedItems(prev => ({
        ...prev,
        [fromDayItemId]: true
      }));
    }

    setMovingItem(null);
  };

  // Drag and drop handlers
  const handleDragStart = (e, day, item) => {
    setDraggedItem({ day, item });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.name); // Required for Firefox
    // Add a slight delay to show the drag visual
    setTimeout(() => {
      e.target.style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
    setDragOverDay(null);
  };

  const handleDragOver = (e, day) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedItem && draggedItem.day !== day) {
      setDragOverDay(day);
    }
  };

  const handleDragLeave = (e) => {
    // Only clear if leaving the column entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverDay(null);
    }
  };

  const handleDrop = (e, toDay) => {
    e.preventDefault();
    if (draggedItem && draggedItem.day !== toDay) {
      moveItemToDay(draggedItem.day, draggedItem.item, toDay);
    }
    setDraggedItem(null);
    setDragOverDay(null);
  };

  const clearChecked = (day) => {
    const items = getItemsForDay(day);
    const checkedDayItemIds = items.filter(i => i.checked).map(i => i.dayItemId);
    const checkedItemIds = items.filter(i => i.checked).map(i => i.id);

    // Remove checked manual items
    setManualItems(prev => ({
      ...prev,
      [day]: (prev[day] || []).filter(item => !checkedItemIds.includes(item.id))
    }));

    // Clear checked state for all items in this day
    setCheckedItems(prev => {
      const updated = { ...prev };
      checkedDayItemIds.forEach(id => delete updated[id]);
      return updated;
    });
  };

  const clearAllChecks = async () => {
    if (await confirm('Clear all checked items?')) {
      setCheckedItems({});
    }
  };

  const getDayStats = (day) => {
    const items = getItemsForDay(day);
    const checked = items.filter(i => i.checked).length;
    return { total: items.length, checked };
  };

  // Group items by source then section
  const getGroupedItems = (day) => {
    const items = getItemsForDay(day);
    const grouped = {};

    items.forEach((item, index) => {
      const source = item.source || 'Other';
      const section = item.section || 'Other';

      if (!grouped[source]) grouped[source] = {};
      if (!grouped[source][section]) grouped[source][section] = [];
      grouped[source][section].push({ ...item, originalIndex: index });
    });

    return grouped;
  };

  // Get description for each shopping day
  const getDayDescription = (day) => {
    if (day === 'Sunday') return 'For Monday deliveries';
    if (day === 'Tuesday') return 'For Tuesday deliveries';
    if (day === 'Thursday') return 'For Thursday deliveries';
    return '';
  };

  // Calculate totals
  const totalItems = SHOP_DAYS.reduce((sum, day) => sum + getDayStats(day).total, 0);
  const totalChecked = SHOP_DAYS.reduce((sum, day) => sum + getDayStats(day).checked, 0);

  // Gated export handler - block if unapproved menus exist
  const handleExport = () => {
    if (unapprovedMenuCount > 0) {
      const topClients = Object.entries(unapprovedByClient).slice(0, 3).map(([name, count]) => `${name} (${count})`).join(', ');
      toast(`Cannot export yet: ${unapprovedMenuCount} unapproved menu(s). Clients: ${topClients}. Approve all menus first.`, 'warning');
      return;
    }
    exportPrepList();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: '#3d59ab' }}>Shopping Lists</h2>
            <p className="text-sm text-gray-600">
              Auto-generated from approved menus • {totalChecked}/{totalItems} items checked
            </p>
          </div>
          <div className="flex gap-2">
            {totalChecked > 0 && (
              <button
                onClick={clearAllChecks}
                className="px-4 py-2 rounded-lg border-2 flex items-center gap-2"
                style={{ borderColor: '#ebb582', color: '#423d3c' }}
              >
                <RefreshCw size={18} />
                Reset Checks
              </button>
            )}
            <div className="relative group">
              <button
                onClick={handleExport}
                disabled={unapprovedMenuCount > 0}
                className={`px-4 py-2 rounded-lg text-white flex items-center gap-2 ${
                  unapprovedMenuCount > 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{ backgroundColor: '#3d59ab' }}
                title={unapprovedMenuCount > 0 ? 'Approve all menus to enable export' : 'Export shopping lists'}
              >
                <Download size={18} />
                Export All
              </button>
              {unapprovedMenuCount > 0 && (
                <span className="absolute -bottom-5 right-0 text-xs text-amber-600 whitespace-nowrap">
                  Approve all menus to enable
                </span>
              )}
            </div>
          </div>
        </div>

        {totalItems === 0 && (
          <div className="text-center py-8 mb-4 rounded-lg" style={{ backgroundColor: '#f9f9ed' }}>
            <p className="text-gray-500">No shopping items yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Approve menus in Menu Planner to auto-generate shopping lists
            </p>
          </div>
        )}

        {/* Day columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SHOP_DAYS.map(day => {
            const stats = getDayStats(day);
            const grouped = getGroupedItems(day);
            const sources = Object.keys(grouped).sort();
            const otherDays = SHOP_DAYS.filter(d => d !== day);

            return (
              <div
                key={day}
                className={`border-2 rounded-lg overflow-hidden transition-all ${
                  dragOverDay === day ? 'ring-2 ring-blue-400 ring-offset-2' : ''
                }`}
                style={{
                  borderColor: dragOverDay === day ? '#3d59ab' : '#ebb582',
                  backgroundColor: dragOverDay === day ? '#e8f0fe' : undefined
                }}
                onDragOver={(e) => handleDragOver(e, day)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
              >
                {/* Day header */}
                <div
                  className="p-4 flex justify-between items-center"
                  style={{ backgroundColor: '#3d59ab' }}
                >
                  <div>
                    <h3 className="text-lg font-bold text-white">{day}</h3>
                    <p className="text-xs text-white/70">
                      {getDayDescription(day)}
                    </p>
                    <p className="text-sm text-white/80 mt-1">
                      {stats.checked}/{stats.total} done
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {stats.checked > 0 && (
                      <button
                        onClick={() => clearChecked(day)}
                        className="p-2 rounded bg-white/20 hover:bg-white/30 text-white"
                        title="Remove checked items"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Items list */}
                <div className="p-4 max-h-[500px] overflow-y-auto" style={{ backgroundColor: '#f9f9ed' }}>
                  {stats.total === 0 ? (
                    <p className="text-gray-500 text-center py-4">No items for this day</p>
                  ) : (
                    sources.map(source => (
                      <div key={source} className="mb-4">
                        <h4 className="font-bold text-sm mb-2" style={{ color: '#3d59ab' }}>
                          {source}
                        </h4>
                        {Object.entries(grouped[source]).map(([section, sectionItems]) => (
                          <div key={section} className="mb-2">
                            <p className="text-xs font-medium text-gray-500 mb-1">{section}</p>
                            {sectionItems.map((item) => (
                              <div
                                key={item.dayItemId}
                                draggable={!item.checked}
                                onDragStart={(e) => handleDragStart(e, day, item)}
                                onDragEnd={handleDragEnd}
                                className={`flex items-center gap-2 p-2 rounded mb-1 group ${
                                  item.checked ? 'opacity-50' : ''
                                } ${!item.checked ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                style={{ backgroundColor: 'white' }}
                              >
                                {/* Drag handle */}
                                {!item.checked && (
                                  <GripVertical
                                    size={14}
                                    className="text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100"
                                  />
                                )}

                                {/* Checkbox */}
                                <button
                                  onClick={() => toggleItem(item.dayItemId)}
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                    item.checked
                                      ? 'bg-green-500 border-green-500'
                                      : 'border-gray-300 bg-white hover:border-green-400'
                                  }`}
                                >
                                  {item.checked && <Check size={12} className="text-white" />}
                                </button>

                                {/* Item name */}
                                <span className={`flex-1 text-sm ${item.checked ? 'line-through text-gray-400' : ''}`}>
                                  {item.name}
                                  {item.hasOverride && (
                                    <span className="ml-1 text-xs text-purple-500" title="Reorganized">•</span>
                                  )}
                                </span>

                                {/* Quantity */}
                                {item.quantity != null && (
                                  <span className={`text-xs font-medium ${item.checked ? 'text-gray-400' : 'text-gray-600'}`}>
                                    {typeof item.quantity === 'number' ? item.quantity.toFixed(1) : item.quantity} {item.unit}
                                  </span>
                                )}

                                {/* Move controls - show on hover */}
                                {!item.checked && (
                                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                                    {/* Move to section dropdown */}
                                    <select
                                      className="text-xs p-1 rounded border border-gray-300 bg-white cursor-pointer"
                                      style={{ maxWidth: '80px' }}
                                      value={item.section || ''}
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          changeItemSection(day, item, e.target.value);
                                        }
                                      }}
                                      title="Change section"
                                    >
                                      <option value="" disabled>Section...</option>
                                      {getAllSections(day).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>

                                    {/* Move to source/store dropdown */}
                                    <select
                                      className="text-xs p-1 rounded border border-gray-300 bg-white cursor-pointer"
                                      style={{ maxWidth: '80px' }}
                                      value={item.source || ''}
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          changeItemSource(day, item, e.target.value);
                                        }
                                      }}
                                      title="Change store/vendor"
                                    >
                                      <option value="" disabled>Store...</option>
                                      {getAllSources(day).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>

                                    {/* Move to day dropdown */}
                                    <select
                                      className="text-xs p-1 rounded border border-gray-300 bg-white cursor-pointer"
                                      style={{ maxWidth: '70px' }}
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) {
                                          moveItemToDay(day, item, e.target.value);
                                        }
                                      }}
                                      title="Move to another day"
                                    >
                                      <option value="">Day...</option>
                                      {otherDays.map(d => (
                                        <option key={d} value={d}>{d}</option>
                                      ))}
                                    </select>

                                    {/* Reset override button */}
                                    {item.hasOverride && (
                                      <button
                                        onClick={() => resetItemOverride(day, item)}
                                        className="p-1 rounded hover:bg-gray-100"
                                        title="Reset to original section/store"
                                      >
                                        <RefreshCw size={12} className="text-gray-400" />
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Remove button (only for manual items) */}
                                {item.manual && (
                                  <button
                                    onClick={() => removeManualItem(day, item.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100"
                                    title="Remove item"
                                  >
                                    <X size={14} className="text-red-400" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                {/* Add item section */}
                <div className="p-3 border-t" style={{ borderColor: '#ebb582' }}>
                  {addingToDay === day ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addManualItem(day)}
                        placeholder="Item name..."
                        className="flex-1 px-3 py-2 border rounded text-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => addManualItem(day)}
                        className="px-3 py-2 rounded text-white text-sm"
                        style={{ backgroundColor: '#3d59ab' }}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setAddingToDay(null); setNewItemText(''); }}
                        className="px-3 py-2 rounded border text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingToDay(day)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded text-sm hover:bg-gray-100"
                      style={{ color: '#3d59ab' }}
                    >
                      <Plus size={16} />
                      Add Item
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

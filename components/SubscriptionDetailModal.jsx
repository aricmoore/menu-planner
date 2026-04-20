import React, { useState, useEffect } from 'react';
import { X, Calendar, DollarSign, Plus, Trash2, RefreshCw } from 'lucide-react';
import { useNotification } from './NotificationContext';

export default function SubscriptionDetailModal({
  client,
  clientPortalData = {},
  onSave,
  onClose
}) {
  const { toast } = useNotification();
  const [deliveryDates, setDeliveryDates] = useState(client?.deliveryDates || []);
  const [billDueDate, setBillDueDate] = useState(client?.billDueDate || '');
  const [newDate, setNewDate] = useState('');

  // Get dates from client portal if available
  const portalDates = clientPortalData[client?.name]?.selectedDates || [];
  const hasPortalDates = portalDates.length > 0;

  useEffect(() => {
    // Initialize with client's saved dates or portal dates
    if (client?.deliveryDates?.length > 0) {
      setDeliveryDates(client.deliveryDates);
    } else if (hasPortalDates) {
      setDeliveryDates(portalDates);
    }
    setBillDueDate(client?.billDueDate || '');
  }, [client]);

  const addDate = () => {
    if (!newDate) return;
    if (deliveryDates.includes(newDate)) {
      toast('This date is already added', 'warning');
      return;
    }
    if (deliveryDates.length >= 4) {
      toast('Maximum 4 delivery dates allowed', 'warning');
      return;
    }
    const sorted = [...deliveryDates, newDate].sort();
    setDeliveryDates(sorted);
    setNewDate('');
  };

  const removeDate = (date) => {
    setDeliveryDates(deliveryDates.filter(d => d !== date));
  };

  const syncFromPortal = () => {
    if (portalDates.length > 0) {
      setDeliveryDates([...portalDates].sort());
    }
  };

  const handleSave = () => {
    onSave({
      ...client,
      deliveryDates: deliveryDates.sort(),
      billDueDate
    });
    onClose();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  const displayName = client?.displayName || client?.name || 'Unknown';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between" style={{ backgroundColor: '#f9f9ed' }}>
          <h2 className="text-xl font-bold" style={{ color: '#3d59ab' }}>
            {displayName}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Delivery Dates Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold flex items-center gap-2" style={{ color: '#3d59ab' }}>
                <Calendar size={20} />
                Next Delivery Dates
              </h3>
              {hasPortalDates && (
                <button
                  onClick={syncFromPortal}
                  className="text-sm flex items-center gap-1 px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200"
                >
                  <RefreshCw size={14} />
                  Sync from Portal
                </button>
              )}
            </div>

            {hasPortalDates && (
              <p className="text-xs text-purple-600 mb-2">
                Client selected dates in portal: {portalDates.map(d => formatDate(d)).join(', ')}
              </p>
            )}

            {/* Current dates */}
            <div className="space-y-2 mb-3">
              {deliveryDates.length === 0 ? (
                <p className="text-gray-400 text-sm italic">No delivery dates set</p>
              ) : (
                deliveryDates.map((date, idx) => (
                  <div
                    key={date}
                    className="flex items-center justify-between p-2 rounded border"
                    style={{ borderColor: '#ebb582', backgroundColor: '#fff' }}
                  >
                    <span>
                      <span className="text-gray-400 text-sm mr-2">#{idx + 1}</span>
                      {formatDate(date)}
                    </span>
                    <button
                      onClick={() => removeDate(date)}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add date */}
            {deliveryDates.length < 4 && (
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="flex-1 p-2 border-2 rounded-lg"
                  style={{ borderColor: '#ebb582' }}
                />
                <button
                  onClick={addDate}
                  disabled={!newDate}
                  className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: '#3d59ab' }}
                >
                  <Plus size={20} />
                </button>
              </div>
            )}
          </div>

          {/* Bill Due Date Section */}
          <div>
            <h3 className="font-bold flex items-center gap-2 mb-3" style={{ color: '#3d59ab' }}>
              <DollarSign size={20} />
              Bill Due Date
            </h3>
            <input
              type="date"
              value={billDueDate}
              onChange={(e) => setBillDueDate(e.target.value)}
              className="w-full p-2 border-2 rounded-lg"
              style={{ borderColor: '#ebb582' }}
            />
            {billDueDate && (
              <p className="text-sm text-gray-500 mt-1">
                Due: {formatDate(billDueDate)}
                {new Date(billDueDate + 'T12:00:00') < new Date() && (
                  <span className="text-red-600 ml-2 font-medium">OVERDUE</span>
                )}
              </p>
            )}
          </div>

          {/* Subscription Info Summary */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-700 mb-2">Subscription Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Plan:</span>{' '}
                <span className="font-medium">${client?.planPrice || 0}</span>
              </div>
              <div>
                <span className="text-gray-500">Service Fee:</span>{' '}
                <span className="font-medium">${client?.serviceFee || 0}</span>
              </div>
              <div>
                <span className="text-gray-500">Frequency:</span>{' '}
                <span className="font-medium capitalize">{client?.frequency || 'weekly'}</span>
              </div>
              <div>
                <span className="text-gray-500">Meals/Week:</span>{' '}
                <span className="font-medium">{client?.mealsPerWeek || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border-2 hover:bg-gray-50"
            style={{ borderColor: '#ebb582' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: '#3d59ab' }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

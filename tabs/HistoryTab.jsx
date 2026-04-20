import React, { useState } from 'react';
import { Edit2, Trash2, Check, X } from 'lucide-react';
import { useNotification } from '../components/NotificationContext';

const inputStyle = "p-2 border-2 rounded-lg";
const borderStyle = { borderColor: '#ebb582' };

export default function HistoryTab({ historyByClient, orderHistory, setOrderHistory }) {
  const { confirm } = useNotification();
  const [editingId, setEditingId] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);

  const startEditing = (order) => {
    setEditingId(order.id);
    setEditingOrder({
      ...order,
      dishesText: order.dishes.join(', ')
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingOrder(null);
  };

  const saveEditing = () => {
    const updatedOrder = {
      ...editingOrder,
      dishes: editingOrder.dishesText.split(',').map(d => d.trim()).filter(Boolean)
    };
    delete updatedOrder.dishesText;

    setOrderHistory(orderHistory.map(o => o.id === editingId ? updatedOrder : o));
    setEditingId(null);
    setEditingOrder(null);
  };

  const deleteOrder = async (orderId) => {
    if (await confirm('Delete this order from history?')) {
      setOrderHistory(orderHistory.filter(o => o.id !== orderId));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>Order History</h2>
      {Object.keys(historyByClient).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(historyByClient).sort((a, b) => a[0].localeCompare(b[0])).map(([clientName, orders]) => (
            <div key={clientName} className="border-2 rounded-lg p-4" style={{ borderColor: '#ebb582' }}>
              <h3 className="text-xl font-bold mb-3" style={{ color: '#3d59ab' }}>{clientName}</h3>
              <div className="space-y-2">
                {orders.map(order => (
                  <div key={order.id}>
                    {editingId === order.id ? (
                      <div className="p-3 rounded border-2" style={{ borderColor: '#3d59ab', backgroundColor: '#f9f9ed' }}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium mb-1">Date</label>
                            <input
                              type="date"
                              value={editingOrder.date}
                              onChange={(e) => setEditingOrder({ ...editingOrder, date: e.target.value })}
                              className={inputStyle}
                              style={borderStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Portions</label>
                            <input
                              type="number"
                              value={editingOrder.portions}
                              onChange={(e) => setEditingOrder({ ...editingOrder, portions: parseInt(e.target.value) || 0 })}
                              className={inputStyle}
                              style={borderStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Cost ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={editingOrder.cost}
                              onChange={(e) => setEditingOrder({ ...editingOrder, cost: parseFloat(e.target.value) || 0 })}
                              className={inputStyle}
                              style={borderStyle}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Dishes (comma-separated)</label>
                            <input
                              type="text"
                              value={editingOrder.dishesText}
                              onChange={(e) => setEditingOrder({ ...editingOrder, dishesText: e.target.value })}
                              className={inputStyle}
                              style={borderStyle}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditing}
                            className="flex items-center gap-1 px-4 py-2 rounded-lg text-white"
                            style={{ backgroundColor: '#3d59ab' }}
                          >
                            <Check size={18} />Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-gray-200"
                          >
                            <X size={18} />Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex justify-between items-center p-3 rounded"
                        style={{ backgroundColor: '#f9f9ed' }}
                      >
                        <div>
                          <p className="font-medium">{order.date}</p>
                          <p className="text-sm text-gray-600">{order.dishes.join(' • ')}</p>
                          <p className="text-sm text-gray-500">{order.portions} portions</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="font-bold text-lg" style={{ color: '#22c55e' }}>
                            ${order.cost.toFixed(2)}
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => startEditing(order)} className="text-blue-600">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => deleteOrder(order.id)} className="text-red-600">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t flex justify-between">
                <span className="font-medium">Total ({orders.length} orders)</span>
                <span className="font-bold" style={{ color: '#3d59ab' }}>
                  ${orders.reduce((sum, o) => sum + o.cost, 0).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500">No order history yet. Complete orders in KDS to see them here.</p>
      )}
    </div>
  );
}

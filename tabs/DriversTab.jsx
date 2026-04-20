import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { useNotification } from '../components/NotificationContext';
import { ZONES, DEFAULT_NEW_DRIVER } from '../constants';
import { isSupabaseMode } from '../lib/dataMode';
import { saveDriverToSupabase, deleteDriverFromSupabase } from '../lib/database';

const FormField = ({ label, children }) => (
  <div className="flex flex-col">
    <label className="text-sm font-medium mb-1" style={{ color: '#423d3c' }}>{label}</label>
    {children}
  </div>
);

const inputStyle = "p-2 border-2 rounded-lg";
const borderStyle = { borderColor: '#ebb582' };

export default function DriversTab({
  drivers,
  setDrivers,
  newDriver,
  setNewDriver
}) {
  const { toast, confirm } = useNotification();
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingDriver, setEditingDriver] = useState(null);

  const addDriver = async () => {
    if (!newDriver.name) {
      toast('Please enter a driver name', 'warning');
      return;
    }

    if (isSupabaseMode()) {
      const result = await saveDriverToSupabase(newDriver);
      if (result.success) {
        setDrivers(result.drivers);
        setNewDriver(DEFAULT_NEW_DRIVER);
        toast('Driver added!', 'success');
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      setDrivers([...drivers, { ...newDriver, id: `temp-${Date.now()}` }]);
      setNewDriver(DEFAULT_NEW_DRIVER);
      toast('Driver added!', 'success');
    }
  };

  const deleteDriver = async (index) => {
    if (!(await confirm('Delete this driver?'))) return;

    const driver = drivers[index];

    if (isSupabaseMode() && driver.id && !driver.id.startsWith('temp-')) {
      const result = await deleteDriverFromSupabase(driver.id);
      if (result.success) {
        setDrivers(result.drivers);
      } else {
        toast(`Delete failed: ${result.error}`, 'error');
      }
    } else {
      setDrivers(drivers.filter((_, i) => i !== index));
    }
  };

  const startEditing = (index) => {
    setEditingIndex(index);
    setEditingDriver({ ...drivers[index] });
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingDriver(null);
  };

  const saveEditing = async () => {
    if (isSupabaseMode()) {
      const result = await saveDriverToSupabase(editingDriver);
      if (result.success) {
        setDrivers(result.drivers);
        setEditingIndex(null);
        setEditingDriver(null);
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      const updated = [...drivers];
      updated[editingIndex] = editingDriver;
      setDrivers(updated);
      setEditingIndex(null);
      setEditingDriver(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>Add Driver</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FormField label="Driver Name">
            <input
              type="text"
              value={newDriver.name}
              onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
              placeholder="Enter driver name"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
          <FormField label="Phone">
            <input
              type="tel"
              value={newDriver.phone}
              onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
              placeholder="Phone number"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
          <FormField label="Zone">
            <select
              value={newDriver.zone}
              onChange={(e) => setNewDriver({ ...newDriver, zone: e.target.value })}
              className={inputStyle}
              style={borderStyle}
            >
              <option value="">Unassigned</option>
              {ZONES.map(z => <option key={z} value={z}>Zone {z}</option>)}
            </select>
          </FormField>
          <FormField label="Access Code">
            <input
              type="text"
              value={newDriver.accessCode}
              onChange={(e) => setNewDriver({ ...newDriver, accessCode: e.target.value })}
              placeholder="Access code"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
        </div>
        <button
          onClick={addDriver}
          className="mt-4 px-6 py-2 rounded-lg text-white"
          style={{ backgroundColor: '#3d59ab' }}
        >
          <Plus size={20} className="inline mr-2" />Add Driver
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>Drivers ({drivers.length})</h2>
        {drivers.length > 0 ? (
          <div className="space-y-3">
            {drivers.map((driver, i) => (
              <div key={driver.id || i}>
                {editingIndex === i ? (
                  <div className="border-2 rounded-lg p-4" style={{ borderColor: '#3d59ab', backgroundColor: '#f9f9ed' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <FormField label="Driver Name">
                        <input
                          type="text"
                          value={editingDriver.name}
                          onChange={(e) => setEditingDriver({ ...editingDriver, name: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                      <FormField label="Phone">
                        <input
                          type="tel"
                          value={editingDriver.phone || ''}
                          onChange={(e) => setEditingDriver({ ...editingDriver, phone: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                      <FormField label="Zone">
                        <select
                          value={editingDriver.zone || ''}
                          onChange={(e) => setEditingDriver({ ...editingDriver, zone: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        >
                          <option value="">Unassigned</option>
                          {ZONES.map(z => <option key={z} value={z}>Zone {z}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Access Code">
                        <input
                          type="text"
                          value={editingDriver.accessCode || ''}
                          onChange={(e) => setEditingDriver({ ...editingDriver, accessCode: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                    </div>
                    <div className="flex gap-2 mt-4">
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
                  <div className="border-2 rounded-lg p-4 flex justify-between" style={{ borderColor: '#ebb582' }}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-lg">{driver.name}</h3>
                        {driver.zone && (
                          <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                            Zone {driver.zone}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {driver.phone && `Phone: ${driver.phone}`}
                        {driver.phone && driver.accessCode && ' • '}
                        {driver.accessCode && `Code: ${driver.accessCode}`}
                      </p>
                    </div>
                    <div className="flex gap-2 self-start ml-4">
                      <button onClick={() => startEditing(i)} className="text-blue-600">
                        <Edit2 size={18} />
                      </button>
                      <button onClick={() => deleteDriver(i)} className="text-red-600">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No drivers yet. Add your first driver above.</p>
        )}
      </div>
    </div>
  );
}

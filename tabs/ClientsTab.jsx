import React, { useState } from 'react';
import { Plus, Trash2, Upload, Download, Edit2, Check, X, Link2, Minus, Users, User, ChevronDown, ChevronUp, Truck, AlertTriangle } from 'lucide-react';
import { useNotification } from '../components/NotificationContext';
import { ZONES, DAYS, DEFAULT_CONTACT, DEFAULT_NEW_SUBSCRIPTION } from '../constants';
import { isSupabaseMode } from '../lib/dataMode';
import { saveClientToSupabase } from '../lib/database';

const FormField = ({ label, children }) => (
  <div className="flex flex-col">
    <label className="text-sm font-medium mb-1" style={{ color: '#423d3c' }}>{label}</label>
    {children}
  </div>
);

const inputStyle = "p-2 border-2 rounded-lg";
const borderStyle = { borderColor: '#ebb582' };

// Contact form component for reuse
const ContactForm = ({ contact, index, onChange, onRemove, canRemove }) => (
  <div className="p-4 rounded-lg border-2 relative" style={{ borderColor: '#d9a87a', backgroundColor: '#fff' }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-bold" style={{ color: '#3d59ab' }}>
        Contact {index + 1}
      </span>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-red-500 hover:text-red-700 p-1"
          title="Remove contact"
        >
          <Minus size={18} />
        </button>
      )}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <FormField label="Full Name">
        <input
          type="text"
          value={contact.fullName || ''}
          onChange={(e) => onChange(index, 'fullName', e.target.value)}
          placeholder="Full name"
          className={inputStyle}
          style={borderStyle}
        />
      </FormField>
      <FormField label="Display Name (for greetings)">
        <input
          type="text"
          value={contact.displayName || ''}
          onChange={(e) => onChange(index, 'displayName', e.target.value)}
          placeholder="e.g., Jennifer"
          className={inputStyle}
          style={borderStyle}
        />
      </FormField>
      <FormField label="Email">
        <input
          type="email"
          value={contact.email || ''}
          onChange={(e) => onChange(index, 'email', e.target.value)}
          placeholder="Email address"
          className={inputStyle}
          style={borderStyle}
        />
      </FormField>
      <FormField label="Phone">
        <input
          type="tel"
          value={contact.phone || ''}
          onChange={(e) => onChange(index, 'phone', e.target.value)}
          placeholder="Phone number"
          className={inputStyle}
          style={borderStyle}
        />
      </FormField>
      <div className="md:col-span-2">
        <FormField label="Delivery Address">
          <input
            type="text"
            value={contact.address || ''}
            onChange={(e) => onChange(index, 'address', e.target.value)}
            placeholder="Street address"
            className={inputStyle}
            style={borderStyle}
          />
        </FormField>
      </div>
    </div>
  </div>
);

// Helper to migrate old client format to new subscription format
const migrateToSubscription = (client) => {
  if (client.subscriptionId) {
    // Already in new format - ensure name is preserved
    return {
      ...client,
      name: client.name || client.displayName || ''
    };
  }

  // Migrate from old format
  const contacts = client.contacts && client.contacts.length > 0
    ? client.contacts.map(c => ({
        fullName: c.fullName || c.name || '',
        displayName: c.displayName || '',
        email: c.email || '',
        phone: c.phone || '',
        address: c.address || ''
      }))
    : [{
        fullName: client.name || '',
        displayName: '',
        email: client.email || '',
        phone: client.phone || '',
        address: client.address || ''
      }];

  // Preserve both name and displayName for Supabase compatibility
  const clientName = client.name || client.displayName || '';

  return {
    subscriptionId: client.id || Date.now().toString(),
    name: clientName,  // Preserve for Supabase 'name' column
    displayName: client.displayName || client.name || '',
    portions: client.portions || client.persons || 1,
    mealsPerWeek: client.mealsPerWeek || 0,
    frequency: client.frequency || 'weekly',
    status: client.status || 'active',
    zone: client.zone || '',
    deliveryDay: client.deliveryDay || '',
    pickup: client.pickup || false,
    planPrice: client.planPrice || 0,
    serviceFee: client.serviceFee || 0,
    prepayDiscount: client.prepayDiscount || false,
    newClientFeePaid: client.newClientFeePaid || false,
    paysOwnGroceries: client.paysOwnGroceries || false,
    billingNotes: client.billingNotes || '',
    accessCode: client.accessCode || '',
    honeyBookLink: client.honeyBookLink || '',
    dietaryRestrictions: client.dietaryRestrictions || '',
    contacts
  };
};

export default function ClientsTab({
  clients,
  newClient,
  setNewClient,
  addClient,
  deleteClient,
  clientsFileRef,
  exportClientsCSV,
  setClients,
  deliveryLog = [],
  orderHistory = []
}) {
  const { toast } = useNotification();
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [expandedDeliveries, setExpandedDeliveries] = useState({});

  // Toggle delivery history visibility for a client
  const toggleDeliveryHistory = (subscriptionId) => {
    setExpandedDeliveries(prev => ({
      ...prev,
      [subscriptionId]: !prev[subscriptionId]
    }));
  };

  // Get recent deliveries for a client (from both deliveryLog and orderHistory)
  const getRecentDeliveries = (clientName) => {
    // Combine deliveries from deliveryLog and orderHistory
    const fromLog = deliveryLog
      .filter(entry => entry.clientName === clientName)
      .map(entry => ({
        date: entry.date,
        dishes: [],
        status: entry.problem ? 'problem' : 'delivered',
        problem: entry.problem,
        bagsReturned: entry.bagsReturned,
        source: 'log'
      }));

    const fromHistory = orderHistory
      .filter(order => order.clientName === clientName)
      .map(order => ({
        date: order.date,
        dishes: order.dishes || [],
        status: 'completed',
        source: 'history'
      }));

    // Combine and dedupe by date, preferring history entries (they have dishes)
    const combined = {};
    [...fromLog, ...fromHistory].forEach(entry => {
      if (!combined[entry.date] || entry.dishes.length > 0) {
        combined[entry.date] = entry;
      }
    });

    // Sort by date descending and take last 4
    return Object.values(combined)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 4);
  };

  // Ensure subscription has contacts array
  const ensureContacts = (subscription) => {
    if (subscription.contacts && subscription.contacts.length > 0) {
      return subscription.contacts;
    }
    return [{ ...DEFAULT_CONTACT }];
  };

  const startEditing = (index) => {
    const subscription = migrateToSubscription(clients[index]);
    setEditingIndex(index);
    setEditingClient({
      ...subscription,
      contacts: ensureContacts(subscription)
    });
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingClient(null);
  };

  const saveEditing = async () => {
    // Validate that we have a name (from name or displayName)
    const clientName = editingClient?.name || editingClient?.displayName;
    if (!clientName || clientName.trim() === '') {
      toast('Client name is required', 'warning');
      return;
    }

    // Ensure name is set for Supabase (it uses 'name' column)
    const clientToSave = {
      ...editingClient,
      name: clientName.trim()
    };

    if (isSupabaseMode()) {
      const result = await saveClientToSupabase(clientToSave);
      if (result.success) {
        setClients(result.clients);
        setEditingIndex(null);
        setEditingClient(null);
        const hasDates = editingClient.deliveryDates && editingClient.deliveryDates.length > 0;
        if (!hasDates && editingClient.status === 'active' && !editingClient.pickup) {
          toast(`${clientName} saved. No delivery dates set — client won't appear on the Menu tab until at least one delivery date is added.`, 'warning');
        }
      } else {
        toast(`Save failed: ${result.error}`, 'error');
      }
    } else {
      const updated = [...clients];
      updated[editingIndex] = clientToSave;
      setClients(updated);
      setEditingIndex(null);
      setEditingClient(null);
    }
  };

  // Contact management for new subscription
  const updateNewContact = (index, field, value) => {
    const contacts = [...(newClient.contacts || [{ ...DEFAULT_CONTACT }])];
    contacts[index] = { ...contacts[index], [field]: value };
    setNewClient({ ...newClient, contacts });
  };

  const addNewContact = () => {
    const contacts = [...(newClient.contacts || []), { ...DEFAULT_CONTACT }];
    setNewClient({ ...newClient, contacts });
  };

  const removeNewContact = (index) => {
    const contacts = (newClient.contacts || []).filter((_, i) => i !== index);
    setNewClient({ ...newClient, contacts });
  };

  // Contact management for editing subscription
  const updateEditingContact = (index, field, value) => {
    const contacts = [...editingClient.contacts];
    contacts[index] = { ...contacts[index], [field]: value };
    setEditingClient({ ...editingClient, contacts });
  };

  const addEditingContact = () => {
    const contacts = [...editingClient.contacts, { ...DEFAULT_CONTACT }];
    setEditingClient({ ...editingClient, contacts });
  };

  const removeEditingContact = (index) => {
    const contacts = editingClient.contacts.filter((_, i) => i !== index);
    setEditingClient({ ...editingClient, contacts });
  };

  const getClientPortalUrl = (subscription) => {
    const slug = (subscription.subscriptionId || subscription.displayName || subscription.name || '')
      .toString().toLowerCase().replace(/\s+/g, '-');
    return `${window.location.origin}/client/${slug}`;
  };

  const copyPortalLink = (subscription) => {
    const url = getClientPortalUrl(subscription);
    navigator.clipboard.writeText(url).then(() => {
      toast('Portal link copied!', 'success');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  };

  // Get summary info for a subscription's contacts
  const getContactsSummary = (subscription) => {
    const contacts = ensureContacts(migrateToSubscription(subscription));
    const addresses = [...new Set(contacts.filter(c => c.address).map(c => c.address.toLowerCase().trim()))];
    return {
      count: contacts.length,
      uniqueAddresses: addresses.length,
      contacts,
      primaryContact: contacts[0]
    };
  };

  // Custom CSV export with new structure
  const handleExportCSV = () => {
    const headers = [
      'subscriptionId', 'subscriptionDisplayName', 'portions', 'mealsPerWeek', 'frequency',
      'status', 'zone', 'deliveryDay', 'pickup', 'planPrice', 'serviceFee',
      'prepayDiscount', 'newClientFeePaid', 'paysOwnGroceries', 'billingNotes', 'dietaryRestrictions', 'accessCode',
      'contactFullName', 'contactDisplayName', 'email', 'phone', 'address'
    ];

    const rows = [];
    clients.forEach(client => {
      const sub = migrateToSubscription(client);
      const contacts = ensureContacts(sub);

      contacts.forEach((contact, idx) => {
        rows.push([
          idx === 0 ? sub.subscriptionId : '',
          idx === 0 ? sub.displayName : '',
          idx === 0 ? sub.portions : '',
          idx === 0 ? sub.mealsPerWeek : '',
          idx === 0 ? sub.frequency : '',
          idx === 0 ? sub.status : '',
          idx === 0 ? sub.zone : '',
          idx === 0 ? sub.deliveryDay : '',
          idx === 0 ? sub.pickup : '',
          idx === 0 ? sub.planPrice : '',
          idx === 0 ? sub.serviceFee : '',
          idx === 0 ? sub.prepayDiscount : '',
          idx === 0 ? sub.newClientFeePaid : '',
          idx === 0 ? sub.paysOwnGroceries : '',
          idx === 0 ? sub.billingNotes : '',
          idx === 0 ? sub.dietaryRestrictions : '',
          idx === 0 ? sub.accessCode : '',
          contact.fullName || '',
          contact.displayName || '',
          contact.email || '',
          contact.phone || '',
          contact.address || ''
        ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','));
      });
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subscriptions.csv';
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold" style={{ color: '#3d59ab' }}>Add Subscription</h2>
          <div className="flex gap-2">
            <button
              onClick={() => clientsFileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2"
              style={{ borderColor: '#3d59ab', color: '#3d59ab' }}
            >
              <Upload size={18} />Import
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: '#3d59ab' }}
            >
              <Download size={18} />Export
            </button>
          </div>
        </div>

        {/* Subscription Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormField label="Subscription Name">
            <input
              type="text"
              value={newClient.displayName || ''}
              onChange={(e) => setNewClient({ ...newClient, displayName: e.target.value })}
              placeholder="e.g., J.J. and Lauren"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
          <FormField label="Portions">
            <input
              type="number"
              value={newClient.portions || 1}
              onChange={(e) => setNewClient({ ...newClient, portions: parseInt(e.target.value) || 1 })}
              placeholder="Number of portions"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
          <FormField label="Meals per Week">
            <input
              type="number"
              value={newClient.mealsPerWeek || 0}
              onChange={(e) => setNewClient({ ...newClient, mealsPerWeek: parseInt(e.target.value) || 0 })}
              placeholder="Number of meals"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
          <FormField label="Zone">
            <select
              value={newClient.zone || ''}
              onChange={(e) => setNewClient({ ...newClient, zone: e.target.value })}
              className={inputStyle}
              style={borderStyle}
            >
              <option value="">Unassigned</option>
              {ZONES.map(z => <option key={z} value={z}>Zone {z}</option>)}
            </select>
          </FormField>
          <FormField label="Delivery Day">
            <select
              value={newClient.deliveryDay || ''}
              onChange={(e) => setNewClient({ ...newClient, deliveryDay: e.target.value })}
              className={inputStyle}
              style={borderStyle}
            >
              <option value="">Select day</option>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </FormField>
          <FormField label="Frequency">
            <select
              value={newClient.frequency || 'weekly'}
              onChange={(e) => setNewClient({ ...newClient, frequency: e.target.value })}
              className={inputStyle}
              style={borderStyle}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
            </select>
          </FormField>
          <FormField label="Status">
            <select
              value={newClient.status || 'active'}
              onChange={(e) => setNewClient({ ...newClient, status: e.target.value })}
              className={inputStyle}
              style={borderStyle}
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </FormField>
          <FormField label="Client Portal Access Code">
            <input
              type="text"
              value={newClient.accessCode || ''}
              onChange={(e) => setNewClient({ ...newClient, accessCode: e.target.value })}
              placeholder="Optional access code"
              className={inputStyle}
              style={borderStyle}
            />
          </FormField>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="pickup"
              checked={newClient.pickup || false}
              onChange={(e) => setNewClient({ ...newClient, pickup: e.target.checked, serviceFee: e.target.checked ? 0 : newClient.serviceFee })}
              className="w-5 h-5 rounded border-2"
              style={{ accentColor: '#3d59ab' }}
            />
            <label htmlFor="pickup" className="text-sm font-medium" style={{ color: '#423d3c' }}>
              Pickup (exclude from delivery routes)
            </label>
          </div>
          <FormField label="Menu Selection">
            <select
              value={newClient.chefChoice === false ? 'client' : 'chef'}
              onChange={(e) => setNewClient({ ...newClient, chefChoice: e.target.value === 'chef' })}
              className={inputStyle}
              style={borderStyle}
            >
              <option value="chef">Chef Choice (Chef Paula picks)</option>
              <option value="client">Client Picks (Client selects dishes)</option>
            </select>
          </FormField>
          <FormField label="HoneyBook Invoice Link">
            <input
              type="url"
              value={newClient.honeyBookLink || ''}
              onChange={(e) => setNewClient({ ...newClient, honeyBookLink: e.target.value })}
              className={inputStyle}
              style={borderStyle}
              placeholder="https://..."
            />
          </FormField>
        </div>

        {/* Contacts Section */}
        <div className="mt-6 pt-6 border-t-2" style={{ borderColor: '#ebb582' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: '#3d59ab' }}>
              <Users size={20} />
              Contacts
            </h3>
            <button
              type="button"
              onClick={addNewContact}
              className="flex items-center gap-1 px-3 py-1 rounded-lg text-white text-sm"
              style={{ backgroundColor: '#3d59ab' }}
            >
              <Plus size={16} />Add Contact
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Each contact receives notifications. Different addresses = separate delivery stops.
          </p>
          <div className="space-y-4">
            {(newClient.contacts || [{ ...DEFAULT_CONTACT }]).map((contact, idx) => (
              <ContactForm
                key={idx}
                contact={contact}
                index={idx}
                onChange={updateNewContact}
                onRemove={() => removeNewContact(idx)}
                canRemove={(newClient.contacts || []).length > 1}
              />
            ))}
          </div>
        </div>

        {/* Pricing Section */}
        <div className="mt-6 pt-6 border-t-2" style={{ borderColor: '#ebb582' }}>
          <h3 className="text-lg font-bold mb-4" style={{ color: '#3d59ab' }}>Pricing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <FormField label="Plan Price ($)">
              <input
                type="number"
                step="0.01"
                value={newClient.planPrice || 0}
                onChange={(e) => setNewClient({ ...newClient, planPrice: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className={inputStyle}
                style={borderStyle}
              />
            </FormField>
            <FormField label="Service Fee ($)">
              <input
                type="number"
                step="0.01"
                value={newClient.pickup ? 0 : (newClient.serviceFee || 0)}
                onChange={(e) => setNewClient({ ...newClient, serviceFee: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
                className={inputStyle}
                style={borderStyle}
                disabled={newClient.pickup}
              />
            </FormField>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="prepayDiscount"
                checked={newClient.prepayDiscount || false}
                onChange={(e) => setNewClient({ ...newClient, prepayDiscount: e.target.checked })}
                className="w-5 h-5 rounded border-2"
                style={{ accentColor: '#3d59ab' }}
              />
              <label htmlFor="prepayDiscount" className="text-sm font-medium" style={{ color: '#423d3c' }}>
                Pre-pay Discount (10% off)
              </label>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="newClientFeePaid"
                checked={newClient.newClientFeePaid || false}
                onChange={(e) => setNewClient({ ...newClient, newClientFeePaid: e.target.checked })}
                className="w-5 h-5 rounded border-2"
                style={{ accentColor: '#3d59ab' }}
              />
              <label htmlFor="newClientFeePaid" className="text-sm font-medium" style={{ color: '#423d3c' }}>
                New Client Fee Paid
              </label>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="paysOwnGroceries"
                checked={newClient.paysOwnGroceries || false}
                onChange={(e) => setNewClient({ ...newClient, paysOwnGroceries: e.target.checked })}
                className="w-5 h-5 rounded border-2"
                style={{ accentColor: '#3d59ab' }}
              />
              <label htmlFor="paysOwnGroceries" className="text-sm font-medium" style={{ color: '#423d3c' }}>
                Pays Own Groceries
              </label>
            </div>
          </div>
          <div className="mt-4">
            <FormField label="Billing Notes">
              <textarea
                value={newClient.billingNotes || ''}
                onChange={(e) => setNewClient({ ...newClient, billingNotes: e.target.value })}
                placeholder="Any billing notes"
                className={inputStyle + " w-full"}
                style={borderStyle}
                rows="2"
              />
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="Dietary Restrictions">
              <textarea
                value={newClient.dietaryRestrictions || ''}
                onChange={(e) => setNewClient({ ...newClient, dietaryRestrictions: e.target.value })}
                placeholder="Allergies, preferences, dietary needs..."
                className={inputStyle + " w-full"}
                style={borderStyle}
                rows="2"
              />
            </FormField>
          </div>
        </div>

        <button
          onClick={addClient}
          className="mt-6 px-6 py-2 rounded-lg text-white"
          style={{ backgroundColor: '#3d59ab' }}
        >
          <Plus size={20} className="inline mr-2" />Add Subscription
        </button>
      </div>

      {/* Subscriptions List */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#3d59ab' }}>Subscriptions ({clients.length})</h2>
        <div className="space-y-3">
          {clients.map((client, i) => {
            const subscription = migrateToSubscription(client);
            return (
              <div key={subscription.subscriptionId || i}>
                {editingIndex === i ? (
                  <div className="border-2 rounded-lg p-4" style={{ borderColor: '#3d59ab', backgroundColor: '#f9f9ed' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <FormField label="Subscription Name">
                        <input
                          type="text"
                          value={editingClient.displayName || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, displayName: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                      <FormField label="Portions">
                        <input
                          type="number"
                          value={editingClient.portions || 1}
                          onChange={(e) => setEditingClient({ ...editingClient, portions: parseInt(e.target.value) || 1 })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                      <FormField label="Meals per Week">
                        <input
                          type="number"
                          value={editingClient.mealsPerWeek || 0}
                          onChange={(e) => setEditingClient({ ...editingClient, mealsPerWeek: parseInt(e.target.value) || 0 })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                      <FormField label="Zone">
                        <select
                          value={editingClient.zone || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, zone: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        >
                          <option value="">Unassigned</option>
                          {ZONES.map(z => <option key={z} value={z}>Zone {z}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Delivery Day">
                        <select
                          value={editingClient.deliveryDay || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, deliveryDay: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        >
                          <option value="">Select day</option>
                          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Frequency">
                        <select
                          value={editingClient.frequency || 'weekly'}
                          onChange={(e) => setEditingClient({ ...editingClient, frequency: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        >
                          <option value="weekly">Weekly</option>
                          <option value="biweekly">Biweekly</option>
                        </select>
                      </FormField>
                      <FormField label="Status">
                        <select
                          value={editingClient.status || 'active'}
                          onChange={(e) => setEditingClient({ ...editingClient, status: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        >
                          <option value="active">Active</option>
                          <option value="paused">Paused</option>
                        </select>
                      </FormField>
                      <FormField label="Access Code">
                        <input
                          type="text"
                          value={editingClient.accessCode || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, accessCode: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                        />
                      </FormField>
                      <div className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          id={`pickup-edit-${i}`}
                          checked={editingClient.pickup || false}
                          onChange={(e) => setEditingClient({ ...editingClient, pickup: e.target.checked, serviceFee: e.target.checked ? 0 : editingClient.serviceFee })}
                          className="w-5 h-5 rounded border-2"
                          style={{ accentColor: '#3d59ab' }}
                        />
                        <label htmlFor={`pickup-edit-${i}`} className="text-sm font-medium" style={{ color: '#423d3c' }}>
                          Pickup
                        </label>
                      </div>
                      <FormField label="Menu Selection">
                        <select
                          value={editingClient.chefChoice === false ? 'client' : 'chef'}
                          onChange={(e) => setEditingClient({ ...editingClient, chefChoice: e.target.value === 'chef' })}
                          className={inputStyle}
                          style={borderStyle}
                        >
                          <option value="chef">Chef Choice (Chef Paula picks)</option>
                          <option value="client">Client Picks (Client selects dishes)</option>
                        </select>
                      </FormField>
                      <FormField label="HoneyBook Invoice Link">
                        <input
                          type="url"
                          value={editingClient.honeyBookLink || ''}
                          onChange={(e) => setEditingClient({ ...editingClient, honeyBookLink: e.target.value })}
                          className={inputStyle}
                          style={borderStyle}
                          placeholder="https://..."
                        />
                      </FormField>
                    </div>

                    {/* Contacts Section for Edit */}
                    <div className="mt-4 pt-4 border-t-2" style={{ borderColor: '#ebb582' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-md font-bold flex items-center gap-2" style={{ color: '#3d59ab' }}>
                          <Users size={18} />
                          Contacts ({editingClient.contacts?.length || 1})
                        </h4>
                        <button
                          type="button"
                          onClick={addEditingContact}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg text-white text-sm"
                          style={{ backgroundColor: '#3d59ab' }}
                        >
                          <Plus size={16} />Add Contact
                        </button>
                      </div>
                      <div className="space-y-4">
                        {(editingClient.contacts || []).map((contact, idx) => (
                          <ContactForm
                            key={idx}
                            contact={contact}
                            index={idx}
                            onChange={updateEditingContact}
                            onRemove={() => removeEditingContact(idx)}
                            canRemove={editingClient.contacts.length > 1}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Pricing Section for Edit */}
                    <div className="mt-4 pt-4 border-t-2" style={{ borderColor: '#ebb582' }}>
                      <h4 className="text-md font-bold mb-3" style={{ color: '#3d59ab' }}>Pricing</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <FormField label="Plan Price ($)">
                          <input
                            type="number"
                            step="0.01"
                            value={editingClient.planPrice || 0}
                            onChange={(e) => setEditingClient({ ...editingClient, planPrice: parseFloat(e.target.value) || 0 })}
                            className={inputStyle}
                            style={borderStyle}
                          />
                        </FormField>
                        <FormField label="Service Fee ($)">
                          <input
                            type="number"
                            step="0.01"
                            value={editingClient.pickup ? 0 : (editingClient.serviceFee || 0)}
                            onChange={(e) => setEditingClient({ ...editingClient, serviceFee: parseFloat(e.target.value) || 0 })}
                            className={inputStyle}
                            style={borderStyle}
                            disabled={editingClient.pickup}
                          />
                        </FormField>
                        <div className="flex items-center gap-2 pt-6">
                          <input
                            type="checkbox"
                            id={`prepayDiscount-edit-${i}`}
                            checked={editingClient.prepayDiscount || false}
                            onChange={(e) => setEditingClient({ ...editingClient, prepayDiscount: e.target.checked })}
                            className="w-5 h-5 rounded border-2"
                            style={{ accentColor: '#3d59ab' }}
                          />
                          <label htmlFor={`prepayDiscount-edit-${i}`} className="text-sm font-medium" style={{ color: '#423d3c' }}>
                            Pre-pay (10% off)
                          </label>
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                          <input
                            type="checkbox"
                            id={`newClientFeePaid-edit-${i}`}
                            checked={editingClient.newClientFeePaid || false}
                            onChange={(e) => setEditingClient({ ...editingClient, newClientFeePaid: e.target.checked })}
                            className="w-5 h-5 rounded border-2"
                            style={{ accentColor: '#3d59ab' }}
                          />
                          <label htmlFor={`newClientFeePaid-edit-${i}`} className="text-sm font-medium" style={{ color: '#423d3c' }}>
                            New Client Fee Paid
                          </label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`paysOwnGroceries-edit-${i}`}
                            checked={editingClient.paysOwnGroceries || false}
                            onChange={(e) => setEditingClient({ ...editingClient, paysOwnGroceries: e.target.checked })}
                            className="w-5 h-5 rounded border-2"
                            style={{ accentColor: '#3d59ab' }}
                          />
                          <label htmlFor={`paysOwnGroceries-edit-${i}`} className="text-sm font-medium" style={{ color: '#423d3c' }}>
                            Pays Own Groceries
                          </label>
                        </div>
                      </div>
                      <div className="mt-4">
                        <FormField label="Billing Notes">
                          <textarea
                            value={editingClient.billingNotes || ''}
                            onChange={(e) => setEditingClient({ ...editingClient, billingNotes: e.target.value })}
                            className={inputStyle + " w-full"}
                            style={borderStyle}
                            rows="2"
                          />
                        </FormField>
                      </div>
                      <div className="mt-4">
                        <FormField label="Dietary Restrictions">
                          <textarea
                            value={editingClient.dietaryRestrictions || ''}
                            onChange={(e) => setEditingClient({ ...editingClient, dietaryRestrictions: e.target.value })}
                            placeholder="Allergies, preferences, dietary needs..."
                            className={inputStyle + " w-full"}
                            style={borderStyle}
                            rows="2"
                          />
                        </FormField>
                      </div>
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
                  <div
                    className={`border-2 rounded-lg p-4 ${subscription.status === 'paused' ? 'opacity-60' : ''}`}
                    style={{ borderColor: subscription.status === 'paused' ? '#9ca3af' : '#ebb582' }}
                  >
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-lg">{subscription.displayName || 'Unnamed'}</h3>
                          {subscription.status === 'paused' && (
                            <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600">Paused</span>
                          )}
                          {subscription.status === 'active' && (
                            <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Active</span>
                          )}
                          {subscription.pickup && (
                            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">Pickup</span>
                          )}
                          {(!subscription.deliveryDates || subscription.deliveryDates.length === 0) && subscription.status === 'active' && !subscription.pickup && (
                            <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                              <AlertTriangle size={11} />
                              No delivery dates
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {subscription.portions} portions • {subscription.mealsPerWeek} meals/week • {subscription.frequency === 'biweekly' ? 'Biweekly' : 'Weekly'}
                        </p>
                        <p className="text-sm text-gray-600">
                          {subscription.zone ? `Zone ${subscription.zone}` : 'No zone'}
                          {subscription.deliveryDay && ` • ${subscription.deliveryDay}`}
                        </p>

                        {/* Contacts Display */}
                        {(() => {
                          const { count, uniqueAddresses, contacts } = getContactsSummary(subscription);
                          return (
                            <div className="mt-2">
                              <div className="text-sm">
                                <span className="text-purple-600 font-medium">
                                  <Users size={14} className="inline mr-1" />
                                  {count} contact{count !== 1 ? 's' : ''} • {uniqueAddresses} delivery stop{uniqueAddresses !== 1 ? 's' : ''}
                                </span>
                                <div className="mt-1 space-y-1">
                                  {contacts.map((contact, idx) => (
                                    <div key={idx} className="text-gray-500 pl-4 border-l-2" style={{ borderColor: '#d9a87a' }}>
                                      <span className="font-medium">{contact.fullName || contact.displayName || `Contact ${idx + 1}`}</span>
                                      {contact.displayName && contact.displayName !== contact.fullName && (
                                        <span className="text-xs text-gray-400 ml-1">"{contact.displayName}"</span>
                                      )}
                                      {contact.address && <span className="block text-xs">{contact.address}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {subscription.billingNotes && (
                          <p className="text-sm text-amber-700 mt-2 bg-amber-50 px-2 py-1 rounded">
                            Billing: {subscription.billingNotes}
                          </p>
                        )}

                        {subscription.dietaryRestrictions && (
                          <p className="text-sm text-red-700 mt-2 bg-red-50 px-2 py-1 rounded">
                            Diet: {subscription.dietaryRestrictions}
                          </p>
                        )}

                        {/* Recent Deliveries Section */}
                        {(() => {
                          const subId = subscription.subscriptionId || subscription.displayName || i;
                          const clientName = subscription.displayName || subscription.name;
                          const recentDeliveries = getRecentDeliveries(clientName);
                          const isExpanded = expandedDeliveries[subId];

                          if (recentDeliveries.length === 0) return null;

                          return (
                            <div className="mt-3">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDeliveryHistory(subId);
                                }}
                                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
                              >
                                <Truck size={14} />
                                <span>Recent Deliveries ({recentDeliveries.length})</span>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>

                              {isExpanded && (
                                <div className="mt-2 pl-4 border-l-2 space-y-2" style={{ borderColor: '#3d59ab' }}>
                                  {recentDeliveries.map((delivery, idx) => (
                                    <div
                                      key={idx}
                                      className="text-sm p-2 rounded"
                                      style={{ backgroundColor: '#f9f9ed' }}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">
                                          {new Date(delivery.date + 'T12:00:00').toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric'
                                          })}
                                        </span>
                                        {delivery.status === 'problem' && (
                                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                            {delivery.problem}
                                          </span>
                                        )}
                                        {delivery.status === 'delivered' && !delivery.problem && (
                                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                            Delivered
                                          </span>
                                        )}
                                        {delivery.bagsReturned === false && (
                                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                            No bags
                                          </span>
                                        )}
                                      </div>
                                      {delivery.dishes && delivery.dishes.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">
                                          {delivery.dishes.join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex gap-2 self-start ml-4">
                        <button
                          onClick={() => copyPortalLink(subscription)}
                          className="text-purple-600"
                          title="Copy portal link"
                        >
                          <Link2 size={18} />
                        </button>
                        <button onClick={() => startEditing(i)} className="text-blue-600" title="Edit">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => deleteClient(i)} className="text-red-600" title="Delete">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

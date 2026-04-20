import Papa from 'papaparse';

// Note: Week utilities are imported directly from './weekUtils' where needed
// to avoid barrel export initialization issues

export const normalizeName = (name) =>
  name.toLowerCase().trim().replace(/s$/, '').replace(/es$/, '').replace(/ies$/, 'y').replace(/[^a-z0-9]/g, '');

export const similarity = (str1, str2) => {
  const s1 = normalizeName(str1);
  const s2 = normalizeName(str2);
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1;
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return (longer.length - costs[s2.length]) / longer.length;
};

export const downloadCSV = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const categorizeIngredient = (name) => {
  const n = name.toLowerCase();
  // Pantry first: "chicken broth", "beef stock" are pantry items even though they contain meat keywords
  if (['stock', 'broth', 'rice', 'pasta', 'flour', 'sugar', 'olive oil', 'vegetable oil', 'vinegar', 'sauce', 'honey', 'bread', 'oil'].some(x => n.includes(x))) return 'Pantry & Dry Goods';
  // Dairy before spices: "unsalted butter" must not match "salt" in the spices list
  if (['milk', 'cheese', 'butter', 'egg', 'cream', 'yogurt'].some(x => n.includes(x))) return 'Dairy & Eggs';
  // Spices before produce: "black pepper" is a spice, not produce; use " salt" to avoid matching "unsalted"
  if ([' salt', 'kosher salt', 'sea salt', 'black pepper', 'white pepper', 'spice', 'cumin', 'paprika', 'oregano', 'thyme', 'cinnamon', 'cayenne', 'curry', 'turmeric', 'chili powder'].some(x => n.includes(x)) || n === 'salt') return 'Spices & Seasonings';
  if (['lettuce', 'cucumber', 'tomato', 'onion', 'garlic', 'carrot', 'potato', 'cauliflower', 'broccoli', 'spinach', 'bell pepper', 'celery', 'mushroom', 'zucchini', 'squash', 'asparagus', 'lemon', 'lime', 'ginger', 'cilantro', 'parsley', 'kale', 'arugula', 'beet', 'chard'].some(x => n.includes(x))) return 'Produce';
  if (['chicken', 'beef', 'pork', 'salmon', 'fish', 'shrimp', 'turkey', 'lamb', 'bacon', 'sausage', 'steak', 'thigh', 'breast'].some(x => n.includes(x))) return 'Meat & Seafood';
  return 'Other';
};

export const exportClientsCSV = (clients) => {
  downloadCSV(Papa.unparse(clients, { columns: ['name', 'persons', 'address', 'email', 'phone', 'notes', 'mealsPerWeek', 'status'] }), 'clients.csv');
};

export const exportIngredientsCSV = (masterIngredients) => {
  downloadCSV(Papa.unparse(masterIngredients.map(ing => ({
    name: ing.name,
    cost: ing.cost,
    unit: ing.unit,
    source: ing.source,
    section: ing.section
  })), { columns: ['name', 'cost', 'unit', 'source', 'section'] }), 'ingredients.csv');
};

export const exportRecipesCSV = (recipes) => {
  const rows = [];
  Object.entries(recipes).forEach(([category, items]) => {
    items.forEach(recipe => {
      if (recipe.ingredients?.length > 0) {
        recipe.ingredients.forEach(ing => {
          rows.push({
            'Recipe Name': recipe.name,
            'Category': category,
            'Instructions': recipe.instructions || '',
            'Ingredient': ing.name,
            'Portion Size (oz)': ing.quantity,
            'cost': ing.cost || '',
            'source': ing.source || '',
            'section': ing.section || 'Other'
          });
        });
      } else {
        rows.push({
          'Recipe Name': recipe.name,
          'Category': category,
          'Instructions': recipe.instructions || '',
          'Ingredient': '',
          'Portion Size (oz)': '',
          'cost': '',
          'source': '',
          'section': ''
        });
      }
    });
  });
  downloadCSV(Papa.unparse(rows, { columns: ['Recipe Name', 'Category', 'Instructions', 'Ingredient', 'Portion Size (oz)', 'cost', 'source', 'section'] }), 'recipes.csv');
};

// Helper to parse boolean from various formats
const parseBoolean = (val) => {
  if (val === true || val === 'true' || val === 'yes' || val === 'Yes' || val === 'YES' || val === '1') return true;
  return false;
};

// Helper to parse price (removes $ and commas)
const parsePrice = (val) => {
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,]/g, '').trim();
  return parseFloat(cleaned) || 0;
};

export const parseClientsCSV = (file, onSuccess, onError) => {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const headers = results.meta.fields || [];
      const isMultiRowFormat = headers.includes('subscriptionId') || headers.includes('subscriptionDisplayName');

      // Helper to get field value with case variations
      const getField = (row, ...keys) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== '') return row[key];
        }
        return '';
      };

      if (isMultiRowFormat) {
        // Multi-row subscription/contacts format - group rows by subscription
        const subscriptionMap = {};
        let currentSubscription = null;

        results.data.forEach(row => {
          const subDisplayName = getField(row, 'subscriptionDisplayName', 'SubscriptionDisplayName', 'Subscription Display Name');
          const subId = getField(row, 'subscriptionId', 'SubscriptionId') || (subDisplayName ? Date.now().toString() + Math.random() : null);

          if (subId && subDisplayName) {
            const zone = getField(row, 'zone', 'Zone').toUpperCase();
            currentSubscription = {
              subscriptionId: subId,
              displayName: subDisplayName,
              portions: parseInt(getField(row, 'portions', 'Portions')) || 1,
              mealsPerWeek: parseInt(getField(row, 'mealsPerWeek', 'MealsPerWeek', 'meals', 'Meals')) || 0,
              frequency: (getField(row, 'frequency', 'Frequency') || 'weekly').toLowerCase(),
              status: (getField(row, 'status', 'Status') || 'active').toLowerCase(),
              zone: zone === 'UNASSIGNED' ? '' : zone,
              deliveryDay: getField(row, 'deliveryDay', 'DeliveryDay'),
              pickup: parseBoolean(getField(row, 'pickup', 'Pickup')),
              planPrice: parsePrice(getField(row, 'planPrice', 'PlanPrice')),
              serviceFee: parsePrice(getField(row, 'serviceFee', 'ServiceFee')),
              prepayDiscount: parseBoolean(getField(row, 'prepayDiscount', 'PrepayDiscount')),
              newClientFeePaid: parseBoolean(getField(row, 'newClientFeePaid', 'NewClientFeePaid')),
              paysOwnGroceries: parseBoolean(getField(row, 'paysOwnGroceries', 'PaysOwnGroceries')),
              billingNotes: getField(row, 'billingNotes', 'BillingNotes', 'notes', 'Notes'),
              dietaryRestrictions: getField(row, 'dietaryRestrictions', 'DietaryRestrictions', 'dietary', 'Dietary', 'allergies', 'Allergies'),
              accessCode: getField(row, 'accessCode', 'AccessCode'),
              honeyBookLink: getField(row, 'honeyBookLink', 'HoneyBookLink'),
              contacts: []
            };
            subscriptionMap[subId] = currentSubscription;
          }

          // Check for contact data (can be on same row as subscription or separate rows)
          const contactFullName = getField(row, 'contactFullName', 'ContactFullName', 'Contact Full Name');
          const contactEmail = getField(row, 'email', 'Email');
          const contactPhone = getField(row, 'phone', 'Phone');
          const contactAddress = getField(row, 'address', 'Address');

          if (currentSubscription && (contactFullName || contactEmail || contactAddress)) {
            currentSubscription.contacts.push({
              fullName: contactFullName,
              displayName: getField(row, 'contactDisplayName', 'ContactDisplayName', 'Contact Display Name'),
              email: contactEmail,
              phone: contactPhone,
              address: contactAddress
            });
          }
        });

        const imported = Object.values(subscriptionMap).filter(sub => sub.displayName || sub.contacts.length > 0);
        onSuccess(imported);
      } else {
        // Single row per client format (handles multiple column name variations)
        const imported = results.data
          .filter(row => row.Name || row.name || row['Display Name'] || row.displayName)
          .map(row => {
            const name = row.Name || row.name || '';
            const displayName = row['Display Name'] || row.displayName || name;
            const portions = parseInt(row.Portions || row.portions || row.persons) || 1;
            const meals = parseInt(row.Meals || row.mealsPerWeek || row.meals) || 0;
            const zone = (row.zone || row.Zone || '').toUpperCase();

            return {
              subscriptionId: Date.now().toString() + Math.random(),
              displayName: displayName,
              name: name, // Keep for backwards compatibility
              portions: portions,
              mealsPerWeek: meals,
              frequency: (row.frequency || row.Frequency || 'weekly').toLowerCase(),
              status: (row.status || row.Status || 'active').toLowerCase(),
              zone: zone === 'UNASSIGNED' ? '' : zone,
              deliveryDay: row.deliveryDay || row.DeliveryDay || '',
              pickup: parseBoolean(row.pickup || row.Pickup),
              planPrice: parsePrice(row.planPrice || row.PlanPrice),
              serviceFee: parsePrice(row.serviceFee || row.ServiceFee),
              prepayDiscount: parseBoolean(row.prepayDiscount || row.PrepayDiscount),
              newClientFeePaid: parseBoolean(row.newClientFeePaid || row.NewClientFeePaid),
              paysOwnGroceries: parseBoolean(row.paysOwnGroceries || row.PaysOwnGroceries),
              billingNotes: row.billingNotes || row.BillingNotes || row.notes || '',
              dietaryRestrictions: row.dietaryRestrictions || row.DietaryRestrictions || row.dietary || row.Dietary || row.allergies || row.Allergies || '',
              accessCode: row.accessCode || row.AccessCode || '',
              honeyBookLink: row.honeyBookLink || row.HoneyBookLink || '',
              contacts: [{
                fullName: name,
                displayName: '',
                email: row.Email || row.email || '',
                phone: row.Phone || row.phone || '',
                address: row.Address || row.address || ''
              }]
            };
          });
        onSuccess(imported);
      }
    },
    error: onError
  });
};

export const parseIngredientsCSV = (file, onSuccess, onError) => {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      // Helper to get field value with case variations
      const getField = (row, ...keys) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== '') return row[key];
        }
        return '';
      };

      const imported = results.data
        .filter(row => getField(row, 'name', 'Name', 'ingredient', 'Ingredient'))
        .map(row => ({
          id: Date.now() + Math.random(),
          name: getField(row, 'name', 'Name', 'ingredient', 'Ingredient'),
          cost: getField(row, 'cost', 'Cost', 'price', 'Price'),
          unit: getField(row, 'unit', 'Unit', 'units', 'Units') || 'oz',
          source: getField(row, 'source', 'Source', 'vendor', 'Vendor', 'store', 'Store'),
          section: getField(row, 'section', 'Section', 'category', 'Category', 'aisle', 'Aisle') || 'Other'
        }));
      onSuccess(imported);
    },
    error: onError
  });
};

export const parseRecipesCSV = (file, onSuccess, onError) => {
  Papa.parse(file, {
    header: true,
    complete: (results) => {
      const newRecipes = { protein: [], veg: [], starch: [], sauces: [], breakfast: [], soups: [] };
      const recipeMap = {};
      const ingredientsToAdd = [];
      results.data.forEach(row => {
        if (!row['Recipe Name']) return;
        const recipeName = row['Recipe Name'];
        const category = (row['Category'] || 'protein').toLowerCase();
        if (!recipeMap[recipeName]) {
          recipeMap[recipeName] = { name: recipeName, category, instructions: row['Instructions'] || '', ingredients: [] };
        }
        if (row['Ingredient']) {
          const ingredient = {
            name: row['Ingredient'],
            quantity: row['Portion Size (oz)'] || '',
            unit: 'oz',
            cost: row['cost'] || '',
            source: row['source'] || '',
            section: row['section'] || 'Other'
          };
          recipeMap[recipeName].ingredients.push(ingredient);
          ingredientsToAdd.push(ingredient);
        }
      });
      Object.values(recipeMap).forEach(recipe => {
        if (newRecipes[recipe.category]) {
          newRecipes[recipe.category].push({ name: recipe.name, instructions: recipe.instructions, ingredients: recipe.ingredients });
        }
      });
      onSuccess(newRecipes, ingredientsToAdd);
    },
    error: onError
  });
};

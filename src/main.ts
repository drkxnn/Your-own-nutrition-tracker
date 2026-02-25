import './index.css';

// --- Types ---
type NutrientDict = Record<string, number>;
type CustomNutrientDict = Record<string, { value: number; unit: string }>;

interface Entry {
  id: string;
  title: string;
  amount: number;
  notes: string;
  nutrients: NutrientDict;
  customNutrients: CustomNutrientDict;
}

interface Template {
  id: string;
  title: string;
  nutrients: NutrientDict;
  customNutrients: CustomNutrientDict;
}

interface CustomNutrientDef {
  name: string;
  unit: string;
}

interface AppState {
  currentDate: string;
  entries: Record<string, Entry[]>;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  templates: Template[];
  customNutrientDefs: CustomNutrientDef[];
  view: 'daily' | 'weekly' | 'templates' | 'settings';
}

// --- Constants ---
const MAIN_NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'];
const ADDITIONAL_NUTRIENTS = ['sugar', 'fiber', 'saturatedFat', 'salt'];

const NUTRIENT_LABELS: Record<string, string> = {
  calories: 'Calories (kcal)',
  protein: 'Protein (g)',
  carbs: 'Carbs (g)',
  fat: 'Fat (g)',
  sugar: 'Sugar (g)',
  fiber: 'Fiber (g)',
  saturatedFat: 'Sat. Fat (g)',
  salt: 'Salt (g)'
};

// --- State Management ---
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

function loadState(): AppState {
  const saved = localStorage.getItem('nutrition_app_state');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse state', e);
    }
  }
  return {
    currentDate: new Date().toISOString().split('T')[0],
    entries: {},
    targets: {
      calories: 2000,
      protein: 150,
      carbs: 200,
      fat: 65
    },
    templates: [],
    customNutrientDefs: [],
    view: 'daily'
  };
}

let state: AppState = loadState();

function saveState() {
  localStorage.setItem('nutrition_app_state', JSON.stringify(state));
}

// --- DOM Elements ---
const mainView = document.getElementById('main-view')!;
const stickySummary = document.getElementById('sticky-summary')!;
const addEntryModal = document.getElementById('add-entry-modal')!;

let editingEntryId: string | null = null;

// --- Rendering ---
function updateUI() {
  mainView.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <div class="flex-1 overflow-y-auto pb-32">
      ${state.view === 'daily' ? renderDaily() : ''}
      ${state.view === 'weekly' ? renderWeekly() : ''}
      ${state.view === 'templates' ? renderTemplates() : ''}
      ${state.view === 'settings' ? renderSettings() : ''}
    </div>
  `;
  
  if (state.view === 'daily') {
    stickySummary.innerHTML = renderStickySummary();
    stickySummary.classList.remove('hidden');
  } else {
    stickySummary.classList.add('hidden');
  }
}

function renderHeader() {
  const d = new Date(state.currentDate);
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const isToday = state.currentDate === new Date().toISOString().split('T')[0];
  
  return `
    <div class="flex items-center justify-between p-4 bg-zinc-950 sticky top-0 z-10 border-b border-zinc-900">
      <button data-action="prev-day" class="p-2 bg-zinc-900 rounded-xl active:scale-95 transition-transform">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
      </button>
      <div class="text-center">
        <h1 class="text-lg font-bold">${dateStr}</h1>
        <p class="text-xs text-zinc-500">${isToday ? 'Today' : state.currentDate}</p>
      </div>
      <button data-action="next-day" class="p-2 bg-zinc-900 rounded-xl active:scale-95 transition-transform">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
      </button>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'templates', label: 'Templates' },
    { id: 'settings', label: 'Settings' }
  ];
  
  return `
    <div class="flex gap-2 p-4 overflow-x-auto border-b border-zinc-900 scrollbar-hide">
      ${tabs.map(t => `
        <button data-action="set-view" data-view="${t.id}" class="px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-colors ${state.view === t.id ? 'bg-indigo-600 text-white' : 'bg-zinc-900 text-zinc-400'}">
          ${t.label}
        </button>
      `).join('')}
    </div>
  `;
}

function calculateEntryTotals(entry: Entry) {
  const factor = entry.amount / 100;
  const totals: NutrientDict = {};
  [...MAIN_NUTRIENTS, ...ADDITIONAL_NUTRIENTS].forEach(nut => {
    totals[nut] = (entry.nutrients[nut] || 0) * factor;
  });
  const customTotals: CustomNutrientDict = {};
  state.customNutrientDefs.forEach(def => {
    customTotals[def.name] = {
      value: (entry.customNutrients[def.name]?.value || 0) * factor,
      unit: def.unit
    };
  });
  return { totals, customTotals };
}

function calculateDailyTotals(date: string) {
  const entries = state.entries[date] || [];
  const totals: NutrientDict = {};
  const customTotals: CustomNutrientDict = {};
  
  [...MAIN_NUTRIENTS, ...ADDITIONAL_NUTRIENTS].forEach(nut => totals[nut] = 0);
  state.customNutrientDefs.forEach(def => customTotals[def.name] = { value: 0, unit: def.unit });

  entries.forEach(entry => {
    const { totals: eTotals, customTotals: eCustom } = calculateEntryTotals(entry);
    Object.keys(eTotals).forEach(k => totals[k] += eTotals[k]);
    Object.keys(eCustom).forEach(k => customTotals[k].value += eCustom[k].value);
  });
  
  return { totals, customTotals };
}

function renderDaily() {
  const entries = state.entries[state.currentDate] || [];
  
  return `
    <div class="p-4 space-y-4">
      ${entries.length === 0 ? `
        <div class="text-center py-12 text-zinc-500">
          <p>No entries for this day.</p>
        </div>
      ` : entries.map(entry => {
        const { totals } = calculateEntryTotals(entry);
        return `
          <div class="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 relative">
            <div class="flex justify-between items-start mb-2">
              <div>
                <h3 class="font-bold text-lg">${entry.title}</h3>
                <p class="text-sm text-zinc-400">${entry.amount}g ${entry.notes ? `• ${entry.notes}` : ''}</p>
              </div>
              <div class="flex gap-2">
                <button data-action="edit-entry" data-id="${entry.id}" class="p-2 text-zinc-400 hover:text-white">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
                <button data-action="delete-entry" data-id="${entry.id}" class="p-2 text-red-400 hover:text-red-300">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            </div>
            <div class="grid grid-cols-4 gap-2 mt-3">
              <div class="bg-zinc-950 rounded-lg p-2 text-center">
                <div class="text-xs text-zinc-500">Kcal</div>
                <div class="font-bold">${totals.calories.toFixed(0)}</div>
              </div>
              <div class="bg-zinc-950 rounded-lg p-2 text-center">
                <div class="text-xs text-zinc-500">Pro</div>
                <div class="font-bold">${totals.protein.toFixed(1)}</div>
              </div>
              <div class="bg-zinc-950 rounded-lg p-2 text-center">
                <div class="text-xs text-zinc-500">Carb</div>
                <div class="font-bold">${totals.carbs.toFixed(1)}</div>
              </div>
              <div class="bg-zinc-950 rounded-lg p-2 text-center">
                <div class="text-xs text-zinc-500">Fat</div>
                <div class="font-bold">${totals.fat.toFixed(1)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
      
      <button data-action="show-add-entry" class="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-indigo-900/20 active:scale-95 transition-transform flex items-center justify-center gap-2">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
        Add Food
      </button>
      
      <button data-action="copy-prev-day" class="w-full py-3 bg-zinc-900 text-zinc-300 rounded-2xl font-medium border border-zinc-800 active:scale-95 transition-transform">
        Copy Previous Day
      </button>
    </div>
  `;
}

function renderStickySummary() {
  const { totals, customTotals } = calculateDailyTotals(state.currentDate);
  
  const renderBar = (label: string, current: number, target: number, colorClass: string) => {
    const percent = Math.min(100, target > 0 ? (current / target) * 100 : 0);
    return `
      <div class="flex-1">
        <div class="flex justify-between text-xs mb-1">
          <span class="text-zinc-400">${label}</span>
          <span class="font-medium">${current.toFixed(0)} <span class="text-zinc-500">/ ${target}</span></span>
        </div>
        <div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div class="h-full ${colorClass} rounded-full" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  };

  return `
    <div class="max-w-md mx-auto p-4 space-y-4">
      <div class="flex gap-4">
        ${renderBar('Calories', totals.calories, state.targets.calories, 'bg-indigo-500')}
      </div>
      <div class="flex gap-4">
        ${renderBar('Protein', totals.protein, state.targets.protein, 'bg-emerald-500')}
        ${renderBar('Carbs', totals.carbs, state.targets.carbs, 'bg-blue-500')}
        ${renderBar('Fat', totals.fat, state.targets.fat, 'bg-amber-500')}
      </div>
      
      <details class="group">
        <summary class="text-xs text-center text-zinc-500 cursor-pointer pt-2">Show all nutrients</summary>
        <div class="grid grid-cols-2 gap-2 mt-4 text-xs">
          ${ADDITIONAL_NUTRIENTS.map(nut => `
            <div class="bg-zinc-900 p-2 rounded flex justify-between">
              <span class="text-zinc-500">${NUTRIENT_LABELS[nut].split(' ')[0]}</span>
              <span>${totals[nut].toFixed(1)}</span>
            </div>
          `).join('')}
          ${state.customNutrientDefs.map(def => `
            <div class="bg-zinc-900 p-2 rounded flex justify-between">
              <span class="text-zinc-500">${def.name}</span>
              <span>${customTotals[def.name].value.toFixed(1)}${def.unit}</span>
            </div>
          `).join('')}
        </div>
      </details>
    </div>
  `;
}

function renderWeekly() {
  const today = new Date(state.currentDate);
  let totalCals = 0;
  let totalPro = 0;
  let daysWithData = 0;
  
  const daysHtml = [];
  
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const { totals } = calculateDailyTotals(dateStr);
    
    if (totals.calories > 0) {
      totalCals += totals.calories;
      totalPro += totals.protein;
      daysWithData++;
    }
    
    const percent = Math.min(100, state.targets.calories > 0 ? (totals.calories / state.targets.calories) * 100 : 0);
    
    daysHtml.push(`
      <div class="flex items-center gap-4">
        <div class="w-12 text-xs text-zinc-400">${d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
        <div class="flex-1 h-3 bg-zinc-900 rounded-full overflow-hidden relative">
          <div class="h-full bg-indigo-500 rounded-full" style="width: ${percent}%"></div>
        </div>
        <div class="w-12 text-right text-xs font-mono">${totals.calories.toFixed(0)}</div>
      </div>
    `);
  }
  
  const avgCals = daysWithData ? totalCals / daysWithData : 0;
  const avgPro = daysWithData ? totalPro / daysWithData : 0;

  return `
    <div class="p-4 space-y-6">
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-center">
          <div class="text-sm text-zinc-500 mb-1">Avg Calories</div>
          <div class="text-2xl font-bold text-indigo-400">${avgCals.toFixed(0)}</div>
        </div>
        <div class="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-center">
          <div class="text-sm text-zinc-500 mb-1">Avg Protein</div>
          <div class="text-2xl font-bold text-emerald-400">${avgPro.toFixed(1)}g</div>
        </div>
      </div>
      
      <div class="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 space-y-4">
        <h3 class="font-bold text-zinc-300 mb-4">Last 7 Days</h3>
        ${daysHtml.join('')}
      </div>
    </div>
  `;
}

function renderTemplates() {
  return `
    <div class="p-4 space-y-4">
      ${state.templates.length === 0 ? `
        <div class="text-center py-12 text-zinc-500">
          <p>No templates saved yet.</p>
          <p class="text-sm mt-2">Save an entry as a template when adding food.</p>
        </div>
      ` : state.templates.map(t => `
        <div class="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex justify-between items-center">
          <div>
            <h3 class="font-bold">${t.title}</h3>
            <p class="text-xs text-zinc-500">${t.nutrients.calories} kcal / 100g</p>
          </div>
          <button data-action="delete-template" data-id="${t.id}" class="p-2 text-red-400 hover:text-red-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSettings() {
  return `
    <div class="p-4 space-y-8">
      <!-- Targets -->
      <div class="space-y-4">
        <h3 class="font-bold text-lg border-b border-zinc-800 pb-2">Daily Targets</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-zinc-400">Calories</label>
            <input type="number" id="target-calories" value="${state.targets.calories}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1">
          </div>
          <div>
            <label class="text-sm text-zinc-400">Protein (g)</label>
            <input type="number" id="target-protein" value="${state.targets.protein}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1">
          </div>
          <div>
            <label class="text-sm text-zinc-400">Carbs (g)</label>
            <input type="number" id="target-carbs" value="${state.targets.carbs}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1">
          </div>
          <div>
            <label class="text-sm text-zinc-400">Fat (g)</label>
            <input type="number" id="target-fat" value="${state.targets.fat}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1">
          </div>
        </div>
        <button data-action="save-targets" class="w-full py-3 bg-zinc-800 text-white rounded-xl font-medium">Save Targets</button>
      </div>

      <!-- Custom Nutrients -->
      <div class="space-y-4">
        <h3 class="font-bold text-lg border-b border-zinc-800 pb-2 flex justify-between items-center">
          Custom Nutrients
          <button data-action="add-custom-nutrient" class="text-sm text-indigo-400 font-normal">+ Add</button>
        </h3>
        ${state.customNutrientDefs.length === 0 ? '<p class="text-sm text-zinc-500">No custom nutrients added.</p>' : ''}
        <div class="space-y-2">
          ${state.customNutrientDefs.map(def => `
            <div class="flex justify-between items-center bg-zinc-900 p-3 rounded-xl border border-zinc-800">
              <span>${def.name} <span class="text-xs text-zinc-500">(${def.unit})</span></span>
              <button data-action="delete-custom-nutrient" data-name="${def.name}" class="text-red-400 text-sm">Delete</button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Data Management -->
      <div class="space-y-4">
        <h3 class="font-bold text-lg border-b border-zinc-800 pb-2">Data Management</h3>
        <div class="grid grid-cols-2 gap-4">
          <button data-action="export-json" class="py-3 bg-zinc-900 border border-zinc-800 text-white rounded-xl text-sm">Export JSON</button>
          <button data-action="export-csv" class="py-3 bg-zinc-900 border border-zinc-800 text-white rounded-xl text-sm">Export CSV</button>
          <button data-action="import-json" class="py-3 bg-zinc-900 border border-zinc-800 text-white rounded-xl text-sm col-span-2">Import JSON Backup</button>
        </div>
      </div>
    </div>
  `;
}

// --- Add Entry Modal ---
function openAddEntryModal(entryId?: string) {
  editingEntryId = entryId || null;
  const entry = entryId ? state.entries[state.currentDate]?.find(e => e.id === entryId) : null;
  
  addEntryModal.innerHTML = `
    <div class="flex items-center justify-between p-4 bg-zinc-950 sticky top-0 z-10 border-b border-zinc-900">
      <button data-action="close-modal" class="text-zinc-400 p-2">Cancel</button>
      <h2 class="text-lg font-bold">${entry ? 'Edit Food' : 'Add Food'}</h2>
      <button data-action="save-entry" class="text-indigo-400 font-bold p-2">Save</button>
    </div>
    <div class="p-4 space-y-6 flex-1">
      ${!entry ? `
      <div class="space-y-2">
        <label class="text-sm text-zinc-400">Load from Template</label>
        <select id="template-select" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white">
          <option value="">-- Select Template --</option>
          ${state.templates.map(t => `<option value="${t.id}">${t.title}</option>`).join('')}
        </select>
      </div>
      ` : ''}

      <div class="space-y-4">
        <div>
          <label class="text-sm text-zinc-400">Food Title</label>
          <input type="text" id="entry-title" value="${entry?.title || ''}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1" placeholder="e.g. Oatmeal">
        </div>
        <div>
          <label class="text-sm text-zinc-400">Amount (g/ml)</label>
          <input type="number" id="entry-amount" value="${entry?.amount || ''}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1" placeholder="0">
        </div>
        <div>
          <label class="text-sm text-zinc-400">Notes (optional)</label>
          <input type="text" id="entry-notes" value="${entry?.notes || ''}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1" placeholder="e.g. Brand name">
        </div>
      </div>

      <div class="space-y-4">
        <h3 class="font-bold text-zinc-300 border-b border-zinc-800 pb-2">Nutrition per 100g</h3>
        
        <div class="grid grid-cols-2 gap-4">
          ${MAIN_NUTRIENTS.map(nut => `
            <div>
              <label class="text-sm text-zinc-400">${NUTRIENT_LABELS[nut]}</label>
              <input type="number" id="nut-${nut}" value="${entry?.nutrients[nut] ?? ''}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1 nutrient-input" placeholder="0">
            </div>
          `).join('')}
        </div>

        <details class="group">
          <summary class="text-sm text-indigo-400 cursor-pointer py-2">Show additional nutrients</summary>
          <div class="grid grid-cols-2 gap-4 mt-4">
            ${ADDITIONAL_NUTRIENTS.map(nut => `
              <div>
                <label class="text-sm text-zinc-400">${NUTRIENT_LABELS[nut]}</label>
                <input type="number" id="nut-${nut}" value="${entry?.nutrients[nut] ?? ''}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1 nutrient-input" placeholder="0">
              </div>
            `).join('')}
            ${state.customNutrientDefs.map(def => `
              <div>
                <label class="text-sm text-zinc-400">${def.name} (${def.unit})</label>
                <input type="number" id="custom-nut-${def.name}" value="${entry?.customNutrients[def.name]?.value ?? ''}" class="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-white mt-1 custom-nutrient-input" placeholder="0">
              </div>
            `).join('')}
          </div>
        </details>
      </div>

      <!-- Live Calculation Preview -->
      <div class="bg-zinc-900 p-4 rounded-xl border border-zinc-800 sticky bottom-4">
        <h3 class="text-sm font-bold text-zinc-400 mb-2">Calculated for <span id="preview-amount">0</span>g</h3>
        <div id="preview-nutrients" class="grid grid-cols-4 gap-2 text-center">
          <!-- Populated by JS -->
        </div>
      </div>

      ${!entry ? `
      <div class="pt-4 pb-8">
        <label class="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" id="save-as-template" class="rounded bg-zinc-900 border-zinc-800 text-indigo-600 focus:ring-indigo-600 w-5 h-5">
          Save as reusable template
        </label>
      </div>
      ` : ''}
    </div>
  `;
  addEntryModal.classList.remove('hidden');
  addEntryModal.classList.add('flex');
  
  const amountInput = document.getElementById('entry-amount') as HTMLInputElement;
  const nutInputs = document.querySelectorAll('.nutrient-input, .custom-nutrient-input');
  
  const updatePreview = () => {
    const amount = parseFloat(amountInput.value) || 0;
    document.getElementById('preview-amount')!.textContent = amount.toString();
    
    let previewHtml = '';
    MAIN_NUTRIENTS.forEach(nut => {
      const val = parseFloat((document.getElementById(`nut-${nut}`) as HTMLInputElement).value) || 0;
      const calc = (amount / 100) * val;
      previewHtml += `
        <div class="flex flex-col">
          <span class="text-xs text-zinc-500">${NUTRIENT_LABELS[nut].split(' ')[0]}</span>
          <span class="font-bold">${calc.toFixed(1)}</span>
        </div>
      `;
    });
    document.getElementById('preview-nutrients')!.innerHTML = previewHtml;
  };

  amountInput.addEventListener('input', updatePreview);
  nutInputs.forEach(input => input.addEventListener('input', updatePreview));
  
  const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
  if (templateSelect) {
    templateSelect.addEventListener('change', (e) => {
      const tId = (e.target as HTMLSelectElement).value;
      if (tId) {
        const t = state.templates.find(x => x.id === tId);
        if (t) {
          (document.getElementById('entry-title') as HTMLInputElement).value = t.title;
          MAIN_NUTRIENTS.forEach(nut => {
            (document.getElementById(`nut-${nut}`) as HTMLInputElement).value = t.nutrients[nut]?.toString() || '';
          });
          ADDITIONAL_NUTRIENTS.forEach(nut => {
            (document.getElementById(`nut-${nut}`) as HTMLInputElement).value = t.nutrients[nut]?.toString() || '';
          });
          state.customNutrientDefs.forEach(def => {
            (document.getElementById(`custom-nut-${def.name}`) as HTMLInputElement).value = t.customNutrients[def.name]?.value?.toString() || '';
          });
          updatePreview();
        }
      }
    });
  }

  updatePreview();
}

function closeAddEntryModal() {
  addEntryModal.classList.add('hidden');
  addEntryModal.classList.remove('flex');
}

function saveEntry() {
  const title = (document.getElementById('entry-title') as HTMLInputElement).value.trim();
  const amount = parseFloat((document.getElementById('entry-amount') as HTMLInputElement).value);
  const notes = (document.getElementById('entry-notes') as HTMLInputElement).value.trim();
  
  if (!title || isNaN(amount) || amount <= 0) {
    alert('Please enter a valid title and amount.');
    return;
  }

  const nutrients: NutrientDict = {};
  [...MAIN_NUTRIENTS, ...ADDITIONAL_NUTRIENTS].forEach(nut => {
    const val = parseFloat((document.getElementById(`nut-${nut}`) as HTMLInputElement).value);
    nutrients[nut] = isNaN(val) ? 0 : val;
  });

  const customNutrients: CustomNutrientDict = {};
  state.customNutrientDefs.forEach(def => {
    const val = parseFloat((document.getElementById(`custom-nut-${def.name}`) as HTMLInputElement).value);
    customNutrients[def.name] = {
      value: isNaN(val) ? 0 : val,
      unit: def.unit
    };
  });

  const entry: Entry = {
    id: editingEntryId || generateId(),
    title,
    amount,
    notes,
    nutrients,
    customNutrients
  };

  if (!state.entries[state.currentDate]) {
    state.entries[state.currentDate] = [];
  }

  if (editingEntryId) {
    const index = state.entries[state.currentDate].findIndex(e => e.id === editingEntryId);
    if (index !== -1) {
      state.entries[state.currentDate][index] = entry;
    }
  } else {
    state.entries[state.currentDate].push(entry);
  }

  const saveAsTemplate = (document.getElementById('save-as-template') as HTMLInputElement)?.checked;
  if (saveAsTemplate) {
    state.templates.push({
      id: generateId(),
      title,
      nutrients,
      customNutrients
    });
  }

  saveState();
  closeAddEntryModal();
  updateUI();
}

// --- Event Delegation ---
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const actionBtn = target.closest('[data-action]');
  
  if (!actionBtn) return;
  
  const action = actionBtn.getAttribute('data-action');
  
  switch (action) {
    case 'prev-day': {
      const d = new Date(state.currentDate);
      d.setDate(d.getDate() - 1);
      state.currentDate = d.toISOString().split('T')[0];
      saveState();
      updateUI();
      break;
    }
    case 'next-day': {
      const d = new Date(state.currentDate);
      d.setDate(d.getDate() + 1);
      state.currentDate = d.toISOString().split('T')[0];
      saveState();
      updateUI();
      break;
    }
    case 'set-view': {
      state.view = actionBtn.getAttribute('data-view') as any;
      saveState();
      updateUI();
      break;
    }
    case 'show-add-entry': {
      openAddEntryModal();
      break;
    }
    case 'edit-entry': {
      const id = actionBtn.getAttribute('data-id')!;
      openAddEntryModal(id);
      break;
    }
    case 'delete-entry': {
      if (confirm('Delete this entry?')) {
        const id = actionBtn.getAttribute('data-id')!;
        state.entries[state.currentDate] = state.entries[state.currentDate].filter(e => e.id !== id);
        saveState();
        updateUI();
      }
      break;
    }
    case 'close-modal': {
      closeAddEntryModal();
      break;
    }
    case 'save-entry': {
      saveEntry();
      break;
    }
    case 'copy-prev-day': {
      const d = new Date(state.currentDate);
      d.setDate(d.getDate() - 1);
      const prevDate = d.toISOString().split('T')[0];
      const prevEntries = state.entries[prevDate];
      if (prevEntries && prevEntries.length > 0) {
        if (!state.entries[state.currentDate]) state.entries[state.currentDate] = [];
        const copied = prevEntries.map(e => ({ ...e, id: generateId() }));
        state.entries[state.currentDate].push(...copied);
        saveState();
        updateUI();
      } else {
        alert('No entries found for the previous day.');
      }
      break;
    }
    case 'delete-template': {
      if (confirm('Delete template?')) {
        const id = actionBtn.getAttribute('data-id')!;
        state.templates = state.templates.filter(t => t.id !== id);
        saveState();
        updateUI();
      }
      break;
    }
    case 'add-custom-nutrient': {
      const name = prompt('Nutrient Name (e.g. Iron):');
      if (!name) return;
      const unit = prompt('Unit (e.g. mg, g, mcg):') || 'mg';
      state.customNutrientDefs.push({ name, unit });
      saveState();
      updateUI();
      break;
    }
    case 'delete-custom-nutrient': {
      const name = actionBtn.getAttribute('data-name')!;
      if (confirm(`Delete custom nutrient ${name}?`)) {
        state.customNutrientDefs = state.customNutrientDefs.filter(d => d.name !== name);
        saveState();
        updateUI();
      }
      break;
    }
    case 'export-json': {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "nutrition_backup.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      break;
    }
    case 'export-csv': {
      let csv = 'Date,Title,Amount,Calories,Protein,Carbs,Fat\\n';
      Object.entries(state.entries).forEach(([date, entries]) => {
        entries.forEach(e => {
          const cals = ((e.amount / 100) * (e.nutrients.calories || 0)).toFixed(1);
          const pro = ((e.amount / 100) * (e.nutrients.protein || 0)).toFixed(1);
          const car = ((e.amount / 100) * (e.nutrients.carbs || 0)).toFixed(1);
          const fat = ((e.amount / 100) * (e.nutrients.fat || 0)).toFixed(1);
          csv += `${date},"${e.title}",${e.amount},${cals},${pro},${car},${fat}\\n`;
        });
      });
      const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "nutrition_export.csv");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      break;
    }
    case 'import-json': {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = e => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = readerEvent => {
          try {
            const content = readerEvent.target?.result as string;
            const parsed = JSON.parse(content);
            if (parsed && parsed.entries) {
              state = parsed;
              saveState();
              updateUI();
              alert('Import successful');
            }
          } catch (err) {
            alert('Invalid JSON file');
          }
        }
        reader.readAsText(file);
      }
      input.click();
      break;
    }
    case 'save-targets': {
      const cals = parseFloat((document.getElementById('target-calories') as HTMLInputElement).value);
      const pro = parseFloat((document.getElementById('target-protein') as HTMLInputElement).value);
      const car = parseFloat((document.getElementById('target-carbs') as HTMLInputElement).value);
      const fat = parseFloat((document.getElementById('target-fat') as HTMLInputElement).value);
      if (!isNaN(cals)) state.targets.calories = cals;
      if (!isNaN(pro)) state.targets.protein = pro;
      if (!isNaN(car)) state.targets.carbs = car;
      if (!isNaN(fat)) state.targets.fat = fat;
      saveState();
      alert('Targets saved');
      updateUI();
      break;
    }
  }
});

// Initialize
updateUI();

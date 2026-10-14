// StatusDEV Design Kit — плагін Figma.
// Структура, іменування і порядок етапів узяті з файлу «Потік Монет»
// (див. design/FIGMA-STRUCTURE.md). Кожна команда ідемпотентна: повторний
// запуск оновлює наявне, а не дублює.

// ---------- Токени (дзеркалять web/src/index.css) ----------
const TOKENS = {
  'primary': '#8A4B25',
  'primary-dark': '#6B3A1C',
  'primary-hover': '#A05A2F',
  'primary-active': '#74401F',
  'on-primary': '#FFF8EC',
  'secondary': '#EFE4CF',
  'accent': '#EDE0C8',
  'bg-page': '#F7F0E1',
  'surface': '#FDFAF2',
  'bg-header': '#3A2A20',
  'on-header': '#F4E9D4',
  'border': '#DCCDB2',
  'border-strong': '#CDBB9B',
  'ring': '#B8794A',
  'text': '#2E2118',
  'text-secondary': '#7D6B58',
  'success': '#5D7A3A',
  'warning': '#B07D1E',
  'error': '#B3412E',
  'info-bg': '#DBEAFE',
  'info-fg': '#1D4ED8',
  'ok-bg': '#DCFCE7',
  'ok-fg': '#15803D',
  'action-bg': '#FEF3C7',
  'action-fg': '#92400E',
  'success-bg': '#EAF0E0',
  'warning-bg': '#F6ECD6',
  'primary-bg': '#F1E3D8',
  'error-bg': '#F7E1DC',
  'error-hover': '#9C3A28',
  'error-active': '#862F20',
  'white': '#FFFFFF',
};
const SPACING = { 4: 4, 8: 8, 12: 12, 16: 16, 24: 24, 32: 32, 40: 40, 48: 48, 64: 64, 96: 96 };
const RADIUS = { xs: 4, sm: 6, md: 8, pill: 999 };
const TEXT_STYLES = [
  ['Type/Display', 40, 'Bold', 48],
  ['Type/H1', 24, 'Semi Bold', 32],
  ['Type/H2', 18, 'Semi Bold', 26],
  ['Type/H3', 16, 'Semi Bold', 24],
  ['Type/Body', 14, 'Regular', 20],
  ['Type/Small', 12, 'Regular', 16],
  ['Type/Caption', 11, 'Semi Bold', 14],
  ['Type/Button', 14, 'Medium', 20],
  ['Type/Logo', 16, 'Semi Bold', 24],
];
const PAGES = [
  '00_Cover', '01_User_Flow', '02_Sitemap', '03_Wireframes', '04_Design_System',
  '05_Desktop', '06_Mobile', '07_Prototype', '08_UX_Audit', 'Internal Only Canvas',
];
const FONT_STYLES = ['Regular', 'Medium', 'Semi Bold', 'Bold'];

// ---------- Загальні хелпери ----------
let V = {}; // ім'я змінної -> Variable

const hex = (h) => {
  const s = h.replace('#', '');
  return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255 };
};

// Ключ токена -> заливка, прив'язана до змінної; довільний #HEX -> проста заливка.
function P(key) {
  const color = hex(TOKENS[key] || key);
  let paint = { type: 'SOLID', color };
  const v = V['color/' + key];
  if (TOKENS[key] && v) paint = figma.variables.setBoundVariableForPaint(paint, 'color', v);
  return paint;
}

async function loadFonts() {
  for (const style of FONT_STYLES) await figma.loadFontAsync({ family: 'Inter', style });
}

async function loadVars() {
  V = {};
  for (const v of await figma.variables.getLocalVariablesAsync()) V[v.name] = v;
}

function tx(s, o = {}) {
  const t = figma.createText();
  t.fontName = { family: 'Inter', style: o.style || 'Regular' };
  t.characters = s;
  t.fontSize = o.size || 14;
  t.fills = [P(o.color || 'text')];
  if (o.lh) t.lineHeight = { unit: 'PIXELS', value: o.lh };
  if (o.w) { t.resize(o.w, t.height); t.textAutoResize = 'HEIGHT'; }
  if (o.strike) t.textDecoration = 'STRIKETHROUGH';
  return t;
}

function fr(name, o = {}) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = o.dir || 'HORIZONTAL';
  f.itemSpacing = o.gap == null ? 0 : o.gap;
  const pad = o.pad || [0, 0, 0, 0];
  f.paddingTop = pad[0]; f.paddingRight = pad[1]; f.paddingBottom = pad[2]; f.paddingLeft = pad[3];
  f.primaryAxisAlignItems = o.main || 'MIN';
  f.counterAxisAlignItems = o.cross || 'CENTER';
  f.fills = o.fill ? [P(o.fill)] : [];
  if (o.stroke) { f.strokes = [P(o.stroke)]; f.strokeWeight = o.sw || 1; f.strokeAlign = 'INSIDE'; }
  if (o.r != null) f.cornerRadius = o.r;
  f.clipsContent = !!o.clip;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  if (o.w) { f.resize(o.w, 10); f.layoutSizingHorizontal = 'FIXED'; f.layoutSizingVertical = 'HUG'; }
  return f;
}

// Додає дитину в auto-layout; fill=true розтягує по ширині батька.
function add(parent, child, fill) {
  parent.appendChild(child);
  if (fill) {
    if (child.type === 'TEXT') child.textAutoResize = 'HEIGHT';
    child.layoutSizingHorizontal = 'FILL';
  }
  return child;
}

function rect(name, w, h, fillKey, r) {
  const n = figma.createRectangle();
  n.name = name; n.resize(w, h); n.fills = [P(fillKey)];
  if (r != null) n.cornerRadius = r;
  return n;
}

function place(node, page) {
  let x = 0;
  for (const c of page.children) if (c !== node) x = Math.max(x, c.x + c.width + 120);
  node.x = x; node.y = 0;
}

async function getPage(name) {
  let p = figma.root.children.find((x) => x.name === name);
  if (!p) { p = figma.createPage(); p.name = name; }
  return p;
}

// ---------- 1. Структура + токени ----------
// Змінні Colors/Spacing/Radius і стилі Brand/*: спільне для команд 1 і 9.
async function ensureTokens() {
  // змінні
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const col = (name) => cols.find((c) => c.name === name) || figma.variables.createVariableCollection(name);
  const colors = col('Colors'), spacing = col('Spacing'), radius = col('Radius');
  await loadVars();

  const ensure = (name, collection, type, value, scopes) => {
    let v = V[name];
    if (!v) { v = figma.variables.createVariable(name, collection, type); V[name] = v; }
    v.setValueForMode(collection.modes[0].modeId, value);
    v.scopes = scopes;
    return v;
  };
  const textKeys = ['text', 'text-secondary', 'on-primary', 'on-header', 'info-fg', 'ok-fg', 'action-fg', 'primary-dark', 'white'];
  for (const [k, h] of Object.entries(TOKENS)) {
    const scopes = textKeys.includes(k) ? ['TEXT_FILL', 'SHAPE_FILL'] : ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
    ensure('color/' + k, colors, 'COLOR', hex(h), scopes);
  }
  for (const [k, n] of Object.entries(SPACING)) ensure('space/' + k, spacing, 'FLOAT', n, ['GAP', 'WIDTH_HEIGHT']);
  for (const [k, n] of Object.entries(RADIUS)) ensure('radius/' + k, radius, 'FLOAT', n, ['CORNER_RADIUS']);

  // стилі кольорів Brand/*
  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const [k, h] of Object.entries(TOKENS)) {
    const name = 'Brand/' + k;
    const st = paintStyles.find((s) => s.name === name) || figma.createPaintStyle();
    st.name = name;
    st.paints = [{ type: 'SOLID', color: hex(h) }];
  }
}

async function setup() {
  await loadFonts();

  // сторінки: порожню першу перейменовуємо в 00_Cover
  // dynamic-page: children невивантаженої сторінки недоступні без loadAsync()
  const first = figma.root.children[0];
  if (first) await first.loadAsync();
  if (first && !PAGES.includes(first.name) && first.children.length === 0) first.name = PAGES[0];
  for (const name of PAGES) await getPage(name);

  await ensureTokens();

  // стилі тексту Type/*
  const textStyles = await figma.getLocalTextStylesAsync();
  for (const [name, size, style, lh] of TEXT_STYLES) {
    const st = textStyles.find((s) => s.name === name) || figma.createTextStyle();
    st.name = name;
    st.fontName = { family: 'Inter', style };
    st.fontSize = size;
    st.lineHeight = { unit: 'PIXELS', value: lh };
  }

  // тінь
  const effects = await figma.getLocalEffectStylesAsync();
  const shadow = effects.find((s) => s.name === 'Shadow/Soft') || figma.createEffectStyle();
  shadow.name = 'Shadow/Soft';
  shadow.effects = [{
    type: 'DROP_SHADOW', color: { r: 0.23, g: 0.16, b: 0.12, a: 0.12 },
    offset: { x: 0, y: 4 }, radius: 16, spread: 0, visible: true, blendMode: 'NORMAL',
  }];

  // обкладинка і палітра-зразки
  await buildCover();
  await buildSwatches();

  figma.closePlugin('Готово: ' + PAGES.length + ' сторінок, ' + Object.keys(TOKENS).length + ' кольорів, '
    + Object.keys(SPACING).length + ' відступів, ' + Object.keys(RADIUS).length + ' радіусів, '
    + TEXT_STYLES.length + ' стилів тексту.');
}

async function buildCover() {
  const page = await getPage('00_Cover');
  await figma.setCurrentPageAsync(page);
  if (page.findOne((n) => n.name === 'Cover — StatusDEV')) return;
  const f = fr('Cover — StatusDEV', { dir: 'VERTICAL', gap: 24, pad: [96, 96, 96, 96], fill: 'bg-header', cross: 'MIN', w: 1440 });
  add(f, tx('StatusDEV', { size: 96, style: 'Bold', color: 'on-header' }));
  add(f, tx('Кабінет фрілансера: клієнти, проєкти, етапи й коментарі в одному місці', { size: 24, color: 'border-strong' }));
  const chips = fr('Chips', { gap: 12 });
  for (const k of ['primary', 'secondary', 'bg-page', 'border', 'text']) chips.appendChild(rect('Chip/' + k, 56, 56, k, 12));
  add(f, chips);
  add(f, tx('Структура файлу за зразком «Потік Монет» · Етапи 1–18', { size: 14, color: 'text-secondary' }));
  page.appendChild(f);
}

async function buildSwatches() {
  const page = await getPage('Internal Only Canvas');
  await figma.setCurrentPageAsync(page);
  if (page.findOne((n) => n.name === 'Brand/primary')) return;
  let x = 0;
  for (const k of Object.keys(TOKENS)) {
    const r = rect('Brand/' + k, 100, 100, k, 12);
    r.x = x; r.y = 0; x += 124;
    page.appendChild(r);
  }
  let tx0 = 0;
  for (const [name, size, style] of TEXT_STYLES) {
    const t = tx('Ag', { size, style });
    t.name = name; t.x = tx0; t.y = 160; tx0 += 120;
    page.appendChild(t);
  }
}

// ---------- 2. Компоненти ----------
function variantSet(name, comps, parent) {
  const set = figma.combineAsVariants(comps, parent);
  set.name = name;
  set.layoutMode = 'HORIZONTAL';
  set.layoutWrap = 'WRAP';
  set.itemSpacing = 24; set.counterAxisSpacing = 24;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
  set.primaryAxisSizingMode = 'FIXED'; set.counterAxisSizingMode = 'AUTO';
  set.resize(900, 100);
  set.counterAxisSizingMode = 'AUTO';
  return set;
}

function component(name) {
  const c = figma.createComponent();
  c.name = name;
  c.layoutMode = 'HORIZONTAL';
  c.primaryAxisSizingMode = 'AUTO'; c.counterAxisSizingMode = 'AUTO';
  return c;
}

// Підготовка компонента: той самий auto-layout, що й у fr(), але для COMPONENT.
function styleComp(c, o) {
  c.layoutMode = o.dir || 'HORIZONTAL';
  c.itemSpacing = o.gap == null ? 0 : o.gap;
  const pad = o.pad || [0, 0, 0, 0];
  c.paddingTop = pad[0]; c.paddingRight = pad[1]; c.paddingBottom = pad[2]; c.paddingLeft = pad[3];
  c.primaryAxisAlignItems = o.main || 'CENTER';
  c.counterAxisAlignItems = o.cross || 'CENTER';
  c.fills = o.fill ? [P(o.fill)] : [];
  if (o.stroke) { c.strokes = [P(o.stroke)]; c.strokeWeight = o.sw || 1; c.strokeAlign = 'INSIDE'; }
  if (o.r != null) c.cornerRadius = o.r;
  if (o.opacity != null) c.opacity = o.opacity;
  if (o.w) { c.resize(o.w, 10); c.layoutSizingHorizontal = 'FIXED'; c.layoutSizingVertical = 'HUG'; }
  return c;
}

const BTN = {
  Primary: { fill: 'primary', fg: 'on-primary', hover: 'primary-hover', active: 'primary-active' },
  Secondary: { fill: 'secondary', fg: 'text', hover: 'accent', active: 'border' },
  Outline: { fill: 'bg-page', fg: 'text', hover: 'accent', active: 'secondary', stroke: 'border-strong' },
  Destructive: { fill: 'error', fg: 'white', hover: 'error-hover', active: 'error-active' },
};

function buildButtons(parent) {
  const sets = [];
  for (const [kind, k] of Object.entries(BTN)) {
    const comps = [];
    for (const state of ['Default', 'Hover', 'Active', 'Focus', 'Disabled']) {
      const c = component('State=' + state);
      const fill = state === 'Hover' ? k.hover : state === 'Active' ? k.active : k.fill;
      styleComp(c, {
        pad: [0, 16, 0, 16], gap: 8, fill, r: RADIUS.sm,
        stroke: state === 'Focus' ? 'ring' : k.stroke, sw: state === 'Focus' ? 2 : 1,
        opacity: state === 'Disabled' ? 0.5 : 1,
      });
      c.resize(c.width, 36); c.layoutSizingVertical = 'FIXED';
      c.appendChild(tx('Кнопка', { size: 14, style: 'Medium', color: k.fg }));
      comps.push(c);
    }
    sets.push(variantSet('Button/' + kind, comps, parent));
  }
  return sets;
}

function buildFormField(parent) {
  const comps = [];
  for (const state of ['Default', 'Focus', 'Error']) {
    const c = component('State=' + state);
    styleComp(c, { dir: 'VERTICAL', gap: 6, cross: 'MIN', main: 'MIN', w: 280 });
    c.appendChild(tx('Пароль', { size: 14, style: 'Medium' }));
    const box = fr('Input', { pad: [0, 12, 0, 12], fill: 'surface', r: RADIUS.sm,
      stroke: state === 'Error' ? 'error' : state === 'Focus' ? 'ring' : 'border-strong', sw: state === 'Focus' ? 2 : 1, w: 280 });
    box.resize(280, 36); box.layoutSizingVertical = 'FIXED';
    box.appendChild(tx(state === 'Default' ? '••••••••' : '•••', { size: 14, color: state === 'Focus' ? 'text' : 'text-secondary' }));
    c.appendChild(box); box.layoutSizingHorizontal = 'FILL';
    const hint = tx(state === 'Error' ? 'Пароль занадто короткий' : 'Щонайменше 8 символів',
      { size: 12, color: state === 'Error' ? 'error' : 'text-secondary' });
    c.appendChild(hint);
    comps.push(c);
  }
  return variantSet('Form field', comps, parent);
}

function buildBadges(parent) {
  const defs = [
    ['Active', 'Активний', 'success', 'success-bg'],
    ['Paused', 'На паузі', 'warning', 'warning-bg'],
    ['Done', 'Завершений', 'primary', 'primary-bg'],
    ['Archived', 'В архіві', 'text-secondary', 'bg-page'],
  ];
  const comps = defs.map(([state, label, fg, bg]) => {
    const c = component('Status=' + state);
    styleComp(c, { pad: [2, 8, 2, 8], fill: bg, stroke: fg, r: RADIUS.pill });
    c.appendChild(tx(label, { size: 12, style: 'Medium', color: fg }));
    return c;
  });
  return variantSet('Badge/Project', comps, parent);
}

function buildPills(parent) {
  const defs = [
    ['Todo', '○ Очікує', 'secondary', 'text'],
    ['InProgress', '◐ В роботі', 'info-bg', 'info-fg'],
    ['Done', '✓ Готово', 'ok-bg', 'ok-fg'],
  ];
  const comps = defs.map(([state, label, bg, fg]) => {
    const c = component('Status=' + state);
    styleComp(c, { pad: [0, 10, 0, 10], fill: bg, r: RADIUS.pill });
    c.resize(c.width, 28); c.layoutSizingVertical = 'FIXED';
    c.appendChild(tx(label, { size: 12, style: 'Medium', color: fg }));
    return c;
  });
  return variantSet('Pill/Milestone', comps, parent);
}

function buildProgress(parent) {
  const comps = [0, 60, 100].map((val) => {
    const c = component('Value=' + val);
    styleComp(c, { dir: 'HORIZONTAL', main: 'MIN', fill: 'secondary', r: RADIUS.pill, w: 180 });
    c.resize(180, 8); c.layoutSizingVertical = 'FIXED'; c.clipsContent = true;
    const bar = rect('Fill', Math.max(1, Math.round(180 * val / 100)), 8, 'success', RADIUS.pill);
    c.appendChild(bar);
    if (val === 0) bar.visible = false;
    return c;
  });
  return variantSet('Progress', comps, parent);
}

function buildClientAction(parent) {
  const c = component('Client action');
  styleComp(c, { pad: [6, 12, 6, 12], fill: 'action-bg', r: RADIUS.sm, w: 420 });
  c.appendChild(tx('Потрібно від клієнта: затвердити макет', { size: 13, color: 'action-fg', w: 396 }));
  parent.appendChild(c);
  return c;
}

function buildHeader(parent) {
  const comps = [];
  for (const device of ['Desktop', 'Mobile']) {
    const c = component('Device=' + device);
    const w = device === 'Desktop' ? 1280 : 390;
    styleComp(c, { pad: [0, 20, 0, 20], gap: 16, fill: 'bg-header', w });
    c.resize(w, 56); c.layoutSizingVertical = 'FIXED';
    c.primaryAxisAlignItems = 'MIN';
    const logo = fr('Logo', { gap: 8 });
    const mark = fr('Mark', { main: 'CENTER', fill: 'primary', r: RADIUS.sm });
    mark.resize(28, 28); mark.layoutSizingHorizontal = 'FIXED'; mark.layoutSizingVertical = 'FIXED';
    mark.appendChild(tx('S', { size: 14, style: 'Semi Bold', color: 'on-primary' }));
    logo.appendChild(mark);
    logo.appendChild(tx('StatusDEV', { size: 16, style: 'Semi Bold', color: 'white' }));
    c.appendChild(logo);
    if (device === 'Desktop') {
      for (const [i, label] of ['Проєкти', 'Клієнти'].entries()) {
        const item = fr('Nav item', { pad: [6, 12, 6, 12], r: RADIUS.sm });
        if (i === 0) item.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 0.15 }];
        item.appendChild(tx(label, { size: 14, style: 'Medium', color: i === 0 ? 'white' : 'on-header' }));
        c.appendChild(item);
      }
    }
    comps.push(c);
  }
  const set = figma.combineAsVariants(comps, parent);
  set.name = 'Header';
  set.layoutMode = 'VERTICAL'; set.itemSpacing = 24;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
  return set;
}

async function components() {
  await loadFonts();
  await loadVars();
  if (!V['color/primary']) { figma.closePlugin('Спершу запустіть команду «1. Структура сторінок і токени».'); return; }
  const page = await getPage('04_Design_System');
  await figma.setCurrentPageAsync(page);

  const old = page.findOne((n) => n.name === '02 — UI Kit / Design System');
  if (old) old.remove();

  const kit = fr('02 — UI Kit / Design System', { dir: 'VERTICAL', gap: 48, pad: [48, 48, 48, 48], fill: 'surface', cross: 'MIN', w: 1400 });
  add(kit, tx('UI Kit — StatusDEV', { size: 40, style: 'Bold' }));
  add(kit, tx('Атоми → молекули → організми. Іменування: Група/Назва, властивості State= / Status= / Device=.', { size: 14, color: 'text-secondary' }));

  const row = (title) => {
    const r = fr(title, { dir: 'VERTICAL', gap: 16, cross: 'MIN' });
    add(r, tx(title, { size: 24, style: 'Semi Bold' }));
    add(kit, r, true);
    return r;
  };
  const atoms = row('Атоми'), molecules = row('Молекули'), organisms = row('Організми');
  const made = [];

  made.push(...buildButtons(atoms));
  made.push(buildBadges(atoms), buildPills(atoms), buildProgress(atoms));
  made.push(buildFormField(molecules), buildClientAction(molecules));
  made.push(buildHeader(organisms));

  page.appendChild(kit);
  normalize(kit);
  describeSets(page);
  place(kit, page);
  figma.viewport.scrollAndZoomIntoView([kit]);
  figma.closePlugin('Створено компонентів і наборів: ' + page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] }).length);
}

// ---------- 3. Екрани ----------
function findSet(sets, name) { return sets.find((s) => s.name === name); }

function instance(sets, setName, variant) {
  const set = findSet(sets, setName);
  if (!set) throw new Error('Немає компонента ' + setName + ': запустіть команду «2. Компоненти».');
  const comp = variant ? set.children.find((c) => c.name === variant) : set.defaultVariant;
  return (comp || set.defaultVariant).createInstance();
}

async function screens() {
  await loadFonts();
  await loadVars();
  const ds = await getPage('04_Design_System');
  await figma.setCurrentPageAsync(ds);
  const sets = ds.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  const comps = ds.findAllWithCriteria({ types: ['COMPONENT'] }).filter((c) => !c.parent || c.parent.type !== 'COMPONENT_SET');
  const clientAction = comps.find((c) => c.name === 'Client action');
  if (!sets.length) { figma.closePlugin('Спершу запустіть команди 1 і 2.'); return; }

  const page = await getPage('05_Desktop');
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.filter((c) => c.name.startsWith('Screen/'))) n.remove();

  const screen = (name) => {
    const f = fr(name, { dir: 'VERTICAL', fill: 'bg-page', cross: 'MIN', w: 1440 });
    const hdr = instance(sets, 'Header', 'Device=Desktop');
    f.appendChild(hdr); hdr.layoutSizingHorizontal = 'FILL';
    const body = fr('Body', { dir: 'VERTICAL', gap: 16, pad: [24, 80, 48, 80], cross: 'MIN' });
    add(f, body, true);
    return { f, body };
  };
  const listBox = () => fr('List', { dir: 'VERTICAL', fill: 'surface', stroke: 'border', r: RADIUS.md, cross: 'MIN', clip: true });
  const tabs = (labels, on) => {
    const t = fr('Tabs', { gap: 4, pad: [8, 12, 8, 12] });
    t.fills = [{ type: 'SOLID', color: hex(TOKENS.secondary), opacity: 0.6 }];
    labels.forEach((l, i) => {
      const x = fr('Tab', { pad: [4, 12, 4, 12], r: RADIUS.sm, fill: i === on ? 'surface' : null });
      x.appendChild(tx(l, { size: 14, style: i === on ? 'Semi Bold' : 'Regular', color: i === on ? 'text' : 'text-secondary' }));
      t.appendChild(x);
    });
    return t;
  };
  const divider = () => { const d = rect('Divider', 10, 1, 'border'); return d; };

  // --- Auth ---
  {
    const f = fr('Screen/Auth', { dir: 'VERTICAL', fill: 'bg-page', main: 'CENTER', w: 1440 });
    f.resize(1440, 900); f.layoutSizingVertical = 'FIXED';
    const col = fr('Auth column', { dir: 'VERTICAL', gap: 16, w: 340 });
    const big = fr('Mark', { main: 'CENTER', fill: 'bg-header', r: 12 });
    big.resize(48, 48); big.layoutSizingHorizontal = 'FIXED'; big.layoutSizingVertical = 'FIXED';
    big.appendChild(tx('S', { size: 20, style: 'Semi Bold', color: 'on-header' }));
    col.appendChild(big);
    col.appendChild(tx('Увійти в StatusDEV', { size: 20, style: 'Semi Bold' }));
    const card = fr('Card', { dir: 'VERTICAL', gap: 14, pad: [20, 20, 20, 20], fill: 'surface', stroke: 'border', r: RADIUS.md, cross: 'MIN', w: 340 });
    for (const label of ['Email', 'Пароль']) {
      const fld = instance(sets, 'Form field', 'State=Default');
      card.appendChild(fld);
      fld.layoutSizingHorizontal = 'FILL'; // FILL — лише після appendChild в auto-layout
      const label0 = fld.findOne((n) => n.type === 'TEXT');
      if (label0) label0.characters = label;
    }
    card.appendChild(instance(sets, 'Button/Primary', 'State=Default'));
    col.appendChild(card);
    card.layoutSizingHorizontal = 'FILL';
    f.appendChild(col);
    page.appendChild(f); place(f, page);
  }

  // --- Projects ---
  {
    const { f, body } = screen('Screen/Projects');
    const bar = fr('Toolbar', { main: 'SPACE_BETWEEN' });
    bar.appendChild(tx('Проєкти', { size: 24, style: 'Semi Bold' }));
    bar.appendChild(instance(sets, 'Button/Primary', 'State=Default'));
    add(body, bar, true);
    const list = listBox();
    add(list, tabs(['Усі 3', 'Активні 2', 'На паузі 0', 'Завершені 1', 'Архів 0'], 0), true);
    const items = [
      ['Сайт для кав’ярні «Зерно»', 'Active', 60, 'Клієнт: Олена Коваль · до 30 жовт. 2026 · оновлено 2 дн тому'],
      ['Брендинг студії йоги', 'Active', 0, 'Клієнт: Studio Om · оновлено 5 год тому'],
      ['SMM для магазину кераміки', 'Done', 100, 'Клієнт: Глина · оновлено 3 тиж тому'],
    ];
    for (const [title, st, pct, meta] of items) {
      add(list, divider(), true);
      const it = fr('Project item', { dir: 'VERTICAL', gap: 8, pad: [16, 16, 16, 16], cross: 'MIN' });
      const head = fr('Head', { gap: 8 });
      head.appendChild(tx(title, { size: 16, style: 'Semi Bold', color: 'primary' }));
      head.appendChild(instance(sets, 'Badge/Project', 'Status=' + st));
      it.appendChild(head);
      it.appendChild(instance(sets, 'Progress', 'Value=' + (pct === 0 ? 0 : pct === 100 ? 100 : 60)));
      it.appendChild(tx(meta, { size: 12, color: 'text-secondary' }));
      add(list, it, true);
    }
    add(body, list, true);
    page.appendChild(f); place(f, page);
  }

  // --- Project ---
  {
    const { f, body } = screen('Screen/Project');
    body.appendChild(tx('← Усі проєкти', { size: 13, color: 'text-secondary' }));
    const title = fr('Title', { gap: 12 });
    title.appendChild(tx('Сайт для кав’ярні «Зерно»', { size: 24, style: 'Semi Bold' }));
    title.appendChild(instance(sets, 'Badge/Project', 'Status=Active'));
    body.appendChild(title);
    const cols = fr('Columns', { gap: 24, cross: 'MIN' });
    const left = fr('Left', { dir: 'VERTICAL', gap: 16, cross: 'MIN' });
    const ms = listBox();
    const mh = fr('Milestones header', { gap: 12, pad: [12, 16, 12, 16] });
    mh.fills = [{ type: 'SOLID', color: hex(TOKENS.secondary), opacity: 0.6 }];
    mh.appendChild(tx('Етапи', { size: 16, style: 'Semi Bold' }));
    mh.appendChild(instance(sets, 'Progress', 'Value=60'));
    add(ms, mh, true);
    const rows = [
      ['Done', 'Бриф і структура', false], ['Done', 'Дизайн-макети', false],
      ['InProgress', 'Верстка головної', true], ['Todo', 'Меню та кошик', false],
    ];
    for (const [st, name, action] of rows) {
      add(ms, divider(), true);
      const r = fr('Milestone', { dir: 'VERTICAL', gap: 6, pad: [14, 16, 14, 16], cross: 'MIN' });
      const top = fr('Top', { gap: 12 });
      top.appendChild(instance(sets, 'Pill/Milestone', 'Status=' + st));
      top.appendChild(tx(name, { size: 14, style: 'Medium', color: st === 'Done' ? 'text-secondary' : 'text', strike: st === 'Done' }));
      r.appendChild(top);
      if (action && clientAction) r.appendChild(clientAction.createInstance());
      add(ms, r, true);
    }
    left.appendChild(ms); ms.layoutSizingHorizontal = 'FILL';
    cols.appendChild(left); left.layoutSizingHorizontal = 'FILL';
    const aside = fr('Aside', { dir: 'VERTICAL', gap: 14, pad: [16, 16, 16, 16], fill: 'surface', stroke: 'border', r: RADIUS.md, cross: 'MIN', w: 288 });
    for (const [k, v] of [['СТАТУС', 'Активний'], ['КЛІЄНТ', 'Олена Коваль'], ['ДЕДЛАЙН', '30 жовт. 2026'], ['ОНОВЛЕНО', '2 дн тому']]) {
      const g = fr('Field', { dir: 'VERTICAL', gap: 3, cross: 'MIN' });
      g.appendChild(tx(k, { size: 11, style: 'Semi Bold', color: 'text-secondary' }));
      g.appendChild(tx(v, { size: 13 }));
      aside.appendChild(g);
    }
    cols.appendChild(aside);
    add(body, cols, true);
    page.appendChild(f); place(f, page);
  }

  // --- Clients ---
  {
    const { f, body } = screen('Screen/Clients');
    body.appendChild(tx('Клієнти', { size: 24, style: 'Semi Bold' }));
    const list = listBox();
    for (const [i, [n, m]] of [['Олена Коваль', 'olena@zerno.ua · +380 50 123 45 67'], ['Studio Om', 'hello@studio-om.com']].entries()) {
      if (i) add(list, divider(), true);
      const it = fr('Client item', { dir: 'VERTICAL', gap: 4, pad: [16, 16, 16, 16], cross: 'MIN' });
      it.appendChild(tx(n, { size: 14, style: 'Semi Bold' }));
      it.appendChild(tx(m, { size: 13, color: 'text-secondary' }));
      add(list, it, true);
    }
    add(body, list, true);
    page.appendChild(f); place(f, page);
  }

  figma.closePlugin('Створено 4 екрани на сторінці 05_Desktop.');
}

// ---------- 4. Аудит ----------
function lum(c) {
  const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toHex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

function solid(node) {
  if (!('fills' in node) || node.fills === figma.mixed) return null;
  for (const p of node.fills) if (p.type === 'SOLID' && p.visible !== false && (p.opacity == null || p.opacity > 0.5)) return p;
  return null;
}
function backdrop(node) {
  for (let p = node.parent; p; p = p.parent) { const s = solid(p); if (s) return s.color; }
  return { r: 1, g: 1, b: 1 };
}

async function audit() {
  await loadFonts();
  const page = figma.currentPage;
  if (page.name === '08_UX_Audit') { figma.closePlugin('Відкрийте сторінку, яку треба перевірити (не 08_UX_Audit).'); return; }
  const texts = page.findAllWithCriteria({ types: ['TEXT'] });
  const fails = [];
  let unbound = 0, checked = 0;
  for (const t of texts) {
    const p = solid(t);
    if (!p) continue;
    checked++;
    if (!(p.boundVariables && p.boundVariables.color)) unbound++;
    const r = ratio(p.color, backdrop(t));
    const size = typeof t.fontSize === 'number' ? t.fontSize : 14;
    const bold = typeof t.fontName === 'object' && /Bold|Semi/.test(t.fontName.style);
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (r < need) fails.push({ text: t.characters.slice(0, 40), r, need, fg: toHex(p.color), bg: toHex(backdrop(t)) });
  }
  fails.sort((a, b) => a.r - b.r);

  const audPage = await getPage('08_UX_Audit');
  await figma.setCurrentPageAsync(audPage);
  const report = fr('Plugin report', { dir: 'VERTICAL', gap: 12, pad: [32, 32, 32, 32], fill: 'surface', stroke: 'border', r: RADIUS.md, cross: 'MIN', w: 900 });
  add(report, tx('Звіт плагіна: сторінка «' + page.name + '»', { size: 24, style: 'Semi Bold' }));
  add(report, tx('Текстів перевірено: ' + checked + ' · не прив’язано до змінних: ' + unbound + ' · контраст нижче норми WCAG AA: ' + fails.length, { size: 14, color: 'text-secondary' }));
  for (const f of fails.slice(0, 30)) {
    add(report, tx('✗ «' + f.text + '» — ' + f.r.toFixed(2) + ' (потрібно ' + f.need + ') · ' + f.fg + ' на ' + f.bg, { size: 13, color: 'error', w: 836 }));
  }
  if (!fails.length) add(report, tx('✓ Усі тексти проходять контраст AA.', { size: 14, color: 'success' }));
  audPage.appendChild(report);
  place(report, audPage);
  figma.viewport.scrollAndZoomIntoView([report]);
  figma.closePlugin('Аудит: ' + fails.length + ' проблем із контрастом, ' + unbound + ' текстів без змінних.');
}

// ---------- Нормалізація: токени замість «голих» значень (команда 9 і кінець команди 2) ----------
function inInstance(n) {
  for (let p = n.parent; p; p = p.parent) if (p.type === 'INSTANCE') return true;
  return false;
}
const isBound = (n, field) => !!(n.boundVariables && n.boundVariables[field]);

function tokenByColor(c) {
  const q = (v) => Math.round(v * 255);
  for (const [k, h] of Object.entries(TOKENS)) {
    const t = hex(h);
    if (q(t.r) === q(c.r) && q(t.g) === q(c.g) && q(t.b) === q(c.b)) return k;
  }
  return null;
}

function normalize(root) {
  const stats = { radius: 0, spacing: 0, paints: 0 };
  const nodes = [root].concat(root.findAll(() => true));
  for (const n of nodes) {
    if (n.type === 'INSTANCE' || inInstance(n)) continue;
    if ('cornerRadius' in n && typeof n.cornerRadius === 'number' && n.cornerRadius > 0 && !isBound(n, 'cornerRadius')) {
      const k = Object.keys(RADIUS).find((r) => RADIUS[r] === n.cornerRadius);
      if (k && V['radius/' + k]) { n.setBoundVariable('cornerRadius', V['radius/' + k]); stats.radius++; }
    }
    if ('layoutMode' in n && n.layoutMode !== 'NONE') {
      for (const f of ['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']) {
        const val = n[f];
        if (typeof val === 'number' && val > 0 && SPACING[val] !== undefined && V['space/' + val] && !isBound(n, f)) {
          n.setBoundVariable(f, V['space/' + val]); stats.spacing++;
        }
      }
    }
    for (const prop of ['fills', 'strokes']) {
      if (!(prop in n) || n[prop] === figma.mixed) continue;
      let changed = false;
      const next = n[prop].map((p) => {
        if (p.type !== 'SOLID' || (p.boundVariables && p.boundVariables.color)) return p;
        const key = tokenByColor(p.color);
        if (!key || !V['color/' + key]) return p;
        changed = true; stats.paints++;
        return figma.variables.setBoundVariableForPaint(p, 'color', V['color/' + key]);
      });
      if (changed) n[prop] = next;
    }
  }
  return stats;
}

const DESCRIPTIONS = {
  'Button/Primary': 'Головна дія на екрані. Одна на блок. Стани: Default, Hover, Active, Focus, Disabled.',
  'Button/Secondary': 'Другорядна дія поруч із головною.',
  'Button/Outline': 'Нейтральна дія, наприклад «Перевірити ще раз».',
  'Button/Destructive': 'Незворотна дія: видалення. Завжди з підтвердженням.',
  'Form field': 'Підпис + поле + підказка. Помилку показувати і кольором, і текстом.',
  'Badge/Project': 'Статус проєкту: Активний, На паузі, Завершений, В архіві.',
  'Pill/Milestone': 'Статус етапу. Завжди слово й іконка, не лише колір.',
  'Progress': 'Прогрес проєкту: готові етапи / усі етапи.',
  'Header': 'Шапка кабінету. Desktop 1280, Mobile 390.',
};

function describeSets(page) {
  let n = 0;
  for (const s of page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
    if (DESCRIPTIONS[s.name] && s.description !== DESCRIPTIONS[s.name]) { s.description = DESCRIPTIONS[s.name]; n++; }
  }
  const ca = page.findAllWithCriteria({ types: ['COMPONENT'] }).find((c) => c.name === 'Client action');
  if (ca) { ca.description = 'Що клієнт має зробити на цьому етапі. Жовтий блок, видно з першого погляду.'; n++; }
  return n;
}

// ---------- Сторінки 04: документація палітри і типографіки ----------
const USAGE = {
  'primary': 'Кнопки, посилання, акценти', 'primary-dark': 'Текст на світлому, наведення', 'primary-hover': 'Hover кнопки',
  'primary-active': 'Active кнопки', 'on-primary': 'Текст на primary', 'secondary': 'Другорядні фони, трек прогресу',
  'accent': 'Hover рядків, активні фони', 'bg-page': 'Фон сторінки', 'surface': 'Картки, поля', 'bg-header': 'Шапка',
  'on-header': 'Текст у шапці', 'border': 'Рамки, розділювачі', 'border-strong': 'Рамки полів', 'ring': 'Кільце фокуса',
  'text': 'Основний текст', 'text-secondary': 'Підписи, метадані', 'success': 'Готово, активний', 'warning': 'Пауза, увага',
  'error': 'Помилки, видалення', 'info-bg': 'Етап «В роботі»', 'info-fg': 'Текст «В роботі»', 'ok-bg': 'Етап «Готово»',
  'ok-fg': 'Текст «Готово»', 'action-bg': '«Потрібно від клієнта»', 'action-fg': 'Текст «Потрібно від клієнта»',
  'success-bg': 'Фон бейджа «Активний»', 'warning-bg': 'Фон бейджа «На паузі»', 'primary-bg': 'Фон бейджа «Завершений»',
  'error-bg': 'Фон помилки', 'error-hover': 'Hover видалення', 'error-active': 'Active видалення', 'white': 'Білий текст/іконки',
};

function buildPaletteFrame(page) {
  if (page.findOne((n) => n.name === 'Brand — палітра кольорів')) return false;
  const f = fr('Brand — палітра кольорів', { dir: 'VERTICAL', gap: 24, pad: [40, 40, 40, 40], fill: 'surface', cross: 'MIN', w: 1100 });
  add(f, tx('Brand / Кольори', { size: 24, style: 'Semi Bold' }));
  add(f, tx(Object.keys(TOKENS).length + ' кольорових токенів · змінні color/* і стилі Brand/*', { size: 14, color: 'text-secondary' }));
  const grid = fr('Grid', { gap: 16, cross: 'MIN' });
  grid.layoutWrap = 'WRAP';
  grid.resize(1020, 10); grid.layoutSizingHorizontal = 'FIXED'; grid.layoutSizingVertical = 'HUG';
  grid.counterAxisSpacing = 16;
  for (const [k, h] of Object.entries(TOKENS)) {
    const c = fr('Brand/' + k, { dir: 'VERTICAL', gap: 6, pad: [0, 0, 8, 0], fill: 'bg-page', stroke: 'border', r: RADIUS.md, cross: 'MIN', w: 188, clip: true });
    const sw = rect('Swatch', 188, 64, k);
    c.appendChild(sw);
    const box = fr('Info', { dir: 'VERTICAL', gap: 2, pad: [0, 10, 0, 10], cross: 'MIN' });
    box.appendChild(tx(k, { size: 13, style: 'Semi Bold' }));
    box.appendChild(tx(h, { size: 12, color: 'text-secondary' }));
    box.appendChild(tx(USAGE[k] || '', { size: 11, color: 'text-secondary', w: 166 }));
    c.appendChild(box);
    grid.appendChild(c);
  }
  add(f, grid);
  page.appendChild(f); place(f, page);
  return true;
}

function buildTypographyFrame(page) {
  if (page.findOne((n) => n.name === 'StatusDEV — Типографіка')) return false;
  const f = fr('StatusDEV — Типографіка', { dir: 'VERTICAL', gap: 20, pad: [40, 40, 40, 40], fill: 'surface', cross: 'MIN', w: 900 });
  add(f, tx('Типографіка', { size: 24, style: 'Semi Bold' }));
  add(f, tx('Шрифт Inter · у коді системний шрифт · основний текст не менше 14 px у кабінеті і 16 px на мобільному порталі', { size: 14, color: 'text-secondary', w: 820 }));
  for (const [name, size, style, lh] of TEXT_STYLES) {
    const r = fr(name, { gap: 24, cross: 'CENTER' });
    const spec = tx(name + '\n' + size + ' / ' + lh + ' · ' + style, { size: 12, color: 'text-secondary', w: 190 });
    r.appendChild(spec);
    r.appendChild(tx('Кабінет фрілансера StatusDEV', { size, style }));
    add(f, r);
  }
  page.appendChild(f); place(f, page);
  return true;
}

// ---------- 9. Виправлення 04_Design_System ----------
async function fix04() {
  await loadFonts();
  await ensureTokens();
  await loadVars();
  const page = await getPage('04_Design_System');
  await figma.setCurrentPageAsync(page);
  const report = [];

  // 4. Відсутні документаційні фрейми, як у «Потік Монет»
  if (buildPaletteFrame(page)) report.push('додано «Brand — палітра кольорів»');
  if (buildTypographyFrame(page)) report.push('додано «Типографіка»');

  // 1. Токени замість жорстких значень
  const stats = { radius: 0, spacing: 0, paints: 0 };
  for (const top of page.children.slice()) {
    if (top.type === 'FRAME' || top.type === 'COMPONENT' || top.type === 'COMPONENT_SET') {
      const s = normalize(top);
      stats.radius += s.radius; stats.spacing += s.spacing; stats.paints += s.paints;
    }
  }
  report.push('до токенів прив’язано: ' + stats.paints + ' кольорів, ' + stats.spacing + ' відступів, ' + stats.radius + ' радіусів');

  // 2. Опис компонентів
  report.push('описів компонентів: ' + describeSets(page));

  // 3. UI Kit не вміщав шапку 1280
  const kit = page.findOne((n) => n.name === '02 — UI Kit / Design System');
  if (kit && kit.type === 'FRAME') {
    let need = 0;
    for (const s of kit.findAllWithCriteria({ types: ['COMPONENT_SET'] })) need = Math.max(need, s.width);
    if (need + 96 > kit.width) { kit.layoutSizingHorizontal = 'FIXED'; kit.resize(need + 96, kit.height); report.push('UI Kit розширено до ' + Math.round(need + 96) + ' px'); }
  } else report.push('UI Kit відсутній — запустіть команду «2. Компоненти»');

  // 5. Порожні top-level вузли
  let removed = 0;
  for (const n of page.children.slice()) {
    if ((n.type === 'FRAME' || n.type === 'RECTANGLE') && 'children' in n && n.children.length === 0 && n.name.startsWith('Frame')) { n.remove(); removed++; }
  }
  if (removed) report.push('видалено порожніх фреймів: ' + removed);

  figma.closePlugin('04_Design_System виправлено: ' + report.join('; ') + '.');
}

// ---------- Діаграмні хелпери (User Flow, Sitemap) ----------
const KIND = {
  screen: ['surface', 'border-strong', 'text'],
  action: ['primary-bg', 'primary', 'primary-dark'],
  decision: ['action-bg', 'warning', 'action-fg'],
  error: ['error-bg', 'error', 'error'],
  system: ['info-bg', 'info-fg', 'info-fg'],
};
const KIND_LABEL = { screen: 'Екран', action: 'Дія користувача', decision: 'Рішення / умова', error: 'Помилка', system: 'Відповідь системи' };

function stepCard(n, title, sub, kind) {
  const [fill, stroke, fg] = KIND[kind];
  const c = fr('Step ' + n, { dir: 'VERTICAL', gap: 4, pad: [12, 14, 12, 14], fill, stroke, r: RADIUS.md, cross: 'MIN', w: 200 });
  c.appendChild(tx(n ? 'Крок ' + n : KIND_LABEL[kind], { size: 11, style: 'Semi Bold', color: fg }));
  c.appendChild(tx(title, { size: 14, style: 'Semi Bold', color: fg, w: 172 }));
  if (sub) c.appendChild(tx(sub, { size: 12, color: 'text-secondary', w: 172 }));
  return c;
}

function flowRow(name, cards) {
  const row = fr(name, { gap: 10, cross: 'MIN' });
  cards.forEach((c, i) => {
    if (i) row.appendChild(tx('→', { size: 20, color: 'text-secondary' }));
    row.appendChild(c);
  });
  return row;
}

function legend() {
  const l = fr('Legend', { gap: 16 });
  for (const k of Object.keys(KIND)) {
    const chip = fr('Legend/' + k, { gap: 6, pad: [4, 10, 4, 10], fill: KIND[k][0], stroke: KIND[k][1], r: RADIUS.pill });
    chip.appendChild(tx(KIND_LABEL[k], { size: 12, style: 'Medium', color: KIND[k][2] }));
    l.appendChild(chip);
  }
  return l;
}

// ---------- 5. 01_User_Flow ----------
const FLOWS = [
  {
    title: 'Сценарій 1. Реєстрація і перший проєкт',
    goal: 'Новий фрілансер за кілька хвилин створює клієнта, проєкт і бачить етапи з шаблону.',
    steps: [
      ['Реєстрація', '/signup: ім’я, email, пароль від 8 символів', 'screen'],
      ['Список проєктів', 'Порожній стан: «Створіть перший проєкт»', 'screen'],
      ['Додати клієнта', '/clients: форма «Новий клієнт»', 'action'],
      ['Новий проєкт', '/projects/new: клієнт, назва, дедлайн, шаблон', 'action'],
      ['API створює проєкт', 'POST /projects, етапи з шаблону', 'system'],
      ['Сторінка проєкту', 'Етапи, прогрес 0%', 'screen'],
    ],
    branches: [
      ['Пароль коротший за 8', 'Повідомлення «Пароль занадто короткий», форма лишається', 'error'],
      ['Клієнтів немає', '/projects/new підказує спершу додати клієнта', 'decision'],
      ['Вже 2 активні проєкти (Free)', '402 PLAN_LIMIT: текст помилки, пауза чи завершення іншого проєкту', 'error'],
    ],
  },
  {
    title: 'Сценарій 2. Ведення проєкту',
    goal: 'Власник оновлює етапи й одразу бачить, що це змінює прогрес і що чекає від клієнта.',
    steps: [
      ['Список проєктів', 'Фільтр статусу, прогрес-бар', 'screen'],
      ['Відкрити проєкт', '/projects/:id', 'screen'],
      ['Клік по статусу етапу', 'Очікує → В роботі → Готово', 'action'],
      ['API оновлює етап', 'PATCH /milestones/:id, completed_at, updated_at проєкту', 'system'],
      ['Прогрес оновився', 'N/M етапів, бейдж проєкту', 'screen'],
      ['Коментар клієнту', 'Форма «Коментарі»', 'action'],
    ],
    branches: [
      ['Етапу потрібна дія клієнта', 'Заповнити «Потрібно від клієнта» — жовтий блок на етапі', 'decision'],
      ['Видалення етапу', 'Підтвердження, потім перенумерація position', 'decision'],
      ['Мережева помилка', 'Червоне повідомлення під етапом, статус не змінюється', 'error'],
    ],
  },
  {
    title: 'Сценарій 3. Портал клієнта на телефоні (375 px)',
    goal: 'Клієнт за 10 секунд розуміє етап, що потрібно від нього і наступну дату. План: у схемі ще немає токена доступу.',
    steps: [
      ['Посилання з листа', 'Відкривається у телефоні, без реєстрації', 'screen'],
      ['Шапка бренду', 'brand_name і brand_color власника', 'screen'],
      ['Поточний етап', 'Назва, прогрес, наступна дата', 'screen'],
      ['«Потрібно від вас»', 'Жовтий блок, дія клієнта', 'action'],
      ['Коментар клієнта', 'author_type = client, без акаунта', 'action'],
      ['Підтвердження', '«Надіслано», власник бачить коментар', 'system'],
    ],
    branches: [
      ['Посилання недійсне', 'Екран «Посилання застаріло» і контакт власника', 'error'],
      ['У проєкті немає етапів', 'Порожній стан: «Етапи ще готуються»', 'decision'],
      ['Повільна мережа', 'Скелетон замість контенту', 'system'],
    ],
  },
];

async function userflow() {
  await loadFonts(); await loadVars();
  const page = await getPage('01_User_Flow');
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.slice()) n.remove();
  const root = fr('User Flow — root', { dir: 'VERTICAL', gap: 32, pad: [64, 64, 64, 64], fill: 'bg-page', cross: 'MIN', w: 2008 });
  add(root, tx('User Flow — три критичні сценарії', { size: 40, style: 'Bold' }));
  add(root, legend());
  for (const s of FLOWS) {
    const f = fr(s.title, { dir: 'VERTICAL', gap: 24, pad: [32, 32, 32, 32], fill: 'surface', stroke: 'border', r: 20, cross: 'MIN', w: 1880 });
    add(f, tx(s.title, { size: 24, style: 'Semi Bold' }));
    add(f, tx(s.goal, { size: 14, color: 'text-secondary', w: 1400 }));
    f.appendChild(flowRow('Основний шлях', s.steps.map((st, i) => stepCard(i + 1, st[0], st[1], st[2]))));
    add(f, tx('Гілки та помилки', { size: 16, style: 'Semi Bold' }));
    f.appendChild(flowRow('Гілки', s.branches.map((b) => stepCard(0, b[0], b[1], b[2]))));
    root.appendChild(f);
  }
  page.appendChild(root);
  normalize(root);
  figma.viewport.scrollAndZoomIntoView([root]);
  figma.closePlugin('01_User_Flow: ' + FLOWS.length + ' сценарії.');
}

// ---------- 6. 02_Sitemap ----------
const SITEMAP = [
  ['Публічні', [
    ['Вхід', '/login', 'є'], ['Реєстрація', '/signup', 'є'], ['Портал клієнта', '/p/:token', 'план'],
  ]],
  ['Кабінет власника', [
    ['Проєкти', '/', 'є'], ['Новий проєкт', '/projects/new', 'є'], ['Сторінка проєкту', '/projects/:id', 'є'], ['Клієнти', '/clients', 'є'],
  ]],
  ['Службові', [
    ['Сторінка не знайдена', '*', 'є'], ['Налаштування бренду', '/settings', 'план'], ['Тариф', '/billing', 'план'],
  ]],
];

function siteCard(title, route, status) {
  const planned = status === 'план';
  const c = fr('Page/' + title, { dir: 'VERTICAL', gap: 4, pad: [10, 14, 10, 14], fill: planned ? 'warning-bg' : 'surface', stroke: planned ? 'warning' : 'border-strong', r: RADIUS.md, cross: 'MIN', w: 280 });
  const top = fr('Top', { gap: 8 });
  top.appendChild(tx(title, { size: 14, style: 'Semi Bold' }));
  top.appendChild(tx(planned ? 'ПЛАН' : 'ГОТОВО', { size: 10, style: 'Semi Bold', color: planned ? 'warning' : 'success' }));
  c.appendChild(top);
  c.appendChild(tx(route, { size: 12, color: 'text-secondary' }));
  return c;
}

async function sitemap() {
  await loadFonts(); await loadVars();
  const page = await getPage('02_Sitemap');
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.slice()) n.remove();
  const root = fr('Sitemap — root', { dir: 'VERTICAL', gap: 32, pad: [64, 64, 64, 64], fill: 'bg-page', cross: 'CENTER', w: 1100 });
  add(root, tx('Sitemap — карта сторінок StatusDEV', { size: 40, style: 'Bold' }));
  const top = fr('Root node', { dir: 'VERTICAL', pad: [14, 28, 14, 28], fill: 'bg-header', r: RADIUS.md });
  top.appendChild(tx('StatusDEV', { size: 18, style: 'Semi Bold', color: 'white' }));
  root.appendChild(top);
  root.appendChild(rect('Connector', 2, 32, 'border-strong'));
  const cols = fr('Groups', { gap: 24, cross: 'MIN' });
  for (const [group, pages] of SITEMAP) {
    const col = fr('Group/' + group, { dir: 'VERTICAL', gap: 10, cross: 'MIN' });
    const h = fr('Group header', { pad: [8, 14, 8, 14], fill: 'primary', r: RADIUS.md, w: 280 });
    h.appendChild(tx(group, { size: 14, style: 'Semi Bold', color: 'on-primary' }));
    col.appendChild(h);
    for (const [t, r, s] of pages) col.appendChild(siteCard(t, r, s));
    cols.appendChild(col);
  }
  root.appendChild(cols);
  add(root, tx('Жовті картки — заплановано, у коді ще немає (портал клієнта чекає на рішення щодо токена доступу).', { size: 12, color: 'text-secondary' }));
  page.appendChild(root);
  normalize(root);
  figma.viewport.scrollAndZoomIntoView([root]);
  figma.closePlugin('02_Sitemap: ' + SITEMAP.reduce((a, g) => a + g[1].length, 0) + ' сторінок у ' + SITEMAP.length + ' групах.');
}

// ---------- 7. 03_Wireframes ----------
function wf(label, w, h) {
  const b = fr('WF/' + label, { main: 'CENTER', fill: 'secondary', stroke: 'border-strong', r: RADIUS.sm, w });
  b.dashPattern = [6, 4];
  b.resize(w, h); b.layoutSizingHorizontal = 'FIXED'; b.layoutSizingVertical = 'FIXED';
  b.appendChild(tx(label, { size: 12, color: 'text-secondary' }));
  return b;
}
function wfLine(parent, label, h) {
  const b = wf(label, 100, h);
  parent.appendChild(b);
  b.layoutSizingHorizontal = 'FILL';
  return b;
}
function wfScreen(name, note) {
  const f = fr('WF/' + name, { dir: 'VERTICAL', gap: 16, pad: [0, 0, 32, 0], fill: 'surface', stroke: 'border-strong', cross: 'MIN', w: 1440 });
  const hdr = wf('Шапка: логотип · Проєкти · Клієнти · профіль', 100, 56);
  f.appendChild(hdr); hdr.layoutSizingHorizontal = 'FILL';
  const body = fr('Body', { dir: 'VERTICAL', gap: 16, pad: [8, 80, 0, 80], cross: 'MIN' });
  add(f, body, true);
  const noteT = tx('Мета: ' + note, { size: 12, color: 'text-secondary', w: 900 });
  return { f, body, noteT };
}

async function wireframes() {
  await loadFonts(); await loadVars();
  const page = await getPage('03_Wireframes');
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.slice()) n.remove();
  const wrap = fr('01 — Wireframe', { dir: 'VERTICAL', gap: 48, pad: [64, 64, 64, 64], fill: 'bg-page', cross: 'MIN', w: 1568 });
  add(wrap, tx('Wireframes — кабінет власника', { size: 40, style: 'Bold' }));
  add(wrap, tx('Сірі блоки без кольору й типографіки. Розмір 1440 × 900. Перевіряємо структуру, порядок блоків і видимість головної дії.', { size: 14, color: 'text-secondary', w: 900 }));

  { // Список проєктів
    const { f, body, noteT } = wfScreen('Projects', 'знайти проєкт і побачити прогрес');
    const bar = fr('Toolbar', { main: 'SPACE_BETWEEN' });
    bar.appendChild(wf('Заголовок «Проєкти»', 220, 40));
    bar.appendChild(wf('CTA «Новий проєкт»', 180, 36));
    add(body, bar, true);
    wfLine(body, 'Вкладки статусів: Усі · Активні · На паузі · Завершені · Архів', 44);
    for (const i of [1, 2, 3]) wfLine(body, 'Рядок проєкту ' + i + ': назва · бейдж · прогрес · клієнт · дедлайн', 96);
    f.appendChild(noteT);
    wrap.appendChild(f);
  }
  { // Проєкт
    const { f, body, noteT } = wfScreen('Project', 'оновити етап і побачити, що потрібно від клієнта');
    body.appendChild(wf('← Усі проєкти', 140, 24));
    body.appendChild(wf('Назва проєкту + бейдж статусу', 480, 40));
    const cols = fr('Columns', { gap: 24, cross: 'MIN' });
    const left = fr('Left', { dir: 'VERTICAL', gap: 16, cross: 'MIN' });
    wfLine(left, 'Етапи: заголовок + прогрес', 44);
    for (const i of [1, 2, 3, 4]) wfLine(left, 'Етап ' + i + ': статус · назва · дата · «Потрібно від клієнта»', 64);
    wfLine(left, 'Форма додавання етапу', 88);
    wfLine(left, 'Коментарі: список + форма', 160);
    cols.appendChild(left); left.layoutSizingHorizontal = 'FILL';
    cols.appendChild(wf('Бічна панель: статус · клієнт · дедлайн · оновлено · опис', 288, 320));
    add(body, cols, true);
    f.appendChild(noteT);
    wrap.appendChild(f);
  }
  { // Клієнти
    const { f, body, noteT } = wfScreen('Clients', 'швидко додати клієнта');
    const cols = fr('Columns', { gap: 24, cross: 'MIN' });
    const left = fr('Left', { dir: 'VERTICAL', gap: 16, cross: 'MIN' });
    left.appendChild(wf('Заголовок «Клієнти»', 220, 40));
    for (const i of [1, 2, 3]) wfLine(left, 'Клієнт ' + i + ': ім’я · email · телефон · видалити', 72);
    cols.appendChild(left); left.layoutSizingHorizontal = 'FILL';
    cols.appendChild(wf('Форма «Новий клієнт»', 320, 380));
    add(body, cols, true);
    f.appendChild(noteT);
    wrap.appendChild(f);
  }
  { // Вхід
    const f = fr('WF/Auth', { dir: 'VERTICAL', gap: 16, main: 'CENTER', fill: 'surface', stroke: 'border-strong', w: 1440 });
    f.resize(1440, 700); f.layoutSizingHorizontal = 'FIXED'; f.layoutSizingVertical = 'FIXED';
    f.appendChild(wf('Логотип', 48, 48));
    f.appendChild(wf('Заголовок «Увійти в StatusDEV»', 340, 32));
    f.appendChild(wf('Email', 340, 52));
    f.appendChild(wf('Пароль', 340, 52));
    f.appendChild(wf('Місце під помилку', 340, 36));
    f.appendChild(wf('CTA «Увійти»', 340, 40));
    f.appendChild(wf('Посилання «Створити акаунт»', 340, 56));
    wrap.appendChild(f);
  }
  page.appendChild(wrap);
  normalize(wrap);
  figma.viewport.scrollAndZoomIntoView([wrap]);
  figma.closePlugin('03_Wireframes: 4 каркаси.');
}

// ---------- 8. 06_Mobile: портал клієнта (375 px) ----------
function mBar(w, pct) {
  const bar = fr('Progress', { main: 'MIN', fill: 'secondary', r: RADIUS.pill, clip: true });
  bar.resize(w, 10); bar.layoutSizingHorizontal = 'FIXED'; bar.layoutSizingVertical = 'FIXED';
  if (pct > 0) bar.appendChild(rect('Fill', Math.max(1, Math.round(w * pct / 100)), 10, 'success', RADIUS.pill));
  return bar;
}
function mBtn(label, kind) {
  const b = fr('Button', { main: 'CENTER', fill: kind === 'outline' ? 'bg-page' : 'primary', stroke: kind === 'outline' ? 'border-strong' : null, r: RADIUS.sm, w: 327 });
  b.resize(327, 48); b.layoutSizingHorizontal = 'FIXED'; b.layoutSizingVertical = 'FIXED'; // 48 px — зона натискання ≥ 44
  b.appendChild(tx(label, { size: 16, style: 'Medium', color: kind === 'outline' ? 'text' : 'on-primary' }));
  return b;
}
function mScreen(name) {
  const f = fr(name, { dir: 'VERTICAL', fill: 'bg-page', cross: 'MIN', w: 375 });
  const brand = fr('Brand header', { gap: 10, pad: [0, 24, 0, 24], fill: 'primary' });
  brand.resize(375, 56); brand.layoutSizingHorizontal = 'FIXED'; brand.layoutSizingVertical = 'FIXED';
  brand.appendChild(tx('Студія «Brand name»', { size: 16, style: 'Semi Bold', color: 'on-primary' }));
  f.appendChild(brand);
  const body = fr('Body', { dir: 'VERTICAL', gap: 16, pad: [24, 24, 32, 24], cross: 'MIN' });
  body.resize(375, 10); body.layoutSizingHorizontal = 'FIXED'; body.layoutSizingVertical = 'HUG';
  f.appendChild(body);
  return { f, body };
}
function mPill(sets, status) {
  const set = sets.find((s) => s.name === 'Pill/Milestone');
  if (!set) return tx(status, { size: 14 });
  const comp = set.children.find((c) => c.name === 'Status=' + status) || set.defaultVariant;
  return comp.createInstance();
}

async function mobile() {
  await loadFonts(); await loadVars();
  const ds = await getPage('04_Design_System');
  await figma.setCurrentPageAsync(ds);
  const sets = ds.findAllWithCriteria({ types: ['COMPONENT_SET'] });
  const page = await getPage('06_Mobile');
  await figma.setCurrentPageAsync(page);
  for (const n of page.children.slice()) n.remove();

  { // 1. Портал: проєкт
    const { f, body } = mScreen('Portal/Проєкт');
    body.appendChild(tx('Сайт для кав’ярні «Зерно»', { size: 24, style: 'Semi Bold', w: 327 }));
    body.appendChild(tx('Оновлено 2 дні тому', { size: 14, color: 'text-secondary' }));
    const prog = fr('Progress block', { dir: 'VERTICAL', gap: 6, cross: 'MIN' });
    prog.appendChild(mBar(327, 60));
    prog.appendChild(tx('3 з 5 етапів · наступна дата: 20 жовтня', { size: 14, color: 'text-secondary' }));
    body.appendChild(prog);
    const need = fr('Потрібно від вас', { dir: 'VERTICAL', gap: 6, pad: [14, 16, 14, 16], fill: 'action-bg', r: RADIUS.md, cross: 'MIN', w: 327 });
    need.appendChild(tx('ПОТРІБНО ВІД ВАС', { size: 12, style: 'Semi Bold', color: 'action-fg' }));
    need.appendChild(tx('Затвердити макет головної сторінки', { size: 16, style: 'Medium', color: 'action-fg', w: 295 }));
    body.appendChild(need);
    body.appendChild(tx('Етапи', { size: 18, style: 'Semi Bold' }));
    for (const [st, name] of [['Done', 'Бриф і структура'], ['Done', 'Дизайн-макети'], ['InProgress', 'Верстка головної'], ['Todo', 'Меню та кошик']]) {
      const row = fr('Етап', { dir: 'VERTICAL', gap: 6, pad: [12, 16, 12, 16], fill: 'surface', stroke: 'border', r: RADIUS.md, cross: 'MIN', w: 327 });
      row.appendChild(mPill(sets, st));
      row.appendChild(tx(name, { size: 16, style: 'Medium', color: st === 'Done' ? 'text-secondary' : 'text' }));
      body.appendChild(row);
    }
    body.appendChild(tx('Коментар', { size: 18, style: 'Semi Bold' }));
    const input = fr('Textarea', { pad: [12, 12, 12, 12], fill: 'surface', stroke: 'border-strong', r: RADIUS.sm, cross: 'MIN', w: 327 });
    input.resize(327, 96); input.layoutSizingHorizontal = 'FIXED'; input.layoutSizingVertical = 'FIXED';
    input.appendChild(tx('Напишіть, що думаєте…', { size: 16, color: 'text-secondary' }));
    body.appendChild(input);
    body.appendChild(mBtn('Надіслати'));
    body.appendChild(tx('Зроблено на StatusDEV', { size: 12, color: 'text-secondary' }));
    page.appendChild(f); place(f, page);
  }
  { // 2. Порожній стан
    const { f, body } = mScreen('Portal/Без етапів');
    body.appendChild(tx('Брендинг студії йоги', { size: 24, style: 'Semi Bold', w: 327 }));
    body.appendChild(mBar(327, 0));
    const empty = fr('Empty', { dir: 'VERTICAL', gap: 8, pad: [32, 16, 32, 16], fill: 'surface', stroke: 'border', r: RADIUS.md, w: 327 });
    empty.appendChild(tx('Етапи ще готуються', { size: 18, style: 'Semi Bold' }));
    empty.appendChild(tx('Власник скоро додасть план робіт. Загляньте пізніше.', { size: 16, color: 'text-secondary', w: 295 }));
    body.appendChild(empty);
    page.appendChild(f); place(f, page);
  }
  { // 3. Недійсне посилання
    const f = fr('Portal/Посилання недійсне', { dir: 'VERTICAL', gap: 16, pad: [96, 24, 24, 24], fill: 'bg-page', w: 375 });
    f.resize(375, 700); f.layoutSizingHorizontal = 'FIXED'; f.layoutSizingVertical = 'FIXED'; f.primaryAxisAlignItems = 'MIN';
    const mark = fr('Icon', { main: 'CENTER', fill: 'error-bg', r: RADIUS.pill });
    mark.resize(64, 64); mark.layoutSizingHorizontal = 'FIXED'; mark.layoutSizingVertical = 'FIXED';
    mark.appendChild(tx('!', { size: 28, style: 'Bold', color: 'error' }));
    f.appendChild(mark);
    f.appendChild(tx('Посилання застаріло', { size: 24, style: 'Semi Bold' }));
    f.appendChild(tx('Попросіть власника проєкту надіслати нове посилання.', { size: 16, color: 'text-secondary', w: 327 }));
    page.appendChild(f); place(f, page);
  }
  { // 4. Кабінет на телефоні
    const f = fr('Cabinet/Projects', { dir: 'VERTICAL', fill: 'bg-page', cross: 'MIN', w: 375 });
    const set = sets.find((s) => s.name === 'Header');
    const hdr = set ? set.children.find((c) => c.name === 'Device=Mobile').createInstance() : tx('Header', { size: 14 });
    f.appendChild(hdr);
    if (set) { hdr.layoutSizingHorizontal = 'FIXED'; hdr.resize(375, 56); }
    const body = fr('Body', { dir: 'VERTICAL', gap: 12, pad: [20, 24, 32, 24], cross: 'MIN' });
    body.resize(375, 10); body.layoutSizingHorizontal = 'FIXED'; body.layoutSizingVertical = 'HUG';
    f.appendChild(body);
    body.appendChild(tx('Проєкти', { size: 24, style: 'Semi Bold' }));
    body.appendChild(mBtn('Новий проєкт'));
    for (const [t, c, p] of [['Сайт для кав’ярні «Зерно»', 'Олена Коваль', 60], ['Брендинг студії йоги', 'Studio Om', 20]]) {
      const card = fr('Project item', { dir: 'VERTICAL', gap: 8, pad: [14, 16, 14, 16], fill: 'surface', stroke: 'border', r: RADIUS.md, cross: 'MIN', w: 327 });
      card.appendChild(tx(t, { size: 16, style: 'Semi Bold', color: 'primary', w: 295 }));
      card.appendChild(mBar(295, p));
      card.appendChild(tx('Клієнт: ' + c, { size: 14, color: 'text-secondary' }));
      body.appendChild(card);
    }
    page.appendChild(f); place(f, page);
  }
  for (const n of page.children) normalize(n);
  figma.viewport.scrollAndZoomIntoView(page.children);
  figma.closePlugin('06_Mobile: 3 екрани порталу (375 px) + кабінет на телефоні.');
}

// ---------- Запуск ----------
(async () => {
  try {
    if (figma.command === 'setup') await setup();
    else if (figma.command === 'components') await components();
    else if (figma.command === 'screens') await screens();
    else if (figma.command === 'audit') await audit();
    else if (figma.command === 'userflow') await userflow();
    else if (figma.command === 'sitemap') await sitemap();
    else if (figma.command === 'wireframes') await wireframes();
    else if (figma.command === 'mobile') await mobile();
    else if (figma.command === 'fix04') await fix04();
    else figma.closePlugin('Невідома команда: ' + figma.command);
  } catch (e) {
    // у повідомленні рядок стека, щоб за ним можна було знайти місце помилки
    const where = e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' | ') : '';
    figma.closePlugin('Помилка у команді «' + figma.command + '»: ' + (e && e.message ? e.message : e) + ' ' + where);
  }
})();

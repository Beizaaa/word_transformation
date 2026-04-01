/* ════════════════════════════════════════════════════════
   Word Transformations — static frontend (no server)
   Data is loaded once from words.json, everything else
   runs in the browser as pure JavaScript functions.
   ════════════════════════════════════════════════════════ */

'use strict';

// ── State ─────────────────────────────────────────────────
const state = {
  allWords:    [],
  rules:       [],
  categories:  [],
  currentEntry: null,
  quiz: { score: 0, streak: 0, total: 0, current: null, answered: false },
  activeTab: 'explorer',
  activeCategory: null,
};

// ── Category → CSS class ──────────────────────────────────
const CAT_CLASS = {
  'noun':               'cat-noun',
  'verb':               'cat-verb',
  'adjective':          'cat-adjective',
  'adverb':             'cat-adverb',
  'preposition':        'cat-preposition',
  'connector':          'cat-connector',
  'article/quantifier': 'cat-article-quantifier',
};
function catClass(cat) { return CAT_CLASS[cat?.toLowerCase()] || 'cat-article-quantifier'; }

// ── Category → SVG fill colour ────────────────────────────
const CAT_COLORS = {
  'noun':               '#3B82F6',
  'verb':               '#10B981',
  'adjective':          '#F59E0B',
  'adverb':             '#8B5CF6',
  'preposition':        '#EC4899',
  'connector':          '#06B6D4',
  'article/quantifier': '#6B7280',
};
function catColor(c) { return CAT_COLORS[c?.toLowerCase()] || '#6B7280'; }

// ── Tiny helpers ──────────────────────────────────────────
function el(id)           { return document.getElementById(id); }
function randomItem(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr)     { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function allForms(entry)  { return [{ word: entry.base, category: entry.category, example: entry.example }, ...entry.transformations]; }

/**
 * XSS sanitizer — escapes HTML special characters before any
 * value from words.json is interpolated into innerHTML.
 * Uses a detached element so no parsing ever reaches the DOM.
 */
function sanitize(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;               // browser-escaped: & < > " '
}

// ══════════════════════════════════════════════════════════
//  DATA LAYER  (replaces Flask API)
//
//  The Flask backend had 5 endpoints. Each is now a plain
//  JS function that operates on state.allWords in memory.
//  No network calls after the initial words.json load.
// ══════════════════════════════════════════════════════════

/**
 * Replaces GET /api/words?q=&category=
 * Filters the in-memory dataset by substring and/or category.
 */
function queryWords(q = '', category = '') {
  const lq  = q.toLowerCase().trim();
  const lc  = category.toLowerCase().trim();
  return state.allWords.filter(w => {
    const matchQ = !lq || w.base.toLowerCase().includes(lq)
                       || w.transformations.some(t => t.word.toLowerCase().includes(lq));
    const matchC = !lc || w.category.toLowerCase() === lc
                       || w.transformations.some(t => t.category.toLowerCase() === lc);
    return matchQ && matchC;
  });
}

/**
 * Replaces GET /api/quiz
 * Generates a random quiz question entirely in the browser.
 * Two types:
 *   identify_category  — "What category is [word]?"
 *   find_transformation — "What is the [category] form of [word]?"
 */
function generateQuiz() {
  const type = Math.random() < 0.5 ? 'identify_category' : 'find_transformation';

  if (type === 'identify_category') {
    const entry  = randomItem(state.allWords);
    const forms  = allForms(entry);
    const target = randomItem(forms);
    const correct = target.category;

    const distractors = shuffle(state.categories.filter(c => c !== correct));
    const options = shuffle([correct, ...distractors.slice(0, 3)]);

    return {
      type: 'identify_category',
      question: `What grammatical category does the word "${target.word}" belong to?`,
      word: target.word,
      options,
      correct,
      family: forms,
      base_word: entry.base,
    };
  }

  // find_transformation
  const wordsWithT = state.allWords.filter(w => w.transformations.length > 0);
  const entry      = randomItem(wordsWithT);
  const targetT    = randomItem(entry.transformations);
  const targetCat  = targetT.category;

  // Collect distractor words that share the target category
  const pool = [];
  for (const e of state.allWords) {
    for (const f of allForms(e)) {
      if (f.category === targetCat && f.word !== targetT.word) pool.push(f.word);
    }
  }
  const distractors = shuffle([...new Set(pool)]).slice(0, 3);
  // Pad if not enough distinct distractors
  while (distractors.length < 3) {
    const w = randomItem(state.allWords).base;
    if (!distractors.includes(w) && w !== targetT.word) distractors.push(w);
  }

  const options = shuffle([targetT.word, ...distractors]);
  return {
    type: 'find_transformation',
    question: `What is the ${targetCat} form of "${entry.base}"?`,
    base_word: entry.base,
    target_category: targetCat,
    options,
    correct: targetT.word,
    family: allForms(entry),
  };
}

/**
 * Replaces POST /api/quiz/check
 * Compares strings locally — no network round-trip.
 */
function checkAnswer(answer, correct) {
  const ok = answer.toLowerCase().trim() === correct.toLowerCase().trim();
  return {
    correct: ok,
    correct_answer: correct,
    message: ok ? 'Correct! Well done! 🎉' : `Not quite. The correct answer is "${correct}".`,
  };
}

// ══════════════════════════════════════════════════════════
//  LOAD  (one real network request — words.json)
// ══════════════════════════════════════════════════════════

async function loadAll() {
  try {
    const data       = await fetch('words.json').then(r => r.json());
    state.allWords   = data.words;
    state.rules      = data.rules;
    state.categories = data.categories;
  } catch (err) {
    console.error('Failed to load words.json:', err);
    document.querySelector('.main-content').innerHTML =
      '<p style="padding:2rem;color:#EF4444;">Could not load app data. Please refresh the page.</p>';
    throw err;
  }
}

// ══════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ══════════════════════════════════════════════════════════

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tab}`));
}

// ══════════════════════════════════════════════════════════
//  SVG GRAPH
// ══════════════════════════════════════════════════════════

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

function nodeHW(word) { return Math.max(42, Math.min(105, word.length * 5.5 + 20)); }

function makeSVGNode(cx, cy, word, category, isBase) {
  const hw = nodeHW(word), hh = 28, color = catColor(category);
  const g  = svgEl('g');
  if (isBase) g.setAttribute('filter', 'drop-shadow(0 4px 10px rgba(0,0,0,.22))');

  g.appendChild(svgEl('rect', {
    x: cx - hw, y: cy - hh, width: hw * 2, height: hh * 2,
    rx: hh, fill: color,
    ...(isBase ? { stroke: '#fff', 'stroke-width': 3 } : {}),
  }));

  const wt = svgEl('text', { x: cx, y: cy - 5, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: '#fff', 'font-family': "'Segoe UI',system-ui,sans-serif",
    'font-size': hw < 52 ? 11 : 13, 'font-weight': 700 });
  wt.textContent = word;
  g.appendChild(wt);

  const ct = svgEl('text', { x: cx, y: cy + 11, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
    fill: 'rgba(255,255,255,.80)', 'font-family': "'Segoe UI',system-ui,sans-serif",
    'font-size': 9.5, 'font-weight': 400 });
  ct.textContent = `(${category})`;
  g.appendChild(ct);

  if (isBase) {
    const bt = svgEl('text', { x: cx, y: cy - hh - 8, 'text-anchor': 'middle', 'dominant-baseline': 'auto',
      fill: '#94A3B8', 'font-family': "'Segoe UI',system-ui,sans-serif",
      'font-size': 9, 'font-weight': 800, 'letter-spacing': 1.5 });
    bt.textContent = 'BASE';
    g.appendChild(bt);
  }
  return g;
}

function buildGraph(entry) {
  const T = entry.transformations;
  if (!T.length) return null;

  const N = T.length, VW = 500, SLOT = 78, PAD = 46;
  const VH = Math.max(180, N * SLOT + PAD * 2);
  const LX = 108, RX = VW - 108, BY = VH / 2;

  const section = document.createElement('div');
  section.className = 'word-pipeline';
  const title = document.createElement('div');
  title.className = 'pipeline-title';
  title.textContent = 'Transformation Graph';
  section.appendChild(title);

  const svg = svgEl('svg', { viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'xMidYMid meet' });
  svg.style.cssText = `width:100%;display:block;max-height:${Math.min(VH, 520)}px;`;

  const defs = svgEl('defs');
  const marker = svgEl('marker', { id: 'gArrow', markerWidth: 10, markerHeight: 7, refX: 9, refY: 3.5, orient: 'auto' });
  marker.appendChild(svgEl('polygon', { points: '0 0, 10 3.5, 0 7', fill: '#94A3B8' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  const baseHW = nodeHW(entry.base);
  T.forEach((t, i) => {
    const ty = PAD + i * SLOT + SLOT / 2, thw = nodeHW(t.word);
    const x1 = LX + baseHW, y1 = BY, x2 = RX - thw - 12, y2 = ty, mx = (x1 + x2) / 2;
    svg.appendChild(svgEl('path', {
      d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
      stroke: '#CBD5E1', 'stroke-width': 2, fill: 'none', 'marker-end': 'url(#gArrow)',
    }));
  });

  svg.appendChild(makeSVGNode(LX, BY, entry.base, entry.category, true));
  T.forEach((t, i) => {
    const ty = PAD + i * SLOT + SLOT / 2;
    const g  = makeSVGNode(RX, ty, t.word, t.category, false);
    g.style.cursor = 'pointer';
    const rect = g.querySelector('rect');
    g.addEventListener('mouseenter', () => rect.setAttribute('opacity', '.80'));
    g.addEventListener('mouseleave', () => rect.setAttribute('opacity', '1'));
    g.addEventListener('click', () => {
      const found = state.allWords.find(e => e.base.toLowerCase() === t.word.toLowerCase());
      if (found && found.id !== entry.id) showWordCard(found);
    });
    svg.appendChild(g);
  });

  section.appendChild(svg);
  return section;
}

// ══════════════════════════════════════════════════════════
//  EXPLORER TAB
// ══════════════════════════════════════════════════════════

function showWordCard(entry) {
  state.currentEntry = entry;
  const card = el('wordCard');
  const tpl  = el('wordCardTpl').content.cloneNode(true);

  tpl.querySelector('.wc-word').textContent = entry.base;
  const b = tpl.querySelector('.wc-badge');
  b.textContent = entry.category;
  b.className = `category-badge ${catClass(entry.category)}`;
  tpl.querySelector('.wc-def').textContent = entry.definition;
  tpl.querySelector('.wc-example-base').textContent = entry.example;

  const list = tpl.querySelector('.wc-transform-list');
  if (!entry.transformations.length) {
    const note = document.createElement('p');
    note.style.cssText = 'color:var(--text-muted);font-size:.85rem;';
    note.textContent = 'This is a functional word with no standard transformations.';
    list.appendChild(note);
  } else {
    entry.transformations.forEach(t => {
      const item = document.createElement('div');
      item.className = `transform-item ${catClass(t.category)}`;
      item.innerHTML = `
        <div class="ti-top">
          <span class="ti-word">${sanitize(t.word)}</span>
          <span class="category-badge ${catClass(t.category)}">${sanitize(t.category)}</span>
        </div>
        <div class="ti-example">${sanitize(t.example)}</div>`;
      item.addEventListener('click', () => {
        const found = state.allWords.find(e => e.base.toLowerCase() === t.word.toLowerCase());
        if (found && found.id !== entry.id) showWordCard(found);
      });
      list.appendChild(item);
    });
  }

  card.innerHTML = '';
  card.appendChild(tpl);
  if (entry.transformations.length) {
    const graph = buildGraph(entry);
    if (graph) card.insertBefore(graph, card.querySelector('.wc-transforms'));
  }
  card.classList.remove('hidden');
  el('explorerHero').classList.add('hidden');
  el('wordCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderExplorerGrid(words) {
  const grid = el('explorerGrid');
  grid.innerHTML = '';
  words.forEach(entry => {
    const div = document.createElement('div');
    div.className = `eg-card ${catClass(entry.category)}`;
    div.innerHTML = `
      <div class="eg-word">${sanitize(entry.base)}
        <span class="category-badge ${catClass(entry.category)} badge-sm">${sanitize(entry.category)}</span>
      </div>
      <div class="eg-family-count">${entry.transformations.length} form${entry.transformations.length !== 1 ? 's' : ''}</div>`;
    div.addEventListener('click', () => showWordCard(entry));
    grid.appendChild(div);
  });
}

function populateFeaturedPills() {
  const featured = ['help','work','play','create','learn','happy','strong','free','real','change','good','think','beauty','develop','care'];
  const container = el('featuredPills');
  featured.forEach(word => {
    const entry = state.allWords.find(e => e.base === word);
    if (!entry) return;
    const pill = document.createElement('button');
    pill.className = 'featured-pill';
    pill.textContent = word;
    pill.addEventListener('click', () => { switchTab('explorer'); showWordCard(entry); });
    container.appendChild(pill);
  });
}

// ── Search (uses queryWords instead of fetch) ─────────────
function initSearch() {
  const input = el('searchInput'), dropdown = el('searchDropdown');
  let timer;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { dropdown.classList.add('hidden'); return; }
    // Debounce 150 ms then filter in memory (synchronous, instant)
    timer = setTimeout(() => renderSearchDropdown(queryWords(q), q, dropdown), 150);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { dropdown.classList.add('hidden'); input.blur(); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrap')) dropdown.classList.add('hidden');
  });
}

function renderSearchDropdown(results, q, dropdown) {
  dropdown.innerHTML = '';
  if (!results.length) {
    dropdown.innerHTML = '<div style="padding:.75rem 1rem;color:var(--text-muted);font-size:.85rem;">No words found.</div>';
    dropdown.classList.remove('hidden');
    return;
  }
  const lq = q.toLowerCase();
  results.slice(0, 12).forEach(entry => {
    allForms(entry).filter(f => f.word.toLowerCase().includes(lq)).forEach(f => {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <span class="category-badge ${catClass(f.category)}">${sanitize(f.category)}</span>
        <span class="si-word">${sanitize(f.word)}</span>
        <span class="si-def">${f.word === entry.base ? sanitize(entry.definition) : `form of &#34;${sanitize(entry.base)}&#34;`}</span>`;
      item.addEventListener('click', () => {
        el('searchInput').value = f.word;
        dropdown.classList.add('hidden');
        switchTab('explorer');
        showWordCard(entry);
      });
      dropdown.appendChild(item);
    });
  });
  dropdown.classList.remove('hidden');
}

// ══════════════════════════════════════════════════════════
//  CATEGORIES TAB
// ══════════════════════════════════════════════════════════

function initCategoriesTab() {
  const container = el('catButtons');
  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-btn ${catClass(cat)}`;
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCategoryWords(queryWords('', cat), cat);
    });
    container.appendChild(btn);
  });
}

function renderCategoryWords(words, category) {
  const list = el('catWordList');
  list.innerHTML = '';
  const items = [];
  words.forEach(entry => {
    allForms(entry).forEach(f => { if (f.category === category) items.push({ form: f, entry }); });
  });
  if (!items.length) { list.innerHTML = '<p style="color:var(--text-muted)">No words found.</p>'; return; }
  items.forEach(({ form, entry }) => {
    const isBase = form.word === entry.base;
    const div = document.createElement('div');
    div.className = `cw-item ${catClass(category)}`;
    div.innerHTML = `
      <div class="cw-word">${sanitize(form.word)}${!isBase ? `<span class="parent-ref"> ← ${sanitize(entry.base)}</span>` : ''}</div>
      <div class="cw-def">${isBase ? sanitize(entry.definition) : `${sanitize(category)} form of &#34;${sanitize(entry.base)}&#34;`}</div>
      <div class="cw-example">${sanitize(form.example)}</div>`;
    div.addEventListener('click', () => { switchTab('explorer'); showWordCard(entry); });
    list.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════════
//  SIDEBAR — Rules
// ══════════════════════════════════════════════════════════

function initSidebar() {
  const toggle = el('sidebarToggle'), content = el('sidebarContent'), sidebar = document.querySelector('.sidebar');
  toggle.addEventListener('click', () => {
    const open = !content.classList.contains('collapsed');
    content.classList.toggle('collapsed', open);
    sidebar.classList.toggle('open', !open);
  });
}

function renderRules() {
  const container = el('rulesList');
  state.rules.forEach(rule => {
    const div = document.createElement('div');
    div.className = 'rule-item';
    const exHtml = rule.examples.map(ex =>
      `<span class="rule-ex">${sanitize(ex.from)}<span class="arrow">&#8594;</span>${sanitize(ex.to)}</span>`
    ).join('');
    div.innerHTML = `
      <div class="rule-tag">${sanitize(rule.rule)}</div>
      <div class="rule-desc">${sanitize(rule.description)}</div>
      <div class="rule-examples">${exHtml}</div>`;
    container.appendChild(div);
  });
}

// ══════════════════════════════════════════════════════════
//  QUIZ TAB
// ══════════════════════════════════════════════════════════

function updateScoreBar() {
  el('scoreNum').textContent  = state.quiz.score;
  el('streakNum').textContent = state.quiz.streak;
  el('totalNum').textContent  = state.quiz.total;
}

function loadNextQuiz() {
  el('quizOptions').innerHTML = '';
  el('quizFeedback').className = 'quiz-feedback hidden';
  el('quizFeedback').textContent = '';
  el('quizFamily').classList.add('hidden');

  // generateQuiz() is now synchronous — no await needed
  const q = generateQuiz();
  state.quiz.current  = q;
  state.quiz.answered = false;

  el('quizQuestion').textContent = q.question;
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => submitAnswer(opt));
    el('quizOptions').appendChild(btn);
  });
}

function submitAnswer(answer) {
  if (state.quiz.answered) return;
  state.quiz.answered = true;

  const q   = state.quiz.current;
  // checkAnswer() is synchronous — no network round-trip
  const res = checkAnswer(answer, q.correct);

  state.quiz.total++;
  if (res.correct) { state.quiz.score++; state.quiz.streak++; }
  else             { state.quiz.streak = 0; }
  updateScoreBar();

  document.querySelectorAll('.quiz-option').forEach(btn => {
    btn.disabled = true;
    if (btn.textContent === q.correct)                    btn.classList.add('correct');
    else if (btn.textContent === answer && !res.correct)  btn.classList.add('incorrect');
  });

  const fb = el('quizFeedback');
  fb.textContent = res.message;
  fb.className   = `quiz-feedback ${res.correct ? 'correct-fb' : 'incorrect-fb'}`;
  renderQuizFamily(q.family);
}

function renderQuizFamily(family) {
  const container = el('quizFamily');
  container.classList.remove('hidden');
  container.innerHTML = '<h4>Word Family</h4>';
  const chips = document.createElement('div');
  chips.className = 'qf-chips';
  family.forEach(f => {
    const chip = document.createElement('div');
    chip.className = `qf-chip ${catClass(f.category)}`;
    chip.innerHTML = `<span class="qf-word">${sanitize(f.word)}</span><span class="category-badge ${catClass(f.category)} badge-sm">${sanitize(f.category)}</span>`;
    chips.appendChild(chip);
  });
  container.appendChild(chips);
}

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════

async function init() {
  await loadAll();                       // single fetch: words.json

  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  populateFeaturedPills();
  initSidebar();
  renderRules();
  initCategoriesTab();
  initSearch();

  el('nextQuiz').addEventListener('click', loadNextQuiz);
  el('resetScore').addEventListener('click', () => {
    state.quiz.score = state.quiz.streak = state.quiz.total = 0;
    updateScoreBar();
  });
  updateScoreBar();
  renderExplorerGrid(state.allWords.filter(w => w.transformations.length > 0));
}

document.addEventListener('DOMContentLoaded', init);

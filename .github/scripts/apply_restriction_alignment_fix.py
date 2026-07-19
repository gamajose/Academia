from pathlib import Path

ui_path = Path('apps/web/training-review-ui.js')
ui = ui_path.read_text(encoding='utf-8')

old_clean = """  function cleanEvidence(values) {
    return (Array.isArray(values) ? values : [])
      .map(humanizeText)
      .filter(Boolean)
      .filter((value) => !/^Restrição cadastrada \\d+$/i.test(value));
  }
"""
new_clean = """  const EMPTY_RESTRICTION_EVIDENCE = new Set([
    'sem restricao informada',
    'sem restricoes informadas',
    'nenhuma restricao informada',
    'nenhuma restricao cadastrada',
    'nao possui restricao',
    'nao possui restricoes',
    'nao informado',
    'nao informada',
    'nenhum',
    'nenhuma'
  ]);

  function normalizedEvidence(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase()
      .replace(/[.!?;:]+$/g, '')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function isEmptyRestrictionEvidence(value) {
    const normalized = normalizedEvidence(value);
    if (!normalized.startsWith('restricao informada:')) return false;
    const detail = normalized.slice('restricao informada:'.length).trim();
    return EMPTY_RESTRICTION_EVIDENCE.has(detail);
  }

  function cleanEvidence(values) {
    return (Array.isArray(values) ? values : [])
      .map(humanizeText)
      .filter(Boolean)
      .filter((value) => !/^Restrição cadastrada \\d+$/i.test(value))
      .filter((value) => !isEmptyRestrictionEvidence(value));
  }
"""
if old_clean not in ui:
    raise SystemExit('cleanEvidence marker not found')
ui = ui.replace(old_clean, new_clean, 1)

old_grid = """      grid.replaceChildren(...cards);
      grid.classList.toggle('hidden', cards.length === 0);
"""
new_grid = """      grid.replaceChildren(...cards);
      grid.dataset.layout = cards.length === 1
        ? 'single'
        : cards.length === 3
          ? 'triple'
          : 'double';
      grid.classList.toggle('hidden', cards.length === 0);
"""
if old_grid not in ui:
    raise SystemExit('data grid marker not found')
ui = ui.replace(old_grid, new_grid, 1)
ui_path.write_text(ui, encoding='utf-8')

css_path = Path('apps/web/training-review-premium.css')
css = css_path.read_text(encoding='utf-8')
css += """

/* Mantém os indicadores com largura e altura consistentes. */
.training-review-data-grid {
  grid-auto-rows: 1fr;
  align-items: stretch;
}

.training-review-data-grid[data-layout="single"] {
  grid-template-columns: minmax(0, 1fr);
}

.training-review-data-grid[data-layout="double"] {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.training-review-data-grid[data-layout="triple"] {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.training-review-data-card {
  height: 100%;
  min-height: 184px;
  align-content: start;
}

.training-review-next-grid {
  grid-auto-rows: 1fr;
  align-items: stretch;
}

.training-review-next-card {
  height: 100%;
}

@media (max-width: 860px) {
  .training-review-data-grid[data-layout="triple"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .training-review-data-grid[data-layout="single"],
  .training-review-data-grid[data-layout="double"],
  .training-review-data-grid[data-layout="triple"] {
    grid-template-columns: 1fr;
  }

  .training-review-data-card {
    min-height: 0;
  }
}
"""
css_path.write_text(css, encoding='utf-8')

ui_test_path = Path('apps/api/test/trainingReviewUi.test.js')
ui_test = ui_test_path.read_text(encoding='utf-8')
old_test = """test('remove evidência genérica e interpreta indicadores visuais', () => {
  assert.deepEqual(
    cleanEvidence(['Restrição cadastrada 1', 'Restrição informada: dor no joelho']),
    ['Restrição informada: dor no joelho']
  );
"""
new_test = """test('remove evidência genérica e marcadores de ausência de restrição', () => {
  assert.deepEqual(
    cleanEvidence([
      'Restrição cadastrada 1',
      'Restrição informada: Sem restrições informadas',
      'Restrição informada: dor no joelho'
    ]),
    ['Restrição informada: dor no joelho']
  );
"""
if old_test not in ui_test:
    raise SystemExit('ui test marker not found')
ui_test = ui_test.replace(old_test, new_test, 1)
ui_test_path.write_text(ui_test, encoding='utf-8')

review_test_path = Path('apps/api/test/trainingReview.test.js')
review_test = review_test_path.read_text(encoding='utf-8')
review_test = review_test.replace(
    "  cleanText,\n  anonymizedMemberId",
    "  cleanText,\n  normalizeRestriction,\n  anonymizedMemberId",
    1
)
marker = """test('gera análise local com Structured Outputs e sem aplicar mudanças', async () => {
"""
addition = """test('ignora textos que apenas informam ausência de restrições', () => {
  assert.equal(normalizeRestriction('Sem restrições informadas'), null);
  assert.equal(normalizeRestriction('Nenhuma restrição cadastrada.'), null);
  assert.equal(normalizeRestriction('Dor no joelho direito'), 'Dor no joelho direito');

  const data = snapshot({ restrictions: ['Sem restrições informadas'] });
  const result = rules(data);
  assert.equal(result.signals.some((item) => item.type === 'restriction'), false);
});

"""
if marker not in review_test:
    raise SystemExit('review test marker not found')
review_test = review_test.replace(marker, addition + marker, 1)
review_test_path.write_text(review_test, encoding='utf-8')

from pathlib import Path

path = Path('apps/web/training-review-ui.js')
text = path.read_text(encoding='utf-8')

inside_block = """    const NON_RECOVERABLE_ERRORS = new Set([
      'aguarde_nova_analise',
      'limite_horario_atingido',
      'sem_permissao',
      'ficha_nao_encontrada',
      'plan_id_obrigatorio'
    ]);

    function shouldAttemptRecovery(error) {
      return !NON_RECOVERABLE_ERRORS.has(String(error?.message || error || ''));
    }

    function wait(milliseconds) {
"""
inside_replacement = """    function wait(milliseconds) {
"""
if inside_block not in text:
    raise SystemExit('bloco_interno_recuperacao_nao_encontrado')
text = text.replace(inside_block, inside_replacement, 1)

install_marker = """  function install(windowObject) {
"""
top_level_block = """  const NON_RECOVERABLE_ERRORS = new Set([
    'aguarde_nova_analise',
    'limite_horario_atingido',
    'sem_permissao',
    'ficha_nao_encontrada',
    'plan_id_obrigatorio'
  ]);

  function shouldAttemptRecovery(error) {
    return !NON_RECOVERABLE_ERRORS.has(String(error?.message || error || ''));
  }

  function install(windowObject) {
"""
if install_marker not in text:
    raise SystemExit('marcador_install_nao_encontrado')
text = text.replace(install_marker, top_level_block, 1)
path.write_text(text, encoding='utf-8')

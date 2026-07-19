const crypto = require('crypto');

const STATUS = ['maintain', 'adjust', 'replace_partially', 'professional_review'];
const SIGNAL_TYPES = ['adherence', 'effort', 'progression', 'assessment', 'restriction', 'balance', 'recovery'];
const SEVERITIES = ['info', 'attention', 'critical'];
const SUGGESTION_TYPES = ['keep_plan', 'adjust_volume', 'adjust_rest', 'progress_load', 'replace_exercise', 'reduce_load', 'professional_review'];
const PRIORITIES = ['low', 'medium', 'high'];
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const UUID_RE = new RegExp(UUID_PATTERN);
const UNSAFE_NARRATIVE_RE = /<[^>]+>|https?:\/\/|www\.|diagn[oó]stic|prescrev|medicament|rem[eé]dio|horm[oô]n|anabolizante|subst[aâ]ncia|dosagem|\b\d+\s*mg\b/i;

const nullableString = (maxLength) => ({ anyOf: [{ type: 'string', maxLength }, { type: 'null' }] });
const nullableInteger = (minimum, maximum) => ({ anyOf: [{ type: 'integer', minimum, maximum }, { type: 'null' }] });
const nullableUuid = { anyOf: [{ type: 'string', pattern: UUID_PATTERN }, { type: 'null' }] };

const TRAINING_NARRATIVE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'student_message', 'trainer_notes'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 180 },
    student_message: { type: 'string', minLength: 1, maxLength: 180 },
    trainer_notes: { type: 'string', minLength: 1, maxLength: 300 }
  }
};

const TRAINING_REVIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'status', 'confidence', 'requires_human_review', 'signals', 'suggestions', 'student_message', 'trainer_notes'],
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 600 },
    status: { type: 'string', enum: STATUS },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    requires_human_review: { type: 'boolean' },
    signals: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'severity', 'description', 'evidence'],
        properties: {
          type: { type: 'string', enum: SIGNAL_TYPES },
          severity: { type: 'string', enum: SEVERITIES },
          description: { type: 'string', minLength: 1, maxLength: 400 },
          evidence: {
            type: 'array',
            maxItems: 6,
            items: { type: 'string', minLength: 1, maxLength: 240 }
          }
        }
      }
    },
    suggestions: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'type', 'priority', 'muscle_group', 'current_exercise_id', 'current_exercise',
          'suggested_exercise_id', 'suggested_exercise', 'suggested_action', 'reason',
          'target_sets', 'target_reps', 'target_rest_seconds'
        ],
        properties: {
          type: { type: 'string', enum: SUGGESTION_TYPES },
          priority: { type: 'string', enum: PRIORITIES },
          muscle_group: nullableString(120),
          current_exercise_id: nullableUuid,
          current_exercise: nullableString(160),
          suggested_exercise_id: nullableUuid,
          suggested_exercise: nullableString(160),
          suggested_action: { type: 'string', minLength: 1, maxLength: 500 },
          reason: { type: 'string', minLength: 1, maxLength: 500 },
          target_sets: nullableInteger(1, 10),
          target_reps: nullableString(40),
          target_rest_seconds: nullableInteger(15, 600)
        }
      }
    },
    student_message: { type: 'string', minLength: 1, maxLength: 500 },
    trainer_notes: { type: 'string', minLength: 1, maxLength: 1200 }
  }
};

function assert(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

function string(value, code, min, max) {
  assert(typeof value === 'string', code);
  const result = value.trim();
  assert(result.length >= min && result.length <= max, code);
  return result;
}

function safeNarrative(value, code, max) {
  const result = string(value, code, 1, max);
  assert(!UNSAFE_NARRATIVE_RE.test(result), 'conteudo_narrativo_inseguro');
  return result;
}

function nullableText(value, code, max) {
  if (value === null) return null;
  return string(value, code, 1, max);
}

function nullableId(value, code, allowed) {
  if (value === null) return null;
  assert(typeof value === 'string' && UUID_RE.test(value), code);
  assert(allowed.has(value), code);
  return value;
}

function validateTrainingNarrative(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'narrativa_invalida');
  const allowed = new Set(TRAINING_NARRATIVE_JSON_SCHEMA.required);
  assert(Object.keys(input).every((key) => allowed.has(key)), 'narrativa_campo_nao_permitido');
  assert([...allowed].every((key) => Object.prototype.hasOwnProperty.call(input, key)), 'narrativa_incompleta');
  return {
    summary: safeNarrative(input.summary, 'resumo_narrativo_invalido', 180),
    student_message: safeNarrative(input.student_message, 'mensagem_aluno_invalida', 180),
    trainer_notes: safeNarrative(input.trainer_notes, 'notas_profissional_invalidas', 300)
  };
}

function validateTrainingReview(input, context = {}) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'resposta_invalida');
  const allowedKeys = new Set(TRAINING_REVIEW_JSON_SCHEMA.required);
  assert(Object.keys(input).every((key) => allowedKeys.has(key)), 'campo_nao_permitido');
  const planExercises = new Map((context.planExercises || []).map((item) => [String(item.exercise_id), item]));
  const catalog = new Map((context.catalog || []).map((item) => [String(item.id), item]));
  const result = {
    summary: string(input.summary, 'resumo_invalido', 1, 600),
    status: input.status,
    confidence: Number(input.confidence),
    requires_human_review: input.requires_human_review,
    signals: [],
    suggestions: [],
    student_message: string(input.student_message, 'mensagem_aluno_invalida', 1, 500),
    trainer_notes: string(input.trainer_notes, 'notas_profissional_invalidas', 1, 1200)
  };
  assert(STATUS.includes(result.status), 'status_invalido');
  assert(Number.isFinite(result.confidence) && result.confidence >= 0 && result.confidence <= 1, 'confianca_invalida');
  assert(typeof result.requires_human_review === 'boolean', 'revisao_humana_invalida');
  assert(Array.isArray(input.signals) && input.signals.length <= 12, 'sinais_invalidos');
  assert(Array.isArray(input.suggestions) && input.suggestions.length <= 10, 'sugestoes_invalidas');

  result.signals = input.signals.map((item) => {
    assert(item && typeof item === 'object' && !Array.isArray(item), 'sinal_invalido');
    assert(Object.keys(item).every((key) => ['type', 'severity', 'description', 'evidence'].includes(key)), 'sinal_campo_invalido');
    assert(SIGNAL_TYPES.includes(item.type), 'tipo_sinal_invalido');
    assert(SEVERITIES.includes(item.severity), 'severidade_invalida');
    assert(Array.isArray(item.evidence) && item.evidence.length <= 6, 'evidencias_invalidas');
    return {
      type: item.type,
      severity: item.severity,
      description: string(item.description, 'descricao_sinal_invalida', 1, 400),
      evidence: item.evidence.map((value) => string(value, 'evidencia_invalida', 1, 240))
    };
  });

  result.suggestions = input.suggestions.map((item) => {
    const allowed = [
      'type', 'priority', 'muscle_group', 'current_exercise_id', 'current_exercise',
      'suggested_exercise_id', 'suggested_exercise', 'suggested_action', 'reason',
      'target_sets', 'target_reps', 'target_rest_seconds'
    ];
    assert(item && typeof item === 'object' && Object.keys(item).every((key) => allowed.includes(key)), 'sugestao_invalida');
    assert(SUGGESTION_TYPES.includes(item.type), 'tipo_sugestao_invalido');
    assert(PRIORITIES.includes(item.priority), 'prioridade_invalida');
    const currentId = nullableId(item.current_exercise_id, 'exercicio_atual_invalido', new Set(planExercises.keys()));
    const suggestedId = nullableId(item.suggested_exercise_id, 'exercicio_sugerido_invalido', new Set(catalog.keys()));
    const targetSets = item.target_sets === null ? null : Number(item.target_sets);
    const targetRest = item.target_rest_seconds === null ? null : Number(item.target_rest_seconds);
    assert(targetSets === null || (Number.isInteger(targetSets) && targetSets >= 1 && targetSets <= 10), 'series_invalidas');
    assert(targetRest === null || (Number.isInteger(targetRest) && targetRest >= 15 && targetRest <= 600), 'descanso_invalido');
    const current = currentId ? planExercises.get(currentId) : null;
    const suggested = suggestedId ? catalog.get(suggestedId) : null;
    return {
      type: item.type,
      priority: item.priority,
      muscle_group: nullableText(item.muscle_group, 'grupo_muscular_invalido', 120),
      current_exercise_id: currentId,
      current_exercise: current ? String(current.exercise_name || current.name).slice(0, 160) : nullableText(item.current_exercise, 'exercicio_atual_nome_invalido', 160),
      suggested_exercise_id: suggestedId,
      suggested_exercise: suggested ? String(suggested.name).slice(0, 160) : nullableText(item.suggested_exercise, 'exercicio_sugerido_nome_invalido', 160),
      suggested_action: string(item.suggested_action, 'acao_sugerida_invalida', 1, 500),
      reason: string(item.reason, 'motivo_invalido', 1, 500),
      target_sets: targetSets,
      target_reps: nullableText(item.target_reps, 'repeticoes_invalidas', 40),
      target_rest_seconds: targetRest
    };
  });
  return result;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

module.exports = {
  TRAINING_NARRATIVE_JSON_SCHEMA,
  TRAINING_REVIEW_JSON_SCHEMA,
  STATUS,
  SIGNAL_TYPES,
  SEVERITIES,
  SUGGESTION_TYPES,
  PRIORITIES,
  validateTrainingNarrative,
  validateTrainingReview,
  stableHash
};
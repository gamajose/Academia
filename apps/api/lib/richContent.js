const sanitizeHtml = require('sanitize-html');

const MAX_RICH_CONTENT_BYTES = 300000;
const richTags = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'span', 'div',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li',
  'a', 'hr', 'img', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'caption', 'colgroup', 'col'
];
const richAttributes = {
  '*': ['style', 'class'],
  a: ['href', 'target', 'rel', 'title'],
  img: ['src', 'alt', 'width', 'height', 'title'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan']
};
const color = /^(#[0-9a-f]{3,8}|rgb\([0-9 ,.]+\)|rgba\([0-9 ,.]+\))$/i;

function contentError(code, field) {
  const error = new Error(code);
  error.code = code;
  error.field = field;
  return error;
}

function sanitizeRichHtml(value, field = 'content') {
  const raw = String(value || '');
  if (Buffer.byteLength(raw, 'utf8') > MAX_RICH_CONTENT_BYTES) throw contentError('conteudo_muito_grande', field);
  if (/\b(?:href|src)\s*=\s*["']\s*(?:javascript:|vbscript:|data:)/i.test(raw)) throw contentError('link_inseguro', field);

  return sanitizeHtml(raw, {
    allowedTags: richTags,
    allowedAttributes: richAttributes,
    allowedStyles: {
      '*': {
        'text-align': [/^(left|center|right|justify)$/],
        'font-family': [/^[a-z0-9 ,"'-]+$/i],
        'font-size': [/^\d+(px|pt|em|rem|%)$/],
        color: [color],
        'background-color': [color]
      }
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https']
    },
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    allowVulnerableTags: false,
    enforceHtmlBoundary: true
  }).trim();
}

function sanitizeRichFields(input, fields) {
  const values = {};
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    values[field] = sanitizeRichHtml(input[field], field);
  }
  return values;
}

module.exports = { MAX_RICH_CONTENT_BYTES, sanitizeRichHtml, sanitizeRichFields };

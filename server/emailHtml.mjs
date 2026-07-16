import sanitizeHtml from 'sanitize-html';

const allowedImageDataUrl = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export function sanitizeEmailHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
      'ul', 'ol', 'li', 'a', 'img', 'h1', 'h2', 'h3', 'h4',
      'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'font'
    ],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      font: ['face', 'size', 'color'],
      p: ['align'],
      div: ['align']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'cid', 'data']
    },
    allowedStyles: {
      '*': {
        color: [/^(?:#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i],
        'background-color': [/^(?:#[0-9a-f]{3,8}|rgba?\([^)]+\)|[a-z]+)$/i],
        'font-family': [/^[a-z0-9\s"',.-]+$/i],
        'font-size': [/^\d+(?:\.\d+)?(?:px|pt|em|rem|%)$/i],
        'font-weight': [/^(?:normal|bold|[1-9]00)$/i],
        'font-style': [/^(?:normal|italic)$/i],
        'text-decoration': [/^(?:none|underline|line-through)$/i],
        'text-align': [/^(?:left|center|right|justify)$/i]
      }
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: 'a',
        attribs: {
          ...attribs,
          ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {})
        }
      }),
      img: (_tagName, attribs) => {
        const source = String(attribs.src || '');
        const validSource = !source.startsWith('data:') || allowedImageDataUrl.test(source);
        return {
          tagName: 'img',
          attribs: {
            ...attribs,
            ...(validSource ? {} : { src: '' })
          }
        };
      }
    },
    exclusiveFilter(frame) {
      return frame.tag === 'img' && !frame.attribs.src;
    }
  });
}

export function emailHtmlToText(value) {
  const withBreaks = String(value || '')
    .replace(/<(?:br)\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-4]|li|blockquote|tr)>/gi, '\n');
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

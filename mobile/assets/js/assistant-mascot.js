// Along mobile — 小游 / Along, the assistant's character. Inline SVG so it inherits page
// motion settings and needs no network. Expressions and actions are switched with data-e / data-a.

const K = '#1B1813', A = '#B24A2C', S = '#5F6F5A', G = '#D9A441', M = '#6E2A1B', P = '#F7F2E8';
const HEART = 'M0 6 C-8 0 -8 -6 -4 -7 C-2 -7.5 0 -6 0 -4 C0 -6 2 -7.5 4 -7 C8 -6 8 0 0 6 Z';
const STAR = 'M0 -8 L2.12 -2.91 L7.61 -2.47 L3.42 1.11 L4.7 6.47 L0 3.6 L-4.7 6.47 L-3.42 1.11 L-7.61 -2.47 L-2.12 -2.91 Z';
const SPARK = 'M0 -9 Q1.6 -1.6 9 0 Q1.6 1.6 0 9 Q-1.6 1.6 -9 0 Q-1.6 -1.6 0 -9 Z';
const BODY = 'M100 74 C150 74 160 116 158 152 C156 188 134 202 100 202 C66 202 44 188 42 152 C40 116 50 74 100 74 Z';
const SCARF = 'M50 125 C72 138 128 138 150 125 C153.6 129.4 154 136.4 151 141 C128 154 72 154 49 141 C46 136.4 46.4 129.4 50 125 Z';
const ln = `fill="none" stroke="${K}" stroke-linecap="round" stroke-linejoin="round"`;

export const MASCOT_EXPRESSIONS = ['normal', 'happy', 'wink', 'surprised', 'excited', 'love', 'thinking', 'sleepy', 'sorry', 'proud'];
export const MASCOT_ACTIONS = ['idle', 'wave', 'talk', 'listen', 'think', 'nod', 'guide', 'jump', 'cheer'];

// One shared <defs> block per document; the id prefix keeps it clear of page ids.
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <radialGradient id="xy-body" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#FBF6EC"/><stop offset="1" stop-color="#E9DFCD"/></radialGradient>
  <linearGradient id="xy-hat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C85A39"/><stop offset="1" stop-color="#9A3D23"/></linearGradient>
  <linearGradient id="xy-brim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C35535"/><stop offset=".6" stop-color="#A84426"/><stop offset="1" stop-color="#8C3820"/></linearGradient>
  <linearGradient id="xy-scarf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E8068"/><stop offset="1" stop-color="#4F5E4A"/></linearGradient>
  <linearGradient id="xy-scarf-back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#58684F"/><stop offset="1" stop-color="#3F4B3A"/></linearGradient>
  <radialGradient id="xy-knot" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#7A8C73"/><stop offset=".6" stop-color="#5F6F5A"/><stop offset="1" stop-color="#46543F"/></radialGradient>
  <linearGradient id="xy-wrap" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1E271C" stop-opacity=".42"/><stop offset=".12" stop-color="#1E271C" stop-opacity="0"/><stop offset=".88" stop-color="#1E271C" stop-opacity="0"/><stop offset="1" stop-color="#1E271C" stop-opacity=".42"/></linearGradient>
  <pattern id="xy-rib" width="4.2" height="12" patternUnits="userSpaceOnUse"><path d="M2.1 0 V12" stroke="#25301F" stroke-width=".8" opacity=".13"/></pattern>
  <pattern id="xy-weave" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 3 H6" stroke="#7A2E1A" stroke-width=".9" opacity=".22"/></pattern>
  <linearGradient id="xy-bag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B08D63"/><stop offset="1" stop-color="#83663F"/></linearGradient>
  <linearGradient id="xy-shoe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C05433"/><stop offset="1" stop-color="#8E3A21"/></linearGradient>
  <radialGradient id="xy-blush" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#EE9C86" stop-opacity=".95"/><stop offset="1" stop-color="#EE9C86" stop-opacity="0"/></radialGradient>
  <radialGradient id="xy-shadow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#3C2A14" stop-opacity=".34"/><stop offset="1" stop-color="#3C2A14" stop-opacity="0"/></radialGradient>
</defs></svg>`;

export function ensureMascotDefs(doc = document) {
  if (doc.getElementById('xy-body')) return;
  const host = doc.createElement('div');
  host.innerHTML = DEFS;
  doc.body.append(host.firstElementChild);
}

const PARTS = `
<ellipse class="p-shadow" cx="100" cy="208" rx="50" ry="8" fill="url(#xy-shadow)"/>
<g class="p-all">
  <g class="p-body">
    <g transform="translate(140 122)"><rect width="30" height="52" rx="12" fill="url(#xy-bag)" stroke="${K}" stroke-width="3"/><path d="M5 20 H25" stroke="${K}" stroke-width="2" stroke-linecap="round" opacity=".55"/><rect x="12" y="17" width="6" height="7" rx="1.5" fill="${G}" stroke="${K}" stroke-width="1.6"/></g>
    <ellipse cx="80" cy="201" rx="13.5" ry="7.5" fill="url(#xy-shoe)" stroke="${K}" stroke-width="2.8"/>
    <ellipse cx="120" cy="201" rx="13.5" ry="7.5" fill="url(#xy-shoe)" stroke="${K}" stroke-width="2.8"/>
    <g class="p-armL"><ellipse cx="37" cy="152" rx="10" ry="17" transform="rotate(28 37 152)" fill="url(#xy-body)" stroke="${K}" stroke-width="3.2"/></g>
    <g class="p-armR"><ellipse cx="163" cy="152" rx="10" ry="17" transform="rotate(-28 163 152)" fill="url(#xy-body)" stroke="${K}" stroke-width="3.2"/></g>
    <path d="${BODY}" fill="url(#xy-body)" stroke="${K}" stroke-width="3.2"/>
    <path d="M58 104 C62 88 74 80 86 78" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <path d="M148 168 C142 186 124 196 104 197" fill="none" stroke="#D8CBB4" stroke-width="4" stroke-linecap="round" opacity=".7"/>
    <path d="${SCARF}" fill="url(#xy-scarf)"/><path d="${SCARF}" fill="url(#xy-rib)"/><path d="${SCARF}" fill="url(#xy-wrap)"/>
    <path d="M55 128.4 C77 139.6 123 139.6 145 128.4" fill="none" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round" opacity=".32"/>
    <path d="${SCARF}" fill="none" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/>
    <g class="p-tail">
      <path d="M123 145 C127.5 153.5 131.6 160.6 136.4 166.6 L139.4 168.2 L137.4 170.8 L139.8 173.6 L136.4 174.2 L137.2 177.2 L133.8 176 L132.6 178.4 L130.4 175.4 C128.4 166.2 125.8 157 120.4 147 Z" fill="url(#xy-scarf-back)" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M116 144 C113.5 155 112.6 165 114 174.5 L115.5 177.6 L117 174.4 L118.6 178.1 L120.2 174.4 L121.8 178.1 L123.4 174.2 L125 177.7 L126.4 173.6 C126 163 125.8 154 126.6 144 Z" fill="url(#xy-scarf)" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/>
    </g>
    <path d="M113 136 C112 130 125 128.5 128 134 C130.6 139 128.4 147.6 121.2 148 C114.6 148.3 113.6 141 113 136 Z" fill="url(#xy-knot)" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/>
  </g>
  <g class="p-head">
    <ellipse class="blush" cx="69" cy="121" rx="12" ry="7" fill="url(#xy-blush)" opacity=".8"/>
    <ellipse class="blush" cx="131" cy="121" rx="12" ry="7" fill="url(#xy-blush)" opacity=".8"/>
    <g class="eyes">
      <g class="eye e-normal"><ellipse cx="82" cy="108" rx="5.8" ry="7.4" fill="${K}"/><ellipse cx="118" cy="108" rx="5.8" ry="7.4" fill="${K}"/><circle cx="84.2" cy="104.6" r="2.1" fill="#fff"/><circle cx="120.2" cy="104.6" r="2.1" fill="#fff"/></g>
      <g class="eye e-happy" ${ln} stroke-width="3.8"><path d="M74 110 Q82 100.5 90 110"/><path d="M110 110 Q118 100.5 126 110"/></g>
      <g class="eye e-wink"><ellipse cx="82" cy="108" rx="5.8" ry="7.4" fill="${K}"/><circle cx="84.2" cy="104.6" r="2.1" fill="#fff"/><path d="M111 109 Q118 102 125 109" ${ln} stroke-width="3.8"/></g>
      <g class="eye e-round"><circle cx="82" cy="108" r="7.6" fill="#fff" stroke="${K}" stroke-width="2.8"/><circle cx="118" cy="108" r="7.6" fill="#fff" stroke="${K}" stroke-width="2.8"/><circle cx="82" cy="108.5" r="3.4" fill="${K}"/><circle cx="118" cy="108.5" r="3.4" fill="${K}"/></g>
      <g class="eye e-star" fill="${G}" stroke="${K}" stroke-width="1.8" stroke-linejoin="round"><path transform="translate(82 108)" d="${STAR}"/><path transform="translate(118 108)" d="${STAR}"/></g>
      <g class="eye e-heart" fill="${A}" stroke="${K}" stroke-width="1.2"><path transform="translate(82 109) scale(1.3)" d="${HEART}"/><path transform="translate(118 109) scale(1.3)" d="${HEART}"/></g>
      <g class="eye e-look"><ellipse cx="85" cy="105" rx="5.2" ry="6.8" fill="${K}"/><ellipse cx="121" cy="105" rx="5.2" ry="6.8" fill="${K}"/><circle cx="87" cy="102" r="1.9" fill="#fff"/><circle cx="123" cy="102" r="1.9" fill="#fff"/></g>
      <g class="eye e-sleepy" ${ln} stroke-width="3.8"><path d="M75 107 Q82 113 89 107"/><path d="M111 107 Q118 113 125 107"/></g>
    </g>
    <g ${ln} stroke-width="2.8">
      <g class="brow b-sad"><path d="M74 98 L88 93"/><path d="M112 93 L126 98"/></g>
      <g class="brow b-up"><path d="M75 95 Q82 89 89 94"/><path d="M111 94 Q118 89 125 95"/></g>
      <g class="brow b-think"><path d="M75 97 Q82 95 89 97"/><path d="M111 93 Q118 90 126 94"/></g>
      <g class="brow b-proud"><path d="M75 95 Q82 93 89 96"/><path d="M111 96 Q118 93 125 95"/></g>
    </g>
    <path class="mouth m-smile" d="M93.5 122 Q100 127.5 106.5 122" ${ln} stroke-width="3.2"/>
    <g class="mouth m-grin"><path d="M90 120 L110 120 Q108 132 100 132 Q92 132 90 120 Z" fill="${M}" stroke="${K}" stroke-width="2.8" stroke-linejoin="round"/><path d="M94.5 129 Q100 124.5 105.5 129 Q100 131.5 94.5 129 Z" fill="#E58C77"/></g>
    <ellipse class="mouth m-o" cx="100" cy="125" rx="5" ry="6" fill="${M}" stroke="${K}" stroke-width="2.8"/>
    <ellipse class="mouth m-o-small" cx="100" cy="124" rx="3" ry="3.5" fill="${M}" stroke="${K}" stroke-width="2.4"/>
    <path class="mouth m-flat" d="M93 124 Q97 122 100 124 Q103 126 107 124" ${ln} stroke-width="3.2"/>
    <path class="mouth m-sad" d="M93 127 Q100 121 107 127" ${ln} stroke-width="3.2"/>
    <path class="mouth m-smirk" d="M93 123 Q102 128 108 120" ${ln} stroke-width="3.2"/>
    <path d="M68 80 C70 52 130 52 132 80 Z" fill="url(#xy-hat)" stroke="${K}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M68 80 C70 52 130 52 132 80 Z" fill="url(#xy-weave)"/>
    <path d="M70 73 Q100 66.5 130 73 L130.6 78 Q100 71.5 69.4 78 Z" fill="${P}" stroke="${K}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M26 90 Q100 58 174 90 Q100 79 26 90 Z" fill="url(#xy-brim)" stroke="${K}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M26 90 Q100 58 174 90 Q100 79 26 90 Z" fill="url(#xy-weave)"/>
  </g>
  <g class="prop pr-dots" fill="${K}"><circle cx="150" cy="62" r="3.6"/><circle cx="163" cy="50" r="4.6"/><circle cx="178" cy="37" r="5.6"/></g>
  <g class="prop pr-pin"><path d="M191 70 C191 59 175 59 175 70 C175 79 183 85 183 95 C183 85 191 79 191 70 Z" fill="url(#xy-hat)" stroke="${K}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="183" cy="70" r="3.2" fill="${P}"/></g>
  <g class="prop pr-wave" fill="none" stroke="${S}" stroke-width="3.2" stroke-linecap="round"><path d="M22 100 Q14 112 22 124"/><path d="M12 92 Q0 112 12 132"/></g>
  <g class="prop pr-spark" fill="${G}" stroke="${K}" stroke-width="1.4" stroke-linejoin="round"><g transform="translate(28 64)"><path d="${SPARK}"/></g><g transform="translate(177 72) scale(.8)"><path d="${SPARK}"/></g></g>
  <g class="prop pr-heart" fill="${A}" stroke="${K}" stroke-width="1.3"><g transform="translate(161 54) scale(1.4)"><path d="${HEART}"/></g></g>
</g>`;

const FULL = '-6 22 212 200', AVATAR = '20 52 160 160';

/** Inline SVG for 小游. `crop: 'avatar'` frames head and shoulders for round buttons. */
export function mascotSvg({ expression = 'happy', action = 'idle', crop = 'full', live = true } = {}) {
  const e = MASCOT_EXPRESSIONS.includes(expression) ? expression : 'normal';
  const a = MASCOT_ACTIONS.includes(action) ? action : 'idle';
  return `<svg class="xy${live ? ' is-live' : ''}${crop === 'avatar' ? ' xy--avatar' : ''}" viewBox="${crop === 'avatar' ? AVATAR : FULL}" data-e="${e}" data-a="${a}" aria-hidden="true" focusable="false">${PARTS}</svg>`;
}

/** Switch every 小游 inside `root` to a new expression and action. */
export function setMascotState(root, { expression, action } = {}) {
  for (const el of root.querySelectorAll('svg.xy')) {
    if (MASCOT_EXPRESSIONS.includes(expression)) el.dataset.e = expression;
    if (MASCOT_ACTIONS.includes(action)) el.dataset.a = action;
  }
}

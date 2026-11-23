import { copy } from '../../ui/copy';

/** The title's name: the cottage mark and City Qoti, with the accent in sage italic. */
export function Wordmark() {
  return (
    <div class="tf-wordmark">
      <div class="tf-mark" aria-hidden="true">
        <CottageMark />
      </div>
      <h1>
        <span class="tf-city">{copy.title.name}</span> <span class="qoti">{copy.title.nameAccent}</span>
      </h1>
    </div>
  );
}

/** A small hand-inked cottage with a curl of smoke, drawn inline. */
function CottageMark() {
  return (
    <svg
      width="92"
      height="64"
      viewBox="0 0 92 64"
      fill="none"
      stroke="#5a4231"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M6 58 C 26 52, 66 52, 86 58" stroke="#7f9c6c" />
      <path d="M26 56 V 32 L 46 16 L 66 32 V 56 Z" fill="#fbf1dc" />
      <path d="M22 34 L 46 13 L 70 34" fill="#d98a76" />
      <path d="M40 56 V 43 a 6 6 0 0 1 12 0 V 56" fill="#c48a3f" />
      <rect x="30" y="37" width="7" height="7" rx="1.5" fill="#f5d98a" />
      <rect x="55" y="37" width="7" height="7" rx="1.5" fill="#f5d98a" />
      <path d="M58 22 V 12 h 6 V 27" fill="#fbf1dc" />
      <path d="M61 9 c -4 -3, 4 -5, 0 -8" stroke="#9a8a7a" stroke-width="1.6" />
      <circle cx="14" cy="47" r="7" fill="#9dbb84" />
      <path d="M14 54 V 58" />
      <circle cx="79" cy="49" r="5" fill="#a9c48e" />
      <path d="M79 54 V 58" />
    </svg>
  );
}

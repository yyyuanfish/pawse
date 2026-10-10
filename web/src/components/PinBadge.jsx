/** The number of a place's pin on the map, in the pin's colour. Nothing when the place has no pin. */
export default function PinBadge({ n, kind }) {
  return n ? <span className={`pin-badge ${kind}`} aria-label={`#${n}`}>{n}</span> : null;
}

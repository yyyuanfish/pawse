// "Add to calendar" for a booked vet slot: a prefilled Google Calendar event (no sign-in or OAuth;
// the owner taps Save) and an .ics file for Apple Calendar and Outlook. Times are Zurich local time.

const TZ = 'Europe/Zurich';
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').slice(0, 15); // YYYYMMDDTHHMMSS of a "local" Date
const pad = (n) => String(n).padStart(2, '0');

/** start: 'YYYY-MM-DDTHH:MM' Zurich time. Returns null for anything else. */
export function calendarEvent({ start, minutes = 30, title, place = '', details = '' }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(start || '');
  if (!m) return null;
  // Date.UTC keeps the wall-clock numbers; the timezone is carried separately (ctz / TZID).
  const begin = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const end = new Date(begin.getTime() + minutes * 60000);
  return { begin, end, title, place, details };
}

export function googleCalendarUrl(ev) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${stamp(ev.begin)}/${stamp(ev.end)}`, ctz: TZ, details: ev.details, location: ev.place });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const esc = (s) => String(s).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

export function icsFile(ev, now = new Date()) {
  const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pawse//Vet booking//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${stamp(ev.begin)}-${Math.random().toString(36).slice(2)}@pawse`, `DTSTAMP:${utc(now)}`,
    `DTSTART;TZID=${TZ}:${stamp(ev.begin)}`, `DTEND;TZID=${TZ}:${stamp(ev.end)}`,
    `SUMMARY:${esc(ev.title)}`, `LOCATION:${esc(ev.place)}`, `DESCRIPTION:${esc(ev.details)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

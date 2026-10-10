// Add-to-calendar for a phone-booked slot: Google template link and .ics in Zurich local time.
import assert from 'node:assert/strict';
import { calendarEvent, googleCalendarUrl, icsFile } from '../src/utils/calendar.js';

assert.equal(calendarEvent({ start: 'today 4:30', title: 'x' }), null, 'free text is not a time');
const ev = calendarEvent({ start: '2026-10-10T16:30', title: 'Vet appointment for Mimi · Praxis, Zürich', place: 'Praxis; Zürich', details: 'Line 1\nLine 2' });
const url = new URL(googleCalendarUrl(ev));
assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
assert.equal(url.searchParams.get('action'), 'TEMPLATE');
assert.equal(url.searchParams.get('dates'), '20261010T163000/20261010T170000', '30 minutes, wall-clock time');
assert.equal(url.searchParams.get('ctz'), 'Europe/Zurich');
assert.equal(url.searchParams.get('text'), 'Vet appointment for Mimi · Praxis, Zürich');
const ics = icsFile(ev, new Date(Date.UTC(2026, 9, 10, 14, 0)));
assert.ok(ics.includes('DTSTART;TZID=Europe/Zurich:20261010T163000\r\n'));
assert.ok(ics.includes('DTEND;TZID=Europe/Zurich:20261010T170000\r\n'));
assert.ok(ics.includes('LOCATION:Praxis\\; Zürich') && ics.includes('DESCRIPTION:Line 1\\nLine 2'));
assert.ok(ics.includes('TRIGGER:-PT1H'), 'reminder one hour before');
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
console.log('check-calendar: Google Calendar link, .ics times, escaping and reminder OK');

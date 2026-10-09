import assert from 'node:assert/strict';
import { zeitleiste } from '../src/lib/arbeitszeit/zeitleiste.js';
const Z = (h) => `2026-10-19T${h}:00.000Z`;
const tag = {
  tag: '2026-10-19',
  stempel: [
    { id: 'k', art: 'kommen', zeit: Z('06:00'), status: 'gueltig', quelle: 'knopf' },
    { id: 'p1', art: 'pause_start', zeit: Z('10:00'), status: 'gueltig' },
    { id: 'p2', art: 'pause_ende', zeit: Z('10:30'), status: 'gueltig' },
    { id: 'g', art: 'gehen', zeit: Z('15:00'), status: 'gueltig', quelle: 'knopf' },
    { id: 'x', art: 'kommen', zeit: Z('06:00'), status: 'ungueltig' },
  ],
  buchungen: [
    { id: 'b1', started_at: Z('06:20'), ended_at: Z('08:00'), duration_minutes: 100, projekt: 'A' },
    { id: 'b2', started_at: Z('08:00'), ended_at: Z('10:00'), duration_minutes: 120, projekt: 'B' },
    { id: 'b3', started_at: Z('11:00'), ended_at: Z('14:00'), duration_minutes: 180, projekt: 'C' },
  ],
  bloecke: [{ von: Z('06:00'), bis: Z('15:00') }],
  pausen: [{ von: Z('10:00'), bis: Z('10:30') }],
};
const z = zeitleiste(tag, { jetztIso: Z('16:00') });

assert.deepEqual(z.map((r) => r.typ), ['kommen', 'alt', 'ohne', 'arbeit', 'arbeit', 'pause', 'ohne', 'arbeit', 'ohne', 'gehen']);
console.log('zeitleiste ok');

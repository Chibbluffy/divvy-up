// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import Database from 'better-sqlite3';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Divvy, Person, Event, Intersection, Payment, AccessLevel, MarkStatus } from '$lib/types';

const DB_PATH = process.env.DATABASE_PATH ?? join(process.cwd(), 'divvyup.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

let _db: Database.Database | null = null;

function getDb(): Database.Database {
	if (!_db) {
		_db = new Database(DB_PATH, { timeout: 5000 });
		_db.pragma('foreign_keys = ON');
		initSchema(_db);
	}
	return _db;
}

function initSchema(db: Database.Database) {
	db.exec(`
    CREATE TABLE IF NOT EXISTS divvies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_token TEXT NOT NULL UNIQUE,
      edit_token TEXT NOT NULL UNIQUE,
      view_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
	db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      divvy_id TEXT NOT NULL REFERENCES divvies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
	db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      divvy_id TEXT NOT NULL REFERENCES divvies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('even_split', 'custom_amount')),
      total_cost REAL NOT NULL DEFAULT 0,
      payer_person_id TEXT REFERENCES people(id) ON DELETE SET NULL,
      tax_percentage REAL,
      total_includes_tax INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      parent_event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    )
  `);
	// Migrate existing databases: add parent_event_id if missing
	try { db.exec(`ALTER TABLE events ADD COLUMN parent_event_id TEXT REFERENCES events(id) ON DELETE SET NULL`); } catch {}
	db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      divvy_id TEXT NOT NULL REFERENCES divvies(id) ON DELETE CASCADE,
      from_person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      to_person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL
    )
  `);
	db.exec(`
    CREATE TABLE IF NOT EXISTS intersections (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      present INTEGER NOT NULL DEFAULT 0,
      custom_amount REAL,
      tax_included INTEGER NOT NULL DEFAULT 0,
      mark TEXT NOT NULL DEFAULT 'unmarked' CHECK (mark IN ('unmarked', 'marked')),
      note TEXT,
      UNIQUE(event_id, person_id)
    )
  `);
	// Migrate existing databases: rename paid_status → mark
	try { db.exec(`ALTER TABLE intersections ADD COLUMN mark TEXT NOT NULL DEFAULT 'unmarked' CHECK (mark IN ('unmarked', 'marked'))`); } catch {}
	try { db.exec(`UPDATE intersections SET mark = 'marked' WHERE paid_status = 'paid' AND mark = 'unmarked'`); } catch {}
	try { db.exec(`ALTER TABLE intersections DROP COLUMN paid_status`); } catch {}
	// Migrate: add note column
	try { db.exec(`ALTER TABLE intersections ADD COLUMN note TEXT`); } catch {}
}

// --- Divvies ---

export function createDivvy(
	id: string,
	name: string,
	ownerToken: string,
	editToken: string,
	viewToken: string
): Divvy {
	const now = Date.now();
	getDb()
		.prepare(
			`INSERT INTO divvies (id, name, owner_token, edit_token, view_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, name, ownerToken, editToken, viewToken, now, now);
	return getDivvyById(id)!;
}

export function getDivvyById(id: string): Divvy | null {
	const row = getDb().prepare('SELECT * FROM divvies WHERE id = ?').get(id) as Divvy | undefined;
	return row ?? null;
}

export function getAccessLevel(divvy: Divvy, token: string): AccessLevel {
	if (token === divvy.owner_token) return 'owner';
	if (token === divvy.edit_token) return 'edit';
	if (token === divvy.view_token) return 'view';
	return 'view';
}

export function updateDivvyName(id: string, name: string) {
	getDb()
		.prepare('UPDATE divvies SET name = ?, updated_at = ? WHERE id = ?')
		.run(name, Date.now(), id);
}

// --- People ---

export function getPeople(divvyId: string): Person[] {
	return getDb()
		.prepare('SELECT * FROM people WHERE divvy_id = ? ORDER BY sort_order, created_at')
		.all(divvyId) as Person[];
}

export function createPerson(
	id: string,
	divvyId: string,
	name: string,
	color: string,
	sortOrder: number
): Person {
	const now = Date.now();
	getDb()
		.prepare(
			`INSERT INTO people (id, divvy_id, name, color, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(id, divvyId, name, color, sortOrder, now);

	// Create placeholder intersections for all existing events
	const events = getEvents(divvyId);
	for (const event of events) {
		upsertIntersection(generateId(), event.id, id, false, null, false, 'unmarked');
	}

	return getDb().prepare('SELECT * FROM people WHERE id = ?').get(id) as Person;
}

export function updatePerson(id: string, name: string, color: string) {
	getDb().prepare('UPDATE people SET name = ?, color = ? WHERE id = ?').run(name, color, id);
}

export function deletePerson(id: string) {
	getDb().prepare('DELETE FROM people WHERE id = ?').run(id);
}

export function reorderPeople(divvyId: string, orderedIds: string[]) {
	const stmt = getDb().prepare('UPDATE people SET sort_order = ? WHERE id = ? AND divvy_id = ?');
	const updateMany = getDb().transaction(() => {
		orderedIds.forEach((id, index) => stmt.run(index, id, divvyId));
	});
	updateMany();
}

// --- Events ---

export function getEvents(divvyId: string): Event[] {
	const rows = getDb()
		.prepare('SELECT * FROM events WHERE divvy_id = ? ORDER BY sort_order, created_at')
		.all(divvyId) as Array<Omit<Event, 'total_includes_tax' | 'parent_event_id'> & { total_includes_tax: number; parent_event_id: string | null }>;
	return rows.map((r) => ({ ...r, total_includes_tax: r.total_includes_tax === 1, parent_event_id: r.parent_event_id ?? null }));
}

export function createEvent(
	id: string,
	divvyId: string,
	name: string,
	type: string,
	totalCost: number,
	payerPersonId: string | null,
	taxPercentage: number | null,
	totalIncludesTax: boolean,
	sortOrder: number,
	parentEventId: string | null = null
): Event {
	const now = Date.now();
	getDb()
		.prepare(
			`INSERT INTO events (id, divvy_id, name, type, total_cost, payer_person_id, tax_percentage, total_includes_tax, sort_order, parent_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, divvyId, name, type, totalCost, payerPersonId, taxPercentage, totalIncludesTax ? 1 : 0, sortOrder, parentEventId, now);

	// Create placeholder intersections for all existing people
	const people = getPeople(divvyId);
	for (const person of people) {
		upsertIntersection(generateId(), id, person.id, false, null, false, 'unmarked');
	}

	const row = getDb()
		.prepare('SELECT * FROM events WHERE id = ?')
		.get(id) as Omit<Event, 'total_includes_tax'> & { total_includes_tax: number };
	return { ...row, total_includes_tax: row.total_includes_tax === 1 };
}

export function updateEvent(
	id: string,
	name: string,
	totalCost: number,
	payerPersonId: string | null,
	taxPercentage: number | null,
	totalIncludesTax: boolean
) {
	getDb()
		.prepare(
			`UPDATE events SET name = ?, total_cost = ?, payer_person_id = ?, tax_percentage = ?, total_includes_tax = ?
       WHERE id = ?`
		)
		.run(name, totalCost, payerPersonId, taxPercentage, totalIncludesTax ? 1 : 0, id);
}

export function deleteEvent(id: string) {
	getDb().prepare('DELETE FROM events WHERE id = ?').run(id);
}

export function duplicateEvent(sourceId: string, newId: string, newName: string, parentEventId: string | null = null): Event {
	const source = getDb()
		.prepare('SELECT * FROM events WHERE id = ?')
		.get(sourceId) as Event | undefined;
	if (!source) throw new Error('Source event not found');

	const now = Date.now();
	getDb()
		.prepare(
			`INSERT INTO events (id, divvy_id, name, type, total_cost, payer_person_id, tax_percentage, total_includes_tax, sort_order, parent_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			newId,
			source.divvy_id,
			newName,
			source.type,
			source.total_cost,
			source.payer_person_id,
			source.tax_percentage,
			source.total_includes_tax ? 1 : 0,
			source.sort_order + 1,
			parentEventId,
			now
		);

	const intersections = getDb()
		.prepare('SELECT * FROM intersections WHERE event_id = ?')
		.all(sourceId) as Intersection[];
	for (const ix of intersections) {
		// Keep presence for even_split; always clear custom amounts so the clone starts fresh
		const keepPresent = source.type === 'even_split' ? ix.present : false;
		upsertIntersection(generateId(), newId, ix.person_id, keepPresent, null, false, 'unmarked');
	}

	const row = getDb()
		.prepare('SELECT * FROM events WHERE id = ?')
		.get(newId) as Omit<Event, 'total_includes_tax'> & { total_includes_tax: number };
	return { ...row, total_includes_tax: row.total_includes_tax === 1 };
}

// --- Intersections ---

export function getIntersections(divvyId: string): Intersection[] {
	const rows = getDb()
		.prepare(
			`SELECT i.* FROM intersections i
       JOIN events e ON e.id = i.event_id
       WHERE e.divvy_id = ?`
		)
		.all(divvyId) as Array<Omit<Intersection, 'present' | 'tax_included' | 'mark'> & { present: number; tax_included: number; mark: string; note: string | null }>;
	return rows.map((r) => ({
		...r,
		present: r.present === 1,
		tax_included: r.tax_included === 1,
		mark: (r.mark === 'marked' ? 'marked' : 'unmarked') as MarkStatus,
		note: r.note ?? null
	}));
}

export function upsertIntersection(
	id: string,
	eventId: string,
	personId: string,
	present: boolean,
	customAmount: number | null,
	taxIncluded: boolean,
	mark: string = 'unmarked'
) {
	getDb()
		.prepare(
			`INSERT INTO intersections (id, event_id, person_id, present, custom_amount, tax_included, mark)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id, person_id) DO UPDATE SET
         present = excluded.present,
         custom_amount = excluded.custom_amount,
         tax_included = excluded.tax_included,
         mark = excluded.mark`
		)
		.run(id, eventId, personId, present ? 1 : 0, customAmount, taxIncluded ? 1 : 0, mark);
}

export function updateIntersectionPresence(eventId: string, personId: string, present: boolean) {
	getDb()
		.prepare(`UPDATE intersections SET present = ? WHERE event_id = ? AND person_id = ?`)
		.run(present ? 1 : 0, eventId, personId);
}

export function updateIntersectionAmount(
	eventId: string,
	personId: string,
	customAmount: number | null,
	taxIncluded: boolean
) {
	getDb()
		.prepare(
			`UPDATE intersections SET custom_amount = ?, tax_included = ? WHERE event_id = ? AND person_id = ?`
		)
		.run(customAmount, taxIncluded ? 1 : 0, eventId, personId);
}

export function updateIntersectionPaid(eventId: string, personId: string, mark: string) {
	getDb()
		.prepare(`UPDATE intersections SET mark = ? WHERE event_id = ? AND person_id = ?`)
		.run(mark, eventId, personId);
}

export function updateIntersectionNote(eventId: string, personId: string, note: string | null) {
	getDb()
		.prepare(`UPDATE intersections SET note = ? WHERE event_id = ? AND person_id = ?`)
		.run(note, eventId, personId);
}

// --- Payments ---

export function getPayments(divvyId: string): Payment[] {
	return getDb()
		.prepare('SELECT * FROM payments WHERE divvy_id = ? ORDER BY created_at ASC')
		.all(divvyId) as Payment[];
}

export function createPayment(
	id: string,
	divvyId: string,
	fromPersonId: string,
	toPersonId: string,
	amount: number,
	note: string | null
): Payment {
	const now = Date.now();
	getDb()
		.prepare(
			`INSERT INTO payments (id, divvy_id, from_person_id, to_person_id, amount, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, divvyId, fromPersonId, toPersonId, amount, note, now);
	return getDb().prepare('SELECT * FROM payments WHERE id = ?').get(id) as Payment;
}

export function deletePayment(id: string) {
	getDb().prepare('DELETE FROM payments WHERE id = ?').run(id);
}

// --- Fork (copy a Divvy) ---

export function forkDivvy(
	sourceDivvyId: string,
	newDivvyId: string,
	newName: string,
	ownerToken: string,
	editToken: string,
	viewToken: string
): Divvy {
	const source = getDivvyById(sourceDivvyId);
	if (!source) throw new Error('Source divvy not found');

	const now = Date.now();
	getDb()
		.prepare(
			`INSERT INTO divvies (id, name, owner_token, edit_token, view_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(newDivvyId, newName, ownerToken, editToken, viewToken, now, now);

	const people = getPeople(sourceDivvyId);
	const personIdMap = new Map<string, string>();
	for (const person of people) {
		const newPersonId = generateId();
		personIdMap.set(person.id, newPersonId);
		getDb()
			.prepare(
				`INSERT INTO people (id, divvy_id, name, color, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
			)
			.run(newPersonId, newDivvyId, person.name, person.color, person.sort_order, now);
	}

	const events = getEvents(sourceDivvyId);
	for (const event of events) {
		const newEventId = generateId();
		const newPayerId = event.payer_person_id ? personIdMap.get(event.payer_person_id) ?? null : null;
		getDb()
			.prepare(
				`INSERT INTO events (id, divvy_id, name, type, total_cost, payer_person_id, tax_percentage, total_includes_tax, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				newEventId,
				newDivvyId,
				event.name,
				event.type,
				event.total_cost,
				newPayerId,
				event.tax_percentage,
				event.total_includes_tax ? 1 : 0,
				event.sort_order,
				now
			);

		const intersections = getDb()
			.prepare('SELECT * FROM intersections WHERE event_id = ?')
			.all(event.id) as Array<Omit<Intersection, 'present' | 'tax_included'> & { present: number; tax_included: number }>;

		for (const ix of intersections) {
			const newPersonId = personIdMap.get(ix.person_id);
			if (newPersonId) {
				upsertIntersection(generateId(), newEventId, newPersonId, ix.present === 1, ix.custom_amount, ix.tax_included === 1, 'unmarked');
			}
		}
	}

	return getDivvyById(newDivvyId)!;
}

// --- Utilities ---

export function generateId(): string {
	return crypto.randomUUID();
}

export function generateToken(): string {
	const array = new Uint8Array(24);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

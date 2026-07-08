// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
import type { Event, Person, Intersection, Payment, Settlement, SettlementTransaction, SettlementBalance } from './types';

export function getFinalAmount(
	customAmount: number | null,
	taxIncluded: boolean,
	taxPercentage: number | null
): number {
	if (customAmount === null) return 0;
	if (!taxIncluded && taxPercentage && taxPercentage > 0) {
		return customAmount * (1 + taxPercentage / 100);
	}
	return customAmount;
}

export function calculateEventShare(
	event: Event,
	intersections: Intersection[]
): Record<string, number> {
	const shares: Record<string, number> = {};
	const eventIntersections = intersections.filter((i) => i.event_id === event.id);

	if (event.type === 'even_split') {
		const presentPeople = eventIntersections.filter((i) => i.present).map((i) => i.person_id);
		if (presentPeople.length === 0) return shares;
		const share = event.total_cost / presentPeople.length;
		for (const personId of presentPeople) {
			shares[personId] = share;
		}
	} else {
		for (const ix of eventIntersections) {
			if (ix.custom_amount !== null) {
				shares[ix.person_id] = getFinalAmount(ix.custom_amount, ix.tax_included, event.tax_percentage);
			}
		}
	}

	return shares;
}

export function getPersonTotal(personId: string, events: Event[], intersections: Intersection[]): number {
	let total = 0;
	for (const event of events) {
		const shares = calculateEventShare(event, intersections);
		total += shares[personId] ?? 0;
	}
	return total;
}

export function getEventTotal(event: Event, intersections: Intersection[]): number {
	const shares = calculateEventShare(event, intersections);
	return Object.values(shares).reduce((s, v) => s + v, 0);
}

export function getRemainingAmount(event: Event, intersections: Intersection[]): number {
	const eventIxs = intersections.filter((i) => i.event_id === event.id);
	if (event.type === 'custom_amount') {
		const filled = eventIxs
			.filter((i) => i.custom_amount !== null)
			.reduce((s, i) => s + getFinalAmount(i.custom_amount, i.tax_included, event.tax_percentage), 0);
		return event.total_cost - filled;
	}
	return 0;
}

export function calculateSettlement(
	people: Person[],
	events: Event[],
	intersections: Intersection[],
	payments: Payment[] = []
): Settlement {
	// net[personId]: positive = others owe them; negative = they owe others
	const outstanding: Record<string, number> = {};
	for (const p of people) outstanding[p.id] = 0;

	for (const event of events) {
		if (!event.payer_person_id) continue;
		const shares = calculateEventShare(event, intersections);

		for (const [personId, share] of Object.entries(shares)) {
			if (personId === event.payer_person_id) continue; // payer's own share is already covered
			outstanding[personId] = (outstanding[personId] ?? 0) - share;
			outstanding[event.payer_person_id] = (outstanding[event.payer_person_id] ?? 0) + share;
		}
	}

	// Apply direct person-to-person payments
	for (const payment of payments) {
		outstanding[payment.from_person_id] = (outstanding[payment.from_person_id] ?? 0) + payment.amount;
		outstanding[payment.to_person_id] = (outstanding[payment.to_person_id] ?? 0) - payment.amount;
	}

	// Merge group members' balances into their lead — members end at 0 so they never appear in transactions
	for (const p of people) {
		if (p.group_lead_person_id && outstanding[p.group_lead_person_id] !== undefined) {
			outstanding[p.group_lead_person_id] += outstanding[p.id] ?? 0;
			outstanding[p.id] = 0;
		}
	}

	// Build group membership index
	const leadToMembers = new Map<string, Person[]>();
	for (const p of people) {
		if (p.group_lead_person_id) {
			const arr = leadToMembers.get(p.group_lead_person_id) ?? [];
			arr.push(p);
			leadToMembers.set(p.group_lead_person_id, arr);
		}
	}

	// Build balances for display
	const balances: SettlementBalance[] = people.map((p) => {
		const members = leadToMembers.get(p.id) ?? [];
		return {
			personId: p.id,
			personName: p.name,
			color: p.color,
			totalOwed: Math.max(0, outstanding[p.id] ?? 0),
			totalShouldPay: Math.max(0, -(outstanding[p.id] ?? 0)),
			net: outstanding[p.id] ?? 0,
			...(members.length > 0 && { groupMemberNames: members.map((m) => m.name), groupMemberIds: members.map((m) => m.id) }),
			...(p.group_lead_person_id && { isGroupMember: true, groupLeadId: p.group_lead_person_id })
		};
	});

	// Minimize transactions (non-leads already have outstanding === 0, so they're excluded automatically)
	const transactions = minimizeTransactions(outstanding, people);

	return { transactions, balances };
}

function minimizeTransactions(
	balances: Record<string, number>,
	people: Person[]
): SettlementTransaction[] {
	const personMap = new Map(people.map((p) => [p.id, p]));

	const debtors = Object.entries(balances)
		.filter(([, b]) => b < -0.005)
		.map(([id, b]) => ({ id, balance: b }))
		.sort((a, b) => a.balance - b.balance);

	const creditors = Object.entries(balances)
		.filter(([, b]) => b > 0.005)
		.map(([id, b]) => ({ id, balance: b }))
		.sort((a, b) => b.balance - a.balance);

	const transactions: SettlementTransaction[] = [];
	let d = 0;
	let c = 0;

	while (d < debtors.length && c < creditors.length) {
		const debtor = debtors[d];
		const creditor = creditors[c];
		const amount = Math.min(-debtor.balance, creditor.balance);

		if (amount > 0.005) {
			transactions.push({
				fromId: debtor.id,
				fromName: personMap.get(debtor.id)?.name ?? debtor.id,
				toId: creditor.id,
				toName: personMap.get(creditor.id)?.name ?? creditor.id,
				amount: Math.round(amount * 100) / 100
			});
		}

		debtor.balance += amount;
		creditor.balance -= amount;

		if (Math.abs(debtor.balance) < 0.005) d++;
		if (Math.abs(creditor.balance) < 0.005) c++;
	}

	return transactions;
}

export const PERSON_COLORS = [
	'#ef4444',
	'#f97316',
	'#eab308',
	'#22c55e',
	'#14b8a6',
	'#3b82f6',
	'#8b5cf6',
	'#ec4899',
	'#06b6d4',
	'#84cc16',
	'#f43f5e',
	'#a78bfa'
];

export function getNextColor(usedColors: string[]): string {
	for (const color of PERSON_COLORS) {
		if (!usedColors.includes(color)) return color;
	}
	return PERSON_COLORS[usedColors.length % PERSON_COLORS.length];
}

export function formatCurrency(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
}

export function formatCurrencyCompact(amount: number): string {
	const cents = Math.round(amount * 100) % 100;
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: cents === 0 ? 0 : 2,
		maximumFractionDigits: cents === 0 ? 0 : 2
	}).format(amount);
}

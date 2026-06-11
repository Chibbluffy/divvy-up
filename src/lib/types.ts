// Copyright (c) 2025–2026 Tom Wan (chibbluffy@protonmail.com). Open source.
export type AccessLevel = 'owner' | 'edit' | 'view';

export type EventType = 'even_split' | 'custom_amount';

export type PaidStatus = 'unpaid' | 'paid';

export interface Divvy {
	id: string;
	name: string;
	owner_token: string;
	edit_token: string;
	view_token: string;
	created_at: number;
	updated_at: number;
}

export interface Person {
	id: string;
	divvy_id: string;
	name: string;
	color: string;
	sort_order: number;
	created_at: number;
}

export interface Event {
	id: string;
	divvy_id: string;
	name: string;
	type: EventType;
	total_cost: number;
	payer_person_id: string | null;
	tax_percentage: number | null;
	total_includes_tax: boolean;
	sort_order: number;
	parent_event_id: string | null;
	created_at: number;
}

export interface Intersection {
	id: string;
	event_id: string;
	person_id: string;
	present: boolean;
	custom_amount: number | null;
	tax_included: boolean;
	paid_status: PaidStatus;
}

export interface Settlement {
	transactions: SettlementTransaction[];
	balances: SettlementBalance[];
}

export interface SettlementTransaction {
	fromId: string;
	fromName: string;
	toId: string;
	toName: string;
	amount: number;
}

export interface SettlementBalance {
	personId: string;
	personName: string;
	color: string;
	totalOwed: number;
	totalShouldPay: number;
	net: number;
}

// NOTE: .defaultRandom() uses gen_random_uuid() which requires the pgcrypto
// extension on Cloud SQL PostgreSQL. Enable it once with:
//   CREATE EXTENSION IF NOT EXISTS pgcrypto;

import { pgTable, pgEnum, uuid, text, char, numeric, integer, timestamp, unique } from 'drizzle-orm/pg-core'

export const confidenceTier = pgEnum('confidence_tier', ['high', 'medium', 'low'])
export const pipelineStatus = pgEnum('pipeline_status', ['running', 'completed', 'failed', 'partial'])
export const dataType = pgEnum('data_type', ['real', 'synthetic'])

export const jurisdictions = pgTable('jurisdictions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  state: text('state').notNull(),
  fipsState: char('fips_state', { length: 2 }).notNull(),
  fipsCounty: char('fips_county', { length: 3 }).notNull(),
  displayName: text('display_name').notNull(),
  slug: text('slug').notNull().unique(),
  dataType: dataType('data_type').notNull().default('real'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.fipsState, t.fipsCounty)])

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdictionId: uuid('jurisdiction_id').notNull().references(() => jurisdictions.id),
  status: pipelineStatus('status').notNull().default('running'),
  fieldsExtracted: integer('fields_extracted').notNull().default(0),
  fieldsFailed: integer('fields_failed').notNull().default(0),
  sourceDocument: text('source_document'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
})

export const extractedFields = pgTable('extracted_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdictionId: uuid('jurisdiction_id').notNull().references(() => jurisdictions.id),
  fieldName: text('field_name').notNull(),
  rawValue: numeric('raw_value'),
  rawUnit: text('raw_unit'),
  fieldValue: numeric('field_value'),
  fieldValueText: text('field_value_text'),
  unit: text('unit'),
  confidence: confidenceTier('confidence').notNull(),
  sourceDocument: text('source_document'),
  sourceSection: text('source_section'),
  districtContext: text('district_context'),
  pipelineRunId: uuid('pipeline_run_id').references(() => pipelineRuns.id),
  extractedAt: timestamp('extracted_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.jurisdictionId, t.fieldName)])

export const risScores = pgTable('ris_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdictionId: uuid('jurisdiction_id').notNull().references(() => jurisdictions.id).unique(),
  risComposite: numeric('ris_composite', { precision: 5, scale: 2 }).notNull(),
  dci: numeric('dci', { precision: 5, scale: 2 }).notNull(),
  dcoi: numeric('dcoi', { precision: 5, scale: 2 }).notNull(),
  pci: numeric('pci', { precision: 5, scale: 2 }).notNull(),
  crp: numeric('crp', { precision: 5, scale: 2 }).notNull(),
  peerSet: text('peer_set').array(),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  pipelineRunId: uuid('pipeline_run_id').references(() => pipelineRuns.id),
})

export const marketData = pgTable('market_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdictionId: uuid('jurisdiction_id').notNull().references(() => jurisdictions.id).unique(),
  // HUD Fair Market Rents (E1-2)
  fmr2br: numeric('fmr_2br', { precision: 8, scale: 2 }),
  fmrVintage: text('fmr_vintage'),
  // ACS housing and population (E1-3)
  totalHousingUnits: integer('total_housing_units'),
  occupiedHousingUnits: integer('occupied_housing_units'),
  totalPopulation: integer('total_population'),
  acsVintage: text('acs_vintage'),
  // Census Building Permits (E1-4)
  permits5plus: integer('permits_5plus'),
  totalPermits: integer('total_permits'),
  permitsVintage: text('permits_vintage'),
  retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
})

export const feasibilityOutputs = pgTable('feasibility_outputs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jurisdictionId: uuid('jurisdiction_id').notNull().references(() => jurisdictions.id).unique(),
  maxUnitsPerAcre: numeric('max_units_per_acre', { precision: 8, scale: 2 }),
  parkingFootprintPct: numeric('parking_footprint_pct', { precision: 5, scale: 2 }),
  costPerSqft: numeric('cost_per_sqft', { precision: 8, scale: 2 }),
  estimatedCostPerUnit: numeric('estimated_cost_per_unit', { precision: 10, scale: 2 }),
  regionalCostMultiplier: numeric('regional_cost_multiplier', { precision: 4, scale: 3 }),
  fmr2br: numeric('fmr_2br', { precision: 8, scale: 2 }),
  rentFeasibilityRatio: numeric('rent_feasibility_ratio', { precision: 6, scale: 3 }),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
  pipelineRunId: uuid('pipeline_run_id').references(() => pipelineRuns.id),
})

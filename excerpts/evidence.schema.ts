// Excerpt from packages/schemas/src/evidence.ts (shortened).
// Shared zod schema for the evidence attached to every finding. The same contract is used by the
// API, the web app and the CLI, so an evidence record is validated identically everywhere.

import { z } from 'zod';
import { ConfidenceClassEnum, SourceTypeEnum } from './common';

const sha256Regex = /^[a-fA-F0-9]{64}$/;

// Accepts both camelCase (API) and snake_case (database / analysis service) input.
function normalizeEvidenceInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const createdAtRaw = obj.createdAt ?? obj.created_at;
  const createdAt = createdAtRaw instanceof Date ? createdAtRaw.toISOString() : (createdAtRaw as string | undefined);

  return {
    id: obj.id,
    findingId: obj.findingId ?? obj.finding_id,
    artifactPath: obj.artifactPath ?? obj.artifact_path,
    lineNumber: obj.lineNumber ?? obj.line_number ?? null,
    columnNumber: obj.columnNumber ?? obj.column_number ?? null,
    snippet: obj.snippet ?? null,
    sha256: obj.sha256,
    provenance: obj.provenance ?? 'VERIFIED',
    sourceType: obj.sourceType ?? obj.source_type ?? 'CUSTOMER_EVIDENCE',
    sourceTitle: obj.sourceTitle ?? obj.source_title ?? null,
    sourceUrl: obj.sourceUrl ?? obj.source_url ?? null,
    trustScore: obj.trustScore ?? obj.trust_score ?? obj.trust_level ?? 1.0,
    createdAt: createdAt ?? undefined,
  };
}

// How the evidence is located inside the artifact.
export const EvidenceSelectorEnum = z.enum([
  'LINE_COLUMN',
  'XPATH',
  'JSON_POINTER',
  'TABLE_CELL',
  'TELEGRAM_SEQ',
]);
export type EvidenceSelector = z.infer<typeof EvidenceSelectorEnum>;

export const EvidenceSourceOffsetSchema = z.object({
  artifactPath: z.string().min(1),
  selectorType: EvidenceSelectorEnum.default('LINE_COLUMN'),
  startLine: z.number().int().positive().nullable().optional(),
  endLine: z.number().int().positive().nullable().optional(),
  startColumn: z.number().int().positive().nullable().optional(),
  endColumn: z.number().int().positive().nullable().optional(),
  byteOffsetStart: z.number().int().nonnegative().nullable().optional(),
  byteOffsetEnd: z.number().int().nonnegative().nullable().optional(),
  selectorQuery: z.string().nullable().optional(),
  snippet: z.string().default(''),
  contextSnippet: z.string().nullable().optional(),
});
export type EvidenceSourceOffset = z.infer<typeof EvidenceSourceOffsetSchema>;

// Is the referenced SAP object valid for the target release?
export const ReleaseAlignmentEnum = z.enum([
  'RELEASE_ALIGNED',
  'RELEASE_PREMATURE',
  'RELEASE_DEPRECATED',
  'RELEASE_FUTURE',
  'RELEASE_MISMATCH',
  'FAMILY_MISMATCH',
  'UNKNOWN',
]);
export type ReleaseAlignment = z.infer<typeof ReleaseAlignmentEnum>;

export const BaseEvidenceItemSchema = z.object({
  id: z.string().uuid().optional(),
  findingId: z.string().uuid().optional().nullable(),
  artifactPath: z.string().min(1),
  lineNumber: z.number().int().positive().optional().nullable(),
  columnNumber: z.number().int().positive().optional().nullable(),
  snippet: z.string().optional().nullable(),
  sha256: z.string().regex(sha256Regex, 'Must be a valid 64-character hexadecimal SHA-256 hash'),
  provenance: ConfidenceClassEnum.default('VERIFIED'),
  sourceType: SourceTypeEnum.default('CUSTOMER_EVIDENCE'),
  sourceTitle: z.string().optional().nullable(),
  sourceUrl: z.string().url().optional().nullable(),
  trustScore: z.number().min(0).max(1).default(1.0),
  targetRelease: z.string().optional().nullable(),
  validFromRelease: z.string().optional().nullable(),
  validToRelease: z.string().optional().nullable(),
  releaseAlignment: ReleaseAlignmentEnum.optional(),
  offset: EvidenceSourceOffsetSchema.optional().nullable(),
  createdAt: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof BaseEvidenceItemSchema>;

export const EvidenceItemSchema = z.preprocess(
  normalizeEvidenceInput,
  BaseEvidenceItemSchema
);

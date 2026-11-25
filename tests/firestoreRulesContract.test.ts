import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DIRTY_DOZEN_TEST_CASES } from '../firestore.rules.test';

const ROOT = process.cwd();
const rulesText = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'firebase-blueprint.json'), 'utf8')
) as {
  entities: Record<string, { properties: Record<string, unknown> }>;
  firestore: Record<string, unknown>;
};

describe('Firestore Security Rules & Blueprint Contract Verification', () => {
  it('enforces rules_version 2, global default-deny catch-all, and verified email helpers', () => {
    assert.ok(rulesText.startsWith("rules_version = '2';"));
    assert.ok(rulesText.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
    assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
    assert.ok(rulesText.includes('function isValidId(id)'));
  });

  it('keeps firebase-blueprint.json collections and RateLibraryItem.equipmentRate aligned with firestore.rules', () => {
    const requiredCollections = [
      'users/{userId}',
      'projects/{projectId}',
      'government_transactions/{transactionId}',
      'document_manifests/{manifestId}',
      'rate_library/{rateId}',
      'company_profiles/{profileId}',
      'report_workspaces/{workspaceId}',
    ];
    for (const col of requiredCollections) {
      assert.ok(rulesText.includes(`match /${col}`), `Missing match block for /${col}`);
      assert.ok(
        blueprint.firestore[`/${col}`] !== undefined,
        `Missing blueprint path /${col}`
      );
    }

    assert.ok(
      blueprint.entities.RateLibraryItem.properties.equipmentRate !== undefined,
      'Blueprint RateLibraryItem must declare equipmentRate'
    );
    assert.ok(
      rulesText.includes("'equipmentRate'"),
      'firestore.rules must allow equipmentRate in rate_library'
    );
  });

  it('covers all 12 Dirty Dozen adversarial invariants in firestore.rules', () => {
    assert.equal(DIRTY_DOZEN_TEST_CASES.length, 12);
    // 1, 2, 10: Cross-tenant read, ownerId spoofing, blanket list scraping
    assert.ok(rulesText.includes('incoming().ownerId == request.auth.uid'));
    assert.ok(rulesText.includes('resource.data.ownerId == request.auth.uid || isAdmin()'));
    // 3: Shadow ghost field checks
    assert.ok(rulesText.includes('data.keys().hasOnly('));
    assert.ok(rulesText.includes('affectedKeys().hasOnly('));
    // 4: Role self-escalation protection
    assert.ok(rulesText.includes("incoming().role in ['engineer', 'accountant'] || isAdmin()"));
    assert.ok(rulesText.includes('incoming().role == existing().role'));
    // 5: Unverified email spoofing guard
    assert.ok(rulesText.includes('return isEmailVerified() && ('));
    // 6: ID poisoning cap
    assert.ok(rulesText.includes('id.size() <= 128'));
    // 7, 8: Orphaned transaction / chunk parent checks
    assert.ok(rulesText.includes('exists(/databases/$(database)/documents/projects/$(incoming().projectId))'));
    assert.ok(rulesText.includes('exists(/databases/$(database)/documents/document_manifests/$(manifestId))'));
    // 9: Chunk exhaustion ceiling
    assert.ok(rulesText.includes('data.data.size() <= 900000'));
    // 11: Terminal state locks
    assert.ok(rulesText.includes("existing().status != 'completed'"));
    assert.ok(rulesText.includes("existing().status != 'approved'"));
    // 12: Server timestamp integrity
    assert.ok(rulesText.includes('incoming().createdAt == request.time'));
    assert.ok(rulesText.includes('incoming().updatedAt == request.time'));
  });

  it('enforces hardened security rules and blueprint schemas for all 10 Structural Intelligence collections', () => {
    const structuralCollections = [
      'structuralProjects/{projectId}',
      'structuralModels/{modelId}',
      'structuralImports/{importId}',
      'structuralElements/{elementDocId}',
      'structuralMaterials/{materialDocId}',
      'structuralSections/{sectionDocId}',
      'structuralResults/{resultDocId}',
      'structuralValidations/{validationId}',
      'structuralRevisions/{revisionId}',
      'structuralReports/{reportId}',
    ];

    for (const col of structuralCollections) {
      assert.ok(rulesText.includes(`match /${col}`), `Missing match block for /${col}`);
      assert.ok(
        blueprint.firestore[`/${col}`] !== undefined,
        `Missing blueprint path /${col}`
      );
    }

    assert.ok(rulesText.includes('function hasValidStructuralProjectParent(projectId)'));
    assert.ok(rulesText.includes('data.immutable == true'));
    assert.ok(rulesText.includes('isValidReliability('));
  });
});

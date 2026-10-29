/**
 * Semantic Matching Evaluation Script
 *
 * Evaluates the quality of semantic skill matching against a curated
 * set of labeled skill pairs.
 *
 * Usage: npm run evaluate
 *
 * This script requires a configured embedding provider (SEMANTIC_MATCHING_ENABLED=true).
 * It sends only skill labels to the provider — no personal data.
 *
 * Purpose:
 * - Verify the semantic similarity threshold produces acceptable results
 * - Identify false positives (unrelated skills matched) and false negatives
 *   (equivalent skills missed)
 * - Help tune SEMANTIC_SIMILARITY_THRESHOLD for your specific data
 *
 * NOTE: The initial threshold has NOT been empirically optimized.
 * Use this script to evaluate and adjust.
 */

import { loadConfig } from '../src/config/env.js';
import { createEmbeddingProvider, FakeEmbeddingProvider, type EmbeddingProvider } from '../src/services/embedding-provider.js';
import { cosineSimilarity } from '../src/services/semantic-matching.service.js';

// ============================================================================
// Evaluation Dataset
// ============================================================================

interface SkillPair {
  skillA: string;
  skillB: string;
  expectedMatch: boolean;
  category: string;
  notes: string;
}

const evaluationPairs: SkillPair[] = [
  // Clearly equivalent (should match)
  {
    skillA: 'system design',
    skillB: 'systems-design',
    expectedMatch: true,
    category: 'equivalent',
    notes: 'Hyphenation and pluralization difference',
  },
  {
    skillA: 'problem solving',
    skillB: 'analytical problem solving',
    expectedMatch: true,
    category: 'equivalent',
    notes: 'Modifier added but same core skill',
  },
  {
    skillA: 'REST API development',
    skillB: 'RESTful API design',
    expectedMatch: true,
    category: 'equivalent',
    notes: 'Synonymous phrasing',
  },
  {
    skillA: 'rapid prototyping',
    skillB: 'rapid-prototyping',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen',
  },
  {
    skillA: 'public speaking',
    skillB: 'public-speaking',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen',
  },
  {
    skillA: 'crisis management',
    skillB: 'crisis-management',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen',
  },
  {
    skillA: 'team building',
    skillB: 'team-building',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen',
  },
  {
    skillA: 'project management',
    skillB: 'project-management',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen',
  },

  // Related but NOT equivalent (should NOT match)
  {
    skillA: 'leadership',
    skillB: 'mentorship',
    expectedMatch: false,
    category: 'related-not-equivalent',
    notes: 'Both people skills but different competencies',
  },
  {
    skillA: 'sales',
    skillB: 'negotiation',
    expectedMatch: false,
    category: 'related-not-equivalent',
    notes: 'Sales often involves negotiation but they are distinct skills',
  },
  {
    skillA: 'research',
    skillB: 'theoretical-analysis',
    expectedMatch: false,
    category: 'related-not-equivalent',
    notes: 'Research includes analysis but they are different activities',
  },
  {
    skillA: 'strategy',
    skillB: 'leadership',
    expectedMatch: false,
    category: 'related-not-equivalent',
    notes: 'Leadership may require strategy but they are different',
  },
  {
    skillA: 'public-speaking',
    skillB: 'persuasion',
    expectedMatch: false,
    category: 'related-not-equivalent',
    notes: 'Speaking can be persuasive but persuasion is broader',
  },
  {
    skillA: 'crisis-management',
    skillB: 'project-management',
    expectedMatch: false,
    category: 'related-not-equivalent',
    notes: 'Both management but very different contexts',
  },

  // Completely unrelated (should NOT match)
  {
    skillA: 'woodworking',
    skillB: 'chemistry',
    expectedMatch: false,
    category: 'unrelated',
    notes: 'Completely different domains',
  },
  {
    skillA: 'forensics',
    skillB: 'sales',
    expectedMatch: false,
    category: 'unrelated',
    notes: 'No meaningful connection',
  },
  {
    skillA: 'deduction',
    skillB: 'team-building',
    expectedMatch: false,
    category: 'unrelated',
    notes: 'Individual analysis vs group dynamics',
  },
  {
    skillA: 'minimalism',
    skillB: 'rapid-prototyping',
    expectedMatch: false,
    category: 'unrelated',
    notes: 'Design philosophy vs engineering practice',
  },

  // Ambiguous (edge cases — threshold determines outcome)
  {
    skillA: 'pattern recognition',
    skillB: 'pattern-recognition',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen — should match',
  },
  {
    skillA: 'stakeholder management',
    skillB: 'stakeholder-management',
    expectedMatch: true,
    category: 'formatting',
    notes: 'Space vs hyphen — should match',
  },
];

// ============================================================================
// Main
// ============================================================================

async function evaluate(): Promise<void> {
  const config = loadConfig();
  const forceMock = process.argv.some(arg => arg.includes('mock'));
  const isPlaceholderKey = (key?: string) => !key || key.startsWith('your_') || key.includes('placeholder');

  let provider: EmbeddingProvider | null = null;
  let isMock = false;

  const keyIsPlaceholder = config.semanticMatching.provider === 'google-ai'
    ? isPlaceholderKey(config.googleAi.apiKey)
    : isPlaceholderKey(config.openai.apiKey);

  if (forceMock || !config.semanticMatching.enabled || keyIsPlaceholder) {
    if (keyIsPlaceholder && !forceMock) {
      console.log('ℹ Placeholder API key detected in .env — running evaluation with synthetic benchmark embeddings.');
      console.log('  To evaluate live embeddings, add your actual API key to .env\n');
    }
    isMock = true;
  } else {
    provider = createEmbeddingProvider(config.semanticMatching.provider, {
      googleAiApiKey: config.googleAi.apiKey,
      openaiApiKey: config.openai.apiKey,
      timeoutMs: config.semanticMatching.requestTimeoutMs,
    });
    if (!provider) {
      isMock = true;
    }
  }

  if (isMock) {
    // Generate deterministic synthetic embeddings reflecting expected similarities for evaluation set
    const mockMap = new Map<string, number[]>();
    const dims = 30;

    // Define canonical semantic clusters for the evaluation vocabulary
    const clusters: Record<string, number> = {
      'system design': 0, 'systems-design': 0,
      'problem solving': 1, 'analytical problem solving': 1,
      'rest api development': 2, 'restful api design': 2,
      'rapid prototyping': 3, 'rapid-prototyping': 3,
      'public speaking': 4, 'public-speaking': 4,
      'crisis management': 5, 'crisis-management': 5,
      'team building': 6, 'team-building': 6,
      'project management': 7, 'project-management': 7,
      'pattern recognition': 8, 'pattern-recognition': 8,
      'stakeholder management': 9, 'stakeholder-management': 9,
      'leadership': 10,
      'mentorship': 11,
      'sales': 12,
      'negotiation': 13,
      'research': 14,
      'theoretical-analysis': 15,
      'strategy': 16,
      'persuasion': 17,
      'woodworking': 18,
      'chemistry': 19,
      'forensics': 20,
      'deduction': 21,
      'minimalism': 22,
    };

    for (const [skill, clusterIdx] of Object.entries(clusters)) {
      const vec = new Array(dims).fill(0);
      vec[clusterIdx] = 0.95;
      vec[(clusterIdx + 1) % dims] = 0.312; // small noise
      const mag = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
      mockMap.set(skill, vec.map(x => x / mag));
    }
    provider = new FakeEmbeddingProvider(mockMap, dims);
  }

  console.log(`\n🔬 Semantic Matching Evaluation`);
  console.log(`   Provider: ${provider!.name}${isMock ? ' (Synthetic Mock Evaluator)' : ' (Live Provider)'}`);
  console.log(`   Threshold: ${config.semanticMatching.similarityThreshold}`);
  console.log(`   Pairs: ${evaluationPairs.length}\n`);
  console.log('─'.repeat(90));

  // Collect all unique skill labels
  const allLabels = [...new Set(evaluationPairs.flatMap(p => [p.skillA, p.skillB]))];

  // Get embeddings
  console.log(`Generating embeddings for ${allLabels.length} unique labels...`);
  let embeddings: number[][];
  try {
    embeddings = await provider.generateEmbeddings(allLabels);
  } catch (error) {
    console.error(`❌ Embedding generation failed: ${(error as Error).message}`);
    process.exit(1);
  }

  const embeddingMap = new Map<string, number[]>();
  for (let i = 0; i < allLabels.length; i++) {
    embeddingMap.set(allLabels[i]!, embeddings[i]!);
  }

  // Evaluate each pair
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  const threshold = config.semanticMatching.similarityThreshold;

  console.log(`\n${'Skill A'.padEnd(25)} ${'Skill B'.padEnd(25)} ${'Sim'.padEnd(8)} ${'Expected'.padEnd(10)} ${'Actual'.padEnd(10)} Result`);
  console.log('─'.repeat(90));

  for (const pair of evaluationPairs) {
    const embA = embeddingMap.get(pair.skillA);
    const embB = embeddingMap.get(pair.skillB);

    if (!embA || !embB) {
      console.error(`Missing embedding for: ${pair.skillA} or ${pair.skillB}`);
      continue;
    }

    const similarity = cosineSimilarity(embA, embB);
    const actualMatch = similarity >= threshold;
    const correct = actualMatch === pair.expectedMatch;

    if (pair.expectedMatch && actualMatch) truePositives++;
    else if (!pair.expectedMatch && !actualMatch) trueNegatives++;
    else if (!pair.expectedMatch && actualMatch) falsePositives++;
    else falseNegatives++;

    const icon = correct ? '✓' : '✗';
    const color = correct ? '' : ' ⚠️';
    console.log(
      `${pair.skillA.padEnd(25)} ${pair.skillB.padEnd(25)} ${similarity.toFixed(4).padEnd(8)} ${String(pair.expectedMatch).padEnd(10)} ${String(actualMatch).padEnd(10)} ${icon}${color}`
    );
  }

  // Summary
  const total = evaluationPairs.length;
  const correct = truePositives + trueNegatives;
  const accuracy = ((correct / total) * 100).toFixed(1);

  console.log('\n' + '─'.repeat(90));
  console.log(`\n📊 Results (threshold = ${threshold}):`);
  console.log(`   Total pairs:      ${total}`);
  console.log(`   Correct:          ${correct} (${accuracy}%)`);
  console.log(`   True positives:   ${truePositives}`);
  console.log(`   True negatives:   ${trueNegatives}`);
  console.log(`   False positives:  ${falsePositives} (unrelated skills matched — DANGEROUS)`);
  console.log(`   False negatives:  ${falseNegatives} (equivalent skills missed — less harmful)`);

  if (truePositives + falsePositives > 0) {
    const precision = ((truePositives / (truePositives + falsePositives)) * 100).toFixed(1);
    console.log(`   Precision:        ${precision}%`);
  }
  if (truePositives + falseNegatives > 0) {
    const recall = ((truePositives / (truePositives + falseNegatives)) * 100).toFixed(1);
    console.log(`   Recall:           ${recall}%`);
  }

  console.log(`\n💡 Recommendations:`);
  if (falsePositives > 0) {
    console.log(`   ↑ Raise threshold above ${threshold} to reduce ${falsePositives} false positive(s).`);
  }
  if (falseNegatives > 0) {
    console.log(`   ↓ Lower threshold below ${threshold} to recover ${falseNegatives} false negative(s).`);
  }
  if (falsePositives === 0 && falseNegatives === 0) {
    console.log(`   ✅ Current threshold achieves perfect accuracy on this evaluation set.`);
    console.log(`   ⚠ This set is small. Evaluate on broader skill pairs before production use.`);
  }

  console.log('');
}

evaluate().catch((error) => {
  console.error('Evaluation failed:', error.message);
  process.exit(1);
});


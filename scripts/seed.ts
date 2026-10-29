/**
 * Database seed script.
 *
 * Creates the schema tables and loads all 15 candidates and 6 jobs.
 *
 * Repeatable: uses INSERT IGNORE so re-running does not create duplicates.
 * Does not delete user-created records — only inserts seed data.
 *
 * Usage: npm run seed
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { loadConfig } from '../src/config/env.js';

interface ColumnCountRow extends RowDataPacket {
  count: number;
}

async function ensureColumn(
  connection: mysql.Connection,
  database: string,
  table: string,
  column: string
): Promise<void> {
  const [rows] = await connection.execute<ColumnCountRow[]>(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [database, table, column]
  );

  if (rows[0]!.count === 0) {
    await connection.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` JSON NULL`);
    console.log(`✓ Added ${table}.${column} column`);
  }
}

async function seed(): Promise<void> {
  const config = loadConfig();

  // Connect to MySQL (without selecting a database first to create it)
  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });

  try {
    // Create database if not exists
    await connection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` 
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✓ Database "${config.db.database}" ensured`);

    // Select the database
    await connection.changeUser({ database: config.db.database });

    // Read and execute schema SQL
    const schemaPath = resolve(process.cwd(), 'sql', 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    await connection.query(schemaSql);
    await ensureColumn(connection, config.db.database, 'candidates', 'traits');
    await ensureColumn(connection, config.db.database, 'jobs', 'culture_keywords');
    console.log('✓ Schema tables created');

    // Read and execute seed SQL
    const seedPath = resolve(process.cwd(), 'sql', 'seed.sql');
    const seedSql = readFileSync(seedPath, 'utf-8');
    await connection.query(seedSql);
    console.log('✓ Seed data loaded');

    // Verify counts
    const [candidateRows] = await connection.execute('SELECT COUNT(*) as count FROM candidates');
    const [jobRows] = await connection.execute('SELECT COUNT(*) as count FROM jobs');
    const [skillRows] = await connection.execute('SELECT COUNT(*) as count FROM skills');
    const [csRows] = await connection.execute('SELECT COUNT(*) as count FROM candidate_skills');
    const [jrsRows] = await connection.execute('SELECT COUNT(*) as count FROM job_required_skills');
    const [candidatePreferenceRows] = await connection.execute('SELECT COUNT(*) as count FROM candidate_preferences');
    const [jobPreferenceRows] = await connection.execute('SELECT COUNT(*) as count FROM job_preferences');

    console.log('\n📊 Database contents:');
    console.log(`   Candidates:        ${(candidateRows as any)[0].count}`);
    console.log(`   Jobs:              ${(jobRows as any)[0].count}`);
    console.log(`   Skills:            ${(skillRows as any)[0].count}`);
    console.log(`   Candidate-Skills:  ${(csRows as any)[0].count}`);
    console.log(`   Job-Required-Skills: ${(jrsRows as any)[0].count}`);
    console.log(`   Candidate-Preferences: ${(candidatePreferenceRows as any)[0].count}`);
    console.log(`   Job-Preferences:       ${(jobPreferenceRows as any)[0].count}`);

    console.log('\n✅ Seeding complete!');
  } finally {
    await connection.end();
  }
}

seed().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});

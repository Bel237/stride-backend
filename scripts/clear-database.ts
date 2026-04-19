import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('🗑️  Vidage de la base de données...\n');

  // Ordre important : tables enfants d'abord (respect des FK)
  const tables = [
    // Transactions & lignes
    'savings_transactions',
    'investment_transactions',
    'budget_lines',

    // Finance
    'contributions',
    'contribution_sessions',
    'distributions',
    'distribution_cycles',
    'loan_repayments',
    'loans',
    'savings_accounts',
    'investments',
    'budget_periods',

    // Événements
    'event_attendances',
    'meeting_minutes',
    'events',

    // Votes
    'votes',
    'voting_options',
    'voting_sessions',

    // Communication
    'messages',
    'conversation_participants',
    'conversations',
    'announcement_comments',
    'announcements',
    'forum_replies',
    'forum_posts',
    'forum_categories',

    // Sanctions & Documents
    'sanctions',
    'documents',
    'reports',
    'audit_logs',
    'notifications',

    // Utilisateurs & Associations (derniers)
    'users',
    'associations',
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
      console.log(`✅ ${table}`);
    } catch (error) {
      console.log(`⚠️  ${table} - ${(error as Error).message}`);
    }
  }

  console.log('\n🎉 Base de données vidée avec succès !');
}

clearDatabase()
  .catch((e) => {
    console.error('❌ Erreur:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

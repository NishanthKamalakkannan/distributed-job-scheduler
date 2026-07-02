import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const memberships = await p.orgMembership.findMany({ include: { user: true } });
  console.log('=== OrgMemberships ===');
  memberships.forEach((m: any) => {
    console.log(`  membership.userId = ${m.userId}  | user.email = ${m.user.email}`);
  });

  console.log('');
  const queues = await p.queue.findMany({
    include: {
      project: {
        include: {
          organization: {
            include: {
              memberships: true
            }
          }
        }
      }
    }
  });
  console.log('=== Queues via project->org->memberships ===');
  queues.forEach((q: any) => {
    const memberUserIds = q.project.organization.memberships.map((m: any) => m.userId);
    console.log(`  Queue "${q.name}" -> org has memberUserIds: ${JSON.stringify(memberUserIds)}`);
  });

  await p.$disconnect();
}

main().catch((e: any) => { console.error(e); process.exit(1); });

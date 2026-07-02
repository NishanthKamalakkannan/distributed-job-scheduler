import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { prisma } from 'prisma-db';

describe('API Integration Tests', () => {
  let token: string;
  let orgId: string;
  let projectId: string;
  let queueId: string;
  let dependentJobId: string;

  beforeAll(async () => {
    // Clean DB
    await prisma.job.deleteMany();
    await prisma.queue.deleteMany();
    await prisma.project.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should register a new user', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    });
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('should login and return a JWT', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'test@example.com',
      password: 'password123'
    });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    token = res.body.token;
  });

  it('should fail to access protected route without token', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(401);
  });

  it('should create an organization (direct DB) and then a project via API', async () => {
    const user = await prisma.user.findUnique({ where: { email: 'test@example.com' } });
    
    const org = await prisma.organization.create({
      data: {
        name: 'Test Org',
        memberships: {
          create: { userId: user!.id, role: 'OWNER' }
        }
      }
    });
    orgId = org.id;

    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Project',
        organizationId: org.id
      });
      
    expect(res.status).toBe(201);
    projectId = res.body.data.id;
  });

  it('should create a queue', async () => {
    const res = await request(app)
      .post('/queues')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId,
        name: 'Test Queue',
        concurrencyLimit: 2
      });
      
    expect(res.status).toBe(201);
    queueId = res.body.data.id;
  });

  it('should create an IMMEDIATE job', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId,
        type: 'IMMEDIATE',
        payload: { test: true }
      });
      
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('QUEUED');
    dependentJobId = res.body.data.id;
  });

  it('should respect idempotency key on job creation', async () => {
    const payload = {
      queueId,
      type: 'IMMEDIATE',
      payload: { action: 'idempotent' },
      idempotencyKey: 'idemp-123'
    };

    const res1 = await request(app).post('/jobs').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res1.status).toBe(201);
    
    const res2 = await request(app).post('/jobs').set('Authorization', `Bearer ${token}`).send(payload);
    expect(res2.status).toBe(200); // the API returns 200 for existing idempotent jobs
    expect(res2.body.data.id).toBe(res1.body.data.id);
  });

  it('should validate dependency job exists', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId,
        type: 'IMMEDIATE',
        payload: { action: 'dependent' },
        dependsOnJobId: '00000000-0000-0000-0000-000000000000'
      });
      
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Dependent job does not exist');
  });

  it('should allow job creation with valid dependency', async () => {
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId,
        type: 'IMMEDIATE',
        payload: { action: 'dependent' },
        dependsOnJobId: dependentJobId
      });
      
    expect(res.status).toBe(201);
    expect(res.body.data.dependsOnJobId).toBe(dependentJobId);
  });
});

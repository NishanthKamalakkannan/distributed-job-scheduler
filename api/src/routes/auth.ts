import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from 'prisma-db';
import { validate } from '../middlewares/validate';
import { registerSchema, loginSchema } from '../schemas/auth';
import { config } from '../config';

const router = Router();

router.post('/register', validate(registerSchema), async (req, res) => {
  const { email, password, name } = req.body;

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Email already in use' },
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
    },
  });

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name },
    token,
  });
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
    });
  }

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    token,
  });
});

export { router as authRouter };

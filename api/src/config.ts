import dotenv from 'dotenv';

dotenv.config({ path: '../.env' }); // Load from root

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_override_in_prod',
  jwtExpiresIn: 86400, // 1 day in seconds
};

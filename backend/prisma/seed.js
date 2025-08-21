// backend/prisma/seed.js
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const usuarios = [
    { email: 'maria@cliente.com', name: 'María López', role: 'cliente', password: '123456' },
    { email: 'juan@cliente.com',  name: 'Juan Pérez',  role: 'cliente', password: '123456' },
    { email: 'abogada@estudio.com', name: 'Dra. Urribarri', role: 'abogado', password: 'secreto' }
  ];

  for (const u of usuarios) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.appUser.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        role: u.role,            // enum Role
        passwordHash             // mapea a "password_hash"
      }
    });
  }
}

main().finally(() => prisma.$disconnect());

  const { PrismaClient } = require("@prisma/client");
  const bcrypt = require("bcryptjs");

  const prisma = new PrismaClient();

  async function main() {
    const email = "admin@analytics.local";
    const password = "admin123";

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "ADMIN",
        name: "Admin",
      },
    });
  }

  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });


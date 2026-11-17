  const { PrismaClient } = require("@prisma/client");
  const bcrypt = require("bcryptjs");

  const prisma = new PrismaClient();

  async function main() {
    const email = process.env.ADMIN_SEED_EMAIL?.trim();
    const password = process.env.ADMIN_SEED_PASSWORD;

    if (process.env.NODE_ENV === "production") {
      throw new Error("Admin seed is disabled in production.");
    }
    if (!email || !password || password.length < 16) {
      throw new Error(
        "Set ADMIN_SEED_EMAIL and a unique ADMIN_SEED_PASSWORD of at least 16 characters."
      );
    }

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


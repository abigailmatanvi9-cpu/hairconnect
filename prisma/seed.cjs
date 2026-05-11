/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv/config");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const password = "dev123456";
  const passwordHash = await bcrypt.hash(password, 10);

  const pro = await prisma.user.upsert({
    where: { email: "pro.dev@hairconnect.local" },
    update: {},
    create: {
      email: "pro.dev@hairconnect.local",
      passwordHash,
      name: "Salon Dev",
      role: "coiffeur",
      city: "Paris",
      salonName: "Salon Dev"
    }
  });

  const client = await prisma.user.upsert({
    where: { email: "client.dev@hairconnect.local" },
    update: {
      balanceFloozFcfa: 25_000,
      balanceMixFcfa: 15_000
    },
    create: {
      email: "client.dev@hairconnect.local",
      passwordHash,
      name: "Client Dev",
      role: "client",
      city: "Paris",
      balanceFloozFcfa: 25_000,
      balanceMixFcfa: 15_000
    }
  });

  console.log("Seed OK — comptes de test (mot de passe identique) :");
  console.log(`  Pro     ${pro.email}`);
  console.log(`  Client  ${client.email}`);
  console.log(`  Mot de passe : ${password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

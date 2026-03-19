import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

async function main() {
  const defaultAdminEmail = process.env.DEFAULT_ADMIN_EMAIL || "lucia@coop.local";
  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "AdminCoop2026!";
  const defaultTechPassword = "Tecnico2026!";

  const users = await prisma.usuario.findMany({
    where: {
      OR: [{ passwordHash: null }, { passwordHash: "" }],
    },
  });

  for (const user of users) {
    const password =
      user.email === defaultAdminEmail || user.rol === "ADMIN"
        ? defaultAdminPassword
        : defaultTechPassword;

    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        updatedUsers: users.length,
        adminEmail: defaultAdminEmail,
        adminPassword: defaultAdminPassword,
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

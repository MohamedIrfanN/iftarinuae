
import { db, pool } from "../server/db";
import { places, users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === "migrate-places") {
        console.log("Approving all existing places...");
        const result = await db.update(places).set({
            approved: true,
            approvedAt: new Date(),
            approvedBy: "system_migration"
        }).returning();
        console.log(`Updated ${result.length} places to approved.`);
    } else if (command === "make-admin") {
        const email = args[1];
        if (!email) {
            console.error("Please provide an email address.");
            process.exit(1);
        }
        console.log(`Making ${email} an admin...`);
        const [user] = await db.select().from(users).where(eq(users.email, email));

        if (!user) {
            console.error("User not found!");
            process.exit(1);
        }

        await db.update(users).set({ isAdmin: true }).where(eq(users.id, user.id));
        console.log(`User ${user.email} (ID: ${user.id}) is now an Admin.`);
    } else if (command === "list-users") {
        console.log("Listing users...");
        const allUsers = await db.select().from(users);
        allUsers.forEach(u => {
            console.log(`${u.email} [${u.isAdmin ? "ADMIN" : "USER"}] (ID: ${u.id})`);
        });
    } else {
        console.log(`
Usage:
  npx tsx scripts/setup-admin.ts migrate-places
  npx tsx scripts/setup-admin.ts list-users
  npx tsx scripts/setup-admin.ts make-admin <email>
    `);
    }

    await pool.end();
}

main().catch(console.error);

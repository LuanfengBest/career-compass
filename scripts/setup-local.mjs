import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env.local")) {
  console.log(".env.local already exists; left unchanged.");
} else {
  const content = readFileSync(".env.example", "utf8").replace(
    /^TOKEN_ENCRYPTION_KEY=$/m,
    `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
  );
  writeFileSync(".env.local", content, { flag: "wx", mode: 0o600 });
  chmodSync(".env.local", 0o600);
  console.log(
    "Created .env.local with a private encryption key. Fill Google credentials and GMAIL_ACCOUNT_EMAIL, then restart npm run dev.",
  );
}

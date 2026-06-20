import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();

        if (!credentials?.email || !credentials?.password) {
          console.log("AUTH FAIL: missing email or password");
          return null;
        }

        if (!adminEmail || !passwordHash) {
          console.log("AUTH FAIL: missing ADMIN_EMAIL or ADMIN_PASSWORD_HASH");
          return null;
        }

        const inputEmail = credentials.email.trim().toLowerCase();
        const inputPassword = credentials.password.trim();

        console.log("AUTH CHECK:", {
          inputEmail,
          envEmail: adminEmail,
          hashExists: Boolean(passwordHash),
          hashLength: passwordHash.length,
          hashPrefix: passwordHash.slice(0, 4),
        });

        if (inputEmail !== adminEmail) {
          console.log("AUTH FAIL: email mismatch");
          return null;
        }

        const isValid = await bcrypt.compare(inputPassword, passwordHash);

        console.log("AUTH PASSWORD MATCH:", isValid);

        if (!isValid) {
          console.log("AUTH FAIL: password mismatch");
          return null;
        }

        console.log("AUTH SUCCESS:", inputEmail);

        return {
          id: "prof-son",
          email: adminEmail,
          name: "Prof. Son",
        };
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
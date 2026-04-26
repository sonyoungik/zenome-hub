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
        const adminEmail = process.env.ADMIN_EMAIL;
        const passwordHash = process.env.ADMIN_PASSWORD_HASH;

        console.log("입력 email:", credentials?.email);
        console.log("입력 password:", credentials?.password);
        console.log("env email:", adminEmail);
        console.log("env hash exists:", Boolean(passwordHash));

        if (!credentials?.email || !credentials?.password) {
          console.log("실패: email 또는 password 없음");
          return null;
        }

        if (!adminEmail || !passwordHash) {
          console.log("실패: .env.local 환경변수 누락");
          return null;
        }

        const inputEmail = credentials.email.trim().toLowerCase();
        const envEmail = adminEmail.trim().toLowerCase();

        console.log("정규화 입력 email:", inputEmail);
        console.log("정규화 env email:", envEmail);

        if (inputEmail !== envEmail) {
          console.log("실패: email 불일치");
          return null;
        }

        console.log("bcrypt 비교 시작");

        const isValid = await bcrypt.compare(
          credentials.password,
          passwordHash.trim()
        );

        console.log("비밀번호 일치 여부:", isValid);

        if (!isValid) {
          console.log("실패: 비밀번호 불일치");
          return null;
        }

        console.log("로그인 성공");

        return {
          id: "prof-son",
          email: envEmail,
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
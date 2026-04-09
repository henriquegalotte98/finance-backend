import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";

console.log("DB URL:", process.env.DATABASE_URL);
const { Pool } = pkg;
console.log("DB URL:", process.env.DATABASE_URL);


export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
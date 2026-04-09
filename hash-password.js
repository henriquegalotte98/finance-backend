import bcrypt from 'bcrypt';

const password = '1234';
const hash = await bcrypt.hash(password, 10);
console.log('Hash:', hash);
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './db';
const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me');
export async function createToken(userId:string){return new SignJWT({userId}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('30d').sign(secret)}
export async function getUser(){const token=(await cookies()).get('mf_token')?.value;if(!token)return null;try{const {payload}=await jwtVerify(token,secret);const id=payload.userId as string;return prisma.user.findUnique({where:{id},select:{id:true,name:true,email:true,createdAt:true}})}catch{return null}}
export async function requireUser(){const user=await getUser();if(!user) throw new Error('Unauthorized');return user}

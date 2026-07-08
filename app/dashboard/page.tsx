import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import App from '@/components/App';
export default async function Dashboard(){const user=await getUser();if(!user) redirect('/login');const [accounts,plans,splits,budgets,goals,debts,recurring,assets]=await Promise.all([
prisma.account.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'}}),prisma.plan.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'}}),prisma.split.findMany({where:{userId:user.id},orderBy:{createdAt:'desc'},take:50}),prisma.budget.findMany({where:{userId:user.id}}),prisma.goal.findMany({where:{userId:user.id}}),prisma.debt.findMany({where:{userId:user.id}}),prisma.recurring.findMany({where:{userId:user.id}}),prisma.asset.findMany({where:{userId:user.id}})]);
return <App initial={{user,accounts,plans,splits,budgets,goals,debts,recurring,assets}}/>}

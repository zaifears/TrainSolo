import z from 'zod';



export const loginSchema = z.object({
    token: z.string().min(1, 'Enter your token'),
    ssdk: z.string().min(1, 'Enter your ssdk'),
    uudid: z.string().min(1, 'Enter your uudid'),
});
